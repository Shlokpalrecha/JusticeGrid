# JusticeGrid Track 4 implementation

Engine 3.0.0 replaces hardcoded ranking decisions with a runtime text-rule program. The researched U0–U3 model, A01–A17 source workflows and protected referral/deadline safeguards remain. The earlier additive engine and its active API/editor remain retired. Research under `docs/research/` explains national legal context; `QUEUE_V2.md` records that workflow model. This document describes the current systems implementation.

The implementation uses deterministic TypeScript, PostgreSQL, custom data structures and Node worker threads. No model, embedding, AI SDK or AI-powered API participates in matching, ranking or workflow execution.

## Requirements mapped to code

| Requirement | Implementation |
| --- | --- |
| In-memory identity resolution | `packages/rules-engine/src/systems/identity.ts`; API `modules/systems/identity.service.ts` |
| Phonetic partitioning and string distance | Soundex posting lists, Unicode normalization, sorted name tokens, bounded Levenshtein |
| Runtime lexer, parser and AST | `systems/expression.ts` and `systems/rules.ts` |
| Thread-safe indexed heap | `systems/heap.ts`; API `lib/activeHeap.ts`; actual `worker_threads` stress scripts |
| Multi-parent DAG and cycle rejection | `systems/graph.ts`; API `modules/systems/graph.service.ts` |
| Normalized persistence and integrity | Prisma schema and migrations `20261030010000_systems_layers`, `20261030013000_normalized_rule_programs` |
| Immutable transition history | `lib/audit.ts`, PostgreSQL `Activity_Log` trigger, systems rejection guard |
| Usable administration | Systems workbench, Queue Policy text rules, case links and action AST traces |

## Identity index

Each source record retains an independent ID. A custom `Map<blockingKey, Set<recordId>>` inverted index actively holds Soundex name-token blocks, exact filing/evidence-reference blocks and event-date blocks. Normalized name tokens are sorted, so `Rahul Sharma` and `Sharma Rahul` reach the same comparison. Name typos use threshold-three Levenshtein distance; a slightly changed date does not invalidate a name/reference candidate. Soundex is English phonetic partitioning; non-Latin tokens use a Unicode-prefix fallback, not a claim of language-independent phonetic equivalence.

The application hydrates authorized records in 500-row cursor pages after restart, cache eviction, data-generation changes or scope changes. Matching itself uses the in-memory index; there is no SQL fuzzy-name or candidate lookup. Database reads still authorize access, persist records and check generations. Four actor-scoped indexes are retained, each capped at 50,000 records, with at most 12 phonetic token postings plus reference/date postings per record. Source strings and ingestion batches are bounded by API validation.

Each lookup considers at most 128 candidates, preferring exact references and then rare blocks. Overflow returns `AMBIGUOUS_CAPACITY`, never a uniqueness claim. `NO_CANDIDATE` means only that no candidate passed these bounded blocks; it does not certify distinct identity. A distance displayed as `>3` is a threshold result, not an exact distance. Similarity never automatically merges people or evidence. Human decisions `LINK`, `DISTINCT` and `SPLIT` use revision checks and preserve both original records. A split removes the reviewed relationship, not source history. Decisions are pairwise; no implicit transitive identity cluster is asserted.

With bounded input length L and fixed posting count, expected hash-index insertion is O(L log L) for token normalization/sorting and O(1) posting updates. Candidate work is O(K·k·L + K log K), with K ≤ 128 and k ≤ 3, independent of total N. The two-row banded distance uses O(L) scratch memory and touches only O(kL) cells. This avoids an all-pairs O(N²) pass by explicitly surfacing crowded blocks; it does **not** promise exhaustive fuzzy recall. Cold rebuilding is O(N·L log L), plus database I/O. Scope membership checks require reading accessible case IDs. A different process's writes trigger a rebuild through the database generation; this prototype favors coherent, bounded state over distributed-index throughput.

## Runtime rule language

Administrators edit `when` and numeric `value` strings in Queue Policy. The backend tokenizes them, checks field names/types, and constructs frozen AST nodes before publication. There is no `eval`, `Function`, JavaScript execution, property access or user SQL. Supported syntax:

```text
expression := literals | fields | (expression)
            | NOT expression | !expression | +expression | -expression
            | expression (OR | AND) expression
            | expression (= | == | != | < | <= | > | >=) expression
            | expression (+ | - | * | /) expression
            | MIN(a,b) | MAX(a,b) | FLOOR(a) | ABS(a)
```

