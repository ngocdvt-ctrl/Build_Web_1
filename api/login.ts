import type { VercelRequest, VercelResponse } from "@vercel/node";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { Pool } from "pg";

/* ==============================
   PostgreSQL connection pool
============================== */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const JWT_SECRET = process.env.JWT_SECRET as string;

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

    /* 2️⃣ Find user */
    const result = await pool.query(
      `
      SELECT id, name, password_hash, status
      FROM users
      WHERE email = $1
      `,
      [email]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({
        message: "メールアドレスまたはパスワードが正しくありません",
      });
    }

    const user = result.rows[0];

    /* 3️⃣ Check status */
    if (user.status !== "active") {
      return res.status(403).json({
        message: "メール認証が完了していません",
      });
    }

    /* 4️⃣ Verify password */
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({
        message: "メールアドレスまたはパスワードが正しくありません",
      });
    }

    /* 5️⃣ Issue JWT */
    const token = jwt.sign(
      {
        userId: user.id,
        email,
      },
      JWT_SECRET,
      {
        expiresIn: "1h",
      }
    );

    /* 6️⃣ Response */
    return res.status(200).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      message: "サーバーエラーが発生しました",
    });
  }
}
