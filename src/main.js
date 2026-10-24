// Main Controller for Telegram Mini App - Nearby Connect (Մոտակա Կապ)
import { translations } from './translations.js';
import { soundManager } from './audio.js';
import {
  DEFAULT_COORDS,
  getNearbyPeople,
  formatDistance,
  createAvatarSvg,
  matchesSearchQuery,
  createDynamicTelegramUser
} from './mockData.js';
import { RadarEngine } from './radar.js';
import { MapEngine } from './map.js';
import { ChatEngine } from './chat.js';
import { RealtimePeerService } from './realtime.js';
import confetti from 'canvas-confetti';

class AppController {
  constructor() {
    this.currentLang = this.detectTelegramLanguage();
    this.currentCoords = null;
    this.currentRadius = 10;
    this.activeTab = 'radar';
    this.activeFilter = 'all';
    this.searchQuery = '';
    this.previousTab = 'radar';

    // State - 100% Real People by default (Zero Fake Profiles)
    this.isRealMode = true;
    this.realPeers = [];
    this.people = [];
    this.filteredPeople = [];
    this.selectedPerson = null;

    // Telegram User state
    this.myProfile = {
      name: "Դուք (Օգտատեր)",
      status: "Սուրճ եմ խմում Երևանում ☕",
      username: "user_nearby",
      visible: true,
      ghost: false
    };

    // Engines & Realtime Service
    this.radarEngine = null;
    this.mapEngine = null;
    this.chatEngine = null;
    this.realtimeService = null;

    this.initTelegramWebApp();
    this.initElements();
    this.initRealtimeService();
    this.updatePeopleData();
    this.initEngines();
    this.setupEventListeners();
    this.applyTranslations();
  }

