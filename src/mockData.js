// Realistic Nearby People Dataset & Geographic Calculations (0.5m - 10m Ultra-Proximity)

// Default anchor center: Republic Square, Yerevan (40.1776, 44.5126)
export const DEFAULT_COORDS = {
  lat: 40.1776,
  lng: 44.5126,
  city: "Երևան, Հանրապետության Հրապարակ"
};

export const PRESET_LOCATIONS = [
  { id: 'square', name: 'Հանրապետության Հրապարակ', lat: 40.1776, lng: 44.5126 },
  { id: 'cascade', name: 'Կասկադ Համալիր', lat: 40.1912, lng: 44.5155 },
  { id: 'opera', name: 'Օպերա և Բալետի Թատրոն', lat: 40.1857, lng: 44.5152 },
  { id: 'northern', name: 'Հյուսիսային Պողոտա', lat: 40.1818, lng: 44.5144 }
];

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
  }
];

// Haversine formula to calculate accurate distance between 2 coordinates in meters
// With decimal precision for ultra-close distances (0.5m - 10m)
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

// Format distance nicely in Armenian / metric (e.g. 0.8 մ, 1.5 մ, 7.8 մ, 10 մ)
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
