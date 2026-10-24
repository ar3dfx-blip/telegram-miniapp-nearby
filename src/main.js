// Main Controller for Telegram Mini App - Nearby Connect (Մոտակա Կապ)
import { translations } from './translations.js';
import { soundManager } from './audio.js';
import {
  DEFAULT_COORDS,
  PRESET_LOCATIONS,
  getNearbyPeople,
  formatDistance
} from './mockData.js';
import { RadarEngine } from './radar.js';
import { MapEngine } from './map.js';
import { ChatEngine } from './chat.js';
import confetti from 'canvas-confetti';

class AppController {
  constructor() {
    this.currentLang = this.detectTelegramLanguage();
    this.currentCoords = { ...DEFAULT_COORDS };
    this.currentRadius = 10;
    this.activeTab = 'radar';
    this.activeFilter = 'all';
    this.searchQuery = '';
    this.previousTab = 'radar';

    // State
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

    // Engines
    this.radarEngine = null;
    this.mapEngine = null;
    this.chatEngine = null;

    this.initTelegramWebApp();
    this.initElements();
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
    this.locationDialog = document.getElementById('location-dialog');

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

  // 4. Update data on coordinates/radius changes
  updatePeopleData() {
    this.people = getNearbyPeople(this.currentCoords);
    this.applyFiltersAndSearch();
  }

  applyFiltersAndSearch() {
    const q = this.searchQuery.toLowerCase().trim();

    this.filteredPeople = this.people.filter(p => {
      // Radius limit
      if (p.distanceMeters > this.currentRadius) return false;

      // Filter category
      if (this.activeFilter === 'online' && !p.online) return false;
      if (this.activeFilter === 'close' && p.distanceMeters > 2) return false;
      if (this.activeFilter === 'tech' && p.category !== 'tech') return false;
      if (this.activeFilter === 'social' && p.category !== 'social') return false;

      // Search query
      if (q) {
        const inName = p.name.toLowerCase().includes(q);
        const inUsername = p.username.toLowerCase().includes(q);
        const inBio = p.bio.toLowerCase().includes(q);
        const inTags = p.interests.some(t => t.toLowerCase().includes(q));
        if (!inName && !inUsername && !inBio && !inTags) return false;
      }

      return true;
    });

    // Update Radar
    if (this.radarEngine) {
      this.radarEngine.setPeople(this.people, this.currentRadius);
    }

    // Update Map
    if (this.mapEngine) {
      this.mapEngine.setPeople(this.people, this.currentRadius);
    }

    // Update List
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
      this.radarTotalCount.textContent = `${withinRadius.length} ${t.peopleFound}`;
    }
  }

  // 5. Render Cards List
  renderCardsList() {
    if (!this.cardsContainer) return;
    const t = translations[this.currentLang];

    if (this.filteredPeople.length === 0) {
      this.cardsContainer.innerHTML = `
        <div style="text-align:center; padding: 40px 16px; color: var(--tg-hint);">
          <div style="font-size: 38px; margin-bottom: 10px;">🔍</div>
          <h4 style="color:#ffffff; margin-bottom:6px;">Ոչ ոք չի գտնվել</h4>
          <p style="font-size:13px;">Փորձեք մեծացնել որոնման շառավիղը կամ փոխել ֆիլտրերը:</p>
        </div>
      `;
      return;
    }

    this.cardsContainer.innerHTML = this.filteredPeople.map(person => {
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

    // Attach card event listeners
    this.cardsContainer.querySelectorAll('.card-chat-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        soundManager.playTap();
        const id = btn.dataset.id;
        const person = this.people.find(p => p.id === id);
        if (person) this.openChatWith(person);
      });
    });

