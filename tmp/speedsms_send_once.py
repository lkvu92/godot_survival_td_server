"""Send exactly one test SMS; phone from stdin, no credentials or OTP in output."""
from pathlib import Path
import json
import re
import secrets
import subprocess
import sys
from urllib.parse import urlencode

lines = (Path(__file__).resolve().parents[1] / 'nakama' / '.env.local').read_text(encoding='utf-8').splitlines()
env = dict(line.split('=', 1) for line in lines if '=' in line and not line.lstrip().startswith('#'))
phone = sys.stdin.readline().strip().replace(' ', '').replace('-', '')
phone = re.sub(r'^\+84', '0', phone)
token = env.get('SPEEDSMS_ACCESS_TOKEN', '').strip()
sms_type = env.get('SPEEDSMS_SMS_TYPE', '4').strip() or '4'
sender = env.get('SPEEDSMS_SENDER', '').strip()
if '--default-sender-test' in sys.argv and not sender:
    sender = bytes([86, 101, 114, 105, 102, 121]).decode()
template = env.get('SPEEDSMS_CONTENT', '').strip()
if not re.fullmatch(r'0[35789]\d{8}', phone):
    print('Invalid Vietnamese mobile number; no request sent.')
    sys.exit(1)
if not token or any(c in token for c in '\r\n:') or sms_type not in ('2', '3', '4', '5', '6') or (sms_type in ('3', '5') and not sender) or '{pin_code}' not in template:
    print('Missing or invalid SpeedSMS configuration; no request sent.')
    sys.exit(1)
pin = f'{secrets.randbelow(1000000):06d}'
payload = {'to': [phone], 'content': template.replace('{pin_code}', pin), 'sms_type': int(sms_type), 'sender': sender}
if sms_type == '4' and not sender:
    del payload['sender']
if '--documented-get' in sys.argv:
    query = {'access-token': token, 'to': '84' + phone[1:], 'content': payload['content'], 'type': sms_type, 'sender': sender}
    config = 'url = ' + json.dumps('https://api.speedsms.vn/index.php/sms/send?' + urlencode(query)) + '\n'
else:
    config = '\n'.join(['url = "https://api.speedsms.vn/index.php/sms/send"', 'user = ' + json.dumps(token + ':x'), 'header = "Content-Type: application/json"', 'request = "POST"', 'data = ' + json.dumps(json.dumps(payload, ensure_ascii=True)), ''])
result = subprocess.run(['curl.exe', '--silent', '--show-error', '--max-time', '20', '--config', '-', '--write-out', '\n%{http_code}'], input=config, text=True, capture_output=True)
body, _, http = result.stdout.rpartition('\n')
try:
    data = json.loads(body)
except ValueError:
    data = {}
info = data.get('data') if isinstance(data.get('data'), dict) else {}
invalid = info.get('invalidPhone') if isinstance(info.get('invalidPhone'), list) else None
success = result.returncode == 0 and http == '200' and data.get('status') == 'success' and str(data.get('code')) == '00' and isinstance(info.get('totalSMS'), (int, float)) and info['totalSMS'] > 0 and invalid == []
print('curl_exit:', result.returncode)
print('http_status:', http if http.isdigit() else 'unavailable')
print('api_status:', data.get('status', 'unavailable'))
print('api_code:', data.get('code', 'unavailable'))
if not success:
    message = str(data.get('message', data.get('error', 'unavailable')))[:300]
    for sensitive in [token, phone, pin, sender]:
        if sensitive:
            message = message.replace(sensitive, '[redacted]')
    message = re.sub(r'(?<!\d)(?:\+?84|0)\d{8,10}(?!\d)', '[redacted-phone]', message)
    print('api_message:', message)
print('provider_accepted:', success)
print('delivery_confirmed: false')
sys.exit(0 if success else 1)
