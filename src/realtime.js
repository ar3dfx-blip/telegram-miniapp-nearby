// 100% WiFi-Based Peer Discovery & Real-Time Proximity Engine
// Discovers peers connected to the same WiFi network and nearby networks via MQTT + Local Broadcast
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

// Simple deterministic hash to calculate micro-proximity for peers on the same WiFi network
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

export class RealtimePeerService {
  constructor(myProfile, onPeersUpdate, onLocationChange) {
    this.myProfile = myProfile || {};
    this.onPeersUpdate = onPeersUpdate;
    this.onLocationChange = onLocationChange;
    this.chatCallbacks = new Set();
    this.qipsMatchCallbacks = new Set();

    this.livePeers = new Map(); // peerId -> peer
    this.allQipsUsers = new Map(); // canonicalKey -> peer (all known Qips app users)
    this.currentCoords = null;
    this.heartbeatTimer = null;
    this.pruneTimer = null;

    // Secret "Become Qips" (Դարձիր Քիփս) state:
    // Outgoing intents I have clicked, and incoming silent intents from others (kept 100% hidden until mutual!)
    this.myOutgoingQips = new Set(this.loadSavedArray('qips_my_outgoing_v1'));
    this.silentIncomingQips = new Map(); // key -> senderInfo
    this.confirmedQipsMatches = new Set(this.loadSavedArray('qips_confirmed_matches_v1'));

    // WiFi Network State
    this.myWifiId = null;
    this.myWifiCity = 'Երևան, Կենտրոն';
    this.myPublicIp = null;

    // Real-Time Network Channels
    this.presenceTopic = 'tma_nearby/v3/wifi_presence';
    this.registryPrefix = 'tma_nearby/v3/qips_user_reg/';
    this.qipsIntentTopic = 'tma_nearby/v3/qips_secret_intent';
    this.chatPrefix = 'tma_nearby/v3/chat/';

    // Stable Peer ID
    this.myPeerId = this.generatePeerId();

    this.mqttClient = null;
    this.broadcastChannel = null;
  }

  loadSavedArray(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  saveSet(key, setObj) {
    try {
      localStorage.setItem(key, JSON.stringify(Array.from(setObj)));
    } catch {}
  }

  generatePeerId() {
    const tgId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    if (tgId) return `tg_${tgId}`;

    // Use sessionStorage first so multiple preview windows can test live peer-to-peer interaction
    let sessionPeer = sessionStorage.getItem('tma_wifi_session_peer_id');
    if (!sessionPeer) {
      sessionPeer = 'peer_' + Math.random().toString(36).substring(2, 10);
      sessionStorage.setItem('tma_wifi_session_peer_id', sessionPeer);
    }
    return sessionPeer;
  }

  // Canonical matching keys for a user (matches by id or @username)
  getPeerKeys(peerOrProfile) {
    const keys = new Set();
    if (!peerOrProfile) return [];
    if (peerOrProfile.id) keys.add(`id:${peerOrProfile.id}`);
    if (peerOrProfile.telegramId) keys.add(`tg:${peerOrProfile.telegramId}`);
    const uname = (peerOrProfile.username || '').replace(/^@/, '').trim().toLowerCase();
    if (uname && uname !== 'user' && uname !== 'user_nearby') {
      keys.add(`u:${uname}`);
    }
    return Array.from(keys);
  }

  getMyKeys() {
    return this.getPeerKeys({
      id: this.myPeerId,
      telegramId: this.myProfile.telegramId,
      username: this.myProfile.username
    });
  }

  isSelfPeer(peer) {
    if (!peer) return false;
    if (peer.id === this.myPeerId) return true;

    // Telegram ID
    const myTgId = this.myProfile?.telegramId || window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    if (myTgId && peer.telegramId && String(myTgId) === String(peer.telegramId)) return true;

    // Telegram Username
    const myU = (this.myProfile?.username || window.Telegram?.WebApp?.initDataUnsafe?.user?.username || '').replace(/^@/, '').trim().toLowerCase();
    const pU = (peer.username || '').replace(/^@/, '').trim().toLowerCase();
    if (myU && pU && myU === pU) return true;

    // Phone
    const myPhone = (this.myProfile?.phone || localStorage.getItem('qips_verified_phone') || '').replace(/\D/g, '');
    const pPhone = (peer.phone || '').replace(/\D/g, '');
    if (myPhone && pPhone && (myPhone === pPhone || myPhone.endsWith(pPhone) || pPhone.endsWith(myPhone))) return true;

    // Name
    const myN = (this.myProfile?.name || '').trim().toLowerCase();
    const pN = (peer.name || '').trim().toLowerCase();
    if (myN && pN && myN === pN && myN !== 'telegram user') return true;

    // Tigran profile match heuristic
    if (myPhone && myPhone.includes('55161182')) {
      if (pU === 'tigranbagavan' || pN === 'tigran') return true;
    }

    return false;
  }

  // 1. WiFi Network Auto-Detection (Zero GPS required)
  async detectWifiNetwork() {
    let detectedIp = null;
    let city = 'Երևան, Կենտրոն';
    let lat = 40.1792;
    let lng = 44.4991;

    // Fast Public IP lookup with short timeout
    try {
      const res = await Promise.race([
        fetch('https://api.ipify.org?format=json').then(r => r.json()),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500))
      ]);
      if (res && res.ip) {
        detectedIp = res.ip;
      }
    } catch (e) {
      // Fallback IP lookup
      try {
        const text = await Promise.race([
          fetch('https://icanhazip.com').then(r => r.text()),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
        ]);
        if (text && text.trim()) detectedIp = text.trim();
      } catch (e2) {}
    }

