import json
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

received = {}
class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        received['payload'] = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        received['auth'] = self.headers.get('Authorization', '')
        received['content_type'] = self.headers.get('Content-Type', '')
        self.send_response(200)
        self.end_headers()
    def log_message(self, *_args):
        pass

server = HTTPServer(('127.0.0.1', 0), Handler)
thread = threading.Thread(target=server.handle_request)
thread.start()
payload = {'to':['0900000000'],'content':'Fixture 123456','sms_type':4,'sender':'fixture'}
config = '\n'.join(['url = "http://127.0.0.1:%d/"' % server.server_port, 'user = "fixture:x"', 'header = "Content-Type: application/json"', 'request = "POST"', 'data = ' + json.dumps(json.dumps(payload)), ''])
result = subprocess.run(['curl.exe','--silent','--max-time','5','--config','-'],input=config,text=True,capture_output=True)
thread.join(timeout=6)
server.server_close()
assert result.returncode == 0 and received.get('payload') == payload
assert received['auth'].startswith('Basic ') and received['content_type'] == 'application/json'
print('PASS local curl payload serialization and Basic auth fixture; no provider request.')
