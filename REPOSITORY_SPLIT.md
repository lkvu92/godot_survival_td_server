# Server repository extraction

Version: 1.0.0
Date: 2026-10-16

Source: godot_survival_td branch production, commit 270333b.
Destination: https://github.com/lkvu92/godot_survival_td_server.git, branch main.

The initial server import preserves the production snapshot, including backend
TypeScript, verifier, Docker deployment files, compiled runtime and game JSON.
The destination repository's existing initial commit is preserved. Client Git
history and local credentials are not imported.

Local checkout: server/ inside the client workspace. The client ignores this
directory; it is an independent repository, not a Git submodule.

Work on backend and deployment changes in this repository. The original client
backend directories and production branch are retained during migration to avoid
breaking existing tooling. Their removal is a separate migration step.

The server data/ directory owns online balance and seed data. Keep the client's
offline data/ compatible when changing shared gameplay schemas. No automatic
cross-repository synchronization is configured.

No database migration, runtime behavior change, seed operation or VPS deployment
is part of this extraction.

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-16 | Import production snapshot into the independent server repository. |
