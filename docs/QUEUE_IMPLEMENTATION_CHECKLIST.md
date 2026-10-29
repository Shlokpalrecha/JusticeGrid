# Action queue implementation

This replaces the active additive scoring feature. Legacy database evaluations remain immutable historical records; they are not used for current ranking.

- [x] Pure U0–U3 action engine; all A01–A17 workflows; grouped support weights; stable ordering; date/hour/month/business-calendar boundaries.
- [x] Validated facts, human-confirmed legal dates, source profiles, action episodes, acknowledgement/resolution/dependencies/overrides.
- [x] Additive migration preserving history; remove active legacy rule routes, seeds, screens, contracts and tests.
- [x] Atomic policy publication/simulation/rollback; snapshots, replay, temporal persistence, stale/error handling.
- [x] Scoped API, one-minute reconciliation, episode notifications, lifecycle retention and hearing/document corrections.
- [x] Queue, urgent lanes, oldest-work view, case workflow forms/action controls, policy administration, dashboard/reports.
- [x] Meaningful engine/API/browser tests, migrations, build, typecheck, lint and documented coverage/limitations.

Research source: PRIORITY_QUEUE_RESEARCH.md and PRIORITY_QUEUE_V2_DESIGN.md under docs/research. Legal entitlement calculators remain intentionally disabled pending verified calculation profiles; confirmed review dates are supported.


## Earlier v2 verification — 29 October 2026

- Engine: 70 tests passed after consolidating 18 repetitive invalid-policy cases into one test with the same assertions (previously 87 tests). Coverage: 99.72% statements, 97.21% branches, 96% functions; all existing gates passed.
- API: 215 tests passed. Coverage: 91.91% statements, 80% branches, 96.37% functions; all existing gates passed. Tests used `justicegrid_test`, never the demo database.
- Shared contracts: 10 tests passed. Frontend: six tests passed, including successive action occurrences, India-time form entry and StrictMode refresh handling.
- Browser: all five flows passed across the final suite and a focused rerun of the corrected badge selector. The four other flows passed in the full run; the remaining protected-lanes/filter check passed after targeting a visible badge instead of a hidden dropdown option. Flows cover both urgent lanes, acknowledgement/correction, action resolution, policy preview invalidation and auditor access.
- Browser tests ran on ports 4001/5174 against the separately migrated and seeded `justicegrid_browser_test` database. The existing 86-case demo was preserved. The browser verification action created in the demo was resolved with its test evidence retained.
- Shared/engine builds, API build/typecheck, frontend typecheck and production build passed. Source and browser-test lint passed with zero errors. The production frontend build retains its existing large-chunk advisory; it does not fail compilation.
- Both v2 migrations were applied to the demo, API-test and browser-test databases. An empty browser database successfully migrated through all five migrations and seeded all 86 synthetic cases, including separate U0 examples.
- Git whitespace validation passed. No cloud deployment, publication or production data migration was performed.

## Deliberate limits

A05/A06/A14 use human-confirmed review dates and reviewed source applicability profiles. Automatic statutory entitlement calculators remain disabled as specified by the research. A09 requires confirmed stage anchors/dates or an explicitly confirmed committee calendar; the displayed calendar-only meeting hour is a team preparation target. Professional legal validation and local applicability review remain necessary before any real-world use.

The old additive engine, active rule editor and rule routes are removed. Historical database evaluations and the original research/specification are retained with their supersession clearly documented. See [the current implementation contract](QUEUE_V2.md) and [run instructions](../README.md).

## Track 4 systems upgrade — engine 3.0.0

- [x] Bounded Soundex inverted index, banded Levenshtein, authorized stream ingestion, reviewed identity links/splits and explicit ambiguity/capacity handling.
- [x] Typed runtime lexer/AST evaluator, normalized published rule/dependency rows, cycle rejection, UNKNOWN propagation and per-action traces.
- [x] Indexed shared-memory heap, Atomics mutex, optimistic revision checks and actual simultaneous worker-thread contention harness; CI runs the harness.
- [x] Normalized multi-parent workflow DAG, iterative cycle detection, custom topological layers, all-parent gating, revision-controlled transitions and ready-node queue integration.
- [x] Database-enforced append-only Activity_Log, serialized hash-chain appends, bounded-memory verification, rejected-operation history and automatic queue-transition history.
- [x] Scoped systems API, Swagger registrations, workbench, policy text editor with unapplied-edit gating, case links and algorithm/complexity documentation.

Current verification is deliberately focused rather than a repeat of the entire v2 API/browser suite. All 75 engine tests pass with coverage gates intact (99.8% statements, 96.91% branches, 98.78% functions). Only five consolidated engine invariant tests and five API systems tests were added. The final systems plus existing case-creation run passed 11 checks; existing API-documentation checks passed 3 and central audit checks passed 13. API/shared/engine builds and API/frontend TypeScript checks pass. The frontend production build passes with its existing chunk-size advisory. Changed TypeScript source lint passes; existing seed console warnings remain.

A real four-worker run handled 2,000 entries in 120,016 shared bytes, rejected 890 racing/stale revisions and preserved cardinality/order without deadlock (304 ms locally; timing and collision count vary by scheduling). Demo and API-test migrations were applied without reseeding the existing demonstration data. Local HTTP verification returned engine 3.0.0, an active heap, a typed AST with UNKNOWN preserved, and an intact Activity_Log chain. Browser automation was disabled by Work settings, so no new browser interaction pass is claimed. The broader API coverage run was not repeated for this upgrade.

See [Track 4 architecture](SYSTEMS_ARCHITECTURE.md) for the current implementation, constraints and judge walkthrough. Identity matching covers source records ingested into the systems intake; it does not claim exhaustive fuzzy matching of unrelated tables or automatically consolidate existing Person records.
