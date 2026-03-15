export function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createPlayerState() {
  return {
    lp: 8000, hand: [], deck: [],
    monsters: [null, null, null, null, null],
    spells: [null, null, null, null, null],
    fieldSpell: null, graveyard: [], banished: [], extraDeck: [],
    deckName: '', hasDrawn: false, hasNormalSummoned: false
  };
}

export class GameEngine {
  constructor() {
    this.game = { turn: 0, currentPlayer: 0, phase: 'draw', players: [createPlayerState(), createPlayerState()], log: [], started: false };
    this.playerNames = ['Player 1', 'Player 2'];
  }

  setDeck(pi, data) {
    const s = this.game.players[pi];
    s.deck = shuffleArray(data.mainDeck || []);
    s.extraDeck = data.extraDeck || [];
    s.deckName = data.deckName || 'Deck';
    return { playerIndex: pi, deckName: s.deckName, mainCount: s.deck.length, extraCount: s.extraDeck.length };
  }

  startDuel() {
    const g = this.game;
    if (g.players[0].deck.length === 0 || g.players[1].deck.length === 0) return { error: 'Both players need decks!' };
    g.started = true; g.turn = 1;
    g.currentPlayer = Math.random() < 0.5 ? 0 : 1;
    g.phase = 'main1'; // First player skips Draw & Standby on turn 1
    for (let p = 0; p < 2; p++) for (let i = 0; i < 5; i++) if (g.players[p].deck.length > 0) g.players[p].hand.push(g.players[p].deck.pop());
    g.log.push(`Duel Start! ${this.playerNames[g.currentPlayer]} goes first (no draw on Turn 1).`);
    return { ok: true };
  }

  drawCard(pi) {
    const g = this.game;
    if (g.currentPlayer !== pi) return { error: "Not your turn!" };
    if (g.turn === 1) return { error: "Cannot draw on the first turn!" };
    if (g.phase !== 'draw') return { error: "Can only draw during Draw Phase!" };
    if (g.players[pi].hasDrawn) return { error: "Already drew this turn!" };
    const s = g.players[pi];
    if (s.deck.length === 0) { s.lp = 0; g.log.push(`${this.playerNames[pi]} decked out!`); return { gameOver: { winner: 1 - pi, reason: 'deckout' } }; }
    s.hand.push(s.deck.pop()); s.hasDrawn = true;
    g.log.push(`${this.playerNames[pi]} drew a card.`);
    // Auto-advance past Draw & Standby to Main Phase 1
    g.phase = 'main1';
    g.log.push(`${this.playerNames[pi]} → main1 phase`);
    this._trimLog();
    return { ok: true };
  }

  changePhase(pi, phase) {
    if (this.game.currentPlayer !== pi) return { error: "Not your turn!" };
    const PHASES = ['draw', 'standby', 'main1', 'battle', 'main2', 'end'];
    const curIdx = PHASES.indexOf(this.game.phase);
    const newIdx = PHASES.indexOf(phase);
    if (newIdx < 0) return { error: "Invalid phase!" };
    if (newIdx <= curIdx) return { error: "Cannot go back to a previous phase!" };
    // Turn 1: skip battle phase for going-first player
    if (this.game.turn === 1 && phase === 'battle') return { error: "No Battle Phase on Turn 1!" };
    this.game.phase = phase;
    this.game.log.push(`${this.playerNames[pi]} → ${phase} phase`);
    this._trimLog();
    return { ok: true };
  }

  endTurn(pi) {
    const g = this.game;
    if (g.currentPlayer !== pi) return;
    g.currentPlayer = 1 - g.currentPlayer; g.turn++;
    g.phase = 'draw';
    // Reset per-turn flags for both players
    for (let p = 0; p < 2; p++) {
      g.players[p].hasNormalSummoned = false;
      g.players[p].hasDrawn = false;
    }
    // Enable attacks and reset position-change tracking for new current player's monsters
    const newPlayer = g.players[g.currentPlayer];
    for (let i = 0; i < newPlayer.monsters.length; i++) {
      if (newPlayer.monsters[i]) {
        newPlayer.monsters[i].canAttack = true;
        newPlayer.monsters[i].hasChangedPosition = false;
        newPlayer.monsters[i].summonedThisTurn = false;
      }
    }
    g.log.push(`Turn ${g.turn}: ${this.playerNames[g.currentPlayer]}'s turn.`);
    this._trimLog();
  }

