const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),client=path.resolve(root,'../client');
const skills=JSON.parse(fs.readFileSync(path.join(root,'data/skills.json'))),elements=['neutral','metal','water','wood','fire','earth','thunder'];
assert.equal(skills.find(s=>s.id==='hero_basic_attack').element,'neutral');
for(const skill of skills)assert(elements.includes(skill.element),`explicit fixed element: ${skill.id}`);
const ctx=vm.createContext({});for(const file of ['config_tables','seed'])vm.runInContext(fs.readFileSync(path.join(root,'nakama/data/modules/build',file+'.js'),'utf8'),ctx);
const validate=vm.runInContext('validateSeedRequest',ctx),basic=skills.find(s=>s.id==='hero_basic_attack');
assert.equal(validate({table:'skills',rows:skills}),'');
assert.notEqual(validate({table:'skills',rows:[{...basic,element:'fire'}]}),'');
assert.notEqual(validate({table:'skills',rows:[{...basic,element:''}]}),'');
assert.notEqual(validate({table:'skills',rows:[{...basic,element:'typo'}]}),'');
const enemies=JSON.parse(fs.readFileSync(path.join(root,'data/enemies.json')));
for(const enemy of enemies)for(const skill of [enemy.attack_skill,...(enemy.boss_skills||[])])if(skill&&Object.keys(skill).length)assert(elements.includes(skill.element),`inline fixed element: ${enemy.id}/${skill.id}`);
// Source audit: gameplay producers cannot silently omit element at an impact.
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):e.name.endsWith('.gd')?[path.join(dir,e.name)]:[]);}
function argsAt(text,start){let depth=1,quote='',escape=false,current='',args=[];for(let i=start+1;i<text.length;i++){const c=text[i];if(quote){current+=c;if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote='';continue;}if(c==='"'||c==="'"){quote=c;current+=c;continue;}if('([{'.includes(c)){depth++;current+=c;continue;}if(')]}'.includes(c)){depth--;if(depth===0){if(current.trim())args.push(current.trim());return args;}current+=c;continue;}if(c===','&&depth===1){args.push(current.trim());current='';}else current+=c;}throw Error('Unclosed call');}
let impacts=0;for(const file of files(path.join(client,'src'))){const text=fs.readFileSync(file,'utf8');for(const match of text.matchAll(/\.take_damage\(/g)){const args=argsAt(text,match.index+match[0].length-1);assert(args.length>=6,`missing explicit attack element: ${path.relative(client,file)}:${text.slice(0,match.index).split('\n').length}`);impacts++;}for(const match of text.matchAll(/\.call\("take_damage",/g)){const args=argsAt(text,text.indexOf('(',match.index));assert(args.length>=7,`missing explicit element in dynamic call: ${file}`);impacts++;}}
const facade=fs.readFileSync(path.join(client,'src/services/CombatFormulaService.gd'),'utf8');assert(facade.includes('Core.resolve('));assert(!facade.includes('get_combat_element(attacker)'));assert(!facade.includes('enemy_framework_v2'),'formula must not branch by game mode/framework');
const kernel=fs.readFileSync(path.join(client,'src/services/CombatDamageService.gd'),'utf8');assert(!/\brandf\(|\bNode\b/.test(kernel.replace(/^\s*#.*$/gm,'')),'kernel has no RNG/actor dependency');
console.log(`PASS C240: ${skills.length} fixed-element skills, ${enemies.length} enemy definitions, seed guards and ${impacts} explicit impact paths; shared deterministic kernel`);
