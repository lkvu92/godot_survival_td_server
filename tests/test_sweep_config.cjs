// Publication must reject broken sweep rules before creating an immutable release.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const context=vm.createContext({});
for(const file of ['sweep_rpc','config_rpc'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../nakama/data/modules/build',file+'.js'),'utf8'),context);
const get=name=>vm.runInContext(name,context),clone=value=>JSON.parse(JSON.stringify(value));
const defaults=clone(get('SWEEP_DEFAULTS'));
context.validRewardedAdsConfig=()=>true;
context.parseJsonb=value=>typeof value==='string'?JSON.parse(value):value;
let settings=[],inserts=0;
const nk={sqlQuery(sql){
 if(sql.includes('remote_config_settings'))return settings;
 if(sql.includes('remote_config_releases'))return [{config_version:7,snapshot:{}}];
 throw new Error('Unexpected query: '+sql);
},sqlExec(sql){assert(sql.includes('INSERT INTO remote_config_releases'));inserts++;}};
function publish(config){
 settings=[['min_app_version','string','1.0.0'],['latest_app_version','string','1.0.0'],['ads_enabled','bool','false'],['payment_enabled','bool','false']].map(([key,value_type,value])=>({module:'system',key,value_type,value}));
 settings.push({module:'system',key:'tower_sweep',value_type:'json',value:JSON.stringify(clone(get('TOWER_SWEEP_DEFAULTS')))});
 if(config!==undefined)settings.push({module:'system',key:'stage_sweep',value_type:'json',value:JSON.stringify(config)});
 return JSON.parse(get('publishConfigRelease')({userId:'admin',env:{CONFIG_ADMIN_USER_ID:'admin'}},{},nk,'{}'));
}
for(const change of [
 c=>{c.ticket_probabilities=[0.25,0.6,0.2];},
 c=>{c.ticket_probabilities=[-0.1,0.9,0.2];},
 c=>{c.grades[1].above=0.95;},
 c=>{c.grades[0].above=1;},
 c=>{c.grades[4].above=0;},
 c=>{c.grades[2].multiplier=0.99;},
 c=>{c.grades[1]=null;},
 c=>{c.max_rounds=100000;},
 c=>{c.enabled='true';}
]){const config=clone(defaults);change(config);const before=inserts,result=publish(config);assert.equal(result.code,422);assert.equal(result.message,'Missing or invalid system.stage_sweep');assert.equal(inserts,before,'rejected config must never be published');}
assert.equal(publish(defaults).status,'ok');assert.equal(inserts,1);
assert.equal(publish(undefined).code,422,'missing required sweep config must be rejected');assert.equal(inserts,1);
console.log('PASS sweep config publication: complete release accepted; incomplete release rejected; invalid probabilities, thresholds, multipliers and schema rejected before insert');
