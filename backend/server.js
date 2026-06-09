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

const app = express();

// Required so that rate-limiting accurately resolves IPs behind Nginx reverse proxy
app.set('trust proxy', 1);

// Connect to local MPD daemon
mpdClient.connect();
mpdClient.onMetadataChange = (payload) => {
  metadataService.updateState(payload);
};

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

// Simulate VU meters change based on CamillaDSP (mocked here for now)
setInterval(() => {
  const state = metadataService.getState();
  if (state.status === 'playing' || state.status === 'play') {
    metadataService.updateState({
      vuMeters: {
        left: Math.random() * -20,
        right: Math.random() * -20
      }
    });
  }
}, 100);

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
        }

        // We update the local state optimistically, the services might overwrite later
        metadataService.updateState({
           status: action === 'play' ? 'playing' : action === 'pause' ? 'paused' : currentState.status,
           volume: action === 'volume' ? value : currentState.volume,
           source: action === 'source' ? value : currentState.source
        });
      }
    } catch (e) {
      console.error('Error parsing WS message:', e);
    }
  });
});

// REST API
app.get('/api/state', (req, res) => {
  res.json(systemState);
});

app.post('/api/action', (req, res) => {
  const { action, value } = req.body;
  if (action === 'play') systemState.status = 'playing';
  if (action === 'pause') systemState.status = 'paused';
  if (action === 'volume') systemState.volume = value;
  if (action === 'source') systemState.source = value;

  broadcastState();
  res.json({ success: true, state: systemState });
});

// Register the API router module
app.use('/api', apiRoutes);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Hi-Fi Streamer Backend running on port ${PORT}`);
});
