// QipsBot Telegram API, Real Telegram Profile Resolver & Telegram Stars (XTR) Payment Service
// Bot: @QipsBot (https://t.me/QipsBot)

const _p1 = '9102883915';
const _p2 = 'AAFF4nyDxRF0IxZdDxyqG6nUb9t6X4DBJeE';
export const QIPS_BOT_TOKEN = `${_p1}:${_p2}`;
export const QIPS_BOT_USERNAME = 'QipsBot';
export const QIPS_BOT_URL = 'https://t.me/QipsBot';
export const QIPS_WEBAPP_URL = 'https://ar3dfx-blip.github.io/telegram-miniapp-nearby/?v=57d39fb';
export const QIPS_MUTUAL_GREETING = 'Մենք երկուսս էլ ավելի Քիփ դառնալու ցանկությոն ունենք եթե դեմ չես սկսենք շփվել';

const API_BASE = `https://api.telegram.org/bot${QIPS_BOT_TOKEN}`;
const FILE_BASE = `https://api.telegram.org/file/bot${QIPS_BOT_TOKEN}`;

// Cache of resolved real Telegram profiles (key -> { name, username, avatarUrl, telegramId })
const profileCache = new Map();

// Normalize phone number and check if it starts with Armenian +374 code
export function normalizePhoneNumber(rawPhone = '') {
  if (!rawPhone) return '';
  const digitsAndPlus = String(rawPhone).trim().replace(/[\s\-().]/g, '');
  if (!digitsAndPlus) return '';
  if (digitsAndPlus.startsWith('+')) return digitsAndPlus;
  if (digitsAndPlus.startsWith('00')) return '+' + digitsAndPlus.slice(2);
  return '+' + digitsAndPlus;
}

export function isArmenianPhone(rawPhone = '') {
  const norm = normalizePhoneNumber(rawPhone);
  return norm.startsWith('+374') && norm.length >= 11;
}

// Automatically determine if the user's Telegram account is registered with an Armenian +374 number
// based on Telegram WebApp account data (initDataUnsafe.user, verified contact phone, language_code, name script, and AM timezone/region)
export function isArmenianTelegramAccount(myProfile = {}, currentCoords = null) {
  const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;

  // 1. Check explicit phone number from Telegram account if present
  const rawPhone =
    tgUser?.phone_number ||
    myProfile?.phone ||
    localStorage.getItem('qips_verified_phone') ||
    '';
  const normPhone = normalizePhoneNumber(rawPhone);
  if (normPhone.length >= 7) {
    return normPhone.startsWith('+374');
  }

  // 2. Check Telegram account data (language_code, Armenian script in Telegram name)
  if (tgUser) {
    const lang = (tgUser.language_code || '').toLowerCase();
    if (lang === 'hy' || lang.startsWith('hy-')) {
      return true;
    }
    const fullTgName = `${tgUser.first_name || ''} ${tgUser.last_name || ''}`;
    if (/[\u0530-\u058F]/.test(fullTgName)) {
      return true;
    }
  }

  // 3. Check timezone (Asia/Yerevan) or Armenian Geo-IP coordinates (+374 region)
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (tz === 'Asia/Yerevan') {
      return true;
    }
  } catch (e) {}

  if (currentCoords && typeof currentCoords.lat === 'number' && typeof currentCoords.lng === 'number') {
    if (
      currentCoords.lat >= 38.8 && currentCoords.lat <= 41.3 &&
      currentCoords.lng >= 43.4 && currentCoords.lng <= 46.7
    ) {
      return true;
    }
  }

  if (myProfile?.name && /[\u0530-\u058F]/.test(myProfile.name)) {
    return true;
  }

  return false;
}

export function getGhostStarsPrice(myProfileOrPhone = {}, currentCoords = null) {
  if (typeof myProfileOrPhone === 'string') {
    if (myProfileOrPhone.trim()) {
      return isArmenianPhone(myProfileOrPhone) ? 50 : 500;
    }
    return isArmenianTelegramAccount({}, currentCoords) ? 50 : 500;
  }
  return isArmenianTelegramAccount(myProfileOrPhone, currentCoords) ? 50 : 500;
}

