// Telegram Bot Launcher: Responds to /start and launches Mini App WebApp Button
import dotenv from 'dotenv';
dotenv.config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://my-telegram-miniapp.vercel.app';

if (!BOT_TOKEN) {
  console.log(`
=============================================================
⚠️  TELEGRAM_BOT_TOKEN չի գտնվել .env ֆայլում:
-------------------------------------------------------------
1. Բացեք Telegram և գտեք @BotFather
2. Ուղարկեք /newbot և ստացեք Ձեր Bot Token-ը
3. Ստեղծեք .env ֆայլ և ավելացրեք հետևյալ տողերը՝

   TELEGRAM_BOT_TOKEN=ՁԵՐ_TOKEN_Ը
   WEBAPP_URL=https://your-domain-or-ngrok-url.com

4. Այնուհետև նորից գործարկեք՝ npm run bot
=============================================================
`);
  process.exit(0);
}

const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function telegramRequest(method, payload) {
  const res = await fetch(`${API_BASE}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return res.json();
}

async function startBot() {
  console.log(`🤖 Telegram Bot-ը սկսում է աշխատանքը...`);

  // Verify Bot Token
  const me = await telegramRequest('getMe', {});
  if (!me.ok) {
    console.error(`❌ Սխալ Bot Token:`, me.description);
    return;
  }
  console.log(`✅ Միացված է բոտին՝ @${me.result.username} (${me.result.first_name})`);
  console.log(`🔗 WebApp URL՝ ${WEBAPP_URL}`);

  // Set default menu button for all users
  await telegramRequest('setChatMenuButton', {
    menu_button: {
      type: 'web_app',
      text: '📍 Մոտակա Մարդիկ',
      web_app: { url: WEBAPP_URL }
    }
  });

  // Simple Long Polling loop for /start commands
  let offset = 0;
  console.log(`🎧 Լսում ենք նոր հաղորդագրությունները...`);

  while (true) {
    try {
      const updates = await telegramRequest('getUpdates', {
        offset,
        timeout: 30
      });

      if (updates.ok && updates.result.length > 0) {
        for (const update of updates.result) {
          offset = update.update_id + 1;
          const msg = update.message;

          if (msg && msg.text) {
            const chatId = msg.chat.id;
            const firstName = msg.from.first_name || 'Ընկեր';

            if (msg.text.startsWith('/start')) {
              await telegramRequest('sendMessage', {
                chat_id: chatId,
                text: `👋 Ողջույն, ${firstName}!\n\nԲարի գալուստ **Մոտակա Կապ (People Nearby)** Telegram Mini App:\n\n📡 Ռադարով տեսեք, թե ովքեր են կանգնած կամ զբոսնում Ձեր մոտակայքում (10մ-ից մինչև 5կմ),\n💬 Դիտեք նրանց պրոֆիլները,\n🚀 Եվ գրեք նրանց ուղիղ հաղորդագրություն:\n\nՍեղմեք ներքևի կոճակը հավելվածը բացելու համար 👇`,
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: '🚀 Բացել Մոտակա Կապ (People Nearby)',
                        web_app: { url: WEBAPP_URL }
                      }
                    ],
                    [
                      {
                        text: 'ℹ️ Ինչպես է աշխատում',
                        callback_data: 'help_info'
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
