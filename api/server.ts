import { db } from '@vercel/postgres';
import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'メソッドが許可されていません。' });
  }

  const { action, username, password } = req.body; // Thêm biến action để phân biệt

  try {
    const client = await db.connect();

    // --- 会員登録 (Đăng ký) ---
    if (action === 'register') {
      await client.sql`
        INSERT INTO users (username, password) VALUES (${username}, ${password});
      `;
      return res.status(200).json({ message: "会員登録が完了しました！" });
    } 

    // --- ログイン (Đăng nhập) ---
    else if (action === 'login') {
      const { rows } = await client.sql`
        SELECT * FROM users WHERE username = ${username} AND password = ${password};
      `;

      if (rows.length > 0) {
        return res.status(200).json({ message: "ログインに成功しました！" });
      } else {
        return res.status(401).json({ error: "IDまたはパスワードが正しくありません。" });
      }
    }

  } catch (error: any) {
    if (error.code === '23505') return res.status(400).json({ error: 'このIDは既に存在します。' });
    return res.status(500).json({ error: "サーバーエラーが発生しました。" });
  }
}