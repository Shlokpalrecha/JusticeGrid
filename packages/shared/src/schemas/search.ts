import { z } from "zod";
import { CaseStatusSchema, PriorityLevelSchema, TaskStatusSchema } from "../enums.js";
import { IdSchema, IsoDateTimeSchema } from "./common.js";

/** `GET /search?q=` (spec §7): cross-entity (cases, persons, tasks),
 * respecting the same authorization scoping as each entity's own list
 * endpoint — a LEGAL_PROFESSIONAL never sees a case/task/person outside
 * their own assignment in a search result either. */
export const SearchQuerySchema = z
  .object({
    q: z.string().min(1),
  })
  .strict();
export type SearchQuery = z.infer<typeof SearchQuerySchema>;

export const CaseSearchResultSchema = z.object({
  id: IdSchema,
  caseRef: z.string(),
  courtName: z.string(),
  caseStatus: CaseStatusSchema,
  personAlias: z.string(),
  priorityLevel: PriorityLevelSchema.nullable(),
});
export type CaseSearchResultDto = z.infer<typeof CaseSearchResultSchema>;

export const PersonSearchResultSchema = z.object({
  id: IdSchema,
  aliasCode: z.string(),
  displayName: z.string(),
});
export type PersonSearchResultDto = z.infer<typeof PersonSearchResultSchema>;

export const TaskSearchResultSchema = z.object({
  id: IdSchema,
  title: z.string(),
  caseId: IdSchema,
  caseRef: z.string(),
  status: TaskStatusSchema,
  dueDate: IsoDateTimeSchema,
});
export type TaskSearchResultDto = z.infer<typeof TaskSearchResultSchema>;

export const SearchResponseSchema = z.object({
  cases: z.array(CaseSearchResultSchema),
  persons: z.array(PersonSearchResultSchema),
  tasks: z.array(TaskSearchResultSchema),
});
export type SearchResponse = z.infer<typeof SearchResponseSchema>;
