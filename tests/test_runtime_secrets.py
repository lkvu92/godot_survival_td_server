import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock

PATH = Path(__file__).resolve().parents[1] / "nakama" / "configure_runtime.py"
SPEC = importlib.util.spec_from_file_location("configure_runtime", PATH)
runtime = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runtime)


class RuntimeSecretsTests(unittest.TestCase):
    def env(self):
        names = ["POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB", "NAKAMA_SERVER_KEY",
                 "NAKAMA_CONSOLE_USERNAME", "NAKAMA_CONSOLE_PASSWORD", "NAKAMA_CONSOLE_SIGNING_KEY",
                 "NAKAMA_CONSOLE_MFA_KEY", "NAKAMA_SESSION_ENCRYPTION_KEY",
                 "NAKAMA_SESSION_REFRESH_ENCRYPTION_KEY", "NAKAMA_HTTP_KEY",
                 "MONETIZATION_VERIFIER_SECRET", "APP_ENVIRONMENT", "ANDROID_PACKAGE_NAME",
                 "CONFIG_ADMIN_USER_ID", "ADMOB_REWARDED_UNIT_ID_DEVELOP",
                 "ADMOB_REWARDED_UNIT_ID_PRODUCTION"]
        return {name: "synthetic-" + name for name in names}

    def test_mapping_and_distinct_keys(self):
        env = self.env()
        config = runtime.make_config(env)
        self.assertEqual(config["socket"]["server_key"], env["NAKAMA_SERVER_KEY"])
        self.assertEqual(config["runtime"]["http_key"], env["NAKAMA_HTTP_KEY"])
        self.assertEqual(config["console"]["mfa"]["storage_encryption_key"], env["NAKAMA_CONSOLE_MFA_KEY"])
        self.assertEqual(config["session"]["refresh_encryption_key"], env["NAKAMA_SESSION_REFRESH_ENCRYPTION_KEY"])
        self.assertIn("MONETIZATION_VERIFIER_SECRET=" + env["MONETIZATION_VERIFIER_SECRET"], config["runtime"]["env"])
        self.assertNotEqual(config["socket"]["server_key"], config["runtime"]["http_key"])

    def test_every_required_variable_rejects_missing_without_values(self):
        for name in self.env():
            env = self.env()
            del env[name]
            with self.assertRaises(runtime.ConfigError) as failure:
                runtime.make_config(env)
            for value in env.values():
                self.assertNotIn(value, str(failure.exception))

    def test_private_atomic_output(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "runtime.secret.yml"
            runtime.write_private(runtime.make_config(self.env()), target)
            self.assertEqual(json.loads(target.read_text())["socket"]["server_key"], self.env()["NAKAMA_SERVER_KEY"])
            runtime.write_private({"replacement": True}, target)
            self.assertEqual(json.loads(target.read_text()), {"replacement": True})
            self.assertEqual(len(list(Path(directory).iterdir())), 1)
            if os.name != "nt":
                self.assertEqual(target.stat().st_mode & 0o777, 0o600)

    def test_compose_failure_never_prints_output(self):
        result = mock.Mock(returncode=1, stdout="synthetic-secret", stderr="synthetic-secret")
        with mock.patch.object(runtime.subprocess, "run", return_value=result), contextlib.redirect_stderr(io.StringIO()) as errors:
            self.assertEqual(runtime.main(), 1)
        self.assertNotIn("synthetic-secret", errors.getvalue())

    def test_bridge_mismatch_fails_without_printing_values(self):
        env = self.env()
        doc = {"services": {"nakama": {"environment": env}, "monetization-verifier": {"environment": {}}}}
        result = mock.Mock(returncode=0, stdout=json.dumps(doc))
        with mock.patch.object(runtime.subprocess, "run", return_value=result), contextlib.redirect_stderr(io.StringIO()) as errors:
            self.assertEqual(runtime.main(), 1)
        for value in env.values():
            self.assertNotIn(value, errors.getvalue())

    def test_seed_uses_matching_key_in_environment_only(self):
        env = self.env()
        verifier = {name: env[name] for name in ["NAKAMA_HTTP_KEY", "MONETIZATION_VERIFIER_SECRET"]}
        doc = {"services": {"nakama": {"environment": env, "ports": [{"target": 7350, "published": "17350"}]},
                            "monetization-verifier": {"environment": verifier}}}
        result = mock.Mock(returncode=0, stdout=json.dumps(doc))
        with mock.patch.object(runtime.subprocess, "run", side_effect=[result, mock.Mock(returncode=0)]) as calls, mock.patch.object(runtime, "write_private"), mock.patch.dict(os.environ, {}, clear=True):
            self.assertEqual(runtime.main(seed=True), 0)
        seed = calls.call_args_list[1]
        self.assertEqual(seed.kwargs["env"]["NAKAMA_HTTP_KEY"], env["NAKAMA_HTTP_KEY"])
        self.assertEqual(seed.kwargs["env"]["NAKAMA_URL"], "http://127.0.0.1:17350")
        self.assertNotIn(env["NAKAMA_HTTP_KEY"], " ".join(seed.args[0]))

    def test_local_seed_ignores_host_endpoint_overrides(self):
        env = self.env()
        verifier = {name: env[name] for name in ["NAKAMA_HTTP_KEY", "MONETIZATION_VERIFIER_SECRET"]}
        doc = {"services": {"nakama": {"environment": env, "ports": [{"target": 7350, "published": "17350"}]},
                            "monetization-verifier": {"environment": verifier}}}
        result = mock.Mock(returncode=0, stdout=json.dumps(doc))
        host = {"NAKAMA_URL": "https://remote.example", "NAKAMA_SEED_URL": "https://remote.example/v2/rpc/seed"}
        with mock.patch.object(runtime.subprocess, "run", side_effect=[result, mock.Mock(returncode=0)]) as calls, mock.patch.object(runtime, "write_private"), mock.patch.dict(os.environ, host, clear=True):
            self.assertEqual(runtime.main(seed=True, compose_file="docker-compose.local.yml",
                                          env_file=".env.local", output="runtime.local.secret.yml"), 0)
        seed_env = calls.call_args_list[1].kwargs["env"]
        self.assertEqual(seed_env["NAKAMA_URL"], "http://127.0.0.1:17350")
        self.assertNotIn("NAKAMA_SEED_URL", seed_env)
