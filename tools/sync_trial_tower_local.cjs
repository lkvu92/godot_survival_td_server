// Sync only trial_tower to the explicitly named local development container.
const {execFileSync} = require('child_process');
const fs = require('fs'), path = require('path'), assert = require('assert');
const container = 'survival_td_local-nakama-1';
const docker = args => execFileSync('docker', args, {encoding:'utf8', stdio:['pipe','pipe','pipe']}).trim();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const keepAlive = setInterval(() => {}, 1000);
(async () => {
    const metadata = JSON.parse(docker(['inspect', container]))[0];
    assert.equal(metadata.Config.Labels['com.docker.compose.project'], 'survival_td_local');
    const binding = metadata.NetworkSettings.Ports['7350/tcp'][0];
    assert.equal(binding.HostIp, '127.0.0.1');
    const env = Object.fromEntries(metadata.Config.Env.map(entry => {
        const separator = entry.indexOf('='); return [entry.slice(0, separator), entry.slice(separator + 1)];
    }));
    assert(env.NAKAMA_HTTP_KEY, 'Local runtime HTTP key required');
    const base = 'http://127.0.0.1:' + binding.HostPort;
    docker(['restart', container]);
    let ready = false;
    for (let i=0; i<40; i++) {
        try { const response = await fetch(base+'/healthcheck', {signal:AbortSignal.timeout(1000)}); if(response.ok) {ready=true;break;} } catch (_) {}
        await sleep(500);
    }
    assert(ready, 'Local Nakama readiness');
    const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/trial_tower.json'), 'utf8'));
    const request = {table:'content_configs', rows:[{id:'trial_tower',payload:config,active:true}]};
    const rpc = async (name, payload) => {
        const response = await fetch(base+'/v2/rpc/'+name+'?http_key='+encodeURIComponent(env.NAKAMA_HTTP_KEY), {
            method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(JSON.stringify(payload)),signal:AbortSignal.timeout(15000)
        });
        assert(response.ok, 'Local RPC HTTP '+response.status);
        const wire = await response.json(); return JSON.parse(wire.payload);
    };
    const result = await rpc('seed_game_data', request);
    assert(result.success === true && result.inserted === 1, 'Tower-only seed failed');
    const unauthenticated = await rpc('get_trial_tower_status', {app_version:'999.0.0'});
    assert.equal(unauthenticated.code, 401, 'Status must reject unauthenticated access');
    console.log('PASS local tower sync: runtime restarted, only trial_tower seeded, RPC registered and auth enforced');
})().catch(() => { console.error('Local tower sync failed; inspect local Nakama status. Credentials were not logged.'); process.exitCode=1; }).finally(() => clearInterval(keepAlive));
