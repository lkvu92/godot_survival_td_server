/*
 * C218 analytical baseline simulator. It is deliberately read-only: it measures
 * authored catalog pressure and emits a proposal/report; it never mutates stages.
 * Runtime battle remains authoritative. Godot fixtures guard the shared damage
 * curve and this tool reports its assumptions in every result.
 */
const fs = require('node:fs');
const path = require('node:path');
const {ROLES} = require('./campaign_wave_roles.cjs');

const HERO_EXP = [25,35,50,70,95,125,160,205,255,315,385,465,560,670,800,950,1120,1310,1520];
const clone = value => JSON.parse(JSON.stringify(value));
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round = value => Math.round(value * 1000) / 1000;

function requirement(level) {
  if (!Number.isInteger(level) || level < 1) throw Error('Invalid hero level');
  let value = HERO_EXP.at(-1);
  for (let index = HERO_EXP.length; index < level; index++) value = Math.round(value * 1.25);
  return level <= HERO_EXP.length ? HERO_EXP[level - 1] : value;
}

function validProfiles(value, arcs = []) {
  if (!value || value.version !== 1 || !Array.isArray(value.profiles) || !value.reference_model || !value.shape_limits || !value.difficulty) return false;
  const quantiles = value.reference_model.card_quantiles;
  if (!quantiles || !['p25','p50','p75'].every(key => Number.isFinite(quantiles[key]) && quantiles[key] >= 0 && quantiles[key] <= 1)) return false;
  const limits = value.shape_limits;
  if (!Number.isFinite(limits.max_step_up) || limits.max_step_up <= 0 || !Number.isFinite(limits.max_step_down) || limits.max_step_down <= 0 || !Array.isArray(limits.opening_caps) || limits.opening_caps.length !== 3) return false;
  const ids = new Set();
  for (const profile of value.profiles) {
    if (!profile || typeof profile.arc_id !== 'string' || ids.has(profile.arc_id) || !Number.isFinite(profile.power_start) || !Number.isFinite(profile.power_end) || profile.power_start <= 0 || profile.power_end < profile.power_start || profile.curve !== 'ease_in_out') return false;
    ids.add(profile.arc_id);
  }
  return !arcs.length || arcs.filter(arc => number(arc.order) >= 1).every(arc => ids.has(arc.id));
}

function pressurePhase(position) {
  if (position <= .15) return {id:'opening', min:.35, max:.60};
  if (position <= .35) return {id:'build', min:.50, max:.70};
  if (position <= .70) return {id:'mid', min:.65, max:.85};
  if (position < 1) return {id:'climax', min:.75, max:.95};
  return {id:'final', min:.90, max:1.10};
}

function eased(value) { return value * value * (3 - 2 * value); }
function stageBudget(profile, stageIndex, stageCount) {
  const position = stageCount <= 1 ? 0 : clamp(stageIndex / (stageCount - 1), 0, 1);
  return profile.power_start + (profile.power_end - profile.power_start) * eased(position);
}

function heroAtLevel(hero, level) {
  const attributes = clone(hero.attributes || {});
  const growth = hero.level_up_stats || {};
  for (let index = 1; index < Math.max(1, level); index++) {
    for (const [key, value] of Object.entries(growth)) {
      if (['hp','atk','def','move_speed','attack_speed','attack_range'].includes(key)) attributes[key] = number(attributes[key]) * number(value, 1);
      else attributes[key] = number(attributes[key]) + number(value);
    }
  }
  attributes.crit_rate = clamp(number(attributes.crit_rate), 0, 1);
  attributes.crit_damage = clamp(number(attributes.crit_damage, 1), 1, 10);
  attributes.regen_percent_per_10s = clamp(number(attributes.regen_percent_per_10s), 0, .1);
  return attributes;
}

function firstSkill(hero, skills) {
  const id = Array.isArray(hero.starting_skills) ? hero.starting_skills[0] : '';
  return skills.find(skill => skill.id === id) || null;
}

