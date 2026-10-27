// C232 v1.1: no external assets, tracking or user-supplied markup in transactional mail.
export const mailPalette = Object.freeze({
  background: '#EDF3EF', header: '#103D34', headerText: '#FAF8F0', gold: '#D9BD79',
  surface: '#FAF8F0', text: '#173C34', muted: '#496257', border: '#CBD8CE',
  button: '#176B51', buttonText: '#FFFFFF', link: '#146347',
  warningSurface: '#FFF0EA', warningText: '#8B332B', noticeSurface: '#E8F0E8'
});

const messages = {
  register_email: {
    subject: 'Thông Thiên Lộ — Xác nhận email đăng ký', category: 'KHỞI ĐẦU HÀNH TRÌNH',
    title: 'Xác nhận email của bạn', action: 'XÁC NHẬN EMAIL',
    preheader: 'Xác nhận địa chỉ email để tạo tài khoản Thông Thiên Lộ. Liên kết có hiệu lực tối đa 15 phút.',
    intro: 'Bạn vừa yêu cầu tạo tài khoản Thông Thiên Lộ bằng địa chỉ email này.',
    detail: 'Nhấn nút bên dưới để xác nhận email, sau đó tự đặt tên đăng nhập và mật khẩu trên trang bảo mật của trò chơi.',
    note: 'Tài khoản chỉ được tạo sau khi bạn hoàn tất xác nhận. Mở liên kết chưa tự động tạo tài khoản.'
  },
  verify_legacy_email: {
    subject: 'Thông Thiên Lộ — Xác minh email tài khoản', category: 'BẢO VỆ TÀI KHOẢN',
    title: 'Xác minh email tài khoản', action: 'XÁC MINH EMAIL',
    preheader: 'Hoàn tất xác minh email cho tài khoản đang sử dụng. Bạn cần mật khẩu hiện tại để xác nhận.',
    intro: 'Bạn đã yêu cầu xác minh địa chỉ email cho tài khoản Thông Thiên Lộ đang sử dụng.',
    detail: 'Mở trang xác nhận và nhập mật khẩu hiện tại của tài khoản. Sau khi hoàn tất, quay lại trò chơi để tiếp tục.',
    note: 'Liên kết này chỉ xác minh email. Nó không đặt lại mật khẩu hoặc tạo một tài khoản khác.'
  },
  delete_account: {
    subject: 'Thông Thiên Lộ — Xác nhận yêu cầu xóa tài khoản', category: 'YÊU CẦU XÓA TÀI KHOẢN',
    title: 'Kiểm tra yêu cầu xóa', action: 'XEM YÊU CẦU XÓA',
    preheader: 'Yêu cầu xóa chỉ được tiếp nhận sau khi bạn xác minh và xác nhận bước cuối trên trang bảo mật.',
    intro: 'Tài khoản Thông Thiên Lộ của bạn vừa có yêu cầu xóa tài khoản.',
    detail: 'Nếu đây là yêu cầu của bạn, mở trang bên dưới, nhập mật khẩu hiện tại và chủ động xác nhận “Xóa vĩnh viễn”.',
    note: 'Xóa tài khoản áp dụng cho nhân vật, vật phẩm và tiến trình trên TẤT CẢ máy chủ, không thể hoàn tác. Việc xóa không tự động hoàn tiền hoặc hủy gói đăng ký trên Google Play.'
  }
};

