// OpenStreetMap Engine with Neumorphism 3D Minimalism Aesthetics
import L from 'leaflet';
import { soundManager } from './audio.js';
import { formatDistance } from './mockData.js';

export const OPENSTREETMAP_STYLES = {
  'osm-standard': {
    name: 'OpenStreetMap',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    maxZoom: 19,
    subdomains: ['a', 'b', 'c'],
    attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>'
  },
  'osm-humanitarian': {
    name: 'OpenStreetMap Դետալային',
    url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    maxZoom: 19,
    subdomains: ['a', 'b', 'c'],
    attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>'
  }
};

export class MapEngine {
  constructor(mapContainerId, onSelectPerson) {
    this.containerId = mapContainerId;
    this.onSelectPerson = onSelectPerson;
    this.map = null;
    this.userMarker = null;
    this.radiusCircle = null;
    this.markersGroup = null;
    this.currentCenter = null;
    this.currentTheme = 'osm-standard'; // Official OpenStreetMap (https://www.openstreetmap.org/)
    this.tileLayer = null;
  }

  init(centerCoords, initialRadius = 50) {
    this.currentCenter = centerCoords || { lat: 40.1776, lng: 44.5126 };
    const container = document.getElementById(this.containerId);
    if (!container) return;

    const lat = this.currentCenter?.lat || 40.1776;
    const lng = this.currentCenter?.lng || 44.5126;

    // Initialize Leaflet map with zoom 18 for clean graphical view
    this.map = L.map(this.containerId, {
      center: [lat, lng],
      zoom: 18,
      maxZoom: 19,
      zoomControl: false,
      attributionControl: false
    });

    // Apply OpenStreetMap tile layer
    this.applyTileLayer(this.currentTheme);

    // Markers layer group
    this.markersGroup = L.layerGroup().addTo(this.map);

    // User marker with Telegram live location pulsing beacon
    if (this.currentCenter && typeof this.currentCenter.lat === 'number') {
      this.setUserLocation(this.currentCenter, initialRadius);
    }
  }

  applyTileLayer(theme = 'osm-standard') {
    if (this.tileLayer && this.map) {
      this.map.removeLayer(this.tileLayer);
    }
    this.currentTheme = theme;

    const style = OPENSTREETMAP_STYLES[theme] || OPENSTREETMAP_STYLES['osm-standard'];

    this.tileLayer = L.tileLayer(style.url, {
      maxZoom: style.maxZoom || 19,
      subdomains: style.subdomains || ['a', 'b', 'c'],
      updateWhenIdle: true,
      keepBuffer: 2,
      attribution: style.attribution
    }).addTo(this.map);
  }

  toggleTheme() {
    const modes = ['osm-standard', 'osm-humanitarian'];
    const currentIndex = modes.indexOf(this.currentTheme);
    const nextIndex = (currentIndex + 1) % modes.length;
    const nextTheme = modes[nextIndex];
    this.applyTileLayer(nextTheme);
    return nextTheme;
  }

  getThemeName(theme) {
    return OPENSTREETMAP_STYLES[theme]?.name || 'OpenStreetMap';
  }

  setUserLocation(coords, radiusMeters) {
    if (!coords || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') return;
    this.currentCenter = coords;
    if (!this.map) return;

    if (this.radiusCircle) {
      this.map.removeLayer(this.radiusCircle);
    }
    if (this.userMarker) {
      this.map.removeLayer(this.userMarker);
    }

    // Telegram Live Location search boundary circle
    this.radiusCircle = L.circle([coords.lat, coords.lng], {
      radius: radiusMeters,
      color: '#945eff',
      fillColor: '#945eff',
      fillOpacity: 0.12,
      weight: 2,
      dashArray: '4, 6'
    }).addTo(this.map);

    // Telegram Signature Live Navigation Beacon with App Logo
    const userIcon = L.divIcon({
      className: 'tg-live-beacon-icon',
      html: `
        <div class="tg-live-beacon">
          <div class="tg-beacon-ring"></div>
          <div class="tg-beacon-ring tg-ring-delayed"></div>
          <div class="tg-beacon-core">
            <img src="./logo.png" class="tg-beacon-logo" alt="My Location" />
          </div>
        </div>
      `,
      iconSize: [44, 44],
      iconAnchor: [22, 22]
    });

    this.userMarker = L.marker([coords.lat, coords.lng], { icon: userIcon }).addTo(this.map);
  }

  setLanguage(lang) {
    this.lang = lang;
  }

  setPeople(people, maxRadius = 10, isSearching = false) {
    if (!this.markersGroup) return;
    this.markersGroup.clearLayers();

    people.forEach(person => {
      if (!isSearching && person.distanceMeters > maxRadius) return;

      const dStr = formatDistance(person.distanceMeters, this.lang || 'hy');

      // Telegram styled peer marker with avatar, online dot, and chat-bubble distance tag
      const markerHtml = `
        <div class="tg-peer-map-marker ${person.online ? 'is-online' : ''}" data-id="${person.id}">
          <div class="tg-peer-avatar-wrap">
            <img src="${person.avatarUrl}" alt="${person.name}" class="tg-peer-avatar-img" />
            <span class="tg-peer-status-dot ${person.online ? 'is-online' : ''}"></span>
          </div>
          <div class="tg-peer-bubble-tag">${dStr}</div>
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'tg-peer-div-icon',
        html: markerHtml,
        iconSize: [48, 54],
        iconAnchor: [24, 27]
      });

      const marker = L.marker([person.lat, person.lng], { icon: customIcon });

      marker.on('click', () => {
        soundManager.playTap();
        this.onSelectPerson(person);
      });

      // Telegram chat bubble tooltip
      marker.bindTooltip(`
        <div class="tg-map-tooltip">
          <div class="tg-tt-name">${person.name}</div>
          <div class="tg-tt-sub">📍 ${dStr} • ${person.online ? '🟢 Օնլայն' : person.lastSeen}</div>
        </div>
      `, {
        direction: 'top',
        offset: [0, -28],
        className: 'custom-tg-tooltip'
      });

      this.markersGroup.addLayer(marker);
    });
  }

  updateRadius(radiusMeters) {
    if (this.radiusCircle) {
      this.radiusCircle.setRadius(radiusMeters);
    }
  }

  recenter() {
    if (this.map && this.currentCenter) {
      this.map.flyTo([this.currentCenter.lat, this.currentCenter.lng], 18, {
        animate: true,
        duration: 0.8
      });
    }
  }

  invalidateSize() {
    if (this.map) {
      setTimeout(() => {
        this.map.invalidateSize();
      }, 100);
    }
  }
}
