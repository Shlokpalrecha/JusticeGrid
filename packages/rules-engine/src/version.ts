/**
 * Engine version, bumped whenever scoring/ordering/explanation semantics
 * change in a way that could alter output for identical input. Recorded on
 * every PriorityEvaluation so historical results remain interpretable even
 * after the engine evolves (spec §6.1, §6.7).
 */
export const ENGINE_VERSION = "1.0.0";
