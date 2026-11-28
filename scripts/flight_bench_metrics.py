"""Measurements for the controlled stock-game replay. Distances are sampled chords."""
import math


def summarize(report):
    trace = report["trace"]
    release = report["releaseTick"]
    before = trace[:release + 1]
    after = trace[release + 1:]
    captured = any(row["phase"] == "GLIDING" for row in before)
    distance = longest = continuous = flight_distance = peak_accel = 0.0
    losses = 0
    for index, (a, b) in enumerate(zip(trace, trace[1:]), 1):
        dt = b["time"] - a["time"]
        if dt <= 0:
            raise ValueError("Simulation time did not advance")
        def delta(field):
            return math.dist([a[field][k] for k in "xyz"], [b[field][k] for k in "xyz"])
        step = delta("position")
        flight_distance += step
        peak_accel = max(peak_accel, delta("velocity") / dt)
        if a["phase"] == b["phase"] == "GLIDING":
            continuous += step
            distance += step
            longest = max(longest, continuous)
        else:
            continuous = 0
        if index <= release and a["phase"] == "GLIDING" and b["phase"] != "GLIDING":
            losses += 1
    attempted_release = report["schedule"]["releasePulse"]
    active_release = (attempted_release and before[-1]["phase"] == "GLIDING"
                      and any(row["phase"] == "DETACHING" for row in after)
                      and after[-1]["phase"] == "FLIGHT")
    solid = [row["solidDistance"] for row in trace if row["solidDistance"] is not None]
    contact = [row["clearance"] for row in trace if row["phase"] == "GLIDING" and row["clearance"] is not None]
    impacts = trace[-1]["impacts"] - trace[0]["impacts"]
    penetrated = any(d < 3.2 - 1e-5 for d in solid)
    phases = {row["phase"] for row in trace}
    safe_rejection = (not captured and phases <= {"FLIGHT", "ARMED", "REDIRECT"}
                      and before[-1]["phase"] == "FLIGHT" and not impacts and not penetrated)
    success = bool(captured and not losses and active_release and not impacts and not penetrated)
    if penetrated:
        outcome = "hull-intrusion"
    elif impacts:
        outcome = "impact"
    elif success:
        outcome = "glide-and-release"
    elif safe_rejection:
        outcome = "capture-missed"
    elif captured:
        outcome = "contact-lost" if losses or before[-1]["phase"] != "GLIDING" else "detach-missed"
    else:
        outcome = "capture-missed"
    # A difficult route may safely abandon an acquired surface before the deliberate release.
    safe_exit = captured and losses > 0 and before[-1]["phase"] == "FLIGHT" and not impacts and not penetrated
    disposition = report["experiment"]["disposition"]
    if disposition == "must-succeed":
        meets = success
    elif disposition == "must-reject":
        meets = safe_rejection and phases <= {"FLIGHT", "ARMED"} and trace[-1]["phase"] == "FLIGHT"
    else:
        meets = success or safe_rejection or safe_exit
    complete = (report["imported"] == report["replayed"] and report["imported"]["id"] == report["sha256"]
                and report["returnedToBuiltin"] and not report["errors"] and bool(phases - {"FLIGHT"})
                and all(row["mode"] == "running" for row in trace))
    return outcome, {
        "captured": captured, "continuousPass": captured and not losses and before[-1]["phase"] == "GLIDING",
        "activeRelease": active_release, "safeRejection": safe_rejection, "safeExit": safe_exit,
        "shieldImpacts": impacts, "sampledHullIntrusion": penetrated,
        "minimumSampledSolidDistanceM": min(solid, default=None),
        "minimumSampledGlideClearanceM": min(contact, default=None),
        "sampledGlideM": distance, "longestSampledGlideM": longest, "contactLossesBeforeRelease": losses,
        "releaseSpeedRetention": after[-1]["speed"] / before[-1]["speed"] if active_release else None,
        "peakSampledAccelerationMps2": peak_accel, "flightDistanceM": flight_distance,
        "approachesPerKm": 1000 / flight_distance if flight_distance else None,
        "completed": bool(complete), "meetsDisposition": bool(complete and meets),
    }
