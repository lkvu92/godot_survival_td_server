// C227: server-authored formation metadata, independent of combat stat tuning.
const TANKERS = new Set(['horn_cactus', 'frost_knight', 'frost_giant', 'lava_brute',
  'ent_protector', 'shield_sentinel', 'granite_colossus']);
const LEADS = {tanker: 0, ranger: 2.5, fast: 1.5, boss: 2};
const CAMPAIGN_ARCS = new Set(['arc_2', 'arc_frozen_realm', 'arc_verdant_realm',
  'arc_iron_bastion', 'arc_titan_realm', 'arc_ngu_to_quy_khu']);

function applySpawnFormation(stages, enemies) {
  const definitions = new Map(enemies.map(enemy => [enemy.id, enemy]));
  let changed = 0;
  for (const stage of stages) {
    if (!CAMPAIGN_ARCS.has(stage.arc_id)) continue;
    for (const wave of stage.waves) for (const entry of wave.entries) {
      const enemy = definitions.get(entry.enemy_id);
      if (!enemy) throw Error(`Unknown formation enemy: ${entry.enemy_id}`);
      const role = entry.boss || enemy.is_boss ? 'boss'
        : TANKERS.has(entry.enemy_id.replace(/^arc6_/, '')) ? 'tanker'
        : enemy.attack_type === 'ranged' ? 'ranger' : 'fast';
      if (entry.spawn_role !== role || entry.formation_lead_seconds !== LEADS[role]) changed++;
      entry.spawn_role = role;
      entry.formation_lead_seconds = LEADS[role];
    }
  }
  return changed;
}

module.exports = {applySpawnFormation, LEADS};
