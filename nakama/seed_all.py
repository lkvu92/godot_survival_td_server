"""Seed CLI: preflight all inputs, then commit one atomic shared-catalog bundle."""
import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
_pending_requests = None


class SeedError(Exception):
    pass


def rpc_url(name):
    override = os.environ.get("NAKAMA_SEED_URL")
    if override:
        parsed = urllib.parse.urlsplit(override)
        return urllib.parse.urlunsplit(parsed._replace(path="/v2/rpc/" + name))
    base = os.environ.get("NAKAMA_URL")
    if not base:
        base = "http://{}:{}".format(os.environ.get("NAKAMA_HOST", "localhost"), os.environ.get("NAKAMA_PORT", "7350"))
    key = os.environ.get("NAKAMA_HTTP_KEY", "local-monetization-http-key-2026")
    return base.rstrip("/") + "/v2/rpc/" + name + "?" + urllib.parse.urlencode({"http_key": key})


def invoke_rpc(name, payload, bearer=None):
    url = rpc_url(name)
    headers = {"Content-Type": "application/json"}
    if bearer:
        parsed = urllib.parse.urlsplit(url)
        url = urllib.parse.urlunsplit(parsed._replace(query=""))
        headers["Authorization"] = "Bearer " + bearer
    encoded = json.dumps(json.dumps(payload)).encode("utf-8")
    if len(encoded) > 8 * 1024 * 1024:
        raise SeedError("Seed bundle exceeds configured 8 MiB request limit; no request sent")
    request = urllib.request.Request(url, data=encoded, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=float(os.environ.get("NAKAMA_SEED_TIMEOUT", "60"))) as response:
            wire = json.loads(response.read().decode("utf-8"))
        result = json.loads(wire["payload"])
    except urllib.error.HTTPError as error:
        raise SeedError(f"{name}: HTTP {error.code}; no partial-seed fallback") from error
    except (urllib.error.URLError, ValueError, KeyError, TypeError, OSError) as error:
        # URLs and exception text may expose credentials.
        raise SeedError(f"{name}: transport/response failure ({type(error).__name__})") from error
    if not isinstance(result, dict) or result.get("error") or result.get("status") in ("error", "force_update"):
        raise SeedError(f"{name}: server rejected request")
    return result


def invoke_seed(table, payload):
    if _pending_requests is not None:
        _pending_requests.append({"table": table, **payload})
        return
    result = invoke_rpc("seed_game_data", {"table": table, **payload})
    expected = len(payload["rows"]) if "rows" in payload else 1
    if result.get("success") is not True or result.get("table") != table or result.get("inserted") != expected:
        raise SeedError(f"{table}: invalid success/readback count")
    print(f"[OK] {table}: {expected} rows verified")


def read_json(filename):
    try:
        with (DATA_DIR / filename).open(encoding="utf-8-sig") as source:
            return json.load(source)
    except (OSError, ValueError) as error:
        raise SeedError(f"Cannot read required data: {filename}") from error


def seed_file(table, filename, replace_all=False, batch_size=0):
    rows = read_json(filename)
    if not isinstance(rows, list) or not rows:
        raise SeedError(f"{filename}: expected a nonempty array")
    if replace_all or batch_size <= 0:
        invoke_seed(table, {"rows": rows, "replace_all": replace_all})
    else:
        for offset in range(0, len(rows), batch_size):
            invoke_seed(table, {"rows": rows[offset:offset + batch_size]})


def seed_commerce(replace_all=False):
    packs = read_json("packs.json")
    rows = [{**product, "tab_id": tab} for tab, products in packs["packs_by_tab"].items() for product in products]
    first = read_json("first_topup.json")
    rows.append({**first, "id": "first_topup_pack", "name": first.get("title", "First Top-up"),
                 "desc": first.get("subtitle", ""), "tab_id": "first_topup", "icon_type": "pack",
                 "icon_key": "first_purchase_pack", "price": first.get("display_price", ""),
                 "presentation_rewards": first.get("rewards", []), "rewards": first.get("grant_lines", [])})
    invoke_seed("store_catalog", {"rows": rows, "replace_all": replace_all})
    seed_content_configs()


