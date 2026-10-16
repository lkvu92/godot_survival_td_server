import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("seed_cli", Path(__file__).resolve().parents[1] / "nakama/seed_all.py")
cli = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cli)


class SeedCliTests(unittest.TestCase):
    def run_main(self, args):
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            return cli.main(args)

    def test_failure_stops_run(self):
        with patch.object(cli, "invoke_rpc", side_effect=cli.SeedError("failure")) as call:
            self.assertEqual(self.run_main([]), 1)
            self.assertEqual(call.call_count, 1)

    def test_response_counts_required(self):
        for response in ({}, {"success": True, "table": "heroes", "inserted": 0}):
            with patch.object(cli, "invoke_rpc", return_value=response):
                with self.assertRaises(cli.SeedError):
                    cli.invoke_seed("heroes", {"rows": [{"id": "hero"}]})

    def test_missing_data_fails(self):
        with self.assertRaises(cli.SeedError):
            cli.seed_file("heroes", "does-not-exist.json")

    def test_full_run_payloads(self):
        calls = []
        def record(table, payload):
            calls.append((table, payload))
        with patch.object(cli, "invoke_seed", side_effect=record):
            self.assertEqual(self.run_main([]), 0)
        self.assertFalse(any(table == "remote_settings" for table, _ in calls))
        self.assertFalse(next(payload for table, payload in calls if table == "heroes")["replace_all"])
        self.assertFalse(next(payload for table, payload in calls if table == "store_catalog")["replace_all"])
        self.assertEqual(sum(len(payload["rows"]) for table, payload in calls if table == "stages"), len(cli.read_json("stages.json")))

    def test_settings_draft_only_then_explicit_publish(self):
        filename = Path(__file__).resolve().parents[1] / "nakama/remote_settings.production.example.json"
        args = ["--settings-only", "--settings", str(filename)]
        with patch.object(cli, "invoke_seed") as seed, patch.object(cli, "invoke_rpc") as rpc:
            self.assertEqual(self.run_main(args), 0)
            self.assertEqual(seed.call_args.args[0], "remote_settings")
            rpc.assert_not_called()
        with patch.dict(os.environ, {}, clear=True), patch.object(cli, "invoke_seed") as seed:
            self.assertEqual(self.run_main(args + ["--publish"]), 1)
            seed.assert_not_called()
        with patch.dict(os.environ, {"NAKAMA_CONFIG_ADMIN_TOKEN": "admin-token"}), patch.object(cli, "invoke_seed"), patch.object(cli, "invoke_rpc", return_value={"status": "ok", "config_version": 2}) as rpc:
            self.assertEqual(self.run_main(args + ["--publish"]), 0)
            self.assertEqual(rpc.call_args.args[2], "admin-token")

    def test_url_configuration(self):
        with patch.dict(os.environ, {"NAKAMA_URL": "https://example.test", "NAKAMA_HTTP_KEY": "a&b"}, clear=True):
            self.assertEqual(cli.rpc_url("seed_game_data"), "https://example.test/v2/rpc/seed_game_data?http_key=a%26b")

    def test_bearer_does_not_send_http_key(self):
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self): return json.dumps({"payload": json.dumps({"status": "ok"})}).encode()
        with patch.object(cli.urllib.request, "urlopen", return_value=Response()) as http:
            cli.invoke_rpc("publish_config_release", {}, "admin-token")
            request = http.call_args.args[0]
            self.assertNotIn("http_key", request.full_url)
            self.assertEqual(request.get_header("Authorization"), "Bearer admin-token")
            self.assertGreater(http.call_args.kwargs["timeout"], 0)


if __name__ == "__main__":
    unittest.main()
