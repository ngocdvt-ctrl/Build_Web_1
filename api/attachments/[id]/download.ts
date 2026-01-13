import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

type AttachmentRow = {
  id: string;
  filename: string;
  content_type: string | null;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const id = String(req.query.id || "").trim();
  if (!id) return res.status(400).json({ message: "Invalid id" });

  try {
    // 1) Load post
    const postResult = await pool.query(
      `SELECT id, title, content, created_at
       FROM posts
       WHERE id = $1 AND published = TRUE
       LIMIT 1`,
      [id]
    );

    if (postResult.rows.length === 0) {
      return res.status(404).json({ message: "Not Found" });
    }

    const post = postResult.rows[0] as {
      id: string;
      title: string;
      content: string;
      created_at: string;
    };

    // 2) Load attachments for this post
    const attResult = await pool.query<AttachmentRow>(
      `SELECT id, filename, content_type
       FROM attachments
       WHERE post_id = $1
       ORDER BY created_at ASC`,
      [id]
    );

    // 3) Return combined
    return res.status(200).json({
      ...post,
      attachments: attResult.rows.map((a) => ({
        id: a.id,
        filename: a.filename,
        content_type: a.content_type,
      })),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}
