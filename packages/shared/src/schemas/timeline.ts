import { z } from "zod";
import { IdSchema, IsoDateTimeSchema } from "./common.js";

/** One entry in a case's merged chronological timeline (spec §7:
 * `GET /cases/:id/timeline` — "merged hearings + tasks + documents +
 * notes + evaluations, chronological"). PriorityEvaluation entries join
 * this union once Phase 5 wires priority evaluation in. */
export const TimelineEventTypeSchema = z.enum(["HEARING", "TASK", "DOCUMENT", "NOTE"]);
export type TimelineEventType = z.infer<typeof TimelineEventTypeSchema>;

export const TimelineEventSchema = z.object({
  type: TimelineEventTypeSchema,
  id: IdSchema,
  occurredAt: IsoDateTimeSchema,
  summary: z.string(),
  detail: z.record(z.string(), z.unknown()),
});
export type TimelineEventDto = z.infer<typeof TimelineEventSchema>;
