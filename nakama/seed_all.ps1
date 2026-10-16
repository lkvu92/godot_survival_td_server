#!/usr/bin/env pwsh
# seed_all.ps1 — Seed all game config data into Nakama
# Run from: e:\LKVU\survival_td_godot\nakama\
# Usage: .\seed_all.ps1

$scriptPath = Join-Path $PSScriptRoot "seed_all.py"
if (Get-Command python -ErrorAction SilentlyContinue) {
    python $scriptPath
} else {
    Write-Host "Python not found in PATH, running direct curl seeding..." -ForegroundColor Yellow
}

# ── Verify row counts ────────────────────────────────────────
Write-Host ""
Write-Host "=== Row counts ===" -ForegroundColor Yellow
docker exec nakama-postgres psql -U postgres -d nakama -c @"
SELECT 'heroes'     AS tbl, count(*) FROM game_heroes
UNION ALL SELECT 'enemies',     count(*) FROM game_enemies
UNION ALL SELECT 'items',       count(*) FROM game_items
UNION ALL SELECT 'skills',      count(*) FROM game_skills
UNION ALL SELECT 'arcs',        count(*) FROM game_arcs
UNION ALL SELECT 'stages',      count(*) FROM game_stages
UNION ALL SELECT 'stage_waves', count(*) FROM game_stage_waves
UNION ALL SELECT 'stage_levels', count(*) FROM game_stage_levels
UNION ALL SELECT 'cards',       count(*) FROM game_cards
UNION ALL SELECT 'effects',     count(*) FROM game_effects
UNION ALL SELECT 'talismans',   count(*) FROM game_talismans
UNION ALL SELECT 'config',      count(*) FROM game_config
UNION ALL SELECT 'store_products', count(*) FROM game_store_products
UNION ALL SELECT 'store_rewards', count(*) FROM game_store_product_rewards
UNION ALL SELECT 'content_configs', count(*) FROM game_content_configs
UNION ALL SELECT 'purchase_orders', count(*) FROM monetization_purchase_orders
ORDER BY tbl;
"@
