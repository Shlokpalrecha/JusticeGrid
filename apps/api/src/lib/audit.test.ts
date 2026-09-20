import { beforeEach, describe, expect, it } from "vitest";
import type { User } from "@prisma/client";
import { diffChangedFields, verifyAuditChain, writeAuditEntry } from "./audit.js";
import { prisma } from "./prisma.js";
import { createTestUser, resetDatabase } from "../test/dbHelpers.js";

const requestContext = { ipAddress: "127.0.0.1", userAgent: "vitest", requestId: "req-audit-test" };

function actorFor(user: User) {
  return { id: user.id, email: user.email, role: user.role };
}

describe("diffChangedFields", () => {
  it("returns the sorted list of top-level keys whose value changed", () => {
    expect(diffChangedFields({ a: 1, b: 2, c: 3 }, { a: 1, b: 9, c: 3 })).toEqual(["b"]);
  });

  it("detects nested changes via canonical JSON comparison", () => {
    expect(diffChangedFields({ nested: { x: 1 } }, { nested: { x: 2 } })).toEqual(["nested"]);
  });

  it("includes a key added or removed entirely", () => {
    expect(diffChangedFields({ a: 1 }, { a: 1, b: 2 })).toEqual(["b"]);
    expect(diffChangedFields({ a: 1, b: 2 }, { a: 1 })).toEqual(["b"]);
  });

  it("treats a missing/non-object side as empty, so e.g. a CREATE's every field counts as changed", () => {
    // There's no "before" for a CREATE — every field of `after` is new,
    // which is exactly what the audit viewer's diff (spec §9) wants to
    // highlight, so this is the useful behaviour, not a null-safety
    // shortcut that happens to return nothing.
    expect(diffChangedFields(undefined, { a: 1 })).toEqual(["a"]);
    expect(diffChangedFields(null, { a: 1 })).toEqual(["a"]);
    // Symmetrically, a DELETE (`after` missing) reports every prior field.
    expect(diffChangedFields({ a: 1, b: 2 }, undefined)).toEqual(["a", "b"]);
  });
});

