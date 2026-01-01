import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Pool } from "pg";

/* ==============================
   PostgreSQL connection pool
============================== */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/* ==============================
   API: GET /api/verify-email
============================== */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "GET") {
    return res.status(405).send("Method Not Allowed");
  }

  const { token } = req.query;

  if (!token || typeof token !== "string") {
    return res.status(400).send("無効なリンクです");
  }

  const client = await pool.connect();

  try {
    /* ==============================
       1️⃣ Find pending user by token
    ============================== */
    const result = await client.query(
      `
      SELECT id, verification_token_expires_at
      FROM users
      WHERE verification_token = $1
        AND status = 'pending'
      `,
      [token]
    );

    if (result.rowCount === 0) {
      return res.status(400).send("無効または期限切れのリンクです");
    }

    const user = result.rows[0];

    /* ==============================
       2️⃣ Check token expiration
    ============================== */
    if (new Date(user.verification_token_expires_at) < new Date()) {
      return res.status(400).send("リンクの有効期限が切れています");
    }

    /* ==============================
       3️⃣ Activate user
    ============================== */
    await client.query(
      `
      UPDATE users
      SET
        status = 'active',
        verification_token = NULL,
        verification_token_expires_at = NULL,
        updated_at = NOW()
      WHERE id = $1
      `,
      [user.id]
    );

    /* ==============================
       4️⃣ Redirect to success page
    ============================== */
    return res.redirect("/register-success.html");
  } catch (error) {
    console.error("Verify email error:", error);
    return res.status(500).send("サーバーエラーが発生しました");
  } finally {
    client.release();
  }
}
