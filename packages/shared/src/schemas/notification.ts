import { z } from "zod";
import { NotificationTypeSchema } from "../enums.js";
import { PaginationQuerySchema } from "../envelope.js";
import { BooleanQueryParamSchema, IdSchema, IsoDateTimeSchema } from "./common.js";

export const NotificationSchema = z.object({
  id: IdSchema,
  userId: IdSchema,
  type: NotificationTypeSchema,
  title: z.string(),
  body: z.string(),
  relatedEntityType: z.string().nullable(),
  relatedEntityId: z.string().nullable(),
  isRead: z.boolean(),
  readAt: IsoDateTimeSchema.nullable(),
  createdAt: IsoDateTimeSchema,
});
export type NotificationDto = z.infer<typeof NotificationSchema>;

/** `GET /notifications` (spec §7): every notification is implicitly
 * scoped to the caller (`userId` is never a query param — there is no
 * "view another user's notifications", even for ADMIN). */
export const NotificationListQuerySchema = PaginationQuerySchema.extend({
  isRead: BooleanQueryParamSchema.optional(),
}).strict();
export type NotificationListQuery = z.infer<typeof NotificationListQuerySchema>;
