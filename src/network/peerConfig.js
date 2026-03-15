// Shared PeerJS configuration with ICE servers (STUN + TURN)
// TURN servers are required for cross-network connections (e.g., mobile data <-> WiFi)
// Cloudflare TURN credentials are fetched at build time and cached in public/turn-creds.json
// A scheduled GitHub Action refreshes them every 6 hours

// Base config with STUN only (fallback if TURN creds unavailable)
const BASE_CONFIG = {
  debug: 0,
  // CRITICAL: Safari/iOS cannot send binary data through DataChannel.
  // Default 'binary' serialization silently fails on iOS Safari/Chrome.
  serialization: 'json',
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' }
    ]
  }
};

// Cache the fetched config so we only fetch once per session
let _cachedConfig = null;

/**
 * Fetches TURN credentials and returns a full PeerJS config.
 * Falls back to STUN-only if TURN creds can't be loaded.
 */
export async function getPeerConfig() {
  if (_cachedConfig) return _cachedConfig;

  try {
    // Fetch from same origin (built into dist/ by Vite from public/)
    const resp = await fetch('./turn-creds.json', { cache: 'no-cache' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const creds = await resp.json();

    if (creds.urls && creds.username && creds.credential) {
      _cachedConfig = {
        ...BASE_CONFIG,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun.cloudflare.com:3478' },
            {
              urls: creds.urls.filter(u => u.startsWith('turn')),
              username: creds.username,
              credential: creds.credential
            }
          ]
        }
      };
      console.log('TURN credentials loaded (Cloudflare)');
      return _cachedConfig;
    }
  } catch (e) {
    console.warn('Failed to load TURN credentials, using STUN only:', e.message);
  }

  _cachedConfig = BASE_CONFIG;
  return _cachedConfig;
}

// Connection timeout durations (ms)
export const SIGNALING_TIMEOUT = 10000;  // 10s to connect to PeerJS cloud server
export const CONNECTION_TIMEOUT = 20000; // 20s to establish P2P data channel (increased for TURN relay)
