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

    def test_late_bad_file_sends_no_rpc(self):
        original = cli.read_json
        def read(filename):
            if filename == "vip_config.json":
                raise cli.SeedError("invalid late source")
            return original(filename)
        with patch.object(cli, "read_json", side_effect=read), patch.object(cli, "invoke_rpc") as rpc:
            self.assertEqual(self.run_main([]), 1)
            rpc.assert_not_called()

    def test_full_run_uses_one_atomic_bundle(self):
        def respond(name, body):
            self.assertEqual(name, "seed_game_data")
            self.assertEqual(body["table"], "bundle")
            return {"success": True, "atomic": True, "table": "bundle", "results": [
                {"success": True, "table": r["table"], "inserted": len(r["rows"]) if "rows" in r else 1}
                for r in body["requests"]]}
        with patch.object(cli, "invoke_rpc", side_effect=respond) as rpc:
            self.assertEqual(self.run_main([]), 0)
            self.assertEqual(rpc.call_count, 1)

    def test_old_runtime_is_not_retried_as_partial_seed(self):
        with patch.object(cli, "invoke_rpc", return_value={"error": "Unknown table"}) as rpc:
            self.assertEqual(self.run_main([]), 1)
            self.assertEqual(rpc.call_count, 1)

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

    def test_admin_email_login_uses_noncreating_auth_and_hides_password(self):
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self): return b'{"token":"session-test"}'
        with patch.dict(os.environ, {"NAKAMA_URL": "https://example.test", "NAKAMA_SERVER_KEY": "server-secret"}, clear=True), patch.object(cli.urllib.request, "urlopen", return_value=Response()) as http:
            self.assertEqual(cli.admin_login("admin@example.test", "private-password"), "session-test")
            request = http.call_args.args[0]
            self.assertEqual(request.full_url, "https://example.test/v2/account/authenticate/email?create=false")
            self.assertEqual(json.loads(request.data), {"email": "admin@example.test", "password": "private-password"})
            self.assertTrue(request.get_header("Authorization").startswith("Basic "))

    def test_admin_email_requires_interactive_terminal(self):
        with patch.dict(os.environ, {"NAKAMA_SERVER_KEY": "test"}, clear=True), patch.object(cli.sys.stdin, "isatty", return_value=False), patch.object(cli, "invoke_rpc") as rpc:
            self.assertEqual(self.run_main(["--publish", "--u", "admin@example.test"]), 1)
            rpc.assert_not_called()

    def test_admin_email_session_is_used_for_publish(self):
        def respond(name, body, bearer=None):
            if name == "seed_game_data":
                return {"success": True, "atomic": True, "table": "bundle", "results": [{"success": True, "table": request["table"], "inserted": len(request["rows"])} for request in body["requests"]]}
            return {"status": "ok", "config_version": 3}
        with patch.dict(os.environ, {}, clear=True), patch.object(cli.sys.stdin, "isatty", return_value=True), patch.object(cli.getpass, "getpass", return_value="private-password") as prompt, patch.object(cli, "admin_login", return_value="session-test") as login, patch.object(cli, "invoke_rpc", side_effect=respond) as rpc:
            self.assertEqual(self.run_main(["--settings-only", "--settings", str(Path(__file__).resolve().parents[1] / "nakama/remote_settings.production.example.json"), "--publish", "--u", "admin@example.test"]), 0)
            prompt.assert_called_once()
            login.assert_called_once_with("admin@example.test", "private-password")
            self.assertEqual(rpc.call_args.args[0], "publish_config_release")
            self.assertEqual(rpc.call_args.args[2], "session-test")

    def test_publish_without_settings_commits_bundle_before_authenticated_publish(self):
        calls = []
        secret = "synthetic-admin-no-log"
        def respond(name, body, bearer=None):
            calls.append((name, body, bearer))
            if name == "seed_game_data":
                self.assertIsNone(bearer)
                self.assertEqual(body["table"], "bundle")
                self.assertNotIn("remote_settings", [request["table"] for request in body["requests"]])
                return {"success": True, "atomic": True, "table": "bundle", "results": [
                    {"success": True, "table": request["table"], "inserted": len(request["rows"]) if "rows" in request else 1}
                    for request in body["requests"]]}
            self.assertEqual(name, "publish_config_release")
            self.assertEqual(bearer, secret)
            self.assertEqual(body, {"app_version": "1.2.3", "store_url": "https://store.example/app"})
            return {"status": "ok", "config_version": 88}
        with patch.dict(os.environ, {"NAKAMA_CONFIG_ADMIN_TOKEN": secret}, clear=True), patch.object(cli, "invoke_rpc", side_effect=respond), contextlib.redirect_stdout(io.StringIO()) as output, contextlib.redirect_stderr(io.StringIO()) as errors:
            self.assertEqual(cli.main(["--publish", "--app-version", "1.2.3", "--store-url", "https://store.example/app"]), 0)
        self.assertEqual([call[0] for call in calls], ["seed_game_data", "publish_config_release"])
        self.assertNotIn(secret, output.getvalue() + errors.getvalue())

    def test_publish_without_token_sends_no_rpc(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(cli, "invoke_rpc") as rpc:
            self.assertEqual(self.run_main(["--publish"]), 1)
            rpc.assert_not_called()

    def test_failed_bundle_prevents_publication(self):
        with patch.dict(os.environ, {"NAKAMA_CONFIG_ADMIN_TOKEN": "synthetic-token"}, clear=True), patch.object(cli, "invoke_rpc", return_value={"success": False}) as rpc:
            self.assertEqual(self.run_main(["--publish"]), 1)
        self.assertEqual(rpc.call_count, 1)
        self.assertEqual(rpc.call_args.args[0], "seed_game_data")

    def test_content_only_seeds_complete_remote_supplements(self):
        with patch.object(cli, "invoke_seed") as seed:
            self.assertEqual(self.run_main(["--content-only"]), 0)
            self.assertEqual(seed.call_count, 1)
            table, payload = seed.call_args.args
            self.assertEqual(table, "content_configs")
            self.assertEqual({row["id"] for row in payload["rows"]}, {"daily_checkin", "events", "stamina", "vip", "rewarded_ads", "enemy_skills", "boss_skills", "tribulation"})

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