describe("audit hash chain (spec §5/§8.9, T8)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("writes a chain of entries that verifies intact", async () => {
    const user = await createTestUser();
    for (let i = 0; i < 5; i++) {
      await prisma.$transaction((tx) =>
        writeAuditEntry(tx, actorFor(user), requestContext, {
          action: "UPDATE",
          entityType: "Case",
          entityId: `case-${i}`,
          entityLabel: `JG-2026-000${i}`,
          summary: `Test entry ${i}`,
          before: { status: "A" },
          after: { status: "B" },
        }),
      );
    }

    const result = await verifyAuditChain(prisma);
    expect(result.intact).toBe(true);
    expect(result.entriesChecked).toBe(5);
    expect(result.firstBreakAtSequence).toBeNull();
  });

  it("assigns strictly increasing sequence numbers", async () => {
    const user = await createTestUser();
    const entries = [];
    for (let i = 0; i < 3; i++) {
      entries.push(
        await prisma.$transaction((tx) =>
          writeAuditEntry(tx, actorFor(user), requestContext, {
            action: "CREATE",
            entityType: "Case",
            entityLabel: `case-${i}`,
            summary: "test",
          }),
        ),
      );
    }
    const sequences = entries.map((e) => e.sequence);
    expect(sequences).toEqual([...sequences].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    expect(new Set(sequences).size).toBe(3);
  });

  it("chains each entry's previousHash to the prior entry's hash", async () => {
    const user = await createTestUser();
    const first = await prisma.$transaction((tx) =>
      writeAuditEntry(tx, actorFor(user), requestContext, {
        action: "CREATE",
        entityType: "Case",
        entityLabel: "case-1",
        summary: "first",
      }),
    );
    const second = await prisma.$transaction((tx) =>
      writeAuditEntry(tx, actorFor(user), requestContext, {
        action: "UPDATE",
        entityType: "Case",
        entityLabel: "case-1",
        summary: "second",
      }),
    );
    expect(second.previousHash).toBe(first.hash);
  });

  it("the first entry ever written chains from the genesis hash", async () => {
    const user = await createTestUser();
    const first = await prisma.$transaction((tx) =>
      writeAuditEntry(tx, actorFor(user), requestContext, {
        action: "CREATE",
        entityType: "Case",
        entityLabel: "case-1",
        summary: "first",
      }),
    );
    expect(first.previousHash).toBe("0".repeat(64));
  });

  it("detects tampering: modifying a stored row's afterJson breaks verification at that row", async () => {
    const user = await createTestUser();
    await prisma.$transaction((tx) =>
      writeAuditEntry(tx, actorFor(user), requestContext, {
        action: "CREATE",
        entityType: "Case",
        entityLabel: "untouched",
        summary: "original summary",
        after: { status: "REGISTERED" },
      }),
    );
    const tampered = await prisma.$transaction((tx) =>
      writeAuditEntry(tx, actorFor(user), requestContext, {
        action: "UPDATE",
        entityType: "Case",
        entityLabel: "will-be-tampered",
        summary: "original summary",
        before: { status: "REGISTERED" },
        after: { status: "TRIAL_ONGOING" },
      }),
    );
    await prisma.$transaction((tx) =>
      writeAuditEntry(tx, actorFor(user), requestContext, {
        action: "UPDATE",
        entityType: "Case",
        entityLabel: "after-tamper",
        summary: "third entry",
      }),
    );

    // Directly mutate a row's content without going through
    // writeAuditEntry — simulating tampering, bypassing the (never
    // exposed at the API layer) write path entirely. `afterJson` is
    // part of the hash formula (spec §5), unlike e.g. `summary` or
    // `entityLabel` — see the dedicated test below documenting that.
    await prisma.auditLog.update({
      where: { id: tampered.id },
      data: { afterJson: { status: "DISPOSED" } },
    });

    const result = await verifyAuditChain(prisma);
    expect(result.intact).toBe(false);
    expect(result.firstBreakAtSequence).toBe(tampered.sequence.toString());
  });

  it("documents a scope boundary: summary/entityLabel are NOT covered by the hash formula (spec §5's exact field list)", async () => {
    // The hash covers sequence | actorId | action | entityType | entityId
    // | createdAt | beforeJson | afterJson | previousHash — exactly spec
    // §5's formula, no more. Tampering a field outside that list is a
    // real, spec-following limitation, not a bug: this test exists so
    // the boundary is explicit and reviewable, not silently discovered.
    const user = await createTestUser();
    const entry = await prisma.$transaction((tx) =>
      writeAuditEntry(tx, actorFor(user), requestContext, {
        action: "CREATE",
        entityType: "Case",
        entityLabel: "original label",
        summary: "original summary",
      }),
    );
    await prisma.auditLog.update({
      where: { id: entry.id },
      data: { summary: "TAMPERED SUMMARY", entityLabel: "TAMPERED LABEL" },
    });

    const result = await verifyAuditChain(prisma);
    expect(result.intact).toBe(true);
  });

  it("detects a broken previousHash link even if a row's own hash is internally self-consistent", async () => {
    const user = await createTestUser();
    await prisma.$transaction((tx) =>
      writeAuditEntry(tx, actorFor(user), requestContext, {
        action: "CREATE",
        entityType: "Case",
        entityLabel: "a",
        summary: "a",
      }),
    );
    const second = await prisma.$transaction((tx) =>
      writeAuditEntry(tx, actorFor(user), requestContext, {
        action: "CREATE",
        entityType: "Case",
        entityLabel: "b",
        summary: "b",
      }),
    );
    await prisma.auditLog.update({
      where: { id: second.id },
      data: { previousHash: "f".repeat(64) },
    });

    const result = await verifyAuditChain(prisma);
    expect(result.intact).toBe(false);
    expect(result.firstBreakAtSequence).toBe(second.sequence.toString());
  });

  it("an empty audit log verifies as intact with zero entries checked", async () => {
    const result = await verifyAuditChain(prisma);
    expect(result).toEqual({ intact: true, entriesChecked: 0, firstBreakAtSequence: null });
  });

  it("a failed mutation inside the same transaction leaves no orphan audit row (T8)", async () => {
    const user = await createTestUser();
    await expect(
      prisma.$transaction(async (tx) => {
        await writeAuditEntry(tx, actorFor(user), requestContext, {
          action: "CREATE",
          entityType: "User",
          entityLabel: "orphan-attempt",
          summary: "This audit entry's mutation will fail and roll back",
        });
        // Deliberately violate the unique constraint on User.email to
        // force this transaction to fail.
        await tx.user.create({
          data: {
            email: user.email, // duplicate — violates @unique
            passwordHash: "irrelevant",
            fullName: "Duplicate",
            employeeCode: "DUPLICATE",
            role: "LEGAL_PROFESSIONAL",
          },
        });
      }),
    ).rejects.toThrow();

    const count = await prisma.auditLog.count();
    expect(count).toBe(0);
  });
});
