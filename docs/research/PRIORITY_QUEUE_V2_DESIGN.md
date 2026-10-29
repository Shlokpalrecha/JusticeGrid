# JusticeGrid priority queue v2: proposed design

Status: research proposal, 29 October 2026. India-wide baseline. **Not an activated or legally approved ruleset.** Source IDs refer to `PRIORITY_QUEUE_RESEARCH.md` in this directory.

## 1. Product contract

Rank unresolved **actions** for an authorized team's review. A case appears once in the case queue using its most urgent action, while the detail view shows all actions. No output decides legal eligibility, release, or a person's worth. Retain synthetic-only data, human decisions, deterministic evaluation, and explanations required by the build specification.

Separate three things:

| Layer | What it contains | Who/what can change it |
|---|---|---|
| Legal/procedural profile | Applicable text/version, territory, commencement/savings, legal clock definitions and exceptions | Reviewed profile publication with evidence and change reason |
| Case facts and confirmed dates | Events, documents, verification, counsel-confirmed review dates, external barriers | Authorized case users; corrections audited |
| Ranking policy | Urgency windows, operational caps, weights, aging, team service targets | Versioned team policy; simulation before activation |

Legal text does not prescribe the numerical weights below. Every number in the ranking policy is a **candidate prototype choice**. Source-derived periods retain their own meaning and are never silently edited as ordinary weight settings.

## 2. Urgency before weights

Use four levels with descriptive UI labels. These replace score-derived HIGH/MEDIUM/ROUTINE; historical evaluations keep their original labels/version.

| Level | Candidate inclusion | Interpretation |
|---|---|---|
| U0 — Immediate attention | Reported active urgent-care/safeguarding referral awaiting response; counsel-confirmed statutory/court action deadline due within 24 hours or overdue; confirmed statutory requirement to act forthwith not completed | Display in a persistent urgent area. Direct a human to the responsible channel immediately. Never wait for the next nightly sweep. |
| U1 — Time-sensitive review | Confirmed critical legal/court date in 24–72 hours; imminent hearing with linked unmet preparation/representation; overdue national procedural follow-up such as legal-aid or post-bail-release steps; prompt verification of missing critical legal facts | Visible action, owner, relevant date, and escalation route. Does not imply that a court must grant any relief. |
| U2 — Follow-up needed | Necessary work due in seven days; routine document/assignment blockage; qualified pending-bail review; UTRC preparation without a nearer critical date; overdue ordinary team tasks | Organize operational work. Routine administrative lateness alone cannot enter U0. |
| U3 — Scheduled/routine | Later scheduled work or active cases with no currently triggered unresolved action | Show next planned review. Missing critical information is not a reason to declare routine. |

The 24/72-hour and seven-day ranking windows are team-policy candidates. They do not replace a court's deadline or convert SOP expectations into statutory release rights. A task needs a structured critical-action classification and evidence; a user typing “urgent” into a title cannot create U0.

Medical/safeguarding and legal-deadline U0 actions must also appear in separate visible urgent lanes so a single ordered list cannot hide one behind the other. The application records a referral and acknowledgement; it does not diagnose illness or provide emergency response. For a reported urgent need, do not wait for medical-document verification before surfacing the referral. Record whether the report is verified without lowering the need to respond. [S3]

## 3. Candidate weights: only compare work after urgency and deadline

For the action selected to represent a case:

```text
S = H + A + B + D + F       where 0 <= S <= 20
```

| Component | Candidate values and rationale |
|---|---|
| H — Linked hearing work, cap 5 | 5: hearing within 3 calendar days with an unmet linked preparation requirement; 3: same within 7; 1: necessary attendance/appearance confirmation remains; 0: no unresolved linked hearing work. Use the maximum, never add the nested windows. |
| A — Access to representation/communication, cap 4 | 4: effective representation absent for the selected action; 2: unresolved interpreter/client-communication need; 0: no such unmet need. Its urgency may already create U0/U1 independently of this score. |
| B — Blocker/ownership, cap 4 | 4: necessary action blocked by an unavailable required document, external response, or missing accountable owner; 2: ordinary coordination obstacle; 0: none. A document request does not remove the obstacle. |
| D — Verification work, cap 4 | 4: a specific critical fact needed for this action is unknown/conflicting; 1: ordinary record correction; 0: no verification gap. Show the missing fact. Never subtract points because data is incomplete. |
| F — Waiting safeguard, cap 3 | `min(3, floor(unresolvedCalendarDays / 7))`, measured from the same action episode's first activation. Notes/reassignment do not reset it. |