  playCard(pi, data) {
    const g = this.game;
    const s = g.players[pi]; // source: card comes from this player's hand
    const tp = (data.targetPlayer !== undefined && data.targetPlayer !== pi) ? data.targetPlayer : pi;
    const t = g.players[tp]; // target: card goes to this player's field
    const card = s.hand[data.handIndex];
    if (!card) return { error: 'No card' };
    const onOppSide = tp !== pi;
    if (data.zone === 'monsters') {
      // Enforce main phase for monster summons
      if (g.phase !== 'main1' && g.phase !== 'main2') return { error: 'Can only summon during Main Phase!' };
      if (t.monsters[data.zoneIndex] !== null) return { error: 'Zone occupied!' };
      // Enforce normal summon limit (special summons bypass this via specialSummonExtra)
      if (!data.isSpecial) {
        if (s.hasNormalSummoned) return { error: 'Already Normal Summoned this turn!' };
        const level = card.level || 0;
        // Tribute requirement check — Level 5-6: 1 tribute, Level 7+: 2 tributes
        if (level >= 5) {
          const tributesNeeded = level >= 7 ? 2 : 1;
          if (!data.tributes || data.tributes.length < tributesNeeded) {
            return { error: `Need ${tributesNeeded} tribute(s) for Level ${level} monsters!` };
          }
          // Validate and send tributes to GY
          const sortedTributes = [...data.tributes].sort((a, b) => b - a);
          for (const idx of sortedTributes) {
            const tributed = s.monsters[idx];
            if (!tributed) return { error: 'Invalid tribute target!' };
            const tributeName = tributed.position?.includes('facedown') ? 'a face-down monster' : tributed.name;
            s.graveyard.push(tributed);
            s.monsters[idx] = null;
            g.log.push(`${this.playerNames[pi]} tributed ${tributeName}.`);
          }
        }
        s.hasNormalSummoned = true;
      }
      t.monsters[data.zoneIndex] = { ...card, position: data.position || 'atk', canAttack: true, hasChangedPosition: false, summonedThisTurn: true };
      s.hand.splice(data.handIndex, 1);
      const posLabel = (data.position || '').includes('facedown') ? 'face-down' : (data.position === 'def' ? 'DEF' : 'ATK');
      const action = data.isSpecial ? 'special summoned' : ((data.tributes && data.tributes.length > 0) ? 'tribute summoned' : ((data.position || '').includes('facedown') ? 'set' : 'summoned'));
      const where = onOppSide ? ` on ${this.playerNames[tp]}'s field` : '';
      g.log.push(`${this.playerNames[pi]} ${action} ${posLabel.includes('face-down') ? 'a monster' : card.name} in ${posLabel}${where}.`);
    } else if (data.zone === 'spells') {
      if (t.spells[data.zoneIndex] !== null) return { error: 'Zone occupied!' };
      t.spells[data.zoneIndex] = { ...card, facedown: data.position === 'facedown' };
      s.hand.splice(data.handIndex, 1);
      const where = onOppSide ? ` on ${this.playerNames[tp]}'s field` : '';
      g.log.push(`${this.playerNames[pi]} ${data.position === 'facedown' ? 'set a card' : 'activated ' + card.name}${where}.`);
    } else if (data.zone === 'fieldSpell') {
      if (t.fieldSpell) t.graveyard.push(t.fieldSpell);
      t.fieldSpell = { ...card, facedown: data.position === 'facedown' };
      s.hand.splice(data.handIndex, 1);
      const where = onOppSide ? ` on ${this.playerNames[tp]}'s field` : '';
      g.log.push(`${this.playerNames[pi]} activated field spell: ${card.name}${where}.`);
    }
    this._trimLog();
    return { ok: true };
  }

