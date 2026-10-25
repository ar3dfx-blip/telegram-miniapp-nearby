// 100% Real Peer Discovery & Live Geolocation Engine
// Uses Real Device GPS + Global Real-Time MQTT Network + Local Broadcast Channel
import mqtt from 'mqtt';

export function calculateHaversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
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
    this.myProfile = myProfile || {};
    this.onPeersUpdate = onPeersUpdate;
    this.onLocationChange = onLocationChange;
    this.chatCallbacks = new Set();

    this.livePeers = new Map(); // peerId -> peer
    this.currentCoords = null;
    this.gpsWatchId = null;
    this.heartbeatTimer = null;
    this.pruneTimer = null;

    // Real-Time Network Channels
    this.presenceTopic = 'tma_nearby/v3/presence';
    this.chatPrefix = 'tma_nearby/v3/chat/';

    // Generate stable unique Peer ID for this session/device
    this.myPeerId = this.generatePeerId();

    this.mqttClient = null;
    this.broadcastChannel = null;
  }

  generatePeerId() {
    // If running in Telegram, use Telegram User ID
    const tgId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    if (tgId) return `tg_${tgId}`;

    let saved = localStorage.getItem('tma_real_peer_id');
    if (!saved) {
      saved = 'real_' + Math.random().toString(36).substring(2, 10);
      localStorage.setItem('tma_real_peer_id', saved);
    }
    return saved;
  }

  // 1. Real Device GPS Tracking
  startLocationTracking() {
    const onPos = (position) => {
      const { latitude, longitude, accuracy } = position.coords;
      this.currentCoords = {
        lat: latitude,
        lng: longitude,
        accuracy: accuracy ? Math.round(accuracy) : 5,
        timestamp: Date.now()
      };

      if (this.onLocationChange) {
        this.onLocationChange(this.currentCoords);
      }

      // Broadcast real position immediately
      this.broadcastPresence();
    };

    const onErr = (err) => {
      console.warn("GPS Tracking notice:", err.message);
      if (this.onLocationChange && !this.currentCoords) {
        this.onLocationChange({ error: true, code: err.code, message: err.message });
      }
    };

    // Try Telegram WebApp LocationManager if available
    try {
      const tg = window.Telegram?.WebApp;
      if (tg?.LocationManager) {
        tg.LocationManager.init(() => {
          tg.LocationManager.getLocation((data) => {
            if (data && typeof data.latitude === 'number' && typeof data.longitude === 'number') {
              onPos({
                coords: {
                  latitude: data.latitude,
                  longitude: data.longitude,
                  accuracy: 5
                }
              });
            }
          });
        });
      }
    } catch (e) {
      console.warn("Telegram LocationManager notice:", e);
    }

    if (navigator.geolocation) {
      if (this.gpsWatchId) {
        navigator.geolocation.clearWatch(this.gpsWatchId);
      }

      navigator.geolocation.getCurrentPosition(onPos, onErr, {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000
      });

      this.gpsWatchId = navigator.geolocation.watchPosition(onPos, onErr, {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000
      });
    }
  }

  // 2. Connect to Realtime Network
  connect() {
    this.startLocationTracking();
    this.initMqtt();
    this.initBroadcastChannel();

    // Regular heartbeat every 3 seconds
    this.heartbeatTimer = setInterval(() => {
      this.broadcastPresence();
    }, 3000);

    // Prune peers inactive for > 10 seconds
    this.pruneTimer = setInterval(() => {
      this.pruneStalePeers();
    }, 2500);
  }

  initBroadcastChannel() {
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        this.broadcastChannel = new BroadcastChannel('tma_nearby_real_channel');
        this.broadcastChannel.onmessage = (event) => {
          const data = event.data;
          if (!data) return;

          if (data.type === 'presence' && data.peer) {
            this.handleIncomingPeer(data.peer);
          } else if (data.type === 'chat_message' && data.toId === this.myPeerId) {
            this.handleIncomingChatMessage(data);
          }
        };
      }
    } catch (e) {
      console.warn("BroadcastChannel notice:", e);
    }
  }

  initMqtt() {
    const brokers = [
      'wss://broker.emqx.io:8084/mqtt',
      'wss://broker.hivemq.com:8884/mqtt'
    ];
    let brokerIndex = 0;

    const tryConnect = () => {
      const url = brokers[brokerIndex];
      try {
        this.mqttClient = mqtt.connect(url, {
          clientId: `tma_${this.myPeerId}_${Math.random().toString(16).slice(2, 8)}`,
          clean: true,
          connectTimeout: 5000,
          reconnectPeriod: 3000
        });

        this.mqttClient.on('connect', () => {
          console.log(`🌐 Realtime MQTT connected to ${url}`);

          // Subscribe to presence
          this.mqttClient.subscribe(this.presenceTopic, { qos: 0 });

          // Subscribe to my direct incoming chat channel
          const myChatTopic = `${this.chatPrefix}${this.myPeerId}`;
          this.mqttClient.subscribe(myChatTopic, { qos: 1 });

          this.broadcastPresence();
        });

        this.mqttClient.on('message', (topic, payload) => {
          try {
            const data = JSON.parse(payload.toString());
            if (topic === this.presenceTopic && data.peer) {
              this.handleIncomingPeer(data.peer);
            } else if (topic.startsWith(this.chatPrefix)) {
              this.handleIncomingChatMessage(data);
            }
          } catch (e) {}
        });

        this.mqttClient.on('error', (err) => {
          console.warn(`MQTT connection notice on ${url}:`, err.message);
          this.mqttClient.end();
          brokerIndex = (brokerIndex + 1) % brokers.length;
          setTimeout(tryConnect, 3000);
        });
      } catch (err) {
        console.warn("MQTT setup error:", err);
      }
    };

    tryConnect();
  }

  // 3. Broadcast My Presence
  broadcastPresence() {
    if (!this.currentCoords) return;

    const peerData = {
      id: this.myPeerId,
      name: this.myProfile.name || 'Telegram User',
      username: this.myProfile.username || 'user',
      avatarUrl: this.myProfile.avatarUrl || null,
      bio: this.myProfile.status || 'Օնլայն Telegram-ում',
      lat: this.currentCoords.lat,
      lng: this.currentCoords.lng,
      accuracy: this.currentCoords.accuracy || 5,
      timestamp: Date.now(),
      online: true
    };

    // Broadcast locally across browser tabs
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({ type: 'presence', peer: peerData });
      } catch (e) {}
    }

    // Broadcast globally via MQTT
    if (this.mqttClient && this.mqttClient.connected) {
      this.mqttClient.publish(
        this.presenceTopic,
        JSON.stringify({ type: 'presence', peer: peerData }),
        { qos: 0 }
      );
    }
  }

  handleIncomingPeer(peer) {
    if (!peer || !peer.id) return;
    if (peer.id === this.myPeerId) return; // Do not include self in nearby peer list

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

    peer.lastSeenAt = Date.now();
    this.livePeers.set(peer.id, peer);
    this.notifyPeersUpdate();
  }

  // 4. Send & Receive Real Chat Messages
  sendChatMessage(targetId, text) {
    if (!targetId || !text || !text.trim()) return;

    const payload = {
      type: 'chat_message',
      fromId: this.myPeerId,
      fromName: this.myProfile.name || 'Telegram User',
      fromUsername: this.myProfile.username || 'user',
      toId: targetId,
      text: text.trim(),
      timestamp: Date.now()
    };

    // 1. Broadcast locally
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(payload);
      } catch (e) {}
    }

    // 2. Send via MQTT to target's direct topic
    if (this.mqttClient && this.mqttClient.connected) {
      const targetTopic = `${this.chatPrefix}${targetId}`;
      this.mqttClient.publish(targetTopic, JSON.stringify(payload), { qos: 1 });
    }
  }

  onChatMessage(callback) {
    if (typeof callback === 'function') {
      this.chatCallbacks.add(callback);
    }
  }

  handleIncomingChatMessage(msg) {
    this.chatCallbacks.forEach(cb => {
      try {
        cb(msg);
      } catch (e) {
        console.error("Error in chat callback:", e);
      }
    });
  }

  pruneStalePeers() {
    const now = Date.now();
    let removed = false;

    this.livePeers.forEach((peer, id) => {
      // If no heartbeat for > 10 seconds, remove from active radar
      if (now - (peer.lastSeenAt || 0) > 10000) {
        this.livePeers.delete(id);
        removed = true;
      }
    });

    if (removed) {
      this.notifyPeersUpdate();
    }
  }

  notifyPeersUpdate() {
    if (this.onPeersUpdate) {
      const list = Array.from(this.livePeers.values());
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
    if (this.gpsWatchId) navigator.geolocation.clearWatch(this.gpsWatchId);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.pruneTimer) clearInterval(this.pruneTimer);
    if (this.mqttClient) this.mqttClient.end();
    if (this.broadcastChannel) this.broadcastChannel.close();
  }
}
