const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const mpdClient = require('./mpdClient');
const dspClient = require('./dspClient');
const apiRoutes = require('./routes/api');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

// In-memory state for mock
let systemState = {
  status: 'playing',
  volume: 50,
  source: 'mpd',
  track: {
    title: 'Time',
    artist: 'Pink Floyd',
    album: 'The Dark Side of the Moon'
  },
  vuMeters: { left: -10, right: -12 }
};

// WebSocket broadcasting
const broadcastState = () => {
  const payload = JSON.stringify({ type: 'state_update', payload: systemState });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
};

// Simulate VU meters change
setInterval(() => {
  if (systemState.status === 'playing') {
    systemState.vuMeters = {
      left: Math.random() * -20,
      right: Math.random() * -20
    };
    broadcastState();
  }
}, 100);

wss.on('connection', (ws) => {
  console.log('Client connected to WebSocket');
  ws.send(JSON.stringify({ type: 'state_update', payload: systemState }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'action') {
        const { action, value } = data.payload;

        if (action === 'play') systemState.status = 'playing';
        if (action === 'pause') systemState.status = 'paused';
        if (action === 'volume') systemState.volume = value;
        if (action === 'source') systemState.source = value;

        broadcastState();
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