Precedence is OR, AND, comparisons, addition/subtraction, multiplication/division, unary operations. Strings are quoted; booleans are TRUE/FALSE. Keywords are case-insensitive, field names are case-sensitive. Expressions have at most 8,000 characters, 1,024 tokens and 48 recursive parser levels. Programs contain 1–128 rules; a bounded 32-program cache avoids reparsing the active policy on every action. Compilation/evaluation are linear in bounded expression size, apart from constructing the rule dependency DAG.

Example rule data (append to the baseline program when appropriate):

```json
{
  "id": "near_confirmed_deadline",
  "when": "Statutory_Deadline_Days <= 3 AND Offense_Severity_Index >= 5",
  "urgency": "U1",
  "component": "D",
  "value": "MIN(4, Offense_Severity_Index)"
}
```

`Statutory_Deadline_Days` comes only from a confirmed critical legal action's remaining deadline. `Offense_Severity_Index` (0–10) and nullable `Bail_Eligibility` are explicitly human-reviewed case inputs with evidence, author and timestamp. Relevant legal-fact changes invalidate these inputs. Unknown facts propagate NULL, including `NOT UNKNOWN`; division by zero/nonfinite results are UNKNOWN. Only TRUE matches. These inputs prioritize human work and never decide guilt, bail or entitlement.

A rule can declare `dependsOn: ["another_rule"]` and reference `rule_another_rule`. The compiler requires that dependency declaration and rejects unknown vertices, duplicate IDs and cycles before activation. Dependencies must all match before a dependent rule can match. Trace output records each condition's TRUE/FALSE/UNKNOWN result and numeric value. Each support family takes its maximum matched contribution, floored and capped H5/A4/B4/D4/F3, totaling at most 20. Urgency comes before support in ordering. Explicit safeguards prevent configuration or overrides from hiding protected referral/confirmed deadline work or promoting routine work to protected U0.

Published rules and dependency edges have normalized rows keyed by policy/rule IDs. Policy versions are immutable application history. Publication takes an exclusive policy advisory lock and atomically reevaluates cases; rollback publishes a previous program as a new version. Snapshots retain the complete effective program for deterministic replay. Historical evaluations with a different engine version remain history and are not falsely replayed as v3.

## Heap and concurrency

`SharedPriorityHeap` stores an indexed min-heap in a `SharedArrayBuffer`. It has an `Int32Array` mutex/header, ID-to-position array and fixed-width numeric rows. All reads and mutations acquire an `Atomics.compareExchange` mutex, wait in bounded two-millisecond intervals, and release in `finally`. There is no awaited work inside the critical section. Methods support upsert, remove, pop, snapshot, atomic replacement and ordered snapshot extraction. Mutations accepting `expectedRevision` reject stale edits with `HeapConflict`. Node's event loop alone is not treated as thread synchronization.

The API uses this heap to order authorized queue snapshots by urgency, deadline, descending support, activation instant and stable case-reference/ID ordinal. Stable text ordinals require O(N log N) sorting; priority ordering comes from the heap. Upsert/remove/pop are O(log N), ID lookup O(1); full construction/extraction is O(N log N). A six-key row needs 56 bytes plus a four-byte position slot and a 16-byte header (alignment may add four bytes). A 2,000-entry heap uses 120,016 shared bytes. API heaps cap at 65,536 entries per operational scope and retain at most eight snapshots. Capacity exhaustion is explicit.

Workers sharing the same buffer coordinate through the actual mutex. Independent API processes do not share JavaScript memory: PostgreSQL transaction locks, record/graph revisions and a persisted queue generation coordinate those processes; each process constructs its own coherent heap snapshot. API ordering is a projection, not an independently writable duplicate database. Do not represent this as a distributed shared-memory queue. Heap locks bound their waits; a terminated worker holding a lock requires rebuilding that heap from durable state.

Case writers acquire locks in order: shared policy lock, global case-writer advisory lock, case lock, then downstream audit/generation locks. Policy publication takes the exclusive policy lock first. Identity operations use their own advisory lock before audit. All locks are transaction-scoped; rollback releases them. Serializing case writers prevents lock-order inversion and lost edits, with an intentional throughput tradeoff. This is a coherent prototype, not a horizontally scaled high-throughput coordinator.

## Workflow DAG

Nodes and edges are separate normalized relations. Every edge's composite foreign keys reference nodes in its own graph. Custom iterative DFS detects cycles and reports the cycle path; custom Kahn sorting produces topological order and parallel layers, both O(V+E) time/space. Unknown endpoints and duplicate vertices are rejected. No recursive DFS stack can overflow on a long graph.

