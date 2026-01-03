import type { VercelRequest, VercelResponse } from "@vercel/node";
import bcrypt from "bcrypt";
import { Pool } from "pg";
import crypto from "crypto";
import { Resend } from "resend";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

function getBaseUrl(req: VercelRequest) {
  // Ưu tiên env khi deploy
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, "");
  // Fallback cho local/dev
  const host = req.headers.host;
  const proto = (req.headers["x-forwarded-proto"] as string) || "http";
  return `${proto}://${host}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const client = await pool.connect();

  try {
    const { name, email, phone, password } = req.body ?? {};

    // 1) Validate
    if (!name || !email || !phone || !password) {
      return res.status(400).json({ message: "必須項目が不足しています" });
    }

    const normalizedEmail = String(email).toLowerCase().trim();

    // 2) Begin
    await client.query("BEGIN");

    // 3) Duplicate check
    const existing = await client.query("SELECT id FROM users WHERE email = $1", [
      normalizedEmail,
    ]);
    if (existing.rowCount && existing.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "このメールアドレスは既に登録されています" });
    }

    // 4) Hash
    const passwordHash = await bcrypt.hash(String(password), 10);

    // 5) Token + expiry
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const tokenExpiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

    // 6) Insert pending user
    await client.query(
      `
      INSERT INTO users (
        name,
        email,
        phone,
        password_hash,
        role,
        status,
        verification_token,
        verification_token_expires_at,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, 'user', 'pending', $5, $6, NOW(), NOW())
      `,
      [name, normalizedEmail, phone, passwordHash, verificationToken, tokenExpiresAt]
    );

    // 7) Commit DB
    await client.query("COMMIT");

    // 8) Send email via Resend (REAL)
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      console.warn("RESEND_API_KEY is missing. Email not sent.");
      // DB đã insert rồi, trả message để anh debug
      return res.status(201).json({
        message:
          "仮登録が完了しました（メール送信設定が未完了です）。RESEND_API_KEYを設定してください。",
      });
    }

    const resend = new Resend(resendKey);

    const baseUrl = getBaseUrl(req);
    // ✅ thống nhất endpoint verify: anh đang có verify-email.ts -> dùng /api/verify-email
    const verifyUrl = `${baseUrl}/api/verify-email?token=${verificationToken}`;

    await resend.emails.send({
      from: process.env.MAIL_FROM || "onboarding@resend.dev",
      to: normalizedEmail,
      subject: "【ngoc-web】メールアドレス確認",
      html: `
        <p>${name} 様</p>
        <p>以下のリンクをクリックしてメールアドレスを確認してください。</p>
        <p><a href="${verifyUrl}">${verifyUrl}</a></p>
        <p>※リンクの有効期限：1時間</p>
      `,
    });

    return res.status(201).json({
      message: "仮登録が完了しました。確認メールをご確認ください。",
    });
  } catch (error) {
    // rollback chỉ khi transaction đang mở (có thể fail trước COMMIT)
    try {
      await client.query("ROLLBACK");
    } catch {}

    console.error("Register error:", error);
    return res.status(500).json({ message: "サーバーエラーが発生しました" });
  } finally {
    client.release();
  }
}
