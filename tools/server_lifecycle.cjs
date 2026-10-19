// Local-only C143 admin client. Authentication is supplied through C143_ADMIN_TOKEN.
const {spawnSync}=require('node:child_process');
async function main(){
  const args=process.argv.slice(2),get=(key,fallback='')=>{const i=args.indexOf('--'+key);return i<0?fallback:args[i+1];};
  const action=get('action');
  if(action==='recover-offline') {
    const job=get('job-id');
    if(!args.includes('--runtime-stopped')||!/^[a-f0-9-]{36}$/.test(job))throw Error('Stop ALL runtime nodes first and supply --runtime-stopped --job-id UUID');
    const sql=`UPDATE server_lifecycle_jobs SET status='blocked',lease_token=NULL,lease_until=NULL,error='Offline operator recovery; resume exact manifest'
      WHERE id='${job}'::UUID AND status<>'succeeded' RETURNING id,status,cursor;`;
    const result=spawnSync(get('psql','psql'),['-X','-q','-h','127.0.0.1','-p',get('port','5432'),'-U',get('user','postgres'),'-d',get('database','nakama'),'-v','ON_ERROR_STOP=1','-f','-'],{input:sql,encoding:'utf8'});
    if(result.error||result.status!==0)throw Error(result.error?.message||result.stderr);
    process.stdout.write(result.stdout);return;
  }
  if(!['list','inspect','create','disable','enable','update','expire_pending','plan','execute','job','job_step','financial_list','financial_retry'].includes(action))throw Error('Invalid --action');
  const url=new URL(get('url','http://127.0.0.1:7350'));
  if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.protocol!=='http:'||url.username||url.password)throw Error('Local HTTP endpoint required; production is not enabled');
  const token=process.env.C143_ADMIN_TOKEN;if(!token)throw Error('Set C143_ADMIN_TOKEN to an authenticated admin session JWT');
  const payload=JSON.parse(get('payload','{}'));
  const response=await fetch(url.origin+'/v2/rpc/admin_server_'+action,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(JSON.stringify(payload)),signal:AbortSignal.timeout(30000)});
  const envelope=await response.json();const body=envelope.payload?JSON.parse(envelope.payload):envelope;
  console.log(JSON.stringify(body,null,2));if(!response.ok||body.success!==true)process.exitCode=1;
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
