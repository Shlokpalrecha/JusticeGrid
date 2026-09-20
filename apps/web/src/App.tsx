/**
 * JusticeGrid — Phase 0 placeholder shell.
 *
 * The router, providers, layouts, and every real screen (dashboard,
 * priority queue, case detail, rules admin, etc.) are built in Phases
 * 8–10, wired to the live API. This placeholder only proves the frontend
 * build/dev pipeline works end to end.
 */
export default function App() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-2xl font-semibold">JusticeGrid</h1>
      <p className="max-w-md text-sm text-slate-600 dark:text-slate-400">
        Prototype — synthetic data only. Workflow prioritization is a review aid, not a legal or
        judicial decision. All actions require human review.
      </p>
      <p className="text-xs text-slate-400">
        Phase 0 scaffold — screens are built in later phases.
      </p>
    </div>
  );
}
