import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Storage } from "@google-cloud/storage";
import { sql } from "@vercel/postgres";

const COOKIE_NAME = process.env.COOKIE_NAME || "session";
const SIGNED_URL_EXPIRES_MS = 5 * 60 * 1000; // 5 phút

function parseCookies(header?: string): Record<string, string> {
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
  const credentials = JSON.parse(json);
  return new Storage({ credentials });
}

async function requireSession(req: VercelRequest): Promise<boolean> {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  if (!token) return false;

  const { rows } = await sql`
    SELECT 1
    FROM sessions
    WHERE session_token = ${token}
      AND expires_at > NOW()
    LIMIT 1
  `;
  return rows.length > 0;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ message: "Method not allowed" });
    }

    // 1) Auth
    const ok = await requireSession(req);
    if (!ok) return res.status(401).json({ message: "Unauthorized" });

    // 2) Input
    const id = String(req.query.id || "").trim();
    if (!id) return res.status(400).json({ message: "Missing attachment id" });

    // 3) Load attachment metadata
    const { rows } = await sql`
      SELECT id, filename, storage_provider, storage_key, content_type
      FROM attachments
      WHERE id = ${id}
      LIMIT 1
    `;

    if (rows.length === 0) return res.status(404).json({ message: "Attachment not found" });

    const attachment = rows[0] as {
      id: string;
      filename: string;
      storage_provider: string;
      storage_key: string;
      content_type: string | null;
    };

    if (attachment.storage_provider !== "gcs") {
      return res.status(400).json({ message: "Unsupported storage provider" });
    }

    // 4) Signed URL
    const bucket = process.env.GCS_BUCKET;
    if (!bucket) throw new Error("Missing env: GCS_BUCKET");

    const storage = getGcsClient();
    const file = storage.bucket(bucket).file(attachment.storage_key);

    const [signedUrl] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + SIGNED_URL_EXPIRES_MS,
      responseDisposition: `attachment; filename="${encodeURIComponent(attachment.filename)}"`,
    });

    // 5) Redirect
    res.setHeader("Cache-Control", "no-store");
    return res.redirect(302, signedUrl);
  } catch (err: any) {
    console.error("[download] error:", err?.message || err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}
