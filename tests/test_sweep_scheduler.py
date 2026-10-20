"""C144 worker transport checks: correct Nakama RPC envelope and safe errors."""
import importlib.util
import io
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch
import urllib.error


spec = importlib.util.spec_from_file_location("sweep_tick", Path(__file__).parents[1] / "nakama" / "sweep_tick.py")
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class SweepSchedulerTests(unittest.TestCase):
    def test_rpc_envelope_and_timeout(self):
        response = io.BytesIO(json.dumps({"payload": json.dumps({"success": True, "processed": 2})}).encode())
        with patch.dict(os.environ, {"NAKAMA_URL": "http://nakama:7350/", "NAKAMA_HTTP_KEY": "secret/a+b"}), \
                patch.object(worker.urllib.request, "urlopen", return_value=response) as call:
            self.assertEqual(worker.tick()["processed"], 2)
            request = call.call_args.args[0]
            self.assertEqual(json.loads(request.data), "{}")
            self.assertIn("http_key=secret%2Fa%2Bb", request.full_url)
            self.assertEqual(call.call_args.kwargs["timeout"], 10)

    def test_network_error_does_not_print_key(self):
        with patch.dict(os.environ, {"NAKAMA_URL": "http://nakama:7350", "NAKAMA_HTTP_KEY": "sensitive"}), \
                patch.object(worker.urllib.request, "urlopen", side_effect=urllib.error.URLError("http_key=sensitive")):
            with self.assertRaisesRegex(RuntimeError, "^Sweep RPC unavailable$"):
                worker.tick()

    def test_missing_env_and_rejected_tick(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(ValueError):
                worker.tick()
        with patch.dict(os.environ, {"NAKAMA_URL": "http://nakama:7350", "NAKAMA_HTTP_KEY": "key"}), \
                patch.object(worker.urllib.request, "urlopen", return_value=io.BytesIO(b'{"success":false}')):
            with self.assertRaisesRegex(RuntimeError, "Sweep RPC rejected"):
                worker.tick()


if __name__ == "__main__":
    unittest.main()
