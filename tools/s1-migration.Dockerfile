# PostgreSQL client version must match the deployed PostgreSQL major version.
FROM postgres:16-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends nodejs ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /tool
COPY migrate_s1.cjs s1_migration_cli.cjs ./
ENTRYPOINT ["node", "/tool/migrate_s1.cjs"]
