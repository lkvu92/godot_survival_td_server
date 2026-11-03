const $=id=>document.getElementById(id);
const fragment=new URLSearchParams(location.hash.slice(1));
let token=fragment.get('token')||'';
let linkReady=false;
$('form').hidden=true;
const initial=fragment.get('purpose');
const receipt=fragment.get('receipt');
history.replaceState(null,'',location.pathname);
async function showReceipt(value) {
 $('form').hidden=true;
 $('page-title').textContent='Trạng thái yêu cầu xóa';
 $('category').textContent='QUẢN LÝ TÀI KHOẢN';
 $('intro').textContent='Tra cứu yêu cầu xóa tài khoản. Bạn có thể lưu URL trang này để xem lại; không cần đăng nhập game.';
 history.replaceState(null,'',location.pathname+'#receipt='+encodeURIComponent(value));
 try {
  const response=await fetch('/account/deletion/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({receipt:value})});
  const result=await response.json();
  if(!response.ok||!result.success)throw Error('Không tìm thấy biên nhận hoặc dịch vụ chưa sẵn sàng.');
  const statuses={queued:'Yêu cầu đã được tiếp nhận.',processing:'Đang xử lý yêu cầu xóa của bạn.',retrying:'Yêu cầu đang được tiếp tục xử lý. Bạn có thể quay lại kiểm tra sau.',manual_review:'Yêu cầu cần được đội ngũ hỗ trợ kiểm tra.',soft_deleted:'Tài khoản đang trong thời gian chờ xóa.',cancelled:'Đã khôi phục tài khoản; yêu cầu xóa đã hủy.',purge_pending:'Đang chuẩn bị xóa dữ liệu vận hành.',completed:'Đã xóa dữ liệu vận hành. Hồ sơ phải lưu được giữ riêng.'};
  const state=result.lifecycle_state||result.status;
  Object.assign(statuses,{archive_pending:'Đã hết hạn khôi phục. Đang xử lý lưu trữ; thông tin đăng ký chưa được giải phóng.',archive_failed:'Đã hết hạn khôi phục. Quá trình archive đang chờ xử lý; thông tin đăng ký chưa được giải phóng.',archived:'Tài khoản đã được lưu trữ và không thể khôi phục. Thông tin đăng ký đã được giải phóng.',gameplay_purged:'Đã dọn dữ liệu trò chơi của tài khoản cũ. Một số hồ sơ tài khoản và hồ sơ cần lưu được giữ theo chính sách riêng.',gameplay_review:'Tài khoản đã lưu trữ. Việc dọn dữ liệu trò chơi cần được hỗ trợ kiểm tra.'});
  $('status').textContent=(statuses[state]||'Đang kiểm tra yêu cầu.')+(result.restore_until?'\nHạn khôi phục: '+new Date(result.restore_until).toLocaleString('vi-VN'):'')+(result.gameplay_purge_at?'\nLịch dọn dữ liệu trò chơi: '+new Date(result.gameplay_purge_at).toLocaleString('vi-VN'):'')+'\nMã biên nhận: '+value;
  $('status').dataset.state=result.status==='completed'?'success':'neutral';
  if(!['completed','manual_review','cancelled','soft_deleted','archived','gameplay_purged','gameplay_review'].includes(state))setTimeout(()=>showReceipt(value),5000);
  $('recovery').hidden=!result.restore_eligible;
  if(result.restore_eligible){$('recovery').hidden=false;$('recovery-submit').disabled=false;}
  if(result.status==='manual_review')$('status').textContent+='\nLiên hệ admin@lkvustudio.com và cung cấp mã biên nhận.';
 }catch(error){$('status').dataset.state='error';$('status').textContent=error.message+'\nGiữ mã biên nhận để thử lại hoặc liên hệ hỗ trợ: '+value;}
}
if(['register_email','verify_legacy_email','delete_account','restore_account'].includes(initial))$('purpose').value=initial;
function update(){
 const p=$('purpose').value, registration=p==='register_email', deletion=p==='delete_account';
 $('username-row').hidden=!registration;$('username').required=registration;
 $('confirm-password-row').hidden=!registration;$('password-again').required=registration;
 $('delete-warning').hidden=!deletion;$('confirmation').required=deletion;
 $('password').autocomplete=registration?'new-password':'current-password';
 $('password-label').textContent=registration?'Mật khẩu mới':'Mật khẩu hiện tại';
 $('password-hint').textContent=registration?'Ít nhất 8 ký tự, tối đa 72 byte.':'Nhập mật khẩu của tài khoản đã yêu cầu xác nhận.';
 $('submit').textContent=deletion?'XÁC NHẬN CHỜ XÓA':p==='restore_account'?'KHÔI PHỤC TÀI KHOẢN':registration?'HOÀN TẤT ĐĂNG KÝ':'XÁC MINH EMAIL';
 $('submit').classList.toggle('destructive',deletion);
 $('category').textContent=deletion?'YÊU CẦU XÓA TÀI KHOẢN':registration?'KHỞI ĐẦU HÀNH TRÌNH':'BẢO VỆ TÀI KHOẢN';
 $('page-title').textContent=deletion?'Xác nhận yêu cầu xóa':p==='restore_account'?'Khôi phục tài khoản':registration?'Bắt đầu hành trình':'Xác minh email của bạn';
 $('intro').textContent=deletion?'Kiểm tra kỹ thông tin trước khi xác nhận. Mở liên kết trong email chưa tự động xóa tài khoản.':registration?'Email của bạn đã sẵn sàng để xác nhận. Đặt tên đăng nhập và mật khẩu để hoàn tất tạo tài khoản.':'Nhập mật khẩu hiện tại để xác nhận email của tài khoản đang sử dụng.';
 if(p==='restore_account')$('intro').textContent='Đạo hữu nhập mật khẩu hiện tại để hủy yêu cầu xóa và khôi phục tài khoản trước hạn. Sau khi hoàn tất, hãy đăng nhập lại trò chơi.';
}
$('purpose').addEventListener('change',update);update();
$('recovery').addEventListener('submit',async e=>{
 e.preventDefault();$('recovery-submit').disabled=true;
 try{const response=await fetch('/account/restoration/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('recovery-email').value})});const data=await response.json();$('status').textContent=data.message||'Đạo hữu vui lòng thử lại sau.';}catch{$('status').textContent='Chưa thể kết nối. Đạo hữu vui lòng thử lại.';}
 setTimeout(()=>{$('recovery-submit').disabled=false;},60000);
});
if(fragment.get('restore')==='1'){$('recovery').hidden=false;$('form').hidden=true;$('page-title').textContent='Khôi phục tài khoản';$('intro').textContent='Đạo hữu nhập email để nhận liên kết khôi phục trước hạn chờ xóa. Cần mật khẩu hiện tại để hoàn tất.';}
else if(receipt)showReceipt(receipt);
else if(!token||!['register_email','verify_legacy_email','delete_account','restore_account'].includes(initial)){$('form').hidden=true;$('status').dataset.state='error';$('page-title').textContent='Liên kết chưa hợp lệ';$('intro').textContent='Hãy mở toàn bộ liên kết được gửi trong email xác nhận.';$('status').textContent='Liên kết thiếu mã xác nhận hoặc đã được mở lại. Mở lại link gốc trong email hoặc yêu cầu link mới.';$('submit').disabled=true;}
else checkLink();
async function checkLink(){
 $('status').textContent='Đang kiểm tra liên kết...';
 try{
  const response=await fetch('/account/link/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,purpose:initial})});
  const data=await response.json();
  if(!response.ok||!data.success)throw Error(data.message||'Không thể kiểm tra liên kết. Hãy mở lại link để thử lại.');
  linkReady=true;$('form').hidden=false;$('status').textContent='';
  if(initial==='delete_account'&&data.deletion_policy)$('intro').textContent='Đạo hữu đang yêu cầu xóa tài khoản. Sau khi xác nhận, tài khoản tạm ngừng hoạt động và có '+data.deletion_policy.soft_delete_days+' ngày để khôi phục. Hết hạn không thể khôi phục. Email và số điện thoại được giải phóng khi hoàn tất lưu trữ; dữ liệu trò chơi được dọn sau '+data.deletion_policy.gameplay_purge_calendar_months+' tháng lịch từ lúc lưu trữ. Hồ sơ cần lưu được giữ theo chính sách riêng. Hạn chính xác sẽ ghi trên biên nhận.';
 }catch(error){
  $('form').hidden=true;$('page-title').textContent='Không thể sử dụng liên kết';
  $('intro').textContent='Chỉ liên kết còn hiệu lực mới có thể tiếp tục xác nhận.';
  $('status').dataset.state='error';$('status').textContent=error.message;
 }
}
$('form').addEventListener('submit',async e=>{
 e.preventDefault();if(!linkReady)return;const purpose=initial;
 if(purpose==='register_email'&&$('password').value!==$('password-again').value){$('status').dataset.state='error';$('status').textContent='Hai mật khẩu chưa khớp.';return;}
 $('submit').disabled=true;$('status').dataset.state='neutral';$('status').textContent='Đang xử lý...';
 try{const response=await fetch(purpose==='register_email'?'/account/registration/complete':'/account/action/complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,purpose,username:$('username').value,password:$('password').value,confirmation:$('confirmation').value})});
 const data=await response.json();if(!response.ok||!data.success){
  if(['LINK_EXPIRED','ACCOUNT_EXISTS','IDENTITY_CHANGED'].includes(data.code)){linkReady=false;$('form').hidden=true;}
  throw Error(data.message||'Yêu cầu chưa hoàn tất.');
 }
 $('password').value='';$('password-again').value='';$('status').dataset.state='success';$('status').textContent=data.message;
 if(data.receipt)await showReceipt(data.receipt);
 token='';$('form').hidden=true;
 }catch(error){$('status').dataset.state='error';$('status').textContent=error.message;$('submit').disabled=false;}
});
