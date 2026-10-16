"""Render private Nakama configuration from Compose-resolved .env values."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent


class ConfigError(Exception):
    pass


def make_config(env):
    def required(name):
        value = str(env.get(name) or "")
        if not value.strip() or "\n" in value or "\r" in value:
            raise ConfigError("Missing or invalid required variable: " + name)
        return value

    runtime_names = ["APP_ENVIRONMENT", "ANDROID_PACKAGE_NAME", "CONFIG_ADMIN_USER_ID",
                     "MONETIZATION_VERIFIER_SECRET", "ADMOB_REWARDED_UNIT_ID_DEVELOP",
                     "ADMOB_REWARDED_UNIT_ID_PRODUCTION"]
    runtime_env = [name + "=" + required(name) for name in runtime_names]
    runtime_env.append("GOOGLE_PLAY_TESTER_EMAILS=" + str(env.get("GOOGLE_PLAY_TESTER_EMAILS") or "").strip())
    runtime_env.append("PLAY_PURCHASE_VERIFIER_URL=http://monetization-verifier:8080/google-play/verify")
    return {
        "database": {"address": [required("POSTGRES_USER") + ":" + required("POSTGRES_PASSWORD")
                                  + "@postgres:5432/" + required("POSTGRES_DB")]},
        "socket": {"server_key": required("NAKAMA_SERVER_KEY")},
        "console": {"username": required("NAKAMA_CONSOLE_USERNAME"),
                    "password": required("NAKAMA_CONSOLE_PASSWORD"),
                    "signing_key": required("NAKAMA_CONSOLE_SIGNING_KEY"),
                    "mfa": {"storage_encryption_key": required("NAKAMA_CONSOLE_MFA_KEY")}},
        "session": {"encryption_key": required("NAKAMA_SESSION_ENCRYPTION_KEY"),
                    "refresh_encryption_key": required("NAKAMA_SESSION_REFRESH_ENCRYPTION_KEY")},
        "runtime": {"http_key": required("NAKAMA_HTTP_KEY"), "env": runtime_env},
    }


def write_private(config, target):
    descriptor, temporary = tempfile.mkstemp(prefix=".runtime-secret-", dir=target.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as output:
            json.dump(config, output, indent=2)
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main(seed=False):
    try:
        result = subprocess.run(["docker", "compose", "config", "--format", "json"],
                                cwd=ROOT, capture_output=True, text=True, encoding="utf-8", check=False)
        if result.returncode:
            raise ConfigError("Cannot resolve Compose configuration; verify required .env variable names.")
        services = json.loads(result.stdout)["services"]
        env = services["nakama"]["environment"]
        verifier = services["monetization-verifier"]["environment"]
        for name in ["NAKAMA_HTTP_KEY", "MONETIZATION_VERIFIER_SECRET"]:
            if env.get(name) != verifier.get(name):
                raise ConfigError("Service configuration mismatch: " + name)
        write_private(make_config(env), ROOT / "runtime.secret.yml")
        if seed:
            process_env = os.environ.copy()
            process_env["NAKAMA_HTTP_KEY"] = env["NAKAMA_HTTP_KEY"]
            ports = services["nakama"].get("ports", [])
            for port in ports:
                if int(port.get("target", 0)) == 7350:
                    process_env.setdefault("NAKAMA_URL", "http://127.0.0.1:" + str(port["published"]))
            return subprocess.run([sys.executable, str(ROOT / "seed_all.py")],
                                  cwd=ROOT, env=process_env, check=False).returncode
    except ConfigError as error:
        print("[ERR] " + str(error), file=sys.stderr)
        return 1
    except (OSError, ValueError, KeyError, TypeError):
        print("[ERR] Cannot generate private runtime configuration.", file=sys.stderr)
        return 1
    print("[OK] Private runtime configuration generated; secret values omitted.")
    return 0


if __name__ == "__main__":
    if sys.argv[1:] not in [[], ["--seed"]]:
        print("Usage: configure_runtime.py [--seed]", file=sys.stderr)
        sys.exit(1)
    sys.exit(main(seed=sys.argv[1:] == ["--seed"]))
