// Generate a seed_game_data settings payload; this script never publishes it.
const fs=require('fs'),path=require('path');
const settings=['feature_unlocks','realm_milestones'].map(key=>({module:'system',key,value_type:'json',
    value:JSON.stringify(JSON.parse(fs.readFileSync(path.join(__dirname,'../data',key+'.json'),'utf8'))),
    description:'C176 '+key}));
module.exports={settings};
if(require.main===module){
    const output=process.argv[2];
    if(output)fs.writeFileSync(output,JSON.stringify(settings,null,2)+'\n',{flag:'wx'});
    else process.stdout.write(JSON.stringify(settings,null,2)+'\n');
}
