# Action review queue v2

This records the researched workflow model retained by engine v3. Runtime rules,
the synchronized heap, identity index and branching DAG are documented in
[the current Track 4 architecture](SYSTEMS_ARCHITECTURE.md). The India-wide research and proposed
design are in `research/PRIORITY_QUEUE_RESEARCH.md` and
`research/PRIORITY_QUEUE_V2_DESIGN.md`. The original additive-scoring sections of
`JUSTICEGRID_BUILD_SPEC.md` are historical; its prototype safeguards still apply.

## Ordering

Every unresolved action has its own source, evidence confidence, activation time,
owner, deadline/target and lifecycle. Each case appears once, using its first action
under this order:

1. U0 immediate, U1 time-sensitive, U2 follow-up, U3 scheduled.
2. Earliest action deadline/review instant; absent dates follow known dates.
3. Highest support total, capped at 20.
4. Earliest action activation, then stable case reference and ID.

Within a case, action key and ID resolve exact ties. ISO instants are compared as
timestamps, so different offsets representing the same instant compare equally.
An active case with no unresolved action has a U3 row and its planned review date.
Unknown critical legal facts create verification work rather than a reassuring
routine score. Missing grant/filing dates also create explicit verification work.

U0 protects reported urgent referrals awaiting acknowledgement and supported,
human-confirmed statutory/court actions within the immediate window, overdue, or
requiring action forthwith. Routine lateness and large support totals cannot create
U0. Acknowledged referrals stay open, use a future response-review time and remain
U1 until the source records resolution. Acknowledgement cannot move a legal due date.

The default look-ahead windows are 24 hours, 72 hours and seven days. These ranking
windows are team policy, not legal waiting periods. National procedural and
judicial targets retain their distinct origins. They do not become statutory
release rights.

## Support weights

| Family | Default contribution | Cap |
|---|---|---|
| H: hearing preparation | 5 within three civil days, 3 within seven; 1 for explicitly recorded outstanding attendance arrangements | 5 |
| A: effective access | 4 for absent/unconfirmed accepted representation; otherwise 2 for interpreter/communication barriers | 4 |
| B: dependency/ownership | 4 for a necessary blocker or absent owner; otherwise 2 for ordinary blockage | 4 |
| D: verification | 4 for critical unknown facts; otherwise 1 for ordinary missing information | 4 |
| F: waiting time | One per seven civil days since activation | 3 |

Correlated flags use the maximum within a family. Hearing windows never add
together. Duplicate action keys contribute once. Age, gender, disability, offence
severity and prior demographic labels do not add queue points. Their legitimate
context remains available to human reviewers.

## Research-to-code coverage

Case-specific directions can use `CASE_ORDER` with their actual human-confirmed reference and reviewed intake profile; this source has no invented public URL. A generic intake profile does not verify the individual order.

Source IDs below resolve to the official-document links in
`packages/rules-engine/src/sources.ts` and the Queue Policy screen.

| Category | Implemented source evidence and follow-up | Source |
|---|---|---|
| A01 | Medical, safeguarding and claimed-minority reports; acknowledgement, next review and referral outcome | S3 |
| A02 | Request receipt to DLSA forwarding; 24 elapsed hours | S3 7.1 |
| A03 | DLSA receipt to appointment; 48 elapsed hours; appointment intimation is a separate action | S3 7.2–7.3 |
| A04 | Actual representation, counsel acceptance, communication and interpreter needs; assignment does not prove representation | S2, S3, S9 |
| A05 | Human-confirmed investigation/default-bail review with profile, anchor, source, counting convention and assumptions | S1, S10, S11, S14 |
| A06 | Human-confirmed prolonged-custody review; custody ledger, history, current charges, exclusions and procedure retained for review | S1, S7 |
| A07 | Bail-order communication by the next civil-day end; seven-day non-release follow-up, DLSA intimation and other detention barriers | S6 |
| A08 | Unfurnished bonds at one calendar month; discretionary modification review | S6 |
| A09 | Applicability and stage-specific, human-confirmed scheme targets; committee calendar only when explicitly confirmed | S8 |
| A10 | Preparation tasks/documents and attendance concerns linked to a specific hearing | S12, S13 |
| A11 | Actual non-production, elapsed pending hearing outcomes, expected next listing | S12 |
| A12 | Order expected, obtained, reviewed and separately recorded directions | S12; confirmed court order |
| A13 | Regular/anticipatory application status reviews; qualified 14/42-day expectations or explicit next review | S5 |
| A14 | Human-confirmed evidence-stage review; first evidence/custody/exception facts remain visible | S1 |
| A15 | Human-selected UTRC categories, meeting, recommendation, application, order and outcome | S4 |
| A16 | Relevant document obtain/verify steps, missing facts, ownership, ordinary work and linked dependencies | Team policy |
| A17 | Two-day undecided-aid follow-up and two-calendar-month meaningful status communication | S3 |

