import "server-only";

import bcrypt from "bcrypt";
import type { PoolClient } from "pg";
import { jsonCreated, jsonError } from "@/lib/http/responses";
import { readJsonBody } from "@/lib/http/request";
import { withPgTransaction } from "@/lib/postgres/server";
import {
  ensureEmail,
  ensurePassword,
  optionalTrimmedString,
  ValidationError,
} from "@/lib/validation/primitives";

type RegisterRequestBody = {
  email?: unknown;
  password?: unknown;
  firstName?: unknown;
  lastName?: unknown;
};

async function createUserAndDefaultTeam(
  client: PoolClient,
  input: {
    email: string;
    passwordHash: string;
    firstName: string | null;
    lastName: string | null;
  },
) {
  const teamName = input.firstName ? `${input.firstName}'s Team` : "My Team";

  const userResult = await client.query<{ id: string }>(
    `INSERT INTO users (email, first_name, last_name, password_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [input.email, input.firstName, input.lastName, input.passwordHash],
  );

  const teamResult = await client.query<{ id: string }>(
    `INSERT INTO teams (name) VALUES ($1) RETURNING id`,
    [teamName],
  );

  const userId = userResult.rows[0]?.id;
  const teamId = teamResult.rows[0]?.id;

  if (!userId || !teamId) {
    throw new Error("Failed to create user registration records.");
  }

  await client.query(
    `INSERT INTO team_members (user_id, team_id, role)
     VALUES ($1, $2, $3)`,
    [userId, teamId, "Admin"],
  );

  return { userId, teamId };
}

export async function handleRegisterRequest(request: Request) {
  try {
    const body = await readJsonBody<RegisterRequestBody>(request, {});
    const email = ensureEmail(body.email);
    const password = ensurePassword(body.password);
    const firstName = optionalTrimmedString(body.firstName);
    const lastName = optionalTrimmedString(body.lastName);
    const passwordHash = await bcrypt.hash(password, 12);

    const result = await withPgTransaction((client) =>
      createUserAndDefaultTeam(client, {
        email,
        passwordHash,
        firstName,
        lastName,
      }),
    );

    return jsonCreated({ ok: true, ...result });
  } catch (error) {
    if (error instanceof ValidationError) {
      return jsonError(error.message, 400);
    }

    console.error("[auth/register] unexpected error", error);
    return jsonError("Registration failed", 500);
  }
}