function levelOneSkillDamage(skill, attack) {
  if (!skill || !Array.isArray(skill.levels) || !skill.levels[0]) return {damage:0, cooldown:Infinity};
  const stats = skill.levels[0].stats || {};
  const count = Math.max(1, number(stats.strike_count, number(stats.projectile_count, 1)));
  return {damage:attack * number(stats.damage_pct) * .01 * count, cooldown:Math.max(.1, number(stats.cooldown, Infinity))};
}

function effectiveStats(entry, enemy, difficulty) {
  const attributes = enemy.attributes || {};
  const modifiers = entry.modifiers || {};
  const modified = stat => {
    let value = number(attributes[stat]);
    if (modifiers[stat] !== undefined) value = number(modifiers[stat]);
    else value *= number(modifiers[`${stat}_mul`], 1);
    value += number(modifiers[`${stat}_add`], 0);
    return Math.max(0, value);
  };
  return {
    hp: modified('hp') * difficulty.hp_mul,
    atk: modified('atk') * difficulty.atk_mul,
    def: modified('def') * difficulty.def_mul,
    attack_speed: Math.max(.05, number(attributes.attack_speed, .5) * number(modifiers.attack_speed_mul, 1)),
    count: Math.max(0, number(entry.count)),
    start_delay: Math.max(0, number(entry.start_delay)),
    interval: Math.max(.01, number(entry.interval, 1)),
    exp: Math.max(0, number(modifiers.exp))
  };
}

function expectedMultiplier(attributes) { return 1 + number(attributes.crit_rate) * (number(attributes.crit_damage, 1) - 1); }
function defenseMultiplier(defense) { return 100 / (100 + Math.max(0, defense)); }

function spawnTimes(entry, stats) {
  return Array.from({length:stats.count}, (_, index) => stats.start_delay + index * stats.interval);
}

function applyRunLevels(attributes, hero, runLevel) {
  const result = clone(attributes);
  const growth = hero.level_up_stats || {};
  for (let index = 1; index < Math.max(1, runLevel); index++) {
    for (const [key, value] of Object.entries(growth)) {
      if (['hp','atk','def','move_speed','attack_speed','attack_range'].includes(key)) result[key] = number(result[key]) + number(attributes[key]) * (number(value, 1) - 1) * .25;
      else result[key] = number(result[key]) + number(value);
    }
  }
  return result;
}

