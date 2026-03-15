import { useState, useRef, useMemo } from 'react';
import { useSocketRef } from '../context/SocketContext';
import { ygofetch, cardImg, isExtraDeckCard } from '../helpers/cardHelpers';
import { PRESETS } from '../helpers/constants';

export default function DeckBuilder({ onDeckReady, playerName }) {
  const socketRef = useSocketRef();
  const [tab, setTab] = useState('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [mainDeck, setMainDeck] = useState([]);
  const [extraDeck, setExtraDeck] = useState([]);
  const [selectedCard, setSelectedCard] = useState(null);
  const [error, setError] = useState('');
  const searchTimeout = useRef(null);

  const searchCards = async (query) => {
    if (!query || query.length < 2) return;
    setLoading(true); setError('');
    try {
      const data = await ygofetch(`fname=${encodeURIComponent(query)}`);
      const results = (data.data || []).slice(0, 40);
      setSearchResults(results);
      if (results.length === 0) setError('No cards found');
    } catch(e) {
      setError(e.message || 'Search failed. Check connection.');
      setSearchResults([]);
    }
    setLoading(false);
  };

  const handleSearchInput = (val) => {
    setSearchQuery(val);
    setError('');
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => { if (val.length >= 3) searchCards(val); }, 600);
  };

  const addCard = (card) => {
    const count = [...mainDeck, ...extraDeck].filter(c => c.id === card.id).length;
    if (count >= 3) return;
    if (isExtraDeckCard(card)) { if (extraDeck.length >= 15) return; setExtraDeck([...extraDeck, card]); }
    else { if (mainDeck.length >= 60) return; setMainDeck([...mainDeck, card]); }
  };

  const removeCard = (card, fromExtra) => {
    if (fromExtra) { const i = extraDeck.findIndex(c => c.id === card.id); if (i >= 0) { const n = [...extraDeck]; n.splice(i,1); setExtraDeck(n); } }
    else { const i = mainDeck.findIndex(c => c.id === card.id); if (i >= 0) { const n = [...mainDeck]; n.splice(i,1); setMainDeck(n); } }
  };

  const submitDeck = () => {
    if (mainDeck.length < 1) { setError('Add at least some cards to your deck!'); return; }
    if (mainDeck.length < 40) { if (!confirm(`Your deck has ${mainDeck.length} cards (minimum is usually 40). Play anyway?`)) return; }
    const strip = c => ({ id: c.id, name: c.name, type: c.type, race: c.race, attribute: c.attribute, atk: c.atk, def: c.def, level: c.level, desc: c.desc, card_images: c.card_images });
    socketRef.current.emit('set-deck', { mainDeck: mainDeck.map(strip), extraDeck: extraDeck.map(strip), deckName: `${playerName}'s Deck` });
    onDeckReady();
  };

  const loadPreset = async (archetype) => {
    setLoading(true); setError('');
    try {
      const data = await ygofetch(`archetype=${encodeURIComponent(archetype)}`);
      if (data.data) {
        const main = [], extra = [], seen = {};
        for (const card of data.data) {
          if (!seen[card.id]) seen[card.id] = 0;
          if (seen[card.id] >= 3) continue; seen[card.id]++;
          if (isExtraDeckCard(card)) { if (extra.length < 15) extra.push(card); }
          else { if (main.length < 60) main.push(card); }
        }
        setMainDeck(main); setExtraDeck(extra); setTab('mydeck');
        if (main.length < 40) setError(`Loaded ${main.length} cards — you may need to search for more to reach 40.`);
      } else {
        setError('No cards found for this archetype.');
      }
    } catch(e) { setError(e.message || 'Failed to load preset. Check connection.'); }
    setLoading(false);
  };

  const deckCardCounts = useMemo(() => {
    const c = {}; [...mainDeck, ...extraDeck].forEach(card => { c[card.id] = (c[card.id] || 0) + 1; }); return c;
  }, [mainDeck, extraDeck]);

  return (
    <div className="deck-builder">
      <div className="db-header">
        <h2>Deck Builder</h2>
        <div className="db-header-btns">
          <button className="db-btn db-btn-secondary" onClick={() => { setMainDeck([]); setExtraDeck([]); }}>Clear</button>
          <button className="db-btn db-btn-primary" onClick={submitDeck}>Done ({mainDeck.length})</button>
        </div>
      </div>
      <div className="db-tabs">
        <div className={`db-tab ${tab==='search'?'active':''}`} onClick={()=>setTab('search')}>Search</div>
        <div className={`db-tab ${tab==='mydeck'?'active':''}`} onClick={()=>setTab('mydeck')}>My Deck ({mainDeck.length}+{extraDeck.length})</div>
        <div className={`db-tab ${tab==='presets'?'active':''}`} onClick={()=>setTab('presets')}>Quick Load</div>
      </div>
      {tab === 'search' && (<>
        <div className="db-search">
          <input placeholder="Search cards..." value={searchQuery} onChange={e=>handleSearchInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&searchCards(searchQuery)} />
          <button onClick={()=>searchCards(searchQuery)}>Go</button>
        </div>
        {loading ? <div className="db-loading">Searching...</div> : (
          <div className="db-card-grid">
            {searchResults.map(card => (
              <div key={card.id} className={`db-card ${deckCardCounts[card.id]?'selected':''}`} onClick={()=>setSelectedCard(card)}>
                <img src={cardImg(card)} alt={card.name} loading="lazy" />
                {deckCardCounts[card.id] > 0 && <div className="count-badge">{deckCardCounts[card.id]}</div>}
              </div>
            ))}
          </div>
        )}
      </>)}
      {tab === 'mydeck' && (
        <div className="db-card-grid">
          {mainDeck.map((card,i) => <div key={`m${i}`} className="db-card" onClick={()=>setSelectedCard({...card,_deckIndex:i,_deckType:'main'})}><img src={cardImg(card)} loading="lazy" /></div>)}
          {extraDeck.map((card,i) => <div key={`e${i}`} className="db-card" style={{borderColor:'rgba(200,100,255,0.4)'}} onClick={()=>setSelectedCard({...card,_deckIndex:i,_deckType:'extra'})}><img src={cardImg(card)} loading="lazy" /></div>)}
        </div>
      )}
      {tab === 'presets' && (
        <div className="preset-list">
          <div style={{padding:'10px',color:'#888',fontSize:'13px'}}>Tap an archetype to auto-load cards.</div>
          {PRESETS.map(p => <div key={p.archetype} className="preset-item" onClick={()=>loadPreset(p.archetype)}><h4>{p.name}</h4><p>{p.desc}</p></div>)}
        </div>
      )}
      {error && <div className="db-deck-summary" style={{color:'#ff4444'}}>{error}</div>}
      <div className="db-deck-summary">
        <span>Main: <span className="db-deck-count">{mainDeck.length}/40-60</span></span>
        <span>Extra: <span className="db-deck-count">{extraDeck.length}/15</span></span>
      </div>
      {selectedCard && (
        <div className="db-card-detail" onClick={e=>{if(e.target===e.currentTarget)setSelectedCard(null)}}>
          <img src={cardImg(selectedCard)} alt={selectedCard.name} />
          <h3>{selectedCard.name}</h3>
          {selectedCard.type && <p style={{color:'#ff8c00'}}>{selectedCard.type}</p>}
          {selectedCard.attribute && <p>{selectedCard.attribute} / {selectedCard.race}</p>}
          {selectedCard.atk !== undefined && <div className="stats">{selectedCard.level && `Level ${selectedCard.level} | `}ATK {selectedCard.atk} / DEF {selectedCard.def}</div>}
          {selectedCard.desc && <p style={{fontSize:'12px',maxWidth:'300px'}}>{selectedCard.desc}</p>}
          <div className="db-card-detail-btns">
            {selectedCard._deckType ?
              <button className="db-btn db-btn-secondary" style={{color:'#f44336'}} onClick={()=>{removeCard(selectedCard,selectedCard._deckType==='extra');setSelectedCard(null)}}>Remove</button> :
              <button className="db-btn db-btn-primary" onClick={()=>addCard(selectedCard)}>Add ({deckCardCounts[selectedCard.id]||0}/3)</button>
            }
            <button className="db-btn db-btn-secondary" onClick={()=>setSelectedCard(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
