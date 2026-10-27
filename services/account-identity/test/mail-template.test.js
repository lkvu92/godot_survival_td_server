import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {mailPalette as p,renderAccountMail} from '../src/mail-template.js';
const origin='https://api.lkvustudio.com';
const render=(purpose='register_email',extra={})=>renderAccountMail({purpose,publicOrigin:origin,actionUrl:origin+'/account/confirm#token=preview-only-not-valid&purpose='+purpose,expiresAt:'2026-10-28T05:15:00Z',...extra});
function luminance(hex){const c=hex.slice(1).match(/../g).map(s=>parseInt(s,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2];}
const contrast=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
test('all authored mail text pairs meet WCAG AA normal-text contrast',()=>{
 for(const [a,b] of [[p.headerText,p.header],[p.gold,p.header],[p.text,p.surface],[p.muted,p.surface],[p.link,p.surface],[p.buttonText,p.button],[p.text,p.noticeSurface],[p.muted,p.noticeSurface],[p.link,p.noticeSurface],[p.warningText,p.warningSurface]]){
  assert.ok(contrast(a,b)>=4.5,`${a} on ${b}: ${contrast(a,b).toFixed(2)}:1`);
 }
});
test('three mail purposes have HTML/plain-text parity, actual expiry and safe non-destructive email CTA',()=>{
 const subjects=new Set();
 for(const purpose of ['register_email','verify_legacy_email','delete_account']) {
  const mail=render(purpose);subjects.add(mail.subject);
  assert.ok(mail.html.includes('role="presentation"')&&mail.html.includes('<!--[if mso]>'));
  assert.ok(mail.html.includes('v:roundrect')&&mail.html.includes('max-width:600px'));
  assert.ok(mail.html.includes('GMT+7')&&mail.text.includes('GMT+7'));
  assert.ok(mail.text.includes('12:15')&&mail.text.includes('28/10/2026'));
  assert.ok(mail.html.includes('&amp;purpose=')&&!mail.html.includes('&purpose='));
  assert.ok(mail.text.includes('admin@lkvustudio.com'));
  assert.ok(!/<(?:script|iframe|img|form)\b/i.test(mail.html));
  assert.ok(!/<link\b/i.test(mail.html));
  assert.ok(Buffer.byteLength(mail.html)<40000,'Mail HTML stays well below clipping-sized payloads');
  if(purpose==='delete_account'){
   assert.ok(mail.html.includes('XEM YÊU CẦU XÓA')&&mail.text.includes('TẤT CẢ'));
   assert.ok(mail.html.includes('Mở liên kết chưa tự động xóa tài khoản.'));
  }
 }
 assert.equal(subjects.size,3);
});
test('mail renderer rejects external links, mismatched purpose, unsafe protocol and injected markup',()=>{
 for(const actionUrl of ['https://evil.example/account/confirm#token=x&purpose=register_email','javascript:alert(1)',origin+'/account/confirm#token=x&purpose=delete_account',origin+'/account/confirm?tracking=1#token=x&purpose=register_email'])assert.throws(()=>render('register_email',{actionUrl}));
 assert.throws(()=>render('unknown'));assert.throws(()=>render('register_email',{expiresAt:'bad'}));
 const injection=origin+'/account/confirm#token='+encodeURIComponent('\"><script>alert(1)</script>')+'&purpose=register_email';
 const safe=render('register_email',{actionUrl:injection});assert.ok(!safe.html.includes('<script>'));
});
test('confirmation page shares jade/ivory brand colors and readable destructive controls',async()=>{
 const css=await readFile(new URL('../public/style.css',import.meta.url),'utf8');
 for(const [key,color] of Object.entries({'--jade-deep':p.header,'--jade':p.button,'--gold':p.gold,'--paper':p.surface,'--ink':p.text,'--muted':p.muted,'--link':p.link,'--danger':p.warningText,'--danger-bg':p.warningSurface}))assert.ok(css.includes(key+':'+color),key);
 assert.ok(contrast('#FFFFFF',p.warningText)>=4.5);
 assert.ok(contrast('#586C61','#FFFFFF')>=4.5);
});
