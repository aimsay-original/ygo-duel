import Peer from 'peerjs';
import { NetworkAdapter } from './NetworkAdapter';
import { PEER_CONFIG } from './peerConfig';

export class OnlineGuestAdapter extends NetworkAdapter {
  constructor(hostPeerId, playerName) {
    super();
    this.hostPeerId = hostPeerId;
    this.playerName = playerName;
    this.conn = null;
    this._reconnectAttempts = 0;
    this._maxReconnect = 10;
    this._reconnectTimer = null;
    this._destroyed = false;

    this.peer = new Peer(null, PEER_CONFIG);
    this.peer.on('open', () => this._connectToHost(false));
    this.peer.on('error', (err) => {
      console.error('Peer error:', err);
      if (err.type === 'peer-unavailable') {
        this._fire('error-msg', 'Room not found. Check the code and try again.');
      } else {
        this._fire('error-msg', 'Connection error: ' + err.type);
      }
    });
    this.peer.on('disconnected', () => {
      if (!this._destroyed) this.peer.reconnect();
    });
  }

  _connectToHost(isReconnect) {
    if (this.conn) { try { this.conn.close(); } catch(e) {} }
    this.conn = this.peer.connect(this.hostPeerId, { reliable: true });
    this.conn.on('open', () => {
      this._reconnectAttempts = 0;
      if (isReconnect) {
        this.conn.send({ event: 'reconnect', data: { name: this.playerName } });
      } else {
        this.conn.send({ event: 'set-name', data: { name: this.playerName } });
      }
      this._fire('connected', {});
      this._fire('connection-status', { status: 'connected' });
    });
    this.conn.on('data', (msg) => {
      this._fire(msg.event, msg.data);
    });
    this.conn.on('close', () => {
      this._fire('connection-status', { status: 'disconnected' });
      this._attemptReconnect();
    });
  }

  _attemptReconnect() {
    if (this._destroyed || this._reconnectAttempts >= this._maxReconnect) {
      if (this._reconnectAttempts >= this._maxReconnect) {
        this._fire('player-disconnected', { playerIndex: 0 });
      }
      return;
    }
    this._reconnectAttempts++;
    const delay = Math.min(2000 * this._reconnectAttempts, 10000);
    this._fire('connection-status', { status: 'reconnecting', attempt: this._reconnectAttempts, max: this._maxReconnect });
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
    if (this.peer) this.peer.destroy();
  }
}
