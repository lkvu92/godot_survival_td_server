"""Execute the real deployment shell against synthetic commands only."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
GIT_BASH = Path("C:/Program Files/Git/bin/bash.exe")
BASH = str(GIT_BASH) if GIT_BASH.exists() else shutil.which("bash")


@unittest.skipUnless(BASH, "Bash is required for shell integration")
class DeploySeedArgsTests(unittest.TestCase):
    def execute(self, args, failure=0, identity=False, smtp_failure=0, profile_failure=0):
        with tempfile.TemporaryDirectory(prefix="deploy test ") as temporary:
            root = Path(temporary)
            (root / "nakama").mkdir()
            (root / "commands").mkdir()
            (root / "deploy.sh").write_text((ROOT / "deploy.sh").read_text(), newline="\n")
            for filename in [".env", "iap.secret.yml"]:
                (root / "nakama" / filename).write_text("synthetic fixture\n")
            stub = """#!/usr/bin/env bash
printf 'CALL:%s\\n' "${0##*/}" >> "$TEST_ARG_LOG"
printf 'ARG:%s\\n' "$@" >> "$TEST_ARG_LOG"
printf 'END\\n' >> "$TEST_ARG_LOG"
if [ "${0##*/}" = python3 ]; then
  if [ "${1:-}" = identity_config.py ]; then
    printf '%s\\n' "${TEST_IDENTITY_PROFILE:-none}"
    exit "${TEST_PROFILE_EXIT:-0}"
  fi
  for arg in "$@"; do
    if [ "$arg" = --seed ]; then exit "${TEST_SEED_EXIT:-0}"; fi
  done
fi
if [ "${0##*/}" = docker ]; then
  for arg in "$@"; do
    if [ "$arg" = src/verify-smtp.js ]; then exit "${TEST_SMTP_EXIT:-0}"; fi
  done
