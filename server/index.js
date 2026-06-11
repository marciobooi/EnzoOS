import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Serve static assets from Vite's production build folder
app.use(express.static(path.join(__dirname, '../dist')));

// Fallback all non-API requests to index.html for Single Page App client routing
app.use((req, res, next) => {
  if (req.method === 'GET') {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  } else {
    next();
  }
});

// Create HTTP server wrapping Express
const server = http.createServer(app);

// Initialize WebSocket server
const wss = new WebSocketServer({ noServer: true });

let cachedPlaybackState = null;

// Helper to broadcast messages to all connected WS clients
const broadcast = (data, excludeWs = null) => {
  const message = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && client !== excludeWs) {
      client.send(message);
    }
  });
};

wss.on('connection', (ws) => {
  console.log('[Resonance WS] Client connected. Active clients:', wss.clients.size);
  
  // Send last cached playback state on connect
  if (cachedPlaybackState) {
    ws.send(JSON.stringify({ type: 'PLAYBACK_STATE', payload: cachedPlaybackState }));
  }

  ws.on('message', (messageStr) => {
    try {
      const { type, payload } = JSON.parse(messageStr);
      
      if (type === 'BROADCAST_STATE') {
        cachedPlaybackState = payload;
        // Broadcast new state to all OTHER clients
        broadcast({ type: 'PLAYBACK_STATE', payload }, ws);
      }
    } catch (err) {
      console.error('[Resonance WS] Failed parsing client message:', err);
    }
  });

  ws.on('close', () => {
    console.log('[Resonance WS] Client disconnected. Active clients:', wss.clients.size);
  });
});

// Upgrade HTTP connection to WebSocket on /ws path
server.on('upgrade', (request, socket, head) => {
  const { pathname } = new URL(request.url, `http://${request.headers.host}`);

  if (pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`[Resonance Backend] Server listening on http://localhost:${PORT}`);
});
