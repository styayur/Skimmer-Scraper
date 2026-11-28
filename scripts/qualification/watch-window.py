"""Acquire the launched window once and check real foreground ownership at 10 Hz."""

import argparse
import ctypes
from ctypes import wintypes
import json
import subprocess
import sys
import time
from host_cpu import ticks, utilization

user = ctypes.WinDLL("user32", use_last_error=True)
kernel = ctypes.WinDLL("kernel32", use_last_error=True)
callback_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)


def function(name, result, *args):
    fn = getattr(user, name)
    fn.restype, fn.argtypes = result, args
    return fn


foreground = function("GetForegroundWindow", wintypes.HWND)
owner_thread = function("GetWindowThreadProcessId", wintypes.DWORD, wintypes.HWND, ctypes.POINTER(wintypes.DWORD))
title = function("GetWindowTextW", ctypes.c_int, wintypes.HWND, wintypes.LPWSTR, ctypes.c_int)
visible = function("IsWindowVisible", wintypes.BOOL, wintypes.HWND)
enumerate_windows = function("EnumWindows", wintypes.BOOL, callback_type, wintypes.LPARAM)
activate = function("SetForegroundWindow", wintypes.BOOL, wintypes.HWND)
attach = function("AttachThreadInput", wintypes.BOOL, wintypes.DWORD, wintypes.DWORD, wintypes.BOOL)
window_class = function("GetClassNameW", ctypes.c_int, wintypes.HWND, wintypes.LPWSTR, ctypes.c_int)
iconic = function('IsIconic', wintypes.BOOL, wintypes.HWND)
zoomed = function('IsZoomed', wintypes.BOOL, wintypes.HWND)
show = function('ShowWindowAsync', wintypes.BOOL, wintypes.HWND, ctypes.c_int)
bring_to_top = function('BringWindowToTop', wintypes.BOOL, wintypes.HWND)
set_active = function('SetActiveWindow', wintypes.HWND, wintypes.HWND)
set_focus = function('SetFocus', wintypes.HWND, wintypes.HWND)
peek = function('PeekMessageW', wintypes.BOOL, ctypes.POINTER(wintypes.MSG), wintypes.HWND, wintypes.UINT, wintypes.UINT, wintypes.UINT)
window_rect = function('GetWindowRect', wintypes.BOOL, wintypes.HWND, ctypes.POINTER(wintypes.RECT))
window_style = function('GetWindowLongW', wintypes.LONG, wintypes.HWND, ctypes.c_int)
position_window = function('SetWindowPos', wintypes.BOOL, wintypes.HWND, wintypes.HWND, ctypes.c_int, ctypes.c_int,
                           ctypes.c_int, ctypes.c_int, wintypes.UINT)
root_window = function('GetAncestor', wintypes.HWND, wintypes.HWND, wintypes.UINT)
window_at = function('WindowFromPoint', wintypes.HWND, wintypes.POINT)
send_timeout = function('SendMessageTimeoutW', wintypes.LPARAM, wintypes.HWND, wintypes.UINT, wintypes.WPARAM,
                        wintypes.LPARAM, wintypes.UINT, wintypes.UINT, ctypes.POINTER(ctypes.c_size_t))
cursor_position = function('GetCursorPos', wintypes.BOOL, ctypes.POINTER(wintypes.POINT))
move_cursor = function('SetCursorPos', wintypes.BOOL, ctypes.c_int, ctypes.c_int)
key_state = function('GetAsyncKeyState', ctypes.c_short, ctypes.c_int)
thread_dpi = function('SetThreadDpiAwarenessContext', wintypes.HANDLE, wintypes.HANDLE)


class MouseInput(ctypes.Structure):
    _fields_ = [('dx', wintypes.LONG), ('dy', wintypes.LONG), ('mouseData', wintypes.DWORD),
                ('flags', wintypes.DWORD), ('time', wintypes.DWORD), ('extraInfo', ctypes.c_size_t)]


class MouseEvent(ctypes.Structure):
    # MOUSEINPUT is the largest member of the Win32 INPUT union on x86 and x64.
    _fields_ = [('type', wintypes.DWORD), ('mouse', MouseInput)]


