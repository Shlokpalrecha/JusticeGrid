import { ShieldAlert } from "lucide-react";

/**
 * Non-negotiable guardrail (spec §1): a persistent, always-visible
 * disclaimer. Never collapsible, never dismissible, never hidden behind
 * a tooltip — it renders on every authenticated screen via AppShell.
 */
export function DisclaimerBanner() {
  return (
    <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
      <p>
        <strong className="font-semibold">Prototype — synthetic data only.</strong> Workflow
        prioritization is a deterministic review aid, not a legal or judicial decision. All actions
        require human review. Not connected to CCTNS, eCourts, e-Prisons, NJDG, or ICJS.
      </p>
    </div>
  );
}
