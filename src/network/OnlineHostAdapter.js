import Peer from 'peerjs';
import { NetworkAdapter } from './NetworkAdapter';
import { GameEngine } from '../engine/GameEngine';

export class OnlineHostAdapter extends NetworkAdapter {
  constructor(playerName) {
    super();
    this.engine = new GameEngine();
    this.engine.playerNames[0] = playerName;
    this.conn = null;
    this.peerId = null;
    this.ready = false;
    this.roomCode = null;

    // Generate a short 6-char room code (no ambiguous chars)
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    this.roomCode = code;

    this.peer = new Peer('ygoduel-' + code, { debug: 0 });
    this.peer.on('open', (id) => {
      this.peerId = id;
      this._fire('room-created', { roomId: code, fullPeerId: id, playerIndex: 0 });
    });
    this.peer.on('connection', (conn) => {
      // Accept reconnections — replace old connection
      if (this.conn) { try { this.conn.close(); } catch(e) {} }
      this.conn = conn;
      conn.on('open', () => {
        this._fire('connection-status', { status: 'connected' });
        this._fire('room-update', { players: this.engine.playerNames, message: 'Opponent connected!' });
      });
      conn.on('data', (msg) => {
        if (msg.event === 'reconnect') {
          // Guest reconnected — update name and resend game state
          this.engine.playerNames[1] = msg.data.name;
          this._broadcastState();
          this._fire('room-update', { players: this.engine.playerNames, message: 'Opponent reconnected!' });
          this._fire('connection-status', { status: 'connected' });
          return;
        }
        this._handleGuestMessage(msg);
      });
      conn.on('close', () => {
        this._fire('connection-status', { status: 'disconnected' });
      });
    });
    this.peer.on('error', (err) => {
      console.error('Peer error:', err);
      if (err.type === 'unavailable-id') {
        this._fire('error-msg', 'Room code taken — please try again.');
      } else {
        this._fire('error-msg', 'Connection error: ' + err.type);
      }
    });
  }

  // Unified action dispatcher — called by both host emit() and guest message handler
  _dispatch(event, data, pi) {
    const sendError = pi === 0 ? (msg) => this._fire('error-msg', msg) : (msg) => this._sendToGuest('error-msg', msg);
    const sendPrivate = pi === 0 ? (ev, d) => this._fire(ev, d) : (ev, d) => this._sendToGuest(ev, d);
    let result;
    switch(event) {
      case 'set-deck':
        result = this.engine.setDeck(pi, data);
        this._broadcast('deck-set', result);
        break;
      case 'start-duel':
        result = this.engine.startDuel();
        if (result.error) { sendError(result.error); return; }
        this._broadcastState();
        break;
      case 'draw-card':
        result = this.engine.drawCard(pi);
        if (result?.error) { sendError(result.error); return; }
        if (result?.gameOver) this._broadcast('game-over', result.gameOver);
        this._broadcastState();
        break;
      case 'change-phase':
        result = this.engine.changePhase(pi, data.phase);
        if (result?.error) { sendError(result.error); return; }
        this._broadcastState();
        break;
      case 'end-turn': this.engine.endTurn(pi); this._broadcastState(); break;
      case 'play-card':
        result = this.engine.playCard(pi, data);
        if (result?.error) { sendError(result.error); return; }
        this._broadcastState();
        break;
      case 'move-card': this.engine.moveCard(pi, data); this._broadcastState(); break;
      case 'change-position': this.engine.changePosition(pi, data); this._broadcastState(); break;
      case 'flip-card': this.engine.flipCard(pi, data); this._broadcastState(); break;
      case 'attack':
        result = this.engine.attack(pi, data);
        if (result?.error) { sendError(result.error); return; }
        if (result?.gameOver) this._broadcast('game-over', result.gameOver);
        this._broadcastState();
        break;
      case 'modify-lp':
        result = this.engine.modifyLp(data.targetPlayer, data.amount);
        if (result?.gameOver) this._broadcast('game-over', result.gameOver);
        this._broadcastState();
        break;
      case 'special-summon-extra': this.engine.specialSummonExtra(pi, data); this._broadcastState(); break;
      case 'create-token':
        result = this.engine.createToken(pi);
        if (result?.error) { sendError(result.error); return; }
        this._broadcastState();
        break;
      case 'coin-flip': { const r = this.engine.coinFlip(pi); this._broadcast('coin-result', { result: r }); this._broadcastState(); break; }
      case 'dice-roll': { const r = this.engine.diceRoll(pi); this._broadcast('dice-result', { result: r }); this._broadcastState(); break; }
      case 'shuffle-deck': this.engine.shuffleDeck(pi); this._broadcastState(); break;
      case 'view-zone': {
        const cards = this.engine.getZone(data.targetPlayer, data.zone, pi);
        sendPrivate('view-zone-result', { cards, zone: data.zone });
        break;
      }
      case 'surrender':
        result = this.engine.surrender(pi);
        if (result?.gameOver) this._broadcast('game-over', result.gameOver);
        this._broadcastState();
        break;
      case 'rematch':
        this.engine.reset();
        this._broadcast('rematch-reset', {});
        break;
      case 'sort-hand': this.engine.sortHand(pi); this._broadcastState(); break;
      case 'mill-top': {
        const r = this.engine.millTopCard(pi);
        if (r.error) { sendError(r.error); return; }
        this._broadcastState();
        break;
      }
      case 'view-top-card': {
        const r = this.engine.viewTopCard(pi);
        if (r.error) { sendError(r.error); return; }
        sendPrivate('view-top-result', r);
        break;
      }
      case 'set-name':
        this.engine.playerNames[pi === 0 ? 0 : 1] = data.name;
        this._broadcast('room-update', { players: this.engine.playerNames });
        break;
    }
  }

  _handleGuestMessage(msg) {
    this._dispatch(msg.event, msg.data, 1);
  }

  // Host's own actions
  emit(event, data) {
    if (!this.peer) return;
    this._dispatch(event, data, 0);
  }

  _sendToGuest(event, data) {
    if (this.conn && this.conn.open) this.conn.send({ event, data });
  }

  _broadcast(event, data) {
    this._fire(event, data);
    this._sendToGuest(event, data);
  }

  _broadcastState() {
    this._fire('game-state', this.engine.getStateForPlayer(0));
    this._sendToGuest('game-state', this.engine.getStateForPlayer(1));
  }

  destroy() { if (this.peer) this.peer.destroy(); }
}
