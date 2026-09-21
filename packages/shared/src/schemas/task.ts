import { z } from "zod";
import { TaskCategorySchema, TaskStatusSchema } from "../enums.js";
import { IdSchema, IsoDateTimeSchema } from "./common.js";
import { PaginationQuerySchema } from "../envelope.js";

export const TaskSchema = z.object({
  id: IdSchema,
  caseId: IdSchema,
  title: z.string().min(1),
  description: z.string().nullable(),
  category: TaskCategorySchema,
  assignedToId: IdSchema.nullable(),
  createdById: IdSchema,
  dueDate: IsoDateTimeSchema,
  status: TaskStatusSchema,
  blockedReason: z.string().nullable(),
  // Derived from the status transition, not directly settable — see
  // apps/api/prisma/schema.prisma's comment on this field.
  blockedSince: IsoDateTimeSchema.nullable(),
  completedAt: IsoDateTimeSchema.nullable(),
  completedById: IdSchema.nullable(),
  completionNote: z.string().nullable(),
  cancelledReason: z.string().nullable(),
  isPreparationTask: z.boolean(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type TaskDto = z.infer<typeof TaskSchema>;

/** Business validation from spec §8.5 — dueDate not in the past on
 * creation — enforced directly here since it needs no other entity. */
export const TaskCreateInputSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().optional(),
    category: TaskCategorySchema,
    assignedToId: IdSchema.optional(),
    dueDate: IsoDateTimeSchema.refine(
      (v) => new Date(v).getTime() >= Date.now() - 24 * 60 * 60 * 1000,
      {
        message: "dueDate must not be in the past",
      },
    ),
    isPreparationTask: z.boolean().default(false),
  })
  .strict();
export type TaskCreateInput = z.infer<typeof TaskCreateInputSchema>;

export const TaskUpdateInputSchema = TaskCreateInputSchema.omit({ dueDate: true })
  .partial()
  .extend({
    dueDate: IsoDateTimeSchema.optional(),
    status: TaskStatusSchema.optional(),
    blockedReason: z.string().optional(),
    cancelledReason: z.string().optional(),
  })
  .strict();
export type TaskUpdateInput = z.infer<typeof TaskUpdateInputSchema>;

export const TaskCompleteInputSchema = z
  .object({
    completionNote: z.string().optional(),
  })
  .strict();
export type TaskCompleteInput = z.infer<typeof TaskCompleteInputSchema>;

export const TaskReassignInputSchema = z
  .object({
    assignedToId: IdSchema.nullable(),
  })
  .strict();
export type TaskReassignInput = z.infer<typeof TaskReassignInputSchema>;

/** `GET /tasks` filter params (spec §7): `assignedTo=me` is handled by
 * the service layer (resolved against the caller's own id), so it's
 * typed here as a literal "me" alongside a real id. */
export const TaskFilterQuerySchema = PaginationQuerySchema.extend({
  assignedTo: z.union([IdSchema, z.literal("me")]).optional(),
  status: TaskStatusSchema.optional(),
  category: TaskCategorySchema.optional(),
  dueBefore: IsoDateTimeSchema.optional(),
  overdue: z.coerce.boolean().optional(),
  caseId: IdSchema.optional(),
}).strict();
export type TaskFilterQuery = z.infer<typeof TaskFilterQuerySchema>;

/** Task list items embed the parent case's ref so a flat task list (e.g.
 * "My Tasks", spec §9 screen 6) can link back without a second fetch. */
export const TaskListItemSchema = TaskSchema.extend({ caseRef: z.string() });
export type TaskListItemDto = z.infer<typeof TaskListItemSchema>;
