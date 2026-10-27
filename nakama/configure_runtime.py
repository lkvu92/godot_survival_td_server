"""Render private Nakama configuration from Compose-resolved .env values."""
import secrets
import json
import argparse
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import re
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent


class ConfigError(Exception):
    pass


def validate_identity(services):
    """Validate enabled identity configuration without returning or logging secrets."""
    runtime_env = services["nakama"]["environment"]
    if str(runtime_env.get("ACCOUNT_IDENTITY_ENABLED", "false")).lower() != "true":
        return False
    env = services.get("account-identity", {}).get("environment", {})
    for key in ["ACCOUNT_IDENTITY_SECRET", "ACCOUNT_IDENTITY_OUTBOX_KEY"]:
        if not re.fullmatch(r"[a-fA-F0-9]{64}", str(env.get(key, ""))):
            raise ConfigError("Missing or invalid identity variable: " + key)
    if env["ACCOUNT_IDENTITY_SECRET"] != runtime_env.get("ACCOUNT_IDENTITY_SECRET"):
        raise ConfigError("Identity service/runtime secret mismatch")
    if env["ACCOUNT_IDENTITY_SECRET"] == env["ACCOUNT_IDENTITY_OUTBOX_KEY"]:
        raise ConfigError("Identity bridge and outbox keys must differ")
    for key in ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM", "GOOGLE_WEB_CLIENT_IDS"]:
        value = str(env.get(key, ""))
        if not value.strip() or "\r" in value or "\n" in value:
            raise ConfigError("Missing or invalid identity variable: " + key)
    if str(env.get("SMTP_PORT", "587")) not in ["465", "587"]:
        raise ConfigError("SMTP_PORT must be 465 or 587 with TLS")
    for key in ["SMTP_USER", "SMTP_FROM"]:
        if not re.fullmatch(r"[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+", str(env.get(key, ""))):
            raise ConfigError("Invalid identity variable: " + key)
    public = urlsplit(str(env.get("ACCOUNT_IDENTITY_PUBLIC_URL", "")))
    if not public.hostname or public.username or public.password or public.query or public.fragment or public.path not in ["", "/"]:
        raise ConfigError("Invalid ACCOUNT_IDENTITY_PUBLIC_URL")
    if public.scheme != "https" and not (env.get("APP_ENVIRONMENT") == "develop" and public.scheme == "http"):
        raise ConfigError("ACCOUNT_IDENTITY_PUBLIC_URL requires HTTPS outside develop")
    return True


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
    if str(env.get("MULTI_SERVER_ENABLED") or "").lower() == "true":
        runtime_env.append("MULTI_SERVER_ENABLED=true")
    runtime_env.append("ACCOUNT_IDENTITY_ENABLED=" + str(env.get("ACCOUNT_IDENTITY_ENABLED") or "false").lower())
    if str(env.get("ACCOUNT_IDENTITY_ENABLED") or "").lower() == "true":
        runtime_env.append("ACCOUNT_IDENTITY_SECRET=" + required("ACCOUNT_IDENTITY_SECRET"))
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


def main(seed=False, compose_file="docker-compose.yml", env_file=None, output="runtime.secret.yml", seed_args=None):
    try:
        if seed_args and not seed:
            raise ConfigError("Seed arguments require --seed")
        command = ["docker", "compose", "-f", compose_file]
        if env_file:
            command.extend(["--env-file", env_file])
        # Include profiled definitions while inspecting, without starting containers.
        command.extend(["--profile", "identity", "config", "--format", "json"])
        result = subprocess.run(command,
                                cwd=ROOT, capture_output=True, text=True, encoding="utf-8", check=False)
        if result.returncode:
            raise ConfigError("Cannot resolve Compose configuration; verify required .env variable names.")
        services = json.loads(result.stdout)["services"]
        validate_identity(services)
        env = services["nakama"]["environment"]
        verifier = services["monetization-verifier"]["environment"]
        for name in ["NAKAMA_HTTP_KEY", "MONETIZATION_VERIFIER_SECRET"]:
            if env.get(name) != verifier.get(name):
                raise ConfigError("Service configuration mismatch: " + name)
        token_path = ROOT / (Path(output).name + ".publish-token")
        try:
            descriptor = os.open(token_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, "w", encoding="utf-8") as token_file:
                token_file.write(secrets.token_hex(32))
        except FileExistsError:
            pass
        publish_token = token_path.read_text(encoding="utf-8").strip()
        if len(publish_token) != 64 or any(c not in "0123456789abcdef" for c in publish_token):
            raise ConfigError("Invalid private publish credential file")
        os.chmod(token_path, 0o600)
        config = make_config(env)
        config["runtime"]["env"].append("CONFIG_PUBLISH_TOKEN=" + publish_token)
        write_private(config, ROOT / output)
        if seed:
            process_env = os.environ.copy()
            process_env["NAKAMA_CONFIG_PUBLISH_TOKEN"] = publish_token
            process_env["NAKAMA_HTTP_KEY"] = env["NAKAMA_HTTP_KEY"]
            process_env["NAKAMA_SERVER_KEY"] = env["NAKAMA_SERVER_KEY"]
            # The VPS credential is never sent to a shell-provided remote URL.
            process_env.pop("NAKAMA_SEED_URL", None)
            ports = services["nakama"].get("ports", [])
            for port in ports:
                if int(port.get("target", 0)) == 7350:
                    local_url = "http://127.0.0.1:" + str(port["published"])
                    process_env["NAKAMA_URL"] = local_url
                    break
            else:
                raise ConfigError("Nakama HTTP port mapping is required for local operator calls")
            return subprocess.run([sys.executable, str(ROOT / "seed_all.py"), *(seed_args or [])],
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
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed", action="store_true")
    parser.add_argument("--compose-file", default="docker-compose.yml")
    parser.add_argument("--env-file")
    parser.add_argument("--output", default="runtime.secret.yml")
    parser.add_argument("seed_args", nargs=argparse.REMAINDER, help="Seed options following --")
    args = parser.parse_args()
    seed_args = args.seed_args[1:] if args.seed_args[:1] == ["--"] else args.seed_args
    if seed_args and not args.seed:
        parser.error("Seed arguments require --seed")
    sys.exit(main(seed=args.seed, compose_file=args.compose_file,
                  env_file=args.env_file, output=args.output, seed_args=seed_args))
