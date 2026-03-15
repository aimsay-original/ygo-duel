import { useState, useEffect, useCallback } from 'react';
import { useSocketRef } from './context/SocketContext';
import Lobby from './components/Lobby';
import DeckBuilder from './components/DeckBuilder';
import DuelField from './components/DuelField';
import WaitingRoom from './components/WaitingRoom';

export default function App() {
  const socketRef = useSocketRef();
  const [screen, setScreen] = useState('lobby');
  const [playerInfo, setPlayerInfo] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [deckReady, setDeckReady] = useState(false);
  const [opponentReady, setOpponentReady] = useState(false);
  const [netMode, setNetMode] = useState(null);

  const handleJoined = useCallback((info) => {
    setPlayerInfo(info);
    setScreen('deck');
  }, []);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;
    const onState = (state) => { setGameState(state); if (state.started) setScreen('duel'); };
    const onDeckSet = (data) => { if (playerInfo && data.playerIndex !== playerInfo.playerIndex) setOpponentReady(true); };
    const onDisconnect = () => console.log('Opponent disconnected (reconnection will be attempted)');
    const onRematch = () => { setScreen('deck'); setDeckReady(false); setOpponentReady(false); setGameState(null); };

    socket.on('game-state', onState);
    socket.on('deck-set', onDeckSet);
    socket.on('player-disconnected', onDisconnect);
    socket.on('rematch-reset', onRematch);

    return () => { socket.off('game-state', onState); socket.off('deck-set', onDeckSet); socket.off('player-disconnected', onDisconnect); socket.off('rematch-reset', onRematch); };
  }, [playerInfo]);

  if (screen === 'lobby') return <Lobby onJoined={handleJoined} onModeSelect={setNetMode} />;
  if (screen === 'deck') return <DeckBuilder onDeckReady={()=>{setDeckReady(true);setScreen('waiting');}} playerName={playerInfo?.name||'Player'} />;
  if (screen === 'waiting') return <WaitingRoom deckReady={deckReady} opponentReady={opponentReady} onEditDeck={()=>setScreen('deck')} />;
  if (screen === 'duel') return <DuelField gameState={gameState} />;
  return null;
}
