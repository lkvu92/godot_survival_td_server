"""Run every minute from the server scheduler; uses existing runtime HTTP-key auth."""
import os
import sys
from seed_all import SeedError, invoke_rpc


def main():
    if not os.environ.get("NAKAMA_HTTP_KEY") or not os.environ.get("NAKAMA_URL"):
        raise SeedError("Set NAKAMA_URL and NAKAMA_HTTP_KEY for the scheduler")
    result = invoke_rpc("weekly_leaderboard_tick", {})
    if result.get("success") is not True:
        raise SeedError("Weekly leaderboard tick rejected")
    print("[OK] Weekly leaderboard finalization/recovery complete")


if __name__ == "__main__":
    try:
        main()
    except SeedError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