These are ordinal policy values, not probabilities. Higher precision would suggest unsupported accuracy. Capping families limits the influence of correlated flags and discourages users from manufacturing priority by splitting tasks. Components describe the selected action and its dependencies; unrelated backlog on the case does not inflate that action's score.

**No points for allegation severity, predicted outcomes, caste, religion, gender, nationality, or a “first-time” label.** Where a source calls for a category-specific review or an accommodation, create the specific source-linked action. Its priority follows the pending action and time, not a blanket identity weight. Do not penalize a case for multiple offences or special-law status; those facts affect a legal route's applicability, not the value of assistance.

## 4. Deterministic queue order

For each unresolved action, derive:

```text
urgencyRank                 U0=0, U1=1, U2=2, U3=3
orderingDeadline            confirmed action deadline or explicit team review-by time
supportScore                0..20
firstActivatedAt            original unresolved episode
```

Compare actions lexicographically:

1. urgency rank ascending;
2. ordering deadline ascending, unknown last;
3. support score descending;
4. first activation ascending;
5. case reference, case ID, action ID ascending using a fixed comparator.

For an immediate referral with no clock, set an explicit response-review time at activation and mark it `IMMEDIATE_REFERRAL`, not a fictional legal deadline. For critical unknown facts, create an explicit verification action with a candidate 24-hour **team** review target; retain UNKNOWN for the legal deadline. Do not rank an absent legal date as if it were established.

Select each case's best action with the same comparator. Sort cases by that action's key, including stable IDs. For an active case with no open action, create a U3 display row with its planned review date; it is not a fabricated task. Visibility authorization is applied before ranking or aggregation. Compare instants as epoch values and date-only fields as validated civil dates; never compare arbitrary ISO offset strings lexicographically.

Examples:

- A verified court deadline tomorrow is U0 even with `S=0`; a U2 administrative case with `S=20` cannot outrank it.
- A hearing's missing preparation task, related missing document, and deadline may explain one action. The three hearing-window flags no longer add ten points.
- One hundred duplicate records cannot create one hundred score contributions. Distinct genuine actions remain visible even though the case has only one queue position.

Prevent starvation operationally as well as numerically: provide an oldest-unresolved U2/U3 view and a daily review task for the team lead to allocate routine capacity. Do not promote ordinary backlog over a live legal deadline just to satisfy an aging formula. Staffing/capacity is a separate human decision.

## 5. Proposed action catalog

The source supplies the underlying procedure; tier assignment, look-ahead, and support score are product policy. An action can escalate to U0 only under §2, not merely because it belongs to a named legal category.