    this.cardsContainer.querySelectorAll('.card-view-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        soundManager.playTap();
        const id = btn.dataset.id;
        const person = this.people.find(p => p.id === id);
        if (person) this.openProfileModal(person);
      });
    });

    this.cardsContainer.querySelectorAll('.person-card').forEach(card => {
      card.addEventListener('click', () => {
        soundManager.playTap();
        const id = card.dataset.id;
        const person = this.people.find(p => p.id === id);
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
        <div style="font-size:14px; color:#e2e8f0; line-height:1.5;">${person.bio}</div>
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

    // Telegram Map Theme Toggle (OpenStreetMap Voyager / Dark)
    const mapThemeBtn = document.getElementById('tg-map-theme-toggle');
    if (mapThemeBtn) {
      mapThemeBtn.addEventListener('click', () => {
        soundManager.playTap();
        if (this.mapEngine) {
          const newTheme = this.mapEngine.toggleTheme();
          const themeIcon = document.getElementById('tg-map-theme-icon');
          if (themeIcon) {
            themeIcon.textContent = newTheme === 'voyager' ? '☀️' : '🌙';
          }
        }
      });
    }

    // Telegram Live Location Share Button
    const shareLiveBtn = document.getElementById('tg-drawer-share-btn');
    if (shareLiveBtn) {
      shareLiveBtn.addEventListener('click', () => {
        soundManager.triggerHaptic('success');
        confetti({ particleCount: 40, spread: 60, origin: { y: 0.7 } });
        shareLiveBtn.innerHTML = `<span>✅</span> Live Դիրքը ակտիվ է Telegram-ում`;
        shareLiveBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
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

    if (openSettingsBtn) {
      openSettingsBtn.addEventListener('click', () => {
        soundManager.playTap();
        document.getElementById('my-name-input').value = this.myProfile.name;
        document.getElementById('my-status-input').value = this.myProfile.status;
        document.getElementById('toggle-visible').checked = this.myProfile.visible;
        document.getElementById('toggle-ghost').checked = this.myProfile.ghost;
        this.settingsDialog.showModal();
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
        this.settingsDialog.close();
        confetti({ particleCount: 30, spread: 50, origin: { y: 0.7 } });
      });
    }

    // Location Change Modal
    const openLocModalBtn = document.getElementById('open-loc-modal-btn');
    const closeLocationBtn = document.getElementById('close-location-btn');
    const presetsGrid = document.getElementById('presets-grid');
    const useGpsBtn = document.getElementById('btn-use-live-gps');

    if (openLocModalBtn) {
      openLocModalBtn.addEventListener('click', () => {
        soundManager.playTap();
        this.renderLocationPresets();
        this.locationDialog.showModal();
      });
    }

    if (closeLocationBtn) {
      closeLocationBtn.addEventListener('click', () => {
        soundManager.playTap();
        this.locationDialog.close();
      });
    }

    // GPS Live Button
    if (useGpsBtn) {
      useGpsBtn.addEventListener('click', () => {
        soundManager.playTap();
        if (navigator.geolocation) {
          useGpsBtn.textContent = "⏳ Որոշվում է GPS կոորդինատները...";
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              this.currentCoords = {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                city: "Իմ GPS դիրքը (Ակտիվ)"
              };
              this.currentLocationText.textContent = `📍 ${this.currentCoords.city}`;
              this.updatePeopleData();
              if (this.mapEngine) this.mapEngine.setUserLocation(this.currentCoords, this.currentRadius);
              this.locationDialog.close();
              useGpsBtn.innerHTML = `<span>🛰️</span> Ակտիվացնել Իրական GPS-ը`;
              confetti({ particleCount: 40, spread: 60 });
            },
            () => {
              alert("GPS հասանելիությունը մերժված է կամ անհասանելի: Շարունակում ենք Երևանի կենտրոնով:");
              useGpsBtn.innerHTML = `<span>🛰️</span> Ակտիվացնել Իրական GPS-ը`;
            },
            { enableHighAccuracy: true, timeout: 8000 }
          );
        }
      });
    }

    // Close dialogs on outside backdrop click
    [this.profileDialog, this.settingsDialog, this.locationDialog].forEach(dialog => {
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

  // 10. Render Location Presets
  renderLocationPresets() {
    const grid = document.getElementById('presets-grid');
    if (!grid) return;

    grid.innerHTML = PRESET_LOCATIONS.map(loc => `
      <button class="loc-preset-btn ${this.currentCoords.city === loc.name ? 'active' : ''}" data-id="${loc.id}">
        📍 ${loc.name}
      </button>
    `).join('');

    grid.querySelectorAll('.loc-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        soundManager.playTap();
        const id = btn.dataset.id;
        const loc = PRESET_LOCATIONS.find(l => l.id === id);
        if (loc) {
          this.currentCoords = { lat: loc.lat, lng: loc.lng, city: `Երևան, ${loc.name}` };
          this.currentLocationText.textContent = this.currentCoords.city;
          this.updatePeopleData();
          if (this.mapEngine) this.mapEngine.setUserLocation(this.currentCoords, this.currentRadius);
          this.locationDialog.close();
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

    // Sync Radar engine language and radius display
    if (this.radarEngine) {
      this.radarEngine.setLanguage(this.currentLang);
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

    this.applyFiltersAndSearch();
  }

  // Telegram Map Bottom Drawer List
  renderMapDrawer() {
    const drawerList = document.getElementById('tg-drawer-people-list');
    const countBadge = document.getElementById('tg-drawer-count');
    if (!drawerList) return;

    const nearby = this.people.filter(p => p.distanceMeters <= this.currentRadius);
    if (countBadge) {
      const t = translations[this.currentLang];
      countBadge.textContent = `${nearby.length} ${t.peopleFound}`;
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
        const person = this.people.find(p => p.id === card.dataset.id);
        if (person) this.openProfileModal(person);
      });
    });
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
