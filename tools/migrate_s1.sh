#!/usr/bin/env bash
set -euo pipefail
umask 077

# No Node/psql installation on host. Shares only the explicitly selected DB network.
tool_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ $# -lt 2 ]]; then
  echo 'Usage: bash tools/migrate_s1.sh DB_CONTAINER ABSOLUTE_BACKUP_DIRECTORY [migration CLI options]' >&2
  echo 'Backup/report paths in CLI options must be /backup/FILE. Environment must be explicit.' >&2
  exit 2
fi
db_container="$1"; backup_dir="$2"; shift 2
[[ "$db_container" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]] || { echo 'Invalid DB container name' >&2; exit 2; }
[[ "$backup_dir" == /* && "$backup_dir" != / && "$backup_dir" != *','* ]] || { echo 'Use an explicit absolute backup directory, not / or a comma-containing path' >&2; exit 2; }
[[ -d "$backup_dir" ]] || { echo 'Create a private backup directory first (mkdir -m 700)' >&2; exit 2; }
backup_dir="$(cd -- "$backup_dir" && pwd -P)"
[[ "$backup_dir" != / ]] || exit 2
[[ "$(docker inspect --format '{{.State.Running}}' "$db_container")" == true ]] || { echo 'DB container must be running' >&2; exit 2; }
auth_args=()
if [[ -n "${S1_PGPASSFILE:-}" ]]; then
  [[ "$S1_PGPASSFILE" == /* && -f "$S1_PGPASSFILE" && "$S1_PGPASSFILE" != *','* ]] || { echo 'S1_PGPASSFILE must name an absolute existing pgpass file' >&2; exit 2; }
  auth_args+=(--mount "type=bind,src=$S1_PGPASSFILE,dst=/run/secrets/pgpass,readonly" -e PGPASSFILE=/run/secrets/pgpass)
elif [[ -n "${PGPASSWORD:-}" ]]; then
  # Forward by environment name, never put the password in command arguments/logs.
  auth_args+=(-e PGPASSWORD)
fi
for option in "$@"; do
  case "$option" in --host|--host=*) echo 'Docker wrapper fixes host to 127.0.0.1 inside selected DB network' >&2; exit 2;; esac
done
docker build --tag survival-td-s1-migration:pg16 --file "$tool_dir/s1-migration.Dockerfile" "$tool_dir" >&2
docker run --rm --network "container:$db_container" \
  --mount "type=bind,src=$backup_dir,dst=/backup" \
  "${auth_args[@]}" survival-td-s1-migration:pg16 --host 127.0.0.1 "$@"
