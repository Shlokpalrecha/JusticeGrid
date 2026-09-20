import { z } from "zod";
import { NotificationTypeSchema } from "../enums.js";
import { IdSchema, IsoDateTimeSchema } from "./common.js";

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
