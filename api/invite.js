import { sendTelegramMessage } from './_lib/telegram.js';

const WEBAPP_URL = process.env.WEBAPP_URL || 'https://qips-miniapp.vercel.app';
const QIPS_BOT_URL = 'https://t.me/QipsBot';

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
    const { contact } = req.body || {};
    if (!contact) {
      return res.status(400).json({ error: 'Contact required' });
    }

    const cleanUsername = (contact.username || '').replace(/^@/, '').trim();
    const chatTarget = contact.telegramId || contact.chatId || (cleanUsername ? `@${cleanUsername}` : null);

    const anonymousText =
      `*Անանուն հրավեր «Քիփս» (Qips) հավելվածում*\n\n` +
      `Ձեր տելեգրամյան կոնտակտներից մեկը անանուն հրավիրել է Ձեզ միանալ *Qips* հավելվածին՝ մտերմանալու և մոտակայքում շփվելու համար։\n\n` +
      `_Հրավերն ուղարկված է QipsBot-ի կողմից անանուն՝ ուղարկողի տվյալները բացարձակ գաղտնի են։_\n\n` +
      `Սեղմեք ներքևի կոճակը՝ հավելվածը բացելու համար 👇`;

    let sent = false;
    if (chatTarget) {
      const tgRes = await sendTelegramMessage(chatTarget, anonymousText, {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Միանալ Քիփս (Qips)-ին', url: QIPS_BOT_URL }]
          ]
        }
      });
      sent = Boolean(tgRes.ok);
    }

    const inviteText = `👋 Ողջույն! Միացիր «Քիփս» (Qips) հավելվածին՝ մոտակայքում գտնվող մարդկանց գտնելու և շփվելու համար՝ ${QIPS_BOT_URL}`;
    const directShareUrl = `https://t.me/share/url?url=${encodeURIComponent(QIPS_BOT_URL)}&text=${encodeURIComponent(inviteText)}`;

    return res.status(200).json({
      ok: true,
      sent,
      shareUrl: directShareUrl
    });
  } catch (err) {
    console.error('API /invite error:', err);
    return res.status(500).json({ error: err.message });
  }
}

