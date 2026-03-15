import { useSocketRef } from '../context/SocketContext';

export default function WaitingRoom({ deckReady, opponentReady, onEditDeck }) {
  const socketRef = useSocketRef();

  return (
    <div className="lobby">
      <div className="lobby-badge" style={{background:'rgba(76,175,80,0.2)',color:'#4caf50',border:'1px solid rgba(76,175,80,0.3)'}}>DECK SET</div>
      <div className="lobby-title">READY</div>
      <div className="lobby-subtitle">{opponentReady?'Both players ready!':'Waiting for opponent to set deck...'}</div>
      {opponentReady && deckReady && <button className="lobby-btn" onClick={()=>socketRef.current.emit('start-duel')}>START DUEL</button>}
      <button className="lobby-btn secondary" style={{marginTop:'10px'}} onClick={onEditDeck}>Edit Deck</button>
    </div>
  );
}
