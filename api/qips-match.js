import { recordSecretIntent, checkMutualMatch } from './_lib/db.js';
import { sendTelegramMessage } from './_lib/telegram.js';

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
    const { fromUser, toUser } = req.body || {};
    if (!fromUser || !toUser) {
      return res.status(400).json({ error: 'fromUser and toUser are required' });
    }

    const result = await recordSecretIntent(fromUser, toUser);

    if (result.mutual) {
      const mutualGreeting = 'Մենք երկուսս էլ ավելի Քիփ դառնալու ցանկություն ունենք, եթե դեմ չես սկսենք շփվել';

      // 1. Notify toUser on Telegram
      const toTarget = toUser.telegramId || (toUser.username ? `@${toUser.username}` : null);
      if (toTarget) {
        const fromName = fromUser.name || `@${fromUser.username || 'user'}`;
        const cleanFromUser = (fromUser.username || '').replace(/^@/, '');
        await sendTelegramMessage(
          toTarget,
          `*Քիփս (Qips) Համընկնում!*\n\n` +
          `Դուք և *${fromName}*-ը երկուսդ էլ սեղմել եք «ՔԻՓՍ»՝ մտերմանալու համար։\n\n` +
          `💬 *Ողջույնի հաղորդագրություն՝*\n` +
          `«${mutualGreeting}»\n\n` +
          (cleanFromUser ? `👉 [Սկսել շփվել @${cleanFromUser}-ի հետ](https://t.me/${cleanFromUser})` : ''),
          {
            reply_markup: cleanFromUser ? {
              inline_keyboard: [
                [{ text: '💬 Սկսել շփվել Telegram-ում', url: `https://t.me/${cleanFromUser}` }]
              ]
            } : undefined
          }
        );
      }

      // 2. Notify fromUser on Telegram
      const fromTarget = fromUser.telegramId || (fromUser.username ? `@${fromUser.username}` : null);
      if (fromTarget) {
        const toName = toUser.name || `@${toUser.username || 'user'}`;
        const cleanToUser = (toUser.username || '').replace(/^@/, '');
        await sendTelegramMessage(
          fromTarget,
          `*Քիփս (Qips) Համընկնում!*\n\n` +
          `Դուք և *${toName}*-ը երկուսդ էլ սեղմել եք «ՔԻՓՍ»՝ մտերմանալու համար։\n\n` +
          `💬 *Ողջույնի հաղորդագրություն՝*\n` +
          `«${mutualGreeting}»\n\n` +
          (cleanToUser ? `👉 [Սկսել շփվել @${cleanToUser}-ի հետ](https://t.me/${cleanToUser})` : ''),
          {
            reply_markup: cleanToUser ? {
              inline_keyboard: [
                [{ text: '💬 Սկսել շփվել Telegram-ում', url: `https://t.me/${cleanToUser}` }]
              ]
            } : undefined
          }
        );
      }

      return res.status(200).json({
        ok: true,
        mutual: true,
        message: mutualGreeting
      });
    }

    // Keep completely secret if not mutual!
    return res.status(200).json({
      ok: true,
      mutual: false,
      status: 'pending'
    });
  } catch (err) {
    console.error('API /qips-match error:', err);
    return res.status(500).json({ error: err.message });
  }
}

