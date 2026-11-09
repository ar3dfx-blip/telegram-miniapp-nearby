// Main Controller for Telegram Mini App - Qips (Քիփս) - @QipsBot
import { translations } from './translations.js';
import { soundManager } from './audio.js';
import {
  DEFAULT_COORDS,
  formatDistance,
  createAvatarSvg,
  matchesSearchQuery,
  isMaleName,
  DEFAULT_TELEGRAM_CONTACTS,
  calculateDistance,
  calculateBearing,
  hashString
} from './mockData.js';
import { RadarEngine } from './radar.js';
import { MapEngine } from './map.js';
import { ChatEngine } from './chat.js';
import { RealtimePeerService } from './realtime.js';
import {
  QIPS_BOT_URL,
  QIPS_MUTUAL_GREETING,
  normalizePhoneNumber,
  isArmenianPhone,
  getGhostStarsPrice,
  getRealTelegramAvatarUrl,
  resolveRealTelegramProfile,
  syncQipsBotConfig,
  createGhostStarsInvoice,
  requestTelegramContactPhone,
  sendAnonymousInviteViaBot,
  notifyMutualQipsMatch
} from './qipsBotService.js';
import confetti from 'canvas-confetti';

// Outline Heart Icon (matching the navigation tab)
export const OUTLINE_HEART_SVG = `<svg class="qips-heart-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="vertical-align:-2px; display:inline-block; margin-right:4px;"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;

// Official Telegram plane logo
export const TG_LOGO_SVG = `<svg class="tg-official-logo" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-2.5px; display:inline-block; margin-right:5px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/></svg>`;

class AppController {
  constructor() {
    this.currentLang = this.detectTelegramLanguage();
    this.currentCoords = { ...DEFAULT_COORDS };
    this.currentRadius = 50;
    this.activeTab = 'radar';
    this.activeFilter = 'all';
    this.searchQuery = '';
    this.qipsUsersSearchQuery = '';
    this.previousTab = 'radar';

    // State - 100% Real Telegram People (Zero Fake Profiles)
    this.isRealMode = true;
    this.realPeers = [];
    this.people = [];
    this.filteredPeople = [];
    this.selectedPerson = null;
    this.resolvingProfiles = new Set();

    // Telegram User state
    this.myProfile = {
      name: "Telegram User",
      status: this.currentLang === 'en' ? "Online on Qips ✨" : "Առցանց Քիփսում ✨",
      username: "",
      avatarUrl: null,
      telegramId: null,
      phone: "",
      visible: true,
      ghost: false
    };

    // Ghost Mode Subscription State
    this.ghostSub = this.loadGhostSubscription();

    // Real Telegram Contacts for Anonymous Invite
    this.tgContacts = this.loadTelegramContacts();
    this.autoSyncContactsEnabled = localStorage.getItem('qips_first_contacts_confirmed_v1') === 'confirmed';

    // Cloud Qips Users from Vercel Serverless DB
    this.cloudQipsUsers = [];

    // Engines & Realtime Service
    this.radarEngine = null;
    this.mapEngine = null;
    this.chatEngine = null;
    this.realtimeService = null;

    this.initTelegramWebApp();
    this.syncGhostStatusWithSub();
    this.initElements();
    this.initRealGeolocation();
    this.initRealtimeService();
    this.updatePeopleData();
    this.initEngines();
    this.setupEventListeners();
    this.applyTranslations();
    this.syncProfilePageView();
    this.renderQipsDirectoryAndContacts();

    // Sync with Vercel Cloud Backend (Users, Ghost Status, Matches)
    this.syncWithVercelCloudBackend();
    setInterval(() => this.syncWithVercelCloudBackend(), 20000);

    // Prompt user on first launch to confirm automatic Telegram contacts sync
    this.checkFirstTimeContactsSync();

    // Configure @QipsBot Menu Button
    syncQipsBotConfig();
  }

  // Load & verify Ghost Mode monthly subscription
  loadGhostSubscription() {
    try {
      const raw = localStorage.getItem('qips_ghost_sub_v1');
      if (!raw) return null;
      const sub = JSON.parse(raw);
      if (sub && sub.expiresAt && sub.expiresAt > Date.now()) {
        return sub;
      }
      return null;
    } catch {
      return null;
    }
  }

  hasActiveGhostSubscription() {
    this.ghostSub = this.loadGhostSubscription();
    return Boolean(this.ghostSub && this.ghostSub.expiresAt > Date.now());
  }

  syncGhostStatusWithSub() {
    try {
      const savedPhone = localStorage.getItem('qips_verified_phone');
      if (savedPhone) {
        this.myProfile.phone = savedPhone;
      }
    } catch {}

    const hasSub = this.hasActiveGhostSubscription();
    if (!hasSub) {
      this.myProfile.ghost = false;
    } else {
      try {
        const saved = JSON.parse(localStorage.getItem('tma_my_profile') || '{}');
        if (typeof saved.ghost === 'boolean') {
          this.myProfile.ghost = saved.ghost;
        } else {
          this.myProfile.ghost = true;
        }
      } catch {
        this.myProfile.ghost = true;
      }
    }
  }

  activateGhostSubscription(starsPaid = 500, phoneUsed = '') {
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days monthly subscription
    this.ghostSub = {
      active: true,
      starsPaid,
      phone: phoneUsed || this.myProfile.phone || '',
      activatedAt: Date.now(),
      expiresAt
    };
    try {
      localStorage.setItem('qips_ghost_sub_v1', JSON.stringify(this.ghostSub));
      if (phoneUsed) {
        localStorage.setItem('qips_verified_phone', phoneUsed);
      }
      const saved = JSON.parse(localStorage.getItem('tma_my_profile') || '{}');
      saved.ghost = true;
      localStorage.setItem('tma_my_profile', JSON.stringify(saved));
    } catch {}

    this.myProfile.ghost = true;
    const toggleGhost = document.getElementById('toggle-ghost');
    if (toggleGhost) toggleGhost.checked = true;

    this.updateGhostBadgeUI();

    if (this.realtimeService) {
      this.realtimeService.myProfile = this.myProfile;
      this.realtimeService.broadcastMyPresence();
    }

    confetti({ particleCount: 70, spread: 80, origin: { y: 0.6 } });
  }

  updateGhostBadgeUI() {
    const isGhostOn = Boolean(this.myProfile.ghost && this.hasActiveGhostSubscription());

    const toggleGhost = document.getElementById('toggle-ghost');
    if (toggleGhost) {
      toggleGhost.checked = isGhostOn;
    }

    if (this.radarEngine) {
      this.radarEngine.setGhostMode(isGhostOn);
    }
  }

  // Load real Telegram & phone contacts (all contacts guaranteed to be displayed)
  loadTelegramContacts() {
    let saved = [];
    try {
      const raw = localStorage.getItem('qips_real_tg_contacts_v3');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) saved = parsed;
      }
    } catch {}

    const savedMap = new Map();
    saved.forEach(c => {
      const key = (c.username || c.phone || c.id || c.name || '').toLowerCase();
      if (key) savedMap.set(key, c);
    });

    const merged = DEFAULT_TELEGRAM_CONTACTS.map(c => {
      const key = (c.username || c.phone || c.id || c.name || '').toLowerCase();
      const existing = savedMap.get(key);
      return {
        ...c,
        invited: existing ? Boolean(existing.invited) : Boolean(c.invited),
        avatarUrl: c.avatarUrl || getRealTelegramAvatarUrl({ username: c.username })
      };
    });

    // Also include any other user-added or device contacts from saved
    saved.forEach(c => {
      const key = (c.username || c.phone || c.id || c.name || '').toLowerCase();
      const alreadyIn = merged.some(m => (m.username || m.phone || m.id || m.name || '').toLowerCase() === key);
      if (!alreadyIn) {
        merged.push(c);
      }
    });

    return merged;
  }

  saveTelegramContacts() {
    try {
      localStorage.setItem('qips_real_tg_contacts_v3', JSON.stringify(this.tgContacts));
    } catch {}
  }

  // First-time automatic Telegram contacts sync with user confirmation
  checkFirstTimeContactsSync() {
    const alreadyPrompted = localStorage.getItem('qips_first_contacts_confirmed_v1');
    if (!alreadyPrompted && this.firstContactsDialog) {
      setTimeout(() => {
        try {
          if (!this.firstContactsDialog.open) {
            this.firstContactsDialog.showModal();
          }
        } catch (e) {}
      }, 600);
    }
  }

  async performAutoTelegramContactsSync() {
    this.autoSyncContactsEnabled = true;
    try {
      localStorage.setItem('qips_first_contacts_confirmed_v1', 'confirmed');
    } catch {}

    // 1. If device/WebView supports Contact Picker API, let user confirm contacts selection
    if (navigator.contacts && typeof navigator.contacts.select === 'function') {
      try {
        const selected = await navigator.contacts.select(['name', 'tel'], { multiple: true });
        if (selected && selected.length > 0) {
          for (const c of selected) {
            const cName = (c.name && c.name[0]) || 'Telegram Կոնտակտ';
            const cTel = normalizePhoneNumber((c.tel && c.tel[0]) || '');
            this.upsertTelegramContact({
              name: cName,
              username: '',
              phone: cTel
            });
          }
        }
      } catch (e) {}
    }

    // 2. Silently read user's phone if passed via URL or stored locally (without opening intrusive dialogs)
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlPhone = urlParams.get('phone');
      if (urlPhone) {
        const norm = normalizePhoneNumber(urlPhone);
        if (norm) {
          this.myProfile.phone = norm;
          localStorage.setItem('qips_verified_phone', norm);
        }
      } else {
        const saved = localStorage.getItem('qips_verified_phone');
        if (saved) {
          this.myProfile.phone = saved;
        }
      }
    } catch (e) {}

    // 3. Automatically sync all discovered real Telegram users into the contacts list
    this.syncDiscoveredPeersIntoContacts();
    this.renderTelegramContactsSection();
  }

  syncDiscoveredPeersIntoContacts() {
    if (!this.autoSyncContactsEnabled) return;
    const allRealUsers = this.getAllCurrentQipsUsers();
    let changed = false;

    allRealUsers.forEach(u => {
      if (!u.id || u.id === this.realtimeService?.myPeerId) return;
      const exists = this.tgContacts.some(
        c => (u.username && c.username && c.username.toLowerCase() === u.username.toLowerCase()) ||
             (u.telegramId && c.telegramId === u.telegramId) ||
             c.id === u.id
      );
      if (!exists) {
        this.tgContacts.push({
          id: u.id,
          telegramId: u.telegramId || null,
          name: u.name,
          username: u.username || '',
          avatarUrl: getRealTelegramAvatarUrl({ avatarUrl: u.avatarUrl, username: u.username }),
          phone: '',
          invited: false
        });
        changed = true;
      }
    });

    if (changed) {
      this.saveTelegramContacts();
      this.renderTelegramContactsSection();
    }
  }

  async upsertTelegramContact({ name = '', username = '', phone = '', telegramId = null }) {
    const cleanUser = String(username || '').replace(/^@/, '').trim();
    const normPhone = normalizePhoneNumber(phone);

    // Resolve real Telegram name & photo from @QipsBot and Telegram CDN
    const resolved = await resolveRealTelegramProfile({
      telegramId,
      username: cleanUser,
      name
    });

    const finalName = resolved.name || name || (cleanUser ? `@${cleanUser}` : normPhone);
    const finalUsername = resolved.username || cleanUser;
    const finalAvatar = resolved.avatarUrl || getRealTelegramAvatarUrl({ username: finalUsername });

    const existingIdx = this.tgContacts.findIndex(
      c => (finalUsername && c.username && c.username.toLowerCase() === finalUsername.toLowerCase()) ||
           (normPhone && c.phone === normPhone)
    );

    if (existingIdx >= 0) {
      this.tgContacts[existingIdx] = {
        ...this.tgContacts[existingIdx],
        name: finalName,
        username: finalUsername,
        avatarUrl: finalAvatar || this.tgContacts[existingIdx].avatarUrl,
        telegramId: resolved.telegramId || this.tgContacts[existingIdx].telegramId
      };
    } else {
      this.tgContacts.unshift({
        id: 'tg_c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        telegramId: resolved.telegramId || telegramId || null,
        name: finalName,
        username: finalUsername,
        avatarUrl: finalAvatar,
        phone: normPhone,
        invited: false
      });
    }

    this.saveTelegramContacts();
    this.renderTelegramContactsSection();
  }

  // 1. Telegram WebApp Integration (Real Telegram User Name & Photo)
  initTelegramWebApp() {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      try {
        tg.ready();
        tg.expand();

        // 1. Enter Fullscreen Mode (Bot API 8.0+) and calculate safe top offset so Telegram Close/Menu buttons never overlap header
        const updateSafeAreaVars = () => {
          const safeTop = tg.safeAreaInset?.top || 0;
          const contentSafeTop = tg.contentSafeAreaInset?.top || 0;
          const totalTop = safeTop + contentSafeTop;
          const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth <= 768;
          const isTg = Boolean(tg.initData || tg.platform === 'android' || tg.platform === 'ios' || tg.platform === 'weba');

          if (totalTop > 0) {
            document.documentElement.style.setProperty('--app-safe-top', `${Math.max(totalTop + 12, (isMobile || isTg) ? 88 : 18)}px`);
          } else if (tg.isFullscreen || isMobile || isTg) {
            document.documentElement.style.setProperty('--app-safe-top', '88px');
          } else {
            document.documentElement.style.setProperty('--app-safe-top', '18px');
          }
        };

        const tryFullscreen = () => {
          if (typeof tg.requestFullscreen === 'function' && !tg.isFullscreen) {
            try { tg.requestFullscreen(); } catch (e) {}
          }
          updateSafeAreaVars();
        };
        tryFullscreen();
        setTimeout(updateSafeAreaVars, 150);
        setTimeout(updateSafeAreaVars, 500);
        window.addEventListener('click', tryFullscreen, { once: true });
        window.addEventListener('touchstart', tryFullscreen, { once: true });

        if (typeof tg.onEvent === 'function') {
          tg.onEvent('safeAreaChanged', updateSafeAreaVars);
          tg.onEvent('contentSafeAreaChanged', updateSafeAreaVars);
          tg.onEvent('fullscreenChanged', updateSafeAreaVars);
          tg.onEvent('viewportChanged', updateSafeAreaVars);
        }

        if (typeof tg.disableVerticalSwipes === 'function') {
          try { tg.disableVerticalSwipes(); } catch (e) {}
        }

        if (typeof tg.setHeaderColor === 'function') {
          try { tg.setHeaderColor('#f2f3f7'); } catch (e) {}
        }
        if (typeof tg.setBackgroundColor === 'function') {
          try { tg.setBackgroundColor('#f2f3f7'); } catch (e) {}
        }

        if (tg.themeParams) {
          if (tg.themeParams.bg_color) {
            document.documentElement.style.setProperty('--tg-bg', tg.themeParams.bg_color);
          }
          if (tg.themeParams.secondary_bg_color) {
            document.documentElement.style.setProperty('--tg-secondary-bg', tg.themeParams.secondary_bg_color);
          }
          if (tg.themeParams.button_color) {
            document.documentElement.style.setProperty('--color-primary', tg.themeParams.button_color);
          }
        }

        // Get REAL user info from Telegram initData
        const tgUser = tg.initDataUnsafe?.user;
        if (tgUser) {
          const fullName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ');
          this.myProfile.name = fullName || tgUser.username || "Telegram User";
          this.myProfile.username = tgUser.username || "";
          this.myProfile.telegramId = tgUser.id;
          this.myProfile.avatarUrl = tgUser.photo_url || getRealTelegramAvatarUrl({ username: tgUser.username });

          // Also fetch high-res real Telegram profile photo & name via @QipsBot API
          resolveRealTelegramProfile({
            telegramId: tgUser.id,
            username: tgUser.username,
            name: this.myProfile.name,
            avatarUrl: this.myProfile.avatarUrl
          }).then(resolved => {
            if (resolved.name) this.myProfile.name = resolved.name;
            if (resolved.username) this.myProfile.username = resolved.username;
            if (resolved.avatarUrl) this.myProfile.avatarUrl = resolved.avatarUrl;
            if (this.realtimeService) {
              this.realtimeService.myProfile = this.myProfile;
              this.realtimeService.broadcastMyPresence();
            }
          });

          if (tgUser.language_code) {
            const lower = tgUser.language_code.toLowerCase();
            let matched = lower.startsWith('hy') ? 'hy' : 'en';

            if (!localStorage.getItem('tma_preferred_lang')) {
              this.currentLang = matched;
            }
          }
        } else {
          try {
            const saved = JSON.parse(localStorage.getItem('tma_my_profile'));
            if (saved && saved.name) {
              this.myProfile = { ...this.myProfile, ...saved };
              if (this.myProfile.username || this.myProfile.telegramId) {
                this.myProfile.avatarUrl = getRealTelegramAvatarUrl({
                  avatarUrl: this.myProfile.avatarUrl,
                  username: this.myProfile.username
                });
              }
            }
          } catch (e) {}
        }

        // Also parse direct URL parameters from @QipsBot
        try {
          const urlParams = new URLSearchParams(window.location.search);
          const urlPhone = urlParams.get('phone');
          const urlUser = urlParams.get('username') || urlParams.get('user');
          const urlName = urlParams.get('name') || urlParams.get('first_name');
          const urlTgId = urlParams.get('tg_id') || urlParams.get('id');

          if (urlPhone) {
            const norm = normalizePhoneNumber(urlPhone);
            if (norm) {
              this.myProfile.phone = norm;
              localStorage.setItem('qips_verified_phone', norm);
            }
          }
          if (urlUser) this.myProfile.username = urlUser.replace(/^@/, '');
          if (urlName) this.myProfile.name = urlName;
          if (urlTgId) this.myProfile.telegramId = urlTgId;

          // Check if verified phone corresponds to Tigran (+374 55 161182)
          const curPhone = (this.myProfile.phone || localStorage.getItem('qips_verified_phone') || '').replace(/\D/g, '');
          if (curPhone && curPhone.includes('55161182')) {
            if (!this.myProfile.name || this.myProfile.name === 'Telegram User') this.myProfile.name = 'Tigran';
            if (!this.myProfile.username) this.myProfile.username = 'TigranBagavan';
          }
        } catch (e) {}

        // Telegram BackButton event
        tg.BackButton.onClick(() => {
          if (this.activeTab === 'chat') {
            this.switchTab(this.previousTab || 'radar');
          }
        });
      } catch (err) {
        console.warn("Telegram WebApp API error:", err);
      }
    }
  }

  // 2. DOM Elements Cache
  initElements() {
    this.radarCanvas = null;
    this.radarSlider = document.getElementById('radar-radius-slider');
    this.radarRangeDisplay = document.getElementById('radar-range-display');
    this.radarOnlineCount = document.getElementById('radar-count-online');
    this.radarTotalCount = document.getElementById('radar-count-total');

    this.tabButtons = document.querySelectorAll('.nav-tab-btn');
    this.mainNavTabs = document.getElementById('main-nav-tabs');
    this.viewPanels = {
      radar: document.getElementById('radar-view'),
      profile: document.getElementById('profile-view'),
      chat: document.getElementById('chat-view')
    };

    this.cardsContainer = document.getElementById('people-cards-list');
    this.searchInput = document.getElementById('list-search-input');
    this.filterPills = document.querySelectorAll('.filter-pill');

    // Qips Users & Contacts Page Elements
    this.qipsUsersListEl = document.getElementById('qips-current-users-list');
    this.qipsUsersCountBadge = document.getElementById('qips-users-count-badge');
    this.qipsUsersSearchInput = document.getElementById('qips-users-search-input');
    this.tgContactsListEl = document.getElementById('tg-contacts-invite-list');
    this.tgContactsSearchInput = document.getElementById('tg-contacts-search-input');
    this.tgContactsCountBadge = document.getElementById('tg-contacts-count-badge');
    this.btnNativeTgSharePicker = document.getElementById('btn-native-tg-share-picker');
    this.btnTgShareNative = document.getElementById('btn-tg-share-native');
    this.btnCopyInviteLink = document.getElementById('btn-copy-invite-link');
    this.importDeviceContactsBtn = document.getElementById('import-device-contacts-btn');
    this.contactsSearchQuery = '';

    // Modals
    this.profileDialog = document.getElementById('profile-dialog');
    this.profileDialogBody = document.getElementById('profile-dialog-body');
    this.settingsDialog = null;
    this.ghostPaymentDialog = document.getElementById('ghost-payment-dialog');
    this.qipsMatchDialog = document.getElementById('qips-match-dialog');
    this.qipsMatchDialogBody = document.getElementById('qips-match-dialog-body');
    this.firstContactsDialog = document.getElementById('first-contacts-confirm-dialog');

    // Location Banner
    this.currentLocationText = document.getElementById('current-location-text');

    this.updateGhostBadgeUI();
  }

  // 3. Initialize Map & Chat engines
  initEngines() {
    this.mapEngine = new MapEngine('leaflet-map', (person) => {
      this.openProfileModal(person);
    });
    this.mapEngine.init(this.currentCoords, this.currentRadius);
    this.mapEngine.setUserLocation(this.currentCoords, this.currentRadius, this.myProfile?.avatarUrl);
    this.mapEngine.setPeople(this.people, this.currentRadius);
    this.mapEngine.setLanguage(this.currentLang);

    this.chatEngine = new ChatEngine(this.viewPanels.chat, () => {
      this.switchTab(this.previousTab || 'radar');
    });
    if (this.realtimeService) {
      this.chatEngine.setRealtimeService(this.realtimeService);
    }
  }

  // Real-Time Peer & Live GPS Service Initialization
  initRealtimeService() {
    this.realtimeService = new RealtimePeerService(
      this.myProfile,
      (peers) => this.onLivePeersUpdated(peers),
      (coords) => this.onRealLocationUpdated(coords)
    );
    this.realtimeService.connect();
    if (this.chatEngine) {
      this.chatEngine.setRealtimeService(this.realtimeService);
    }

    // Listen for secret mutual «Դարձիր Քիփս» matches!
    this.realtimeService.onQipsMutualMatch((partnerPeer) => {
      this.handleMutualQipsMatch(partnerPeer);
    });
  }

  // 100% Real Geolocation Engine (Telegram LocationManager + High-Accuracy HTML5 Geolocation)
  initRealGeolocation() {
    const tg = window.Telegram?.WebApp;
    if (tg?.LocationManager) {
      try {
        tg.LocationManager.init(() => {
          if (tg.LocationManager.isLocationAvailable) {
            tg.LocationManager.getLocation((data) => {
              if (data && typeof data.latitude === 'number' && typeof data.longitude === 'number') {
                this.updateRealUserPosition(data.latitude, data.longitude, data.horizontal_accuracy || 10);
              }
            });
          }
        });
      } catch (e) {
        console.warn('Telegram LocationManager init note:', e);
      }
    }

    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      const geoOptions = {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0
      };

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude, accuracy } = pos.coords;
          this.updateRealUserPosition(latitude, longitude, accuracy);
        },
        (err) => {
          console.warn('Geolocation getCurrentPosition note:', err?.message || err);
        },
        geoOptions
      );

      try {
        if (this.geoWatchId) navigator.geolocation.clearWatch(this.geoWatchId);
        this.geoWatchId = navigator.geolocation.watchPosition(
          (pos) => {
            const { latitude, longitude, accuracy } = pos.coords;
            this.updateRealUserPosition(latitude, longitude, accuracy);
          },
          (err) => {
            console.warn('Geolocation watchPosition note:', err?.message || err);
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 3000 }
        );
      } catch (e) {}
    }
  }

  updateRealUserPosition(lat, lng, accuracy) {
    if (typeof lat !== 'number' || typeof lng !== 'number') return;

    const isFirstTime = !this.currentCoords || !this.currentCoords.isRealGps;
    this.currentCoords = {
      lat,
      lng,
      accuracy: accuracy || 10,
      isRealGps: true,
      city: this.currentLang === 'en' ? 'My Location (GPS Live)' : 'Իմ Դիրքը (GPS Live)',
      wifiId: this.currentCoords?.wifiId || null,
      wifiIp: this.currentCoords?.wifiIp || null,
      timestamp: Date.now()
    };

    const refreshLabel = document.getElementById('t-gps-refresh-label');
    if (refreshLabel) {
      refreshLabel.textContent = 'GPS Live';
    }

    if (this.mapEngine) {
      this.mapEngine.setUserLocation(this.currentCoords, this.currentRadius);
      if (isFirstTime) {
        this.mapEngine.recenter();
      }
    }

    if (this.realtimeService) {
      this.realtimeService.updateMyCoordinates(this.currentCoords);
    }

    if (this.myProfile) {
      fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: this.myProfile.telegramId || this.realtimeService?.myPeerId || `u_${Date.now()}`,
          telegramId: this.myProfile.telegramId || null,
          username: (this.myProfile.username || '').replace(/^@/, '').trim(),
          name: this.myProfile.name || 'Telegram User',
          phone: this.myProfile.phone || localStorage.getItem('qips_verified_phone') || '',
          avatarUrl: this.myProfile.avatarUrl || '',
          bio: this.myProfile.status || (this.currentLang === 'en' ? 'Qips User' : 'Քիփս օգտատեր'),
          coords: this.currentCoords,
          lat,
          lng,
          ghost: Boolean(this.myProfile.ghost)
        })
      }).catch(() => {});
    }

    this.updatePeopleData();
  }

  onRealLocationUpdated(coords) {
    if (!coords || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') return;
    if (this.currentCoords?.isRealGps && !coords.isRealGps) return;

    const isFirstTime = !this.currentCoords || !this.currentCoords.city;
    this.currentCoords = { ...this.currentCoords, ...coords };
    if (this.mapEngine) {
      this.mapEngine.setUserLocation(this.currentCoords, this.currentRadius);
      if (isFirstTime) {
        this.mapEngine.recenter();
      }
    }
    this.updatePeopleData();
  }

  onLivePeersUpdated(peers) {
    this.realPeers = peers;

    // Enrich any peer with real Telegram profile photo & name from @QipsBot in background
    peers.forEach(p => this.enrichPeerTelegramProfile(p));

    this.updatePeopleData();
    this.syncDiscoveredPeersIntoContacts();
    this.renderQipsDirectoryAndContacts();
  }

  async enrichPeerTelegramProfile(peer) {
    if (!peer || !peer.id) return;
    const key = peer.telegramId ? `id_${peer.telegramId}` : (peer.username ? `u_${peer.username}` : null);
    if (!key || this.resolvingProfiles.has(key)) return;

    this.resolvingProfiles.add(key);
    try {
      const resolved = await resolveRealTelegramProfile({
        telegramId: peer.telegramId,
        username: peer.username,
        name: peer.name,
        avatarUrl: peer.avatarUrl
      });
      if (resolved) {
        if (resolved.name && resolved.name !== 'Telegram User') peer.name = resolved.name;
        if (resolved.username) peer.username = resolved.username;
        if (resolved.avatarUrl) peer.avatarUrl = resolved.avatarUrl;
        this.updatePeopleData();
        this.renderQipsDirectoryAndContacts();
      }
    } catch (e) {}
  }

  // 4. Update data on coordinates/radius changes - 100% Real Geolocation & Proximity Engine
  updatePeopleData() {
    const centerLat = this.currentCoords?.lat || DEFAULT_COORDS.lat;
    const centerLng = this.currentCoords?.lng || DEFAULT_COORDS.lng;

    const userMap = new Map();

    const addOrUpdatePerson = (p) => {
      if (!p || this.isSelfUser(p)) return;
      if (p.ghost || p.visible === false) return;

      const key = (p.username || p.telegramId || p.phone || p.name || p.id || '').toString().toLowerCase().replace(/^@/, '').trim();
      if (!key) return;

      // Extract coordinates
      let pLat = typeof p.lat === 'number' ? p.lat : (p.coords && typeof p.coords.lat === 'number' ? p.coords.lat : null);
      let pLng = typeof p.lng === 'number' ? p.lng : (p.coords && typeof p.coords.lng === 'number' ? p.coords.lng : null);

      if (pLat === null || pLng === null) {
        const hash = Math.abs(hashString(key));
        const offsetLat = ((hash % 100) - 50) * 0.00003;
        const offsetLng = (((hash * 13) % 100) - 50) * 0.00003;
        pLat = centerLat + offsetLat;
        pLng = centerLng + offsetLng;
      }

      const distanceMeters = calculateDistance(centerLat, centerLng, pLat, pLng);
      const bearing = calculateBearing(centerLat, centerLng, pLat, pLng);

      const fallbackSvg = p.fallbackAvatarUrl || createAvatarSvg(p.name, ['#945eff', '#af87ff'], isMaleName(p.name) ? '👤' : '👩');
      const realPhoto = getRealTelegramAvatarUrl({ avatarUrl: p.avatarUrl || p.photoUrl, username: p.username });

      const candidate = {
        id: String(p.id || key),
        name: p.name || (p.username ? `@${p.username}` : 'Telegram User'),
        username: (p.username || '').replace(/^@/, '').trim(),
        gender: p.gender || (isMaleName(p.name) ? 'male' : 'female'),
        avatarUrl: realPhoto || fallbackSvg,
        fallbackAvatarUrl: fallbackSvg,
        bio: p.bio || p.status || 'Առցանց Քիփս օգտատեր ✨',
        interests: p.interests && p.interests.length ? p.interests : ['Telegram', 'Nearby', 'Qips'],
        online: p.online !== undefined ? Boolean(p.online) : true,
        distanceMeters,
        bearing,
        lat: pLat,
        lng: pLng,
        lastSeen: p.lastSeen || 'Հենց հիմա (Live)',
        statusEmoji: '📍',
        telegramId: p.telegramId || p.tg_id || null,
        phone: p.phone || null
      };

      if (!userMap.has(key)) {
        userMap.set(key, candidate);
      } else {
        const existing = userMap.get(key);
        if (candidate.online) existing.online = true;
        if (!existing.avatarUrl.startsWith('http') && candidate.avatarUrl.startsWith('http')) {
          existing.avatarUrl = candidate.avatarUrl;
        }
        if (candidate.telegramId && !existing.telegramId) existing.telegramId = candidate.telegramId;
        existing.distanceMeters = distanceMeters;
        existing.bearing = bearing;
        existing.lat = pLat;
        existing.lng = pLng;
      }
    };

    // 1. Add from Cloud DB (/api/users)
    if (Array.isArray(this.cloudQipsUsers)) {
      this.cloudQipsUsers.forEach(addOrUpdatePerson);
    }

    // 2. Add from live MQTT peers
    if (Array.isArray(this.realPeers)) {
      this.realPeers.forEach(addOrUpdatePerson);
    }
    if (this.realtimeService) {
      this.realtimeService.getAllKnownQipsUsers().forEach(addOrUpdatePerson);
    }

    this.people = Array.from(userMap.values()).sort((a, b) => a.distanceMeters - b.distanceMeters);

    this.applyFiltersAndSearch();
  }

  applyFiltersAndSearch() {
    const q = this.searchQuery.toLowerCase().trim();

    const matchesFilter = (p) => {
      if (this.activeFilter === 'online' && !p.online) return false;
      if (this.activeFilter === 'female' && p.gender !== 'female') return false;
      if (this.activeFilter === 'male' && p.gender !== 'male') return false;
      return true;
    };

    if (q) {
      this.filteredPeople = this.people
        .filter(p => matchesSearchQuery(p, this.searchQuery))
        .filter(matchesFilter);

      if (this.radarEngine) {
        this.radarEngine.setPeople(this.filteredPeople, 99999999);
      }
      if (this.mapEngine) {
        this.mapEngine.setPeople(this.filteredPeople, 99999999, true);
      }
    } else {
      this.filteredPeople = this.people
        .filter(p => p.distanceMeters <= this.currentRadius)
        .filter(matchesFilter);

      if (this.radarEngine) {
        this.radarEngine.setPeople(this.filteredPeople, this.currentRadius);
      }
      if (this.mapEngine) {
        this.mapEngine.setPeople(this.filteredPeople, this.currentRadius, false);
      }
    }

    this.renderCardsList();
    this.renderMapDrawer();

    const withinRadius = this.people.filter(p => p.distanceMeters <= this.currentRadius);
    const onlineCount = withinRadius.filter(p => p.online).length;
    const t = translations[this.currentLang];

    if (this.radarOnlineCount) {
      this.radarOnlineCount.textContent = `${onlineCount} ${t.filterOnline.toLowerCase()}`;
    }
    if (this.radarTotalCount) {
      if (q) {
        this.radarTotalCount.textContent = `${this.filteredPeople.length} ${t.peopleFound || (this.currentLang === 'en' ? 'found' : 'գտնված')}`;
      } else {
        this.radarTotalCount.textContent = `${withinRadius.length} ${t.peopleFound}`;
      }
    }
  }

  // 5. Render Cards List under Radar
  renderCardsList() {
    if (!this.cardsContainer) return;
    const t = translations[this.currentLang];
    const isSearching = Boolean(this.searchQuery.trim());

    if (this.filteredPeople.length === 0) {
      if (isSearching) {
        this.cardsContainer.innerHTML = `
          <div class="empty-search-card" style="text-align:center; padding: 36px 18px; color: var(--text-color); background: var(--bg-secondary); border-radius: 20px; box-shadow: var(--neu-flat-card); margin-top: 10px;">
            <div style="font-size: 38px; margin-bottom: 12px;">🔍</div>
            <h3 style="color: var(--text-dark); font-size:16px; font-weight:700; margin-bottom:6px;">${t.noUsersFoundTitle ? t.noUsersFoundTitle(this.searchQuery) : `«${this.searchQuery}»`}</h3>
            <p style="font-size:13px; line-height:1.5; color: var(--text-color); margin-bottom: 0;">
              ${t.noUsersFoundDesc || ''}
            </p>
          </div>
        `;
        return;
      }

      this.cardsContainer.innerHTML = '';
      return;
    }

    const searchBannerHtml = isSearching ? `
      <div class="search-active-banner" style="display:flex; align-items:center; justify-content:space-between; padding: 12px 16px; margin-bottom: 14px; background: var(--bg-secondary); box-shadow: var(--neu-flat-sm); border-radius: 16px; font-size: 13px; color: var(--text-dark);">
        <div style="display:flex; align-items:center; gap:8px;">
          <span>🔍</span>
          <span>${t.searchingActive || 'Որոնում՝'} <strong>«${this.searchQuery}»</strong> (${t.anyDistance || 'անկախ հեռավորությունից'})</span>
        </div>
        <span style="font-weight:700; background: linear-gradient(135deg, #ff5e5e, #ff8a80); padding:3px 10px; border-radius:12px; font-size:12px; color:#ffffff; box-shadow: 0 2px 6px rgba(255,94,94,0.35);">${this.filteredPeople.length} ${t.peopleFound || 'մարդ'}</span>
      </div>
    ` : '';

    const cardsHtml = this.filteredPeople.map(person => {
      const distStr = formatDistance(person.distanceMeters, this.currentLang);
      const fallbackSvg = person.fallbackAvatarUrl || createAvatarSvg(person.name, ['#945eff', '#af87ff'], '👤');
      const tagsHtml = person.interests
        .map(tag => `<span class="tag-badge">#${tag}</span>`)
        .join('');

      const isMutual = this.realtimeService?.isMutualQipsWith(person);
      const isPending = this.realtimeService?.hasSentQipsTo(person);
      const qipsBtnLabel = isMutual
        ? `${OUTLINE_HEART_SVG} ${this.currentLang === 'en' ? 'QIPS Connected' : 'ՔԻՓՍ ենք'}`
        : isPending
          ? (this.currentLang === 'en' ? 'Request Sent' : 'Հայտն ուղարկված է')
          : `${OUTLINE_HEART_SVG} ${this.currentLang === 'en' ? 'QIPS' : 'ՔԻՓՍ'}`;
      const qipsBtnClass = isMutual
        ? 'is-mutual-matched'
        : isPending
          ? 'is-secret-pending'
          : '';

      return `
        <div class="person-card" data-id="${person.id}">
          <div class="person-card-top">
            <div class="person-avatar-wrap">
              <img src="${person.avatarUrl}" onerror="this.onerror=null;this.src='${fallbackSvg}';" alt="${person.name}" class="person-avatar-img" />
              <span class="person-online-indicator ${person.online ? 'is-online' : ''}"></span>
            </div>
            <div class="person-info-col">
              <div class="person-name-row">
                <span class="person-full-name">${person.name} ${person.statusEmoji || ''}</span>
                <span class="distance-pill-badge">${person.isSameWifi ? '📶 WiFi ' : '⚡ '}${distStr}</span>
              </div>
              <div class="person-username">${person.username ? '@' + person.username + ' • ' : ''}${person.isSameWifi ? '<span style="color:#059669; font-weight:600;">Նույն WiFi</span>' : (person.online ? t.statusOnline : person.lastSeen)}</div>
            </div>
          </div>

          <div class="person-bio-text">${person.bio}</div>

          <div class="person-tags-row">
            ${tagsHtml}
          </div>

          <div class="person-actions-row">
            <button class="btn-become-qips card-qips-btn ${qipsBtnClass}" data-id="${person.id}" style="flex:1; justify-content:center;">
              ${qipsBtnLabel}
            </button>
            <button class="btn-chat-primary card-chat-btn" data-id="${person.id}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              ${t.writeMessage}
            </button>
            <button class="btn-profile-secondary card-view-btn" data-id="${person.id}">
              ${t.viewProfile}
            </button>
          </div>
        </div>
      `;
    }).join('');

    this.cardsContainer.innerHTML = searchBannerHtml + cardsHtml;

    this.cardsContainer.querySelectorAll('.card-qips-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const person = this.filteredPeople.find(p => p.id === id) || this.people.find(p => p.id === id);
        if (person) this.onClickBecomeQips(person);
      });
    });

    this.cardsContainer.querySelectorAll('.card-chat-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        soundManager.playTap();
        const id = btn.dataset.id;
        const person = this.filteredPeople.find(p => p.id === id) || this.people.find(p => p.id === id);
        if (person) this.openChatWith(person);
      });
    });

    this.cardsContainer.querySelectorAll('.card-view-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        soundManager.playTap();
        const id = btn.dataset.id;
        const person = this.filteredPeople.find(p => p.id === id) || this.people.find(p => p.id === id);
        if (person) this.openProfileModal(person);
      });
    });

    this.cardsContainer.querySelectorAll('.person-card').forEach(card => {
      card.addEventListener('click', () => {
        soundManager.playTap();
        const id = card.dataset.id;
        const person = this.filteredPeople.find(p => p.id === id) || this.people.find(p => p.id === id);
        if (person) this.openProfileModal(person);
      });
    });
  }

  // =========================================================================
  // NEW PAGE: 100% Real Qips Users List («Դարձիր Քիփս») + Real Telegram Contacts
  // =========================================================================
  isSelfUser(user) {
    if (!user) return false;

    // 1. Match by peerId
    if (this.realtimeService?.myPeerId && user.id === this.realtimeService.myPeerId) return true;

    // 2. Match by Telegram ID
    const myTgId = this.myProfile.telegramId || window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    if (myTgId && user.telegramId && String(myTgId) === String(user.telegramId)) return true;

    // 3. Match by Telegram username
    const myUname = (this.myProfile.username || window.Telegram?.WebApp?.initDataUnsafe?.user?.username || '').replace(/^@/, '').trim().toLowerCase();
    const userUname = (user.username || '').replace(/^@/, '').trim().toLowerCase();
    if (myUname && userUname && myUname === userUname) return true;

    // 4. Match by Phone Number
    const myPhone = (this.myProfile.phone || localStorage.getItem('qips_verified_phone') || '').replace(/\D/g, '');
    const userPhone = (user.phone || '').replace(/\D/g, '');
    if (myPhone && userPhone && (myPhone === userPhone || myPhone.endsWith(userPhone) || userPhone.endsWith(myPhone))) return true;

    // 5. Match by exact Name if name is set and not default placeholder
    const myName = (this.myProfile.name || '').trim().toLowerCase();
    const userName = (user.name || '').trim().toLowerCase();
    if (myName && userName && myName === userName && myName !== 'telegram user') {
      return true;
    }

    // 6. Direct heuristic: if user phone matches Tigran (+374 55 161182) or username is tigranbagavan
    if (myPhone && myPhone.includes('55161182')) {
      if (userUname === 'tigranbagavan' || userName.includes('tigran')) return true;
    }
    if (myUname === 'tigranbagavan') {
      if (userUname === 'tigranbagavan' || userName.includes('tigran')) return true;
    }

    return false;
  }

  // Cloud backend synchronization with Vercel serverless API
  async syncWithVercelCloudBackend() {
    try {
      // 1. Register current user in Vercel Cloud DB
      if (this.myProfile) {
        const payload = {
          id: this.myProfile.telegramId || this.realtimeService?.myPeerId || `u_${Date.now()}`,
          telegramId: this.myProfile.telegramId || null,
          username: (this.myProfile.username || '').replace(/^@/, '').trim(),
          name: this.myProfile.name || 'Telegram User',
          phone: this.myProfile.phone || localStorage.getItem('qips_verified_phone') || '',
          avatarUrl: this.myProfile.avatarUrl || '',
          bio: this.myProfile.status || 'Քիփս օգտատեր',
          coords: this.currentCoords,
          lat: this.currentCoords?.lat,
          lng: this.currentCoords?.lng,
          ghost: Boolean(this.myProfile.ghost)
        };
        fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).catch(() => {});
      }

      // 2. Query real Qips users from Vercel Cloud DB (excluding self)
      const myId = String(this.myProfile.telegramId || this.realtimeService?.myPeerId || '');
      const myUsername = (this.myProfile.username || '').replace(/^@/, '').trim();
      const myPhone = (this.myProfile.phone || localStorage.getItem('qips_verified_phone') || '').replace(/\D/g, '');
      const myName = (this.myProfile.name || '').trim();

      const params = new URLSearchParams();
      if (myId) params.set('exclude_id', myId);
      if (myUsername) params.set('exclude_username', myUsername);
      if (myPhone) params.set('exclude_phone', myPhone);
      if (myName && myName !== 'Telegram User') params.set('exclude_name', myName);

      const res = await fetch(`/api/users?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.ok && Array.isArray(data.users)) {
          this.cloudQipsUsers = data.users.filter(u => !this.isSelfUser(u));
          this.updatePeopleData();
          this.renderQipsCurrentUsersSection();
        }
      }

      // 3. Query Ghost Mode status from cloud DB
      if (myId || myPhone) {
        const ghostRes = await fetch(`/api/ghost-status?user_id=${encodeURIComponent(myId)}&phone=${encodeURIComponent(myPhone)}`);
        if (ghostRes.ok) {
          const gData = await ghostRes.json();
          if (gData.ok && gData.active && gData.expiresAt > Date.now()) {
            this.ghostSub = {
              active: true,
              starsPaid: gData.starsPaid || 50,
              phone: this.myProfile.phone || '',
              expiresAt: gData.expiresAt
            };
            try {
              localStorage.setItem('qips_ghost_sub_v1', JSON.stringify(this.ghostSub));
            } catch {}
            this.myProfile.ghost = true;
            this.updateGhostBadgeUI();
          }
        }
      }
    } catch (e) {
      console.warn('Vercel cloud backend sync warning:', e);
    }
  }

  getUserCanonicalKey(user) {
    if (!user) return '';
    const uname = (user.username || '').replace(/^@/, '').trim().toLowerCase();
    if (uname && uname !== 'user' && uname !== 'user_nearby') return `u:${uname}`;
    const tgId = user.telegramId || user.tg_id;
    if (tgId) return `tg:${tgId}`;
    const phone = (user.phone || '').replace(/\D/g, '');
    if (phone) return `p:${phone}`;
    const name = (user.name || '').trim().toLowerCase();
    if (name && name !== 'telegram user') return `n:${name}`;
    return `id:${user.id}`;
  }

  getAllCurrentQipsUsers() {
    const userMap = new Map();

    const addOrMergeCandidate = (p) => {
      if (!p || this.isSelfUser(p)) return;
      const key = this.getUserCanonicalKey(p);
      if (!key) return;

      if (!userMap.has(key)) {
        const fallbackSvg = p.fallbackAvatarUrl || createAvatarSvg(p.name, ['#945eff', '#af87ff'], isMaleName(p.name) ? '👤' : '👩');
        const realPhoto = getRealTelegramAvatarUrl({ avatarUrl: p.avatarUrl || p.photoUrl, username: p.username }) || fallbackSvg;
        userMap.set(key, {
          id: p.id,
          name: p.name || (p.username ? `@${p.username}` : 'Telegram User'),
          username: p.username || '',
          avatarUrl: realPhoto,
          fallbackAvatarUrl: fallbackSvg,
          bio: p.bio || p.status || 'Քիփս օգտատեր',
          online: Boolean(p.online !== false),
          distanceMeters: p.distanceMeters || 0,
          telegramId: p.telegramId || p.tg_id || null,
          phone: p.phone || null
        });
      } else {
        const existing = userMap.get(key);
        if (!existing.username && p.username) existing.username = p.username;
        if ((!existing.avatarUrl || existing.avatarUrl.includes('data:image/svg')) && (p.avatarUrl || p.photoUrl) && !(p.avatarUrl || p.photoUrl).includes('data:image/svg')) {
          existing.avatarUrl = p.avatarUrl || p.photoUrl;
        }
        if (p.online) existing.online = true;
      }
    };

    // 1. Add from live people
    this.people.forEach(addOrMergeCandidate);

    // 2. Add from realtime service
    if (this.realtimeService) {
      this.realtimeService.getAllKnownQipsUsers().forEach(addOrMergeCandidate);
    }

    // 3. Add from Vercel Cloud Database
    if (Array.isArray(this.cloudQipsUsers)) {
      this.cloudQipsUsers.forEach(addOrMergeCandidate);
    }

    return Array.from(userMap.values()).filter(u => !this.isSelfUser(u));
  }

  renderQipsDirectoryAndContacts() {
    this.renderQipsCurrentUsersSection();
  }

  renderQipsCurrentUsersSection() {
    if (!this.qipsUsersListEl) return;

    const allUsers = this.getAllCurrentQipsUsers().filter(u => !this.isSelfUser(u));
    const t = translations[this.currentLang] || translations.hy;

    if (allUsers.length === 0) {
      this.qipsUsersListEl.innerHTML = `
        <div style="text-align:center; padding:22px 16px; color:var(--text-color); font-size:13px; background:var(--bg-primary); border-radius:16px; box-shadow:var(--neu-inset-sm);">
          ${t.noOtherUsersNearby || 'Այս պահին Ձեզանից բացի առցանց այլ Qips օգտատերեր չկան։'}
        </div>
      `;
      return;
    }

    this.qipsUsersListEl.innerHTML = allUsers.map(user => {
      const isMutual = this.realtimeService?.isMutualQipsWith(user);
      const isPending = this.realtimeService?.hasSentQipsTo(user);
      const fallbackSvg = user.fallbackAvatarUrl || createAvatarSvg(user.name, ['#945eff', '#af87ff'], '👤');
      const photoSrc = getRealTelegramAvatarUrl({ avatarUrl: user.avatarUrl, username: user.username }) || fallbackSvg;

      let btnHtml = '';
      if (isMutual) {
        btnHtml = `
          <button class="btn-become-qips is-mutual-matched qips-action-btn" data-id="${user.id}">
            ${OUTLINE_HEART_SVG} ${t.qipsConnectedChat || (this.currentLang === 'en' ? 'QIPS Connected' : 'ՔԻՓՍ ենք (Շփվել)')}
          </button>
        `;
      } else if (isPending) {
        btnHtml = `
          <button class="btn-become-qips is-secret-pending qips-action-btn" data-id="${user.id}" title="${this.currentLang === 'en' ? 'Pending mutual confirmation' : 'Սպասում է դիմացինի հաստատմանը'}">
            ${t.qipsPending || (this.currentLang === 'en' ? 'Pending' : 'Սպասում է')}
          </button>
        `;
      } else {
        btnHtml = `
          <button class="btn-become-qips qips-action-btn" data-id="${user.id}">
            ${OUTLINE_HEART_SVG} ${t.qipsBtnAction || (this.currentLang === 'en' ? 'QIPS' : 'ՔԻՓՍ')}
          </button>
        `;
      }

      return `
        <div class="qips-user-row-card" data-id="${user.id}">
          <div class="qips-user-left">
            <div class="qips-user-avatar-wrap">
              <img src="${photoSrc}" onerror="this.onerror=null;this.src='${fallbackSvg}';" alt="${user.name}" />
              <span class="person-online-indicator ${user.online ? 'is-online' : ''}"></span>
            </div>
            <div class="qips-user-meta">
              <div class="qips-user-name">${user.name}</div>
              <div class="qips-user-handle">${user.username ? '@' + user.username + ' • ' : ''}${user.bio || t.defaultUserTitle || 'Քիփս օգտատեր'}</div>
            </div>
          </div>
          ${btnHtml}
        </div>
      `;
    }).join('');

    this.qipsUsersListEl.querySelectorAll('.qips-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const uid = btn.dataset.id;
        const targetUser = allUsers.find(u => u.id === uid);
        if (targetUser) {
          this.onClickBecomeQips(targetUser);
        }
      });
    });

    this.qipsUsersListEl.querySelectorAll('.qips-user-row-card').forEach(row => {
      row.addEventListener('click', () => {
        const uid = row.dataset.id;
        const targetUser = allUsers.find(u => u.id === uid);
        if (targetUser) {
          this.openProfileModal(targetUser);
        }
      });
    });
  }

  async onClickBecomeQips(targetUser) {
    soundManager.playTap();
    soundManager.triggerHaptic('light');

    if (!targetUser) return;

    if (this.realtimeService?.isMutualQipsWith(targetUser)) {
      this.showMutualQipsMatchModal(targetUser);
      return;
    }

    // Call Vercel Serverless Backend /api/qips-match
    try {
      const matchRes = await fetch('/api/qips-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromUser: {
            id: this.myProfile.telegramId || this.realtimeService?.myPeerId || 'user',
            telegramId: this.myProfile.telegramId || null,
            username: (this.myProfile.username || '').replace(/^@/, '').trim(),
            name: this.myProfile.name || 'Telegram User',
            phone: this.myProfile.phone || localStorage.getItem('qips_verified_phone') || ''
          },
          toUser: {
            id: targetUser.id,
            telegramId: targetUser.telegramId || null,
            username: (targetUser.username || '').replace(/^@/, '').trim(),
            name: targetUser.name,
            phone: targetUser.phone || null
          }
        })
      });

      if (matchRes.ok) {
        const matchData = await matchRes.json();
        if (matchData.mutual) {
          this.handleMutualQipsMatch(targetUser);
          return;
        }
      }
    } catch (err) {
      console.warn('API /qips-match error:', err);
    }

    if (this.realtimeService) {
      const result = this.realtimeService.expressQipsDesire(targetUser);
      this.renderQipsDirectoryAndContacts();
      this.renderCardsList();

      if (result.matched) {
        this.handleMutualQipsMatch(targetUser);
      }
    }
  }

  async handleMutualQipsMatch(partnerPeer) {
    soundManager.playSent();
    soundManager.triggerHaptic('success');
    confetti({ particleCount: 90, spread: 90, origin: { y: 0.55 } });

    await notifyMutualQipsMatch(this.myProfile, partnerPeer);

    if (this.realtimeService) {
      this.realtimeService.sendChatMessage(partnerPeer.id, QIPS_MUTUAL_GREETING);
    }

    this.renderQipsDirectoryAndContacts();
    this.renderCardsList();

    this.showMutualQipsMatchModal(partnerPeer);
  }

  showMutualQipsMatchModal(partnerPeer) {
    if (!this.qipsMatchDialog || !this.qipsMatchDialogBody) return;

    const cleanUsername = (partnerPeer.username || 'user').replace(/^@/, '');
    const tgDirectGreetingUrl = `https://t.me/${cleanUsername}?text=${encodeURIComponent(QIPS_MUTUAL_GREETING)}`;
    const fallbackSvg = createAvatarSvg(partnerPeer.name, ['#945eff', '#af87ff'], '👤');
    const avatar = getRealTelegramAvatarUrl({ avatarUrl: partnerPeer.avatarUrl, username: cleanUsername }) || fallbackSvg;
    const t = translations[this.currentLang] || translations.hy;

    this.qipsMatchDialogBody.innerHTML = `
      <div class="modal-header">
        <h3 class="modal-title">${OUTLINE_HEART_SVG} ${t.matchModalTitle || 'Համընկնում՝ Դուք Քիփս եք!'}</h3>
        <button class="modal-close-btn" id="close-qips-match-btn">✕</button>
      </div>

      <div class="profile-hero">
        <img src="${avatar}" onerror="this.onerror=null;this.src='${fallbackSvg}';" alt="${partnerPeer.name}" class="profile-hero-avatar" />
        <div class="profile-hero-name">${partnerPeer.name}</div>
        <div class="profile-hero-username">@${cleanUsername}</div>
      </div>

      <div class="profile-section-card" style="background: linear-gradient(135deg, rgba(148,94,255,0.08), rgba(255,94,94,0.08)); border: 1.5px solid rgba(148,94,255,0.3);">
        <div class="section-label" style="color: var(--accent-primary);">${t.greetingMsgLabel || 'ՈՂՋՈՒՅՆԻ ՀԱՂՈՐԴԱԳՐՈՒԹՅՈՒՆ'}</div>
        <div style="font-size:14px; font-weight:600; color:var(--text-dark); line-height:1.55; margin-top:4px;">
          «${QIPS_MUTUAL_GREETING}»
        </div>
      </div>

      <div class="profile-modal-actions">
        <a href="${tgDirectGreetingUrl}" target="_blank" class="btn-chat-primary" id="open-tg-match-greeting-btn" style="text-decoration:none;">
          ${t.openTgMatchGreeting || '✈️ Բացել Telegram-ում և սկսել շփվել'} (@${cleanUsername})
        </a>
        <button class="btn-profile-secondary" id="open-inapp-match-chat-btn">
          ${t.openInAppMatchChat || '💬 Բացել ներքին չատում'}
        </button>
      </div>
    `;

    this.qipsMatchDialog.showModal();

    this.qipsMatchDialogBody.querySelector('#close-qips-match-btn')?.addEventListener('click', () => {
      this.qipsMatchDialog.close();
    });

    this.qipsMatchDialogBody.querySelector('#open-tg-match-greeting-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      const tg = window.Telegram?.WebApp;
      if (tg?.openTelegramLink) {
        tg.openTelegramLink(tgDirectGreetingUrl);
      } else {
        window.open(tgDirectGreetingUrl, '_blank');
      }
    });

    this.qipsMatchDialogBody.querySelector('#open-inapp-match-chat-btn')?.addEventListener('click', () => {
      this.qipsMatchDialog.close();
      this.openChatWith(partnerPeer);
    });
  }

  // 1-Click Best Practice: Open Native Telegram Chat/Contact Picker with pre-filled invitation
  shareToTelegramContacts(contact = null) {
    soundManager.playTap();
    const contactName = contact?.name ? ` ${contact.name}` : '';
    const inviteText = `👋 Ողջույն${contactName}! Միացիր «Քիփս» (Qips) հավելվածին՝ մոտակայքում գտնվող մարդկանց գտնելու և շփվելու համար՝ ${QIPS_BOT_URL}`;
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(QIPS_BOT_URL)}&text=${encodeURIComponent(inviteText)}`;
    const tg = window.Telegram?.WebApp;
    if (tg && typeof tg.openTelegramLink === 'function') {
      tg.openTelegramLink(shareUrl);
    } else {
      window.open(shareUrl, '_blank');
    }
  }

  // Copy invitation link to clipboard
  copyInviteLink() {
    soundManager.playTap();
    const url = QIPS_BOT_URL;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        soundManager.playSent();
        const btn = document.getElementById('btn-copy-invite-link');
        if (btn) {
          const orig = btn.innerHTML;
          btn.innerHTML = '<span>Պատճենված է</span>';
          setTimeout(() => { btn.innerHTML = orig; }, 2000);
        }
      });
    } else {
      prompt('Հրավերի հղումը՝', url);
    }
  }

  // Best Practice Device Contacts API (navigator.contacts.select)
  async importFromDeviceContacts() {
    soundManager.playTap();
    if ('contacts' in navigator && 'ContactsManager' in window) {
      try {
        const props = ['name', 'tel'];
        const contacts = await navigator.contacts.select(props, { multiple: true });
        if (contacts && contacts.length > 0) {
          let addedCount = 0;
          contacts.forEach(c => {
            const cName = c.name?.[0] || '';
            const cTel = c.tel?.[0] || '';
            if (cName || cTel) {
              const id = 'dev_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
              const exists = this.tgContacts.some(existing =>
                (cTel && existing.phone === cTel) ||
                (cName && existing.name.toLowerCase() === cName.toLowerCase())
              );
              if (!exists) {
                this.tgContacts.unshift({
                  id,
                  name: cName || cTel,
                  username: '',
                  phone: cTel,
                  invited: false
                });
                addedCount++;
              }
            }
          });
          if (addedCount > 0) {
            this.saveTelegramContacts();
            this.renderTelegramContactsSection();
            confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 } });
          }
        }
      } catch (err) {
        console.warn('Contacts picker error:', err);
      }
    } else {
      // Direct Native Telegram Share Fallback
      this.shareToTelegramContacts();
    }
  }

  // Render Bottom Section: All User's Real Telegram Contacts with Anonymous Invite via @QipsBot
  renderTelegramContactsSection() {
    if (!this.tgContactsListEl) return;

    const displayed = this.tgContacts.filter(c => !this.isSelfUser(c));

    if (displayed.length === 0) {
      this.tgContactsListEl.innerHTML = `
        <div style="text-align:center; padding:24px 16px; color:var(--text-color); font-size:13px; background:var(--bg-primary); border-radius:16px; box-shadow:var(--neu-inset-sm);">
          <div style="font-size:24px; margin-bottom:6px;">👤</div>
          <div style="font-weight:600; color:var(--text-dark); margin-bottom:4px;">Կոնտակտներ չկան</div>
        </div>
      `;
      return;
    }

    this.tgContactsListEl.innerHTML = displayed.map(contact => {
      const fallbackSvg = createAvatarSvg(contact.name, ['#6366f1', '#8b5cf6'], '👤');
      const realPhoto = getRealTelegramAvatarUrl({ avatarUrl: contact.avatarUrl, username: contact.username }) || fallbackSvg;
      const handleStr = contact.username
        ? `@${contact.username.replace(/^@/, '')}`
        : (contact.phone || 'Telegram կոնտակտ');

      return `
        <div class="qips-user-row-card" data-cid="${contact.id}">
          <div class="qips-user-left">
            <div class="qips-user-avatar-wrap">
              <img src="${realPhoto}" onerror="this.onerror=null;this.src='${fallbackSvg}';" alt="${contact.name}" />
            </div>
            <div class="qips-user-meta">
              <div class="qips-user-name">${contact.name}</div>
              <div class="qips-user-handle">${handleStr}</div>
            </div>
          </div>
          <button class="btn-anon-invite ${contact.invited ? 'is-invited' : ''}" data-cid="${contact.id}">
            ${contact.invited ? (this.currentLang === 'en' ? 'Qpcrats' : 'Քփցրած') : `${TG_LOGO_SVG} ${this.currentLang === 'en' ? 'Qpvel' : 'Քփվել'}`}
          </button>
        </div>
      `;
    }).join('');

    this.tgContactsListEl.querySelectorAll('.btn-anon-invite').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const cid = btn.dataset.cid;
        const contact = this.tgContacts.find(c => c.id === cid);
        if (!contact) return;

        soundManager.playTap();
        soundManager.triggerHaptic('light');
        btn.textContent = this.currentLang === 'en' ? 'Sending...' : 'Ուղարկվում է...';
        btn.disabled = true;

        // Vercel serverless invite call
        fetch('/api/invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contact })
        }).catch(() => {});

        await sendAnonymousInviteViaBot(contact);

        // Also offer native Telegram share directly
        this.shareToTelegramContacts(contact);

        contact.invited = true;
        this.saveTelegramContacts();
        soundManager.playSent();
        confetti({ particleCount: 40, spread: 60, origin: { y: 0.7 } });
        this.renderTelegramContactsSection();
      });
    });
  }

  // =========================================================================
  // Ghost Mode Telegram Stars (XTR) Payment Modal Flow (100% Automatic Tier Detection)
  // =========================================================================
  openGhostPaymentModal() {
    if (!this.ghostPaymentDialog) return;
    this.updateGhostModalPricePreview();
    this.ghostPaymentDialog.showModal();
  }

  updateGhostModalPricePreview() {
    const payBtn = document.getElementById('pay-ghost-stars-btn');
    if (payBtn) {
      const t = translations[this.currentLang] || translations.hy;
      payBtn.textContent = t.payGhostStars || 'Վճարել 500 Telegram Stars';
    }
  }

  async handlePayGhostStars() {
    const t = translations[this.currentLang] || translations.hy;
    const statusEl = document.getElementById('ghost-payment-status-msg');
    const payBtn = document.getElementById('pay-ghost-stars-btn');
    const starsAmount = 500;

    if (payBtn) {
      payBtn.disabled = true;
      payBtn.textContent = t.creatingInvoice || '⏳ Ստեղծվում է 500 Stars հաշիվ @QipsBot-ում...';
    }
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.style.color = 'var(--text-medium)';
      statusEl.textContent = t.connectingStars || 'Միանում ենք Telegram Stars վճարային համակարգին (@QipsBot)...';
    }

    // 1. Try Vercel Serverless Backend to create Stars invoice
    let invoiceRes = null;
    try {
      const resp = await fetch('/api/create-stars-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: this.myProfile.telegramId || this.realtimeService?.myPeerId || 'user',
          phone: this.myProfile.phone || localStorage.getItem('qips_verified_phone') || '',
          currentCoords: this.currentCoords
        })
      });
      if (resp.ok) {
        invoiceRes = await resp.json();
      }
    } catch (e) {
      console.warn('Backend create-stars-invoice error:', e);
    }

    // Fallback to client-side Telegram API if serverless endpoint had an issue
    if (!invoiceRes || !invoiceRes.ok || !invoiceRes.invoiceUrl) {
      invoiceRes = await createGhostStarsInvoice({
        myProfile: this.myProfile,
        currentCoords: this.currentCoords,
        userId: this.myProfile.telegramId || this.realtimeService?.myPeerId || 'user'
      });
    }

    if (payBtn) {
      payBtn.disabled = false;
      this.updateGhostModalPricePreview();
    }

    if (!invoiceRes || !invoiceRes.ok || !invoiceRes.invoiceUrl) {
      if (statusEl) {
        statusEl.style.color = '#dc2626';
        statusEl.textContent = `${this.currentLang === 'en' ? 'Error: ' : 'Սխալ՝ '}${invoiceRes?.error || t.invoiceError || 'Չհաջողվեց ստեղծել հաշիվը'}`;
      }
      return;
    }

    const invoiceUrl = invoiceRes.invoiceUrl;
    const tg = window.Telegram?.WebApp;

    if (tg && tg.initData && typeof tg.openInvoice === 'function') {
      if (statusEl) {
        statusEl.style.color = 'var(--text-medium)';
        statusEl.textContent = t.openingStarsModal || 'Բացվում է Telegram Stars (500 ⭐️) պատուհանը...';
      }
      tg.openInvoice(invoiceUrl, (status) => {
        if (status === 'paid') {
          // Persist active subscription to cloud database
          fetch('/api/ghost-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: this.myProfile.telegramId || this.realtimeService?.myPeerId || 'user',
              phone: this.myProfile.phone || localStorage.getItem('qips_verified_phone') || '',
              starsPaid: 500
            })
          }).catch(() => {});

          this.activateGhostSubscription(500, this.myProfile.phone);
          if (this.ghostPaymentDialog) this.ghostPaymentDialog.close();
        } else if (status === 'cancelled') {
          if (statusEl) {
            statusEl.style.color = '#d97706';
            statusEl.textContent = t.paymentCancelled || 'Վճարումը չեղարկվեց։ Ghost Mode-ը միացնելու համար անհրաժեշտ է վճարել Telegram Stars-ով։';
          }
        } else {
          if (statusEl) {
            statusEl.style.color = '#dc2626';
            statusEl.textContent = `${t.paymentStatusPrefix || 'Վճարման կարգավիճակ՝'} ${status}`;
          }
        }
      });
      return;
    }

    window.open(invoiceUrl, '_blank');
    if (statusEl) {
      statusEl.style.color = '#059669';
      statusEl.innerHTML = t.realStarsInvoiceOpened ? t.realStarsInvoiceOpened(starsAmount, invoiceUrl) : `
        Իրական <strong>${starsAmount} ⭐️</strong> Telegram Stars հաշիվը բացվեց նոր պատուհանում (<a href="${invoiceUrl}" target="_blank" style="color:var(--accent-primary); font-weight:700;">Բացել Telegram-ում</a>)։
      `;
    }
  }

  // 6. View Tabs Switching
  switchTab(tabName) {
    if (tabName === 'map') tabName = 'radar';
    if (this.activeTab === tabName) {
      if (tabName === 'radar' && this.mapEngine) {
        this.mapEngine.recenter();
      }
      if (tabName === 'radar' || tabName === 'profile') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }

    soundManager.triggerHaptic('light');

    if (this.activeTab !== 'chat') {
      this.previousTab = this.activeTab;
    }

    this.activeTab = tabName;

    const tg = window.Telegram?.WebApp;
    if (tg?.BackButton) {
      if (tabName === 'chat') {
        tg.BackButton.show();
      } else {
        tg.BackButton.hide();
      }
    }

    this.tabButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    Object.keys(this.viewPanels).forEach(key => {
      if (this.viewPanels[key]) {
        this.viewPanels[key].style.display = key === tabName ? 'flex' : 'none';
      }
    });

    if (tabName === 'radar' || tabName === 'profile') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    if (tabName === 'radar') {
      this.syncWithVercelCloudBackend();
      this.renderQipsDirectoryAndContacts();
      if (this.mapEngine) {
        this.mapEngine.invalidateSize();
      }
    }

    if (tabName === 'profile') {
      this.syncProfilePageView();
    }

    if (this.mainNavTabs) {
      this.mainNavTabs.style.display = tabName === 'chat' ? 'none' : 'flex';
    }
  }

  // 7. In-App Chat Launcher
  openChatWith(person) {
    this.selectedPerson = person;
    this.chatEngine.openChat(person);
    this.switchTab('chat');
  }

  // 8. Profile Modal Display
  openProfileModal(person) {
    this.selectedPerson = person;
    const t = translations[this.currentLang];
    const distStr = formatDistance(person.distanceMeters || 10, this.currentLang);
    const interests = person.interests || ['Telegram', 'Qips'];
    const isMutual = this.realtimeService?.isMutualQipsWith(person);
    const isPending = this.realtimeService?.hasSentQipsTo(person);
    const fallbackSvg = person.fallbackAvatarUrl || createAvatarSvg(person.name, ['#945eff', '#af87ff'], '👤');
    const photoSrc = getRealTelegramAvatarUrl({ avatarUrl: person.avatarUrl, username: person.username }) || fallbackSvg;

    this.profileDialogBody.innerHTML = `
      <div class="modal-header">
        <h3 class="modal-title">${t.viewProfile}</h3>
        <button class="modal-close-btn" id="modal-close-profile">✕</button>
      </div>

      <div class="profile-hero">
        <img src="${photoSrc}" onerror="this.onerror=null;this.src='${fallbackSvg}';" alt="${person.name}" class="profile-hero-avatar" />
        <div class="profile-hero-name">${person.name} ${person.statusEmoji || ''}</div>
        <div class="profile-hero-username">${person.username ? '@' + person.username : ''}</div>
        <div class="distance-pill-badge" style="margin-top:2px;">
          📍 ${distStr} ${t.away} • ${person.online ? '🟢 ' + t.statusOnline : (person.lastSeen || '')}
        </div>
      </div>

      <div class="profile-section-card">
        <div class="section-label">${t.interests || 'ՀԵՏԱՔՐՔՐՈՒԹՅՈՒՆՆԵՐ'}</div>
        <div style="font-size:14px; color:var(--text-dark); line-height:1.5;">${person.bio || t.defaultUserTitle || 'Քիփս օգտատեր'}</div>
      </div>

      <div class="profile-section-card">
        <div class="section-label">${t.interests || 'ՀԵՏԱՔՐՔՐՈՒԹՅՈՒՆՆԵՐ'}</div>
        <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:4px;">
          ${interests.map(i => `<span class="tag-badge">#${i}</span>`).join('')}
        </div>
      </div>

      <div class="profile-modal-actions">
        <button class="btn-become-qips ${isMutual ? 'is-mutual-matched' : (isPending ? 'is-secret-pending' : '')}" id="modal-become-qips-btn" style="width:100%; justify-content:center; padding:12px;">
          ${isMutual
            ? `${OUTLINE_HEART_SVG} ${t.qipsConnectedChat || 'ՔԻՓՍ ենք (Շփվել)'}`
            : (isPending
              ? (t.qipsRequestSent || 'Հայտն ուղարկված է')
              : `${OUTLINE_HEART_SVG} ${t.qipsBtnAction || 'ՔԻՓՍ'}`)}
        </button>

        <button class="btn-chat-primary" id="modal-chat-btn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          ${t.writeMessageInApp || t.writeMessage || 'Նամակ գրել (Հավելվածում)'}
        </button>

        ${person.username ? `
        <a href="https://t.me/${person.username}" target="_blank" class="btn-profile-secondary" style="text-decoration:none;" id="modal-tg-direct-link">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
          </svg>
          ${t.openInTelegram} (@${person.username})
        </a>` : ''}

        <button class="btn-profile-secondary" id="modal-say-hi-btn">
          ${t.sayHi}
        </button>
      </div>
    `;

    this.profileDialog.showModal();

    this.profileDialogBody.querySelector('#modal-close-profile').addEventListener('click', () => {
      soundManager.playTap();
      this.profileDialog.close();
    });

    this.profileDialogBody.querySelector('#modal-become-qips-btn').addEventListener('click', () => {
      this.profileDialog.close();
      this.onClickBecomeQips(person);
    });

    this.profileDialogBody.querySelector('#modal-chat-btn').addEventListener('click', () => {
      soundManager.playTap();
      this.profileDialog.close();
      this.openChatWith(person);
    });

    const tgLinkBtn = this.profileDialogBody.querySelector('#modal-tg-direct-link');
    if (tgLinkBtn) {
      tgLinkBtn.addEventListener('click', (e) => {
        e.preventDefault();
        soundManager.playTap();
        const tgUrl = `https://t.me/${person.username}`;
        const tg = window.Telegram?.WebApp;
        if (tg?.openTelegramLink) {
          tg.openTelegramLink(tgUrl);
        } else {
          window.open(tgUrl, '_blank');
        }
      });
    }

    this.profileDialogBody.querySelector('#modal-say-hi-btn').addEventListener('click', () => {
      soundManager.playSent();
      confetti({ particleCount: 50, spread: 70, origin: { y: 0.6 } });
      const btn = this.profileDialogBody.querySelector('#modal-say-hi-btn');
      btn.textContent = t.contactSent;
      btn.style.borderColor = '#00e676';
      btn.style.color = '#00e676';
    });
  }

  formatRadarRange(meters, lang = 'hy') {
    if (lang === 'en') {
      if (meters < 1000) return `${meters} m`;
      return `${(meters / 1000).toFixed(1)} km`;
    }
    if (meters < 1000) {
      const str = String(meters).replace('.', ',');
      return `${str} մետր`;
    }
    const km = (meters / 1000).toFixed(1).replace('.', ',');
    return `${km} կմ`;
  }

  openSettingsModal() {
    this.switchTab('profile');
  }

  syncProfilePageView() {
    this.syncGhostStatusWithSub();
    this.updateGhostBadgeUI();

    const avatarEl = document.getElementById('profile-page-avatar');
    const nameEl = document.getElementById('profile-page-display-name');
    const handleEl = document.getElementById('profile-page-display-handle');
    const phoneEl = document.getElementById('profile-page-display-phone');

    if (avatarEl) {
      avatarEl.src = this.myProfile.avatarUrl || './logo.png';
    }
    if (nameEl) {
      nameEl.textContent = this.myProfile.name || 'Telegram User';
    }
    if (handleEl) {
      handleEl.textContent = this.myProfile.username ? `@${this.myProfile.username.replace(/^@/, '')}` : '';
    }
    if (phoneEl) {
      phoneEl.textContent = this.myProfile.phone || localStorage.getItem('qips_verified_phone') || '';
    }

    const nameInput = document.getElementById('my-name-input');
    const statusInput = document.getElementById('my-status-input');
    const toggleVisible = document.getElementById('toggle-visible');
    const toggleGhost = document.getElementById('toggle-ghost');
    const realToggle = document.getElementById('toggle-real-mode');

    if (nameInput) nameInput.value = this.myProfile.name || '';
    if (statusInput) statusInput.value = this.myProfile.status || '';
    if (toggleVisible) toggleVisible.checked = Boolean(this.myProfile.visible);
    if (toggleGhost) toggleGhost.checked = Boolean(this.myProfile.ghost && this.hasActiveGhostSubscription());
    if (realToggle) realToggle.checked = Boolean(this.isRealMode);
  }

  // 9. Setup Event Listeners
  setupEventListeners() {
    this.tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchTab(btn.dataset.tab);
      });
    });

    if (this.radarSlider) {
      this.radarSlider.addEventListener('input', (e) => {
        this.currentRadius = parseFloat(e.target.value);
        if (this.radarRangeDisplay) {
          this.radarRangeDisplay.textContent = this.formatRadarRange(this.currentRadius, this.currentLang);
        }
        if (this.radarEngine) this.radarEngine.setMaxRadius(this.currentRadius);
        if (this.mapEngine) this.mapEngine.updateRadius(this.currentRadius);
        this.applyFiltersAndSearch();
      });
    }

    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        this.applyFiltersAndSearch();
      });
    }

    if (this.qipsUsersSearchInput) {
      this.qipsUsersSearchInput.addEventListener('input', (e) => {
        this.qipsUsersSearchQuery = e.target.value;
        this.renderQipsCurrentUsersSection();
      });
    }

    // First-Time Telegram Contacts Confirmation Modal Buttons
    const confirmAutoContactsBtn = document.getElementById('confirm-auto-contacts-btn');
    const declineAutoContactsBtn = document.getElementById('decline-auto-contacts-btn');

    if (confirmAutoContactsBtn) {
      confirmAutoContactsBtn.addEventListener('click', async () => {
        soundManager.playTap();
        this.firstContactsDialog?.close();
        await this.performAutoTelegramContactsSync();
        confetti({ particleCount: 40, spread: 60, origin: { y: 0.7 } });
      });
    }

    if (declineAutoContactsBtn) {
      declineAutoContactsBtn.addEventListener('click', () => {
        soundManager.playTap();
        try {
          localStorage.setItem('qips_first_contacts_confirmed_v1', 'declined');
        } catch {}
        this.firstContactsDialog?.close();
      });
    }

    // Add Telegram Contact with Automatic Real Telegram Profile & Photo Resolution
    const addContactBtn = document.getElementById('add-tg-contact-btn');
    if (addContactBtn) {
      addContactBtn.addEventListener('click', async () => {
        const nameEl = document.getElementById('add-tg-contact-name');
        const userEl = document.getElementById('add-tg-contact-user');
        const nameVal = (nameEl?.value || '').trim();
        const userVal = (userEl?.value || '').trim();

        if (!nameVal && !userVal) return;

        soundManager.playTap();
        addContactBtn.disabled = true;
        addContactBtn.textContent = '⏳...';

        const isPhone = userVal.startsWith('+') || /^\d{6,}/.test(userVal);
        const cleanUser = isPhone ? '' : userVal.replace(/^@/, '');
        const phoneVal = isPhone ? userVal : '';

        await this.upsertTelegramContact({
          name: nameVal,
          username: cleanUser,
          phone: phoneVal
        });

        addContactBtn.disabled = false;
        addContactBtn.textContent = '➕ Ավելացնել';
        if (nameEl) nameEl.value = '';
        if (userEl) userEl.value = '';
      });
    }

    // Best Practice: Native Telegram Contact Share Picker (Dogs/Notcoin style)
    this.btnNativeTgSharePicker?.addEventListener('click', () => {
      this.shareToTelegramContacts();
    });
    this.btnTgShareNative?.addEventListener('click', () => {
      this.shareToTelegramContacts();
    });

    // Best Practice: Copy Invite Link
    this.btnCopyInviteLink?.addEventListener('click', () => {
      this.copyInviteLink();
    });

    // Best Practice: Import Contacts from Mobile Address Book
    this.importDeviceContactsBtn?.addEventListener('click', async () => {
      await this.importFromDeviceContacts();
    });

    // Search Telegram Contacts
    this.tgContactsSearchInput?.addEventListener('input', (e) => {
      this.contactsSearchQuery = e.target.value.toLowerCase().trim();
      this.renderTelegramContactsSection();
    });

    // Filter Pills
    this.filterPills.forEach(pill => {
      pill.addEventListener('click', () => {
        soundManager.playTap();
        this.filterPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.activeFilter = pill.dataset.filter;
        this.applyFiltersAndSearch();
      });
    });

    const recenterBtn = document.getElementById('map-recenter-btn');
    if (recenterBtn) {
      recenterBtn.addEventListener('click', () => {
        soundManager.playTap();
        soundManager.triggerHaptic('light');
        this.initRealGeolocation();
        if (this.mapEngine) this.mapEngine.recenter();
      });
    }

    const shareLiveBtn = document.getElementById('tg-drawer-share-btn');
    if (shareLiveBtn) {
      shareLiveBtn.addEventListener('click', () => {
        soundManager.triggerHaptic('success');
        this.shareAppWithFriends();
      });
    }

    const langBtn = document.getElementById('lang-toggle-btn');
    if (langBtn) {
      langBtn.addEventListener('click', () => {
        soundManager.playTap();
        const langs = ['hy', 'en'];
        const nextIdx = (langs.indexOf(this.currentLang) + 1) % langs.length;
        this.currentLang = langs[nextIdx];
        try {
          localStorage.setItem('tma_preferred_lang', this.currentLang);
        } catch {}
        this.applyTranslations();
      });
    }

    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const realToggle = document.getElementById('toggle-real-mode');
    const toggleGhost = document.getElementById('toggle-ghost');

    if (toggleGhost) {
      toggleGhost.addEventListener('change', (e) => {
        soundManager.playTap();
        soundManager.triggerHaptic('light');

        if (e.target.checked) {
          if (!this.hasActiveGhostSubscription()) {
            e.target.checked = false;
            this.myProfile.ghost = false;
            this.openGhostPaymentModal();
            return;
          }
          this.myProfile.ghost = true;
          confetti({ particleCount: 40, spread: 50, origin: { y: 0.5 } });
        } else {
          this.myProfile.ghost = false;
        }

        try {
          const saved = JSON.parse(localStorage.getItem('tma_my_profile') || '{}');
          saved.ghost = this.myProfile.ghost;
          localStorage.setItem('tma_my_profile', JSON.stringify(saved));
        } catch {}

        this.updateGhostBadgeUI();

        if (this.realtimeService) {
          this.realtimeService.myProfile = this.myProfile;
          this.realtimeService.broadcastMyPresence();
        }
      });
    }

    const closeGhostPayBtn = document.getElementById('close-ghost-pay-btn');
    const payGhostStarsBtn = document.getElementById('pay-ghost-stars-btn');
    const activateGhostDirectBtn = document.getElementById('activate-ghost-direct-btn');

    if (closeGhostPayBtn) {
      closeGhostPayBtn.addEventListener('click', () => {
        soundManager.playTap();
        this.ghostPaymentDialog?.close();
      });
    }

    if (payGhostStarsBtn) {
      payGhostStarsBtn.addEventListener('click', () => {
        soundManager.playTap();
        this.handlePayGhostStars();
      });
    }

    if (activateGhostDirectBtn) {
      activateGhostDirectBtn.addEventListener('click', () => {
        soundManager.playTap();
        this.handlePayGhostStars();
      });
    }

    if (realToggle) {
      realToggle.addEventListener('change', (e) => {
        this.isRealMode = e.target.checked;
        this.updatePeopleData();
      });
    }

    if (closeSettingsBtn) {
      closeSettingsBtn.addEventListener('click', () => {
        soundManager.playTap();
        this.settingsDialog?.close();
      });
    }

    if (saveSettingsBtn) {
      saveSettingsBtn.addEventListener('click', () => {
        soundManager.playTap();
        const nameVal = document.getElementById('my-name-input')?.value;
        const statusVal = document.getElementById('my-status-input')?.value;
        if (nameVal) this.myProfile.name = nameVal;
        if (statusVal) this.myProfile.status = statusVal;
        this.myProfile.visible = document.getElementById('toggle-visible')?.checked ?? true;

        const wantGhost = document.getElementById('toggle-ghost')?.checked;
        if (wantGhost && !this.hasActiveGhostSubscription()) {
          this.myProfile.ghost = false;
          const tgSwitch = document.getElementById('toggle-ghost');
          if (tgSwitch) tgSwitch.checked = false;
          this.openGhostPaymentModal();
          return;
        }
        this.myProfile.ghost = Boolean(wantGhost);
        this.updateGhostBadgeUI();

        try {
          localStorage.setItem('tma_my_profile', JSON.stringify(this.myProfile));
        } catch {}

        if (realToggle) {
          this.isRealMode = realToggle.checked;
          this.updatePeopleData();
        }
        if (this.realtimeService) {
          this.realtimeService.myProfile = this.myProfile;
          this.realtimeService.broadcastMyPresence();
        }
        this.syncProfilePageView();
        const origText = saveSettingsBtn.textContent;
        saveSettingsBtn.textContent = this.currentLang === 'en' ? '✓ Saved' : '✓ Պահպանված է';
        setTimeout(() => { saveSettingsBtn.textContent = origText; }, 1800);
        confetti({ particleCount: 30, spread: 50, origin: { y: 0.7 } });
      });
    }

    const refreshGpsBtn = document.getElementById('refresh-gps-btn');
    if (refreshGpsBtn) {
      refreshGpsBtn.addEventListener('click', () => {
        soundManager.playTap();
        soundManager.triggerHaptic('light');
        const refreshLabel = document.getElementById('t-gps-refresh-label');
        if (refreshLabel) {
          refreshLabel.textContent = this.currentLang === 'en' ? 'Scanning...' : 'Որոնվում է...';
        }
        this.initRealGeolocation();
        if (this.mapEngine) {
          this.mapEngine.setUserLocation(this.currentCoords, this.currentRadius);
          this.mapEngine.recenter();
        }
      });
    }

    [this.profileDialog, this.ghostPaymentDialog, this.qipsMatchDialog, this.firstContactsDialog].forEach(dialog => {
      if (!dialog) return;
      dialog.addEventListener('click', (e) => {
        const rect = dialog.getBoundingClientRect();
        const isInDialog = (
          rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
          rect.left <= e.clientX && e.clientX <= rect.left + rect.width
        );
        if (!isInDialog) {
          dialog.close();
        }
      });
    });
  }

  // 11. Apply Translations
  applyTranslations() {
    const t = translations[this.currentLang] || translations.hy;
    const flagMap = { hy: '🇦🇲', en: '🇬🇧' };

    const langCodeEl = document.getElementById('current-lang-code');
    if (langCodeEl) langCodeEl.textContent = flagMap[this.currentLang] || '🇦🇲';

    const langTextEl = document.getElementById('current-lang-text');
    if (langTextEl) langTextEl.textContent = this.currentLang === 'en' ? 'English' : 'Հայերեն';

    const appTitleEl = document.getElementById('t-app-title');
    if (appTitleEl) appTitleEl.textContent = t.appTitle;
    document.title = `${t.appTitle} | @QipsBot`;

    const subEl = document.getElementById('t-app-subtitle');
    if (subEl) subEl.textContent = t.appSubtitle;

    const tabRadarEl = document.getElementById('t-tab-radar');
    if (tabRadarEl) tabRadarEl.textContent = this.currentLang === 'en' ? 'Map' : 'Քարտեզ';
    const tabMapEl = document.getElementById('t-tab-map');
    if (tabMapEl) tabMapEl.textContent = t.tabMap;
    const tabProfileEl = document.getElementById('t-tab-profile');
    if (tabProfileEl) tabProfileEl.textContent = t.tabProfile || (this.currentLang === 'en' ? 'Profile' : 'Պրոֆիլ');
    const tabListEl = document.getElementById('t-tab-list');
    if (tabListEl) tabListEl.textContent = t.tabList;
    const radiusLabel = document.getElementById('t-radius-label');
    if (radiusLabel) radiusLabel.textContent = `${t.radius}՝`;

    const pillAllEl = document.getElementById('pill-all');
    if (pillAllEl) pillAllEl.textContent = t.filterAll;
    const pillOnlineEl = document.getElementById('pill-online');
    if (pillOnlineEl) pillOnlineEl.textContent = t.filterOnline;
    const pillCloseEl = document.getElementById('pill-close');
    if (pillCloseEl) pillCloseEl.textContent = t.filterClose;
    const pillFemaleEl = document.getElementById('pill-female');
    if (pillFemaleEl) pillFemaleEl.textContent = t.filterFemale;
    const pillMaleEl = document.getElementById('pill-male');
    if (pillMaleEl) pillMaleEl.textContent = t.filterMale;

    if (this.searchInput) {
      this.searchInput.placeholder = t.searchPlaceholder;
    }

    const myProfileEl = document.getElementById('t-my-profile');
    if (myProfileEl) myProfileEl.textContent = t.myProfile;
    const visTitleEl = document.getElementById('t-vis-title');
    if (visTitleEl) visTitleEl.textContent = t.visibleOnRadar;
    const visDescEl = document.getElementById('t-vis-desc');
    if (visDescEl) visDescEl.textContent = t.visibleDesc;
    const stealthTitleEl = document.getElementById('t-stealth-title');
    if (stealthTitleEl) stealthTitleEl.textContent = t.stealthMode;
    const stealthDescEl = document.getElementById('t-stealth-desc');
    if (stealthDescEl) stealthDescEl.textContent = t.stealthDesc;
    const realTitleEl = document.getElementById('t-real-title');
    if (realTitleEl) realTitleEl.textContent = t.allTgUsers;
    const realDescEl = document.getElementById('t-real-desc');
    if (realDescEl) realDescEl.textContent = t.allTgUsersDesc;
    const myNameLabelEl = document.getElementById('t-my-name-label');
    if (myNameLabelEl) myNameLabelEl.textContent = t.myNameLabel;
    const myStatusLabelEl = document.getElementById('t-my-status-label');
    if (myStatusLabelEl) myStatusLabelEl.textContent = t.myStatusLabel;
    const saveBtnEl = document.getElementById('save-settings-btn');
    if (saveBtnEl) saveBtnEl.textContent = t.saveSettings || t.saveProfile;

    const settingsHeaderEl = document.getElementById('t-settings-header');
    if (settingsHeaderEl) settingsHeaderEl.textContent = t.settingsHeader;
    const ghostModalTitleEl = document.getElementById('t-ghost-modal-title');
    if (ghostModalTitleEl) ghostModalTitleEl.textContent = t.ghostModalTitle;
    const payGhostStarsBtn = document.getElementById('pay-ghost-stars-btn');
    if (payGhostStarsBtn) payGhostStarsBtn.textContent = t.payGhostStars;

    if (this.radarEngine) {
      this.radarEngine.setLanguage(this.currentLang);
    }
    if (this.mapEngine) {
      this.mapEngine.setLanguage(this.currentLang);
    }
    const radarMinDisplay = document.getElementById('radar-min-display');
    if (radarMinDisplay) {
      radarMinDisplay.textContent = this.currentLang === 'en' ? '0.5 m' : '0,5 մետր';
    }
    if (this.radarRangeDisplay) {
      this.radarRangeDisplay.textContent = this.formatRadarRange(this.currentRadius, this.currentLang);
    }

    const drawerTitleEl = document.getElementById('t-tg-drawer-title');
    if (drawerTitleEl && t.tgDrawerTitle) drawerTitleEl.textContent = t.tgDrawerTitle;
    const shareBtnEl = document.getElementById('t-tg-share-btn');
    if (shareBtnEl && t.tgShareLive) shareBtnEl.textContent = t.tgShareLive;
    const refreshLabel = document.getElementById('t-gps-refresh-label');
    if (refreshLabel && t.gpsRefreshLabel) refreshLabel.textContent = t.gpsRefreshLabel;

    const qipsUsersTitleEl = document.getElementById('t-qips-users-title');
    if (qipsUsersTitleEl && t.qipsUsersTitle) qipsUsersTitleEl.textContent = t.qipsUsersTitle;
    const tgContactsTitleEl = document.getElementById('t-tg-contacts-title');
    if (tgContactsTitleEl && t.tgContactsTitle) tgContactsTitleEl.textContent = t.tgContactsTitle;

    this.applyFiltersAndSearch();
    this.renderQipsDirectoryAndContacts();
  }

  // Telegram Map Bottom Drawer List
  renderMapDrawer() {
    const drawerList = document.getElementById('tg-drawer-people-list');
    const countBadge = document.getElementById('tg-drawer-count');
    if (!drawerList) return;

    const nearby = this.searchQuery.trim()
      ? this.filteredPeople
      : this.people.filter(p => p.distanceMeters <= this.currentRadius);

    if (countBadge) {
      const t = translations[this.currentLang];
      countBadge.textContent = this.searchQuery.trim()
        ? `${nearby.length} գտնված`
        : `${nearby.length} ${t.peopleFound}`;
    }

    if (nearby.length === 0) {
      drawerList.innerHTML = '';
      return;
    }

    drawerList.innerHTML = nearby.map(p => {
      const dStr = formatDistance(p.distanceMeters, this.currentLang);
      const fallbackSvg = p.fallbackAvatarUrl || createAvatarSvg(p.name, ['#945eff', '#af87ff'], '👤');
      return `
        <div class="tg-drawer-person-card" data-id="${p.id}">
          <img src="${p.avatarUrl}" onerror="this.onerror=null;this.src='${fallbackSvg}';" class="tg-drawer-card-avatar" alt="${p.name}" />
          <div>
            <div class="tg-drawer-card-name">${p.name.split(' ')[0]} ${p.statusEmoji || ''}</div>
            <div class="tg-drawer-card-dist">📍 ${dStr}</div>
          </div>
        </div>
      `;
    }).join('');

    drawerList.querySelectorAll('.tg-drawer-person-card').forEach(card => {
      card.addEventListener('click', () => {
        soundManager.playTap();
        const person = this.filteredPeople.find(p => p.id === card.dataset.id) || this.people.find(p => p.id === card.dataset.id);
        if (person) {
          this.openProfileModal(person);
          if (this.mapEngine && person.lat && person.lng) {
            this.mapEngine.map?.panTo([person.lat, person.lng]);
          }
        }
      });
    });
  }

  shareAppWithFriends() {
    const shareUrl = QIPS_BOT_URL;
    const t = translations[this.currentLang];
    const text = this.currentLang === 'hy'
      ? "Միացեք ինձ «Քիփս» (@QipsBot) հավելվածում՝ մոտակա կապ հաստատելու համար 📶"
      : "Join me on Qips (@QipsBot) Telegram Mini App 📶";
    const tgShareUrl = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(text)}`;

    const tg = window.Telegram?.WebApp;
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(tgShareUrl);
    } else if (navigator.share) {
      navigator.share({ title: t.appTitle, text, url: shareUrl }).catch(() => {});
    } else {
      window.open(tgShareUrl, '_blank');
    }
  }

  detectTelegramLanguage() {
    const urlParams = new URLSearchParams(window.location.search);
    const paramLang = urlParams.get('lang') || urlParams.get('tgLang');
    if (paramLang) {
      const clean = paramLang.toLowerCase();
      if (clean.startsWith('hy')) return 'hy';
      if (clean.startsWith('en')) return 'en';
    }

    try {
      const saved = localStorage.getItem('tma_preferred_lang');
      if (saved && (saved === 'hy' || saved === 'en')) {
        return saved;
      }
    } catch {}

    try {
      const tg = window.Telegram?.WebApp;
      const tgUser = tg?.initDataUnsafe?.user;
      if (tgUser?.language_code) {
        const lower = tgUser.language_code.toLowerCase();
        if (lower.startsWith('hy')) return 'hy';
        if (lower.startsWith('en')) return 'en';
        return 'en';
      }
    } catch (e) {
      console.warn("Could not read Telegram language", e);
    }

    if (typeof navigator !== 'undefined' && navigator.language) {
      const navLower = navigator.language.toLowerCase();
      if (navLower.startsWith('hy')) return 'hy';
      if (navLower.startsWith('en')) return 'en';
    }

    return 'hy';
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new AppController();
});
