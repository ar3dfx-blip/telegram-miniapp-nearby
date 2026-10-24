// Real-Time Peer Discovery & Live Geolocation Engine (Zero Mock Profiles)
// Uses Real GPS + Cloud Realtime Pub/Sub + WebSockets for Live Multi-User Discovery

export function calculateHaversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function calculateBearing(lat1, lon1, lat2, lon2) {
  const y = Math.sin((lon2 - lon1) * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
            Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos((lon2 - lon1) * Math.PI / 180);
  const brng = Math.atan2(y, x) * 180 / Math.PI;
  return (brng + 360) % 360;
}

export class RealtimePeerService {
  constructor(myProfile, onPeersUpdate, onLocationChange) {
    this.myProfile = myProfile;
    this.onPeersUpdate = onPeersUpdate;
    this.onLocationChange = onLocationChange;

    this.livePeers = new Map(); // peerId -> peer object
    this.ws = null;
    this.gpsWatchId = null;
    this.currentCoords = null;
    this.heartbeatInterval = null;
    this.pruneInterval = null;
    this.broadcastChannel = null;

    // Public multi-user discovery channel for Telegram Mini App
    this.channelTopic = 'tma-nearby-live-real-network-v1';
    this.wsUrl = `wss://ntfy.sh/${this.channelTopic}/ws`;
    this.pubUrl = `https://ntfy.sh/${this.channelTopic}`;

    // Unique session ID for current user
    this.myPeerId = this.generatePeerId();
  }

  generatePeerId() {
    const tgId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    if (tgId) return `tg_${tgId}`;
    let saved = localStorage.getItem('tma_real_peer_id');
    if (!saved) {
      saved = 'peer_' + Math.random().toString(36).substring(2, 10);
      localStorage.setItem('tma_real_peer_id', saved);
    }
    return saved;
  }

  // 1. Initialize Real GPS Tracking
  startLocationTracking() {
    if (!navigator.geolocation) {
      console.warn("Geolocation is not supported by this browser.");
      return;
    }

    const onPos = (position) => {
      const { latitude, longitude, accuracy } = position.coords;
      this.currentCoords = {
        lat: latitude,
        lng: longitude,
        accuracy: accuracy || 5,
        timestamp: Date.now()
      };

      if (this.onLocationChange) {
        this.onLocationChange(this.currentCoords);
      }

      // Broadcast my real position to other nearby peers
      this.broadcastMyPresence();
    };

    const onErr = (err) => {
      console.warn("GPS Location error:", err.message);
    };

    // Immediate fix
    navigator.geolocation.getCurrentPosition(onPos, onErr, {
      enableHighAccuracy: true,
      maximumAge: 3000,
      timeout: 12000
    });

    // Continuous watch
    this.gpsWatchId = navigator.geolocation.watchPosition(onPos, onErr, {
      enableHighAccuracy: true,
      maximumAge: 2000,
      timeout: 10000
    });
  }

  // 2. Start Realtime Cloud WebSocket & Local Channel
  connect() {
    this.startLocationTracking();
    this.initWebSocket();
    this.initBroadcastChannel();

    // Heartbeat every 4 seconds to announce real presence
    this.heartbeatInterval = setInterval(() => {
      this.broadcastMyPresence();
    }, 4000);

    // Prune stale peers who haven't updated in 12 seconds
    this.pruneInterval = setInterval(() => {
      this.pruneStalePeers();
    }, 3000);
  }

  initBroadcastChannel() {
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        this.broadcastChannel = new BroadcastChannel('tma_nearby_real_peers');
        this.broadcastChannel.onmessage = (event) => {
          if (event.data && event.data.peer) {
            this.handleIncomingPeer(event.data.peer);
          }
        };
      }
    } catch (e) {
      console.warn("BroadcastChannel error:", e);
    }
  }

  initWebSocket() {
    try {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = () => {
        console.log("🟢 Connected to Realtime Cloud Peer Network!");
        this.broadcastMyPresence();
      };

      this.ws.onmessage = (evt) => {
        try {
          const packet = JSON.parse(evt.data);
          if (packet.event === 'message' && packet.message) {
            const data = typeof packet.message === 'string' ? JSON.parse(packet.message) : packet.message;
            if (data && data.type === 'peer_presence' && data.peer) {
              this.handleIncomingPeer(data.peer);
            }
          }
        } catch (e) {
          // Ignore non-json packets
        }
      };

      this.ws.onerror = (e) => {
        console.warn("Realtime WebSocket notice:", e);
      };

      this.ws.onclose = () => {
        // Auto-reconnect after 3 seconds
        setTimeout(() => this.initWebSocket(), 3000);
      };
    } catch (err) {
      console.warn("Failed to connect to realtime WS:", err);
    }
  }

  // Broadcast real user profile and real GPS coordinates
  broadcastMyPresence() {
    if (!this.currentCoords) return;

    const payload = {
      id: this.myPeerId,
      name: this.myProfile.name || 'Telegram User',
      username: this.myProfile.username || 'user',
      avatarUrl: this.myProfile.avatarUrl || null,
      status: this.myProfile.status || 'Օնլայն',
      lat: this.currentCoords.lat,
      lng: this.currentCoords.lng,
      lastSeen: Date.now(),
      online: true,
      interests: this.myProfile.interests || []
    };

    // 1. Post to local BroadcastChannel (cross-tab/cross-window)
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({ peer: payload });
      } catch (e) {}
    }

    // 2. Publish to cloud Pub/Sub for other remote devices
    fetch(this.pubUrl, {
      method: 'POST',
      body: JSON.stringify({
        type: 'peer_presence',
        peer: payload
      }),
      headers: {
        'Content-Type': 'application/json'
      }
    }).catch(() => {});
  }

  handleIncomingPeer(peer) {
    if (!peer || !peer.id) return;
    if (peer.id === this.myPeerId) return; // Do not add self as nearby peer

    if (this.currentCoords && peer.lat && peer.lng) {
      peer.distanceMeters = calculateHaversineMeters(
        this.currentCoords.lat,
        this.currentCoords.lng,
        peer.lat,
        peer.lng
      );
      peer.bearing = calculateBearing(
        this.currentCoords.lat,
        this.currentCoords.lng,
        peer.lat,
        peer.lng
      );
    } else {
      peer.distanceMeters = 9999;
      peer.bearing = 0;
    }

    peer.receivedAt = Date.now();
    this.livePeers.set(peer.id, peer);
    this.notifyPeersUpdate();
  }

  pruneStalePeers() {
    const now = Date.now();
    let changed = false;

    this.livePeers.forEach((peer, id) => {
      // Disconnect if no message received in 12s
      if (now - peer.receivedAt > 12000) {
        this.livePeers.delete(id);
        changed = true;
      }
    });

    if (changed) {
      this.notifyPeersUpdate();
    }
  }

  notifyPeersUpdate() {
    if (this.onPeersUpdate) {
      const list = Array.from(this.livePeers.values());
      // Re-calculate distances and bearings if current coords available
      if (this.currentCoords) {
        list.forEach(p => {
          p.distanceMeters = calculateHaversineMeters(
            this.currentCoords.lat,
            this.currentCoords.lng,
            p.lat,
            p.lng
          );
          p.bearing = calculateBearing(
            this.currentCoords.lat,
            this.currentCoords.lng,
            p.lat,
            p.lng
          );
        });
      }
      this.onPeersUpdate(list);
    }
  }

  disconnect() {
    if (this.gpsWatchId) {
      navigator.geolocation.clearWatch(this.gpsWatchId);
    }
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.pruneInterval) clearInterval(this.pruneInterval);
    if (this.ws) this.ws.close();
    if (this.broadcastChannel) this.broadcastChannel.close();
  }
}
