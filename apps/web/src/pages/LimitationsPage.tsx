import { AlertTriangle, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";

/**
 * Guardrail requirement (spec §1): a permanent, prominent page laying
 * out exactly what this prototype is and is not, framed as a hypothesis
 * under test — not a proven or production-ready system.
 */
export function LimitationsPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div>
          <h1 className="font-semibold text-amber-900 dark:text-amber-200">
            What JusticeGrid is — and is not
          </h1>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
            This is an academic prototype. Every claim below is a stated hypothesis for evaluation,
            not a proven or production-ready capability.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>What it is</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
          <p>
            A deterministic <strong>workflow prioritization</strong> tool for legal-aid case
            coordinators. It orders unresolved actions by urgency, deadline, capped support and
            waiting time. Sources, verified events and human-confirmed review dates explain the
            ordering. The numerical weights and ranking windows are prototype team policy.
          </p>
          <p>
            Each evaluation shows its source evidence, action deadline, urgency and support
            components. Human reviewers remain responsible for the response and any legal
            interpretation.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600" /> What it is not
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              It does not make, recommend, or influence any legal or judicial decision — including
              bail, guilt, or sentencing.
            </li>
            <li>
              It uses no machine learning, statistical scoring, or probabilistic model of any kind.
              Support weights only break ties after urgency and deadline; they cannot override
              protected work.
            </li>
            <li>
              It is not a "risk score" or "threat level" system — priority reflects
              administrative/workflow urgency only.
            </li>
            <li>
              It is not connected to, integrated with, or a replacement for CCTNS, eCourts,
              e-Prisons, NJDG, ICJS, or any other real government system.
            </li>
            <li>
              All data in this system is synthetic and fictional, generated for demonstration
              purposes only.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How to read a priority</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
          <p>
            U0 means immediate attention to a reported urgent referral or a confirmed critical
            legal/court action. U1 means time-sensitive review, U2 means follow-up and U3 means
            scheduled work. A support total is not a judgment about a person. Unknown critical
            information creates verification work. Acknowledgement keeps an action open until its
            source records resolution.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Known limitations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              The synthetic dataset is small and generated, not drawn from any real case records.
            </li>
            <li>
              The support weights are illustrative and have not been calibrated against real-world
              outcomes.
            </li>
            <li>
              Automatic statutory entitlement calculators are disabled. Protected review dates
              require human confirmation and a reviewed applicability profile. Relevant legal and
              local procedural developments still need professional validation.
            </li>
            <li>
              This prototype has not undergone a security review appropriate for handling real case
              data and must never be used with real personal or case information.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
