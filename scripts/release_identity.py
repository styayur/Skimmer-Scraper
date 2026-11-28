"""Compare immutable source provenance across independent site and WebView builds."""
from datetime import datetime


def same_clean_source(left, right):
    stamps = [datetime.fromisoformat(build["sourceCommitTime"]) for build in (left, right)]
    return (left["dirty"] is False and right["dirty"] is False
            and all(stamp.utcoffset() is not None for stamp in stamps) and stamps[0] == stamps[1]
            and all(left[key] == right[key] for key in ("version", "sourceCommit", "sourceUrl")))
