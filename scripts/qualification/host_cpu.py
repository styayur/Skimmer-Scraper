"""Read machine-wide Windows CPU utilization through cumulative GetSystemTimes ticks."""

import argparse
import ctypes
from ctypes import wintypes
import json
import os
import time

get_times = ctypes.WinDLL('kernel32', use_last_error=True).GetSystemTimes
get_times.argtypes = [ctypes.POINTER(wintypes.FILETIME)] * 3
get_times.restype = wintypes.BOOL


def ticks():
    idle, kernel, user = (wintypes.FILETIME() for _ in range(3))
    if not get_times(ctypes.byref(idle), ctypes.byref(kernel), ctypes.byref(user)):
        raise ctypes.WinError(ctypes.get_last_error())
    def value(t):
        return t.dwHighDateTime << 32 | t.dwLowDateTime
    return value(idle), value(kernel) + value(user)


def utilization(previous, current):
    total = current[1] - previous[1]
    if total <= 0:
        raise RuntimeError('Windows CPU counters did not advance')
    return 100 * (1 - (current[0] - previous[0]) / total)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('seconds', type=int)
    seconds = parser.parse_args().seconds
    if not 1 <= seconds <= 600:
        parser.error('Choose an interval from 1 to 600 seconds')
    start = time.monotonic()
    previous = ticks()
    samples = []
    for _ in range(seconds):
        time.sleep(1)
        current = ticks()
        samples.append({'elapsedSeconds': time.monotonic() - start, 'busyPercent': utilization(previous, current)})
        previous = current
    print(json.dumps({'logicalProcessors': os.cpu_count(), 'method': 'Windows GetSystemTimes', 'samples': samples}))
