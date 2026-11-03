#!/usr/bin/env bash
set -euo pipefail
container=$(docker ps --filter label=com.docker.compose.service=account-identity --format '{{.ID}}')
[[ -n "$container" && "$container" != *$'\n'* ]] || { echo 'Expected exactly one running account-identity container'; exit 1; }
read -rsp 'Password for tester@lkvustudio.com: ' tester_password
printf '\n'
printf '%s' "$tester_password" | docker exec -i "$container" node --input-type=module -e '
import {randomUUID} from "node:crypto";
let password="";for await(const chunk of process.stdin)password+=chunk;
const env=process.env;
const url=new URL("/v2/rpc/account_identity_bridge",env.NAKAMA_URL||"http://nakama:7350");
url.searchParams.set("http_key",env.NAKAMA_HTTP_KEY);
const payload={action:"create",intent:randomUUID(),email:"tester@lkvustudio.com",username:"lkvu_tester",password,secret:env.ACCOUNT_IDENTITY_SECRET};
const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(JSON.stringify(payload)),signal:AbortSignal.timeout(20000)});
const data=await response.json();
if(!response.ok){console.error("Create failed: HTTP",response.status);process.exit(1);}
const result=JSON.parse(data.payload||"{}");
if(!result.success){console.error("Create failed:",result.reason||"unknown");process.exit(1);}
console.log("Created tester@lkvustudio.com using Nakama native password hashing.");
'
unset tester_password
