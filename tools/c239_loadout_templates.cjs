/* Deduplicate immutable stage-authored element loadouts in the shared snapshot. */
const crypto=require('node:crypto');
function compact(value){const templates={};for(const stage of value.stages)for(const wave of stage.waves)for(const entry of wave.entries)for(const row of [entry,...Object.values(entry.difficulty_overrides||{})])if(row.skills_by_element){const json=JSON.stringify(row.skills_by_element),id='loadout_'+crypto.createHash('sha256').update(json).digest('hex').slice(0,20);if(templates[id]&&JSON.stringify(templates[id])!==json)throw Error('Loadout hash collision');templates[id]=row.skills_by_element;row.loadout_template_id=id;delete row.skills_by_element;}value.loadout_templates=templates;return value;}
module.exports={compact};
