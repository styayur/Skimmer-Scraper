"""Acquire the launched window once and check real foreground ownership at 10 Hz."""

import argparse
import ctypes
from ctypes import wintypes
import json
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
    while time.monotonic() < deadline:
        handle = target(pid, marker)
        if handle and foreground() == handle:
            break
        if handle:
            seen = True
            activate(handle)
            if foreground() != handle:
                current = kernel.GetCurrentThreadId()
                active = owner_thread(foreground(), None)
                if active and attach(current, active, True):
                    try:
                        activate(handle)
                    finally:
                        attach(current, active, False)
        time.sleep(0.2)
    else:
        raise RuntimeError("Could not activate the launched window" if seen else "The launched process had no unique visible game window")

    kernel.SetThreadExecutionState(0x80000003)  # Keep the interactive display awake for this process.
    try:
        start = time.monotonic()
        previous_time = start
        previous_ticks = ticks() if record_cpu else None
        while foreground() == handle:
            print("owned", flush=True)
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
