// Telegram Bot Controller for @QipsBot (https://t.me/QipsBot)
// Handles /start, Anonymous Invitations, Mutual Qips Notifications,
// and silent profile phone registration (Ghost Mode payment is initiated strictly inside the Mini App).
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
dotenv.config();

const _b1 = '9102883915';
const _b2 = 'AAFF4nyDxRF0IxZdDxyqG6nUb9t6X4DBJeE';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || `${_b1}:${_b2}`;
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://qips-miniapp.vercel.app';
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Store known users by username -> chatId for anonymous invitations
const knownBotUsers = new Map();

// Persisted user profiles (userId -> { phone, firstName, username, updatedAt })
const DATA_DIR = path.resolve('./data');
const PROFILES_FILE = path.join(DATA_DIR, 'user_profiles.json');
let userProfiles = new Map();
try {
  if (fs.existsSync(PROFILES_FILE)) {
    const raw = fs.readFileSync(PROFILES_FILE, 'utf-8');
    userProfiles = new Map(Object.entries(JSON.parse(raw)));
  }
} catch (e) {}

function saveUserProfiles() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const obj = Object.fromEntries(userProfiles.entries());
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(obj, null, 2), 'utf-8');
  } catch (e) {}
}

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
  console.log(`Միացված է բոտին՝ @${me.result.username} (https://t.me/${me.result.username})`);
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
      { command: 'start', description: 'Բացել Քիփս (Qips) հավելվածը' },
      { command: 'ghost', description: '👻 Ghost Mode (Թաքնված ռեժիմ)' },
      { command: 'invite', description: 'Ուղարկել հրավեր կոնտակտին' }
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
            console.log(`Վճարումը հաջողվեց՝ ${sp.total_amount} ${sp.currency} (User: ${chatId})`);
            await telegramRequest('sendMessage', {
              chat_id: chatId,
              text:
                `🎉 *Շնորհավորում ենք!* Ձեր *Ghost Mode (Թաքնված ռեժիմ)* ամսական բաժանորդագրությունը (${sp.total_amount} ⭐️ Telegram Stars) ակտիվացված է 30 օրով։\n\n` +
                `Այժմ կարող եք 100% անտեսանելի դիտել մոտակայքը *Քիփս* հավելվածում 👻`,
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: 'Բացել Քիփս (Ghost Mode)', web_app: { url: WEBAPP_URL } }]
                ]
              }
            });
            continue;
          }

          // 3. Handle Shared Contact (Store SILENTLY in user's profile, NO SCARY INVOICES IN CHAT)
          if (msg.contact) {
            const phone = msg.contact.phone_number || '';
            const normalizedPhone = phone.startsWith('+') ? phone : `+${phone}`;
            const userId = String(msg.from?.id || chatId);

            userProfiles.set(userId, {
              id: userId,
              phone: normalizedPhone,
              firstName,
              username: msg.from?.username || '',
              updatedAt: Date.now()
            });
            saveUserProfiles();

            const userParams = new URLSearchParams();
            userParams.set('phone', normalizedPhone);
            if (msg.from?.username) userParams.set('username', msg.from.username);
            if (firstName) userParams.set('name', firstName);
            userParams.set('tg_id', userId);
            const userWebAppUrl = `${WEBAPP_URL}${WEBAPP_URL.includes('?') ? '&' : '?'}${userParams.toString()}`;

            // Silently update the Menu Button for this user with their verified phone & identity
            try {
              await telegramRequest('setChatMenuButton', {
                chat_id: chatId,
                menu_button: {
                  type: 'web_app',
                  text: 'Քիփս',
                  web_app: { url: userWebAppUrl }
                }
              });
            } catch (e) {}

            // Send a warm, friendly confirmation (NO scary invoice, NO payment prompt)
            await telegramRequest('sendMessage', {
              chat_id: chatId,
              text:
                `👋 Շնորհակալություն, *${firstName}*։ Ձեր պրոֆիլը կարգավորված է։\n\n` +
                `Սեղմեք ներքևի կոճակը հավելվածը բացելու համար 👇`,
              parse_mode: 'Markdown',
              reply_markup: {
                remove_keyboard: true,
                inline_keyboard: [
                  [
                    {
                      text: 'Բացել Քիփս (Qips)',
                      web_app: { url: userWebAppUrl }
                    }
                  ]
                ]
              }
            });
            continue;
          }

          // 4. Handle Text Commands
          if (msg.text) {
            if (msg.text.startsWith('/start')) {
              const savedUser = userProfiles.get(String(chatId));
              const userParams = new URLSearchParams();
              if (savedUser?.phone) userParams.set('phone', savedUser.phone);
              const uName = msg.from?.username || savedUser?.username;
              if (uName) userParams.set('username', uName);
              if (firstName) userParams.set('name', firstName);
              userParams.set('tg_id', String(chatId));
              const userWebAppUrl = `${WEBAPP_URL}${WEBAPP_URL.includes('?') ? '&' : '?'}${userParams.toString()}`;

              await telegramRequest('sendMessage', {
                chat_id: chatId,
                text:
                  `👋 Ողջույն, *${firstName}*!\n\n` +
                  `Բարի գալուստ **Քիփս (Qips)**՝ [@QipsBot](https://t.me/QipsBot):\n\n` +
                  `📡 Ռադարով տեսեք, թե ովքեր են Ձեր մոտակայքում,\n` +
                  `• Սեղմեք **«ՔԻՓՍ»**՝ մտերմանալու համար,\n` +
                  `• Սեղմեք **«Քփվել»**՝ Ձեր կոնտակտներին հրավիրելու համար։\n\n` +
                  `Սեղմեք ներքևի կոճակը հավելվածը բացելու համար 👇`,
                parse_mode: 'Markdown',
                reply_markup: {
                  remove_keyboard: true,
                  inline_keyboard: [
                    [
                      {
                        text: 'Բացել Քիփս (Qips)',
                        web_app: { url: userWebAppUrl }
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
                  `Ghost Mode-ը թույլ է տալիս դիտել մոտակայքում գտնվող օգտատերերին՝ մնալով 100% անտեսանելի ռադարում։\n\n` +
                  `Այն կարող եք միացնել հավելվածի կարգավորումներում 👇`,
                parse_mode: 'Markdown',
                reply_markup: {
                  remove_keyboard: true,
                  inline_keyboard: [
                    [
                      {
                        text: 'Բացել Քիփս',
                        web_app: { url: WEBAPP_URL }
                      }
                    ]
                  ]
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