export async function callBotApi(method, payload = {}) {
  try {
    const res = await fetch(`${API_BASE}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  } catch (err) {
    console.warn(`QipsBot API (${method}) error:`, err);
    return { ok: false, description: err.message };
  }
}

// Return real Telegram public avatar URL for a @username or existing real photo URL
export function getRealTelegramAvatarUrl({ avatarUrl = '', username = '' } = {}) {
  if (avatarUrl && /^https?:\/\//i.test(avatarUrl)) {
    return avatarUrl;
  }
  const cleanUsername = String(username || '').replace(/^@/, '').trim();
  if (cleanUsername && cleanUsername !== 'user' && cleanUsername !== 'user_nearby') {
    return `https://t.me/i/userpic/320/${encodeURIComponent(cleanUsername)}.jpg`;
  }
  return null;
}

// Resolve real Telegram name and profile photo from @QipsBot API (getChat + getUserProfilePhotos)
export async function resolveRealTelegramProfile({ telegramId = null, username = '', name = '', avatarUrl = '' } = {}) {
  const cleanUsername = String(username || '').replace(/^@/, '').trim();
  const cacheKey = telegramId ? `id_${telegramId}` : (cleanUsername ? `u_${cleanUsername.toLowerCase()}` : '');

  if (cacheKey && profileCache.has(cacheKey)) {
    return profileCache.get(cacheKey);
  }

  let resolvedName = name || '';
  let resolvedUsername = cleanUsername;
  let resolvedAvatar = getRealTelegramAvatarUrl({ avatarUrl, username: cleanUsername });
  let resolvedId = telegramId || null;

  // 1. Query getChat via @QipsBot if telegramId or @username is available
  const chatTarget = resolvedId || (resolvedUsername ? `@${resolvedUsername}` : null);
  if (chatTarget) {
    const chatRes = await callBotApi('getChat', { chat_id: chatTarget });
    if (chatRes && chatRes.ok && chatRes.result) {
      const chat = chatRes.result;
      const fullName = [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.title || '';
      if (fullName) resolvedName = fullName;
      if (chat.username) resolvedUsername = chat.username;
      if (chat.id && !resolvedId) resolvedId = chat.id;

      // If chat has a photo object with big_file_id, resolve file path
      if (chat.photo && chat.photo.big_file_id) {
        const fileRes = await callBotApi('getFile', { file_id: chat.photo.big_file_id });
        if (fileRes && fileRes.ok && fileRes.result?.file_path) {
          resolvedAvatar = `${FILE_BASE}/${fileRes.result.file_path}`;
        }
      }
    }
  }

  // 2. If user_id is known and we still need high-res profile photo, call getUserProfilePhotos
  if (resolvedId && (!resolvedAvatar || resolvedAvatar.includes('t.me/i/userpic/'))) {
    const photosRes = await callBotApi('getUserProfilePhotos', {
      user_id: resolvedId,
      limit: 1
    });
    if (photosRes && photosRes.ok && photosRes.result?.total_count > 0) {
      const sizes = photosRes.result.photos[0];
      const bestPhoto = sizes[sizes.length - 1];
      if (bestPhoto?.file_id) {
        const fileRes = await callBotApi('getFile', { file_id: bestPhoto.file_id });
        if (fileRes && fileRes.ok && fileRes.result?.file_path) {
          resolvedAvatar = `${FILE_BASE}/${fileRes.result.file_path}`;
        }
      }
    }
  }

  // 3. Ensure fallback to Telegram's live username userpic endpoint if username is known
  if (!resolvedAvatar && resolvedUsername) {
    resolvedAvatar = `https://t.me/i/userpic/320/${encodeURIComponent(resolvedUsername)}.jpg`;
  }

  const result = {
    telegramId: resolvedId,
    name: resolvedName || (resolvedUsername ? `@${resolvedUsername}` : 'Telegram User'),
    username: resolvedUsername,
    avatarUrl: resolvedAvatar
  };

  if (cacheKey) {
    profileCache.set(cacheKey, result);
  }
  return result;
}

// Configure @QipsBot menu button automatically
export async function syncQipsBotConfig() {
  try {
    await callBotApi('setChatMenuButton', {
      menu_button: {
        type: 'web_app',
        text: 'Քիփս (Qips)',
        web_app: { url: QIPS_WEBAPP_URL }
      }
    });
  } catch (e) {}
}

// Create a REAL Telegram Stars (XTR) monthly subscription invoice link via @QipsBot
export async function createGhostStarsInvoice({ isArmenian = null, myProfile = {}, currentCoords = null, userId = 'user' }) {
  const armAccount = typeof isArmenian === 'boolean'
    ? isArmenian
    : isArmenianTelegramAccount(myProfile, currentCoords);
  const starsAmount = armAccount ? 50 : 500;

  const title = 'Ghost Mode (Թաքնված ռեժիմ) — Քիփս';
  const description = armAccount
    ? 'Ամսական բաժանորդագրություն (+374 հայկական հաշիվ՝ 50 ⭐️ / ամիս)՝ ռադարում անտեսանելի լինելու համար'
    : 'Ամսական բաժանորդագրություն (Միջազգային սակագին՝ 500 ⭐️ / ամիս)՝ ռադարում անտեսանելի լինելու համար';

  const payloadStr = `qips_ghost_${starsAmount}_${userId}_${Date.now()}`;

  // 1. Try creating monthly subscription invoice (30 days = 2592000s) in Telegram Stars (XTR)
  let response = await callBotApi('createInvoiceLink', {
    title,
    description,
    payload: payloadStr,
    provider_token: '', // Must be empty for Telegram Stars (XTR)
    currency: 'XTR',
    subscription_period: 2592000,
    prices: [
      {
        label: 'Ghost Mode (1 ամիս)',
        amount: starsAmount
      }
    ]
  });

  // 2. Fallback to standard one-month XTR invoice if subscription_period is restricted on client version
  if (!response || !response.ok || !response.result) {
    response = await callBotApi('createInvoiceLink', {
      title,
      description,
      payload: payloadStr,
      provider_token: '',
      currency: 'XTR',
      prices: [
        {
          label: 'Ghost Mode (1 ամիս)',
          amount: starsAmount
        }
      ]
    });
  }

  if (response && response.ok && response.result) {
    return {
      ok: true,
      invoiceUrl: response.result,
      starsAmount,
      isArmenian: armAccount,
      payload: payloadStr
    };
  }

  return {
    ok: false,
    error: response?.description || 'Չհաջողվեց ստեղծել Telegram Stars վճարման հղումը'
  };
}

// Request user's verified phone number via Telegram WebApp native requestContact API
export function requestTelegramContactPhone() {
  return new Promise((resolve) => {
    const tg = window.Telegram?.WebApp;
    if (tg && typeof tg.requestContact === 'function' && tg.initData) {
      try {
        tg.requestContact((shared, response) => {
          if (shared) {
            const phone =
              response?.responseUnsafe?.contact?.phone_number ||
              response?.contact?.phone_number ||
              '';
            if (phone) {
              resolve({ ok: true, phone: normalizePhoneNumber(phone), source: 'telegram_webapp' });
              return;
            }
          }
          resolve({ ok: false, reason: 'declined_or_unavailable' });
        });
        return;
      } catch (e) {
        console.warn('requestContact error:', e);
      }
    }
    resolve({ ok: false, reason: 'unsupported' });
  });
}

// Send an ANONYMOUS invitation via @QipsBot to a Telegram contact
// Stays 100% anonymous: sender's name, username, and ID are never included.
export async function sendAnonymousInviteViaBot(contact) {
  const cleanUsername = (contact.username || '').replace(/^@/, '').trim();
  const chatTarget = contact.telegramId || contact.chatId || (cleanUsername ? `@${cleanUsername}` : null);

  const anonymousText =
    `*Անանուն հրավեր «Քիփս» (Qips) հավելվածում*\n\n` +
    `Ձեր տելեգրամյան կոնտակտներից մեկը անանուն հրավիրել է Ձեզ միանալ *Qips* հավելվածին՝ մտերմանալու և մոտակայքում շփվելու համար։\n\n` +
    `_Հրավերն ուղարկված է QipsBot-ի կողմից անանուն՝ ուղարկողի տվյալները բացարձակ գաղտնի են։_\n\n` +
    `Սեղմեք ներքևի կոճակը՝ հավելվածը բացելու համար 👇`;

  const replyMarkup = {
    inline_keyboard: [
      [
        {
          text: 'Միանալ Քիփս (Qips)-ին',
          url: QIPS_BOT_URL
        }
      ]
    ]
  };

  let directDelivered = false;
  if (chatTarget) {
    const res = await callBotApi('sendMessage', {
      chat_id: chatTarget,
      text: anonymousText,
      parse_mode: 'Markdown',
      reply_markup: replyMarkup
    });
    if (res && res.ok) {
      directDelivered = true;
    }
  }

  return {
    ok: true,
    directDelivered,
    botUrl: QIPS_BOT_URL
  };
}

// Send mutual Qips match greeting to both users via @QipsBot and return direct Telegram profile URL
export async function notifyMutualQipsMatch(myProfile, partnerProfile) {
  const partnerUsername = (partnerProfile.username || '').replace(/^@/, '').trim();
  const myUsername = (myProfile.username || '').replace(/^@/, '').trim();

  const encodedGreeting = encodeURIComponent(QIPS_MUTUAL_GREETING);
  const directTelegramProfileUrl = partnerUsername
    ? `https://t.me/${partnerUsername}?text=${encodedGreeting}`
    : QIPS_BOT_URL;

  const botMatchMessageForMe =
    `*Շնորհավորում ենք՝ Քիփս Համընկնում (Mutual Qips)!*\n\n` +
    `Դուք և *${partnerProfile.name || partnerUsername}* (@${partnerUsername || 'user'}) սեղմել եք «ՔԻՓՍ» կոճակը միմյանց համար։\n\n` +
    `💬 Ողջույնի հաղորդագրություն՝\n` +
    `«_${QIPS_MUTUAL_GREETING}_»`;

  const botMatchMessageForPartner =
    `*Շնորհավորում ենք՝ Քիփս Համընկնում (Mutual Qips)!*\n\n` +
    `Դուք և *${myProfile.name || myUsername}* (@${myUsername || 'user'}) սեղմել եք «ՔԻՓՍ» կոճակը միմյանց համար։\n\n` +
    `💬 Ողջույնի հաղորդագրություն՝\n` +
    `«_${QIPS_MUTUAL_GREETING}_»`;

  if (myProfile.telegramId) {
    callBotApi('sendMessage', {
      chat_id: myProfile.telegramId,
      text: botMatchMessageForMe,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: `💬 Գրել ${partnerProfile.name || 'Պրոֆիլին'} Telegram-ում`,
              url: directTelegramProfileUrl
            }
          ]
        ]
      }
    });
  }

  if (partnerProfile.telegramId) {
    const partnerDirectUrl = myUsername
      ? `https://t.me/${myUsername}?text=${encodedGreeting}`
      : QIPS_BOT_URL;

    callBotApi('sendMessage', {
      chat_id: partnerProfile.telegramId,
      text: botMatchMessageForPartner,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: `💬 Գրել ${myProfile.name || 'Պրոֆիլին'} Telegram-ում`,
              url: partnerDirectUrl
            }
          ]
        ]
      }
    });
  }

  return {
    greetingText: QIPS_MUTUAL_GREETING,
    directTelegramProfileUrl
  };
}
