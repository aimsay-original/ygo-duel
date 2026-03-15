import { useState, useRef } from 'react';
import { useSocketRef } from '../context/SocketContext';
import { OnlineHostAdapter } from '../network/OnlineHostAdapter';
import { OnlineGuestAdapter } from '../network/OnlineGuestAdapter';
import { LocalAdapter } from '../network/LocalAdapter';

export default function Lobby({ onJoined, onModeSelect }) {
  const socketRef = useSocketRef();
  const [name, setName] = useState('');
  const [mode, setMode] = useState('menu'); // menu, online-choice, creating, joining, joining-online
  const [roomId, setRoomId] = useState('');
  const [fullPeerId, setFullPeerId] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [connStatus, setConnStatus] = useState('disconnected');
  const [connStage, setConnStage] = useState('');
  const [waitingPlayers, setWaitingPlayers] = useState([]);
  const [copied, setCopied] = useState(false);

  const adapterRef = useRef(null);
  const nameRef = useRef('');

  // Clean up any existing adapter before creating a new one
  const cleanupAdapter = () => {
    if (adapterRef.current) {
      try { adapterRef.current.destroy(); } catch (e) {}
      adapterRef.current = null;
    }
    if (socketRef.current) {
      try { socketRef.current.destroy?.(); } catch (e) {}
      socketRef.current = null;
    }
  };

  const createOnline = () => {
    if (!name.trim()) { setError('Enter your name'); return; }
    cleanupAdapter();
    setConnStatus('connecting');
    setConnStage('Connecting to server...');
    setError('');
    nameRef.current = name.trim();

    const adapter = new OnlineHostAdapter(nameRef.current);
    adapterRef.current = adapter;
    socketRef.current = adapter;
    adapter.on('room-created', (data) => {
      setRoomId(data.roomId);
      setFullPeerId(data.fullPeerId);
      setMode('creating');
      setConnStatus('connected');
      setConnStage('');
    });
    adapter.on('room-update', (data) => {
      setWaitingPlayers(data.players);
    });
    adapter.on('error-msg', (msg) => {
      setError(typeof msg === 'string' ? msg : 'Connection error');
      setConnStatus('disconnected');
      setConnStage('');
    });
    onModeSelect('online');
  };

  const proceedToDeck = () => {
    onJoined({ playerIndex: 0, name: nameRef.current, roomId, adapter: adapterRef.current });
  };

  const joinOnline = () => {
    if (!name.trim()) { setError('Enter your name'); return; }
    if (!joinCode.trim()) { setError('Enter room code'); return; }
    cleanupAdapter();
    setConnStatus('connecting');
    setConnStage('Connecting to server...');
    setError('');

    const code = joinCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const hostId = 'ygoduel-' + code;
    const adapter = new OnlineGuestAdapter(hostId, name.trim());
    adapterRef.current = adapter;
    socketRef.current = adapter;

    adapter.on('connection-stage', (stage) => {
      setConnStage(stage);
    });
    adapter.on('connected', () => {
      setConnStatus('connected');
      setConnStage('');
      onModeSelect('online');
      onJoined({ playerIndex: 1, name: name.trim(), roomId: code, adapter });
    });
    adapter.on('error-msg', (msg) => {
      setError(typeof msg === 'string' ? msg : 'Connection failed');
      setConnStatus('disconnected');
      setConnStage('');
    });
  };

  const createLocal = () => {
    if (!name.trim()) { setError('Enter your name'); return; }
    nameRef.current = name.trim();
    const adapter = new LocalAdapter();
    adapterRef.current = adapter;
    socketRef.current = adapter;
    adapter.on('room-created', (data) => {
      setRoomId(data.roomId);
      setMode('creating');
    });
    adapter.on('room-update', (data) => { setWaitingPlayers(data.players); });
    adapter.on('error-msg', (msg) => setError(typeof msg === 'string' ? msg : 'Error'));
    adapter.connect();
    adapter.on('_connected', () => {
      adapter.emit('create-room', { name: nameRef.current });
    });
    onModeSelect('local');
  };

  const joinLocal = () => {
    if (!name.trim()) { setError('Enter your name'); return; }
    if (!joinCode.trim()) { setError('Enter room code'); return; }
    const adapter = new LocalAdapter();
    socketRef.current = adapter;
    adapter.on('room-joined', (data) => {
      onJoined({ playerIndex: data.playerIndex, name: name.trim(), roomId: joinCode.trim().toUpperCase(), adapter });
    });
    adapter.on('error-msg', (msg) => setError(typeof msg === 'string' ? msg : 'Error'));
    adapter.connect();
    adapter.on('_connected', () => {
      adapter.emit('join-room', { name: name.trim(), roomId: joinCode.trim().toUpperCase() });
    });
    onModeSelect('local');
  };

  const copyCode = () => {
    const code = roomId;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code).then(() => setCopied(true)).catch(() => {});
    } else {
      const el = document.createElement('textarea');
      el.value = code; el.style.position = 'fixed'; el.style.opacity = '0';
      document.body.appendChild(el); el.select();
      document.execCommand('copy'); document.body.removeChild(el);
      setCopied(true);
    }
    setTimeout(() => setCopied(false), 2000);
  };

  if (mode === 'creating') {
    return (
      <div className="lobby">
        <div className="lobby-badge online">ONLINE</div>
        <div className="lobby-title">ROOM CREATED</div>
        <div className="lobby-subtitle">Send this code to your opponent</div>

        <div className="lobby-room-code" style={{cursor:'pointer'}} onClick={copyCode}>
          {roomId || 'Generating...'}
        </div>

        <button className="lobby-btn online-btn" style={{marginTop:'8px',fontSize:'14px'}} onClick={copyCode}>
          {copied ? 'COPIED!' : 'TAP TO COPY CODE'}
        </button>

        <div className="conn-status" style={{marginTop:'12px'}}>
          <div className={`conn-dot ${waitingPlayers.length >= 2 ? 'connected' : 'connecting'}`} />
          <span style={{color: waitingPlayers.length >= 2 ? '#4caf50' : '#ff9800'}}>
            {waitingPlayers.length >= 2 ? 'Opponent connected!' : 'Waiting for opponent...'}
          </span>
        </div>

        <button className="lobby-btn" style={{marginTop:'15px'}} onClick={proceedToDeck}>
          CONTINUE TO DECK BUILDER
        </button>

        <div className="lobby-status" style={{fontSize:'11px',color:'#666',marginTop:'5px'}}>
          You can build your deck while waiting
        </div>
      </div>
    );
  }

  return (
    <div className="lobby">
      <div className="lobby-title">YU-GI-OH!</div>
      <div className="lobby-subtitle">Duel Simulator</div>

      <input className="lobby-input" placeholder="Your Name" value={name}
        onChange={e => { setName(e.target.value); setError(''); }} maxLength={20} />

      {mode === 'menu' && (
        <>
          <button className="lobby-btn online-btn" onClick={() => setMode('online-choice')}>
            PLAY ONLINE
          </button>
          <button className="lobby-btn secondary" onClick={() => setMode('local-choice')}>
            LOCAL NETWORK
          </button>
        </>
      )}

      {mode === 'online-choice' && (
        <>
          <div className="lobby-badge online">ONLINE MODE</div>
          {connStatus === 'connecting' ? (
            <div className="lobby-status" style={{color:'#00bcd4'}}>Connecting to peer network...</div>
          ) : (
            <>
              <button className="lobby-btn online-btn" onClick={createOnline}>CREATE ROOM</button>
              <div className="lobby-divider">— or —</div>
              <button className="lobby-btn secondary" onClick={() => setMode('joining-online')}>JOIN ROOM</button>
            </>
          )}
          <button className="lobby-btn secondary" style={{marginTop:'5px',fontSize:'13px'}} onClick={() => { setMode('menu'); setConnStatus('disconnected'); cleanupAdapter(); }}>Back</button>
        </>
      )}

      {mode === 'joining-online' && (
        <>
          <div className="lobby-badge online">ONLINE MODE</div>
          <div className="lobby-subtitle" style={{marginBottom:'10px'}}>Enter the 6-character room code</div>
          <input className="lobby-input" placeholder="Room Code" value={joinCode}
            onChange={e => { setJoinCode(e.target.value.toUpperCase()); setError(''); }}
            maxLength={6} style={{letterSpacing:'4px',fontSize:'20px',textAlign:'center'}} />
          {connStatus === 'connecting' && (
            <div className="conn-status">
              <div className="conn-dot connecting" />
              <span style={{color:'#ff9800'}}>{connStage || 'Connecting...'}</span>
            </div>
          )}
          {connStatus === 'connecting' ? (
            <button className="lobby-btn secondary" onClick={() => {
              cleanupAdapter();
              setConnStatus('disconnected');
              setConnStage('');
              setError('');
            }}>Cancel</button>
          ) : (
            <button className="lobby-btn online-btn" onClick={joinOnline}>JOIN</button>
          )}
          {connStatus !== 'connecting' && (
            <button className="lobby-btn secondary" onClick={() => { setMode('online-choice'); setConnStatus('disconnected'); setConnStage(''); cleanupAdapter(); }}>Back</button>
          )}
        </>
      )}

      {mode === 'local-choice' && (
        <>
          <div className="lobby-badge local">LOCAL NETWORK</div>
          <button className="lobby-btn" onClick={createLocal}>CREATE ROOM</button>
          <div className="lobby-divider">— or —</div>
          <input className="lobby-input" placeholder="Room Code" value={joinCode}
            onChange={e => { setJoinCode(e.target.value.toUpperCase()); setError(''); }}
            maxLength={6} style={{letterSpacing:'4px',fontSize:'20px'}} />
          <button className="lobby-btn" onClick={joinLocal}>JOIN</button>
          <button className="lobby-btn secondary" onClick={() => setMode('menu')}>Back</button>
        </>
      )}

      {error && (
        <div className="lobby-error">
          {error}
          {connStatus === 'disconnected' && mode === 'joining-online' && (
            <button className="lobby-retry-btn" onClick={joinOnline}>Try Again</button>
          )}
        </div>
      )}
    </div>
  );
}