  moveCard(pi, data) {
    const s = this.game.players[pi]; let card = null;
    if (data.from.zone === 'monsters') { card = s.monsters[data.from.index]; s.monsters[data.from.index] = null; }
    else if (data.from.zone === 'spells') { card = s.spells[data.from.index]; s.spells[data.from.index] = null; }
    else if (data.from.zone === 'fieldSpell') { card = s.fieldSpell; s.fieldSpell = null; }
    else if (data.from.zone === 'hand') { card = s.hand[data.from.index]; s.hand.splice(data.from.index, 1); }
    if (!card) return { error: 'No card to move' };
    const n = this.playerNames[pi];
    if (data.to.zone === 'graveyard') { s.graveyard.push(card); this.game.log.push(`${n} sent ${card.name} to GY.`); }
    else if (data.to.zone === 'banished') { s.banished.push(card); this.game.log.push(`${n} banished ${card.name}.`); }
    else if (data.to.zone === 'hand') { s.hand.push(card); this.game.log.push(`${n} returned ${card.name} to hand.`); }
    else if (data.to.zone === 'deck') { s.deck.push(card); s.deck = shuffleArray(s.deck); this.game.log.push(`${n} shuffled ${card.name} into deck.`); }
    else if (data.to.zone === 'extraDeck') { s.extraDeck.push(card); this.game.log.push(`${n} returned ${card.name} to Extra Deck.`); }
    this._trimLog();
    return { ok: true };
  }

  changePosition(pi, data) {
    const s = this.game.players[pi];
    if (data.zone === 'monsters' && s.monsters[data.index]) {
      const m = s.monsters[data.index];
      if (m.summonedThisTurn) return { error: 'Cannot change position of a monster summoned this turn!' };
      if (m.hasChangedPosition) return { error: 'This monster already changed position this turn!' };
      m.position = data.position;
      m.hasChangedPosition = true;
      m.canAttack = false; // Can't attack after changing position
      this.game.log.push(`${this.playerNames[pi]} changed ${m.name} to ${data.position}.`);
      this._trimLog();
    } else if (data.zone === 'spells' && s.spells[data.index]) {
      s.spells[data.index].facedown = !s.spells[data.index].facedown;
      this.game.log.push(`${this.playerNames[pi]} flipped ${s.spells[data.index].name}.`);
      this._trimLog();
    }
    return { ok: true };
  }

  attack(pi, data) {
    const g = this.game;
    if (g.currentPlayer !== pi) return { error: "Not your turn!" };
    if (g.phase !== 'battle') return { error: "Can only attack during Battle Phase!" };
    const attacker = g.players[pi].monsters[data.attackerIndex];
    if (!attacker) return { error: "No monster in that zone!" };
    if (!attacker.canAttack) return { error: "This monster cannot attack!" };
    if (attacker.position !== 'atk') return { error: "Only ATK position monsters can attack!" };
    const opp = g.players[1 - pi];
    const n = this.playerNames;
    attacker.canAttack = false;
    // Direct attack
    if (data.targetIndex === -1) {
      const hasMonsters = opp.monsters.some(m => m !== null);
      if (hasMonsters) return { error: "Cannot attack directly while opponent has monsters!" };
      const damage = attacker.atk;
      opp.lp = Math.max(0, opp.lp - damage);
      g.log.push(`${n[pi]}'s ${attacker.name} attacks directly! ${n[1-pi]} takes ${damage} damage.`);
      this._trimLog();
      if (opp.lp <= 0) return { gameOver: { winner: pi, reason: 'lp' } };
      return { ok: true };
    }
    // Attack a monster
    const target = opp.monsters[data.targetIndex];
    if (!target) return { error: "No monster in that zone!" };
    const atkVal = attacker.atk;
    const targetIsDefense = target.position === 'def' || target.position === 'facedown-def';
    if (target.position?.includes('facedown')) {
      target.position = targetIsDefense ? 'def' : 'atk';
      g.log.push(`${target.name} was flipped face-up!`);
    }
    const defVal = targetIsDefense ? target.def : target.atk;
    if (targetIsDefense) {
      if (atkVal > defVal) {
        opp.graveyard.push(target);
        opp.monsters[data.targetIndex] = null;
        g.log.push(`${n[pi]}'s ${attacker.name} (${atkVal}) attacks ${target.name} (DEF ${defVal}). ${target.name} destroyed!`);
      } else if (defVal > atkVal) {
        const damage = defVal - atkVal;
        g.players[pi].lp = Math.max(0, g.players[pi].lp - damage);
        g.log.push(`${n[pi]}'s ${attacker.name} (${atkVal}) attacks ${target.name} (DEF ${defVal}). ${n[pi]} takes ${damage} damage!`);
        if (g.players[pi].lp <= 0) { this._trimLog(); return { gameOver: { winner: 1 - pi, reason: 'lp' } }; }
      } else {
        g.log.push(`${n[pi]}'s ${attacker.name} (${atkVal}) attacks ${target.name} (DEF ${defVal}). No damage.`);
      }
    } else {
      if (atkVal > defVal) {
        const damage = atkVal - defVal;
        opp.graveyard.push(target);
        opp.monsters[data.targetIndex] = null;
        opp.lp = Math.max(0, opp.lp - damage);
        g.log.push(`${n[pi]}'s ${attacker.name} (${atkVal}) attacks ${target.name} (ATK ${defVal}). ${target.name} destroyed! ${n[1-pi]} takes ${damage} damage.`);
        if (opp.lp <= 0) { this._trimLog(); return { gameOver: { winner: pi, reason: 'lp' } }; }
      } else if (defVal > atkVal) {
        const damage = defVal - atkVal;
        g.players[pi].graveyard.push(attacker);
        g.players[pi].monsters[data.attackerIndex] = null;
        g.players[pi].lp = Math.max(0, g.players[pi].lp - damage);
        g.log.push(`${n[pi]}'s ${attacker.name} (${atkVal}) attacks ${target.name} (ATK ${defVal}). ${attacker.name} destroyed! ${n[pi]} takes ${damage} damage.`);
        if (g.players[pi].lp <= 0) { this._trimLog(); return { gameOver: { winner: 1 - pi, reason: 'lp' } }; }
      } else {
        g.players[pi].graveyard.push(attacker);
        g.players[pi].monsters[data.attackerIndex] = null;
        opp.graveyard.push(target);
        opp.monsters[data.targetIndex] = null;
        g.log.push(`${n[pi]}'s ${attacker.name} (${atkVal}) attacks ${target.name} (ATK ${defVal}). Both destroyed!`);
      }
    }
    this._trimLog();
    return { ok: true };
  }