| ID | Action and necessary evidence | Clock/source | Candidate level |
|---|---|---|---|
| A01 | Refer urgent medical/safeguarding report and record response | Reported need; immediate referral procedure [S3]. Claimed minority uses its own referral, without machine age adjudication. | U0 while active/unacknowledged; acknowledged cases retain an explicit next action until resolved. |
| A02 | Forward legal-aid request to DLSA | Request receipt; 24-hour procedure [S3 §7.1] | U1 when near/due/overdue; U0 if a separate imminent court deadline creates critical prejudice. |
| A03 | Confirm appointment and communicate details | DLSA receipt; 48-hour procedure where no lawyer appointed [S3 §7.2–7.4] | U1. Appointment does not resolve a separate communication failure. |
| A04 | Verify effective representation/contact; arrange interpreter if needed | Actual counsel/acceptance/contact information, not workflow assignee [S2, S3, S9] | U1 for custody access gap; hearing deadline may elevate. |
| A05 | Review investigation/default-bail timing and preserve necessary application steps | Counsel-confirmed date; procedural profile, remand and filing/extension evidence [S1 §187, S10, S11, S14] | U1 approaching; U0 for a confirmed critical action within 24h/overdue. UNKNOWN produces verification work. |
| A06 | Review §479/CrPC-related prolonged-custody pathway and required follow-up | Verified profile, punishment, custody ledger, convictions, multiple-case/offence status, exclusions, court orders [S1, S7] | U1 approaching confirmed review; U0 for confirmed forthwith application duty awaiting action. Never label “eligible for release.” |
| A07 | Follow up bail grant and remaining release barriers | Grant/order communication, release confirmation, barriers [S6] | Start follow-up immediately after recording grant. U1 at seven-day non-release escalation; U0 if another confirmed immediate duty applies. |
| A08 | Review unfurnished bonds/conditions | Grant plus one calendar month; court may consider changes [S6] | U1 review prompt, with discretionary nature displayed. |
| A09 | Follow reviewed financial-support workflow | Confirmed scheme applicability, stage receipts, committee decisions [S8] | U1 for due/overdue procedural stages; local calendars/anchors must be configured. No automatic funds approval. |
| A10 | Prepare for a particular hearing | Hearing ID, expected work, linked tasks/documents and actual representation [S12, S13; preparation window is policy] | U1 within 72h if unmet; U2 within seven days; actual critical deadline can elevate. |
| A11 | Verify non-production or obtain next hearing date/purpose | Past actual hearing/production record; expected report [S12 items 11–17] | U1 for unresolved custody/production concern; ordinary record follow-up U2. Missing data is not proof of unlawful detention. |
| A12 | Obtain and review an order, then track its directions | Distinct order expected/received/reviewed events and verified direction deadlines | U0/U1 if a confirmed direction demands it; otherwise explicit team SLA U2. No universal seven-day assumption. |
| A13 | Review unresolved regular-bail application status | Application type, filing date, outcome, intervening applications and special mandate [S5 §73(k)] | U2 qualified review around two weeks; U1 if near hearing or other urgent facts. Not automatic relief. |
| A14 | Review Magistrate evidence-stage delay | First date fixed for evidence, custody throughout, case type, court reasons [S1 §480(6)] | U1 review when confirmed trigger reached; critical actual court date can elevate. |
| A15 | Prepare/follow UTRC action | Human-reviewed categories, meeting date, recommendation/application/outcome records [S4, S9] | U2; nearer independently urgent action keeps its own level. The unresolved young-adult category is manual-review-only. |
| A16 | Obtain/verify an action-specific document or fact | Required-for-action dependency; requested/received/verified timestamps | U2 normally; inherits critical parent action's deadline rather than multiplying its priority. |
| A17 | Communicate status or follow an undecided legal-aid request | Last meaningful communication/decision events [S3] | Explicit recurrence; national procedure and candidate ranking separated. |

A source containing an out-of-scope category should produce an appropriate referral or manual review, not silently turn this adult-undertrial prototype into a juvenile, preventive-detention, convict-appeal, or remission system.

## 6. Disposition of all 17 seeded rules

| Existing rule / weight | Proposed treatment |
|---|---|
| R-HEARING-3D-PREP / 4 | Merge into hearing-linked A10; H maximum 5, independent urgency. |
| R-HEARING-3D / 4 | Remove unconditional additive points; create only necessary attendance/confirmation work. |
| R-HEARING-7D / 2 | Use alternate window of A10; H=3, mutually exclusive with H=5. |
| R-TASK-OVERDUE / 4 | Classify task purpose, parent action, due-date origin and consequence. Ordinary admin overdue stays U2; genuine critical deadline can elevate. |
| R-TASK-DUE-2D / 2 | Merge with action deadline state; do not independently add to the same task's overdue condition. |
| R-DOC-MISSING / 3 | A16; REQUESTED remains unavailable, RECEIVED is available but may need verification. Derive need from case stage/action, not a universal document list. |
| R-CASE-INCOMPLETE / 2 | A16 verification; UNKNOWN/CONFLICTING distinct from FALSE. Never classify incomplete records as legally safe. |
| R-NO-ASSIGNEE / 2 | Owner-allocation action, distinct from A04 representation. No inference about whether a lawyer exists. |
| R-TASK-UNASSIGNED / 2 | B family or same allocation action; deduplicate with missing case owner when the remedy is identical. |
| R-ORDER-UNREVIEWED / 3 | A12; distinguish obtain vs review. Use received timestamp and any court directions; team SLA explicitly labelled. |
| R-NO-HEARING-DATE / 3 | A11; only when a next date is expected. Separate unknown/awaiting listing/not applicable. |
| R-STALE-CASE / 1 | Action-episode aging F and meaningful status-communication recurrence. Trivial activity does not reset. |
| R-BAIL-STALLED / 2 | A13, qualified two-week regular-bail review instead of universal 21 days. Track application episodes and exceptions. |
| R-ADJOURN-3X / 2 | Retain as contextual explanation/optional U2 review signal, not a national legal threshold or separate unlimited score. Count completed historical outcomes; preserve reasons without automatically blaming the accused. |
| R-DOC-UNVERIFIED / 1 | A16 from existing Prisma `receivedAt`; extend the adapter/engine input. An imminent dependent action can accelerate review. |
| R-TASK-BLOCKED / 2 | B maximum; reason-specific escalation and parent deadline, not an automatic seven-day wait. |
| R-CUSTODY-LONG / 1 | Replace with A05/A06/A14/A15 as applicable. A 180-day generic welfare/status check could remain optional policy, clearly separated from statutory clocks. |

