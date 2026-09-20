import { hash, verify } from "@node-rs/argon2";

/**
 * Password hashing (spec §8.1): Argon2id, `memoryCost 19456, timeCost 2,
 * parallelism 1`. `@node-rs/argon2` rather than the `argon2` npm package —
 * ships prebuilt native binaries (no local C/C++ toolchain needed) while
 * implementing the same Argon2id algorithm with the same parameters; see
 * README.md "Known deviations".
 *
 * `algorithm: 2` is `Algorithm.Argon2id` from `@node-rs/argon2`'s own
 * ambient `const enum` — used as its raw numeric value rather than the
 * enum member because `isolatedModules` (enabled repo-wide) disallows
 * accessing ambient const enums across module boundaries.
 */
const ARGON2_OPTIONS = {
  algorithm: 2,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plainPassword: string): Promise<string> {
  return hash(plainPassword, ARGON2_OPTIONS);
}

export async function verifyPassword(
  hashedPassword: string,
  plainPassword: string,
): Promise<boolean> {
  return verify(hashedPassword, plainPassword, ARGON2_OPTIONS);
}
