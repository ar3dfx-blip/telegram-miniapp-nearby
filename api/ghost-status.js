import { getGhostStatus, activateGhostSubscription } from './_lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'POST') {
      const { userId, phone, starsPaid } = req.body || {};
      const sub = await activateGhostSubscription(userId, phone, starsPaid);
      return res.status(200).json({ ok: true, subscription: sub });
    }

    if (req.method === 'GET') {
      const userId = req.query.user_id || req.query.userId || '';
      const phone = req.query.phone || '';
      const status = await getGhostStatus(userId, phone);
      return res.status(200).json({ ok: true, ...status });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API /ghost-status error:', err);
    return res.status(500).json({ error: err.message });
  }
}

