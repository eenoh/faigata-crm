import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { Pool } from "pg";

export const runtime = "nodejs";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function POST(req: Request) {
  try {
    const { email, password, firstName, lastName } = (await req.json()) as {
      email?: string;
      password?: string;
      firstName?: string | null;
      lastName?: string | null;
    };

    if (!email || !password) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const safeFirst = (firstName ?? "").trim();
    const safeLast = (lastName ?? "").trim();
    const teamName = safeFirst ? `${safeFirst}'s Team` : "My Team";

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const {
        rows: [{ id: userId }],
      } = await client.query(
        `INSERT INTO users (email, first_name, last_name, password_hash)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [email, safeFirst || null, safeLast || null, passwordHash],
      );

      const {
        rows: [{ id: teamId }],
      } = await client.query(
        `INSERT INTO teams (name) VALUES ($1) RETURNING id`,
        [teamName],
      );

      await client.query(
        `INSERT INTO team_members (user_id, team_id, role)
         VALUES ($1, $2, $3)`,
        [userId, teamId, "Admin"],
      );

      await client.query("COMMIT");
      return NextResponse.json({ ok: true, userId, teamId });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
