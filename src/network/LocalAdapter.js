import { NetworkAdapter } from './NetworkAdapter';

export class LocalAdapter extends NetworkAdapter {
  constructor() {
    super();
    this.ws = null;
    this.reconnectTimer = null;
  }

  connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${proto}//${location.host}`);
    this.ws.onopen = () => this._fire('_connected', {});
    this.ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        this._fire(msg.event, msg.data);
      } catch(err) {}
    };
    this.ws.onclose = () => {
      this.reconnectTimer = setTimeout(() => this.connect(), 2000);
    };
    this.ws.onerror = () => {};
  }

  emit(event, data) {
    if (!this.ws || this.ws.readyState !== 1) return;
    this.ws.send(JSON.stringify({ event, data: data || {} }));
  }

  destroy() {
    clearTimeout(this.reconnectTimer);
    if (this.ws) this.ws.close();
  }
}
