import type { VercelRequest, VercelResponse } from "@vercel/node";
import bcrypt from "bcrypt";
import { Pool } from "pg";
import crypto from "crypto";

/* ==============================
   PostgreSQL connection pool
============================== */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/* ==============================
   API: POST /api/login
============================== */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  try {
    const { email, password } = req.body;

    /* 1️⃣ Validate */
    if (!email || !password) {
      return res.status(400).json({
        message: "メールアドレスとパスワードを入力してください",
      });
    }

    /* 2️⃣ Get user */
    const userResult = await pool.query(
      `
      SELECT id, password_hash, status
      FROM users
      WHERE email = $1
      `,
      [email]
    );

    if (userResult.rowCount === 0) {
      return res.status(401).json({
        message: "メールアドレスまたはパスワードが正しくありません",
      });
    }

    const user = userResult.rows[0];

    /* 3️⃣ Status check */
    if (user.status !== "active") {
      return res.status(403).json({
        message: "メール認証が完了していません",
      });
    }

    /* 4️⃣ Password check */
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({
        message: "メールアドレスまたはパスワードが正しくありません",
      });
    }

    /* ==============================
       5️⃣ Create session
    ============================== */

    const sessionToken = crypto.randomBytes(32).toString("hex");

    // Session expires in 7 days
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    /* 6️⃣ Insert session */
    await pool.query(
      `
      INSERT INTO sessions (user_id, session_token, expires_at)
      VALUES ($1, $2, $3)
      `,
      [user.id, sessionToken, expiresAt]
    );

    /* 7️⃣ Response (cookie sẽ làm ở bước sau) */
    return res.status(200).json({
      message: "ログイン成功",
      sessionToken, // ⚠️ tạm trả về để test
    });

  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({
      message: "サーバーエラーが発生しました",
    });
  }
}
