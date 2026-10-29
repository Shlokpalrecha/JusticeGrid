export type Urgency = "U0" | "U1" | "U2" | "U3";
export type Confidence = "CONFIRMED" | "REPORTED" | "UNKNOWN" | "CONFLICTING";
export type Truth = "TRUE" | "FALSE" | "UNKNOWN";
export type ActionStatus = "OPEN" | "ACKNOWLEDGED" | "BLOCKED" | "RESOLVED" | "CANCELLED";
export type ActionType =
  | "A01"
  | "A02"
  | "A03"
  | "A04"
  | "A05"
  | "A06"
  | "A07"
  | "A08"
  | "A09"
  | "A10"
  | "A11"
  | "A12"
  | "A13"
  | "A14"
  | "A15"
  | "A16"
  | "A17";
export type DeadlineOrigin =
  | "STATUTE"
  | "COURT_ORDER"
  | "NATIONAL_PROCEDURE"
  | "JUDICIAL_TARGET"
  | "TEAM_TARGET"
  | "IMMEDIATE_REFERRAL";
export interface Policy {
  textRules?: import("./systems/rules.js").TextRule[];
  immediateHours: number;
  sensitiveHours: number;
  routineDays: number;
  hearingNearDays: number;
  hearingWeekDays: number;
  agingStepDays: number;
  weights: {
    hearingNear: number;
    hearingWeek: number;
    attendance: number;
    access: number;
    communication: number;
    blocker: number;
    ordinaryBlocker: number;
    criticalData: number;
    ordinaryData: number;
    aging: number;
  };
}
export interface ReviewDate {
  invalidatedReason?: string;
  id: string;
  type: "A05" | "A06" | "A14";
  dueAt: string;
  precision: "INSTANT" | "DATE_ONLY";
  origin: "STATUTE" | "COURT_ORDER";
  sourceId: string;
  locator: string;
  basis: string;
  confirmedBy: string;
  confirmedAt: string;
  profileId: string;
  assumptions: string;
  countingConvention: string;
  anchorAt: string;
  forthwith: boolean;
  completedAt: string | null;
}
export interface WorkflowFacts {
  attendanceUnconfirmedHearingIds: string[];
  representation: "UNKNOWN" | "NONE" | "REQUESTED" | "APPOINTED" | "PRIVATE";
  counselName: string | null;
  counselAcceptedAt: string | null;
  counselCommunicatedAt: string | null;
  requestReceivedAt: string | null;
  dlsaReceivedAt: string | null;
  lawyerAppointedAt: string | null;
  undecidedSince: string | null;
  lastAidFollowupAt: string | null;
  lastStatusCommunicatedAt: string | null;
  interpreterNeeded: boolean;
  communicationBlocked: boolean;
  lastMeaningfulContactAt: string | null;
  urgentReports: {
    id: string;
    kind: "MEDICAL" | "SAFEGUARDING" | "CLAIMED_MINORITY";
    reportedAt: string;
    details: string;
    confidence: Confidence;
    acknowledgedAt: string | null;
    nextReviewAt?: string | null;
    resolvedAt: string | null;
  }[];
  procedure: "UNKNOWN" | "CRPC_SAVED" | "BNSS" | "SPECIAL_OR_LOCAL";
  procedureBasis: string | null;
  specialLaw: string | null;
  legalProfileId: string | null;
  arrestAt: string | null;
  firstRemandAt: string | null;
  prisonAdmissionAt: string | null;
  custodyIntervals: { id: string; from: string; to: string | null; basis: string }[];
  excludedIntervals: { id: string; from: string; to: string; orderReference: string }[];
  priorConvictions: Truth;
  otherPendingCases: Truth;
  multipleOffences: Truth;
  currentChargesVerifiedAt: string | null;
  punishmentBasis: string | null;
  investigationEvents: {
    id: string;
    kind:
      | "CHARGE_SHEET"
      | "COMPLAINT"
      | "DEFAULT_BAIL_INVOKED"
      | "EXTENSION_REQUEST"
      | "EXTENSION_ORDER";
    at: string;
    reference: string;
    confirmed: boolean;
  }[];
  confirmedReviews: ReviewDate[];
  bailGrantedAt: string | null;
  bailOrderCommunicatedAt: string | null;
  bondsFurnishedAt: string | null;
  releaseConfirmedAt: string | null;
  nonReleaseReason: string | null;
  dlsaInformedAt: string | null;
  otherDetentionBarrier: Truth;
  bailApplications: {
    id: string;
    filedAt: string;
    type: "REGULAR" | "ANTICIPATORY";
    outcomeAt: string | null;
    interveningApplication: boolean;
    differentMandate: boolean;
    nextReviewAt: string | null;
  }[];
  scheme: {
    applicability: "UNKNOWN" | "CONFIRMED" | "EXCLUDED";
    stage: "NONE" | "INTERACTION" | "REPORT" | "COMMITTEE" | "DEPOSIT" | "REDUCTION";
    anchorAt: string | null;
    confirmedDueAt: string | null;
    basis: string | null;
    calendarConfirmed: boolean;
    holidays: string[];
    completedAt: string | null;
  };
  utrc: {
    categories: string[];
    verifiedBy: string | null;
    meetingAt: string | null;
    recommendationAt: string | null;
    applicationAt: string | null;
    orderAt: string | null;
    outcomeAt: string | null;
    notes: string | null;
  };
  firstEvidenceDate: string | null;
  custodyThroughoutEvidence: Truth;
  recordedCourtException: string | null;
  nextHearingState: "UNKNOWN" | "EXPECTED" | "AWAITING_LISTING" | "NOT_APPLICABLE";
  nextPlannedReviewAt: string | null;
}
export interface ActionInput {
  ownerOverride?: string | null;
  sourceKey?: string;
  nextReviewAt?: string | null;
  id: string;
  key: string;
  type: ActionType;
  title: string;
  status: ActionStatus;
  activatedAt: string;
  dueAt: string | null;
  origin: DeadlineOrigin;
  confidence: Confidence;
  sourceId: string;
  locator: string;
  evidence: string;
  ownerId: string | null;
  critical: boolean;
  forthwith: boolean;
  retainedAfterClosure: boolean;
  parentKey: string | null;
  hearingId: string | null;
  blocker: "NONE" | "ORDINARY" | "NECESSARY";
  criticalDataMissing: boolean;
  ordinaryDataMissing: boolean;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  resolutionEvidence: string | null;
  override: { urgency: Urgency; reason: string; expiresAt: string; reviewerId: string } | null;
}
export interface WorkflowInput {
  workflowGraph?: {nodes:{key:string;title:string;status:string;readyAt?:string|null}[];edges:import("./systems/graph.js").Edge[]};
  ruleFacts?: { offenseSeverityIndex:number|null; bailEligibility:boolean|null };
  bailStatus?: string;
  charges?: {
    id: string;
    actName: string;
    sectionCode: string;
    description: string | null;
    isBailableFlag: boolean;
  }[];
  legalProfiles?: {
    id: string;
    version: number;
    sourceId: string;
    locator: string;
    territory: string;
    procedure: string;
    verificationNotes: string;
  }[];
  caseId: string;
  caseRef: string;
  createdAt: string;
  assignedToId: string | null;
  caseStatus: string;
  isArchived: boolean;
  custodyType: string;
  custodyStartDate: string | null;
  courtName: string;
  chargeCount: number;
  facts: WorkflowFacts;
  actions: ActionInput[];
  hearings: {
    id: string;
    scheduledAt: string;
    actualAt: string | null;
    outcome: string;
    wasProduced: boolean;
    orderExpected: boolean;
    orderReceivedAt: string | null;
    orderReviewed: boolean;
    createdAt: string;
  }[];
  tasks: {
    id: string;
    title: string;
    status: string;
    dueAt: string;
    ownerId: string | null;
    hearingId: string | null;
    actionKey: string | null;
    preparation: boolean;
    blocked: boolean;
    createdAt: string;
  }[];
  documents: {
    id: string;
    name: string;
    status: string;
    mandatory: boolean;
    hearingId: string | null;
    actionKey: string | null;
    requestedAt: string | null;
    receivedAt: string | null;
    createdAt: string;
  }[];
}
export interface ActionResult extends ActionInput {
  ruleTrace?: {id:string;expression:string;result:boolean|null;value:number|null}[];
  urgency: Urgency;
  originalUrgency: Urgency;
  orderingDeadline: string | null;
  supportScore: number;
  components: { H: number; A: number; B: number; D: number; F: number };
  explanation: string;
  warnings: string[];
  suppressedDuplicates: number;
}
export interface EvaluationResult {
  plannedReviewAt: string | null;
  caseId: string;
  caseRef: string;
  priorityLevel: Urgency;
  supportScore: number;
  selectedAction: ActionResult | null;
  actions: ActionResult[];
  explanation: string;
  nextEvaluationAt: string;
  evaluatedAt: string;
  policyVersion: number;
  engineVersion: string;
  evaluationKey: string;
  factsHash: string;
  outcomeHash: string;
  warnings: string[];
  nextHearingAt: string | null;
  consecutiveAdjournments: number;
  included: boolean;
}
