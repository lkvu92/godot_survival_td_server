import json
import urllib.request
import urllib.error
import os
import sys

HTTP_KEY = os.environ.get("NAKAMA_HTTP_KEY", "local-monetization-http-key-2026")
HOST = os.environ.get("NAKAMA_HOST", "localhost")
PORT = os.environ.get("NAKAMA_PORT", "7350")
BASE_URL = os.environ.get("NAKAMA_SEED_URL", f"http://{HOST}:{PORT}/v2/rpc/seed_game_data?http_key={HTTP_KEY}")
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")

def invoke_seed(table_name, payload_dict, label=""):
    inner_json = json.dumps(payload_dict)
    outer_json = json.dumps(inner_json)
    req = urllib.request.Request(
        BASE_URL,
        data=outer_json.encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    name = label if label else table_name
    try:
        with urllib.request.urlopen(req) as resp:
            data = resp.read().decode('utf-8')
            try:
                wire = json.loads(data)
                result = json.loads(wire.get("payload", "{}")) if isinstance(wire, dict) else {}
                if isinstance(result, dict) and result.get("error"):
                    print(f"  [ERR] {name} - {result['error']}")
                    return False
            except (ValueError, TypeError):
                print(f"  [ERR] {name} - Invalid seed response: {data[:200]}")
                return False
            print(f"  [OK]  {name}")
            return True
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode('utf-8')
        print(f"  [ERR] {name} - HTTP {e.code}: {err_msg}")
        return False
    except Exception as e:
        print(f"  [ERR] {name} - {str(e)}")
        return False

def seed_file(table_name, filename, batch_size=0):
    filepath = os.path.join(DATA_DIR, filename)
    if not os.path.exists(filepath):
        print(f"  [SKIP] File not found: {filename}")
        return

    with open(filepath, 'r', encoding='utf-8') as f:
        rows = json.load(f)

    if not isinstance(rows, list):
        print(f"  [SKIP] {filename} is not a list")
        return

    total = len(rows)
    if batch_size <= 0 or total <= batch_size:
        print(f"Seeding {table_name} ({total} rows)...")
        invoke_seed(table_name, {"table": table_name, "rows": rows})
    else:
        print(f"Seeding {table_name} ({total} rows in batches of {batch_size})...")
        for i in range(0, total, batch_size):
            batch = rows[i:i + batch_size]
            label = f"{table_name} ({i + 1}-{i + len(batch)}/{total})"
            invoke_seed(table_name, {"table": table_name, "rows": batch}, label)

def seed_progression():
    filepath = os.path.join(DATA_DIR, "progression.json")
    if not os.path.exists(filepath):
        return
    with open(filepath, 'r', encoding='utf-8') as f:
        prog = json.load(f)
    print("Seeding progression...")
    invoke_seed("config", {"table": "config", "config_key": "progression", "config_value": prog}, "progression")

def read_json(filename):
    with open(os.path.join(DATA_DIR, filename), 'r', encoding='utf-8') as f:
        return json.load(f)

def seed_commerce():
    packs = read_json("packs.json")
    rows = []
    for tab_id, products in packs.get("packs_by_tab", {}).items():
        for product in products:
            row = dict(product)
            row["tab_id"] = tab_id
            rows.append(row)
    first_topup = read_json("first_topup.json")
    rows.append({
        **first_topup,
        "id": "first_topup_pack",
        "name": first_topup.get("title", "First Top-up"),
        "desc": first_topup.get("subtitle", ""),
        "tab_id": "first_topup",
        "icon_type": "pack",
        "icon_key": "first_purchase_pack",
        "price": first_topup.get("display_price", ""),
        "presentation_rewards": first_topup.get("rewards", []),
        "rewards": first_topup.get("grant_lines", []),
    })
    print(f"Seeding store_catalog ({len(rows)} products)...")
    invoke_seed("store_catalog", {"table": "store_catalog", "rows": rows})

    configs = []
    for config_id, filename in [
        ("daily_checkin", "daily_checkin.json"),
        ("events", "events.json"),
        ("stamina", "stamina_config.json"),
        ("vip", "vip_config.json"),
        ("rewarded_ads", "rewarded_ads.json"),
    ]:
        configs.append({"id": config_id, "payload": read_json(filename), "active": True})
    print(f"Seeding content_configs ({len(configs)} configs)...")
    invoke_seed("content_configs", {"table": "content_configs", "rows": configs})

def main():
    print("=== Starting Nakama Data Synchronization ===")
    seed_file("heroes", "heroes.json")
    seed_file("enemies", "enemies.json")
    seed_file("items", "items.json")
    seed_file("skills", "skills.json")
    seed_file("arcs", "arcs.json")
    seed_file("cards", "cards.json")
    seed_file("effects", "effects.json")
    seed_file("talismans", "talismans.json")
    
    # Stages has wave details: batch by 5 stages
    seed_file("stages", "stages.json", batch_size=5)

    # Stage levels has 150 entries: batch by 30
    seed_file("stage_levels", "stage_levels.json", batch_size=30)

    seed_progression()
    seed_commerce()
    print("=== Synchronization Complete ===")

if __name__ == "__main__":
    main()
