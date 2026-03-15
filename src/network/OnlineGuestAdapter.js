import Peer from 'peerjs';
import { NetworkAdapter } from './NetworkAdapter';
import { PEER_CONFIG, SIGNALING_TIMEOUT } from './peerConfig';

export class OnlineGuestAdapter extends NetworkAdapter {
  constructor(hostPeerId, playerName) {
    super();
    this.hostPeerId = hostPeerId;
    this.playerName = playerName;
    this.conn = null;
    this._signalingTimer = null;
    this._destroyed = false;
    this._connected = false;
    this._dataChannelOpen = false;

    this._fire('connection-stage', 'Connecting to server...');

    this.peer = new Peer(null, PEER_CONFIG);

    this._signalingTimer = setTimeout(() => {
      if (!this._destroyed && !this.peer.open) {
        this._fire('error-msg', 'Could not reach game server. Check your internet connection and try again.');
        this.destroy();
      }
    }, SIGNALING_TIMEOUT);

    this.peer.on('open', () => {
      clearTimeout(this._signalingTimer);
      this._fire('connection-stage', 'Joining room...');

      // Set up signaling relay listener
      this._setupSignalingRelay();

      // Initiate WebRTC connection (triggers host's peer.on('connection'))
      // Also attempts DataChannel as an optional low-latency upgrade
      this._connectToHost();

      // Send join message via signaling relay immediately
      // This is the PRIMARY connection method — works through all NAT/firewalls
      this._sendViaRelay('set-name', { name: this.playerName });
    });

    this.peer.on('error', (err) => {
      clearTimeout(this._signalingTimer);
      if (err.type === 'peer-unavailable') {
        this._fire('error-msg', 'Room not found. Check the code and try again.');
      } else if (err.type === 'network') {
        this._fire('error-msg', 'Network error. Check your connection and try again.');
      } else if (err.type === 'server-error') {
        this._fire('error-msg', 'Game server is temporarily unavailable. Try again in a moment.');
      } else {
        // Don't show errors for WebRTC failures — relay handles connectivity
        console.warn('PeerJS error (non-fatal):', err.type, err.message);
      }
    });

    this.peer.on('disconnected', () => {
      if (!this._destroyed) {
        try { this.peer.reconnect(); } catch (e) {}
      }
    });

    this.peer.on('close', () => {
      if (!this._destroyed) {
        this._fire('error-msg', 'Connection to server lost. Try again.');
      }
    });
  }

  // ─── Signaling Relay ───────────────────────────────────
  // Routes game data through PeerJS's signaling server (0.peerjs.com)
  // This is the PRIMARY data path — works through all NAT/firewalls.

  _setupSignalingRelay() {
    const ws = this.peer?.socket?._socket;
    if (!ws) return;

    ws.addEventListener('message', (event) => {
      if (this._destroyed) return;
      try {
        const msg = JSON.parse(event.data);
        if (msg.type !== 'RELAY' || !msg.payload) return;
        if (msg.src !== this.hostPeerId) return;

        const { event: evt, data } = msg.payload;

        // Host confirmed our connection via relay
        if (evt === 'relay-connected' && !this._connected) {
          this._connected = true;
          this._fire('connected', {});
          this._fire('connection-status', { status: 'connected' });
          this._fire('connection-stage', 'Connected!');
          return;
        }

        // Regular game messages from host
        this._fire(evt, data);
      } catch {}
    });
  }

  _sendViaRelay(event, data) {
    if (this._destroyed) return;
    try {
      this.peer.socket.send({
        type: 'RELAY',
        dst: this.hostPeerId,
        payload: { event, data }
      });
    } catch (e) {
      console.warn('Relay send failed:', e);
    }
  }

  // ─── DataChannel (optional P2P upgrade) ────────────────

  _connectToHost() {
    if (this._destroyed) return;

    this.conn = this.peer.connect(this.hostPeerId, { reliable: true });

    this.conn.on('open', () => {
      this._dataChannelOpen = true;
      if (!this._connected) {
        this._connected = true;
        this.conn.send({ event: 'set-name', data: { name: this.playerName } });
        this._fire('connected', {});
        this._fire('connection-status', { status: 'connected' });
        this._fire('connection-stage', 'Connected!');
      }
    });

    this.conn.on('data', (msg) => {
      this._fire(msg.event, msg.data);
    });

    this.conn.on('error', (err) => {
      console.warn('DataChannel error (non-fatal, relay active):', err);
    });

    this.conn.on('close', () => {
      this._dataChannelOpen = false;
    });

    // If neither relay nor DataChannel connects within timeout, show error
    setTimeout(() => {
      if (!this._destroyed && !this._connected) {
        this._fire('error-msg', 'Could not connect to host. The room may have closed, or check your connection and try again.');
        this.destroy();
      }
    }, SIGNALING_TIMEOUT + 5000);
  }

  emit(event, data) {
    if (this._dataChannelOpen && this.conn && this.conn.open) {
      this.conn.send({ event, data });
    } else {
      this._sendViaRelay(event, data);
    }
  }

  destroy() {
    this._destroyed = true;
    clearTimeout(this._signalingTimer);
    if (this.peer) {
      try { this.peer.destroy(); } catch (e) {}
    }
  }
}
