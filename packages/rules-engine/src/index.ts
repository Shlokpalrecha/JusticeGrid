// Public entry point for @justicegrid/rules-engine.
// This package is pure and dependency-free: it must never import Prisma,
// date libraries, or reach into the database. See §6.1 of the build spec.
export { ENGINE_VERSION } from "./version.js";

// evaluateCase, buildQueue, and all supporting types/utilities are added in
// Phase 2 as the condition set, scoring, ordering, and hashing are built out.