fi
exit 0
"""
            for executable in ["python3", "docker", "curl"]:
                command = root / "commands" / executable
                command.write_text(stub, newline="\n")
                command.chmod(0o755)
            log = root / "argv.log"
            env = os.environ.copy()
            env.update(PATH=str(root / "commands") + os.pathsep + env.get("PATH", ""),
                       TEST_ARG_LOG=log.as_posix(), TEST_SEED_EXIT=str(failure),
                       TEST_IDENTITY_PROFILE="identity" if identity else "none", TEST_SMTP_EXIT=str(smtp_failure), TEST_PROFILE_EXIT=str(profile_failure),
                       TEST_STUB_DIR=("/" + str(root.drive)[0].lower() + (root / "commands").as_posix()[2:]) if os.name == "nt" else str(root / "commands"),
                       NAKAMA_CONFIG_ADMIN_TOKEN="synthetic-admin-env-only")
            result = subprocess.run([BASH, "-c", 'export PATH="$TEST_STUB_DIR:$PATH"; exec bash "$@"', "deploy-test", str(root / "deploy.sh"), *args], env=env,
                                    capture_output=True, text=True, timeout=30)
            calls = []
            if log.exists():
                for line in log.read_text().splitlines():
                    if line.startswith("CALL:"):
                        calls.append([line[5:]])
                    elif line.startswith("ARG:"):
                        calls[-1].append(line[4:])
            self.assertNotIn("synthetic-admin-env-only", result.stdout + result.stderr + repr(calls))
            return result, calls

    def test_seed_quotes_paths_and_passes_options(self):
        args = ["--publish", "--settings", "reviewed settings/production config.json", "--app-version", "1.2.3"]
        result, calls = self.execute(["seed", *args])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(calls, [["python3", "configure_runtime.py", "--seed", "--", *args]])

    def test_seed_without_options_keeps_default_behavior(self):
        result, calls = self.execute(["seed"])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(calls, [["python3", "configure_runtime.py", "--seed", "--"]])

    def test_publish_seeds_and_forwards_options_without_restart(self):
        result, calls = self.execute(["publish", "--app-version", "1.2.3"])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(calls, [["python3", "configure_runtime.py", "--seed", "--", "--publish", "--app-version", "1.2.3"]])

    def test_deploy_forwards_seed_options_after_start(self):
        result, calls = self.execute(["deploy", "--publish"])
        self.assertEqual(result.returncode, 0, result.stderr)
        python_calls = [call for call in calls if call[0] == "python3"]
        self.assertEqual(python_calls, [["python3", "identity_config.py"], ["python3", "configure_runtime.py"],
                                       ["python3", "configure_runtime.py", "--seed", "--", "--publish"],
                                       ["python3", "configure_runtime.py", "--seed", "--", "--check-active"]])
        self.assertTrue(any(call[:4] == ["docker", "compose", "up", "-d"] for call in calls))

    def test_seed_failure_propagates(self):
        result, calls = self.execute(["seed", "--publish"], failure=37)
        self.assertEqual(result.returncode, 37, result.stderr)
        self.assertEqual(len(calls), 1)

    def test_deploy_aliases_publish_by_default(self):
        for action in ["deploy", "up", "start"]:
            with self.subTest(action=action):
                result, calls = self.execute([action])
                self.assertEqual(result.returncode, 0, result.stderr)
                python_calls = [call for call in calls if call[0] == "python3"]
                self.assertEqual(python_calls[2:], [
                    ["python3", "configure_runtime.py", "--seed", "--", "--publish"],
                    ["python3", "configure_runtime.py", "--seed", "--", "--check-active"]])

    def test_deploy_publish_failure_prevents_success_and_active_check(self):
        result, calls = self.execute(["deploy"], failure=37)
        self.assertEqual(result.returncode, 37, result.stderr)
        self.assertNotIn("[SUCCESS]", result.stdout)
        self.assertFalse(any("--check-active" in call for call in calls))

    def test_deploy_quotes_settings_with_implicit_publish(self):
        filename = "reviewed settings/production config.json"
        result, calls = self.execute(["deploy", "--settings", filename])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(["python3", "configure_runtime.py", "--seed", "--", "--publish", "--settings", filename], calls)

    def test_logs_retains_service_argument(self):
        result, calls = self.execute(["logs", "nakama"])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(calls, [["docker", "compose", "--profile", "identity", "logs", "-f", "nakama"]])

    def test_enabled_identity_is_built_checked_and_smtp_verified(self):
        result, calls = self.execute(["deploy"], identity=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(["docker", "compose", "--profile", "identity", "up", "-d", "--build"], calls)
        self.assertIn(["docker", "compose", "--profile", "identity", "up", "-d", "--no-deps", "--force-recreate", "nakama"], calls)
        self.assertTrue(any(call[-3:] == ["account-identity", "node", "src/verify-smtp.js"] for call in calls))

    def test_disabled_identity_does_not_probe_smtp(self):
        result, calls = self.execute(["deploy"])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(any("src/verify-smtp.js" in call for call in calls))
        self.assertIn('account-identity is DISABLED',result.stdout)

    def test_identity_command_builds_service_without_seeding(self):
        result,calls=self.execute(['identity'],identity=True)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertIn(['docker','compose','--profile','identity','up','-d','--build','account-identity'],calls)
        self.assertTrue(any('src/verify-smtp.js' in call for call in calls))
        self.assertFalse(any('--seed' in call for call in calls))

    def test_identity_command_rejects_disabled_config_before_mutations(self):
        result,calls=self.execute(['identity'])
        self.assertNotEqual(result.returncode,0)
        self.assertIn('nakama/.env',result.stdout)
        self.assertFalse(any(call[0]=='docker' for call in calls))

    def test_smtp_failure_prevents_publication_and_success(self):
        result, calls = self.execute(["deploy"], identity=True, smtp_failure=23)
        self.assertEqual(result.returncode, 23)
        self.assertNotIn("[SUCCESS]", result.stdout)
        self.assertFalse(any("--seed" in call for call in calls))

    def test_invalid_identity_configuration_stops_before_container_start(self):
        result, calls = self.execute(["deploy"], profile_failure=21)
        self.assertEqual(result.returncode, 21)
        self.assertFalse(any(call[:2] == ["docker", "compose"] and "up" in call for call in calls))


if __name__ == "__main__":
    unittest.main()