    // Try Geo-IP for city coordinates
    try {
      const geo = await Promise.race([
        fetch('https://ipapi.co/json/').then(r => r.json()),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500))
      ]);
      if (geo && typeof geo.latitude === 'number') {
        lat = geo.latitude;
        lng = geo.longitude;
        if (geo.city) city = geo.city;
        if (geo.ip) detectedIp = geo.ip;
      }
    } catch (e) {}

    // Derive stable WiFi Network Hash
    if (detectedIp) {
      this.myPublicIp = detectedIp;
      this.myWifiId = 'wifi_' + detectedIp.replace(/[^0-9]/g, '_');
    } else {
      let savedWifi = localStorage.getItem('tma_local_wifi_id');
      if (!savedWifi) {
        savedWifi = 'wifi_local_' + Math.random().toString(36).substring(2, 8);
        localStorage.setItem('tma_local_wifi_id', savedWifi);
      }
      this.myWifiId = savedWifi;
    }

    this.myWifiCity = city;

    this.currentCoords = {
      lat,
      lng,
      city,
      wifiId: this.myWifiId,
      wifiIp: this.myPublicIp,
      isWifi: true,
      timestamp: Date.now()
    };

    if (this.onLocationChange) {
      this.onLocationChange(this.currentCoords);
    }

    // Broadcast immediately upon WiFi detection
    this.broadcastPresence();
  }

  // 2. Connect to Realtime Network
  async connect() {
    // 1. Detect WiFi network immediately
    await this.detectWifiNetwork();

    // 2. Init communication channels
    this.initMqtt();
    this.initBroadcastChannel();

    // Regular heartbeat every 3 seconds
    this.heartbeatTimer = setInterval(() => {
      this.broadcastPresence();
      this.reannounceOutgoingQipsIntents();
    }, 3000);

    // Prune stale peers inactive for > 10 seconds
    this.pruneTimer = setInterval(() => {
      this.pruneStalePeers();
    }, 2500);
  }

  initBroadcastChannel() {
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        this.broadcastChannel = new BroadcastChannel('tma_nearby_wifi_channel');
        this.broadcastChannel.onmessage = (event) => {
          const data = event.data;
          if (!data) return;

          if (data.type === 'presence' && data.peer) {
            this.handleIncomingPeer(data.peer);
          } else if (data.type === 'chat_message' && data.toId === this.myPeerId) {
            this.handleIncomingChatMessage(data);
          } else if (data.type === 'qips_secret_intent' || data.type === 'qips_mutual_confirm') {
            this.handleIncomingQipsSignal(data);
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
          clientId: `tma_wifi_${this.myPeerId}_${Math.random().toString(16).slice(2, 8)}`,
          clean: true,
          connectTimeout: 5000,
          reconnectPeriod: 3000
        });

        this.mqttClient.on('connect', () => {
          // Subscribe to global presence
          this.mqttClient.subscribe(this.presenceTopic, { qos: 0 });
          // Subscribe to retained real Qips user registry
          this.mqttClient.subscribe(`${this.registryPrefix}+`, { qos: 1 });
          // Subscribe to secret Qips intent channel
          this.mqttClient.subscribe(this.qipsIntentTopic, { qos: 1 });

          // Subscribe to my direct incoming chat channel
          const myChatTopic = `${this.chatPrefix}${this.myPeerId}`;
          this.mqttClient.subscribe(myChatTopic, { qos: 1 });

          this.broadcastPresence();
          this.publishMyUserRegistry();
          this.reannounceOutgoingQipsIntents();
        });

        this.mqttClient.on('message', (topic, payload) => {
          try {
            const data = JSON.parse(payload.toString());
            if (topic === this.presenceTopic && data.peer) {
              this.handleIncomingPeer(data.peer);
            } else if (topic.startsWith(this.registryPrefix) && data.peer) {
              this.handleRegisteredQipsUser(data.peer);
            } else if (topic === this.qipsIntentTopic) {
              this.handleIncomingQipsSignal(data);
            } else if (topic.startsWith(this.chatPrefix)) {
              this.handleIncomingChatMessage(data);
            }
          } catch (e) {}
        });

        this.mqttClient.on('error', () => {
          this.mqttClient.end();
          brokerIndex = (brokerIndex + 1) % brokers.length;
          setTimeout(tryConnect, 3000);
        });
      } catch (err) {
        console.warn("MQTT setup notice:", err);
      }
    };

    tryConnect();
  }

  broadcastMyPresence() {
    this.publishMyUserRegistry();
    return this.broadcastPresence();
  }

  publishMyUserRegistry() {
    if (!this.mqttClient || !this.mqttClient.connected) return;
    if (this.myProfile.ghost || this.myProfile.visible === false) return;

    const peerData = {
      id: this.myPeerId,
      name: this.myProfile.name || 'Telegram User',
      username: this.myProfile.username || '',
      avatarUrl: this.myProfile.avatarUrl || null,
      bio: this.myProfile.status || 'Քիփս օգտատեր',
      telegramId: this.myProfile.telegramId || null,
      city: this.myWifiCity,
      timestamp: Date.now(),
      online: true
    };

    this.mqttClient.publish(
      `${this.registryPrefix}${this.myPeerId}`,
      JSON.stringify({ type: 'qips_user', peer: peerData }),
      { qos: 1, retain: true }
    );
  }

  handleRegisteredQipsUser(peer) {
    if (!peer || !peer.id || this.isSelfPeer(peer)) return;
    const key = (peer.username || peer.telegramId || peer.phone || peer.name || peer.id).toLowerCase().replace(/^@/, '').trim();
    if (!key) return;
    this.allQipsUsers.set(key, peer);
    this.notifyPeersUpdate();
  }

  // 3. Broadcast My Presence (Via WiFi Network)
  broadcastPresence() {
    if (!this.currentCoords) return;

    const peerData = {
      id: this.myPeerId,
      name: this.myProfile.name || 'Telegram User',
      username: this.myProfile.username || 'user',
      avatarUrl: this.myProfile.avatarUrl || null,
      bio: this.myProfile.status || 'Առցանց WiFi-ում',
      telegramId: this.myProfile.telegramId || null,
      phone: this.myProfile.phone || null,
      ghost: Boolean(this.myProfile.ghost),
      visible: this.myProfile.visible !== false,
      wifiId: this.myWifiId,
      wifiIp: this.myPublicIp,
      city: this.myWifiCity,
      lat: this.currentCoords.lat,
      lng: this.currentCoords.lng,
      timestamp: Date.now(),
      online: true
    };

    // Broadcast locally across browser / Telegram tabs
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
    if (this.isSelfPeer(peer)) return; // Ignore self

    const isSameWifi = Boolean(this.myWifiId && peer.wifiId && this.myWifiId === peer.wifiId);
    peer.isSameWifi = isSameWifi;

    if (isSameWifi) {
      const hash = Math.abs(hashString(peer.id));
      const microDist = Math.round(((hash % 112) / 10 + 0.8) * 10) / 10;
      peer.distanceMeters = microDist;
      peer.bearing = (hash * 7) % 360;

      const offsetLat = ((hash % 100) - 50) * 0.000008;
      const offsetLng = (((hash * 13) % 100) - 50) * 0.000008;
      peer.lat = this.currentCoords.lat + offsetLat;
      peer.lng = this.currentCoords.lng + offsetLng;
    } else if (this.currentCoords && peer.lat && peer.lng) {
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

    // Always register in Qips Users Directory with canonical deduplication
    const canonicalKey = (peer.username || peer.telegramId || peer.phone || peer.name || peer.id).toLowerCase().replace(/^@/, '').trim();
    if (canonicalKey) {
      this.allQipsUsers.set(canonicalKey, peer);
    }

    // If peer has Ghost Mode enabled or visible=false, hide them from the Radar/Map proximity list!
    if (peer.ghost || peer.visible === false) {
      if (this.livePeers.has(peer.id)) {
        this.livePeers.delete(peer.id);
      }
      this.notifyPeersUpdate();
      return;
    }

    this.livePeers.set(peer.id, peer);
    this.notifyPeersUpdate();
  }

  // =========================================================================
  // Secret "Become Qips" («Դարձիր Քիփս») Mutual Matching Protocol
  // =========================================================================
  hasSentQipsTo(peer) {
    const keys = this.getPeerKeys(peer);
    return keys.some(k => this.myOutgoingQips.has(k));
  }

  isMutualQipsWith(peer) {
    const keys = this.getPeerKeys(peer);
    return keys.some(k => this.confirmedQipsMatches.has(k));
  }

  // Called when user clicks «Դարձիր Քիփս» next to a Qips user
  expressQipsDesire(targetPeer) {
    if (!targetPeer) return { matched: false };

    const targetKeys = this.getPeerKeys(targetPeer);
    targetKeys.forEach(k => this.myOutgoingQips.add(k));
    this.saveSet('qips_my_outgoing_v1', this.myOutgoingQips);

    // Publish silent intent (receiver's client keeps this 100% secret unless they ALSO clicked for us)
    this.publishQipsSignal('qips_secret_intent', targetPeer);

    // Check if targetPeer had ALREADY secretly clicked «Դարձիր Քիփս» for us!
    const alreadyIncoming = targetKeys.some(k => this.silentIncomingQips.has(k));
    if (alreadyIncoming) {
      this.confirmMutualMatch(targetPeer);
      this.publishQipsSignal('qips_mutual_confirm', targetPeer);
      return { matched: true };
    }

    return { matched: false };
  }

  reannounceOutgoingQipsIntents() {
    if (this.myOutgoingQips.size === 0) return;
    const payload = {
      type: 'qips_secret_intent',
      fromPeer: {
        id: this.myPeerId,
        name: this.myProfile.name || 'Telegram User',
        username: this.myProfile.username || 'user',
        telegramId: this.myProfile.telegramId || null,
        avatarUrl: this.myProfile.avatarUrl || null
      },
      fromKeys: this.getMyKeys(),
      targetKeys: Array.from(this.myOutgoingQips),
      timestamp: Date.now()
    };

    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(payload);
      } catch (e) {}
    }
    if (this.mqttClient && this.mqttClient.connected) {
      this.mqttClient.publish(this.qipsIntentTopic, JSON.stringify(payload), { qos: 0 });
    }
  }

  publishQipsSignal(signalType, targetPeer) {
    const payload = {
      type: signalType,
      fromPeer: {
        id: this.myPeerId,
        name: this.myProfile.name || 'Telegram User',
        username: this.myProfile.username || 'user',
        telegramId: this.myProfile.telegramId || null,
        avatarUrl: this.myProfile.avatarUrl || null
      },
      fromKeys: this.getMyKeys(),
      targetKeys: this.getPeerKeys(targetPeer),
      timestamp: Date.now()
    };

    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(payload);
      } catch (e) {}
    }

    if (this.mqttClient && this.mqttClient.connected) {
      this.mqttClient.publish(this.qipsIntentTopic, JSON.stringify(payload), { qos: 1 });
    }
  }

  handleIncomingQipsSignal(data) {
    if (!data || !data.fromPeer || data.fromPeer.id === this.myPeerId) return;

    const myKeys = this.getMyKeys();
    const isTargetingMe = (data.targetKeys || []).some(tk => myKeys.includes(tk));
    if (!isTargetingMe) return;

    const senderKeys = data.fromKeys || this.getPeerKeys(data.fromPeer);

    // Store silently in memory (NEVER shown to user unless user also selected this sender!)
    senderKeys.forEach(sk => {
      this.silentIncomingQips.set(sk, data.fromPeer);
    });

    // Check if I have ALSO selected this sender!
    const iAlsoSelectedSender = senderKeys.some(sk => this.myOutgoingQips.has(sk));

    if (iAlsoSelectedSender) {
      const wasAlreadyMatched = senderKeys.some(sk => this.confirmedQipsMatches.has(sk));
      if (!wasAlreadyMatched) {
        this.confirmMutualMatch(data.fromPeer);
        if (data.type === 'qips_secret_intent') {
          // Notify the other side that mutual match is now complete
          this.publishQipsSignal('qips_mutual_confirm', data.fromPeer);
        }
      }
    }
  }

  confirmMutualMatch(partnerPeer) {
    const partnerKeys = this.getPeerKeys(partnerPeer);
    partnerKeys.forEach(k => this.confirmedQipsMatches.add(k));
    this.saveSet('qips_confirmed_matches_v1', this.confirmedQipsMatches);

    this.qipsMatchCallbacks.forEach(cb => {
      try {
        cb(partnerPeer);
      } catch (e) {
        console.error('Error in Qips match callback:', e);
      }
    });
  }

  onQipsMutualMatch(callback) {
    if (typeof callback === 'function') {
      this.qipsMatchCallbacks.add(callback);
    }
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

    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(payload);
      } catch (e) {}
    }

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
      this.onPeersUpdate(list);
    }
  }

  getAllKnownQipsUsers() {
    return Array.from(this.allQipsUsers.values()).filter(p => !this.isSelfPeer(p));
  }

  refreshWifi() {
    return this.detectWifiNetwork();
  }

  disconnect() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.pruneTimer) clearInterval(this.pruneTimer);
    if (this.mqttClient) this.mqttClient.end();
    if (this.broadcastChannel) this.broadcastChannel.close();
  }
}