  flipCard(pi, data) {
    const s = this.game.players[pi];
    if (data.zone === 'monsters' && s.monsters[data.index]) {
      const m = s.monsters[data.index];
      if (m.position?.includes('facedown')) { m.position = m.position.replace('facedown-', ''); this.game.log.push(`${this.playerNames[pi]} flipped ${m.name} face-up!`); this._trimLog(); }
    }
    return { ok: true };
  }

  modifyLp(targetPlayer, amount) {
    this.game.players[targetPlayer].lp = Math.max(0, this.game.players[targetPlayer].lp + amount);
    const action = amount > 0 ? 'gained' : 'lost';
    this.game.log.push(`${this.playerNames[targetPlayer]} ${action} ${Math.abs(amount)} LP. (${this.game.players[targetPlayer].lp} LP)`);
    if (this.game.players[targetPlayer].lp <= 0) return { gameOver: { winner: 1 - targetPlayer, reason: 'lp' } };
    return { ok: true };
  }

  specialSummonExtra(pi, data) {
    const s = this.game.players[pi];
    const card = s.extraDeck[data.extraIndex];
    if (!card) return { error: 'No card' };
    if (data.zone === 'monsters' && s.monsters[data.zoneIndex] === null) {
      s.monsters[data.zoneIndex] = { ...card, position: data.position || 'atk', canAttack: true };
      s.extraDeck.splice(data.extraIndex, 1);
      this.game.log.push(`${this.playerNames[pi]} special summoned ${card.name} from Extra Deck!`);
      this._trimLog();
      return { ok: true };
    }
    return { error: 'Zone occupied' };
  }

  createToken(pi) {
    const s = this.game.players[pi];
    const idx = s.monsters.findIndex(m => m === null);
    if (idx < 0) return { error: 'No empty zone!' };
    s.monsters[idx] = { name: 'Token', atk: 0, def: 0, level: 1, type: 'Token', race: 'Fiend', attribute: 'DARK', position: 'atk', isToken: true, canAttack: true, card_images: [{ image_url_small: '' }] };
    this.game.log.push(`${this.playerNames[pi]} created a Token.`);
    return { ok: true };
  }

  _trimLog() { if (this.game.log.length > 50) this.game.log = this.game.log.slice(-50); }

