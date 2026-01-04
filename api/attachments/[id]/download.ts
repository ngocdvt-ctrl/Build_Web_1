import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Storage } from "@google-cloud/storage";

// Nếu anh đang dùng @vercel/postgres:
import { sql } from "@vercel/postgres";

// -------------------------
// Config
// -------------------------
const COOKIE_NAME = process.env.COOKIE_NAME || "session_token";
const SIGNED_URL_EXPIRES_MS = 5 * 60 * 1000; // 5 phút

function parseCookies(req: VercelRequest): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  return header.split(";").reduce((acc, part) => {
    const [k, ...v] = part.trim().split("=");
    if (!k) return acc;
    acc[k] = decodeURIComponent(v.join("=") || "");
    return acc;
  }, {} as Record<string, string>);
}

function getGcsClient(): Storage {
  const json = process.env.GCS_SERVICE_ACCOUNT_JSON;
  if (!json) throw new Error("Missing env: GCS_SERVICE_ACCOUNT_JSON");

  // JSON có thể đã bị xuống dòng; parse vẫn OK
  const credentials = JSON.parse(json);
  return new Storage({ credentials });
}

async function requireSessionUser(req: VercelRequest): Promise<{ user_id: string } | null> {
  const cookies = parseCookies(req);
  const sessionToken = cookies[COOKIE_NAME];
  if (!sessionToken) return null;

  // Kiểm tra session trong DB: tồn tại + chưa hết hạn
  // Adjust query nếu schema sessions của anh khác.
  const { rows } = await sql`
    SELECT user_id
    FROM sessions
    WHERE session_token = ${sessionToken}
      AND expires_at > NOW()
    LIMIT 1
  `;

  if (rows.length === 0) return null;
  return { user_id: rows[0].user_id as string };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ message: "Method not allowed" });
    }

    // 1) Auth: bắt buộc login
    const user = await requireSessionUser(req);
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // 2) Validate input
    const id = String(req.query.id || "").trim();
    if (!id) {
      return res.status(400).json({ message: "Missing attachment id" });
    }

    // 3) Load attachment metadata from DB
    const { rows } = await sql`
      SELECT id, filename, storage_provider, storage_key, content_type
      FROM attachments
      WHERE id = ${id}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return res.status(404).json({ message: "Attachment not found" });
    }

    const attachment = rows[0] as {
      id: string;
      filename: string;
      storage_provider: string;
      storage_key: string;
      content_type: string | null;
    };

    // 4) (Optional) Nếu anh muốn chặn download tuỳ theo bài post published hay quyền user,
    // anh có thể join posts ở đây và check thêm.
    // Hiện tại: đã login là cho tải.

    // 5) Generate signed URL (GCS)
    if (attachment.storage_provider !== "gcs") {
      return res.status(400).json({ message: "Unsupported storage provider" });
    }

    const bucket = process.env.GCS_BUCKET;
    if (!bucket) throw new Error("Missing env: GCS_BUCKET");

    const storage = getGcsClient();
    const file = storage.bucket(bucket).file(attachment.storage_key);

    const [signedUrl] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + SIGNED_URL_EXPIRES_MS,
      // (Optional) enforce content-type on response:
      // responseType: attachment.content_type ?? undefined,
      // (Optional) force download filename:
      // responseDisposition: `attachment; filename="${encodeURIComponent(attachment.filename)}"`,
    });

    // 6) Redirect để browser tải trực tiếp từ GCS
    res.setHeader("Cache-Control", "no-store");
    return res.redirect(302, signedUrl);
  } catch (err: any) {
    console.error("[download] error:", err?.message || err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}
