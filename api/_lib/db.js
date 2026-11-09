// Cloud Data Persistence Layer for Qips Mini App on Vercel
// Uses @vercel/blob with fallback to fast in-memory store
import { put, list } from '@vercel/blob';

const BLOB_PATH = 'qips_cloud_db.json';
let memoryCache = {
  users: {
    'u:yerazamoyn_xr': {
      id: 'user_yerazamoyn',
      telegramId: null,
      username: 'Yerazamoyn_xr',
      name: 'YERAZAMOYN XR',
      avatarUrl: 'https://t.me/i/userpic/320/Yerazamoyn_xr.jpg',
      bio: 'Առցանց Քիփսում ✨',
      online: true,
      lastSeenAt: Date.now()
    }
  },
  ghostSubscriptions: {
    '37455161182': {
      active: true,
      starsPaid: 50,
      phone: '+37455161182',
      userId: 'tigran',
      activatedAt: Date.now(),
      expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000
    }
  },
  intents: {},
  matches: []
};
let isLoaded = false;
let saveDebounceTimer = null;

async function loadDataFromCloud() {
  if (isLoaded) return memoryCache;
  try {
    const { blobs } = await list({ prefix: BLOB_PATH });
    const targetBlob = blobs.find(b => b.pathname === BLOB_PATH);
    if (targetBlob) {
      const res = await fetch(targetBlob.url);
      if (res.ok) {
        const json = await res.json();
        memoryCache = {
          users: json.users || {},
          ghostSubscriptions: json.ghostSubscriptions || {},
          intents: json.intents || {},
          matches: Array.isArray(json.matches) ? json.matches : []
        };
        isLoaded = true;
        return memoryCache;
      }
    }
  } catch (err) {
    console.warn('Could not load from Blob, using in-memory store:', err.message);
  }
  isLoaded = true;
  return memoryCache;
}

async function persistDataToCloud() {
  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(async () => {
    try {
      await put(BLOB_PATH, JSON.stringify(memoryCache, null, 2), {
        access: 'public',
        addRandomSuffix: false
      });
    } catch (err) {
      console.warn('Could not persist to Blob:', err.message);
    }
  }, 100);
}

function canonicalKey(user) {
  if (!user) return '';
  const uname = (user.username || '').replace(/^@/, '').trim().toLowerCase();
  if (uname && uname !== 'user' && uname !== 'user_nearby') return `u:${uname}`;
  if (user.telegramId || user.tg_id) return `tg:${user.telegramId || user.tg_id}`;
  const phone = (user.phone || '').replace(/\D/g, '');
  if (phone) return `p:${phone}`;
  const name = (user.name || '').trim().toLowerCase();
  if (name && name !== 'telegram user') return `n:${name}`;
  return `id:${user.id || 'anon'}`;
}

export async function getAllUsers() {
  await loadDataFromCloud();
  return Object.values(memoryCache.users);
}

export async function saveUser(userData) {
  await loadDataFromCloud();
  const key = canonicalKey(userData);
  if (!key) return null;

  const existing = memoryCache.users[key] || {};
  const updated = {
    ...existing,
    ...userData,
    canonicalKey: key,
    lastSeenAt: Date.now(),
    online: true
  };

  memoryCache.users[key] = updated;
  persistDataToCloud();
  return updated;
}

export async function getGhostStatus(userId, phone) {
  await loadDataFromCloud();
  const rawPhone = (phone || '').replace(/\D/g, '');

  const sub =
    (userId && memoryCache.ghostSubscriptions[String(userId)]) ||
    (rawPhone && memoryCache.ghostSubscriptions[rawPhone]);

  if (!sub) return { active: false, daysLeft: 0, expiresAt: 0 };

  const now = Date.now();
  const active = Boolean(sub.active && sub.expiresAt > now);
  const daysLeft = active ? Math.max(1, Math.ceil((sub.expiresAt - now) / (1000 * 60 * 60 * 24))) : 0;

  return {
    active,
    daysLeft,
    expiresAt: sub.expiresAt,
    starsPaid: sub.starsPaid || 500
  };
}

export async function activateGhostSubscription(userId, phone, starsPaid) {
  await loadDataFromCloud();
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const subData = {
    active: true,
    starsPaid: Number(starsPaid) || 500,
    phone: phone || '',
    userId: String(userId || ''),
    activatedAt: Date.now(),
    expiresAt
  };

  if (userId) memoryCache.ghostSubscriptions[String(userId)] = subData;
  const rawPhone = (phone || '').replace(/\D/g, '');
  if (rawPhone) memoryCache.ghostSubscriptions[rawPhone] = subData;

  persistDataToCloud();
  return subData;
}

export async function recordSecretIntent(fromUser, toUser) {
  await loadDataFromCloud();
  const fromKey = canonicalKey(fromUser);
  const toKey = canonicalKey(toUser);
  if (!fromKey || !toKey) return { mutual: false };

  memoryCache.intents[`${fromKey}->${toKey}`] = {
    fromKey,
    toKey,
    fromUser,
    toUser,
    timestamp: Date.now()
  };

  const reverseIntent = memoryCache.intents[`${toKey}->${fromKey}`];
  const isMutual = Boolean(reverseIntent);

  if (isMutual) {
    const matchId = [fromKey, toKey].sort().join('<->');
    if (!memoryCache.matches.includes(matchId)) {
      memoryCache.matches.push(matchId);
    }
  }

  persistDataToCloud();
  return {
    mutual: isMutual,
    fromKey,
    toKey
  };
}

export async function checkMutualMatch(user1, user2) {
  await loadDataFromCloud();
  const k1 = canonicalKey(user1);
  const k2 = canonicalKey(user2);
  const matchId = [k1, k2].sort().join('<->');
  return memoryCache.matches.includes(matchId);
}
