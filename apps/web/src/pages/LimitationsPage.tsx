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
            coordinators. It applies a fixed, human-authored, versioned set of rules —
            "demonstration rules approved for testing" — to surface which cases have time-sensitive
            administrative conditions (an approaching hearing, an overdue follow-up, a missing
            document) that a human reviewer should look at soon.
          </p>
          <p>
            Every priority shown is accompanied by the exact reasons and arithmetic that produced it
            — nothing is opaque, and nothing is a black box.
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
              Every score is a deterministic sum of fixed rule weights.
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
            A HIGH priority means: "this case has several open, time-sensitive workflow conditions
            that a coordinator should review soon" — not "this person is dangerous" or "this case is
            more important." A ROUTINE case may still be serious; it simply has no outstanding
            administrative flags right now.
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
              The default rule weights are illustrative, not calibrated against any real-world
              outcome data.
            </li>
            <li>
              Under concurrent writers, the audit hash chain's ordering guarantee has a documented
              edge case (see the audit module's source comments).
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
