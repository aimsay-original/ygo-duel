// Shared PeerJS configuration
// Uses our self-hosted PeerJS signaling server instead of the unreliable 0.peerjs.com.
// The primary data path uses the signaling server as a relay,
// so TURN servers are NOT needed. WebRTC DataChannel is an optional
// optimization for same-network connections.

// Determine server host based on environment
const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

export const PEER_CONFIG = {
  // Connect to our self-hosted PeerJS server
  host: isDev ? 'localhost' : 'ygo-relay.onrender.com',
  port: isDev ? 9000 : 443,
  path: '/ygo',
  secure: !isDev,
  key: 'ygoduel',
  debug: 0,
  // CRITICAL: Safari/iOS cannot send binary data through DataChannel.
  // JSON serialization works on all platforms.
  serialization: 'json',
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' }
    ]
  }
};

// Connection timeout durations (ms)
export const SIGNALING_TIMEOUT = 10000;  // 10s to connect to PeerJS server
export const DATACHANNEL_UPGRADE_TIMEOUT = 8000; // 8s to try upgrading to P2P DataChannel