  coinFlip(pi) { const r = Math.random() < 0.5 ? 'Heads' : 'Tails'; this.game.log.push(`${this.playerNames[pi]} flipped: ${r}!`); this._trimLog(); return r; }
  diceRoll(pi) { const r = Math.floor(Math.random() * 6) + 1; this.game.log.push(`${this.playerNames[pi]} rolled: ${r}!`); this._trimLog(); return r; }
  shuffleDeck(pi) { this.game.players[pi].deck = shuffleArray(this.game.players[pi].deck); this.game.log.push(`${this.playerNames[pi]} shuffled their deck.`); this._trimLog(); }
  effectDraw(pi) {
    const s = this.game.players[pi];
    if (s.deck.length === 0) { s.lp = 0; this.game.log.push(`${this.playerNames[pi]} decked out!`); return { gameOver: { winner: 1 - pi, reason: 'deckout' } }; }
    s.hand.push(s.deck.pop());
    this.game.log.push(`${this.playerNames[pi]} drew a card (by effect).`);
    this._trimLog();
    return { ok: true };
  }

  surrender(pi) { this.game.log.push(`${this.playerNames[pi]} surrendered!`); this._trimLog(); return { gameOver: { winner: 1 - pi, reason: 'surrender' } }; }

  sortHand(pi) {
    const s = this.game.players[pi];
    const typeOrder = (c) => { const t = (c.type || '').toLowerCase(); return t.includes('monster') ? 0 : t.includes('spell') ? 1 : t.includes('trap') ? 2 : 3; };
    s.hand.sort((a, b) => {
      const ta = typeOrder(a), tb = typeOrder(b);
      if (ta !== tb) return ta - tb;
      if ((b.level || 0) !== (a.level || 0)) return (b.level || 0) - (a.level || 0);
      if ((b.atk || 0) !== (a.atk || 0)) return (b.atk || 0) - (a.atk || 0);
      return (a.name || '').localeCompare(b.name || '');
    });
    this.game.log.push(`${this.playerNames[pi]} sorted their hand.`);
    this._trimLog();
    return { ok: true };
  }

  millTopCard(pi) {
    const s = this.game.players[pi];
    if (s.deck.length === 0) return { error: 'Deck is empty!' };
    const card = s.deck.pop();
    s.graveyard.push(card);
    this.game.log.push(`${this.playerNames[pi]} sent ${card.name} from top of deck to GY.`);
    this._trimLog();
    return { ok: true };
  }

  viewTopCard(pi) {
    const s = this.game.players[pi];
    if (s.deck.length === 0) return { error: 'Deck is empty!' };
    return { card: s.deck[s.deck.length - 1] };
  }

  getStateForPlayer(pi) {
    const g = this.game, opp = 1 - pi, my = g.players[pi], op = g.players[opp];
    return {
      turn: g.turn, currentPlayer: g.currentPlayer, phase: g.phase,
      log: g.log.slice(-30), started: g.started, myIndex: pi,
      players: this.playerNames,
      me: {
        lp: my.lp, hand: my.hand, deckCount: my.deck.length,
        monsters: my.monsters, spells: my.spells, fieldSpell: my.fieldSpell,
        graveyard: my.graveyard, banished: my.banished, extraDeck: my.extraDeck,
        hasDrawn: my.hasDrawn, hasNormalSummoned: my.hasNormalSummoned
      },
      opponent: {
        lp: op.lp, handCount: op.hand.length, deckCount: op.deck.length,
        monsters: op.monsters.map(m => {
          if (!m) return null;
          if (m.position?.includes('facedown')) return { position: m.position, hidden: true };
          return { ...m }; // expose ATK/DEF/name for visible monsters (needed for battle preview)
        }),
        spells: op.spells.map(s => { if (!s) return null; if (s.facedown) return { facedown: true, hidden: true }; return s; }),
        fieldSpell: op.fieldSpell ? (op.fieldSpell.facedown ? { facedown: true, hidden: true } : op.fieldSpell) : null,
        graveyardCount: op.graveyard.length, banishedCount: op.banished.length, extraDeckCount: op.extraDeck.length
      }
    };
  }

  getZone(targetPlayer, zone, requestingPlayer) {
    const s = this.game.players[targetPlayer];
    if (zone === 'graveyard') return s.graveyard;
    if (zone === 'banished') return s.banished;
    if (zone === 'extraDeck' && targetPlayer === requestingPlayer) return s.extraDeck;
    return [];
  }

  reset() {
    this.game = { turn: 0, currentPlayer: 0, phase: 'draw', players: [createPlayerState(), createPlayerState()], log: [], started: false };
  }
}
