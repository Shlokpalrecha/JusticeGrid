// Placeholder seed script — Phase 1 wiring only.
//
// The real deterministic, synthetic seed data (spec §10: 12 users, 220
// pseudonymous Persons, 200 Cases including the 6 mandatory fixture cases,
// hearings/tasks/documents/notes, faker.seed(20251020) for reproducibility)
// is built in Phase 7, alongside fixtures.ts and generators.ts. This stub
// exists only so `prisma migrate reset` (which always runs the configured
// seed command) and `pnpm db:seed` succeed during earlier phases.
console.log(
  "[seed] No seed data yet — full synthetic fixtures land in Phase 7 (see JUSTICEGRID_BUILD_SPEC.md §10).",
);
