"""Bounded C147 mailbox worker. Run as Compose service or --once from a host scheduler."""
import argparse
import json
import os
import signal
import sys
import threading
import urllib.error
import urllib.parse
import urllib.request


def tick():
    base = os.environ.get("NAKAMA_URL", "").rstrip("/")
    key = os.environ.get("NAKAMA_HTTP_KEY", "")
    if not base or not key:
        raise ValueError("Set NAKAMA_URL and NAKAMA_HTTP_KEY")
    url = base + "/v2/rpc/mail_tick?" + urllib.parse.urlencode({"http_key": key})
    request = urllib.request.Request(url, data=json.dumps("{}").encode(),
                                     headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            result = json.load(response)
    except (urllib.error.URLError, TimeoutError):
        # Never print exception URLs: they contain the runtime HTTP key.
        raise RuntimeError("Mailbox RPC unavailable") from None
    if isinstance(result, dict) and "payload" in result:
        result = json.loads(result["payload"])
    if not isinstance(result, dict) or result.get("success") is not True:
        raise RuntimeError("Mailbox RPC rejected")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    stop = threading.Event()
    for name in (signal.SIGINT, signal.SIGTERM):
        signal.signal(name, lambda *_: stop.set())
    backoff = 1
    while not stop.is_set():
        try:
            result = tick()
            if result.get("delivered") or result.get("purged") or result.get("failures") or args.once:
                print(json.dumps(result), flush=True)
            backoff = 1
        except (ValueError, RuntimeError, json.JSONDecodeError) as error:
            print(str(error), file=sys.stderr, flush=True)
            if args.once:
                return 1
            backoff = min(120, backoff * 2)
        if args.once:
            return 0
        stop.wait(30 if backoff == 1 else backoff)
    return 0


if __name__ == "__main__":
    sys.exit(main())
