import { getAllUsers, saveUser } from './_lib/db.js';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'POST') {
      const userData = req.body || {};
      if (!userData.name && !userData.username && !userData.id) {
        return res.status(400).json({ error: 'User info required' });
      }

      const saved = await saveUser(userData);
      return res.status(200).json({ ok: true, user: saved });
    }

    if (req.method === 'GET') {
      const all = await getAllUsers();
      const excludeId = String(req.query.exclude_id || '').trim();
      const excludeUser = String(req.query.exclude_username || '').replace(/^@/, '').trim().toLowerCase();
      const excludePhone = String(req.query.exclude_phone || '').replace(/\D/g, '');
      const excludeName = String(req.query.exclude_name || '').trim().toLowerCase();

      const filtered = all.filter(u => {
        if (!u) return false;
        if (excludeId && (String(u.id) === excludeId || String(u.telegramId) === excludeId)) return false;
        if (excludeUser && (u.username || '').replace(/^@/, '').trim().toLowerCase() === excludeUser) return false;
        const uPhone = (u.phone || '').replace(/\D/g, '');
        if (excludePhone && uPhone && (excludePhone === uPhone || excludePhone.endsWith(uPhone) || uPhone.endsWith(excludePhone))) return false;
        if (excludeName && excludeName !== 'telegram user' && (u.name || '').trim().toLowerCase() === excludeName) return false;
        return true;
      });

      return res.status(200).json({ ok: true, users: filtered });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API /users error:', err);
    return res.status(500).json({ error: err.message });
  }
}

