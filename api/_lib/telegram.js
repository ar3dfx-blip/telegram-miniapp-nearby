// Telegram Bot API Helper for Serverless Functions
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '9102883915:AAFF4nyDxRF0IxZdDxyqG6nUb9t6X4DBJeE';
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

export async function callTelegram(method, params = {}) {
  try {
    const res = await fetch(`${API_BASE}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    return await res.json();
  } catch (err) {
    console.error(`Telegram API error (${method}):`, err);
    return { ok: false, description: err.message };
  }
}

export async function createStarsInvoice({ title, description, payload, amount }) {
  return await callTelegram('createInvoiceLink', {
    title,
    description,
    payload,
    currency: 'XTR',
    prices: [
      {
        label: title,
        amount: Number(amount)
      }
    ]
  });
}

export async function sendTelegramMessage(chatId, text, extra = {}) {
  return await callTelegram('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown',
    ...extra
  });
}

export async function answerPreCheckout(preCheckoutQueryId, ok = true, errorMessage = '') {
  return await callTelegram('answerPreCheckoutQuery', {
    pre_checkout_query_id: preCheckoutQueryId,
    ok,
    error_message: errorMessage || undefined
  });
}

