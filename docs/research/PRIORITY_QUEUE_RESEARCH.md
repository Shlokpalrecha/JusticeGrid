# JusticeGrid priority queue: India-wide research and code audit

Research date: 29 October 2026. Scope selected by the user: India-wide baseline.

## Recommendation

Replace the single additive score with an **action-based review queue**: protected urgency level first, relevant action deadline second, bounded operational weights afterwards. Preserve the pure, deterministic engine and its explanations. The output should identify the next work for an authorized team, with a source and evidence, rather than decide bail, release, guilt, or dangerousness.

The legal sources establish distinct duties, review pathways, and clocks. They do **not** establish a national formula assigning `+4`, `+2`, or a universal HIGH threshold. The proposed weights and urgency windows in the accompanying design are explicitly prototype policy requiring validation.

This research produced a proposed design, not a replacement live ruleset. Application code, database records, and existing rule weights were not changed.

## 1. What was examined

The review connected the actual default rules, condition evaluators, score aggregation, queue comparator, Prisma adapter, persistence optimization, scheduled jobs, simulation service, validation schemas, and database fields to relevant primary legal and operational sources.

Priority sources were legislation published by government, Supreme Court judgments/orders, NALSA procedures, and Ministry of Home Affairs procedures. Search indexes and commercial legal sites helped locate documents; their summaries were not treated as legal authority. Relevant sections and operative directions were read, rather than assuming a document's entire content applies to this product.

This is a targeted national research baseline, not an exhaustive survey of every Indian judgment, State amendment, prison rule, or special statute. Later compliance proceedings in *Satender Kumar Antil* were located in discovery results, but their complete 2026 primary order sequence was not retrieved and verified. Consequently, this report does not certify that every cited direction remains unaffected by every later order. Those checks belong in the legal profile activation process below.

## 2. Source register

PDF page numbers below are one-based file pages; printed page numbers can differ. Upload filenames and website footer dates are not treated as the date of a legal instrument.

