# JusticeGrid

> **Prototype — synthetic data only.** Workflow prioritization is a review aid, not a legal or
> judicial decision. All actions require human review.

JusticeGrid is an academic, end-to-end prototype of a **legal-aid workflow and explainable
prioritization system**. An authorized legal-aid team manages its own last-mile follow-up work on
assigned undertrial cases — checking orders, preparing documents, contacting lawyers, tracking
hearings and tasks. JusticeGrid stores that operational information, applies a deterministic,
configurable rule engine to it, and produces an **explainable review queue**: every priority is
shown with the exact reasons that produced it. A human decides every action.

This is a Mini Project Phase I deliverable, built to survive a technical viva. It is **not** a
production legal system.

## What this is not

JusticeGrid does not make legal or judicial decisions, does not score people (risk, bail
eligibility, release likelihood — none of that vocabulary appears anywhere in this codebase), uses
**no machine learning or probabilistic inference** (the engine is deterministic and fully
explainable), and is not, and never claims to be, CCTNS, eCourts, e-Prisons, NJDG, or ICJS, nor
does it integrate with them. All data is synthetic. See
[`docs/00-problem-statement.md`](docs/00-problem-statement.md) and
[`docs/11-limitations-and-ethics.md`](docs/11-limitations-and-ethics.md) for the full framing.

## Architecture at a glance

- **`packages/rules-engine`** — the graded contribution. A pure, dependency-free TypeScript
  package (no Prisma, no date libraries, no DB) that takes a plain input plus an injected `now:
  Date` and returns a plain, explainable, byte-identical-for-identical-input result. See
  [`docs/05-rule-engine.md`](docs/05-rule-engine.md).
- **`packages/shared`** — Zod schemas, types, enums, and DTOs shared by the API and web app.
- **`apps/api`** — Express 4 + Prisma 5 + PostgreSQL 16. JWT auth with rotating refresh tokens,
  RBAC enforced server-side, hash-chained append-only audit log.
- **`apps/web`** — React 18 + Vite + TanStack Query/Table + shadcn/ui.

Full write-up: [`docs/02-architecture.md`](docs/02-architecture.md).

## Prerequisites

- Node.js **20 LTS** (see `.nvmrc`)
- pnpm 9 (via `corepack enable && corepack prepare pnpm@9.15.4 --activate`)
- Docker + Docker Compose (for Postgres, or to run the whole stack)

## Quickstart

```bash
cp .env.example .env
pnpm install
pnpm setup        # installs deps + generates the Prisma client
pnpm db:reset      # drop → migrate → seed a fully synthetic demo dataset
pnpm dev           # API on :4000, web on :5173
```

Or the fully containerized path:

```bash
docker compose up --build
```

## Demo credentials

Visible on the login screen when `VITE_DEMO_MODE=true`:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@justicegrid.test` | `Admin@12345` |
| Auditor | `auditor@justicegrid.test` | `Auditor@12345` |
| Legal professional | `lawyer1@justicegrid.test` … `lawyer10@justicegrid.test` | `Lawyer@12345` |

## Scripts

| Command | Does |
|---|---|
| `pnpm dev` | Run API + web in watch mode |
| `pnpm build` | Build all packages/apps |
| `pnpm test` | Run all unit/integration tests |
| `pnpm test:e2e` | Run the Playwright E2E suite |
| `pnpm lint` / `pnpm typecheck` | Static checks across the monorepo |
| `pnpm db:reset` | Drop, migrate, and seed the database |
| `pnpm db:seed` | Seed only |
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm diagrams` | Render Mermaid diagrams to PNG |
| `pnpm ci` | The exact sequence CI runs |

## Project status

Built in phases per [`JUSTICEGRID_BUILD_SPEC.md`](JUSTICEGRID_BUILD_SPEC.md) §15. Currently:
**Phase 0 — monorepo scaffold** (this commit). See that spec for the full 13-phase plan and the
definition of done.

## Documentation

Everything under [`docs/`](docs/): problem statement, SRS, architecture, data model, API
reference, the rule engine algorithm, security/threat model, test plan, traceability matrix, demo
script, viva Q&A, and limitations/ethics. Written progressively as each phase lands.

## Known deviations from the spec

- Node/toolchain: pinned to Node 20 LTS via `.nvmrc`/`engines` even though the dev machine's
  default `node` may be newer — the API's Docker image and CI both use `node:20-alpine` /
  `actions/setup-node@v4` with `node-version: "20"`.
- Password hashing uses **`@node-rs/argon2`** rather than the `argon2` npm package: it ships
  prebuilt native binaries (no local toolchain/compiler needed) while still implementing Argon2id
  with the parameters specified in `docs/06-security.md` (`memoryCost 19456, timeCost 2,
  parallelism 1`).

Any other blocker encountered during the build is recorded in `docs/BLOCKERS.md` with the
workaround applied.
