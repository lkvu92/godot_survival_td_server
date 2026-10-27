"""Emit only a safe Compose profile name; never source/eval a private dotenv file."""
import argparse
import json
import subprocess
import sys
from configure_runtime import ROOT, ConfigError, validate_identity


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--compose-file', default='docker-compose.yml')
    parser.add_argument('--env-file')
    args = parser.parse_args()
    command = ['docker', 'compose', '-f', args.compose_file]
    if args.env_file:
        command += ['--env-file', args.env_file]
    command += ['--profile', 'identity', 'config', '--format', 'json']
    try:
        result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, encoding='utf-8', check=False)
        if result.returncode:
            raise ConfigError('Cannot resolve Compose configuration; check private env variable names')
        enabled = validate_identity(json.loads(result.stdout)['services'])
        print('identity' if enabled else 'none')
        return 0
    except ConfigError as error:
        print('[ERR] ' + str(error), file=sys.stderr)
    except (OSError, ValueError, KeyError, TypeError):
        print('[ERR] Cannot inspect identity configuration; secret values omitted.', file=sys.stderr)
    return 1


if __name__ == '__main__':
    sys.exit(main())