| ID | Primary source and relevant locator | Role and retrieval status |
|---|---|---|
| S1 | [BNSS 2023, Gazette, Act 46 of 2023](https://www.mha.gov.in/files/documents/250884_2english_01042024.pdf): ss. 1, 2, 5, 58, 187, 478–480, 484, 487, 531; notably PDF pp. 59–60, 144–145, 156–157 | Published legislation; retrieved and relevant provisions read. Gazette text is the enactment, not a guarantee of a fully current consolidation. |
| S2 | [Legal Services Authorities Act 1987, NALSA-hosted text](https://cdnbbsr.s3waas.gov.in/s32e45f93088c7db59767efef516b306aa/uploads/2025/04/202504081796627129.pdf): ss. 12(g), 13; PDF pp. 9–10 | Statutory basis for custody-related legal-aid access; retrieved. Do not copy its historical income amounts into a nationwide eligibility test. |
| S3 | [NALSA Prison Legal Aid Clinics SOP 2022](https://cdnbbsr.s3waas.gov.in/s32e45f93088c7db59767efef516b306aa/uploads/2025/04/20250408618042663.pdf): Part B §7; Part C §8; Part D §10; Parts F–I | Detailed legal-aid workflow; retrieved and relevant sections read. |
| S4 | [NALSA revised UTRC SOP/guidelines](https://cdnbbsr.s3waas.gov.in/s32e45f93088c7db59767efef516b306aa/uploads/2025/04/20250514906784624.pdf): §§2.2, 3.3, Steps 4–5, custody-warrant annexure | Current document listed on [NALSA's guidelines index](https://nalsa.gov.in/guidelines/); incorporates a 19 November 2024 direction. Retrieved. Contains an internal age-range inconsistency described below. |
| S5 | [*Satender Kumar Antil v. CBI*, 11 July 2022](https://api.sci.gov.in/supremecourt/2021/27955/27955_2021_5_1505_36261_Judgement_11-Jul-2022.pdf): concluding §73(k), PDF p. 84, and §73(h)–(j) | Supreme Court judgment; retrieved. Its two-week direction has qualifications; it is not an automatic grant of bail. |
| S6 | [*In Re: Policy Strategy for Grant of Bail*, 31 January 2023](https://api.sci.gov.in/supremecourt/2021/26546/26546_2021_2_23_41396_Order_31-Jan-2023.pdf): execution-of-bail directions, PDF pp. 9–11 | Supreme Court order; retrieved. Important separate post-grant workflow. |
| S7 | [MHA Section 479 advisory, 1 January 2025, with October 2024 advisories](https://www.mha.gov.in/files/documents/Prisonreforms_06012025_2.pdf): PDF p. 5, October advisory §5; PDF pp. 1–2 | Retrieved from the Ministry's updated link. Records the Supreme Court's 23 August 2024 clarification about pending older cases, and continuous implementation. The attached advisory reports that order; the original order itself was not separately verified here. |
| S8 | [MHA revised Support to Poor Prisoners guidelines/SOP](https://www.mha.gov.in/files/documents/SOP_04122025.pdf): dated **2 December 2025**, undertrial procedure PDF pp. 3–4 | Retrieved; the actual document date supersedes misleading index/upload dates. Selected pages visually checked. Scheme procedure with exclusions and State/UT implementation details, not universal financial eligibility. |
| S9 | [*Suhas Chakma v. Union of India*, 23 October 2024](https://api.sci.gov.in/supremecourt/2020/19935/19935_2020_3_1501_56637_Judgement_23-Oct-2024.pdf): §34, PDF pp. 34–40 | Supreme Court judgment; retrieved. Supports effective representation, monitoring, and tracking the gap between identification, recommendation, and actual applications. |
| S10 | [NDPS Act, India Code-hosted text](https://www.indiacode.nic.in/bitstream/123456789/6834/1/narcotic-drugs-and-psychotropic-substances-act-1985.pdf): §36A(4), PDF p. 28 | Relevant provision read through web retrieval. Special-law example; full current amendment history was not audited. |
| S11 | [*State of NCT of Delhi v. Raj Kumar*, Supreme Court, 3 January 2024](https://api.sci.gov.in/supremecourt/2021/6064/6064_2021_8_1505_49160_Judgement_03-Jan-2024.pdf): §§5–9, PDF pp. 6–9 | Retrieved. Reproduces UAPA §43D(2), addressing extension requirements. National Supreme Court authority despite the party name. |
| S12 | [NALSA SOP for representation of persons in custody](https://cdnbbsr.s3waas.gov.in/s32e45f93088c7db59767efef516b306aa/uploads/2025/04/20250408976593997.pdf): items 11–17, PDF pp. 2–3 | Retrieved. Undated document on the current index; use with newer PLAC procedures rather than assuming upload date establishes precedence. |
| S13 | [NALSA Early Access to Justice framework](https://cdnbbsr.s3waas.gov.in/s32e45f93088c7db59767efef516b306aa/uploads/2025/04/20250408448855620.pdf): remand advocacy section, PDF pp. 19–23 | Retrieved; reinforces representation and non-production follow-up. Older CrPC terminology requires regime-aware mapping. |
| S14 | [*M. Ravindran v. Intelligence Officer*, 26 October 2020, NCB-hosted reproduction](https://narcoticsindia.nic.in/Judgments/M_Ravindran_vs_The_Intelligence_Officer_on_26_October_2020.pdf): §§18.1–18.4, PDF pp. 20–21 | Retrieved. Government-hosted reproduction of judgment text, bearing an Indian Kanoon footer; distinguish it from an original Supreme Court PDF. Original/citator verification remains necessary before automatic legal calculation. |

India Code PDF endpoints repeatedly timed out during downloads. The Ministry-hosted BNSS Gazette was retrieved instead. NCRB's [Sankalan reference transcription](https://www.ncrb.mha.gov.in/uploads/SankalanPortal/ChaptersBNSS.html) was useful for navigation, but the Gazette takes precedence: even the territorial opening clause differs in the reference transcription. This is a concrete reason to version the underlying legal text.

## 3. Legal findings that change the design

### 3.1 Legal aid and actual representation

Custody is a criterion under §12(g), with entitlement governed by §13; poverty is not the only route. A JusticeGrid owner is not evidence of a lawyer representing the person. [S2]

The PLAC SOP specifies sending a legal-aid request to DLSA within 24 hours of receipt, and appointment within 48 hours of the request received by DLSA where no lawyer is already appointed. It also calls for follow-up every two days where a new admission is still considering legal aid, immediate urgent-care and claimed-minority referrals, and case-status information once in two months. These are different event clocks. The app should record request receipt, DLSA receipt, appointment, communication, and meaningful contact separately. An oral request counts. Interpretation and effective communication needs require actions, not a generic demographic multiplier. [S3, Part B §7; Part C §8; Part D §10]

The Supreme Court emphasizes meaningful representation and monitoring actual work. Merely populating `assignedToId` does not meet that aim. [S9, §34]

### 3.2 Bail granted but release not achieved

The 31 January 2023 order requires bail-order communication on the same or next day and DLSA intimation if the person is not released within seven days of bail grant. Where bonds remain unfurnished after one month, the court may consider modification/relaxation. The latter is a review opportunity, not automatic release or a mandatory outcome. [S6, execution directions 1–7]

Track grant, order communication, bond/surety progress, other detention barriers, DLSA intimation, and actual release. A grant in one case cannot establish freedom from every other case. A release follow-up should start when the grant is recorded; seven days is an escalation threshold, not a reason to wait to act.

For financial barriers, the December 2025 scheme includes five-day processing stages, district meetings on the first/third Monday with holiday adjustment, and a seven-day filing step after assignment of a surety-reduction application. It has exclusions and local implementation requirements. Use an optional scheme workflow after eligibility review; never automatically approve funds or suppress ordinary legal assistance for an excluded case. Some starting-event language needs local confirmation before enabling timers. [S8, undertrial steps 1–10]

### 3.3 Investigation/default-bail review

BNSS §187(3) distinguishes 90 days for the specified punishment category from 60 days for other offences. This is an investigation-related clock, distinct from prolonged-trial review. [S1, §187]

Special laws can alter it: NDPS §36A(4) specifies 180 days for named offences/commercial quantity, with a possible court extension up to one year on the specified prosecutor report. It is not 180 days for every NDPS allegation. UAPA modifies the ordinary period to 90 days and permits extension up to 180 days subject to its requirements. [S10, §36A(4); S11, §§5–9]

The sequence of expiry, an application invoking the right, charge-sheet/complaint filing, extension requests/orders, and compliance matters. A subsequent filing must not mechanically erase a previously invoked claim. [S14, §18]

**Design consequence:** use a counsel-confirmed review deadline with source, counting convention, and evidence in the first version. Do not derive a definitive legal entitlement from `custodyStartDate + 60/90/180`. Exact day inclusion, competent court, valid extensions, filing sufficiency, and later decisions need a separately verified calculation profile.

### 3.4 Prolonged custody and BNSS §479

Section 479 provides half-maximum and, for a person never previously convicted, one-third-maximum pathways. It excludes offences carrying death or life as a specified punishment; addresses accused-caused delay, court discretion, multiple offences/cases, and an overall maximum-period safeguard. Subsection (3) assigns an application duty to the jail superintendent. [S1, §479]

An unchecked `isFirstTimeOffender` boolean does not prove the statutory definition. One case's charge list also cannot establish the absence of other pending cases. Missing external history must stay UNKNOWN.

The MHA advisory reports that §479 applies to undertrials in pending cases even where registered before 1 July 2024. Do not exclude these cases merely because the main procedural regime remains CrPC under the savings provision. Do not translate an exclusion from a particular statutory route into exclusion from all bail review or from this workflow. [S7, PDF p. 5; S1, §531]

### 3.5 Other review pathways

BNSS §480(6) concerns a Magistrate-triable, non-bailable case not concluded within 60 days of the first date fixed for evidence, with custody throughout and a recorded-reasons exception. It is not 60 days from arrest. Section 478's one-week indigence presumption is measured from arrest and belongs to bailable cases; it differs from the seven-day post-bail-grant escalation. [S1, §§478, 480(6)]

The revised UTRC document enumerates **16 categories**, including an added first-time §479 category and age 70+. Its list also includes convicted/prisoner and preventive-security categories beyond this prototype's ordinary adult-undertrial scope. The committee makes recommendations and follow-up proceeds through competent authorities. Track shortlist → recommendation → application → order → outcome. [S4, §2.2, Steps 3–5]

There is an internal inconsistency: §2.2.13 uses ages 18–21, while §3.3.12 uses 19–21. Keep that young-adult category subject to legal confirmation; do not silently choose either boundary or infer it from a broad age band. [S4]

### 3.6 Hearings and pending bail applications

The concluding direction in *Satender Kumar Antil* says bail applications ought to be disposed of within two weeks, subject to different statutory mandates and an intervening application; anticipatory bail has a separate six-week expectation with qualification. Replace the unexplained 21-day universal rule with a qualified **status-review prompt**, not a claim that delay automatically entitles release. Anticipatory bail need not expand this undertrial product's initial scope. [S5, §73(k)]

The custody-representation SOP requires reporting next hearing date/purpose within three days and tracking non-production. This supports event-specific hearing follow-up. It does not supply the current seven-day order-review weight. [S12, items 11–17; S13, remand section]

### 3.7 India-wide requires applicability checks

BNSS has territorial qualifications, special/local-law savings, and transitional savings for pending proceedings. A case's applicable procedure cannot be selected solely from FIR year. State/UT notifications, court-specific orders, and special statutes can matter. Model prison instruments are models requiring applicable adoption; they are not automatically binding national rules. [S1, §§1, 2, 5, 531; S8, guidelines note on State/UT committees]

Store the legal profile and its confirmation evidence separately from ranking policy. An unavailable profile should create a verification action, not a fabricated deadline or a reassuring zero.

## 4. What is wrong with the current implementation

Code evidence below is relative to repository root `C:/Users/Divya/OneDrive/Desktop/JusticeGrid`.

| Finding | Evidence | Consequence |
|---|---|---|
| Three overlapping hearing rules add 4 + 4 + 2 | `apps/api/src/lib/defaultRuleset.ts`; `packages/rules-engine/src/conditions.ts` | The same near hearing contributes ten points before task/document overlap. |
| Time changes can be evaluated but not persisted | `packages/rules-engine/src/hash.ts`; `apps/api/src/lib/priorityEvaluation.ts` | Hash excludes evaluation time; unchanged hash/version branch only updates `lastEvaluatedAt`, leaving score/reasons stale. |
| Mixed clocks in notifications and scoring | `apps/api/src/jobs/nightlyJobs.ts`; engine `date.ts` | Job uses elapsed-time windows while conditions use Kolkata calendar days; users can receive inconsistent urgency. Nightly-only execution also cannot service hour deadlines. |
| Next/last hearing cache ages without refreshing | `apps/api/src/lib/caseHearingDates.ts` | Cache refresh is mutation-driven; a past scheduled hearing can remain the cached next hearing. |
| Future hearings break historical adjournment streak | `apps/api/src/lib/priorityEvaluation.ts` | Streak walks all descending hearings; a future PENDING event ends it before historical adjournments. |
| Preparation is case-wide, not hearing-linked | engine `conditions.ts` | A task for another hearing can make the current hearing appear unprepared. |
| Requested documents can disappear from missing-work logic | engine `conditions.ts`, missing statuses only MISSING/REJECTED | REQUESTED is not available, but alone can receive zero attention. |
| Wrong timestamp for unverified documents | same file; Prisma adapter | Condition uses `requestedAt`; Prisma already has `receivedAt`, but the engine contract/adapter omits it. |
| Order-review rule assumes a past hearing establishes an order to review | same files | No distinction between obtaining an unavailable order and reviewing a received order; seven-day delay has no identified source. |
| Generic activity can clear a stale-case flag | case `lastActivityAt` and mutation paths | A note can reset inactivity while substantive work remains untouched. |
| Generic custody/bail ages miss specific actions | default rules: 180 days and 21 days | No default-bail, post-grant-release, legal-aid, §479, evidence-start, or scheme-stage workflows. |
| Workflow ownership conflated with legal representation | `NO_ASSIGNEE`; evaluation input lacks representation record | A populated workflow owner can hide an access-to-counsel gap. |
| No single lifecycle policy | priority list and recompute use `deletedAt`, not a complete active-action scope | Archived/terminal cases may keep generic flags. However, disposal must not hide a still-unresolved release/safeguarding action. |
| Incomplete rule publication and simulation consistency | `apps/api/src/modules/rules/rules.service.ts` | Create does not recompute existing cases; simulation tie-breaks differ from actual queue; publication/recompute can expose mixed versions. |
| Weak rule parameter constraints | `packages/shared/src/schemas/rule.ts` | Negative integer weights and arbitrary parameter records accepted; no condition-specific ranges/required keys. |

Separately, queue filtering assigns the caller's ownership scope and then overwrites it with an `assignedTo` filter. Fix this authorization defect before any real-data evaluation; it is independent of score quality. This study used synthetic inputs only.

### Executed reproductions

The audit invoked the current TypeScript `evaluateCase` and the actual 17-rule `DEFAULT_RULESET`, not a replacement implementation. Fixed synthetic inputs and dates make the results reproducible.

| Scenario | Observed output |
|---|---|
| Hearing on 24 September 2026, incomplete prep, other fields complete. Evaluate 20 September and then 21 September, both 09:30 IST; no case edits | ROUTINE **2** → HIGH **10**, but **same input hash**. Persistence code's unchanged branch can discard the changed result. |
| Mandatory FIR copy is REQUESTED, hearing distant, no other open work | **0** points, although the document has not arrived. |
| Hearing in two days with prep due then, another overdue task, mandatory FIR missing | **19** points: document 3 + hearing 4 + hearing/prep 4 + hearing-seven-day 2 + task-due 2 + overdue-task 4. |

The existing worked-example unit test uses three specially selected rules yielding 11; it does not establish that the full seeded ruleset yields 11. These reproductions establish implementation behavior, not legal validity or user benefit.

### Existing test baseline

Ran the installed Vitest runner directly in the rules-engine package:

```powershell
node node_modules/vitest/vitest.mjs run --coverage
```

Result: **11 test files, 155 tests passed**; statement/line/function coverage 100%, branch coverage 99.41%. These tests cover the current implementation contract. They do not invalidate the additional audit findings, prove persistence correctness, or validate legal policy. No new application implementation was tested because this deliverable changes research documentation only.

## 5. Implementation implications

1. Fix temporal persistence, hearing derivation, parameter validation, scope, and simulation consistency before tuning weights.
2. Add event-linked, auditable action/deadline records and actual representation/release fields.
3. Introduce the proposed tiered queue in shadow mode with synthetic scenarios. Use counsel-confirmed legal dates initially.
4. Add verified, narrowly scoped calculation profiles only when their assumptions and exceptions are covered.
5. Validate ordering with legal-aid practitioners. Measure missed urgent actions, explanations, and workload; do not optimize toward a visually pleasing HIGH/MEDIUM/ROUTINE distribution.

The detailed candidate formula, all 17 rule dispositions, required fields, test cases, and rollout gates are in `PRIORITY_QUEUE_V2_DESIGN.md` in this directory.

## 6. Outstanding legal verification before activation

- Check subsequent amendments and the later Supreme Court compliance orders relevant to each enabled profile, including the 2026 *Satender* sequence.
- Confirm State/UT territorial applicability, amendments, notifications, court directions, and scheme implementation.
- Resolve legal day-counting conventions and calendar-period conversion per calculation profile; this study does not approve `years * 365` or a universal remand-day formula.
- Verify complete external case/conviction history through an authorized process; JusticeGrid's synthetic local database is not that evidence.
- Resolve the UTRC young-adult age inconsistency and any conflict between older and newer operational procedures.
- Confirm ambiguous event anchors in the financial-support SOP before starting automatic five-day timers.

These limits do not prevent implementing the engineering corrections or an explainable queue of human-confirmed actions. They prevent presenting an unverified legal calculator as national law.