## 7. Data required

Start with operational facts and confirmed review dates, rather than a large offence-law database.

| Record | Minimum additions/clarifications |
|---|---|
| Action | Type, canonical occurrence key, parent/dependency IDs, status, owner, activation, due date, due-date origin, resolution evidence, next review. `caseId + actionType + anchorEntityId + occurrenceId` prevents duplication. |
| Deadline | Anchor event and timestamp/civil date, unit, inclusion/counting convention, applicable calendar, time precision, computed/confirmed date, legal-profile ID/version, evidence, reviewer, confidence state. Distinguish deadline from target/review opportunity. |
| Representation | NONE/REQUESTED/APPOINTED/PRIVATE/UNKNOWN as appropriate; counsel acceptance, actual representation scope, request receipt, DLSA receipt, appointment/intimation/contact events; unresolved communication needs. Workflow owner remains separate. |
| Custody | Arrest, first authorized remand, prison admission, custody intervals, case links, exclusions based on verified orders, release/transfer events. Do not treat every adjournment as accused-caused delay. |
| Procedure/charges | Confirmed regime and savings basis, territory, special statute, current stage-specific charges and verified punishment interpretation. A changed charge invalidates dependent legal calculations. |
| Legal review | Confirmed review date and basis; UNKNOWN/TRUE/FALSE for convictions and external pending cases/offences, verification source/date, exceptions/extensions/court reasons. The existing false-default first-time boolean is insufficient. |
| Bail/release | Application episode/type, filing time, status and intervening events; grant/order receipt/communication, conditions, bond steps, reason for non-release, other detention barriers, actual release confirmation. |
| Hearing/order | Actual vs scheduled status, production method/result, linked prep requirements; order expected, obtained, received, reviewed, directions. Future cancelled/pending events are not completed history. |
| Document | Reuse existing requested/received/verified fields; add action relevance and unavailable/rejected reasons. Avoid a second parallel timestamp definition. |
| Policy/evaluation | Immutable rule/profile/policy versions, evidence snapshot/hash, clock context, ordering key, outcome hash, validity interval, next evaluation time, errors and overrides. |

Use synthetic records only. A prototype's absence of another local case is never evidence of absence of other proceedings. Do not add real identifying data to solve an unverified legal calculation. For category review, a human-confirmed synthetic predicate is preferable to deriving exact legal age from a coarse band.

## 8. Clock and calculation rules

### Engineering requirements

- Inject one `evaluationInstant` through adapter, hearing selection, predicates, deadlines, comparator and simulation. No nested `Date.now()` for substantive choices.
- Hours mean elapsed hours on instants; civil-day policies use Asia/Kolkata civil dates. Calendar months use calendar arithmetic. Working-day rules require the applicable holiday calendar. Store date-only values as dates rather than accidental midnight UTC instants.
- Do not implement one calendar convention for every statute/SOP. Profile the start event, inclusion/exclusion of the start day, boundary and extension handling. A legal day count may differ from generic date subtraction.
- For a court-confirmed date-only deadline, display its precision and obtain the relevant time before treating a particular hour as legally certain. Use a conservative team review target without inventing a legal cutoff.
- Reject future/impossible event sequences and invalid dates. Surface conflicts for correction; do not clamp values silently.

