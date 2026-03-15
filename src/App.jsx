import { useState, useEffect, useCallback, useRef } from 'react';
import { useSocketRef } from './context/SocketContext';
import Lobby from './components/Lobby';
import DeckBuilder from './components/DeckBuilder';
import DuelField from './components/DuelField';
import WaitingRoom from './components/WaitingRoom';

// Haptic feedback helper — triggers vibration on supported devices
function haptic(ms = 10) {
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* ignore */ }
}

// iOS standalone check
function isIOSStandalone() {
  return window.navigator.standalone === true;
}
function isIOSSafari() {
  const ua = navigator.userAgent;
  return /iP(hone|ad|od)/.test(ua) && /WebKit/.test(ua) && !/(CriOS|FxiOS|OPiOS|EdgiOS)/.test(ua) && !isIOSStandalone();
}

export default function App() {
  const socketRef = useSocketRef();
  const [screen, setScreen] = useState('lobby');
  const [playerInfo, setPlayerInfo] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [deckReady, setDeckReady] = useState(false);
  const [opponentReady, setOpponentReady] = useState(false);
  const [netMode, setNetMode] = useState(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const prevStarted = useRef(false);

  const handleJoined = useCallback((info) => {
    setPlayerInfo(info);
    setScreen('deck');
  }, []);

  // iOS install banner — show only in Safari, not standalone, dismissable
  useEffect(() => {
    if (!isIOSSafari()) return;
    const dismissed = localStorage.getItem('ygo-install-dismissed');
    if (dismissed) return;
    const timer = setTimeout(() => setShowInstallBanner(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  const dismissInstallBanner = () => {
    setShowInstallBanner(false);
    localStorage.setItem('ygo-install-dismissed', '1');
  };

  // iOS lifecycle — reconnect WebRTC when app returns from background
  useEffect(() => {
    const handleVisChange = () => {
      if (document.visibilityState === 'visible' && socketRef.current) {
        // Check if connection is still alive; adapters handle reconnection internally
        // but we trigger a ping to detect stale connections faster
        const socket = socketRef.current;
        if (socket && typeof socket.emit === 'function') {
          // Emit a harmless event; the adapter's WebRTC error handlers will
          // detect if the connection died while backgrounded and auto-reconnect
          try { socket.emit('ping'); } catch (e) { /* adapter will handle */ }
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisChange);
    return () => document.removeEventListener('visibilitychange', handleVisChange);
  }, []);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;
    const onState = (state) => {
      setGameState(state);
      if (state.started && !prevStarted.current) {
        setScreen('duel');
        haptic(30); // haptic on duel start
      }
      prevStarted.current = state.started;
    };
    const onDeckSet = (data) => { if (playerInfo && data.playerIndex !== playerInfo.playerIndex) setOpponentReady(true); };
    const onDisconnect = () => console.log('Opponent disconnected (reconnection will be attempted)');
    const onRematch = () => { setScreen('deck'); setDeckReady(false); setOpponentReady(false); setGameState(null); prevStarted.current = false; };

    socket.on('game-state', onState);
    socket.on('deck-set', onDeckSet);
    socket.on('player-disconnected', onDisconnect);
    socket.on('rematch-reset', onRematch);

    return () => { socket.off('game-state', onState); socket.off('deck-set', onDeckSet); socket.off('player-disconnected', onDisconnect); socket.off('rematch-reset', onRematch); };
  }, [playerInfo]);

  return (
    <>
      {screen === 'lobby' && <Lobby onJoined={handleJoined} onModeSelect={setNetMode} />}
      {screen === 'deck' && <DeckBuilder onDeckReady={()=>{setDeckReady(true);setScreen('waiting');}} playerName={playerInfo?.name||'Player'} />}
      {screen === 'waiting' && <WaitingRoom deckReady={deckReady} opponentReady={opponentReady} onEditDeck={()=>setScreen('deck')} />}
      {screen === 'duel' && <DuelField gameState={gameState} />}

      {showInstallBanner && (
        <div className="install-banner">
          <div className="install-banner-text">
            <strong>Install YGO Duel</strong>
            <span>Tap <span style={{fontSize:'16px'}}>⎋</span> then "Add to Home Screen" for fullscreen play</span>
          </div>
          <button className="install-banner-close" onClick={dismissInstallBanner}>✕</button>
        </div>
      )}
    </>
  );
}
