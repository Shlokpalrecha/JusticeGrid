import { z } from "zod";
import { UserSchema } from "@justicegrid/shared";

export const LoginInputSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(1),
  })
  .strict();
export type LoginInput = z.infer<typeof LoginInputSchema>;

export const ChangePasswordInputSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(12, "newPassword must be at least 12 characters"),
  })
  .strict();
export type ChangePasswordInput = z.infer<typeof ChangePasswordInputSchema>;

/** The access token and user profile go in the JSON body; the refresh
 * token is delivered only as an httpOnly cookie, never in a response
 * body a script could read (spec §8.2). */
export const AuthSessionResponseSchema = z.object({
  accessToken: z.string(),
  user: UserSchema,
});
export type AuthSessionResponse = z.infer<typeof AuthSessionResponseSchema>;
