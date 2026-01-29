import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { Pool } from "pg";
export const runtime = "nodejs";


const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function POST(req: Request) {
  const body = await req.json();
  const { email, password, firstName, lastName } = body;

  if (!email || !password) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const client = await pool.connect();

    // create user
    const userResult = await client.query(
      `INSERT INTO users (email, first_name, last_name, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [email, firstName, lastName, passwordHash]
    );

    const userId = userResult.rows[0].id;

    // create default team for user
    const teamResult = await client.query(
      `INSERT INTO teams (name) VALUES ($1) RETURNING id`,
      [`${firstName}'s Team`]
    );

    const teamId = teamResult.rows[0].id;

    // connect user to team
    await client.query(
      `INSERT INTO team_members (user_id, team_id, role)
       VALUES ($1, $2, 'Admin')`,
      [userId, teamId]
    );

    client.release();

    return NextResponse.json({ ok: true, userId, teamId });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
