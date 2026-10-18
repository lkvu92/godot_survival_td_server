// Generates an explicit System draft input. It never connects to a database.
const fs=require('fs'),path=require('path');
const config=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/leaderboard_rewards.json'),'utf8'));
const settings=[{module:'system',key:'leaderboard_rewards',value_type:'json',value:JSON.stringify(config),description:'C135 weekly top500 rewards; rules frozen per week',is_active:true}];
const output=JSON.stringify(settings,null,2)+'\n';
if(require.main===module){if(process.argv[2]){const file=path.resolve(process.argv[2]);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,output,'utf8');process.stdout.write('Wrote weekly leaderboard settings draft\n');}else process.stdout.write(output);}
module.exports={config,settings};