const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function renderAccountMail({purpose, actionUrl, publicOrigin, expiresAt, allowLocalHttp = false}) {
  const copy = messages[purpose];
  if (!copy) throw Error('Unsupported mail purpose');
  const url = new URL(actionUrl), origin = new URL(publicOrigin);
  const fragment = new URLSearchParams(url.hash.slice(1));
  if (url.origin !== origin.origin || url.pathname !== '/account/confirm' || url.search || url.username || url.password ||
      (url.protocol !== 'https:' && !(allowLocalHttp && url.protocol === 'http:')) ||
      fragment.get('purpose') !== purpose || !fragment.get('token') || [...fragment.keys()].some(k => !['purpose','token'].includes(k))) {
    throw Error('Invalid mail action URL');
  }
  const expiry = new Date(expiresAt);
  if (!Number.isFinite(expiry.getTime())) throw Error('Invalid mail expiry');
  const until = new Intl.DateTimeFormat('vi-VN', {timeZone:'Asia/Ho_Chi_Minh', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23'}).format(expiry) + ' (GMT+7)';
  const p = mailPalette, href = escape(url.href), deletion = purpose === 'delete_account';
  const privacy = escape(new URL('/account/privacy-policy/', origin).href);
  const text = [
    'THÔNG THIÊN LỘ', copy.title, '', copy.intro, copy.detail, '',
    copy.action + ':', url.href, '', 'Hiệu lực đến: ' + until + '. Liên kết dùng một lần, tối đa 15 phút kể từ lúc yêu cầu.',
    '', copy.note, deletion ? 'Mở liên kết trong email chưa tự động xóa tài khoản.' : '', '',
    'Nếu bạn không yêu cầu, hãy bỏ qua thư này. Không chia sẻ liên kết xác nhận.',
    'Chúng tôi không yêu cầu bạn gửi mật khẩu qua email.', '',
    'Hỗ trợ: admin@lkvustudio.com', 'Chính sách quyền riêng tư: ' + new URL('/account/privacy-policy/', origin).href
  ].filter(line => line !== undefined).join('\n');
  const html = `<!doctype html>
<html lang="vi" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${escape(copy.subject)}</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style>body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}table{border-collapse:collapse!important}a:focus{outline:3px solid #176B51;outline-offset:4px}@media only screen and (max-width:620px){.outer-pad{padding:16px 10px!important}.content-pad{padding:28px 22px!important}.brand-pad{padding:30px 22px!important}.mail-title{font-size:28px!important;line-height:36px!important}.mobile-button{width:100%!important}.foot-pad{padding:22px!important}}</style></head>
<body style="margin:0;padding:0;background-color:${p.background};color:${p.text};font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;">
<div aria-hidden="true" style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escape(copy.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${p.background}" style="width:100%;background-color:${p.background};"><tr><td class="outer-pad" align="center" style="padding:40px 16px;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border:1px solid ${p.border};background-color:${p.surface};">
<tr><td height="4" bgcolor="${p.gold}" style="height:4px;line-height:4px;font-size:1px;background-color:${p.gold};">&nbsp;</td></tr>
<tr><td class="brand-pad" align="center" bgcolor="${p.header}" style="padding:32px 36px 30px;background-color:${p.header};">
<p aria-hidden="true" style="margin:0 0 14px;color:${p.gold};font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:26px;">— ◈ —</p>
<p style="margin:0;color:${p.headerText};font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:40px;font-weight:bold;letter-spacing:1px;">THÔNG THIÊN LỘ</p>
<p style="margin:10px 0 0;color:${p.gold};font-size:12px;line-height:20px;letter-spacing:2px;font-weight:bold;">${escape(copy.category)}</p>
</td></tr>
<tr><td class="content-pad" bgcolor="${p.surface}" style="padding:36px 40px 32px;background-color:${p.surface};">
<h1 class="mail-title" style="margin:0 0 20px;color:${p.text};font-family:Georgia,'Times New Roman',serif;font-size:32px;line-height:42px;font-weight:bold;">${escape(copy.title)}</h1>
<p style="margin:0 0 14px;color:${p.text};font-size:16px;line-height:27px;">${escape(copy.intro)}</p>
<p style="margin:0 0 26px;color:${p.text};font-size:16px;line-height:27px;">${escape(copy.detail)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:0 0 22px;">
<!--[if mso]><v:roundrect href="${href}" style="height:54px;v-text-anchor:middle;width:310px;" arcsize="8%" stroke="f" fillcolor="${p.button}"><w:anchorlock xmlns:w="urn:schemas-microsoft-com:office:word"/><center style="color:${p.buttonText};font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">${escape(copy.action)}</center></v:roundrect><![endif]-->
<!--[if !mso]><!--><table class="mobile-button" role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:310px;max-width:100%;"><tr><td align="center" bgcolor="${p.button}" style="background-color:${p.button};border-radius:5px;"><a href="${href}" style="display:block;padding:17px 20px;border:1px solid ${p.button};border-radius:5px;color:${p.buttonText};font-family:Arial,sans-serif;font-size:15px;line-height:20px;font-weight:bold;text-decoration:none;text-align:center;">${escape(copy.action)}</a></td></tr></table><!--<![endif]-->
</td></tr></table>
<p style="margin:0 0 24px;text-align:center;color:${p.muted};font-size:13px;line-height:22px;"><strong>Hiệu lực đến ${escape(until)}</strong><br>Liên kết dùng một lần · tối đa 15 phút kể từ lúc yêu cầu</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${deletion?p.warningSurface:p.noticeSurface}" style="padding:17px 18px;border-left:3px solid ${deletion?p.warningText:p.button};background-color:${deletion?p.warningSurface:p.noticeSurface};">
<p style="margin:0;color:${deletion?p.warningText:p.text};font-size:14px;line-height:24px;">${escape(copy.note)}${deletion?'<br><strong>Mở liên kết chưa tự động xóa tài khoản.</strong>':''}</p>
</td></tr></table>
<p style="margin:26px 0 8px;color:${p.muted};font-size:13px;line-height:22px;">Nếu nút không hoạt động, sao chép toàn bộ liên kết này vào trình duyệt:</p>
<p style="margin:0;word-break:break-all;overflow-wrap:anywhere;font-size:12px;line-height:21px;"><a href="${href}" style="color:${p.link};text-decoration:underline;word-break:break-all;">${href}</a></p>
</td></tr>
<tr><td class="foot-pad" bgcolor="${p.noticeSurface}" style="padding:24px 40px;border-top:1px solid ${p.border};background-color:${p.noticeSurface};">
<p style="margin:0 0 12px;color:${p.muted};font-size:13px;line-height:22px;">Nếu bạn không yêu cầu, hãy bỏ qua thư này. Không chia sẻ liên kết xác nhận. Chúng tôi không yêu cầu bạn gửi mật khẩu qua email.</p>
<p style="margin:0 0 10px;color:${p.text};font-size:13px;line-height:22px;">Cần hỗ trợ? <a href="mailto:admin@lkvustudio.com" style="color:${p.link};font-weight:bold;text-decoration:underline;">admin@lkvustudio.com</a></p>
<p style="margin:0;color:${p.muted};font-size:12px;line-height:21px;">Thông báo tài khoản tự động · Thông Thiên Lộ<br><a href="${privacy}" style="color:${p.link};text-decoration:underline;">Chính sách quyền riêng tư</a></p>
</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
  return {subject:copy.subject, text, html};
}
