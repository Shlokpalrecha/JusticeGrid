import type { Request, Response } from "express";
import type {
  ApiSuccessResponse,
  PersonCreateInput,
  PersonDto,
  PersonUpdateInput,
} from "@justicegrid/shared";
import { getRequestId } from "../../middleware/requestId.js";
import * as personsService from "./persons.service.js";

function ok<T>(req: Request, res: Response, data: T, status = 200): void {
  const response: ApiSuccessResponse<T> = {
    success: true,
    data,
    meta: { requestId: getRequestId(req) },
  };
  res.status(status).json(response);
}

export async function listPersonsHandler(req: Request, res: Response): Promise<void> {
  const persons = await personsService.listPersons();
  ok(req, res, persons);
}

export async function getPersonHandler(req: Request, res: Response): Promise<void> {
  const person: PersonDto = await personsService.getPerson(req.params.id as string);
  ok(req, res, person);
}

export async function createPersonHandler(req: Request, res: Response): Promise<void> {
  const person = await personsService.createPerson(req.body as PersonCreateInput);
  ok(req, res, person, 201);
}

export async function updatePersonHandler(req: Request, res: Response): Promise<void> {
  const person = await personsService.updatePerson(
    req.params.id as string,
    req.body as PersonUpdateInput,
  );
  ok(req, res, person);
}