The Track 4 example has `Evidence_Discovery → Trial_Docketing` and `Pre_Trial_Motion_Hearing → Trial_Docketing`. Trial becomes ready only after **both** predecessors are DONE. The API checks this inside the locked transaction. Completing a node requires evidence and the current graph revision; concurrent edits from the same revision yield one success and one HTTP 409. A completed child prevents reopening its prerequisite; completed historical nodes cannot be silently removed. Configuration changes cannot introduce an unfinished prerequisite behind a completed node. Cycles return HTTP 422 `CYCLE_DETECTED`; premature transitions return 409 `DEPENDENCY_BLOCKED`.

Ready nodes generate real A16 queue actions, with persisted readiness instants. Completing or blocking a node reconciles those generated actions in the same transaction. The existing source-based A01–A17 workflows remain useful legal-aid projections alongside this configurable graph. Action-parent urgency inheritance also uses a cycle-checked topological pass.

## Database and activity history

`SystemRecord`, `IdentityDecision`, `WorkflowGraph`, `WorkflowNode`, `WorkflowEdge`, `CaseRuleEvidence`, `RuntimeTextRule` and `RuntimeRuleDependency` store separate entities, atomic scalar fields and foreign-key relationships. Graph deletion cascades its structure; edge endpoints, reviewed identity records, policy dependencies and user references use restrictive foreign keys where deletion would destroy provenance. JSON in evaluation snapshots and activity old/new values deliberately preserves historical documents; it is not the source of graph/rule relationships.

Every call to the central audit writer appends a final `Activity_Log` row in the same transaction as the mutation, including actor, timestamp, action, entity, old/new values, request ID, previous hash and SHA-256 hash. The audit advisory mutex precedes sequence reservation, preventing chain forks. A PostgreSQL trigger rejects UPDATE and DELETE; there are no mutation endpoints. Verification pins the visible ledger head and streams 500 rows at a time, so concurrent appends cannot prolong a verification indefinitely. Rejected system conflicts, cyclic programs/graphs, blocked transitions and malformed expressions are logged in a separate transaction after the rejected mutation rolls back. The existing Audit screen's `AuditLog` remains a compatible view of application history; the new ledger adds final-on-insert database-enforced immutability.

An application-role ledger is not immune to a PostgreSQL superuser who can disable triggers or truncate tables. Tests deliberately truncate their isolated database; no application route exposes truncation. Use separately restricted database ownership/credentials before treating this as a production audit boundary. Historical pre-migration events are retained in `AuditLog`; they are not fabricated as new ledger events.

## Run and demonstrate

Follow the README's local setup, run `db:generate` and `db:migrate:deploy`, build shared/engine packages, then start the API and web app. Existing demo data is preserved by migrations; do not seed/reset an existing database to upgrade it.

1. Sign in as an administrator. Open **Systems workbench → Identity**. Ingest synthetic records, then query an inverted name or exact evidence reference. Select two records, provide a reason, record LINK, and later SPLIT. Both records remain.
2. Open **Rules**. Compile `Statutory_Deadline_Days <= 3 AND NOT Bail_Eligibility` with a nullable bail input. Inspect the AST and UNKNOWN result. Try `process.exit()` to see a parse rejection.
3. Open **Queue Policy**, edit text rules, apply the candidate, simulate, then publish with a reason. Inspect an action's AST trace. A cyclic `dependsOn` program is rejected before publication.
4. Open a case's **Workflow dependencies and reviewed rule inputs** link. Configure the supplied three-node graph. Complete the two prerequisites with evidence; Trial appears ready in the workbench and as a real queue action. A reverse edge creating a cycle is rejected. API clients can submit the same `expectedRevision` concurrently to observe a 409.
5. Open **Ledger**, verify integrity and inspect old/new snapshots and rejected operations. Swagger at `/api/docs/` documents all systems endpoints. Mutation access is ADMIN or scoped LEGAL_PROFESSIONAL; AUDITOR is read-only; rule publication/compiler and the global systems ledger are ADMIN-only.

Run real multithreaded heap contention from the repository root after building the engine:

```powershell
pnpm --filter @justicegrid/rules-engine build
pnpm systems:stress
# Optional: 2–16 workers, at most 65,536 total entries
node scripts/systems-stress.mjs 8 1000
```

The harness starts real workers together on one buffer, mixes indexed insert/update and stale-revision edits, imposes a 30-second worker deadline, and verifies cardinality, unique IDs and complete heap order. Its timing is a local measurement, not a production throughput guarantee. Focused systems tests are consolidated into five engine invariant tests and five API integration tests. The existing broader suite and coverage gates remain in place.