send_input = function('SendInput', wintypes.UINT, wintypes.UINT, ctypes.POINTER(MouseEvent), ctypes.c_int)


def owns_caption(handle, pid, point):
    actual = window_at(point)
    owner = wintypes.DWORD()
    if not actual or root_window(actual, 2) != handle:  # GA_ROOT
        return False
    owner_thread(actual, ctypes.byref(owner))
    if owner.value != pid:
        return False
    coordinates = (point.x & 0xffff) | ((point.y & 0xffff) << 16)
    hit = ctypes.c_size_t()
    return bool(send_timeout(handle, 0x84, 0, coordinates, 2, 100, ctypes.byref(hit)) and hit.value == 2)
    # WM_NCHITTEST, SMTO_ABORTIFHUNG, HTCAPTION


def click_qa_caption(handle, pid):
    flags = 0x0013 | 0x0200  # NOSIZE | NOMOVE | NOACTIVATE | NOOWNERZORDER
    was_topmost = bool(window_style(handle, -20) & 8)
    old_dpi = thread_dpi(-4)  # Only the observer thread uses physical pixel coordinates.
    original = wintypes.POINT()
    moved = raised = False
    try:
        if not old_dpi or not cursor_position(ctypes.byref(original)) or key_state(1) < 0:
            return 'cursor unavailable or mouse button held'
        if not was_topmost:
            if not position_window(handle, -1, 0, 0, 0, 0, flags):
                return 'QA window could not be raised'
            raised = True
        rect = wintypes.RECT()
        if not window_rect(handle, ctypes.byref(rect)):
            return 'QA window has no screen bounds'
        for height in (18, 25, 32, 12, 42):
            for percent in (60, 72, 48, 82, 36, 25):
                point = wintypes.POINT(rect.left + (rect.right - rect.left) * percent // 100, rect.top + height)
                if not owns_caption(handle, pid, point):
                    continue
                if not move_cursor(point.x, point.y):
                    return 'cursor could not reach QA caption'
                moved = True
                actual = wintypes.POINT()
                if (not cursor_position(ctypes.byref(actual)) or (actual.x, actual.y) != (point.x, point.y)
                        or key_state(1) < 0 or not owns_caption(handle, pid, actual)):
                    return 'QA caption identity changed before input'
                events = (MouseEvent * 2)()
                events[0].mouse.flags = 0x0002  # LEFTDOWN
                events[1].mouse.flags = 0x0004  # LEFTUP, in the same SendInput call.
                if send_input(2, events, ctypes.sizeof(MouseEvent)) != 2:
                    return 'Windows did not accept the complete QA click'
                # Give the window a chance to process both events before moving the pointer.
                for _ in range(10):
                    time.sleep(0.025)
                    if foreground() == handle:
                        break
                return 'clicked verified QA caption'
        return 'no verified QA caption point'
    finally:
        cursor_ok = not moved or move_cursor(original.x, original.y)
        order_ok = not raised or position_window(handle, -2, 0, 0, 0, 0, flags)
        if old_dpi:
            thread_dpi(old_dpi)
        if not cursor_ok or not order_ok or bool(window_style(handle, -20) & 8) != was_topmost:
            raise RuntimeError('Could not restore QA window placement or cursor after preflight')


def target(pid, marker):
    matches = []
    browser_windows = []

    @callback_type
    def visit(handle, _):
        owner = wintypes.DWORD()
        owner_thread(handle, ctypes.byref(owner))
        if owner.value == pid and visible(handle):
            label = ctypes.create_unicode_buffer(512)
            title(handle, label, len(label))
            if marker in label.value:
                matches.append(handle)
            name = ctypes.create_unicode_buffer(128)
            window_class(handle, name, len(name))
            if label.value and name.value == 'Chrome_WidgetWin_1':
                browser_windows.append(handle)
        return True

    enumerate_windows(visit, 0)
    if len(matches) > 1:
        raise RuntimeError("Multiple QA windows match the launched client")
    # A game can update its tab title during acquisition. The browser PID is the
    # freshly launched private Edge process, and the page separately verifies DOM focus.
    if not matches and marker.startswith('SkimmerQA-') and len(browser_windows) == 1:
        return browser_windows[0]
    return next(iter(matches), None)


def observe(pid, marker, record_cpu):
    deadline = time.monotonic() + 35
    seen = False
    attached = False
    restored = False
    accessible_focus = False
    caption_action = 'unneeded'
    attempts = 0
    # AttachThreadInput requires a message queue in the observer thread.
    peek(ctypes.byref(wintypes.MSG()), None, 0, 0, 0)
    while time.monotonic() < deadline:
        handle = target(pid, marker)
        if handle and foreground() == handle:
            break
        if handle:
            seen = True
            attempts += 1
            if attempts == 1 or iconic(handle):
                was_zoomed = zoomed(handle)
                show(handle, 9)  # SW_RESTORE on the QA window only.
                if was_zoomed:
                    show(handle, 3)  # Preserve its maximized placement.
                restored = True
            current = kernel.GetCurrentThreadId()
            target_thread = owner_thread(handle, None)
            joined = bool(target_thread and attach(current, target_thread, True))
            attached |= joined
            try:
                bring_to_top(handle)
                activate(handle)
                if joined:
                    set_active(handle)
                    set_focus(handle)
            finally:
                if joined:
                    attach(current, target_thread, False)
            if attempts == 3 and foreground() != handle:
                caption_action = click_qa_caption(handle, pid)
            if attempts == 5 and foreground() != handle:
                # UI Automation asks the element for this exact QA HWND to take
                # focus. GetForegroundWindow still decides admission independently.
                command = ('Add-Type -AssemblyName UIAutomationClient; '
                           f'$el = [System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]{handle}); '
                           '$el.SetFocus()')
                try:
                    result = subprocess.run(['powershell.exe','-NoProfile','-NonInteractive','-Command',command],
                                            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                            creationflags=subprocess.CREATE_NO_WINDOW, timeout=5, check=False)
                    accessible_focus = result.returncode == 0
                except subprocess.TimeoutExpired:
                    pass
        time.sleep(0.2)
    else:
        if seen:
            raise RuntimeError(f'QA HWND did not obtain foreground ownership (restored={restored}, targetInputAttached={attached}, caption={caption_action}, accessibilityFocus={accessible_focus}, attempts={attempts})')
        raise RuntimeError('The launched process had no unique visible game window')

    kernel.SetThreadExecutionState(0x80000003)  # Keep the interactive display awake for this process.
    try:
        start = time.monotonic()
        previous_time = start
        previous_ticks = ticks() if record_cpu else None
        first = True
        while foreground() == handle:
            print("owned", flush=True)
            if first:
                print('window ' + json.dumps({'attempts': attempts, 'restored': restored, 'targetInputAttached': attached,
                                              'accessibilityFocus': accessible_focus, 'captionAction': caption_action}), flush=True)
                first = False
            now = time.monotonic()
            if record_cpu and now - previous_time >= 1:
                current = ticks()
                print('cpu ' + json.dumps({'elapsedSeconds': now - start, 'busyPercent': utilization(previous_ticks, current)}), flush=True)
                previous_time, previous_ticks = now, current
            time.sleep(0.1)
        replacement = wintypes.DWORD()
        current = foreground()
        owner_thread(current, ctypes.byref(replacement))
        if not current:
            reason = "no active window"
        elif replacement.value == pid:
            reason = "another window in the same client"
        else:
            name = ctypes.create_unicode_buffer(128)
            window_class(current, name, len(name))
            classes = {"ConsoleWindowClass": "a console", "CASCADIA_HOSTING_WINDOW_CLASS": "a terminal",
                       "Chrome_WidgetWin_1": "another Chromium application", "Progman": "the desktop"}
            reason = classes.get(name.value, "another application")
        sys.exit(f"The measurement window lost foreground ownership to {reason}")
    finally:
        kernel.SetThreadExecutionState(0x80000000)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pid", type=int)
    parser.add_argument("title_marker")
    parser.add_argument('--cpu', action='store_true')
    args = parser.parse_args()
    try:
        observe(args.pid, args.title_marker, args.cpu)
    except RuntimeError as error:
        sys.exit(str(error))
