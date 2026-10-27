import {createHash, randomBytes, createCipheriv, createDecipheriv} from 'node:crypto';

export const hash = value => createHash('sha256').update(String(value)).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');
export const googleEmailAuthority=claims=>claims.email_verified===true && (String(claims.email||'').toLowerCase().endsWith('@gmail.com')||!!claims.hd);
export function normalizeEmail(value) {
  const email=String(value??'').trim().toLowerCase();
  if(email.length>254||! /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(email))throw new Error('INVALID_EMAIL');
  const local=email.split('@')[0];
  if(local.length>64||local.startsWith('.')||local.endsWith('.')||local.includes('..'))throw new Error('INVALID_EMAIL');
  return email;
}
export function seal(value,key) {
  const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);
  const data=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64url');
}
export function unseal(value,key) {
  const data=Buffer.from(value,'base64url'),cipher=createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),data.subarray(0,12));
  cipher.setAuthTag(data.subarray(12,28));
  return JSON.parse(Buffer.concat([cipher.update(data.subarray(28)),cipher.final()]).toString());
}
export function validateConfig(env) {
  for(const key of ['ACCOUNT_IDENTITY_SECRET','ACCOUNT_IDENTITY_OUTBOX_KEY']) {
    if(!/^[a-f0-9]{64}$/i.test(env[key]||''))throw new Error('Missing/invalid '+key+' (64 hex required)');
  }
  if(env.ACCOUNT_IDENTITY_SECRET===env.ACCOUNT_IDENTITY_OUTBOX_KEY)throw new Error('Independent identity secrets required');
  for(const key of ['PGHOST','PGDATABASE','PGUSER','PGPASSWORD','NAKAMA_HTTP_KEY','SMTP_USER','SMTP_PASSWORD','SMTP_FROM']) {
    if(!env[key]||env[key].includes('\n')||env[key].includes('\r'))throw new Error('Missing/invalid '+key);
  }
  const url=new URL(env.ACCOUNT_IDENTITY_PUBLIC_URL);
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('Invalid public URL');
  if(url.protocol!=='https:' && !(env.APP_ENVIRONMENT==='develop'&&url.protocol==='http:'))throw new Error('Public HTTPS required');
  if(!['465','587'].includes(env.SMTP_PORT||'587'))throw new Error('SMTP TLS port required');
  normalizeEmail(env.SMTP_FROM);normalizeEmail(env.SMTP_USER);
  return url;
}
