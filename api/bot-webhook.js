import { saveUser, activateGhostSubscription } from './_lib/db.js';
import { callTelegram, sendTelegramMessage, answerPreCheckout } from './_lib/telegram.js';

const WEBAPP_URL = process.env.WEBAPP_URL || 'https://qips-miniapp.vercel.app';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    // Webhook setup / test endpoint
    const host = req.headers.host || 'qips-miniapp.vercel.app';
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const webhookUrl = `${proto}://${host}/api/bot-webhook`;

    if (req.query.setup === '1') {
      const tgRes = await callTelegram('setWebhook', {
        url: webhookUrl,
        allowed_updates: ['message', 'callback_query', 'pre_checkout_query']
      });
      return res.status(200).json({ ok: true, webhookUrl, tgRes });
    }

    const info = await callTelegram('getWebhookInfo');
    return res.status(200).json({ status: 'running', webhookUrl, info });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const update = req.body || {};

    // 1. Telegram Stars Pre-Checkout Query (MANDATORY for payments)
    if (update.pre_checkout_query) {
      const q = update.pre_checkout_query;
      await answerPreCheckout(q.id, true);
      return res.status(200).json({ ok: true });
    }

    const msg = update.message;
    if (msg) {
      const chatId = msg.chat?.id;
      const firstName = msg.from?.first_name || 'Ընկեր';
      const username = msg.from?.username || '';
      const userId = String(msg.from?.id || chatId);

      // Register or update user in cloud DB
      await saveUser({
        id: userId,
        telegramId: userId,
        name: [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || firstName,
        username,
        photoUrl: username ? `https://t.me/i/userpic/320/${username}.jpg` : null
      });

      // 2. Successful Payment via Telegram Stars
      if (msg.successful_payment) {
        const sp = msg.successful_payment;
        await activateGhostSubscription(userId, '', sp.total_amount);

        const returnUrl = `${WEBAPP_URL}${WEBAPP_URL.includes('?') ? '&' : '?'}ghost=active&tg_id=${userId}`;
        await sendTelegramMessage(
          chatId,
          `*Շնորհավորում ենք!* Ձեր *Ghost Mode (Թաքնված ռեժիմ)* ամսական բաժանորդագրությունը (${sp.total_amount} ⭐️ Telegram Stars) ակտիվացված է 30 օրով։\n\n` +
          `Այժմ կարող եք 100% անտեսանելի դիտել մոտակայքը *Քիփս* հավելվածում 👻`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Բացել Քիփս (Ghost Mode)', web_app: { url: returnUrl } }]
              ]
            }
          }
        );
        return res.status(200).json({ ok: true });
      }

      // 3. Contact Shared (Save verified phone number)
      if (msg.contact) {
        const phone = msg.contact.phone_number || '';
        const normalizedPhone = phone.startsWith('+') ? phone : `+${phone}`;

        await saveUser({
          id: userId,
          telegramId: userId,
          name: firstName,
          username,
          phone: normalizedPhone,
          photoUrl: username ? `https://t.me/i/userpic/320/${username}.jpg` : null
        });

        const userWebAppUrl = `${WEBAPP_URL}${WEBAPP_URL.includes('?') ? '&' : '?'}phone=${encodeURIComponent(normalizedPhone)}&username=${encodeURIComponent(username)}&name=${encodeURIComponent(firstName)}&tg_id=${userId}`;

        try {
          await callTelegram('setChatMenuButton', {
            chat_id: chatId,
            menu_button: {
              type: 'web_app',
              text: 'Քիփս',
              web_app: { url: userWebAppUrl }
            }
          });
        } catch (e) {}

        await sendTelegramMessage(
          chatId,
          `👋 Շնորհակալություն, *${firstName}*։ Ձեր պրոֆիլը կարգավորված է։\n\n` +
          `Սեղմեք ներքևի կոճակը հավելվածը բացելու համար 👇`,
          {
            reply_markup: {
              remove_keyboard: true,
              inline_keyboard: [
                [{ text: 'Բացել Քիփս (Qips)', web_app: { url: userWebAppUrl } }]
              ]
            }
          }
        );
        return res.status(200).json({ ok: true });
      }

      // 4. Text Commands
      if (msg.text) {
        if (msg.text.startsWith('/start')) {
          const userParams = new URLSearchParams();
          if (username) userParams.set('username', username);
          if (firstName) userParams.set('name', firstName);
          userParams.set('tg_id', userId);
          const userWebAppUrl = `${WEBAPP_URL}${WEBAPP_URL.includes('?') ? '&' : '?'}${userParams.toString()}`;

          await sendTelegramMessage(
            chatId,
            `👋 Ողջույն, *${firstName}*!\n\n` +
            `Բարի գալուստ **Քիփս (Qips)**՝ [@QipsBot](https://t.me/QipsBot):\n\n` +
            `📡 Ռադարով տեսեք, թե ովքեր են Ձեր մոտակայքում,\n` +
            `• Սեղմեք **«ՔԻՓՍ»**՝ մտերմանալու համար,\n` +
            `• Սեղմեք **«Քփվել»**՝ Ձեր կոնտակտներին հրավիրելու համար։\n\n` +
            `Սեղմեք ներքևի կոճակը հավելվածը բացելու համար 👇`,
            {
              reply_markup: {
                remove_keyboard: true,
                inline_keyboard: [
                  [{ text: 'Բացել Քիփս (Qips)', web_app: { url: userWebAppUrl } }]
                ]
              }
            }
          );
        } else if (msg.text.startsWith('/ghost')) {
          await sendTelegramMessage(
            chatId,
            `👻 *Ghost Mode (Թաքնված ռեժիմ)*\n\n` +
            `Ghost Mode-ը թույլ է տալիս դիտել մոտակայքում գտնվող օգտատերերին՝ մնալով 100% անտեսանելի ռադարում։\n\n` +
            `Այն կարող եք միացնել հավելվածի կարգավորումներում 👇`,
            {
              reply_markup: {
                remove_keyboard: true,
                inline_keyboard: [
                  [{ text: 'Բացել Քիփս', web_app: { url: WEBAPP_URL } }]
                ]
              }
            }
          );
        }
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
}

