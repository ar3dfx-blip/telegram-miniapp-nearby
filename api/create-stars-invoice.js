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

    const rawPhone = String(phone || '').replace(/\D/g, '');
    const isArmPhone = rawPhone.startsWith('374') || rawPhone.startsWith('0');
    const isArmCoord = currentCoords &&
      currentCoords.lat >= 38.8 && currentCoords.lat <= 41.3 &&
      currentCoords.lng >= 43.4 && currentCoords.lng <= 46.7;

    const isArmenian = Boolean(isArmPhone || isArmCoord);
    const starsAmount = isArmenian ? 50 : 500;

    const title = isArmenian
      ? 'Ghost Mode (Թաքնված ռեժիմ) — 1 Ամիս'
      : 'Ghost Mode (Stealth Mode) — 1 Month';
    const description = isArmenian
      ? `Անտեսանելի ռեժիմ Քիփսում 30 օրով (+374 սակագին՝ ${starsAmount} ⭐️)`
      : `Stealth browsing in Qips for 30 days (Rate: ${starsAmount} ⭐️)`;

    const payload = `ghost_${userId || 'u'}_${starsAmount}_${Date.now()}`;

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
        amount: starsAmount,
        isArmenian
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

