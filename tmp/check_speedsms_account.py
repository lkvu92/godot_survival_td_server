from pathlib import Path
import json
import subprocess
import sys
from urllib.parse import urlencode

lines = (Path(__file__).resolve().parents[1] / 'nakama' / '.env.local').read_text(encoding='utf-8').splitlines()
values = dict(line.split('=', 1) for line in lines if '=' in line and not line.lstrip().startswith('#'))
token = values.get('SPEEDSMS_ACCESS_TOKEN', '').strip()
if not token or any(c in token for c in '\r\n:'):
    print('API access token missing or invalid; value withheld.')
    sys.exit(1)
if '--documented-get' in sys.argv:
    config = 'url = ' + json.dumps('https://api.speedsms.vn/index.php/user/info?' + urlencode({'access-token': token})) + '\n'
else:
    config = 'user = ' + json.dumps(token + ':x') + '\nurl = "https://api.speedsms.vn/index.php/user/info"\n'
result = subprocess.run(['curl.exe', '--silent', '--show-error', '--max-time', '20', '--config', '-', '--write-out', '\n%{http_code}'], input=config, text=True, capture_output=True)
body, _, status = result.stdout.rpartition('\n')
print('curl_exit:', result.returncode)
print('http_status:', status if status.isdigit() else 'unavailable')
try:
    data = json.loads(body)
except ValueError:
    data = {}
print('api_status:', data.get('status', 'unavailable'))
print('api_code:', data.get('code', 'unavailable'))
if result.returncode:
    print('curl_error_category:', 'DNS' if result.returncode == 6 else 'connection/TLS' if result.returncode in (7, 28, 35, 60) else 'other')
sys.exit(0 if result.returncode == 0 and status == '200' and data.get('status') == 'success' else 1)
