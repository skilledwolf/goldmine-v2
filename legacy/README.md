# Legacy migration

Legacy migration is intentionally **decoupled** from the main app setup.

## Inputs
- SQL dump: `legacy/sql/legacy.sql`
- Legacy lecture tree: `legacy/lectures/` (must mirror legacy `fs_path`, e.g. `QM1/2014HS/...`)

## Dev workflow (recommended)
1) Start a fresh dev app:

```bash
./scripts/gm.sh dev empty
```

2) Import legacy data (second step):

```bash
./legacy/migrate.sh dev
```

Notes:
- The script recreates the `legacy_db` container by default so the SQL dump is re-imported.
- If the target Postgres DB already contains `core_lecture` rows, the script aborts unless you set `FORCE=1`.

## Production workflow (optional)
Run the same script against `docker-compose.prod.yml`:

```bash
./scripts/gm.sh prod up
./legacy/migrate.sh prod
```

