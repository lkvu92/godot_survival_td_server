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
  const statuses={queued:'Yêu cầu đã được tiếp nhận.',processing:'Đang xử lý yêu cầu xóa của bạn.',retrying:'Yêu cầu đang được tiếp tục xử lý. Bạn có thể quay lại kiểm tra sau.',manual_review:'Yêu cầu cần được đội ngũ hỗ trợ kiểm tra.',completed:'Đã xóa tài khoản.'};
  $('status').textContent=(statuses[result.status]||'Đang kiểm tra yêu cầu.')+'\nMã biên nhận: '+value;
  $('status').dataset.state=result.status==='completed'?'success':'neutral';
  if(!['completed','manual_review'].includes(result.status))setTimeout(()=>showReceipt(value),5000);
  if(result.status==='manual_review')$('status').textContent+='\nLiên hệ admin@lkvustudio.com và cung cấp mã biên nhận.';
 }catch(error){$('status').dataset.state='error';$('status').textContent=error.message+'\nGiữ mã biên nhận để thử lại hoặc liên hệ hỗ trợ: '+value;}
}
if(['register_email','verify_legacy_email','delete_account'].includes(initial))$('purpose').value=initial;
function update(){
 const p=$('purpose').value, registration=p==='register_email', deletion=p==='delete_account';
 $('username-row').hidden=!registration;$('username').required=registration;
 $('confirm-password-row').hidden=!registration;$('password-again').required=registration;
 $('delete-warning').hidden=!deletion;$('confirmation').required=deletion;
 $('password').autocomplete=registration?'new-password':'current-password';
 $('password-label').textContent=registration?'Mật khẩu mới':'Mật khẩu hiện tại';
 $('password-hint').textContent=registration?'Ít nhất 8 ký tự, tối đa 72 byte.':'Nhập mật khẩu của tài khoản đã yêu cầu xác nhận.';
 $('submit').textContent=deletion?'XÓA VĨNH VIỄN':registration?'HOÀN TẤT ĐĂNG KÝ':'XÁC MINH EMAIL';
 $('submit').classList.toggle('destructive',deletion);
 $('category').textContent=deletion?'YÊU CẦU XÓA TÀI KHOẢN':registration?'KHỞI ĐẦU HÀNH TRÌNH':'BẢO VỆ TÀI KHOẢN';
 $('page-title').textContent=deletion?'Xác nhận xóa tài khoản':registration?'Bắt đầu hành trình':'Xác minh email của bạn';
 $('intro').textContent=deletion?'Kiểm tra kỹ thông tin trước khi xác nhận. Mở liên kết trong email chưa tự động xóa tài khoản.':registration?'Email của bạn đã sẵn sàng để xác nhận. Đặt tên đăng nhập và mật khẩu để hoàn tất tạo tài khoản.':'Nhập mật khẩu hiện tại để xác nhận email của tài khoản đang sử dụng.';
}
$('purpose').addEventListener('change',update);update();
if(receipt)showReceipt(receipt);
else if(!token||!['register_email','verify_legacy_email','delete_account'].includes(initial)){$('form').hidden=true;$('status').dataset.state='error';$('page-title').textContent='Liên kết chưa hợp lệ';$('intro').textContent='Hãy mở toàn bộ liên kết được gửi trong email xác nhận.';$('status').textContent='Liên kết thiếu mã xác nhận hoặc đã được mở lại. Mở lại link gốc trong email hoặc yêu cầu link mới.';$('submit').disabled=true;}
else checkLink();
async function checkLink(){
 $('status').textContent='Đang kiểm tra liên kết...';
 try{
  const response=await fetch('/account/link/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,purpose:initial})});
  const data=await response.json();
  if(!response.ok||!data.success)throw Error(data.message||'Không thể kiểm tra liên kết. Hãy mở lại link để thử lại.');
  linkReady=true;$('form').hidden=false;$('status').textContent='';
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
