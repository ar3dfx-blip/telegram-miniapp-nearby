import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

maplibregl.setWorkerUrl(workerUrl);
import { soundManager } from './audio.js';
import { formatDistance } from './mockData.js';

function createGeoJsonCircle(center, radiusMeters, points = 64) {
  if (!center || typeof center.lat !== 'number' || typeof center.lng !== 'number') {
    return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[]] } };
  }
  const km = (radiusMeters || 50) / 1000;
  const ret = [];
  const distanceX = km / (111.320 * Math.cos((center.lat * Math.PI) / 180));
  const distanceY = km / 110.574;
  for (let i = 0; i < points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    const x = distanceX * Math.cos(theta);
    const y = distanceY * Math.sin(theta);
    ret.push([center.lng + x, center.lat + y]);
  }
  ret.push(ret[0]);
  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [ret]
    }
  };
}

export class MapEngine {
  constructor(mapContainerId, onSelectPerson) {
    this.containerId = mapContainerId;
    this.onSelectPerson = onSelectPerson;
    this.map = null;
    this.userMarker = null;
    this.peerMarkers = new Map();
    this.currentCenter = null;
    this.currentRadius = 50;
    this.isLoaded = false;
    this.pendingPeople = null;
    this.lang = 'hy';
  }

  init(centerCoords, initialRadius = 50) {
    this.currentCenter = centerCoords || { lat: 40.1776, lng: 44.5126 };
    this.currentRadius = initialRadius;
    const container = document.getElementById(this.containerId);
    if (!container) return;

    const lat = this.currentCenter?.lat || 40.1776;
    const lng = this.currentCenter?.lng || 44.5126;

    this.map = new maplibregl.Map({
      container: this.containerId,
      style: './map-style-neumorphic.json',
      center: [lng, lat],
      zoom: 17.2,
      maxZoom: 19.5,
      pitchWithRotate: false,
      dragRotate: false,
      touchPitch: false,
      attributionControl: false
    });

    // Provide Leaflet-compatible panTo wrapper so caller can pass [lat, lng] or [lng, lat]
    const origPanTo = this.map.panTo.bind(this.map);
    this.map.panTo = (coords, options) => {
      if (Array.isArray(coords) && coords.length === 2) {
        // If passed as [lat, lng] (in Armenia lat ~ 40, lng ~ 44)
        if (coords[0] < coords[1]) {
          return origPanTo([coords[1], coords[0]], options);
        }
      }
      return origPanTo(coords, options);
    };

    this.map.on('load', () => {
      this.isLoaded = true;

      // Add search radius circle GeoJSON layer
      try {
        if (!this.map.getSource('search-radius')) {
          this.map.addSource('search-radius', {
            type: 'geojson',
            data: createGeoJsonCircle(this.currentCenter, this.currentRadius)
          });

          this.map.addLayer({
            id: 'search-radius-fill',
            type: 'fill',
            source: 'search-radius',
            paint: {
              'fill-color': '#7c3aed',
              'fill-opacity': 0.08
            }
          });

          this.map.addLayer({
            id: 'search-radius-line',
            type: 'line',
            source: 'search-radius',
            paint: {
              'line-color': '#7c3aed',
              'line-width': 1.5,
              'line-dasharray': [3, 3]
            }
          });
        }
      } catch (err) {
        console.warn('Radius layer init note:', err);
      }

      if (this.currentCenter) {
        this.setUserLocation(this.currentCenter, this.currentRadius);
      }

      if (this.pendingPeople) {
        this.setPeople(this.pendingPeople.people, this.pendingPeople.maxRadius, this.pendingPeople.isSearching);
        this.pendingPeople = null;
      }
    });
  }

  setUserLocation(coords, radiusMeters) {
    if (!coords || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') return;
    this.currentCenter = coords;
    this.currentRadius = radiusMeters || this.currentRadius;

    if (!this.map) return;

    // Update radius circle GeoJSON data
    if (this.isLoaded && this.map.getSource('search-radius')) {
      this.map.getSource('search-radius').setData(createGeoJsonCircle(this.currentCenter, this.currentRadius));
    }

    // Update user marker position without DOM tearing
    if (this.userMarker) {
      this.userMarker.setLngLat([coords.lng, coords.lat]);
    } else {
      const beaconEl = document.createElement('div');
      beaconEl.className = 'tg-live-beacon';
      beaconEl.innerHTML = `
        <div class="tg-beacon-ring"></div>
        <div class="tg-beacon-ring tg-ring-delayed"></div>
        <div class="tg-beacon-core">
          <img src="./logo.png" class="tg-beacon-logo" alt="My Location" />
        </div>
      `;

      this.userMarker = new maplibregl.Marker({ element: beaconEl, anchor: 'center' })
        .setLngLat([coords.lng, coords.lat])
        .addTo(this.map);
    }
  }

  setLanguage(lang) {
    this.lang = lang;
  }

  setPeople(people = [], maxRadius = 50, isSearching = false) {
    if (!this.map) return;
    if (!this.isLoaded) {
      this.pendingPeople = { people, maxRadius, isSearching };
      return;
    }

    // Clear old peer markers
    this.peerMarkers.forEach(marker => marker.remove());
    this.peerMarkers.clear();

    people.forEach(person => {
      if (!isSearching && person.distanceMeters > maxRadius) return;
      if (typeof person.lat !== 'number' || typeof person.lng !== 'number') return;

      const dStr = formatDistance(person.distanceMeters, this.lang || 'hy');

      const markerEl = document.createElement('div');
      markerEl.className = `tg-peer-map-marker ${person.online ? 'is-online' : ''}`;
      markerEl.dataset.id = person.id;
      markerEl.innerHTML = `
        <div class="tg-peer-avatar-wrap">
          <img src="${person.avatarUrl}" alt="${person.name}" class="tg-peer-avatar-img" />
          <span class="tg-peer-status-dot ${person.online ? 'is-online' : ''}"></span>
        </div>
        <div class="tg-peer-bubble-tag">${dStr}</div>
      `;

      markerEl.addEventListener('click', () => {
        soundManager.playTap();
        this.onSelectPerson(person);
      });

      const popup = new maplibregl.Popup({
        offset: [0, -32],
        closeButton: false,
        className: 'custom-tg-tooltip'
      }).setHTML(`
        <div class="tg-map-tooltip">
          <div class="tg-tt-name">${person.name}</div>
          <div class="tg-tt-sub">📍 ${dStr} • ${person.online ? '🟢 Առցանց' : person.lastSeen}</div>
        </div>
      `);

      const marker = new maplibregl.Marker({ element: markerEl, anchor: 'bottom' })
        .setLngLat([person.lng, person.lat])
        .setPopup(popup)
        .addTo(this.map);

      this.peerMarkers.set(person.id, marker);
    });
  }

  updateRadius(radiusMeters) {
    this.currentRadius = radiusMeters;
    if (this.map && this.isLoaded && this.map.getSource('search-radius') && this.currentCenter) {
      this.map.getSource('search-radius').setData(createGeoJsonCircle(this.currentCenter, this.currentRadius));
    }
  }

  recenter() {
    if (this.map && this.currentCenter) {
      this.map.flyTo({
        center: [this.currentCenter.lng, this.currentCenter.lat],
        zoom: 17.2,
        essential: true,
        duration: 700
      });
    }
  }

  invalidateSize() {
    if (this.map) {
      setTimeout(() => {
        this.map.resize();
      }, 100);
    }
  }
}
