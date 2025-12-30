import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  const { token } = req.query;

  if (!token || typeof token !== "string") {
    return res.status(400).send("Invalid token");
  }

  const result = await pool.query(
    `
    UPDATE users
    SET status = 'active',
        email_verified_at = now(),
        verification_token = NULL
    WHERE verification_token = $1
    RETURNING id
    `,
    [token]
  );

  if (result.rowCount === 0) {
    return res.status(400).send("Token is invalid or expired");
  }

  // redirect to 完了画面
  res.redirect("/register-complete.html");
}
