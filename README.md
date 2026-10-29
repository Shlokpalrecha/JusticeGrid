# JusticeGrid

JusticeGrid is a synthetic legal-aid workflow prototype. It helps a team follow up
requests, counsel access, hearings, documents, bail orders and actual release.
The queue orders work for human review; it does not decide entitlement, bail or release.

The active engine is **v3**, retaining the researched U0–U3 workflow model: U0 immediate, U1 time-sensitive, U2 follow-up and U3 scheduled.
The previous additive score, rules editor and rule API have been retired. Historical
records remain in the database for traceability. Runtime priority rules now compile to a typed AST;
identity resolution uses a bounded phonetic inverted index, queue ordering uses a shared-memory
mutex-protected heap, and branching workflows use a validated DAG. Open **Systems workbench**
for identity review, expression compilation, dependencies and ledger verification.

See [Track 4 architecture and judge walkthrough](docs/SYSTEMS_ARCHITECTURE.md) for limits,
complexities, concurrency behavior and reproducible stress commands.

## Run locally on Windows

Install Node.js 20, pnpm 9.15.4, and Docker Desktop. Start Docker Desktop and wait
until its engine is running. Open PowerShell in this project folder.

```powershell
corepack enable
corepack prepare pnpm@9.15.4 --activate
pnpm install
if (!(Test-Path .env)) { Copy-Item .env.example .env }
docker compose up -d postgres
pnpm --filter @justicegrid/api db:generate
pnpm --filter @justicegrid/api db:migrate:deploy
```

The default local database port is **55432**, matching `.env.example`. If using a
different port, set both `POSTGRES_PORT` and the port in `DATABASE_URL` in `.env`.
Keep an existing `.env` when upgrading.

For a **new, empty demonstration database only**, create the synthetic dataset:

```powershell
pnpm db:seed
```

Seeding replaces demonstration data. Existing installations only need the migration;
the replacement queue is populated by the API's reconciliation job.

Build the two shared packages, then start the development servers:

```powershell
pnpm --filter @justicegrid/shared build
pnpm --filter @justicegrid/rules-engine build
pnpm dev
```

Keep that terminal open. Visit [JusticeGrid](http://127.0.0.1:5173).
The API runs on port 4000; [API documentation](http://127.0.0.1:4000/api/docs/)
is available while it is running. Stop the servers with Ctrl+C. Restart later with
Docker Desktop running, `docker compose up -d postgres`, and `pnpm dev`.

If pnpm's toolchain lookup is unavailable but dependencies are already installed,
run these in two PowerShell windows from the indicated folders:

```powershell
# apps/api
node node_modules/tsx/dist/cli.mjs src/server.ts
```

```powershell
# apps/web
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort
```

## Demo sign-in

| Role | Email | Password |
|---|---|---|
| Administrator | admin@justicegrid.test | Admin@12345 |
| Auditor | auditor@justicegrid.test | Auditor@12345 |
| Legal professional | lawyer1@justicegrid.test through lawyer10@justicegrid.test | Lawyer@12345 |

These accounts belong to the synthetic demo dataset.

## Using the new queue

1. Open **Priority Queue** to see separate urgent-referral and critical-deadline lanes,
   the combined queue, and the oldest unresolved U2/U3 work view.
2. Open a case. Use **Workflow** to record evidence, source applicability and
   human-confirmed review dates. Save with a reason.
3. Use **Record case activity and link preparation** to create or edit a hearing,
   task or document, and link it to the specific hearing/action that needs it.
4. Acknowledge work, record its next review, assign an action owner, and resolve its
   source evidence when complete. Acknowledgement does not complete the work.
5. Administrators use **Queue Policy** to simulate settings before publishing a
   complete version. Rollback creates a new version rather than editing history.

## Development and validation

- `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test` run the project checks.
- Engine tests inject time and run without a database. API integration tests require
  a separate database whose name ends in `_test`; resets reject other names.
- Create it once with `docker compose exec postgres createdb -U justicegrid justicegrid_test`.
  If it already exists, keep it. Migrate it before the API tests:

```powershell
$env:DATABASE_URL='postgresql://justicegrid:justicegrid@127.0.0.1:55432/justicegrid_test'
pnpm --filter @justicegrid/api db:migrate:deploy
Remove-Item Env:DATABASE_URL
pnpm test
```

`TEST_DATABASE_URL` can select another dedicated `_test` database. Browser tests
must use a separately seeded test instance and must not run against the database
while API integration tests are resetting it.

For browser tests, create `justicegrid_browser_test` once using the same `createdb`
command above with that database name, then prepare only that disposable database:

```powershell
$env:DATABASE_URL='postgresql://justicegrid:justicegrid@127.0.0.1:55432/justicegrid_browser_test'
pnpm --filter @justicegrid/api db:migrate:deploy
pnpm db:seed
Remove-Item Env:DATABASE_URL
$env:E2E_DATABASE_URL='postgresql://justicegrid:justicegrid@127.0.0.1:55432/justicegrid_browser_test'
$env:E2E_API_PORT='4001'
$env:E2E_WEB_PORT='5174'
pnpm exec playwright install chromium
pnpm test:e2e
```

The browser test configuration starts and stops its own API/web servers and rejects
an `E2E_DATABASE_URL` whose database name does not end in `_test`. Keep the normal
website on ports 4000/5173. The five browser scenarios cover the complete queue flows.


## Current documentation

- [Implementation contract, source mapping and limits](docs/QUEUE_V2.md)
- [Implementation checklist](docs/QUEUE_IMPLEMENTATION_CHECKLIST.md)
- [India-wide legal research](docs/research/PRIORITY_QUEUE_RESEARCH.md)
- [Researched queue design](docs/research/PRIORITY_QUEUE_V2_DESIGN.md)

The numerical weights and ranking windows are prototype team policy. Automatic
statutory entitlement calculations remain disabled: protected legal dates require
an applicable reviewed profile and explicit human confirmation.