def seed_content_configs():
    configs = [("daily_checkin", "daily_checkin.json"), ("events", "events.json"),
               ("stamina", "stamina_config.json"), ("vip", "vip_config.json"), ("rewarded_ads", "rewarded_ads.json"),
               ("enemy_skills", "enemy_skills.json"), ("boss_skills", "boss_skills.json"), ("tribulation", "tribulation_config.json")]
    invoke_seed("content_configs", {"rows": [{"id": key, "payload": read_json(filename), "active": True} for key, filename in configs]})


def main(argv=None):
    global _pending_requests
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--replace-all", action="store_true", help="Prune absent heroes and deactivate absent products; full catalogs only")
    parser.add_argument("--settings", type=Path, help="Remote settings JSON array; updates draft only")
    parser.add_argument("--content-only", action="store_true", help="Seed only the eight supplemental content configs")
    parser.add_argument("--settings-only", action="store_true", help="Skip content seed; requires --settings")
    parser.add_argument("--publish", action="store_true", help="Publish using NAKAMA_CONFIG_ADMIN_TOKEN after successful seed")
    parser.add_argument("--app-version", default="1.0.0")
    parser.add_argument("--store-url", default="")
    args = parser.parse_args(argv)
    try:
        if args.content_only and args.settings_only:
            raise SeedError("Choose either --content-only or --settings-only")
        if args.settings_only and not args.settings:
            raise SeedError("--settings-only requires --settings")
        admin = os.environ.get("NAKAMA_CONFIG_ADMIN_TOKEN")
        if args.publish and (not args.settings or not admin):
            raise SeedError("--publish requires --settings and NAKAMA_CONFIG_ADMIN_TOKEN")
        settings = None
        if args.settings:
            settings = json.loads(args.settings.read_text(encoding="utf-8-sig"))
            if not isinstance(settings, list) or not settings:
                raise SeedError("Settings must be a nonempty JSON array")
        # No RPC is sent until every requested source file has loaded successfully.
        _pending_requests = []
        if args.content_only:
            seed_content_configs()
        if not args.settings_only and not args.content_only:
            for table in ("heroes", "enemies", "items", "skills", "arcs", "cards", "effects", "talismans"):
                seed_file(table, table + ".json", args.replace_all and table == "heroes")
            seed_file("stages", "stages.json", batch_size=5)
            seed_file("stage_levels", "stage_levels.json", batch_size=30)
            invoke_seed("config", {"config_key": "progression", "config_value": read_json("progression.json")})
            seed_commerce(args.replace_all)
        if settings is not None:
            invoke_seed("remote_settings", {"rows": settings})
        requests = _pending_requests
        _pending_requests = None
        if requests:
            result = invoke_rpc("seed_game_data", {"table": "bundle", "requests": requests})
            if result.get("success") is not True or result.get("atomic") is not True or result.get("table") != "bundle":
                raise SeedError("Runtime does not confirm atomic seed bundle; no legacy partial-seed fallback")
            results = result.get("results", [])
            if len(results) != len(requests):
                raise SeedError("Bundle readback result count mismatch")
            for request, readback in zip(requests, results):
                expected = len(request["rows"]) if "rows" in request else 1
                if readback.get("success") is not True or readback.get("table") != request["table"] or readback.get("inserted") != expected:
                    raise SeedError("Bundle readback mismatch: " + request["table"])
                print(f"[OK] {request['table']}: {expected} rows verified atomically")
        if args.publish:
            result = invoke_rpc("publish_config_release", {"app_version": args.app_version, "store_url": args.store_url}, admin)
            if result.get("status") != "ok" or not isinstance(result.get("config_version"), int):
                raise SeedError("Publication failed")
            print(f"[OK] Published config version {result['config_version']}")
        print("Synchronization complete. Catalog bundle committed atomically; player/server/financial data untouched. Publication is separate.")
        return 0
    except (SeedError, OSError, ValueError, KeyError, TypeError) as error:
        print(f"[ERR] {error}", file=sys.stderr)
        return 1
    finally:
        _pending_requests = None


if __name__ == "__main__":
    sys.exit(main())
