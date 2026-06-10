const mpdClient = require('../services/mpdService');
const fetch = require('node-fetch');

// Radio-Browser is a free, community-driven web radio directory (similar to TuneIn)
// Docs: https://de1.api.radio-browser.info/
const RADIO_API_BASE = 'https://de1.api.radio-browser.info/json/stations/search';

async function searchRadio(req, res) {
  try {
    const { query } = req.query;
    if (!query) {
      return res.status(400).json({ success: false, error: 'Search query is required' });
    }

    // Limit to 20 results, ordering by votes (popularity)
    const url = `${RADIO_API_BASE}?name=${encodeURIComponent(query)}&limit=20&order=votes&reverse=true&hidebroken=true`;

    const response = await fetch(url, {
      headers: { 'User-Agent': 'EnzoOS-HiFiStreamer/1.0.0' }
    });

    if (!response.ok) {
      throw new Error(`Radio API returned ${response.status}`);
    }

    const data = await response.json();

    // Map the payload to a cleaner format for our frontend
    const stations = data.map(station => ({
      id: station.stationuuid,
      name: station.name.trim(),
      url: station.url_resolved,
      favicon: station.favicon,
      tags: station.tags,
      country: station.country
    }));

    res.json({ success: true, stations });

  } catch (error) {
    console.error('Radio search failed:', error.message);
    res.status(500).json({ success: false, error: 'Failed to search web radio' });
  }
}

async function playRadio(req, res) {
  try {
    const { url, name } = req.body;
    if (!url) {
      return res.status(400).json({ success: false, error: 'Stream URL is required' });
    }

    console.log(`Instructing MPD to play radio stream: ${name}`);
    await mpdClient.playStream(url);

    res.json({ success: true, message: `Playing ${name || 'Web Radio'}` });
  } catch (error) {
    console.error('Failed to play radio stream:', error);
    res.status(500).json({ success: false, error: 'Failed to initiate radio playback' });
  }
}

module.exports = {
  searchRadio,
  playRadio
};
