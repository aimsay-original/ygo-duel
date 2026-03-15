import Peer from 'peerjs';
import { NetworkAdapter } from './NetworkAdapter';
import { PEER_CONFIG, SIGNALING_TIMEOUT, CONNECTION_TIMEOUT } from './peerConfig';

export class OnlineGuestAdapter extends NetworkAdapter {
  constructor(hostPeerId, playerName) {
    super();
    this.hostPeerId = hostPeerId;
    this.playerName = playerName;
    this.conn = null;
    this._reconnectAttempts = 0;
    this._maxReconnect = 10;
    this._reconnectTimer = null;
    this._signalingTimer = null;
    this._connectionTimer = null;
    this._destroyed = false;
    this._connected = false;

    this._fire('connection-stage', 'Connecting to server...');

    this.peer = new Peer(null, PEER_CONFIG);

    // Timeout: if signaling server doesn't respond within SIGNALING_TIMEOUT
    this._signalingTimer = setTimeout(() => {
      if (!this._destroyed && !this.peer.open) {
        console.error('PeerJS signaling server timeout');
        this._fire('error-msg', 'Could not reach game server. Check your internet connection and try again.');
        this.destroy();
      }
    }, SIGNALING_TIMEOUT);

    this.peer.on('open', () => {
      clearTimeout(this._signalingTimer);
      this._fire('connection-stage', 'Finding room...');
      this._connectToHost(false);
    });

    this.peer.on('error', (err) => {
      clearTimeout(this._signalingTimer);
      clearTimeout(this._connectionTimer);
      console.error('Peer error:', err);
      if (err.type === 'peer-unavailable') {
        this._fire('error-msg', 'Room not found. Check the code and try again.');
      } else if (err.type === 'network') {
        this._fire('error-msg', 'Network error. Check your connection and try again.');
      } else if (err.type === 'server-error') {
        this._fire('error-msg', 'Game server is temporarily unavailable. Try again in a moment.');
      } else {
        this._fire('error-msg', 'Connection error: ' + (err.type || err.message || 'unknown'));
      }
    });

    this.peer.on('disconnected', () => {
      if (!this._destroyed) {
        try { this.peer.reconnect(); } catch (e) {
          console.error('Reconnect failed:', e);
        }
      }
    });

    this.peer.on('close', () => {
      if (!this._destroyed) {
        this._fire('error-msg', 'Connection to server lost. Try again.');
      }
    });
  }

  _connectToHost(isReconnect) {
    if (this._destroyed) return;
    if (this.conn) { try { this.conn.close(); } catch(e) {} }

    this._fire('connection-stage', isReconnect ? 'Reconnecting...' : 'Joining room...');

    this.conn = this.peer.connect(this.hostPeerId, { reliable: true });

    // Timeout: if data channel doesn't open within CONNECTION_TIMEOUT
    this._connectionTimer = setTimeout(() => {
      if (!this._destroyed && !this._connected) {
        console.error('Data channel connection timeout');
        this._fire('error-msg', 'Could not connect to host. The room may have closed, or your network may be blocking the connection. Try again.');
        this.destroy();
      }
    }, CONNECTION_TIMEOUT);

    this.conn.on('open', () => {
      clearTimeout(this._connectionTimer);
      this._connected = true;
      this._reconnectAttempts = 0;
      if (isReconnect) {
        this.conn.send({ event: 'reconnect', data: { name: this.playerName } });
      } else {
        this.conn.send({ event: 'set-name', data: { name: this.playerName } });
      }
      this._fire('connected', {});
      this._fire('connection-status', { status: 'connected' });
      this._fire('connection-stage', 'Connected!');
    });

    this.conn.on('data', (msg) => {
      this._fire(msg.event, msg.data);
    });

    this.conn.on('error', (err) => {
      clearTimeout(this._connectionTimer);
      console.error('Data connection error:', err);
      if (!this._connected) {
        this._fire('error-msg', 'Failed to connect to room. Try again.');
      }
    });

    this.conn.on('close', () => {
      this._connected = false;
      this._fire('connection-status', { status: 'disconnected' });
      this._attemptReconnect();
    });
  }

  _attemptReconnect() {
    if (this._destroyed || this._reconnectAttempts >= this._maxReconnect) {
      if (this._reconnectAttempts >= this._maxReconnect) {
        this._fire('error-msg', 'Lost connection to host after multiple attempts.');
        this._fire('player-disconnected', { playerIndex: 0 });
      }
      return;
    }
    this._reconnectAttempts++;
    const delay = Math.min(2000 * this._reconnectAttempts, 10000);
    this._fire('connection-status', { status: 'reconnecting', attempt: this._reconnectAttempts, max: this._maxReconnect });
    this._fire('connection-stage', `Reconnecting (${this._reconnectAttempts}/${this._maxReconnect})...`);
    this._reconnectTimer = setTimeout(() => {
      if (!this._destroyed && this.peer && !this.peer.destroyed) {
        this._connectToHost(true);
      }
    }, delay);
  }

  emit(event, data) {
    if (this.conn && this.conn.open) this.conn.send({ event, data });
  }

  destroy() {
    this._destroyed = true;
    clearTimeout(this._reconnectTimer);
    clearTimeout(this._signalingTimer);
    clearTimeout(this._connectionTimer);
    if (this.peer) {
      try { this.peer.destroy(); } catch (e) {}
    }
  }
}
