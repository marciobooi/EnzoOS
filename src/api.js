// Public API facade. The implementation is split into cohesive domain modules
// under src/api/* for maintainability; they are merged here so every existing
// `api.method()` call site keeps working unchanged.
//
// Shared HTTP helpers (Spotify SPOTIFY_API_URL + handleResponse) live in
// src/api/_client.js. Each module exports a plain object of standalone methods
// (no `this`), so spreading them is behaviour-preserving.
import { spotifyApi }   from './api/spotify';
import { playerApi }    from './api/player';
import { radioApi }     from './api/radio';
import { dspApi }       from './api/dsp';
import { libraryApi }   from './api/library';
import { streamingApi } from './api/streaming';
import { metadataApi }  from './api/metadata';
import { historyApi }   from './api/history';
import { systemApi }    from './api/system';
import { djApi }        from './api/dj';

export const api = {
  ...spotifyApi,
  ...playerApi,
  ...radioApi,
  ...dspApi,
  ...libraryApi,
  ...streamingApi,
  ...metadataApi,
  ...historyApi,
  ...systemApi,
  ...djApi,
};
