#!/usr/bin/env bash
set -euo pipefail
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
public="$here/../../public"
target=/root/source/nginx/conf.d
container=truyen-platform-nginx
# Keep a recoverable copy outside the *.conf include pattern.
backup=$(mktemp "$target/survival-td-lkvustudio.backup.XXXXXX")
cp "$target/survival-td-lkvustudio.available" "$backup"
mkdir -p "$target/ttl-pages"
for page in privacy-policy delete-account; do
    install -m 644 "$public/$page/index.html" "$target/ttl-pages/$page.html"
done
cp "$here/lkvustudio.conf" "$target/survival-td-lkvustudio.available"
if ! docker exec "$container" nginx -t; then
    cp "$backup" "$target/survival-td-lkvustudio.available"
    exit 1
fi
docker exec "$container" nginx -s reload
# Reload is asynchronous: give new workers a moment to start.
sleep 1
for page in privacy-policy delete-account; do
    curl --retry 3 --retry-delay 1 --retry-all-errors --connect-timeout 10 --max-time 30 --fail --silent --show-error "https://lkvustudio.com/ttl/$page/" -o /dev/null
done
printf 'Published both public pages. Previous config: %s\n' "$backup"
