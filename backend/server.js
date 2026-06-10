const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const mpdClient = require('./services/mpdService');
const dspClient = require('./dspClient');
const metadataService = require('./services/metadataService');
const apiRoutes = require('./routes/api');
const enforceLocalNetwork = require('./middlewares/localNetwork');

const app = express();

// Required so that rate-limiting accurately resolves IPs behind Nginx reverse proxy
app.set('trust proxy', 1);

// Enforce local network access (blocks requests coming from public WAN IPs)
app.use(enforceLocalNetwork);

// Connect to local MPD daemon
mpdClient.connect();
mpdClient.onMetadataChange = (payload) => {
  metadataService.updateState(payload);
};

// Connect to CamillaDSP Engine for real-time VU Meters
dspClient.connect();

// Security Middlewares
app.use(helmet()); // Sets HTTP headers to protect against common vulnerabilities
app.use(cors());
app.use(express.json({ limit: '1mb' })); // Limit body size to prevent DoS

// Rate Limiting to prevent API spam (100 requests per 15 minutes per IP)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, error: 'Too many requests, please try again later.' }
});
app.use('/api', limiter);

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

// WebSocket broadcasting
const broadcastState = (stateObj) => {
  const payload = JSON.stringify({ type: 'state_update', payload: stateObj });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
};

// Tell Metadata service to use our broadcast function
metadataService.setBroadcastCallback(broadcastState);

wss.on('connection', (ws) => {
  console.log('Client connected to WebSocket');
  ws.send(JSON.stringify({ type: 'state_update', payload: metadataService.getState() }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'action') {
        const { action, value } = data.payload;
        const currentState = metadataService.getState();

        // Handle MPD specific logic
        if (currentState.source === 'mpd') {
            if (action === 'play') mpdClient.play();
            if (action === 'pause') mpdClient.pause();
            if (action === 'next') mpdClient.next();
            if (action === 'previous') mpdClient.previous();
            if (action === 'volume') mpdClient.setVolume(value);
            if (action === 'shuffle') mpdClient.toggleShuffle(value);
            if (action === 'repeat') mpdClient.toggleRepeat(value);
        }

        // We update the local state optimistically, the services might overwrite later
        metadataService.updateState({
           status: action === 'play' ? 'playing' : action === 'pause' ? 'paused' : currentState.status,
           volume: action === 'volume' ? value : currentState.volume,
           source: action === 'source' ? value : currentState.source,
           shuffle: action === 'shuffle' ? value : currentState.shuffle,
           repeat: action === 'repeat' ? value : currentState.repeat
        });
      }
    } catch (e) {
      console.error('Error parsing WS message:', e);
    }
  });
});

// REST API
app.get('/api/state', (req, res) => {
  res.json(metadataService.getState());
});

app.post('/api/action', (req, res) => {
  const { action, value } = req.body;
  const currentState = metadataService.getState();

  if (currentState.source === 'mpd') {
    if (action === 'play') mpdClient.play();
    if (action === 'pause') mpdClient.pause();
    if (action === 'next') mpdClient.next();
    if (action === 'previous') mpdClient.previous();
    if (action === 'volume') mpdClient.setVolume(value);
  }

  metadataService.updateState({
     status: action === 'play' ? 'playing' : action === 'pause' ? 'paused' : currentState.status,
     volume: action === 'volume' ? value : currentState.volume,
     source: action === 'source' ? value : currentState.source
  });

  res.json({ success: true, state: metadataService.getState() });
});

// Register the API router module
app.use('/api', apiRoutes);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Hi-Fi Streamer Backend running on port ${PORT}`);
});
