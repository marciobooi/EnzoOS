import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import updateRouter from './update.js';
import spotifyAuthRouter from './spotify-auth.js';
import playerRouter from './player.js';
import spotifyDaemonRouter from './spotify-daemon.js';
import { setupWebSocket, loadCachedStateFromDB } from './websocket.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Serve static assets from Vite's production build folder
app.use(express.static(path.join(__dirname, '../dist')));

// System OTA Update Router API Integration
app.use('/api/system/update', updateRouter);

// Spotify OAuth routes
app.use('/auth/spotify', spotifyAuthRouter);

// Local player control routes
app.use('/api/player', playerRouter);

// Spotify Connect daemon configuration routes
app.use('/api/spotify', spotifyDaemonRouter);

// Restrict /remote route to devices on the same local network
app.get('/remote', (req, res, next) => {
  next();
});

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

// Setup WebSocket server
setupWebSocket(server, app);

// Load previous state
loadCachedStateFromDB();

server.listen(PORT, () => {
  console.log(`[Resonance Backend] Server listening on http://localhost:${PORT}`);
});
