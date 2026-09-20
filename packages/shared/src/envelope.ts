import { z } from "zod";
import { ErrorCodeSchema } from "./errors.js";

/**
 * Every API response uses one of these two envelope shapes (spec §7).
 */

export const ResponseMetaSchema = z.object({
  requestId: z.string(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().optional(),
  total: z.number().int().nonnegative().optional(),
  totalPages: z.number().int().nonnegative().optional(),
});
export type ResponseMeta = z.infer<typeof ResponseMetaSchema>;

export const ErrorDetailSchema = z.object({
  field: z.string(),
  issue: z.string(),
});
export type ErrorDetail = z.infer<typeof ErrorDetailSchema>;

export const ApiErrorSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string(),
  details: z.array(ErrorDetailSchema).optional(),
  requestId: z.string(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: ResponseMeta;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiError;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

/** Build a Zod schema for a success envelope wrapping a specific data shape. */
export function apiSuccessSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    success: z.literal(true),
    data: dataSchema,
    meta: ResponseMetaSchema.optional(),
  });
}

export const ApiErrorEnvelopeSchema = z.object({
  success: z.literal(false),
  error: ApiErrorSchema,
});

/** Standard pagination query params accepted by every list endpoint. */
export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(20),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;
