"""Sample only peak levels for the named process tree on the default Windows render endpoint."""
import json
import sys
import time
from pathlib import Path

import psutil
from pycaw.pycaw import AudioUtilities, IAudioMeterInformation


def measure(pid, output, stop):
    owner = psutil.Process(pid)
    deadline = time.monotonic() + 240
    refresh = 0
    meters = []
    with output.open("x", encoding="utf-8", buffering=1) as stream:
        while not stop.exists() and owner.is_running():
            now = time.monotonic()
            if now >= deadline:
                raise TimeoutError("Session measurement exceeded four minutes")
            if now >= refresh:
                pids = {owner.pid, *(child.pid for child in owner.children(recursive=True))}
                meters = [
                    session._ctl.QueryInterface(IAudioMeterInformation)
                    for session in AudioUtilities.GetAllSessions()
                    if session.ProcessId in pids
                ]
                refresh = now + 0.25
            peak = max((meter.GetPeakValue() for meter in meters), default=0.0)
            print(json.dumps([round(time.time() * 1000), len(meters), peak]), file=stream)
            time.sleep(0.04)


if __name__ == "__main__":
    measure(int(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]))
