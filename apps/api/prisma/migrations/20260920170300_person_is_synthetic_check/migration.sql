-- Defense-in-depth for spec §1.5: Person records must be synthetic only.
-- The Zod layer in packages/shared already rejects isSynthetic: false on
-- write; this CHECK constraint guarantees it at the database level too,
-- so no code path (including a future direct-DB script) can slip a
-- non-synthetic person record in.
ALTER TABLE "Person"
  ADD CONSTRAINT "person_is_synthetic_check" CHECK ("isSynthetic" = true);
