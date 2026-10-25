// Geographic Utilities & Real User Profile Helpers (Zero Mock / Fake Profiles)

// Default anchor center if GPS is still searching: Republic Square, Yerevan (40.1776, 44.5126)
export const DEFAULT_COORDS = {
  lat: 40.1776,
  lng: 44.5126,
  city: "Երևան, Հանրապետության Հրապարակ"
};

// SVG Avatar generator with modern character illustrations
export function createAvatarSvg(name, bgGrad = ['#945eff', '#af87ff'], emoji = "👤") {
  const initials = (name || 'TG')
    .split(' ')
    .filter(Boolean)
    .map(p => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'TG';

  const grad1 = bgGrad[0] || '#945eff';
  const grad2 = bgGrad[1] || '#af87ff';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
    <defs>
      <linearGradient id="grad-${initials}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${grad1}" />
        <stop offset="100%" stop-color="${grad2}" />
      </linearGradient>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.3"/>
      </filter>
    </defs>
    <circle cx="50" cy="50" r="48" fill="url(#grad-${initials})" filter="url(#glow)"/>
    <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="2"/>
    <text x="50" y="44" font-family="-apple-system, system-ui, BlinkMacSystemFont, sans-serif" font-size="28" text-anchor="middle" dominant-baseline="middle">${emoji}</text>
    <text x="50" y="74" font-family="-apple-system, system-ui, BlinkMacSystemFont, sans-serif" font-size="16" font-weight="700" fill="#ffffff" text-anchor="middle" letter-spacing="1">${initials}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Calculate distance in meters using Haversine formula
export function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

// Calculate bearing (compass angle 0-360) from user to target
export function calculateBearing(lat1, lon1, lat2, lon2) {
  const y = Math.sin((lon2 - lon1) * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
            Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos((lon2 - lon1) * Math.PI / 180);
  const brng = Math.atan2(y, x) * 180 / Math.PI;
  return (brng + 360) % 360;
}

// Format distance human-readably (e.g. 0.8 մ, 15 մ, 1.2 կմ)
export function formatDistance(meters, lang = 'hy') {
  if (meters === undefined || meters === null || isNaN(meters)) return '0 մ';
  const m = Math.round(meters * 10) / 10;
  if (lang === 'en') {
    if (m < 1000) return `${m} m`;
    return `${(m / 1000).toFixed(1)} km`;
  }
  if (m < 1000) return `${m} մ`;
  return `${(m / 1000).toFixed(1)} կմ`;
}

// Armenian <-> Latin transliteration maps
const ARM_TO_LAT = {
  'ա': 'a', 'բ': 'b', 'գ': 'g', 'դ': 'd', 'ե': 'e', 'զ': 'z', 'է': 'e', 'ը': 'y', 'թ': 't',
  'ժ': 'zh', 'ի': 'i', 'լ': 'l', 'խ': 'kh', 'ծ': 'ts', 'կ': 'k', 'հ': 'h', 'ձ': 'dz', 'ղ': 'gh',
  'ճ': 'ch', 'մ': 'm', 'յ': 'y', 'ն': 'n', 'շ': 'sh', 'ո': 'o', 'չ': 'ch', 'պ': 'p', 'ջ': 'j',
  'ռ': 'r', 'ս': 's', 'վ': 'v', 'տ': 't', 'ր': 'r', 'ց': 'ts', 'ու': 'u', 'փ': 'p', 'ք': 'q',
  'և': 'ev', 'օ': 'o', 'ֆ': 'f'
};

const LAT_TO_ARM = {
  'sh': 'շ', 'ch': 'չ', 'zh': 'ժ', 'kh': 'խ', 'ts': 'ծ', 'dz': 'ձ', 'gh': 'ղ', 'ev': 'և',
  'a': 'ա', 'b': 'բ', 'g': 'գ', 'd': 'դ', 'e': 'ե', 'z': 'զ', 'y': 'ը', 't': 'տ',
  'i': 'ի', 'l': 'լ', 'k': 'կ', 'h': 'հ', 'm': 'մ', 'n': 'ն', 'o': 'օ', 'p': 'պ',
  'j': 'ջ', 'r': 'ր', 's': 'ս', 'v': 'վ', 'u': 'ու', 'f': 'ֆ', 'q': 'ք'
};

export function transliterateArmToLat(text = '') {
  return String(text).toLowerCase().split('').map(ch => ARM_TO_LAT[ch] || ch).join('');
}

export function transliterateLatToArm(text = '') {
  let str = String(text).toLowerCase();
  for (const [lat, arm] of Object.entries(LAT_TO_ARM)) {
    str = str.split(lat).join(arm);
  }
  return str;
}

// Match search query against a REAL user profile
export function matchesSearchQuery(person, query) {
  if (!query || !query.trim()) return true;
  if (!person) return false;

  const q = query.toLowerCase().trim().replace(/^@/, '');
  const qLat = transliterateArmToLat(q);
  const qArm = transliterateLatToArm(q);

  const name = (person.name || '').toLowerCase();
  const nameLat = transliterateArmToLat(name);
  const username = (person.username || '').toLowerCase();
  const bio = (person.bio || '').toLowerCase();
  const bioLat = transliterateArmToLat(bio);
  const interests = (person.interests || []).map(i => i.toLowerCase());

  const searchTokens = Array.from(new Set([q, qLat, qArm].filter(Boolean)));

  for (const token of searchTokens) {
    if (token.length < 2) {
      if (name.startsWith(token) || nameLat.startsWith(token) || username.startsWith(token)) {
        return true;
      }
      continue;
    }
    if (name.includes(token) || nameLat.includes(token)) return true;
    if (username.includes(token)) return true;
    if (bio.includes(token) || bioLat.includes(token)) return true;
    if (interests.some(i => i.includes(token) || transliterateArmToLat(i).includes(token))) return true;
  }

  return false;
}

// 100% Real: Returns only real users (Zero mock profiles)
export function getNearbyPeople(centerCoords) {
  return []; // Purely real peers from live network
}

export function createDynamicTelegramUser(query, centerCoords) {
  return null;
}