function simulateWave({wave, waveIndex, totalWaves, hero, persistentLevel, runLevel, skills, enemies, difficulty, cardMultiplier = 0, stageFactor = 1, powerScale = 1}) {
  const attrs = applyRunLevels(heroAtLevel(hero, persistentLevel), hero, runLevel);
  // This is an analytical loadout scale, not the permanent combat-power score.
  // It is used only by the read-only recommendation search below.
  attrs.hp *= powerScale;
  attrs.atk *= (1 + cardMultiplier) * powerScale;
  attrs.def *= Math.sqrt(powerScale);
  const basicCooldown = Math.max(.2, 2 - number(attrs.attack_speed) * .005);
  const basicRaw = number(attrs.atk) * .75;
  const skill = levelOneSkillDamage(firstSkill(hero, skills), attrs.atk);
  const enemyById = new Map(enemies.map(enemy => [enemy.id, enemy]));
  const units = [];
  for (const entry of wave.entries || []) {
    const enemy = enemyById.get(entry.enemy_id);
    if (!enemy) continue;
    const stats = effectiveStats(entry, enemy, difficulty);
    for (const spawnAt of spawnTimes(entry, stats)) units.push({enemy_id:entry.enemy_id, spawn_at:spawnAt, ...stats, hp:stats.hp * stageFactor});
  }
  units.sort((a,b) => a.spawn_at - b.spawn_at || a.enemy_id.localeCompare(b.enemy_id));
  // Analytical target policy: focus earliest spawned live target. This is a
  // conservative single-target baseline; report explicitly marks it as such.
  let now = 0, nextBasic = 0, nextSkill = 0, incoming = 0, totalExp = 0;
  const alive = units.map(unit => ({...unit, remaining:unit.hp, died_at:null}));
  const incomingRate = time => alive.reduce((sum, unit) => {
    if (unit.spawn_at > time || unit.died_at !== null && unit.died_at <= time) return sum;
    return sum + unit.atk * unit.attack_speed * defenseMultiplier(attrs.def);
  }, 0);
  while (alive.some(unit => unit.died_at === null)) {
    const target = alive.find(unit => unit.died_at === null && unit.spawn_at <= now) || alive.find(unit => unit.died_at === null);
    if (!target) break;
    now = Math.max(now, target.spawn_at);
    const next = Math.min(nextBasic, nextSkill);
    if (next > now) { incoming += incomingRate(now) * (next - now); now = next; }
    let raw = 0;
    if (nextBasic <= now + 1e-9) { raw += basicRaw; nextBasic = now + basicCooldown; }
    if (nextSkill <= now + 1e-9 && Number.isFinite(skill.cooldown)) { raw += skill.damage; nextSkill = now + skill.cooldown; }
    if (!raw) { now += .01; continue; }
    const damage = raw * expectedMultiplier(attrs) * defenseMultiplier(target.def);
    target.remaining -= damage;
    if (target.remaining <= 0) { target.died_at = now; totalExp += target.exp; }
  }
  const duration = Math.max(now, ...units.map(unit => unit.spawn_at));
  const regen = number(attrs.hp) * number(attrs.regen_percent_per_10s) / 10 * duration;
  const survival = Math.max(1, number(attrs.hp) + regen);
  const phase = pressurePhase(totalWaves <= 1 ? 1 : waveIndex / (totalWaves - 1));
  const damagePressure = incoming / survival;
  const allowedClearTime = Math.max(12, Math.max(0, ...units.map(unit => unit.spawn_at)) + 20);
  const timePressure = duration / allowedClearTime;
  const pressure = Math.max(damagePressure, timePressure);
  return {
    wave: waveIndex + 1, phase:phase.id, phase_target:[phase.min, phase.max],
    persistent_hero_level:persistentLevel, run_hero_level:runLevel, card_multiplier:round(cardMultiplier), basic_cooldown:round(basicCooldown),
    enemy_count:units.length, total_ehp:round(units.reduce((sum, unit) => sum + unit.hp, 0)),
    spawn_duration:round(Math.max(0, ...units.map(unit => unit.spawn_at))), clear_time:round(duration), allowed_clear_time:round(allowedClearTime),
    incoming_damage:round(incoming), survival_budget:round(survival), damage_pressure:round(damagePressure), time_pressure:round(timePressure), wave_pressure:round(pressure), total_exp:totalExp,
    model:'analytical_single_target_neutral_v1'
  };
}

function simulateStage({stage, arc, profile, hero, skills, enemies, difficulty, cardQuantile, powerScale = 1}) {
  const persistentLevel = Math.max(1, number(stage.stage_rules?.balance_reference_level, number(arc.level_min, 1)));
  let runLevel = 1;
  let exp = 0;
  const multiplierPerCard = number(cardQuantile);
  const rows = [];
  for (const [index, wave] of stage.waves.entries()) {
    const stageIndex = arc.stage_ids.indexOf(stage.id);
    const factor = stageBudget(profile, Math.max(0, stageIndex), arc.stage_ids.length);
    const row = simulateWave({wave,waveIndex:index,totalWaves:stage.waves.length,hero,persistentLevel,runLevel,skills,enemies,difficulty,cardMultiplier:index * multiplierPerCard,stageFactor:factor,powerScale});
    rows.push(row);
    exp += row.total_exp;
    while (exp >= requirement(runLevel)) { exp -= requirement(runLevel); runLevel++; }
  }
  const limits = profile._limits;
  const violations = [];
  for (const [index, row] of rows.entries()) {
    if (index < limits.opening_caps.length && row.wave_pressure > limits.opening_caps[index]) violations.push(`opening_cap:wave_${row.wave}`);
    if (index > 0) {
      const delta = row.wave_pressure - rows[index - 1].wave_pressure;
      if (delta > limits.max_step_up) violations.push(`step_up:wave_${row.wave}`);
      if (delta < -limits.max_step_down) violations.push(`step_down:wave_${row.wave}`);
    }
  }
  return {arc_id:arc.id,stage_id:stage.id,difficulty: difficulty.id,card_quantile:cardQuantile,power_scale:round(powerScale),model:'analytical_single_target_neutral_v1',waves:rows,violations};
}