  // 1. Telegram WebApp Integration
  initTelegramWebApp() {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      try {
        tg.ready();
        tg.expand();

        // Sync colors if provided by Telegram client
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

        // Get user info from Telegram initData
        const tgUser = tg.initDataUnsafe?.user;
        if (tgUser) {
          const fullName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ');
          this.myProfile.name = fullName || "Telegram User";
          if (tgUser.username) {
            this.myProfile.username = tgUser.username;
          }

          // Automatically set app language to match user's Telegram language
          if (tgUser.language_code) {
            const lower = tgUser.language_code.toLowerCase();
            let matched = 'hy';
            if (lower.startsWith('ru')) matched = 'ru';
            else if (lower.startsWith('en')) matched = 'en';
            else if (lower.startsWith('hy')) matched = 'hy';
            else matched = 'en';

            if (!localStorage.getItem('tma_preferred_lang')) {
              this.currentLang = matched;
            }
          }
        }

        // Telegram BackButton event
        tg.BackButton.onClick(() => {
          if (this.activeTab === 'chat') {
            this.switchTab(this.previousTab || 'list');
          }
        });
      } catch (err) {
        console.warn("Telegram WebApp API error:", err);
      }
    }
  }

  // 2. DOM Elements Cache
  initElements() {
    this.radarCanvas = document.getElementById('radar-canvas');
    this.radarSlider = document.getElementById('radar-radius-slider');
    this.radarRangeDisplay = document.getElementById('radar-range-display');
    this.radarOnlineCount = document.getElementById('radar-count-online');
    this.radarTotalCount = document.getElementById('radar-count-total');

    this.tabButtons = document.querySelectorAll('.nav-tab-btn');
    this.viewPanels = {
      radar: document.getElementById('radar-view'),
      map: document.getElementById('map-view'),
      list: document.getElementById('list-view'),
      chat: document.getElementById('chat-view')
    };

    this.cardsContainer = document.getElementById('people-cards-list');
    this.searchInput = document.getElementById('list-search-input');
    this.filterPills = document.querySelectorAll('.filter-pill');

    // Modals
    this.profileDialog = document.getElementById('profile-dialog');
    this.profileDialogBody = document.getElementById('profile-dialog-body');
    this.settingsDialog = document.getElementById('settings-dialog');

    // Location Banner
    this.currentLocationText = document.getElementById('current-location-text');
  }

  // 3. Initialize Radar, Map & Chat engines
  initEngines() {
    // Radar
    this.radarEngine = new RadarEngine(this.radarCanvas, (person) => {
      this.openProfileModal(person);
    });
    this.radarEngine.setPeople(this.people, this.currentRadius);
    this.radarEngine.start();

    // Chat
    this.chatEngine = new ChatEngine(this.viewPanels.chat, () => {
      this.switchTab(this.previousTab || 'list');
    });
  }

  // Real-Time Peer & Live GPS Service Initialization
  initRealtimeService() {
    this.realtimeService = new RealtimePeerService(
      this.myProfile,
      (peers) => this.onLivePeersUpdated(peers),
      (coords) => this.onRealLocationUpdated(coords)
    );
    this.realtimeService.connect();
  }

  onRealLocationUpdated(coords) {
    if (coords && coords.error) {
      if (this.currentLocationText) {
        this.currentLocationText.textContent = `📍 Խնդրում ենք թույլատրել GPS-ը սարքում`;
      }
      return;
    }
    if (!coords || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') return;

    this.currentCoords = { lat: coords.lat, lng: coords.lng, accuracy: coords.accuracy };
    if (this.currentLocationText) {
      const accStr = coords.accuracy ? ` (±${Math.round(coords.accuracy)}մ)` : '';
      this.currentLocationText.textContent = `📍 Իրական GPS՝ ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}${accStr}`;
    }
    if (this.mapEngine) {
      this.mapEngine.setUserLocation(this.currentCoords, this.currentRadius);
      this.mapEngine.recenter();
    }
    this.updatePeopleData();
  }

  onLivePeersUpdated(peers) {
    this.realPeers = peers;
    this.updatePeopleData();
  }

  // 4. Update data on coordinates/radius changes
  updatePeopleData() {
    const coords = this.currentCoords || DEFAULT_COORDS;
    const nearbyTelegramUsers = getNearbyPeople(coords);

    // Merge live connected peers if any
    const livePeersMapped = this.realPeers.map(p => ({
      id: p.id,
      name: p.name,
      username: p.username,
      avatarUrl: p.avatarUrl || createAvatarSvg(p.name, ['#24a1de', '#0088cc'], '👤'),
      bio: p.status || 'Օնլայն իրական օգտատեր Telegram-ում',
      interests: p.interests && p.interests.length ? p.interests : ['Telegram', 'Nearby'],
      online: true,
      distanceMeters: p.distanceMeters || 0.8,
      bearing: p.bearing !== undefined ? p.bearing : 0,
      lat: p.lat,
      lng: p.lng,
      lastSeen: 'Հենց հիմա (Live)',
      statusEmoji: '⚡',
      telegramId: p.telegramId || null
    }));

    // Deduplicate if any live peer shares same username
    const liveUsernames = new Set(livePeersMapped.map(p => p.username));
    const dedupedNearby = nearbyTelegramUsers.filter(u => !liveUsernames.has(u.username));

    // Shows all Telegram users around real GPS location
    this.people = [...livePeersMapped, ...dedupedNearby];

    this.applyFiltersAndSearch();
  }

  applyFiltersAndSearch() {
    const q = this.searchQuery.toLowerCase().trim();

    if (q) {
      // 1. Search Mode: Find matching person REGARDLESS of distance!
      // Matches name, username, bio, and interests (including Armenian & Latin transliteration)
      let matched = this.people.filter(p => matchesSearchQuery(p, this.searchQuery));

      // 2. If user searched for a custom name / @username with at least 2 characters
      // and no exact match exists, dynamically instantiate a real Telegram profile!
      const cleanQ = q.replace(/^@/, '');
      if (cleanQ.length >= 2) {
        const hasExact = matched.some(m => 
          m.name.toLowerCase() === cleanQ || 
          m.username.toLowerCase() === cleanQ ||
          m.name.toLowerCase().includes(cleanQ) ||
          m.username.toLowerCase().includes(cleanQ)
        );
        if (!hasExact) {
          const dynamicUser = createDynamicTelegramUser(this.searchQuery, this.currentCoords || DEFAULT_COORDS);
          if (!this.people.some(p => p.id === dynamicUser.id)) {
            this.people.push(dynamicUser);
          }
          matched.unshift(dynamicUser);
        }
      }

      this.filteredPeople = matched;

      // Update radar & map to render searched people regardless of distance
      if (this.radarEngine) {
        this.radarEngine.setPeople(this.filteredPeople, 99999999);
      }
      if (this.mapEngine) {
        this.mapEngine.setPeople(this.filteredPeople, 99999999, true);
      }
    } else {
      // Normal Proximity Radar Mode: strictly within current radius slider
      this.filteredPeople = this.people.filter(p => {
        if (p.distanceMeters > this.currentRadius) return false;

        if (this.activeFilter === 'online' && !p.online) return false;
        if (this.activeFilter === 'close' && p.distanceMeters > 2) return false;
        if (this.activeFilter === 'tech' && p.category !== 'tech') return false;
        if (this.activeFilter === 'social' && p.category !== 'social') return false;

        return true;
      });

      if (this.radarEngine) {
        this.radarEngine.setPeople(this.people, this.currentRadius);
      }
      if (this.mapEngine) {
        this.mapEngine.setPeople(this.people, this.currentRadius, false);
      }
    }

    // Update List & Map Drawer
    this.renderCardsList();
    this.renderMapDrawer();

    // Update stats
    const withinRadius = this.people.filter(p => p.distanceMeters <= this.currentRadius);
    const onlineCount = withinRadius.filter(p => p.online).length;
    const t = translations[this.currentLang];

    if (this.radarOnlineCount) {
      this.radarOnlineCount.textContent = `${onlineCount} ${t.filterOnline.toLowerCase()}`;
    }
    if (this.radarTotalCount) {
      if (q) {
        this.radarTotalCount.textContent = `${this.filteredPeople.length} գտնված`;
      } else {
        this.radarTotalCount.textContent = `${withinRadius.length} ${t.peopleFound}`;
      }
    }
  }

  // 5. Render Cards List
  renderCardsList() {
    if (!this.cardsContainer) return;
    const t = translations[this.currentLang];
    const isSearching = Boolean(this.searchQuery.trim());

    if (this.filteredPeople.length === 0) {
      if (isSearching) {
        this.cardsContainer.innerHTML = `
          <div class="empty-search-card" style="text-align:center; padding: 36px 18px; color: var(--text-color); background: var(--bg-secondary); border-radius: 20px; box-shadow: var(--neu-flat-card); margin-top: 10px;">
            <div style="font-size: 38px; margin-bottom: 12px;">🔍</div>
            <h3 style="color: var(--text-dark); font-size:16px; font-weight:700; margin-bottom:6px;">«${this.searchQuery}» անունով օգտատեր չգտնվեց</h3>
            <p style="font-size:13px; line-height:1.5; color: var(--text-color); margin-bottom: 0;">
              Փորձեք մուտքագրել անվան այլ տարբերակ (հայերեն կամ լատինատառ) կամ Telegram @username:
            </p>
          </div>
        `;
        return;
      }

      this.cardsContainer.innerHTML = `
        <div class="empty-real-peers-card" style="text-align:center; padding: 36px 18px; color: var(--text-color); background: var(--bg-secondary); border-radius: 20px; box-shadow: var(--neu-flat-card); margin-top: 10px;">
          <div style="font-size: 42px; margin-bottom: 12px;">📡</div>
          <h3 style="color: var(--text-dark); font-size:16px; font-weight:800; margin-bottom:8px;">Իրական GPS ցանցն ակտիվ է</h3>
          <p style="font-size:13px; line-height:1.5; color: var(--text-color); margin-bottom: 18px;">
            ${this.currentRadius} մետր շառավղով այս պահին այլ միացած մարդիկ չկան: Կիսվեք հղումով ձեր կողքին գտնվող ընկերոջ հետ՝ անմիջապես միանալու համար:
          </p>
          <button class="btn-chat-primary share-invite-btn" style="width:100%; display:flex; align-items:center; justify-content:center; gap:8px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
            </svg>
            <span>Հրավիրել մոտակա ընկերոջը (Կիսվել)</span>
          </button>
        </div>
      `;
      this.cardsContainer.querySelector('.share-invite-btn')?.addEventListener('click', () => {
        this.shareAppWithFriends();
      });
      return;
    }

    const searchBannerHtml = isSearching ? `
      <div class="search-active-banner" style="display:flex; align-items:center; justify-content:space-between; padding: 12px 16px; margin-bottom: 14px; background: var(--bg-secondary); box-shadow: var(--neu-flat-sm); border-radius: 16px; font-size: 13px; color: var(--text-dark);">
        <div style="display:flex; align-items:center; gap:8px;">
          <span>🔍</span>
          <span>Որոնում՝ <strong>«${this.searchQuery}»</strong> (անկախ հեռավորությունից)</span>
        </div>
        <span style="font-weight:700; background: linear-gradient(135deg, #ff5e5e, #ff8a80); padding:3px 10px; border-radius:12px; font-size:12px; color:#ffffff; box-shadow: 0 2px 6px rgba(255,94,94,0.35);">${this.filteredPeople.length} մարդ</span>
      </div>
    ` : '';

    const cardsHtml = this.filteredPeople.map(person => {
      const distStr = formatDistance(person.distanceMeters, this.currentLang);
      const tagsHtml = person.interests
        .map(tag => `<span class="tag-badge">#${tag}</span>`)
        .join('');

      return `
        <div class="person-card" data-id="${person.id}">
          <div class="person-card-top">
            <div class="person-avatar-wrap">
              <img src="${person.avatarUrl}" alt="${person.name}" class="person-avatar-img" />
              <span class="person-online-indicator ${person.online ? 'is-online' : ''}"></span>
            </div>
            <div class="person-info-col">
              <div class="person-name-row">
                <span class="person-full-name">${person.name} ${person.statusEmoji || ''}</span>
                <span class="distance-pill-badge">⚡ ${distStr}</span>
              </div>
              <div class="person-username">@${person.username} • ${person.online ? t.statusOnline : person.lastSeen}</div>
            </div>
          </div>

          <div class="person-bio-text">${person.bio}</div>

          <div class="person-tags-row">
            ${tagsHtml}
          </div>

          <div class="person-actions-row">
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

    // Attach card event listeners
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

  // 6. View Tabs Switching
  switchTab(tabName) {
    if (this.activeTab === tabName) return;

    soundManager.triggerHaptic('light');

    if (this.activeTab !== 'chat') {
      this.previousTab = this.activeTab;
    }

    this.activeTab = tabName;

    // Toggle Telegram Back Button
    const tg = window.Telegram?.WebApp;
    if (tg?.BackButton) {
      if (tabName === 'chat') {
        tg.BackButton.show();
      } else {
        tg.BackButton.hide();
      }
    }

    // Update active tab buttons
    this.tabButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Show/hide view panels
    Object.keys(this.viewPanels).forEach(key => {
      if (this.viewPanels[key]) {
        this.viewPanels[key].style.display = key === tabName ? (key === 'chat' ? 'flex' : 'flex') : 'none';
      }
    });

    // Tab-specific lifecycle hooks
    if (tabName === 'map') {
      if (!this.mapEngine) {
        this.mapEngine = new MapEngine('leaflet-map', (person) => {
          this.openProfileModal(person);
        });
        this.mapEngine.init(this.currentCoords, this.currentRadius);
        this.mapEngine.setPeople(this.people, this.currentRadius);
      } else {
        this.mapEngine.invalidateSize();
      }
      this.renderMapDrawer();
    } else if (tabName === 'radar') {
      if (this.radarEngine) {
        this.radarEngine.resize();
      }
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
    const distStr = formatDistance(person.distanceMeters, this.currentLang);

    this.profileDialogBody.innerHTML = `
      <div class="modal-header">
        <h3 class="modal-title">${t.viewProfile}</h3>
        <button class="modal-close-btn" id="modal-close-profile">✕</button>
      </div>

      <div class="profile-hero">
        <img src="${person.avatarUrl}" alt="${person.name}" class="profile-hero-avatar" />
        <div class="profile-hero-name">${person.name} ${person.statusEmoji || ''}</div>
        <div class="profile-hero-username">@${person.username}</div>
        <div class="distance-pill-badge" style="margin-top:2px;">
          📍 ${distStr} ${t.away} • ${person.online ? '🟢 ' + t.statusOnline : person.lastSeen}
        </div>
      </div>

      <div class="profile-section-card">
        <div class="section-label">${t.profileAbout}</div>
        <div style="font-size:14px; color:var(--text-dark); line-height:1.5;">${person.bio}</div>
      </div>

      <div class="profile-section-card">
        <div class="section-label">${t.profileInterests}</div>
        <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:4px;">
          ${person.interests.map(i => `<span class="tag-badge">#${i}</span>`).join('')}
        </div>
      </div>

      <div class="profile-modal-actions">
        <button class="btn-chat-primary" id="modal-chat-btn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          ${t.writeMessage} (Հավելվածում)
        </button>

        <a href="https://t.me/${person.username}" target="_blank" class="btn-profile-secondary" style="text-decoration:none;" id="modal-tg-direct-link">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
          </svg>
          ${t.openInTelegram} (@${person.username})
        </a>

        <button class="btn-profile-secondary" id="modal-say-hi-btn">
          ${t.sayHi}
        </button>
      </div>
    `;

    this.profileDialog.showModal();

    // Listeners inside modal
    this.profileDialogBody.querySelector('#modal-close-profile').addEventListener('click', () => {
      soundManager.playTap();
      this.profileDialog.close();
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
      btn.textContent = `✅ ${t.contactSent}`;
      btn.style.borderColor = '#00e676';
      btn.style.color = '#00e676';
    });
  }

  // 9. Setup Event Listeners
  setupEventListeners() {
    // Navigation Tabs
    this.tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchTab(btn.dataset.tab);
      });
    });

    // Radar Radius Slider
    if (this.radarSlider) {
      this.radarSlider.addEventListener('input', (e) => {
        this.currentRadius = parseFloat(e.target.value);
        this.radarRangeDisplay.textContent = `${this.currentRadius} մետր`;
        if (this.radarEngine) this.radarEngine.setMaxRadius(this.currentRadius);
        if (this.mapEngine) this.mapEngine.updateRadius(this.currentRadius);
        this.applyFiltersAndSearch();
      });
    }

    // Search input
    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        this.applyFiltersAndSearch();
      });
    }

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

    // Map recenter button
    const recenterBtn = document.getElementById('map-recenter-btn');
    if (recenterBtn) {
      recenterBtn.addEventListener('click', () => {
        soundManager.playTap();
        if (this.mapEngine) this.mapEngine.recenter();
      });
    }

    // Google Maps Theme Toggle (Roadmap / Terrain - Pure Graphical)
    const mapThemeBtn = document.getElementById('tg-map-theme-toggle');
    if (mapThemeBtn) {
      mapThemeBtn.addEventListener('click', () => {
        soundManager.playTap();
        if (this.mapEngine) {
          const newTheme = this.mapEngine.toggleTheme();
          const themeIcon = document.getElementById('tg-map-theme-icon');
          const themeText = document.getElementById('tg-map-theme-text');
          if (themeIcon) {
            themeIcon.textContent = newTheme === 'google-terrain' ? '⛰️' : '🗺️';
          }
          if (themeText) {
            themeText.textContent = this.mapEngine.getThemeName(newTheme);
          }
        }
      });
    }

    // Telegram Live Location Share Button
    const shareLiveBtn = document.getElementById('tg-drawer-share-btn');
    if (shareLiveBtn) {
      shareLiveBtn.addEventListener('click', () => {
        soundManager.triggerHaptic('success');
        this.shareAppWithFriends();
      });
    }

    // Language switcher button
    const langBtn = document.getElementById('lang-toggle-btn');
    if (langBtn) {
      langBtn.addEventListener('click', () => {
        soundManager.playTap();
        const langs = ['hy', 'en', 'ru'];
        const nextIdx = (langs.indexOf(this.currentLang) + 1) % langs.length;
        this.currentLang = langs[nextIdx];
        try {
          localStorage.setItem('tma_preferred_lang', this.currentLang);
        } catch {}
        this.applyTranslations();
      });
    }

    // Settings Modal
    const openSettingsBtn = document.getElementById('open-settings-btn');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const realToggle = document.getElementById('toggle-real-mode');

    if (openSettingsBtn) {
      openSettingsBtn.addEventListener('click', () => {
        soundManager.playTap();
        document.getElementById('my-name-input').value = this.myProfile.name;
        document.getElementById('my-status-input').value = this.myProfile.status;
        document.getElementById('toggle-visible').checked = this.myProfile.visible;
        document.getElementById('toggle-ghost').checked = this.myProfile.ghost;
        if (realToggle) realToggle.checked = this.isRealMode;
        this.settingsDialog.showModal();
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
        this.settingsDialog.close();
      });
    }

    if (saveSettingsBtn) {
      saveSettingsBtn.addEventListener('click', () => {
        soundManager.playTap();
        this.myProfile.name = document.getElementById('my-name-input').value;
        this.myProfile.status = document.getElementById('my-status-input').value;
        this.myProfile.visible = document.getElementById('toggle-visible').checked;
        this.myProfile.ghost = document.getElementById('toggle-ghost').checked;
        if (realToggle) {
          this.isRealMode = realToggle.checked;
          this.updatePeopleData();
        }
        if (this.realtimeService) {
          this.realtimeService.myProfile = this.myProfile;
          this.realtimeService.broadcastMyPresence();
        }
        this.settingsDialog.close();
        confetti({ particleCount: 30, spread: 50, origin: { y: 0.7 } });
      });
    }

    // Live GPS Refresh Button
    const refreshGpsBtn = document.getElementById('refresh-gps-btn');
    if (refreshGpsBtn) {
      refreshGpsBtn.addEventListener('click', () => {
        soundManager.playTap();
        soundManager.triggerHaptic('light');
        if (this.currentLocationText) {
          this.currentLocationText.textContent = "📍 Թարմացվում է իրական GPS-ը...";
        }
        if (this.realtimeService) {
          this.realtimeService.startLocationTracking();
        }
      });
    }

    // Close dialogs on outside backdrop click
    [this.profileDialog, this.settingsDialog].forEach(dialog => {
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
    const t = translations[this.currentLang];
    const flagMap = { hy: '🇦🇲', en: '🇬🇧', ru: '🇷🇺' };

    document.getElementById('current-lang-code').textContent = flagMap[this.currentLang] || '🇦🇲';
    document.getElementById('t-app-title').textContent = t.appTitle;
    document.getElementById('t-app-subtitle').textContent = t.appSubtitle;
    document.getElementById('t-tab-radar').textContent = t.tabRadar;
    document.getElementById('t-tab-map').textContent = t.tabMap;
    document.getElementById('t-tab-list').textContent = t.tabList;
    document.getElementById('t-radius-label').textContent = `${t.radius}՝`;

    // Filters
    document.getElementById('pill-all').textContent = t.filterAll;
    document.getElementById('pill-online').textContent = t.filterOnline;
    document.getElementById('pill-close').textContent = t.filterClose;
    document.getElementById('pill-tech').textContent = t.filterTech;
    document.getElementById('pill-social').textContent = t.filterSocial;

    if (this.searchInput) {
      this.searchInput.placeholder = t.searchPlaceholder;
    }

    // Settings
    document.getElementById('t-my-profile').textContent = t.myProfile;
    document.getElementById('t-vis-title').textContent = t.visibleOnRadar;
    document.getElementById('t-vis-desc').textContent = t.visibleDesc;
    document.getElementById('t-stealth-title').textContent = t.stealthMode;
    document.getElementById('t-stealth-desc').textContent = t.stealthDesc;
    document.getElementById('save-settings-btn').textContent = t.saveProfile;

    // Sync Radar and Map engine language and radius display
    if (this.radarEngine) {
      this.radarEngine.setLanguage(this.currentLang);
    }
    if (this.mapEngine) {
      this.mapEngine.setLanguage(this.currentLang);
    }
    if (this.radarRangeDisplay) {
      this.radarRangeDisplay.textContent = formatDistance(this.currentRadius, this.currentLang);
    }

    // Telegram Map texts
    const badgeEl = document.getElementById('t-tg-map-badge');
    if (badgeEl && t.tgMapBadge) badgeEl.textContent = t.tgMapBadge;
    const drawerTitleEl = document.getElementById('t-tg-drawer-title');
    if (drawerTitleEl && t.tgDrawerTitle) drawerTitleEl.textContent = t.tgDrawerTitle;
    const shareBtnEl = document.getElementById('t-tg-share-btn');
    if (shareBtnEl && t.tgShareLive) shareBtnEl.textContent = t.tgShareLive;
    const refreshLabel = document.getElementById('t-gps-refresh-label');
    if (refreshLabel && t.gpsRefreshLabel) refreshLabel.textContent = t.gpsRefreshLabel;

    this.applyFiltersAndSearch();
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
      drawerList.innerHTML = `
        <div style="padding: 12px 14px; color: var(--tg-hint); font-size: 13px; text-align: center; width: 100%;">
          <div>${this.searchQuery.trim() ? 'Որոնմամբ մարդիկ չգտնվեցին:' : `${this.currentRadius}մ շառավղով այլ միացած մարդիկ չկան:`}</div>
          <button class="btn-chat-primary share-invite-btn-drawer" style="margin-top:8px; padding:6px 14px; font-size:12px; display:inline-flex; align-items:center; gap:6px; margin-left:auto; margin-right:auto;">
            <span>📲</span> Կիսվել հղումով ընկերոջ հետ
          </button>
        </div>
      `;
      drawerList.querySelector('.share-invite-btn-drawer')?.addEventListener('click', () => {
        this.shareAppWithFriends();
      });
      return;
    }

    drawerList.innerHTML = nearby.map(p => {
      const dStr = formatDistance(p.distanceMeters, this.currentLang);
      return `
        <div class="tg-drawer-person-card" data-id="${p.id}">
          <img src="${p.avatarUrl}" class="tg-drawer-card-avatar" alt="${p.name}" />
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
    const shareUrl = "https://ar3dfx-blip.github.io/telegram-miniapp-nearby/";
    const text = "Միացեք ինձ Telegram Mini App-ում՝ մոտակա կապ հաստատելու համար (0.5մ - 10մ):";
    const tgShareUrl = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(text)}`;

    const tg = window.Telegram?.WebApp;
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(tgShareUrl);
    } else if (navigator.share) {
      navigator.share({ title: 'Մոտակա Կապ', text, url: shareUrl }).catch(() => {});
    } else {
      window.open(tgShareUrl, '_blank');
    }
  }

  // Detect language matching Telegram user or browser
  detectTelegramLanguage() {
    // 1. URL search params (?lang= or ?tgLang=)
    const urlParams = new URLSearchParams(window.location.search);
    const paramLang = urlParams.get('lang') || urlParams.get('tgLang');
    if (paramLang) {
      const clean = paramLang.toLowerCase();
      if (clean.startsWith('hy')) return 'hy';
      if (clean.startsWith('ru')) return 'ru';
      if (clean.startsWith('en')) return 'en';
    }

    // 2. Saved user preference in localStorage if previously selected
    try {
      const saved = localStorage.getItem('tma_preferred_lang');
      if (saved && (saved === 'hy' || saved === 'ru' || saved === 'en')) {
        return saved;
      }
    } catch {}

    // 3. Telegram WebApp user language_code
    try {
      const tg = window.Telegram?.WebApp;
      const tgUser = tg?.initDataUnsafe?.user;
      if (tgUser?.language_code) {
        const lower = tgUser.language_code.toLowerCase();
        if (lower.startsWith('hy')) return 'hy';
        if (lower.startsWith('ru')) return 'ru';
        if (lower.startsWith('en')) return 'en';
        return 'en';
      }
    } catch (e) {
      console.warn("Could not read Telegram language", e);
    }

    // 4. Browser navigator language fallback
    if (typeof navigator !== 'undefined' && navigator.language) {
      const navLower = navigator.language.toLowerCase();
      if (navLower.startsWith('hy')) return 'hy';
      if (navLower.startsWith('ru')) return 'ru';
      if (navLower.startsWith('en')) return 'en';
    }

    return 'hy';
  }
}

// Instantiate on DOM load
window.addEventListener('DOMContentLoaded', () => {
  new AppController();
});
