import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Pool } from "pg";

/* ==============================
   PostgreSQL connection
============================== */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7 days

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

function isValidEmail(email: unknown): email is string {
  return typeof email === "string" && email.includes("@") && email.length <= 255;
}

type UserRole = "user" | "admin";
function isValidRole(role: unknown): role is UserRole {
  return role === "user" || role === "admin";
}

/* ==============================
   API: PATCH /api/admin/users/role
   Body: { email: string, role: "user" | "admin" }
============================== */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "PATCH") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const sessionToken = req.cookies?.session;
  if (!sessionToken) {
    return res.status(401).json({ message: "ログインしていません" });
  }

  const { email, role } = req.body ?? {};

  // Validate input
  if (!isValidEmail(email) || !isValidRole(role)) {
    return res.status(400).json({ message: "入力が不正です" });
  }

  const targetEmail = email.trim().toLowerCase();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    /* 1) Verify session + caller role (lock session row) */
    const callerResult = await client.query(
      `
      SELECT
        u.id,
        u.email,
        u.role,
        u.status
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.session_token = $1
        AND s.expires_at > now()
      FOR UPDATE
      LIMIT 1
      `,
      [sessionToken]
    );

    if (callerResult.rowCount === 0) {
      await client.query("ROLLBACK");
      clearSessionCookie(res);
      return res.status(401).json({ message: "セッションが無効です" });
    }

    const caller = callerResult.rows[0] as {
      id: number;
      email: string;
      role: string;
      status: string;
    };

    if (caller.status !== "active") {
      await client.query("ROLLBACK");
      clearSessionCookie(res);
      return res.status(403).json({ message: "アカウントが有効ではありません" });
    }

    if (caller.role !== "admin") {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "管理者権限がありません" });
    }

    /* 2) Find target user (lock user row) */
    const targetResult = await client.query(
      `
      SELECT id, email, role, status
      FROM users
      WHERE lower(email) = $1
      FOR UPDATE
      LIMIT 1
      `,
      [targetEmail]
    );

    if (targetResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "ユーザーが見つかりません" });
    }

    const target = targetResult.rows[0] as {
      id: number;
      email: string;
      role: UserRole;
      status: string;
    };

    // Optional hardening:
    // - forbid changing inactive/pending accounts (uncomment if you want)
    // if (target.status !== "active") {
    //   await client.query("ROLLBACK");
    //   return res.status(409).json({ message: "対象ユーザーが有効ではありません" });
    // }

    // Prevent self-demotion (recommended)
    if (target.id === caller.id && role !== "admin") {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "自分の管理者権限は削除できません" });
    }

    // No-op
    if (target.role === role) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "既に同じロールです" });
    }

    /* 3) Update role */
    await client.query(
      `
      UPDATE users
      SET role = $1,
          updated_at = now()
      WHERE id = $2
      `,
      [role, target.id]
    );

    /* 4) Rolling session for caller (nice UX) */
    const newExpiresAt = new Date(Date.now() + SESSION_MAX_AGE_SEC * 1000);
    await client.query(
      `UPDATE sessions SET expires_at = $1 WHERE session_token = $2`,
      [newExpiresAt, sessionToken]
    );

    await client.query("COMMIT");

    // Production-like: 204 No Content
    return res.status(204).end();
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("PATCH /api/admin/users/role error:", err);
    return res.status(500).json({ message: "サーバーエラーが発生しました" });
  } finally {
    client.release();
  }
}
