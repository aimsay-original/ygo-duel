export class NetworkAdapter {
  constructor() { this.handlers = {}; }
  on(event, fn) { if (!this.handlers[event]) this.handlers[event] = []; this.handlers[event].push(fn); return fn; }
  off(event, fn) {
    if (!this.handlers[event]) return;
    if (fn) { this.handlers[event] = this.handlers[event].filter(f => f !== fn); }
    else { delete this.handlers[event]; }
  }
  _fire(event, data) { if (this.handlers[event]) this.handlers[event].forEach(fn => fn(data)); }
  emit(event, data) { /* override */ }
  destroy() { /* override */ }
}
