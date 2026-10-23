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
    def execute(self, args, failure=0):
        with tempfile.TemporaryDirectory(prefix="deploy test ") as temporary:
            root = Path(temporary)
            (root / "nakama").mkdir()
            (root / "commands").mkdir()
            shutil.copyfile(ROOT / "deploy.sh", root / "deploy.sh")
            for filename in [".env", "iap.secret.yml"]:
                (root / "nakama" / filename).write_text("synthetic fixture\n")
            stub = """#!/usr/bin/env bash
printf 'CALL:%s\\n' "${0##*/}" >> "$TEST_ARG_LOG"
printf 'ARG:%s\\n' "$@" >> "$TEST_ARG_LOG"
printf 'END\\n' >> "$TEST_ARG_LOG"
if [ "${0##*/}" = python3 ]; then
  for arg in "$@"; do
    if [ "$arg" = --seed ]; then exit "${TEST_SEED_EXIT:-0}"; fi
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
                       NAKAMA_CONFIG_ADMIN_TOKEN="synthetic-admin-env-only")
            result = subprocess.run([BASH, str(root / "deploy.sh"), *args], env=env,
                                    capture_output=True, text=True, timeout=20)
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
        self.assertEqual(python_calls, [["python3", "configure_runtime.py"],
                                       ["python3", "configure_runtime.py", "--seed", "--", "--publish"]])
        self.assertTrue(any(call[:4] == ["docker", "compose", "up", "-d"] for call in calls))

    def test_seed_failure_propagates(self):
        result, calls = self.execute(["seed", "--publish"], failure=37)
        self.assertEqual(result.returncode, 37, result.stderr)
        self.assertEqual(len(calls), 1)

    def test_logs_retains_service_argument(self):
        result, calls = self.execute(["logs", "nakama"])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(calls, [["docker", "compose", "logs", "-f", "nakama"]])


if __name__ == "__main__":
    unittest.main()
