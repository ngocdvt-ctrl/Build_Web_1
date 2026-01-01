import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Pool } from "pg";

/* ==============================
   PostgreSQL connection
============================== */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/* ==============================
   API: GET /api/me
============================== */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  /* ✅ Chỉ cho phép GET */
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  try {
    /* 1️⃣ Lấy session token từ cookie */
    const sessionToken = req.cookies?.session;

    if (!sessionToken) {
      return res.status(401).json({
        message: "ログインしていません",
      });
    }

    /* 2️⃣ Check session + user */
    const result = await pool.query(
      `
      SELECT
        users.id,
        users.name,
        users.email,
        users.status
      FROM sessions
      JOIN users
        ON users.id = sessions.user_id
      WHERE sessions.session_token = $1
        AND sessions.expires_at > now()
      `,
      [sessionToken]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({
        message: "セッションが無効です",
      });
    }

    const user = result.rows[0];

    /* 3️⃣ Optional: check user status */
    if (user.status !== "active") {
      return res.status(403).json({
        message: "アカウントが有効ではありません",
      });
    }

    /* 4️⃣ Success */
    return res.status(200).json({
      id: user.id,
      name: user.name,
      email: user.email,
    });
  } catch (err) {
    console.error("Me API error:", err);

    return res.status(500).json({
      message: "サーバーエラーが発生しました",
    });
  }
}
