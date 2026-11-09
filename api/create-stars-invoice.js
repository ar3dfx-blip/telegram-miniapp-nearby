import { createStarsInvoice } from './_lib/telegram.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, phone, currentCoords } = req.body || {};

    const starsAmount = 500; // Flat 500 Telegram Stars for all users

    const title = 'Ghost Mode (Թաքնված ռեժիմ) — 30 Օր';
    const description = 'Անտեսանելի ռեժիմ Քիփսում 30 օրով (500 ⭐️)';
    const payload = `ghost_${userId || 'u'}_500_${Date.now()}`;

    const tgRes = await createStarsInvoice({
      title,
      description,
      payload,
      amount: starsAmount
    });

    if (tgRes.ok && tgRes.result) {
      return res.status(200).json({
        ok: true,
        invoiceUrl: tgRes.result,
        amount: starsAmount
      });
    }

    return res.status(400).json({
      ok: false,
      error: tgRes.description || 'Failed to create Telegram invoice link'
    });
  } catch (err) {
    console.error('API /create-stars-invoice error:', err);
    return res.status(500).json({ error: err.message });
  }
}

