import type { Person } from "@prisma/client";
import {
  AppError,
  type PersonCreateInput,
  type PersonDto,
  type PersonUpdateInput,
} from "@justicegrid/shared";
import { prisma } from "../../lib/prisma.js";

/**
 * Persons have no ownership field of their own (a Person may in
 * principle underlie more than one Case) — capability gating happens at
 * the route level via CREATE_EDIT_CASE/VIEW_ANY_CASE (spec doesn't list
 * Person separately in §8.3's matrix; it's managed as part of the
 * case-intake workflow those capabilities already cover). No further
 * per-resource scoping applies here.
 */

export function toPersonDto(person: Person): PersonDto {
  return {
    id: person.id,
    aliasCode: person.aliasCode,
    displayName: person.displayName,
    ageBand: person.ageBand,
    gender: person.gender,
    isSynthetic: true,
    languagePreference: person.languagePreference,
    hasDisability: person.hasDisability,
    isFirstTimeOffender: person.isFirstTimeOffender,
    economicallyWeakerSection: person.economicallyWeakerSection,
    emergencyContactAlias: person.emergencyContactAlias,
    notes: person.notes,
    createdAt: person.createdAt.toISOString(),
    updatedAt: person.updatedAt.toISOString(),
  };
}

export async function listPersons(actor?: { id: string; role: string }): Promise<PersonDto[]> {
  const persons = await prisma.person.findMany({
    where:
      actor?.role === "LEGAL_PROFESSIONAL"
        ? {
            OR: [
              { cases: { some: { assignedToId: actor.id, deletedAt: null } } },
              { cases: { none: { deletedAt: null } } },
            ],
          }
        : {},
    orderBy: { aliasCode: "asc" },
  });
  return persons.map(toPersonDto);
}

export async function getPerson(
  id: string,
  actor?: { id: string; role: string },
): Promise<PersonDto> {
  const person = await prisma.person.findUnique({ where: { id } });
  if (
    actor?.role === "LEGAL_PROFESSIONAL" &&
    (await prisma.case.count({ where: { personId: id, deletedAt: null } })) &&
    !(await prisma.case.count({ where: { personId: id, assignedToId: actor.id, deletedAt: null } }))
  )
    throw new AppError("FORBIDDEN", "Person is outside your assigned cases.");
  if (!person) throw new AppError("NOT_FOUND", "Person not found.");
  return toPersonDto(person);
}

export async function createPerson(input: PersonCreateInput): Promise<PersonDto> {
  const person = await prisma.person.create({
    data: {
      aliasCode: input.aliasCode,
      displayName: input.displayName,
      ageBand: input.ageBand,
      gender: input.gender,
      isSynthetic: input.isSynthetic,
      languagePreference: input.languagePreference,
      hasDisability: input.hasDisability,
      isFirstTimeOffender: input.isFirstTimeOffender,
      economicallyWeakerSection: input.economicallyWeakerSection,
      emergencyContactAlias: input.emergencyContactAlias,
      notes: input.notes,
    },
  });
  return toPersonDto(person);
}

export async function updatePerson(id: string, input: PersonUpdateInput): Promise<PersonDto> {
  const existing = await prisma.person.findUnique({ where: { id } });
  if (!existing) throw new AppError("NOT_FOUND", "Person not found.");
  const person = await prisma.person.update({ where: { id }, data: input });
  return toPersonDto(person);
}
