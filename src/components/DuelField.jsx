import { useState, useEffect, useRef } from 'react';
import { useSocketRef } from '../context/SocketContext';
import { cardImg } from '../helpers/cardHelpers';
import { CARD_BACK } from '../helpers/constants';

function haptic(ms = 10) {
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* ignore */ }
}

export default function DuelField({ gameState }) {
  const socketRef = useSocketRef();
  const [selectedHandCard, setSelectedHandCard] = useState(null);
  const [placingCard, setPlacingCard] = useState(null);
  const [showLog, setShowLog] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showLpPopup, setShowLpPopup] = useState(null);
  const [lpAmount, setLpAmount] = useState('');
  const [showZoneViewer, setShowZoneViewer] = useState(null);
  const [cardActionMenu, setCardActionMenu] = useState(null);
  const [gameOver, setGameOver] = useState(null);
  const [lpAnimating, setLpAnimating] = useState(null);
  const [toast, setToast] = useState(null);
  const [resultOverlay, setResultOverlay] = useState(null);
  const [logToast, setLogToast] = useState(null);
  const [connBanner, setConnBanner] = useState(null);
  const [previewCard, setPreviewCard] = useState(null);
  const [confirmRequest, setConfirmRequest] = useState(null);
  const [pendingRequest, setPendingRequest] = useState(false);
  const prevLp = useRef({});
  const prevLogLen = useRef(0);
  const longPressTimer = useRef(null);
  const didLongPress = useRef(false);
  const gs = gameState;
  const isMyTurn = gs && gs.currentPlayer === gs.myIndex;

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;
    const hGameOver = socket.on('game-over', (data) => { setGameOver(data); haptic(50); });
    const hError = socket.on('error-msg', (msg) => {
      setToast({ type: 'error', text: typeof msg === 'string' ? msg : 'Error', id: Date.now() });
    });
    const hCoin = socket.on('coin-result', (data) => {
      setResultOverlay({ emoji: '\u{1FA99}', label: 'Coin Flip', value: data.result, id: Date.now() });
    });
    const hDice = socket.on('dice-result', (data) => {
      setResultOverlay({ emoji: '\u{1F3B2}', label: 'Dice Roll', value: String(data.result), id: Date.now() });
    });
    const hZone = socket.on('view-zone-result', (res) => {
      const titles = { graveyard: 'Graveyard', banished: 'Banished', extraDeck: 'Extra Deck' };
      setShowZoneViewer({ cards: res.cards, title: titles[res.zone] || 'Cards' });
    });
    const hTopCard = socket.on('view-top-result', (data) => {
      setShowZoneViewer({ cards: [data.card], title: 'Top of Deck' });
    });
    const hConnStatus = socket.on('connection-status', (data) => {
      if (data.status === 'connected') {
        setConnBanner({ status: 'reconnected', text: '\u25cf Reconnected!' });
        setTimeout(() => setConnBanner(null), 2500);
      } else if (data.status === 'reconnecting') {
        setConnBanner({ status: 'reconnecting', text: `\u25cf Reconnecting... (${data.attempt}/${data.max})` });
      } else if (data.status === 'disconnected') {
        setConnBanner({ status: 'disconnected', text: '\u25cf Opponent disconnected \u2014 attempting to reconnect...' });
      }
    });
    const hConfirmReq = socket.on('confirm-request', (data) => {
      setConfirmRequest(data);
      haptic(30);
    });
    const hRequestResult = socket.on('request-result', (data) => {
      setPendingRequest(false);
      if (data.accepted) {
        setToast({ type: 'info', text: data.message || 'Request approved!', id: Date.now() });
      } else {
        setToast({ type: 'error', text: data.message || 'Request denied.', id: Date.now() });
      }
    });
    const hRequestPending = socket.on('request-pending', () => {
      setPendingRequest(true);
    });
    return () => { socket.off('game-over', hGameOver); socket.off('error-msg', hError); socket.off('coin-result', hCoin); socket.off('dice-result', hDice); socket.off('view-zone-result', hZone); socket.off('view-top-result', hTopCard); socket.off('connection-status', hConnStatus); socket.off('confirm-request', hConfirmReq); socket.off('request-result', hRequestResult); socket.off('request-pending', hRequestPending); };
  }, []);

  useEffect(() => {
    if (!gs) return;
    if (prevLp.current.me !== undefined && prevLp.current.me !== gs.me.lp) { setLpAnimating('me'); setTimeout(()=>setLpAnimating(null),300); haptic(20); }
    if (prevLp.current.opp !== undefined && prevLp.current.opp !== gs.opponent.lp) { setLpAnimating('opp'); setTimeout(()=>setLpAnimating(null),300); haptic(20); }
    prevLp.current = { me: gs.me.lp, opp: gs.opponent.lp };
  }, [gs?.me?.lp, gs?.opponent?.lp]);

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 2500); return () => clearTimeout(t); }
  }, [toast?.id]);

  // Auto-dismiss result overlay
  useEffect(() => {
    if (resultOverlay) { const t = setTimeout(() => setResultOverlay(null), 2000); return () => clearTimeout(t); }
  }, [resultOverlay?.id]);

  // Auto-show log toast for new entries
  useEffect(() => {
    if (!gs) return;
    const curLen = gs.log.length;
    if (prevLogLen.current > 0 && curLen > prevLogLen.current) {
      setLogToast(gs.log[curLen - 1]);
      const t = setTimeout(() => setLogToast(null), 3000);
      prevLogLen.current = curLen;
      return () => clearTimeout(t);
    }
    prevLogLen.current = curLen;
  }, [gs?.log?.length]);

  if (!gs || !gs.started) {
    return (
      <div className="lobby">
        <div className="lobby-title">WAITING</div>
        <div className="lobby-subtitle">Duel begins when both players are ready</div>
        <button className="lobby-btn" onClick={()=>socketRef.current.emit('start-duel')}>START DUEL</button>
      </div>
    );
  }

  const PHASES = ['draw','standby','main1','battle','main2','end'];
  // ===== TRIBUTE SELECTION STATE =====
  const [tributeMode, setTributeMode] = useState(null);
  const [attackMode, setAttackMode] = useState(null);

  const curPhaseIdx = PHASES.indexOf(gs.phase);
  const canAdvanceTo = (p) => {
    const idx = PHASES.indexOf(p);
    if (idx <= curPhaseIdx) return false;
    if (gs.turn === 1 && p === 'battle') return false;
    return true;
  };
  const closeMenus = () => { setSelectedHandCard(null); setPlacingCard(null); setCardActionMenu(null); setShowMenu(false); setShowZoneViewer(null); setTributeMode(null); setAttackMode(null); setPreviewCard(null); };

  // ─── Long-press for card preview ──────────────────────
  const startLongPress = (card) => {
    if (!card || card.hidden) return;
    didLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      setPreviewCard(card);
      haptic(15);
    }, 400);
  };
  const cancelLongPress = () => {
    clearTimeout(longPressTimer.current);
  };
  const lpClass = lp => lp > 4000 ? 'high' : lp > 2000 ? 'mid' : 'low';
  const oppIndex = 1 - gs.myIndex;

  const handleHandCardTap = (index) => {
    if (didLongPress.current) { didLongPress.current = false; return; }
    if (tributeMode) return;
    if (selectedHandCard === index) { setSelectedHandCard(null); setPlacingCard(null); return; }
    setSelectedHandCard(index);
    const card = gs.me.hand[index];
    const actions = [];
    const isMonster = card.type && (card.type.toLowerCase().includes('monster') || card.atk !== undefined);
    const isSpell = card.type && card.type.toLowerCase().includes('spell');
    const isTrap = card.type && card.type.toLowerCase().includes('trap');
    const inMainPhase = gs.phase === 'main1' || gs.phase === 'main2';

    if (isMonster && isMyTurn && inMainPhase) {
      const level = card.level || 0;
      const tributesNeeded = level >= 7 ? 2 : level >= 5 ? 1 : 0;
      const monstersOnField = gs.me.monsters.filter(m => m !== null).length;
      const canNormalSummon = !gs.me.hasNormalSummoned && (tributesNeeded === 0 || monstersOnField >= tributesNeeded);

      if (canNormalSummon) {
        if (tributesNeeded > 0) {
          actions.push({ label: `Tribute Summon (ATK) [${tributesNeeded} tribute${tributesNeeded>1?'s':''}]`, action: () => {
            setTributeMode({ handIndex: index, position: 'atk', tributesNeeded, selected: [] });
            setCardActionMenu(null); setSelectedHandCard(null);
          }});
          actions.push({ label: `Tribute Set (face-down DEF) [${tributesNeeded} tribute${tributesNeeded>1?'s':''}]`, action: () => {
            setTributeMode({ handIndex: index, position: 'facedown-def', tributesNeeded, selected: [] });
            setCardActionMenu(null); setSelectedHandCard(null);
          }});
        } else {
          actions.push({ label: 'Normal Summon (ATK)', action: () => { setPlacingCard({ handIndex: index, zoneType: 'monsters', position: 'atk' }); setCardActionMenu(null); } });
          actions.push({ label: 'Normal Summon (DEF)', action: () => { setPlacingCard({ handIndex: index, zoneType: 'monsters', position: 'def' }); setCardActionMenu(null); } });
          actions.push({ label: 'Set (face-down DEF)', action: () => { setPlacingCard({ handIndex: index, zoneType: 'monsters', position: 'facedown-def' }); setCardActionMenu(null); } });
        }
      } else if (gs.me.hasNormalSummoned && tributesNeeded === 0) {
        actions.push({ label: 'Normal Summon (already used)', action: () => {} });
      }
    } else if (isMonster && !inMainPhase) {
      actions.push({ label: 'Normal Summon (Main Phase only)', action: () => {} });
    }

    // Special Summon from Hand (any monster, requires opponent confirmation)
    if (isMonster) {
      actions.push({ label: 'Special Summon (ATK)', action: () => { setPlacingCard({ handIndex: index, zoneType: 'monsters', position: 'atk', needsConfirmation: true, isSpecial: true }); setCardActionMenu(null); } });
      actions.push({ label: 'Special Summon (DEF)', action: () => { setPlacingCard({ handIndex: index, zoneType: 'monsters', position: 'def', needsConfirmation: true, isSpecial: true }); setCardActionMenu(null); } });
    }

    if (isSpell) {
      actions.push({ label: 'Activate', action: () => { setPlacingCard({ handIndex: index, zoneType: 'spells', position: 'active' }); setCardActionMenu(null); } });
      actions.push({ label: 'Set', action: () => { setPlacingCard({ handIndex: index, zoneType: 'spells', position: 'facedown' }); setCardActionMenu(null); } });
      if (card.race === 'Field') actions.push({ label: 'Activate (Field)', action: () => { socketRef.current.emit('play-card', { handIndex: index, zone: 'fieldSpell', zoneIndex: 0 }); closeMenus(); } });
    }
    if (isTrap) actions.push({ label: 'Set', action: () => { setPlacingCard({ handIndex: index, zoneType: 'spells', position: 'facedown' }); setCardActionMenu(null); } });
    actions.push({ label: 'Send to GY', action: () => { socketRef.current.emit('move-card', { from: { zone: 'hand', index }, to: { zone: 'graveyard' } }); closeMenus(); } });
    actions.push({ label: 'Banish', action: () => { socketRef.current.emit('move-card', { from: { zone: 'hand', index }, to: { zone: 'banished' } }); closeMenus(); } });
    setCardActionMenu({ card, actions });
  };

  const handleZoneClick = (zone, index, isOpponentZone = false) => {
    if (didLongPress.current) { didLongPress.current = false; return; }

    // ===== TRIBUTE SELECTION MODE =====
    if (tributeMode && zone === 'monsters' && !isOpponentZone) {
      const card = gs.me.monsters[index];
      if (!card) return;
      const sel = [...tributeMode.selected];
      const idx = sel.indexOf(index);
      if (idx >= 0) { sel.splice(idx, 1); } else { if (sel.length < tributeMode.tributesNeeded) sel.push(index); }
      const updated = { ...tributeMode, selected: sel };
      setTributeMode(updated);
      if (sel.length === tributeMode.tributesNeeded) {
        const emptyAfterTribute = gs.me.monsters.map((m, i) => sel.includes(i) ? null : m);
        const targetZone = emptyAfterTribute.findIndex(m => m === null);
        if (targetZone >= 0) {
          socketRef.current.emit('play-card', {
            handIndex: tributeMode.handIndex, zone: 'monsters',
            zoneIndex: targetZone, position: tributeMode.position,
            tributes: sel
          }); haptic(25);
        }
        setTributeMode(null); closeMenus();
      }
      return;
    }

    if (attackMode) return;

    // ===== PLACING CARD ON ZONE (own or opponent's) =====
    if (placingCard && placingCard.zoneType === zone) {
      if (isOpponentZone || placingCard.needsConfirmation) {
        // Needs opponent confirmation — send request
        socketRef.current.emit('play-card-request', {
          handIndex: placingCard.handIndex, zone, zoneIndex: index,
          position: placingCard.position,
          isSpecial: placingCard.isSpecial || false,
          targetPlayer: isOpponentZone ? oppIndex : gs.myIndex
        });
        haptic(15); closeMenus(); return;
      }
      socketRef.current.emit('play-card', { handIndex: placingCard.handIndex, zone, zoneIndex: index, position: placingCard.position });
      haptic(15); closeMenus(); return;
    }

    // Don't open action menus for opponent's cards
    if (isOpponentZone) return;

    const card = gs.me[zone][index]; if (!card) return;
    const actions = [];
    if (zone === 'monsters') {
      const inMainPhase = gs.phase === 'main1' || gs.phase === 'main2';
      const canChangePos = isMyTurn && inMainPhase && !card.summonedThisTurn && !card.hasChangedPosition;
      if (card.position === 'atk' && canChangePos) actions.push({ label: 'Switch to DEF', action: () => { socketRef.current.emit('change-position', { zone: 'monsters', index, position: 'def' }); closeMenus(); } });
      if (card.position === 'def' && canChangePos) actions.push({ label: 'Switch to ATK', action: () => { socketRef.current.emit('change-position', { zone: 'monsters', index, position: 'atk' }); closeMenus(); } });
      if (card.position?.includes('facedown')) actions.push({ label: 'Flip Summon (ATK)', action: () => { socketRef.current.emit('flip-card', { zone: 'monsters', index }); closeMenus(); } });
      if (isMyTurn && gs.phase === 'battle' && card.position === 'atk' && card.canAttack) {
        actions.push({ label: 'Attack', action: () => { setAttackMode({ attackerIndex: index }); setCardActionMenu(null); } });
      }
      actions.push({ label: 'To GY', action: () => { socketRef.current.emit('move-card', { from: { zone: 'monsters', index }, to: { zone: 'graveyard' } }); closeMenus(); } });
      actions.push({ label: 'Banish', action: () => { socketRef.current.emit('move-card', { from: { zone: 'monsters', index }, to: { zone: 'banished' } }); closeMenus(); } });
      actions.push({ label: 'Return to Hand', action: () => { socketRef.current.emit('move-card', { from: { zone: 'monsters', index }, to: { zone: 'hand' } }); closeMenus(); } });
    } else if (zone === 'spells') {
      if (card.facedown) actions.push({ label: 'Flip face-up', action: () => { socketRef.current.emit('change-position', { zone: 'spells', index }); closeMenus(); } });
      actions.push({ label: 'To GY', action: () => { socketRef.current.emit('move-card', { from: { zone: 'spells', index }, to: { zone: 'graveyard' } }); closeMenus(); } });
      actions.push({ label: 'Banish', action: () => { socketRef.current.emit('move-card', { from: { zone: 'spells', index }, to: { zone: 'banished' } }); closeMenus(); } });
      actions.push({ label: 'Return to Hand', action: () => { socketRef.current.emit('move-card', { from: { zone: 'spells', index }, to: { zone: 'hand' } }); closeMenus(); } });
    }
    if (actions.length > 0) setCardActionMenu({ card, actions });
  };

  const renderCard = (card, zone, index, isOpponent = false) => {
    const isTributeTarget = tributeMode && !isOpponent && zone === 'monsters' && card;
    const isTributeSelected = isTributeTarget && tributeMode.selected.includes(index);
    const tributeStyle = isTributeTarget ? { border: '2px solid #f44336', boxShadow: isTributeSelected ? '0 0 12px rgba(244,67,54,0.8)' : '0 0 6px rgba(244,67,54,0.3)' } : {};
    const isAttackTarget = attackMode && isOpponent && zone === 'monsters' && card;
    const attackTargetStyle = isAttackTarget ? { border: '2px solid #ff6600', boxShadow: '0 0 10px rgba(255,102,0,0.5)', cursor: 'pointer' } : {};
    // Highlight opponent's empty zones when placing a card
    const isOppPlaceTarget = placingCard && isOpponent && placingCard.zoneType === zone && !card;
    const oppPlaceStyle = isOppPlaceTarget ? { border: '1px solid #ffd700', boxShadow: '0 0 8px rgba(255,215,0,0.4)' } : {};
    const handleClick = () => {
      if (didLongPress.current) { didLongPress.current = false; return; }
      if (isOpponent) {
        if (attackMode && zone === 'monsters' && card) {
          socketRef.current.emit('attack', { attackerIndex: attackMode.attackerIndex, targetIndex: index });
          haptic(25); setAttackMode(null);
          return;
        }
        // Allow clicking empty opponent zones when placing a card
        if (placingCard && placingCard.zoneType === zone && !card) {
          handleZoneClick(zone, index, true);
          return;
        }
        return;
      }
      handleZoneClick(zone, index);
    };

    // Long-press props for card preview
    const lpProps = (c) => (!c || c.hidden) ? {} : {
      onTouchStart: () => startLongPress(c),
      onTouchEnd: cancelLongPress,
      onTouchMove: cancelLongPress,
      onMouseDown: () => startLongPress(c),
      onMouseUp: cancelLongPress,
      onMouseLeave: cancelLongPress
    };

    if (!card) return <div key={`${zone}-${index}`} className={`card-zone ${zone==='monsters'?'monster-zone':'spell-zone'} ${(placingCard&&placingCard.zoneType===zone)?'highlight':''}`} style={oppPlaceStyle} onClick={()=>{
      if (isOpponent && placingCard && placingCard.zoneType === zone) { handleZoneClick(zone, index, true); return; }
      if (!isOpponent) handleZoneClick(zone, index);
    }} />;
    if (card.hidden) return <div key={`${zone}-${index}`} className="card-zone has-card" style={attackTargetStyle} onClick={handleClick}><div className="facedown-card" />{(card.position==='def'||card.position==='facedown-def')&&<div className="def-indicator">DEF</div>}</div>;
    const isDef = card.position === 'def' || card.position === 'facedown-def';
    const combinedStyle = { ...tributeStyle, ...attackTargetStyle };
    return <div key={`${zone}-${index}`} className={`card-zone has-card`} style={combinedStyle} onClick={handleClick} {...lpProps(card)}>
      <img src={cardImg(card)} alt={card.name||'?'} style={isDef?{transform:'rotate(90deg)',width:'100%',height:'100%',objectFit:'contain'}:{}} />
      {isDef && <div className="def-indicator">DEF</div>}
    </div>;
  };

  // ─── Dynamic field spell background ──────────────────
  const activeFieldSpellBg = (() => {
    const mine = gs.me.fieldSpell;
    const opp = gs.opponent.fieldSpell;
    if (mine && !mine.facedown) return mine;
    if (opp && !opp.hidden && !opp.facedown) return opp;
    return null;
  })();
  const fieldBgUrl = activeFieldSpellBg
    ? (activeFieldSpellBg.card_images?.[0]?.image_url || cardImg(activeFieldSpellBg))
    : null;
  const duelBgStyle = fieldBgUrl ? {
    backgroundImage: `linear-gradient(rgba(10,10,26,0.75), rgba(10,10,26,0.75)), url(${fieldBgUrl})`,
    backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat'
  } : {};

  return (
    <div className="duel-screen" style={duelBgStyle}>
      <div className="duel-topbar">
        <div className="duel-turn">T{gs.turn}</div>
        <div className="duel-phase-bar">
          {PHASES.map(p => {
            const canClick = isMyTurn && canAdvanceTo(p);
            const isPast = PHASES.indexOf(p) < curPhaseIdx;
            return <div key={p}
              className={`phase-pip ${gs.phase===p?'active':''} ${canClick?'clickable':''} ${isPast?'past':''}`}
              style={isPast ? {opacity:0.3} : (gs.turn===1 && p==='battle' ? {opacity:0.2,textDecoration:'line-through'} : {})}
              onClick={()=>canClick&&socketRef.current.emit('change-phase',{phase:p})}>
              {p==='main1'?'M1':p==='main2'?'M2':p==='battle'?'BP':p==='standby'?'SP':p==='draw'?'DP':'EP'}
            </div>;
          })}
        </div>
        <button className="duel-menu-btn" onClick={()=>setShowMenu(true)}>{'\u2630'}</button>
      </div>

      <div className="player-info opponent">
        <div>
          <div className={`pi-name ${!isMyTurn?'active-player':''}`}>{gs.players[oppIndex]||'Opponent'}</div>
          <div className="pi-counters"><div className="pi-counter">Hand: {gs.opponent.handCount}</div><div className="pi-counter">Deck: {gs.opponent.deckCount}</div></div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
          <div className={`pi-lp ${lpClass(gs.opponent.lp)} ${lpAnimating==='opp'?'lp-animate':''}`}>{gs.opponent.lp}</div>
          <div className="lp-controls">
            <button className="lp-btn minus" onClick={()=>{setShowLpPopup({target:oppIndex,mode:'damage'});setLpAmount('');}}>-</button>
            <button className="lp-btn plus" onClick={()=>{setShowLpPopup({target:oppIndex,mode:'heal'});setLpAmount('');}}>+</button>
          </div>
        </div>
      </div>

      <div className="hand-area opponent-hand">
        {Array.from({length:gs.opponent.handCount}).map((_,i)=><div key={i} className="hand-card facedown"><img src={CARD_BACK} alt="card" loading="lazy" /></div>)}
      </div>

      <div className="field-area">
        <div className="side-zones opponent-side">
          <div className="side-zone" onClick={()=>socketRef.current.emit('view-zone',{targetPlayer:oppIndex,zone:'graveyard'})}><div className="sz-count">{gs.opponent.graveyardCount}</div><div className="sz-label">GY</div></div>
          <div className="side-zone" onClick={()=>socketRef.current.emit('view-zone',{targetPlayer:oppIndex,zone:'banished'})}><div className="sz-count">{gs.opponent.banishedCount}</div><div className="sz-label">Ban</div></div>
        </div>
        {gs.opponent.fieldSpell && <div className="field-spell-zone opponent-fs"><div className="card-zone has-card" style={{width:'var(--side-w)',height:'var(--side-h)'}}>{gs.opponent.fieldSpell.hidden?<div className="facedown-card"/>:<img src={cardImg(gs.opponent.fieldSpell)} alt="Field"/>}</div></div>}

        <div className="field-row">{gs.opponent.spells.map((c,i)=>renderCard(c,'spells',i,true))}</div>
        <div className="field-row">{gs.opponent.monsters.map((c,i)=>renderCard(c,'monsters',i,true))}</div>
        <div style={{height:'4px',background:'linear-gradient(90deg,transparent,rgba(255,215,0,0.3),transparent)',margin:'2px 0'}} />
        <div className="field-row">{gs.me.monsters.map((c,i)=>renderCard(c,'monsters',i))}</div>
        <div className="field-row">{gs.me.spells.map((c,i)=>renderCard(c,'spells',i))}</div>

        <div className="side-zones my-side">
          <div className="side-zone" onClick={()=>socketRef.current.emit('view-zone',{targetPlayer:gs.myIndex,zone:'graveyard'})}><div className="sz-count">{gs.me.graveyard.length}</div><div className="sz-label">GY</div></div>
          <div className="side-zone" onClick={()=>socketRef.current.emit('view-zone',{targetPlayer:gs.myIndex,zone:'banished'})}><div className="sz-count">{gs.me.banished.length}</div><div className="sz-label">Ban</div></div>
          <div className="side-zone" onClick={()=>socketRef.current.emit('view-zone',{targetPlayer:gs.myIndex,zone:'extraDeck'})}><div className="sz-count">{gs.me.extraDeck.length}</div><div className="sz-label">Extra</div></div>
        </div>
        {gs.me.fieldSpell && <div className="field-spell-zone my-fs"><div className="card-zone has-card" style={{width:'var(--side-w)',height:'var(--side-h)'}} onClick={()=>setCardActionMenu({card:gs.me.fieldSpell,actions:[{label:'To GY',action:()=>{socketRef.current.emit('move-card',{from:{zone:'fieldSpell'},to:{zone:'graveyard'}});closeMenus();}}]})}>{gs.me.fieldSpell.facedown?<div className="facedown-card"/>:<img src={cardImg(gs.me.fieldSpell)} alt="Field"/>}</div></div>}
        {placingCard && <div className="zone-picker-msg">
          {placingCard.needsConfirmation
            ? 'Tap a zone (opponent zones require confirmation)'
            : 'Tap a zone to place your card'}
          <span style={{marginLeft:'10px',fontSize:'12px',cursor:'pointer',textDecoration:'underline'}} onClick={()=>{setPlacingCard(null);setSelectedHandCard(null);}}>Cancel</span>
        </div>}
        {tributeMode && <div className="zone-picker-msg" style={{background:'rgba(244,67,54,0.2)',color:'#f44336',borderColor:'rgba(244,67,54,0.4)'}}>
          Select {tributeMode.tributesNeeded} monster{tributeMode.tributesNeeded>1?'s':''} to tribute ({tributeMode.selected.length}/{tributeMode.tributesNeeded})
          <span style={{marginLeft:'10px',fontSize:'12px',cursor:'pointer',textDecoration:'underline'}} onClick={()=>setTributeMode(null)}>Cancel</span>
        </div>}
        {attackMode && <div className="zone-picker-msg" style={{background:'rgba(255,102,0,0.2)',color:'#ff6600',borderColor:'rgba(255,102,0,0.4)'}}>
          {gs.opponent.monsters.some(m => m !== null)
            ? 'Select an opponent\'s monster to attack'
            : <span style={{padding:'4px 12px',background:'rgba(255,102,0,0.3)',borderRadius:'6px',cursor:'pointer',fontWeight:700}} onClick={()=>{socketRef.current.emit('attack',{attackerIndex:attackMode.attackerIndex,targetIndex:-1});haptic(30);setAttackMode(null);}}>Direct Attack!</span>
          }
          <span style={{marginLeft:'10px',fontSize:'12px',cursor:'pointer',textDecoration:'underline'}} onClick={()=>setAttackMode(null)}>Cancel</span>
        </div>}
      </div>

      <div className="hand-area">
        {gs.me.hand.map((card,i) => <div key={i} className={`hand-card ${selectedHandCard===i?'selected':''}`} onClick={()=>handleHandCardTap(i)}
          onTouchStart={()=>startLongPress(card)} onTouchEnd={cancelLongPress} onTouchMove={cancelLongPress}
          onMouseDown={()=>startLongPress(card)} onMouseUp={cancelLongPress} onMouseLeave={cancelLongPress}
        ><img src={cardImg(card)} alt={card.name} /></div>)}
      </div>

      <div className="player-info me">
        <div>
          <div className={`pi-name ${isMyTurn?'active-player':''}`}>{gs.players[gs.myIndex]||'You'}{isMyTurn&&' (Your Turn)'}</div>
          <div className="pi-counters"><div className="pi-counter">Hand: {gs.me.hand.length}</div><div className="pi-counter">Deck: {gs.me.deckCount}</div></div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
          <div className={`pi-lp ${lpClass(gs.me.lp)} ${lpAnimating==='me'?'lp-animate':''}`}>{gs.me.lp}</div>
          <div className="lp-controls">
            <button className="lp-btn minus" onClick={()=>{setShowLpPopup({target:gs.myIndex,mode:'damage'});setLpAmount('');}}>-</button>
            <button className="lp-btn plus" onClick={()=>{setShowLpPopup({target:gs.myIndex,mode:'heal'});setLpAmount('');}}>+</button>
          </div>
        </div>
      </div>

      <div className="duel-bottombar">
        <button className={`action-btn draw ${(!isMyTurn || gs.phase !== 'draw' || gs.turn === 1 || gs.me.hasDrawn)?'disabled':''}`}
          onClick={()=>{ if(isMyTurn && gs.phase === 'draw' && gs.turn !== 1 && !gs.me.hasDrawn) { socketRef.current.emit('draw-card'); haptic(10); } }}>
          {gs.me.hasDrawn ? 'Drew \u2713' : gs.turn === 1 && isMyTurn ? 'No Draw T1' : 'Draw'}
        </button>
        <button className="action-btn tools" onClick={()=>setShowLog(!showLog)}>Log</button>
        <button className="action-btn tools" onClick={()=>socketRef.current.emit('shuffle-deck')}>Shuffle</button>
        <button className="action-btn tools" onClick={()=>socketRef.current.emit('coin-flip')}>Coin</button>
        <button className="action-btn tools" onClick={()=>socketRef.current.emit('dice-roll')}>Dice</button>
        <button className={`action-btn end-turn ${!isMyTurn?'disabled':''}`} onClick={()=>{if(isMyTurn){socketRef.current.emit('end-turn');closeMenus();setTributeMode(null);}}}>End Turn</button>
      </div>

      {showLog && <div className="game-log" onClick={()=>setShowLog(false)}>{gs.log.map((l,i)=><p key={i}>{l}</p>)}</div>}

      {cardActionMenu && (<>
        <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,zIndex:54}} onClick={closeMenus} />
        <div className="card-action-menu fade-in" style={{top:'50%',left:'50%',transform:'translate(-50%,-50%)'}}>
          {cardActionMenu.card && !cardActionMenu.card.hidden && (
            <div className="card-action-item" style={{textAlign:'center',fontWeight:700,color:'#ffd700',fontSize:'13px'}}>
              {cardActionMenu.card.name}
              {cardActionMenu.card.atk !== undefined && <div style={{fontSize:'11px',color:'#ff8c00',fontWeight:400}}>ATK {cardActionMenu.card.atk} / DEF {cardActionMenu.card.def}</div>}
            </div>
          )}
          {cardActionMenu.actions.map((a,i) => <div key={i} className="card-action-item" onClick={a.action}>{a.label}</div>)}
          <div className="card-action-item" style={{color:'#888',textAlign:'center'}} onClick={closeMenus}>Cancel</div>
        </div>
      </>)}

      {showLpPopup && (<>
        <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.6)',zIndex:59}} onClick={()=>setShowLpPopup(null)} />
        <div className="lp-popup">
          <h3>{showLpPopup.mode==='damage'?'Deal Damage':'Gain LP'}</h3>
          <input type="number" value={lpAmount} onChange={e=>setLpAmount(e.target.value)} placeholder="Amount" autoFocus />
          <div className="lp-presets">{[100,200,500,1000,2000,4000].map(v=><button key={v} className="lp-preset-btn" onClick={()=>setLpAmount(String(v))}>{v}</button>)}</div>
          <div className="lp-popup-btns">
            <button style={{background:'rgba(255,255,255,0.1)',color:'#ccc'}} onClick={()=>setShowLpPopup(null)}>Cancel</button>
            <button style={{background:showLpPopup.mode==='damage'?'#f44336':'#4caf50',color:'white'}} onClick={()=>{const a=parseInt(lpAmount);if(isNaN(a)||a<=0)return;socketRef.current.emit('modify-lp',{targetPlayer:showLpPopup.target,amount:showLpPopup.mode==='damage'?-a:a});setShowLpPopup(null);}}>
              {showLpPopup.mode==='damage'?'Apply Damage':'Apply Heal'}
            </button>
          </div>
        </div>
      </>)}

      {showZoneViewer && (
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)setShowZoneViewer(null)}}>
          <div className="modal-content">
            <div className="modal-title">{showZoneViewer.title} ({showZoneViewer.cards.length})</div>
            {showZoneViewer.cards.length === 0 ? <div style={{textAlign:'center',color:'#888',padding:'20px'}}>Empty</div> : (
              <div className="modal-card-list">
                {showZoneViewer.cards.map((card,i) => (
                  <div key={i} className="modal-card-item" onClick={()=>{
                    if (showZoneViewer.title === 'Extra Deck') {
                      if (confirm(`Special Summon ${card.name}?`)) {
                        const emptyIdx = gs.me.monsters.findIndex(m => m === null);
                        if (emptyIdx >= 0) { socketRef.current.emit('special-summon-extra', { extraIndex: i, zone: 'monsters', zoneIndex: emptyIdx, position: 'atk' }); setShowZoneViewer(null); }
                        else alert('No empty monster zone!');
                      }
                    }
                  }}><img src={cardImg(card)} alt={card.name} /></div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showMenu && (
        <div className="menu-overlay" onClick={e=>{if(e.target===e.currentTarget)setShowMenu(false)}}>
          <div className="menu-item" onClick={()=>setShowMenu(false)}>Resume</div>
          <div className="menu-item" onClick={()=>{socketRef.current.emit('view-zone',{targetPlayer:gs.myIndex,zone:'graveyard'});setShowMenu(false);}}>My Graveyard</div>
          <div className="menu-item" onClick={()=>{socketRef.current.emit('view-zone',{targetPlayer:gs.myIndex,zone:'banished'});setShowMenu(false);}}>My Banished</div>
          <div className="menu-item" onClick={()=>{socketRef.current.emit('view-zone',{targetPlayer:gs.myIndex,zone:'extraDeck'});setShowMenu(false);}}>My Extra Deck</div>
          <div className="menu-item" onClick={()=>{socketRef.current.emit('view-zone',{targetPlayer:oppIndex,zone:'graveyard'});setShowMenu(false);}}>Opp's Graveyard</div>
          <div className="menu-item" onClick={()=>{socketRef.current.emit('view-zone',{targetPlayer:oppIndex,zone:'banished'});setShowMenu(false);}}>Opp's Banished</div>
          <div className="menu-item" onClick={()=>{socketRef.current.emit('create-token');setShowMenu(false);}}>Create Token</div>
          <div className="menu-item" onClick={()=>{socketRef.current.emit('sort-hand');setShowMenu(false);}}>Sort Hand</div>
          <div className="menu-item" onClick={()=>{socketRef.current.emit('view-top-card');setShowMenu(false);}}>View Top Card</div>
          <div className="menu-item" onClick={()=>{socketRef.current.emit('mill-top');setShowMenu(false);}}>Mill Top Card</div>
          <div className="menu-item danger" onClick={()=>{socketRef.current.emit('surrender');setShowMenu(false);}}>Surrender</div>
        </div>
      )}

      {gameOver && (
        <div className="game-over-overlay">
          <div className={`game-over-text ${gameOver.winner===gs.myIndex?'win':'lose'}`}>
            {gameOver.winner===gs.myIndex?'YOU WIN!':'YOU LOSE'}
          </div>
          <div style={{color:'#888',marginBottom:'20px'}}>
            {gameOver.reason==='surrender'?'Opponent surrendered':gameOver.reason==='deckout'?'Deck out!':'Life points reduced to 0'}
          </div>
          <button className="lobby-btn" onClick={()=>{setGameOver(null);socketRef.current.emit('rematch');}}>REMATCH</button>
        </div>
      )}

      {/* ─── Card Preview Overlay ─── */}
      {previewCard && (
        <div className="card-preview-overlay" onClick={() => setPreviewCard(null)}>
          <div className="card-preview-content" onClick={e => e.stopPropagation()}>
            <img src={cardImg(previewCard)} alt={previewCard.name || '?'} className="card-preview-img" />
            <div className="card-preview-name">{previewCard.name}</div>
            {previewCard.type && <div className="card-preview-type">{previewCard.type}</div>}
            {previewCard.attribute && <div className="card-preview-attr">
              {previewCard.attribute}{previewCard.level ? ` ${'★'.repeat(previewCard.level)}` : ''}
            </div>}
            {previewCard.atk !== undefined && (
              <div className="card-preview-stats">ATK {previewCard.atk} / DEF {previewCard.def}</div>
            )}
            {previewCard.desc && <div className="card-preview-desc">{previewCard.desc}</div>}
            <div className="card-preview-close" onClick={() => setPreviewCard(null)}>Tap to close</div>
          </div>
        </div>
      )}

      {/* ─── Opponent Confirmation Modal ─── */}
      {confirmRequest && (
        <div className="confirm-overlay">
          <div className="confirm-modal">
            <div className="confirm-title">Opponent Request</div>
            <div className="confirm-body">
              <strong>{confirmRequest.requesterName}</strong> wants to <strong>{confirmRequest.action}</strong>
              {confirmRequest.card && !confirmRequest.card.hidden && (
                <span> &quot;{confirmRequest.card.name}&quot;</span>
              )}
              {confirmRequest.targetZone && <span> {confirmRequest.targetZone}</span>}
            </div>
            {confirmRequest.card && confirmRequest.card.atk !== undefined && (
              <div className="confirm-stats">ATK {confirmRequest.card.atk} / DEF {confirmRequest.card.def}</div>
            )}
            <div className="confirm-btns">
              <button className="confirm-btn deny" onClick={() => {
                socketRef.current.emit('confirm-response', { requestId: confirmRequest.requestId, accepted: false });
                setConfirmRequest(null);
              }}>Deny</button>
              <button className="confirm-btn allow" onClick={() => {
                socketRef.current.emit('confirm-response', { requestId: confirmRequest.requestId, accepted: true });
                setConfirmRequest(null);
              }}>Allow</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Pending Request Indicator ─── */}
      {pendingRequest && (
        <div className="pending-banner">Waiting for opponent's response...</div>
      )}

      {toast && <div key={toast.id} className={`toast ${toast.type}`}>{toast.text}</div>}

      {resultOverlay && (
        <div key={resultOverlay.id} className="result-overlay" onClick={() => setResultOverlay(null)}>
          <div className="result-box">
            <div className="result-emoji">{resultOverlay.emoji}</div>
            <div className="result-label">{resultOverlay.label}</div>
            <div className="result-value">{resultOverlay.value}</div>
          </div>
        </div>
      )}

      {logToast && !showLog && <div className="log-toast">{logToast}</div>}

      {connBanner && <div className={`conn-banner ${connBanner.status}`}>{connBanner.text}</div>}
    </div>
  );
}
