import { z } from "zod";
import { RoleSchema } from "../enums.js";
import { IdSchema, IsoDateTimeSchema } from "./common.js";

/**
 * Public wire shape of a User. `passwordHash` is deliberately never
 * included here — spec §11 requires a test proving the password hash is
 * never returned in any API response, and the easiest way to guarantee
 * that is to never give it a place in the schema in the first place.
 */
export const UserSchema = z.object({
  id: IdSchema,
  email: z.string().email(),
  fullName: z.string().min(1),
  employeeCode: z.string().min(1),
  role: RoleSchema,
  designation: z.string().nullable(),
  phone: z.string().nullable(),
  isActive: z.boolean(),
  mustChangePassword: z.boolean(),
  lastLoginAt: IsoDateTimeSchema.nullable(),
  createdById: IdSchema.nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type UserDto = z.infer<typeof UserSchema>;

/** Minimal shape for embedding a user as a reference (assignee avatar,
 * "recorded by", etc.) without pulling in the full profile. */
export const UserRefSchema = z.object({
  id: IdSchema,
  fullName: z.string(),
  role: RoleSchema,
});
export type UserRef = z.infer<typeof UserRefSchema>;