The scheme implementation does not guess unconfirmed local stage anchors or working
calendars. Users can record a confirmed stage date and its basis. A calendar-only
committee meeting uses 09:00 India time as an explicit **team preparation target**,
not an official legal cutoff. Excluded scheme applicability never removes ordinary
legal assistance.

## Legal date boundary

**Automatic statutory entitlement calculators are disabled.** A05, A06 and A14
support explicit, source-bound human-confirmed review dates. The software does not
calculate default-bail entitlement, a first-offender fraction, a sentence maximum,
release eligibility or an automatic stay/pause from sparse case metadata.

A protected date requires a reviewed, immutable applicability profile, matching
procedure/source, an anchor, precise confirmed time, assumptions and counting
convention. Confirmations identify the authenticated reviewer. A date-only legal
record produces a team verification target; its displayed hour is not a legal cutoff.
Material changes to charges, custody or legal-clock basis invalidate dependent
confirmations. Clearing that warning requires a fresh confirmation. A later filing
does not silently erase an already recorded review/application step.

Profile creation records a human source review; it does not establish that an
administrator is professionally qualified or that every later judgment has been
checked. Professional legal validation and applicable local procedure remain
necessary before real-world use. This prototype only contains synthetic data.

## Persistence and lifecycle

- `Case.workflowFacts` stores validated evidence with an optimistic revision.
  UNKNOWN is distinct from FALSE. Chronology, duplicate IDs, overlapping intervals
  and cross-case links are checked. Active referrals/reviews cannot be silently deleted.
- `WorkflowAction` stores generated and manually recorded episodes. Status, explicit
  ownership, next review, evidence and coordinator overrides survive recalculation.
  Action owners must be an active coordinator or the assigned legal professional; inactive/inaccessible owners create allocation work. Activation does not reset on ordinary edits or reassignment. Recurrence creates a
  new episode. Closed history cannot be reopened, reassigned or overridden.
- Generated work resolves through its source task/document/event. Non-production
  follow-up can be resolved with a recorded human outcome. Open dependencies prevent
  manual parent closure and propagate urgency/deadlines. Relevant release, referral
  and confirmed-review actions survive disposition, transfer and archival.
- Coordinator overrides expire within seven days, require reasons, and cannot hide
  protected work or manufacture routine U0 work.
- `QueueEvaluation` preserves exact input, policy, engine version, evaluation time,
  facts/output hashes and result. Replay does not write and rejects a different engine version. The interrupted, experimental 2.0.0 snapshots remain readable history; they are not falsely replayed with the finalized 2.1.0 engine. The facts hash excludes
  untouched auto-derived OPEN cache rows; human lifecycle changes and closed
  episodes remain part of the facts. Clock-only changes persist when output changes.
- `QueuePolicy` publication acquires the policy lock and re-evaluates every case in
  one transaction. Writers use a shared policy lock and a case lock before changes.
  Failure rolls everything back. Simulation is read-only at one time/snapshot;
  rollback publishes the old configuration as a new version.
- One-minute reconciliation and on-read refresh handle elapsed time; a daily full
  reconciliation repairs missed work. Concurrent refreshes are coalesced and
  recheck freshness under the case lock. Failures preserve the last result with an
  explicit stale/error indication. A case with no valid result is not silently
  presented as routine.
- Notifications are deduplicated by case/action episode, owner, deadline and stage.
  New recurrence or escalation can notify again. Daily oldest-work reminders
  reserve attention for U2/U3 work without displacing protected urgency.

## Integration and removal of v1

The additive engine implementation, Rule CRUD/simulation API and Rules Admin page
are removed from active code. HIGH/MEDIUM/ROUTINE are absent from active queue DTOs
and screens. The migrations add the full comparator cache (including activation and planned review) for consistent case-list sorting, disable old rules/configurations and reset the old
case priority cache. Legacy database tables and evaluations remain inactive history;
they are never consulted for current ranking.

Current APIs live under `/api/v1/workflows`, `/api/v1/queue-policy` and
`/api/v1/priority`; generated OpenAPI describes the routes. Legal professionals see
their assigned cases, including queue filters and distributions. Auditors can read
but cannot mutate. Policy publication/profile creation/overrides require an admin.

The web application provides two urgent lanes, the combined queue, an oldest-work
view, evidence/calculation panels, case evidence/action controls and linked activity
editors. Dashboard, filters, reports, CSV exports and notifications use the new
model. Document templates are optional until a reviewer records their relevance.
Seed examples are explicitly fictional; upgrading the existing demo does not run a
destructive reset or seed.

## Verification

The engine suite covers all action categories, protected urgency, offsets, date-only
handling, month/leap boundaries, score caps, dependencies, recurrence, temporal
changes and replay. API tests use an isolated `_test` database, with an enforced
reset guard, and cover authorization, optimistic edits, atomic publication/rollback,
failure handling, notifications and the HTTP contracts. Final executed results are
recorded in `QUEUE_IMPLEMENTATION_CHECKLIST.md`.
