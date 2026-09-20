import { z } from "zod";
import { IdSchema, IsoDateTimeSchema } from "./common.js";

export const SavedFilterSchema = z.object({
  id: IdSchema,
  userId: IdSchema,
  name: z.string().min(1),
  queryJson: z.record(z.string(), z.unknown()),
  isShared: z.boolean(),
  createdAt: IsoDateTimeSchema,
});
export type SavedFilterDto = z.infer<typeof SavedFilterSchema>;

export const SavedFilterCreateInputSchema = z
  .object({
    name: z.string().min(1),
    queryJson: z.record(z.string(), z.unknown()),
    isShared: z.boolean().default(false),
  })
  .strict();
export type SavedFilterCreateInput = z.infer<typeof SavedFilterCreateInputSchema>;
