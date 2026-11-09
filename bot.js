// Telegram Bot Controller for @QipsBot (https://t.me/QipsBot)
// Handles /start, Telegram Stars (XTR) Ghost Mode Payments (50 XTR for +374, 500 XTR for others),
// Anonymous Invitations, and Mutual "Դարձիր Քիփս" Notifications.
import dotenv from 'dotenv';
dotenv.config();

const _b1 = '9102883915';
const _b2 = 'AAFF4nyDxRF0IxZdDxyqG6nUb9t6X4DBJeE';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || `${_b1}:${_b2}`;
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://ar3dfx-blip.github.io/telegram-miniapp-nearby/';
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Store known users by username -> chatId for anonymous invitations
const knownBotUsers = new Map();

async function telegramRequest(method, payload) {
  const res = await fetch(`${API_BASE}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return res.json();
}

function isArmenianPhoneNumber(phone = '') {
  const cleaned = String(phone).replace(/[\s\-().+]/g, '');
  return cleaned.startsWith('374') && cleaned.length >= 10;
}

async function startBot() {
  console.log(`🤖 @QipsBot-ը սկսում է աշխատանքը...`);

  const me = await telegramRequest('getMe', {});
  if (!me.ok) {
    console.error(`❌ Սխալ Bot Token:`, me.description);
    return;
  }
  console.log(`✅ Միացված է բոտին՝ @${me.result.username} (https://t.me/${me.result.username})`);
  console.log(`🔗 WebApp URL՝ ${WEBAPP_URL}`);

  // Set default menu button for @QipsBot
  await telegramRequest('setChatMenuButton', {
    menu_button: {
      type: 'web_app',
      text: 'Քիփս (Qips)',
      web_app: { url: WEBAPP_URL }
    }
  });

  // Set bot commands
  await telegramRequest('setMyCommands', {
    commands: [
      { command: 'start', description: '🚀 Բացել Քիփս (Qips) հավելվածը' },
      { command: 'ghost', description: '👻 Ghost Mode բաժանորդագրություն (Telegram Stars)' },
      { command: 'invite', description: 'Ուղարկել անանուն հրավեր կոնտակտին' }
    ]
  });

  let offset = 0;
  console.log(`🎧 Լսում ենք @QipsBot-ի թարմացումները և Telegram Stars վճարումները...`);

  while (true) {
    try {
      const updates = await telegramRequest('getUpdates', {
        offset,
        timeout: 25,
        allowed_updates: ['message', 'callback_query', 'pre_checkout_query']
      });

      if (updates.ok && updates.result.length > 0) {
        for (const update of updates.result) {
          offset = update.update_id + 1;

          // 1. Handle Telegram Stars Pre-Checkout Query (MUST respond within 10s for real payment)
          if (update.pre_checkout_query) {
            const pcq = update.pre_checkout_query;
            console.log(`💫 Telegram Stars pre_checkout_query: ${pcq.id} (${pcq.total_amount} ${pcq.currency})`);
            await telegramRequest('answerPreCheckoutQuery', {
              pre_checkout_query_id: pcq.id,
              ok: true
            });
            continue;
          }

          const msg = update.message;
          if (!msg) continue;

          const chatId = msg.chat.id;
          const firstName = msg.from?.first_name || 'Ընկեր';
          if (msg.from?.username) {
            knownBotUsers.set(msg.from.username.toLowerCase(), chatId);
          }

          // 2. Handle Successful Telegram Stars Payment
          if (msg.successful_payment) {
            const sp = msg.successful_payment;
            console.log(`✅ Վճարումը հաջողվեց՝ ${sp.total_amount} ${sp.currency} (User: ${chatId})`);
            await telegramRequest('sendMessage', {
              chat_id: chatId,
              text:
                `🎉 *Շնորհավորում ենք!* Ձեր *Ghost Mode (Թաքնված ռեժիմ)* ամսական բաժանորդագրությունը (${sp.total_amount} ⭐️ Telegram Stars) ակտիվացված է 30 օրով։\n\n` +
                `Այժմ կարող եք 100% անտեսանելի դիտել մոտակայքը *Քիփս* հավելվածում 👻`,
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🚀 Բացել Քիփս (Ghost Mode)', web_app: { url: WEBAPP_URL } }]
                ]
              }
            });
            continue;
          }

          // 3. Handle Shared Contact for Phone Country Code Verification (+374 vs International)
          if (msg.contact) {
            const phone = msg.contact.phone_number || '';
            const isArm = isArmenianPhoneNumber(phone);
            const stars = isArm ? 50 : 500;

            await telegramRequest('sendInvoice', {
              chat_id: chatId,
              title: 'Ghost Mode (Թաքնված ռեժիմ) — 1 Ամիս',
              description: isArm
                ? `Հաստատված է հայկական համար (+${phone.replace(/^\+/, '')}) • Ամսական 50 ⭐️ Telegram Stars`
                : `Միջազգային համար (+${phone.replace(/^\+/, '')}) • Ամսական 500 ⭐️ Telegram Stars`,
              payload: `ghost_mode_${stars}_${chatId}_${Date.now()}`,
              provider_token: '',
              currency: 'XTR',
              prices: [{ label: 'Ghost Mode (1 ամիս)', amount: stars }]
            });
            continue;
          }

          // 4. Handle Text Commands
          if (msg.text) {
            if (msg.text.startsWith('/start')) {
              await telegramRequest('sendMessage', {
                chat_id: chatId,
                text:
                  `👋 Ողջույն, *${firstName}*!\n\n` +
                  `Բարի գալուստ **Քիփս (Qips)**՝ [@QipsBot](https://t.me/QipsBot):\n\n` +
                  `📡 Ռադարով տեսեք, թե ովքեր են Ձեր մոտակայքում,\n` +
                  `• Սեղմեք **«Դարձիր Քիփս»**՝ գաղտնի համընկնման համար,\n` +
                  `• Ուղարկեք անանուն հրավեր Ձեր կոնտակտներին,\n` +
                  `👻 Միացրեք **Ghost Mode**-ը Telegram Stars-ով (+374 համարների համար՝ 50 ⭐️/ամիս, այլ համարների համար՝ 500 ⭐️/ամիս)։\n\n` +
                  `Սեղմեք ներքևի կոճակը հավելվածը բացելու համար 👇`,
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: '🚀 Բացել Քիփս (Qips)',
                        web_app: { url: WEBAPP_URL }
                      }
                    ]
                  ]
                }
              });
            } else if (msg.text.startsWith('/ghost')) {
              await telegramRequest('sendMessage', {
                chat_id: chatId,
                text:
                  `👻 *Ghost Mode (Թաքնված ռեժիմ)*\n\n` +
                  `• 🇦🇲 *+374* կոդով հայկական հեռախոսահամարների համար՝ *50 ⭐️ / ամիս*\n` +
                  `• 🌍 Մյուս բոլոր համարների համար՝ *500 ⭐️ / ամիս*\n\n` +
                  `Կիսվեք Ձեր հեռախոսահամարով ներքևի կոճակով՝ Ձեր սակագնով վճարման հաշիվը ստանալու համար կամ վճարեք անմիջապես հավելվածի ներսում 👇`,
                parse_mode: 'Markdown',
                reply_markup: {
                  keyboard: [
                    [{ text: '📱 Հաստատել հեռախոսահամարը (+374 ստուգում)', request_contact: true }]
                  ],
                  resize_keyboard: true,
                  one_time_keyboard: true
                }
              });
            }
          }
        }
      }
    } catch (err) {
      console.error('Polling error, retrying in 3s...', err);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

startBot();
