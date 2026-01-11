import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/* ==============================
   Helpers
============================== */
function clearSessionCookie(res: VercelResponse) {
  const isProduction = process.env.NODE_ENV === "production";
  res.setHeader(
    "Set-Cookie",
    [
      "session=",
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      "Max-Age=0",
      isProduction ? "Secure" : "",
    ].filter(Boolean).join("; ")
  );
}

function isValidRole(role: unknown): role is "user" | "admin" {
  return role === "user" || role === "admin";
}

/* ==============================
   PATCH /api/admin/users/role
============================== */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "PATCH") {
    return res.status(405).end(); // Method Not Allowed
  }

  const sessionToken = req.cookies?.session;
  if (!sessionToken) {
    return res.status(401).end(); // Unauthorized
  }

  const { email, role } = req.body ?? {};

  if (typeof email !== "string" || !email.includes("@")) {
    return res.status(400).end(); // Bad Request
  }

  if (!isValidRole(role)) {
    return res.status(400).end();
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    /* 1️⃣ Get caller (admin check) */
    const callerResult = await client.query(
      `
      SELECT u.id, u.role, u.status
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.session_token = $1
        AND s.expires_at > now()
      FOR UPDATE
      `,
      [sessionToken]
    );

    if (callerResult.rowCount === 0) {
      await client.query("ROLLBACK");
      clearSessionCookie(res);
      return res.status(401).end();
    }

    const caller = callerResult.rows[0];

    if (caller.status !== "active") {
      await client.query("ROLLBACK");
      return res.status(403).end();
    }

    if (caller.role !== "admin") {
      await client.query("ROLLBACK");
      return res.status(403).end(); // Forbidden
    }

    /* 2️⃣ Get target user */
    const targetResult = await client.query(
      `
      SELECT id, role
      FROM users
      WHERE email = $1
      LIMIT 1
      FOR UPDATE
      `,
      [email]
    );

    if (targetResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).end(); // Not Found
    }

    const target = targetResult.rows[0];

    /* 3️⃣ Prevent self-demotion */
    if (target.id === caller.id && role !== "admin") {
      await client.query("ROLLBACK");
      return res.status(409).end(); // Conflict
    }

    /* 4️⃣ Last admin guard */
    if (target.role === "admin" && role !== "admin") {
      const cnt = await client.query(
        `SELECT COUNT(*)::int AS c FROM users WHERE role = 'admin'`
      );
      const adminCount = cnt.rows[0].c as number;

      if (adminCount <= 1) {
        await client.query("ROLLBACK");
        return res.status(409).end(); // Conflict
      }
    }

    /* 5️⃣ Update role */
    await client.query(
      `
      UPDATE users
      SET role = $1,
          updated_at = now()
      WHERE id = $2
      `,
      [role, target.id]
    );

    await client.query("COMMIT");

    // No body needed (clean REST)
    return res.status(204).end();
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("PATCH /api/admin/users/role error:", err);
    return res.status(500).end();
  } finally {
    client.release();
  }
}
