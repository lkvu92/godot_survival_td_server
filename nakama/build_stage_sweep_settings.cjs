// Emit reviewable system-settings seed input; never connect or publish automatically.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, 'data/modules/build/sweep_rpc.js'), 'utf8'), context);
const config = vm.runInContext('JSON.parse(JSON.stringify(SWEEP_DEFAULTS))', context);
const rows = [{module:'system', key:'stage_sweep', value_type:'json', value:JSON.stringify(config),
    description:'C144 campaign grading, ticket drops and durable sweep', is_active:true}];
const output = process.argv[2];
if (output) {
    fs.writeFileSync(output, JSON.stringify(rows,null,2)+'\n', {flag:'wx'});
    console.log('Created stage sweep settings input. Review before seeding and publishing.');
} else process.stdout.write(JSON.stringify(rows,null,2)+'\n');
