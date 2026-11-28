"""Check the foreground PID, optionally focusing just the launched title window."""

import argparse
import ctypes
from ctypes import wintypes
import json
import time


def sample(pid, activate):
    user = ctypes.WinDLL("user32", use_last_error=True)
    def api(name, result, *args):
        fn = getattr(user, name)
        fn.restype, fn.argtypes = result, args
        return fn
    handle = wintypes.HWND
    foreground = api("GetForegroundWindow", handle)
    window_pid = api("GetWindowThreadProcessId", wintypes.DWORD, handle, ctypes.POINTER(wintypes.DWORD))
    is_visible = api("IsWindowVisible", wintypes.BOOL, handle)
    get_title = api("GetWindowTextW", ctypes.c_int, handle, wintypes.LPWSTR, ctypes.c_int)
    set_foreground = api("SetForegroundWindow", wintypes.BOOL, handle)
    callback = ctypes.WINFUNCTYPE(wintypes.BOOL, handle, wintypes.LPARAM)
    enumerate_windows = api("EnumWindows", wintypes.BOOL, callback, wintypes.LPARAM)

    def owned(h):
        actual = wintypes.DWORD()
        if h:
            window_pid(h, ctypes.byref(actual))
        return actual.value == pid

    before = owned(foreground())
    tried = False
    if activate and not before:
        candidates = []
        @callback
        def visit(h, _):
            if owned(h) and is_visible(h):
                title = ctypes.create_unicode_buffer(128)
                get_title(h, title, len(title))
                if "Skimmer-Scraper" in title.value:
                    candidates.append(h)
            return True
        enumerate_windows(visit, 0)
        if len(candidates) == 1:
            tried = True
            set_foreground(candidates[0])
            until = time.monotonic() + 0.6
            while time.monotonic() < until and not owned(foreground()):
                time.sleep(0.02)
    return {"ownedBefore": before, "activationRequested": tried, "owned": owned(foreground())}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pid", type=int)
    parser.add_argument("--activate", action="store_true")
    args = parser.parse_args()
    print(json.dumps(sample(args.pid, args.activate)))