### Legal profiles to defer or restrict

Default-bail calculation requires verified remand/filing/extension sequence and legally approved day counting. Prolonged-custody fractions require approved period arithmetic, qualifying custody intervals, exclusions, charge/punishment interpretation, and route applicability. **Do not use `ceil(years * 365 / 3)` or a fixed 180-day shortcut.**

The first implementation may store a counsel-confirmed threshold/review date and explain its provenance. Later calculators should reproduce that calculation with exact source and assumptions; a contested/unknown profile generates verification work.

For qualified judicial expectations, record exceptions explicitly. An intervening application does not justify an invented blanket pause algorithm. For financial-support stages with uncertain anchors or adoption, keep reminders manual/confirmed until configured.

## 9. Re-evaluation, persistence and publication

Keep `factsHash` for identifying facts, but do not use it alone as an evaluation cache key.

```text
evaluationKey = hash(
  canonicalFacts,
  legalProfileVersions,
  rankingPolicyVersion,
  engineVersion,
  clockContext
)
```

`clockContext` must cover every time-dependent boundary. A calendar date suffices only for exclusively date-based rules. With hour rules, either include the exact injected instant or use a validated interval boundary strategy with `validUntil`. Persist new evidence/reasons/order keys when the outcome changes even if the facts hash does not. Historical replay uses the captured facts, versions and original evaluation instant.

Calculate `nextEvaluationAt` from upcoming action/deadline/aging/hearing transitions, including deadlines crossed during downtime. Use event-driven recalculation plus a small periodic due-work scan; a candidate one-minute scan is an engineering choice, not law. Retain a daily reconciliation as recovery, not the only trigger. Mark stale/error evaluations visibly; never present a failed calculation as routine.

Publish one immutable policy version, recompute a complete candidate snapshot, and activate it consistently. Do not mix rows from different versions during a queue read. Rule creation, updates, toggles and rollback must share this path. Use the same comparator and injected clock in simulation and the live queue. Validate condition-specific parameters, allowed values, non-negative bounded support weights, mutually exclusive windows and mandatory source metadata.

Apply visibility by intersection, never by overwriting ownership filters. Exclude deleted records. Archived/terminal cases normally leave the active-work queue, **except that unresolved release/safeguarding or other explicitly retained actions must be resolved or transferred first**. Suppress inapplicable generic hearing-preparation flags after disposal without suppressing a real pending liberty-related action.

## 10. Explanations and human controls

Each row should say:

> Time-sensitive review — release follow-up remains open after recorded bail grant. DLSA intimation requires review. Grant: [date]; release confirmation: missing; barrier: [reported reason]. Next action: [action], owner: [role], review by: [date]. Basis: [source/locator].

Show fact confidence, clock origin, profile/policy version, support components, and any overlapping evidence suppressed from the calculation. Do not write “bail eligible,” “release guaranteed,” or “risk score.”

A human can correct facts, assign work, acknowledge a referral, or override ordering with a reason and expiry. Acknowledgement does not resolve the underlying action. An override must not erase a source-derived deadline or hide an active emergency; preserve the original condition and route it to an accountable reviewer. Completing a task resolves only that task/dependency, not a distinct release or representation outcome.

Notifications track action episodes and escalation stages, not only `(user, type, entity)` for all time. Reassignment, recurrence, a new hearing, or a new critical stage may need a new notification. Record delivery/acknowledgement status. This prototype should not claim external transmission or integration when it only records an internal task.

## 11. Required verification scenarios

Use scenario tests and invariants, not tests that merely repeat the weight table. Legal boundary tests require the reviewed profile's expected dates.

