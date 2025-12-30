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
   API: POST /api/register
============================== */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const client = await pool.connect();

  try {
    const { name, email, phone, password } = req.body;

    /* ==============================
       1️⃣ Validate input
    ============================== */
    if (!name || !email || !phone || !password) {
      return res.status(400).json({
        message: "必須項目が不足しています",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    /* ==============================
       2️⃣ Start transaction
    ============================== */
    await client.query("BEGIN");

    /* ==============================
       3️⃣ Check duplicate email
    ============================== */
    const existing = await client.query(
      "SELECT id FROM users WHERE email = $1",
      [normalizedEmail]
    );

    if (existing.rowCount && existing.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        message: "このメールアドレスは既に登録されています",
      });
    }

    /* ==============================
       4️⃣ Hash password
    ============================== */
    const passwordHash = await bcrypt.hash(password, 10);

    /* ==============================
       5️⃣ Create verification token
    ============================== */
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const tokenExpiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

    /* ==============================
       6️⃣ Insert pending user
    ============================== */
    await client.query(
      `
      INSERT INTO users (
        name,
        email,
        phone,
        password_hash,
        status,
        verification_token,
        verification_token_expires_at,
        created_at
      )
      VALUES ($1, $2, $3, $4, 'pending', $5, $6, NOW())
      `,
      [
        name,
        normalizedEmail,
        phone,
        passwordHash,
        verificationToken,
        tokenExpiresAt,
      ]
    );

    /* ==============================
       7️⃣ Commit transaction
    ============================== */
    await client.query("COMMIT");

    /* ==============================
       8️⃣ Send verification email (DEV)
    ============================== */
    // TODO: Integrate Resend / SendGrid / SES
    console.log(
      `[DEV] Verify URL:
      https://ngoc-web.vercel.app/api/verify-email?token=${verificationToken}`
    );

    return res.status(201).json({
      message: "仮登録が完了しました。確認メールをご確認ください。",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Register error:", error);

    return res.status(500).json({
      message: "サーバーエラーが発生しました",
    });
  } finally {
    client.release();
  }
}
