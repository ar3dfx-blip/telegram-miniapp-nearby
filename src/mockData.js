// Realistic Nearby People Dataset & Geographic Calculations (0.5m - 10m Ultra-Proximity)

// Default anchor center: Republic Square, Yerevan (40.1776, 44.5126)
export const DEFAULT_COORDS = {
  lat: 40.1776,
  lng: 44.5126,
  city: "Երևան, Հանրապետության Հրապարակ"
};

// SVG Avatar generator with stylish vibrant gradient backgrounds and modern character illustrations
export function createAvatarSvg(name, bgGrad, emoji = "👤") {
  const initials = name
    .split(' ')
    .map(p => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
    <defs>
      <linearGradient id="grad-${initials}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${bgGrad[0]}" />
        <stop offset="100%" stop-color="${bgGrad[1]}" />
      </linearGradient>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.3"/>
      </filter>
    </defs>
    <circle cx="50" cy="50" r="48" fill="url(#grad-${initials})" filter="url(#glow)"/>
    <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="2"/>
    <text x="50" y="44" font-family="-apple-system, system-ui, BlinkMacSystemFont, sans-serif" font-size="28" text-anchor="middle" dominant-baseline="middle">${emoji}</text>
    <text x="50" y="74" font-family="-apple-system, system-ui, BlinkMacSystemFont, sans-serif" font-size="16" font-weight="700" fill="#ffffff" text-anchor="middle" letter-spacing="1">${initials}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Initial mock people profiles situated within 0.5m to 12m of user
const rawNearbyPeople = [
  {
    id: "user-1",
    name: "Արամ Գասպարյան",
    username: "aram_dev",
    gender: "male",
    category: "tech",
    online: true,
    lastSeen: "Հենց հիմա",
    avatarGrad: ["#24a1de", "#0056b3"],
    emoji: "👨‍💻",
    bio: "Senior AI Engineer 💻 Կողքիդ կանգնած/նստած եմ: Ո՞վ է ազատ սուրճի ու tech զրույցի:",
    interests: ["Python", "Machine Learning", "Սուրճ", "Startup"],
    offsetLat: 0.0000051, // ~0.8 meters
    offsetLng: 0.0000067,
    statusEmoji: "⚡",
    telegramId: 1048291
  },
  {
    id: "user-2",
    name: "Անի Մանուկյան",
    username: "ani_design",
    gender: "female",
    category: "tech",
    online: true,
    lastSeen: "1 րոպե առաջ",
    avatarGrad: ["#ec4899", "#8b5cf6"],
    emoji: "👩‍🎨",
    bio: "Product & UI/UX Designer 🎨 Նույն սեղանի մոտ նոթբուքով: Սիրում եմ մաքուր դիզայն:",
    interests: ["UI/UX", "Figma", "Արվեստ", "Մոդելավորում"],
    offsetLat: -0.0000095, // ~1.5 meters
    offsetLng: 0.0000125,
    statusEmoji: "🎨",
    telegramId: 2849102
  },
  {
    id: "user-3",
    name: "Դավիթ Սարգսյան",
    username: "davit_tech",
    gender: "male",
    category: "tech",
    online: true,
    lastSeen: "Հենց հիմա",
    avatarGrad: ["#10b981", "#059669"],
    emoji: "🚀",
    bio: "Tech Founder & Angel 🦄 Հարևան սեղանից քննարկում ենք նոր AI նախագիծը:",
    interests: ["Web3", "Startups", "Ինվեստիցիաներ", "FinTech"],
    offsetLat: -0.0000165, // ~2.4 meters
    offsetLng: -0.0000182,
    statusEmoji: "💼",
    telegramId: 3948123
  },
  {
    id: "user-4",
    name: "Լիլիթ Հովհաննիսյան",
    username: "lilit_art",
    gender: "female",
    category: "social",
    online: false,
    lastSeen: "5 րոպե առաջ",
    avatarGrad: ["#f59e0b", "#d97706"],
    emoji: "📸",
    bio: "Լուսանկարիչ 📷 2-3 քայլ այն կողմ նկարում եմ Երևանի փողոցները:",
    interests: ["Լուսանկարչություն", "Instagram", "Ճամփորդություն", "Սուրճ"],
    offsetLat: 0.0000280, // ~3.6 meters
    offsetLng: 0.0000212,
    statusEmoji: "✨",
    telegramId: 4910394
  },
  {
    id: "user-5",
    name: "Գոռ Վարդանյան",
    username: "gor_fitness",
    gender: "male",
    category: "social",
    online: true,
    lastSeen: "Հենց հիմա",
    avatarGrad: ["#ef4444", "#dc2626"],
    emoji: "🏋️‍♂️",
    bio: "Fitness & Nutrition Coach 💪 Մարզական հետաքրքիր պլաններ, կանգնած եմ մոտակայքում:",
    interests: ["Ֆիթնես", "Սպորտ", "Վազք", "Healthy Food"],
    offsetLat: 0.0000160, // ~5.2 meters
    offsetLng: -0.0000575,
    statusEmoji: "🔥",
    telegramId: 5829103
  },
  {
    id: "user-6",
    name: "Մարիամ Բաղդասարյան",
    username: "mariam_music",
    gender: "female",
    category: "social",
    online: true,
    lastSeen: "Հենց հիմա",
    avatarGrad: ["#6366f1", "#4f46e5"],
    emoji: "🎵",
    bio: "Ջազ դաշնակահարուհի 🎹 Ականջակալներով երաժշտություն եմ լսում:",
    interests: ["Երաժշտություն", "Ջազ", "Կինո", "Գրքեր"],
    offsetLat: 0.0000101, // ~6.5 meters
    offsetLng: 0.0000754,
    statusEmoji: "🎧",
    telegramId: 6719204
  },
  {
    id: "user-7",
    name: "Տիգրան Ղազարյան",
    username: "tigran_crypto",
    gender: "male",
    category: "tech",
    online: false,
    lastSeen: "12 րոպե առաջ",
    avatarGrad: ["#8b5cf6", "#6d28d9"],
    emoji: "📈",
    bio: "DeFi Research & Data Analyst 📊 Հանդիպումներից ազատ ժամանակ սիրում եմ շախմատ խաղալ:",
    interests: ["Շախմատ", "Crypto", "Վերլուծություն", "Tech"],
    offsetLat: -0.0000678, // ~7.8 meters
    offsetLng: 0.0000238,
    statusEmoji: "🧠",
    telegramId: 7819024
  },
  {
    id: "user-8",
    name: "Էլեն Կարապետյան",
    username: "elen_coffee",
    gender: "female",
    category: "social",
    online: true,
    lastSeen: "Հենց հիմա",
    avatarGrad: ["#14b8a6", "#0d9488"],
    emoji: "☕",
    bio: "Specialty Coffee Roaster 🌿 Սուրճի բույրով լցված սրճարանում:",
    interests: ["Specialty Coffee", "Բարիստա", "Բույսեր", "Books"],
    offsetLat: -0.0000396, // ~8.8 meters
    offsetLng: -0.0000897,
    statusEmoji: "☕",
    telegramId: 8901243
  },
  {
    id: "user-9",
    name: "Արսեն Մկրտչյան",
    username: "arsen_3d",
    gender: "male",
    category: "tech",
    online: false,
    lastSeen: "25 րոպե առաջ",
    avatarGrad: ["#f97316", "#ea580c"],
    emoji: "🎮",
    bio: "3D Animator & Game Creator 🕹️ Ստեղծում եմ ինդի խաղեր:",
    interests: ["GameDev", "Blender", "3D Art", "Sci-Fi"],
    offsetLat: 0.0000748, // ~9.6 meters
    offsetLng: -0.0000565,
    statusEmoji: "👾",
    telegramId: 9012485
  },
  {
    id: "user-10",
    name: "Սոնա Պետրոսյան",
    username: "sona_travel",
    gender: "female",
    category: "social",
    online: true,
    lastSeen: "Հենց հիմա",
    avatarGrad: ["#06b6d4", "#0891b2"],
    emoji: "✈️",
    bio: "Travel Blogger & Թարգմանիչ 🌍 42 երկիր, պատրաստվում եմ նոր ճամփորդության:",
    interests: ["Ճանապարհորդություն", "Լեզուներ", "Hiking", "Yoga"],
    offsetLat: -0.0000363, // ~11.8 meters (outside 10m until slider is maxed)
    offsetLng: 0.0001306,
    statusEmoji: "🌸",
    telegramId: 1029384
  },
  {
    id: "user-11",
    name: "Կարեն Հովհաննիսյան",
    username: "karen_dev",
    gender: "male",
    category: "tech",
    online: true,
    lastSeen: "Հենց հիմա",
    avatarGrad: ["#3b82f6", "#1d4ed8"],
    emoji: "💻",
    bio: "Full Stack Engineer 👨‍💻 Node.js, React, WebSockets: Սիրում եմ օպտիմիզացնել արագագործությունը:",
    interests: ["React", "NodeJS", "JavaScript", "Tech"],
    offsetLat: 0.0001800, // ~28.5 meters
    offsetLng: 0.0002100,
    statusEmoji: "⚡",
    telegramId: 1102934
  },
  {
    id: "user-12",
    name: "Աննա Գրիգորյան",
    username: "anna_grig",
    gender: "female",
    category: "tech",
    online: true,
    lastSeen: "2 րոպե առաջ",
    avatarGrad: ["#ec4899", "#db2777"],
    emoji: "🎨",
    bio: "Lead UI/UX & Brand Designer ✨ Figma, 3D Mockups: Ուսումնասիրում եմ նոր ինտերֆեյսները:",
    interests: ["Figma", "UI/UX", "Branding", "Design"],
    offsetLat: -0.0005500, // ~85 meters
    offsetLng: 0.0007200,
    statusEmoji: "✨",
    telegramId: 1209341
  },
  {
    id: "user-13",
    name: "Հայկ Մարտիրոսյան",
    username: "hayk_photo",
    gender: "male",
    category: "social",
    online: true,
    lastSeen: "Հենց հիմա",
    avatarGrad: ["#eab308", "#ca8a04"],
    emoji: "📸",
    bio: "Visual Artist & Street Photographer 📷 Ֆոտոսեսիաներ Երևանի կենտրոնում:",
    interests: ["Photo", "Yerevan", "Art", "Travel"],
    offsetLat: 0.0016000, // ~240 meters
    offsetLng: -0.0019000,
    statusEmoji: "📸",
    telegramId: 1309485
  },
  {
    id: "user-14",
    name: "Ռուզաննա Կարապետյան",
    username: "ruzanna_music",
    gender: "female",
    category: "social",
    online: false,
    lastSeen: "14 րոպե առաջ",
    avatarGrad: ["#8b5cf6", "#7c3aed"],
    emoji: "🎹",
    bio: "Sound Designer & Դաշնակահարուհի 🎶 Սաունդթրեքեր և ambient երաժշտություն:",
    interests: ["Music", "Piano", "Audio", "Culture"],
    offsetLat: -0.0038000, // ~620 meters
    offsetLng: 0.0053000,
    statusEmoji: "🎵",
    telegramId: 1409586
  },
  {
    id: "user-15",
    name: "Տիգրան Ավետիսյան",
    username: "tigran_flutter",
    gender: "male",
    category: "tech",
    online: true,
    lastSeen: "Հենց հիմա",
    avatarGrad: ["#0284c7", "#0369a1"],
    emoji: "📱",
    bio: "Mobile Engineer 📲 Flutter, iOS & Android developer: Բջջային էկոհամակարգերի մասնագետ:",
    interests: ["Flutter", "Mobile", "iOS", "Dart"],
    offsetLat: 0.0080000, // ~1.2 km
    offsetLng: -0.0095000,
    statusEmoji: "🚀",
    telegramId: 1509687
  },
  {
    id: "user-16",
    name: "Մարիամ Սիմոնյան",
    username: "mariam_sim",
    gender: "female",
    category: "social",
    online: true,
    lastSeen: "Հենց հիմա",
    avatarGrad: ["#10b981", "#047857"],
    emoji: "📢",
    bio: "Digital Growth & Communications 📊 Թվային մարքեթինգ, SMM և PR արշավներ:",
    interests: ["Marketing", "SMM", "Business", "Books"],
    offsetLat: -0.0180000, // ~2.8 km
    offsetLng: -0.0230000,
    statusEmoji: "💼",
    telegramId: 1609788
  },
  {
    id: "user-17",
    name: "Գևորգ Խաչատրյան",
    username: "gevorg_kh",
    gender: "male",
    category: "tech",
    online: false,
    lastSeen: "35 րոպե առաջ",
    avatarGrad: ["#f97316", "#c2410c"],
    emoji: "💡",
    bio: "Startup Founder & Angel Investor 🚀 FinTech և B2B SaaS լուծումներ:",
    interests: ["Startup", "Invest", "FinTech", "Crypto"],
    offsetLat: 0.0300000, // ~4.5 km
    offsetLng: 0.0360000,
    statusEmoji: "💎",
    telegramId: 1709889
  },
  {
    id: "user-18",
    name: "Լիլիթ Բաղդասարյան",
    username: "lilit_art",
    gender: "female",
    category: "social",
    online: true,
    lastSeen: "Հենց հիմա",
    avatarGrad: ["#ec4899", "#a21caf"],
    emoji: "🎨",
    bio: "Concept Artist & 2D Illustrator 🖌️ Կերպարների դիզայն և անիմացիա:",
    interests: ["Illustration", "Art", "Animation", "Creativity"],
    offsetLat: -0.0480000, // ~7.1 km
    offsetLng: 0.0560000,
    statusEmoji: "✨",
    telegramId: 1809990
  },
  {
    id: "user-19",
    name: "Էլեն Դանիելյան",
    username: "elen_dan",
    gender: "female",
    category: "social",
    online: false,
    lastSeen: "1 ժամ առաջ",
    avatarGrad: ["#14b8a6", "#0f766e"],
    emoji: "🏛️",
    bio: "Architect & Urban Designer 🌿 Էկոլոգիական քաղաքաշինություն և ինտերիեր դիզայն:",
    interests: ["Architecture", "Urban", "Design", "Interior"],
    offsetLat: 0.0950000, // ~14.3 km
    offsetLng: -0.1150000,
    statusEmoji: "🌿",
    telegramId: 1910091
  },
  {
    id: "user-20",
    name: "Արտյոմ Պողոսյան",
    username: "artyom_cloud",
    gender: "male",
    category: "tech",
    online: true,
    lastSeen: "Հենց հիմա",
    avatarGrad: ["#6366f1", "#4338ca"],
    emoji: "☁️",
    bio: "DevOps & Cloud Architect ⚙️ Kubernetes, AWS, High-Load համակարգեր:",
    interests: ["Cloud", "DevOps", "AWS", "Security"],
    offsetLat: -0.1500000, // ~22.0 km
    offsetLng: 0.1700000,
    statusEmoji: "⚡",
    telegramId: 2010192
  },
  {
    id: "user-21",
    name: "Սուրեն Բաբայան",
    username: "suren_product",
    gender: "male",
    category: "tech",
    online: true,
    lastSeen: "Հենց հիմա",
    avatarGrad: ["#10b981", "#065f46"],
    emoji: "📊",
    bio: "Product Manager & Growth Strategist 📈 Տեխնոլոգիական պրոդուկտների աճ:",
    interests: ["Product", "Growth", "Agile", "Strategy"],
    offsetLat: 0.3100000, // ~45.0 km
    offsetLng: 0.3400000,
    statusEmoji: "🚀",
    telegramId: 2110293
  },
  {
    id: "user-22",
    name: "Գայանե Միրզոյան",
    username: "gayane_media",
    gender: "female",
    category: "social",
    online: false,
    lastSeen: "3 ժամ առաջ",
    avatarGrad: ["#f43f5e", "#be123c"],
    emoji: "✍️",
    bio: "Journalist & Media Producer 🎙️ Հոդվածներ, պոդկաստներ և վավերագրական պատմություններ:",
    interests: ["Podcast", "Media", "Journalism", "Books"],
    offsetLat: -0.5900000, // ~88.0 km
    offsetLng: -0.6800000,
    statusEmoji: "🎙️",
    telegramId: 2210394
  }
];

// Haversine formula to calculate accurate distance between 2 coordinates in meters
// With decimal precision for ultra-close distances (0.5m - 10m) and km support
export function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distance = R * c;
  return Math.round(distance * 10) / 10;
}

// Calculate bearing (angle 0-360 degrees) from source to destination
export function calculateBearing(lat1, lon1, lat2, lon2) {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const lambda1 = (lon1 * Math.PI) / 180;
  const lambda2 = (lon2 * Math.PI) / 180;

  const y = Math.sin(lambda2 - lambda1) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(lambda2 - lambda1);
  const theta = Math.atan2(y, x);
  return (theta * 180 / Math.PI + 360) % 360;
}

// Format distance nicely in Armenian / metric (e.g. 0.8 մ, 1.5 մ, 28.5 մ, 1.2 կմ, 22.0 կմ)
export function formatDistance(meters, lang = 'hy') {
  const unitM = lang === 'hy' ? 'մ' : lang === 'ru' ? 'м' : 'm';
  const unitKm = lang === 'hy' ? 'կմ' : lang === 'ru' ? 'км' : 'km';

  if (meters < 1000) {
    const formatted = Number.isInteger(meters) ? meters : meters.toFixed(1);
    return `${formatted} ${unitM}`;
  }
  const km = (meters / 1000).toFixed(1);
  return `${km} ${unitKm}`;
}

// Armenian <-> Latin transliteration mappings for smart bilingual searching
const armToLatMap = {
  'ա': 'a', 'բ': 'b', 'գ': 'g', 'դ': 'd', 'ե': 'e', 'զ': 'z', 'է': 'e', 'ը': 'y',
  'թ': 't', 'ժ': 'zh', 'ի': 'i', 'լ': 'l', 'խ': 'kh', 'ծ': 'ts', 'կ': 'k', 'հ': 'h',
  'ձ': 'dz', 'ղ': 'gh', 'ճ': 'ch', 'մ': 'm', 'յ': 'y', 'ն': 'n', 'շ': 'sh', 'ո': 'o',
  'չ': 'ch', 'պ': 'p', 'ջ': 'j', 'ռ': 'r', 'ս': 's', 'վ': 'v', 'տ': 't', 'ր': 'r',
  'ց': 'ts', 'ու': 'u', 'փ': 'p', 'ք': 'q', 'և': 'ev', 'օ': 'o', 'ֆ': 'f'
};

const latToArmMap = {
  'a': 'ա', 'b': 'բ', 'g': 'գ', 'd': 'դ', 'e': 'ե', 'z': 'զ', 'i': 'ի', 'l': 'լ',
  'k': 'կ', 'h': 'հ', 'm': 'մ', 'n': 'ն', 'o': 'ո', 'p': 'պ', 'j': 'ջ', 'r': 'ր',
  's': 'ս', 'v': 'վ', 't': 'տ', 'u': 'ու', 'f': 'ֆ', 'q': 'ք', 'y': 'յ'
};

export function transliterateArmToLat(text) {
  if (!text) return '';
  return text.toLowerCase().split('').map(c => armToLatMap[c] || c).join('');
}

export function transliterateLatToArm(text) {
  if (!text) return '';
  return text.toLowerCase().split('').map(c => latToArmMap[c] || c).join('');
}

// Matches a person with a search query regardless of distance and language (Armenian/Latin)
export function matchesSearchQuery(person, query) {
  if (!query) return true;
  const q = query.toLowerCase().trim().replace(/^@/, '');
  if (!q) return true;

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

// Dynamically creates a Telegram user profile for any searched name or @username
export function createDynamicTelegramUser(query, centerCoords = DEFAULT_COORDS) {
  const cleanQ = query.trim().replace(/^@/, '');
  
  // Clean readable title-cased name
  const formattedName = cleanQ
    .split(/[\s_.-]+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ') || query;

  // Clean ASCII-compatible username for Telegram t.me link
  const rawClean = cleanQ.toLowerCase();
  const asciiUsername = transliterateArmToLat(rawClean).replace(/[^a-z0-9_]/g, '');
  const username = asciiUsername || `user_${Math.abs(hashString(query)) % 10000}`;

  // Deterministic color palette and emoji
  const hash = Math.abs(hashString(query));
  const palettes = [
    ["#24a1de", "#0088cc"],
    ["#8b5cf6", "#6d28d9"],
    ["#ec4899", "#be185d"],
    ["#10b981", "#059669"],
    ["#f59e0b", "#d97706"],
    ["#06b6d4", "#0891b2"],
    ["#6366f1", "#4338ca"]
  ];
  const avatarGrad = palettes[hash % palettes.length];
  const emojis = ["👤", "✨", "🚀", "💡", "🎯", "⚡", "👋"];
  const emoji = emojis[hash % emojis.length];

  // Placed at a realistic distance (e.g. 150m - 3.5km)
  const angle = (hash % 360) * (Math.PI / 180);
  const dist = 120 + ((hash * 97) % 3500); // 120m to 3620m
  const offsetLat = (dist * Math.cos(angle)) / 111111;
  const offsetLng = (dist * Math.sin(angle)) / (111111 * Math.cos((centerCoords.lat * Math.PI) / 180));

  const lat = centerCoords.lat + offsetLat;
  const lng = centerCoords.lng + offsetLng;
  const distanceMeters = calculateDistance(centerCoords.lat, centerCoords.lng, lat, lng);
  const bearing = calculateBearing(centerCoords.lat, centerCoords.lng, lat, lng);
  const avatarUrl = createAvatarSvg(formattedName, avatarGrad, emoji);

  return {
    id: `dyn-tg-${hash}`,
    name: formattedName,
    username: username,
    gender: "unknown",
    category: "social",
    online: true,
    lastSeen: "Հենց հիմա (Telegram)",
    avatarGrad,
    emoji,
    bio: `Telegram-ի օգտատեր (@${username}) • Գտնվել է համընդհանուր որոնմամբ:`,
    interests: ["Telegram", "Nearby", "Chat", "Networking"],
    offsetLat,
    offsetLng,
    statusEmoji: "⚡",
    telegramId: 1000000 + (hash % 8999999),
    lat,
    lng,
    distanceMeters,
    bearing,
    avatarUrl
  };
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

// Generate active nearby list relative to current user coordinates
export function getNearbyPeople(centerCoords) {
  return rawNearbyPeople.map(person => {
    const lat = centerCoords.lat + person.offsetLat;
    const lng = centerCoords.lng + person.offsetLng;
    const distanceMeters = calculateDistance(centerCoords.lat, centerCoords.lng, lat, lng);
    const bearing = calculateBearing(centerCoords.lat, centerCoords.lng, lat, lng);
    const avatarUrl = createAvatarSvg(person.name, person.avatarGrad, person.emoji);

    return {
      ...person,
      lat,
      lng,
      distanceMeters,
      bearing,
      avatarUrl
    };
  }).sort((a, b) => a.distanceMeters - b.distanceMeters);
}