| Test | Required result |
|---|---|
| Clock-only change | Case enters a new window without edits; stored priority, reasons and ordering key update. |
| Midnight and hour boundary | Kolkata 23:59→00:00 affects civil-day rules correctly; a 24-hour request timer does not fire after only a calendar-date change. |
| Duplicate hearing windows | One hearing inside three/seven days contributes one H value. |
| Duplicate tasks | Same action occurrence repeated does not increase its family score. |
| Critical versus routine | U0 with S=0 precedes U2 with S=20 under all permutations. |
| Unrelated prep | A task linked to another hearing cannot make this hearing unprepared. |
| Hearing history | Future PENDING/cancelled hearings do not reset historical adjournments; elapsed cached dates are reconciled; missing outcome produces verification. |
| Requested/received docs | REQUESTED retains unavailable dependency; verification age starts at RECEIVED. |
| Bail grant without release | Grant creates follow-up; seven-day stage and calendar-month stage are distinct; another custody barrier does not disappear. |
| Default-bail sequence | Earlier invocation is not auto-closed by later filing; disputed extension/filing validity routes to counsel review. |
| Multiple offences/cases | §479 limitations are checked without marking the entire case ineligible for assistance. UNKNOWN external history is not FALSE. |
| Special statute | An ordinary 60/90 profile cannot silently handle NDPS/UAPA extensions; unreviewed profile creates verification action. |
| Older pending matter | CrPC savings do not by themselves exclude the separately confirmed §479 review route. |
| Evidence clock | §480(6) review anchors to the first date fixed for evidence and required custody facts, not intake/arrest. |
| Fraction/date arithmetic | Reviewed year/month/leap-day, custody-interval, exclusion and threshold boundaries are exercised. No generic conversion assumed. |
| Demographic variation | Changing identity alone cannot change operational score; a separately documented accommodation/review action may change work. |
| No effective counsel | A workflow owner does not suppress the representation action. |
| Activity gaming | Notes, reassignment and task splitting do not reset unresolved aging or manufacture score. |
| Lifecycle | Disposal clears irrelevant hearing tasks but preserves uncompleted release/referral work; deletion and scope remain enforced. |
| Rule publication | Create/update/toggle/rollback all produce one consistent snapshot; simulated ordering equals activated ordering at the same clock. |
| Authorization | A lawyer cannot use `assignedTo` or other filters to access another owner's case; the same scope applies to counts and simulations. |
| Historical replay | Captured facts + versions + instant reproduce the evaluation and order, including source evidence. |
| Failure/restart | Missed timers catch up; a failed evaluation is visible and retains its last-valid timestamp, never silently routine. |

## 12. Implementation order and validation

**Stage 1 — repair correctness.** Time-aware persistence and injected clock; hearing derivation/history; document timestamp/status fixes; source-specific validation; authorization intersections; consistent simulation/publication. Add targeted integration tests for persisted clock-only changes and scope bypass.

**Stage 2 — represent the work.** Action episodes, confirmed deadlines, actual representation and release events; lifecycle/dependency handling; recurrence and explanations. Preserve v1 history. Update the build specification with explicit v2 deviations rather than pretending the old additive contract already supports them.

**Stage 3 — shadow ranking.** Evaluate the candidate policy alongside v1 without changing the active queue. Include ordinary, unknown, contradictory, edge-date, special-law and multi-case synthetic scenarios. Record rank changes and reasons.

**Stage 4 — domain validation.** Ask practicing legal-aid/DLSA personnel to independently mark critical actions and compare case pairs, then adjudicate disagreements. A synthetic evaluation can verify consistency; it cannot prove operational benefit. When an appropriately authorized study exists, assess missed urgent actions, time to acknowledgement/action, explanation accuracy, unassigned work, and workload by relevant subgroups. Do not use bail grants or a manufactured distribution as the target label.

**Stage 5 — activate a reviewed policy.** Enable only verified legal profiles. Keep unverified ones as counsel-confirmed reminders. Support version rollback and inspection of every changed ranking. No automatic court filings, government-system access, money disbursement, or judicial decision is introduced by this design.

Before activation, require zero critical misses in the agreed acceptance scenarios, no duplication-driven promotion, correct legal clock boundaries for enabled profiles, complete explanations, consistent simulation/live order, tested access controls, and a named owner for policy maintenance. Numeric sensitivity testing should vary each candidate support weight and look-ahead window; any routine-versus-critical inversion is a design failure, not a calibration tradeoff.
