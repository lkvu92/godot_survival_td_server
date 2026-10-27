import test from 'node:test';
import assert from 'node:assert/strict';
import {hash,newToken,seal,unseal,normalizeEmail,validateConfig,googleEmailAuthority} from '../src/security.js';
test('token encryption authenticates content and key; challenge storage never needs plaintext',()=>{
 const key='a'.repeat(64),token=newToken(),cipher=seal({token},key);
 assert.equal(token.length,43);assert.equal(hash(token).length,64);assert.ok(!cipher.includes(token));assert.equal(unseal(cipher,key).token,token);
 assert.throws(()=>unseal(cipher,'b'.repeat(64)));
});
test('email canonicalization preserves Gmail plus and dots and rejects header/address injection',()=>{
 assert.equal(normalizeEmail(' A.B+tag@GMAIL.com '),'a.b+tag@gmail.com');
 for(const bad of ['a@example.com\r\nBcc: b@example.com','a@example.com,b@other.com','"a@wrong.com"@real.com','<a@example.com>'])assert.throws(()=>normalizeEmail(bad));
});
test('production requires HTTPS and strong independent secret configuration',()=>{
 const env={ACCOUNT_IDENTITY_SECRET:'a'.repeat(64),ACCOUNT_IDENTITY_OUTBOX_KEY:'b'.repeat(64),PGHOST:'localhost',PGDATABASE:'nakama',PGUSER:'postgres',PGPASSWORD:'test',NAKAMA_HTTP_KEY:'test',SMTP_USER:'sender@gmail.com',SMTP_PASSWORD:'app-password',SMTP_FROM:'sender@gmail.com',ACCOUNT_IDENTITY_PUBLIC_URL:'http://identity.example',APP_ENVIRONMENT:'production'};
 assert.throws(()=>validateConfig(env));env.ACCOUNT_IDENTITY_PUBLIC_URL='https://identity.example';assert.equal(validateConfig(env).hostname,'identity.example');
 env.ACCOUNT_IDENTITY_SECRET='short';assert.throws(()=>validateConfig(env));
});
test('Google subject login does not make arbitrary third-party email authoritative',()=>{
 assert.equal(googleEmailAuthority({email:'user@gmail.com',email_verified:true}),true);
 assert.equal(googleEmailAuthority({email:'user@company.com',email_verified:true,hd:'company.com'}),true);
 assert.equal(googleEmailAuthority({email:'user@other.com',email_verified:true}),false);
 assert.equal(googleEmailAuthority({email:'user@gmail.com',email_verified:false}),false);
});
