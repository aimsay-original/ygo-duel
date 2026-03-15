// Shared PeerJS configuration with ICE servers (STUN + TURN)
// TURN servers are required for cross-network connections (e.g., mobile data → WiFi)
// Without TURN, symmetric NAT / carrier-grade NAT blocks direct P2P connections

export const PEER_CONFIG = {
  debug: 0,
  // CRITICAL: Safari/iOS cannot send binary data through DataChannel.
  // Default 'binary' serialization silently fails on iOS Safari/Chrome.
  // JSON serialization works on all platforms.
  serialization: 'json',
  config: {
    iceServers: [
      // Multiple STUN servers for reliable NAT discovery
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      // TURN relay servers for symmetric NAT / carrier-grade NAT
      // Port 80 (most widely accessible)
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      // Port 443 TCP (works through corporate firewalls)
      {
        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ]
  }
};

// Connection timeout durations (ms)
export const SIGNALING_TIMEOUT = 10000;  // 10s to connect to PeerJS cloud server
export const CONNECTION_TIMEOUT = 15000; // 15s to establish P2P data channel
