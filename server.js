// Backend Server: Express & WebSocket Coordinator for Real-Time Peer Discovery & Chat
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

// In-memory connected peers
// peerId -> { ws, id, name, username, lat, lng, status, interests, online: true }
const connectedPeers = new Map();

app.use(express.json());
// Serve static frontend assets from dist (if built)
app.use(express.static(path.join(__dirname, 'dist')));

// Health & Status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    app: 'Telegram Mini App - Qips (Քիփս)',
    activePeersCount: connectedPeers.size,
    timestamp: new Date().toISOString()
  });
});

// REST endpoint to get active live peers
app.get('/api/peers', (req, res) => {
  const peersList = [];
  connectedPeers.forEach((val, id) => {
    peersList.push({
      id: val.id,
      name: val.name,
      username: val.username,
      lat: val.lat,
      lng: val.lng,
      status: val.status,
      online: true
    });
  });
  res.json({ peers: peersList });
});

// Real-Time WebSocket Connection Handling
wss.on('connection', (ws) => {
  let currentPeerId = null;

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      // 1. Peer Announce / Location Update
      if (msg.type === 'announce' || msg.type === 'update_location') {
        currentPeerId = msg.peer.id;
        connectedPeers.set(currentPeerId, {
          ws,
          ...msg.peer,
          lastSeen: Date.now()
        });

        // Broadcast new peer list to all other connected clients
        broadcastPeersList();
      }

      // 2. Peer-to-Peer Chat Message
      if (msg.type === 'chat_message') {
        const target = connectedPeers.get(msg.targetId);
        if (target && target.ws.readyState === WebSocket.OPEN) {
          target.ws.send(JSON.stringify({
            type: 'chat_message',
            fromId: currentPeerId,
            text: msg.text,
            time: new Date().toISOString()
          }));
        }
      }
    } catch (e) {
      console.error('Error handling WebSocket message:', e);
    }
  });

  ws.on('close', () => {
    if (currentPeerId) {
      connectedPeers.delete(currentPeerId);
      broadcastPeersList();
    }
  });
});

function broadcastPeersList() {
  const payload = JSON.stringify({
    type: 'peers_update',
    peers: Array.from(connectedPeers.values()).map(p => ({
      id: p.id,
      name: p.name,
      username: p.username,
      lat: p.lat,
      lng: p.lng,
      status: p.status
    }))
  });

  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// Fallback to SPA index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'), (err) => {
    if (err) {
      res.send(`
        <html>
          <body style="font-family: sans-serif; background:#0b141d; color:#fff; padding:30px; text-align:center;">
            <h2>Telegram Mini App Server is Running! 🚀</h2>
            <p>Run <code>npm run dev</code> for local frontend development or <code>npm run build</code> to produce production assets.</p>
          </body>
        </html>
      `);
    }
  });
});

server.listen(PORT, () => {
  console.log(`🌐 Server listening on http://localhost:${PORT}`);
});
