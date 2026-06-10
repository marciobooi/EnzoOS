const metadataService = require('../services/metadataService');

// This endpoint receives external metadata updates, for example from Librespot (Spotify Connect)
// or Shairport (AirPlay) executing a curl command upon track change.
function updateMetadataWebhook(req, res) {
  try {
    const { source, title, artist, album, albumArtUrl, status } = req.body;

    const updates = {};
    if (source) updates.source = source;
    if (status) updates.status = status;

    // Check if there are track updates
    if (title || artist || album || albumArtUrl) {
      const currentState = metadataService.getState();
      updates.track = {
        title: title || currentState.track.title,
        artist: artist || currentState.track.artist,
        album: album || currentState.track.album,
        albumArtUrl: albumArtUrl || currentState.track.albumArtUrl,
      };
    }

    metadataService.updateState(updates);

    res.json({ success: true, message: 'Metadata updated via webhook' });
  } catch (e) {
    console.error('Error in updateMetadataWebhook:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

module.exports = {
  updateMetadataWebhook
};