function meetsTargets(result) {
  return result.waves.every(row => row.wave_pressure <= row.phase_target[1]);
}

function analyticalPowerFactor(input) {
  let low = .25, high = 1;
  while (!meetsTargets(simulateStage({...input,powerScale:high})) && high < 32) high *= 2;
  for (let index = 0; index < 14; index++) {
    const mid = (low + high) / 2;
    if (meetsTargets(simulateStage({...input,powerScale:mid}))) high = mid;
    else low = mid;
  }
  return round(high);
}

function buildProposals({arcs, stages, stageLevels, heroes, skills, enemies, profiles}) {
  throw Error('DEPRECATED_INVALID_MODEL: use godot_campaign_recommender.cjs; analytical power factors cannot produce recommended_power');
}

function analyzeCatalog({arcs, stages, heroes, skills, enemies, profiles, difficultyId = 'normal'}) {
  if (!validProfiles(profiles, arcs)) throw Error('Invalid campaign pressure profiles');
  const hero = heroes.find(candidate => candidate.id === profiles.reference_model.hero_id);
  if (!hero) throw Error('Missing reference hero');
  const difficulty = {...profiles.difficulty[difficultyId], id:difficultyId};
  if (!difficulty) throw Error('Unknown difficulty');
  const profileByArc = new Map(profiles.profiles.map(profile => [profile.arc_id, {...profile,_limits:profiles.shape_limits}]));
  const results = [];
  for (const arc of arcs.filter(candidate => number(candidate.order) >= 1)) {
    const profile = profileByArc.get(arc.id);
    for (const stageId of arc.stage_ids) {
      const stage = stages.find(candidate => candidate.id === stageId);
      if (!stage) throw Error(`Missing stage ${stageId}`);
      for (const quantile of ['p25','p50','p75']) results.push(simulateStage({stage,arc,profile,hero,skills,enemies,difficulty,cardQuantile:profiles.reference_model.card_quantiles[quantile]}));
    }
  }
  return {version:1, model:'analytical_single_target_neutral_v1', difficulty:difficultyId, results};
}

function loadCatalog(root) {
  const read = name => JSON.parse(fs.readFileSync(path.join(root, 'data', `${name}.json`), 'utf8'));
  return {arcs:read('arcs'),stages:read('stages'),stageLevels:read('stage_levels'),heroes:read('heroes'),skills:read('skills'),enemies:read('enemies'),profiles:read('campaign_pressure_profiles')};
}

if (require.main === module) {
  const root = path.join(__dirname, '..');
  const args = process.argv.slice(2);
  const difficulty = args.find(arg => arg.startsWith('--difficulty='))?.split('=')[1] || 'normal';
  const output = args.find(arg => arg.startsWith('--report='))?.split('=')[1] || '';
  const proposalOutput = args.find(arg => arg.startsWith('--proposal='))?.split('=')[1] || '';
  if (args.some(arg => !arg.startsWith('--difficulty=') && !arg.startsWith('--report=') && !arg.startsWith('--proposal='))) throw Error('Use --difficulty=normal|epic|legend [--report=path] [--proposal=path]');
  const catalog = loadCatalog(root);
  const report = analyzeCatalog({...catalog,difficultyId:difficulty});
  if (output) fs.writeFileSync(path.resolve(output), JSON.stringify(report, null, 2) + '\n', 'utf8');
  if (proposalOutput) throw Error('DEPRECATED_INVALID_MODEL: use godot_campaign_recommender.cjs for recommendations');
  const proposals = [];
  const violations = report.results.reduce((sum, result) => sum + result.violations.length, 0);
  console.log(JSON.stringify({status:'PASS',model:report.model,difficulty,stages:report.results.length / 3,lanes:report.results.length,violations,report:output || null,proposal:proposalOutput || null,proposal_count:proposals.length}));
}

module.exports = {validProfiles,pressurePhase,stageBudget,heroAtLevel,applyRunLevels,effectiveStats,simulateWave,simulateStage,meetsTargets,analyticalPowerFactor,buildProposals,analyzeCatalog,loadCatalog,requirement};
