import importlib.util
import io
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch
import urllib.error

spec = importlib.util.spec_from_file_location("mail_tick", Path(__file__).resolve().parents[1] / "nakama/mail_tick.py")
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class MailWorkerTests(unittest.TestCase):
    def test_tick_uses_runtime_key_gateway_and_wrapped_payload(self):
        result = {"success": True, "delivered": 2, "purged": 1}
        response = io.BytesIO(json.dumps({"payload": json.dumps(result)}).encode())
        with patch.dict(os.environ, {"NAKAMA_URL": "http://mail-test:7350/", "NAKAMA_HTTP_KEY": "test key"}), patch.object(worker.urllib.request, "urlopen", return_value=response) as request:
            self.assertEqual(worker.tick(), result)
            req = request.call_args.args[0]
            self.assertEqual(req.full_url, "http://mail-test:7350/v2/rpc/mail_tick?http_key=test+key")
            self.assertEqual(json.loads(req.data), "{}")
            self.assertEqual(req.method, "POST")

    def test_network_failure_never_logs_key_bearing_url(self):
        with patch.dict(os.environ, {"NAKAMA_URL": "http://mail-test:7350", "NAKAMA_HTTP_KEY": "private-key"}), patch.object(worker.urllib.request, "urlopen", side_effect=urllib.error.URLError("http_key=private-key")):
            with self.assertRaisesRegex(RuntimeError, "^Mailbox RPC unavailable$"):
                worker.tick()

    def test_once_logs_mail_activity(self):
        with patch.object(worker.sys, "argv", ["mail_tick.py", "--once"]), patch.object(worker.signal, "signal"), patch.object(worker, "tick", return_value={"success": True, "delivered": 3, "purged": 2}), patch("sys.stdout", new_callable=io.StringIO) as output:
            self.assertEqual(worker.main(), 0)
            self.assertEqual(json.loads(output.getvalue())["delivered"], 3)


if __name__ == "__main__":
    unittest.main()
