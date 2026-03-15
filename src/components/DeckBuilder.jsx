import { useState, useRef, useMemo, useEffect } from 'react';
import { useSocketRef } from '../context/SocketContext';
import { ygofetch, cardImg, isExtraDeckCard } from '../helpers/cardHelpers';
import { PRESETS } from '../helpers/constants';
import { getSavedDecks, saveDeck, deleteSavedDeck, encodeDeck, decodeDeck } from '../helpers/deckStorage';

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
  const [successMsg, setSuccessMsg] = useState('');
  const searchTimeout = useRef(null);

  // Saved decks state
  const [savedDecks, setSavedDecks] = useState([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [importCode, setImportCode] = useState('');
  const [copied, setCopied] = useState(null); // deck name that was just copied

  // Load saved decks on mount
  useEffect(() => {
    setSavedDecks(getSavedDecks());
  }, []);

  // Auto-clear success message
  useEffect(() => {
    if (successMsg) {
      const t = setTimeout(() => setSuccessMsg(''), 3000);
      return () => clearTimeout(t);
    }
  }, [successMsg]);

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
    setLoading(true); setError(''); setSuccessMsg('');
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
        const total = main.length + extra.length;
        if (main.length < 40) {
          setSuccessMsg(`Loaded ${total} ${archetype} cards. Search for more to reach 40!`);
        } else {
          setSuccessMsg(`Loaded ${total} ${archetype} cards! Edit below or tap Done.`);
        }
      } else {
        setError('No cards found for this archetype.');
      }
    } catch(e) { setError(e.message || 'Failed to load preset. Check connection.'); }
    setLoading(false);
  };

  // Hydrate card IDs into full card objects via batch API call
  const hydrateCardIds = async (mainIds, extraIds) => {
    const allIds = [...mainIds, ...extraIds];
    if (allIds.length === 0) return { main: [], extra: [] };

    // Deduplicate for the API call
    const uniqueIds = [...new Set(allIds)];
    const data = await ygofetch(`id=${uniqueIds.join(',')}`);
    if (!data.data) throw new Error('Failed to fetch card data');

    // Build lookup map
    const cardMap = {};
    for (const card of data.data) cardMap[card.id] = card;

    // Rebuild arrays preserving duplicates
    const main = mainIds.map(id => cardMap[id]).filter(Boolean);
    const extra = extraIds.map(id => cardMap[id]).filter(Boolean);
    return { main, extra };
  };

  const loadSavedDeck = async (deck) => {
    setLoading(true); setError(''); setSuccessMsg('');
    try {
      const { main, extra } = await hydrateCardIds(deck.mainDeckIds, deck.extraDeckIds);
      setMainDeck(main);
      setExtraDeck(extra);
      setTab('mydeck');
      setSuccessMsg(`Loaded "${deck.name}" (${main.length}+${extra.length} cards). Edit or tap Done!`);
    } catch(e) {
      setError('Failed to load deck: ' + (e.message || 'Check connection'));
    }
    setLoading(false);
  };

  const handleSaveDeck = () => {
    if (!saveName.trim()) return;
    if (mainDeck.length === 0 && extraDeck.length === 0) {
      setError('Add cards before saving!');
      setShowSaveModal(false);
      return;
    }
    saveDeck(saveName.trim(), mainDeck, extraDeck);
    setSavedDecks(getSavedDecks());
    setSuccessMsg(`Saved "${saveName.trim()}" (${mainDeck.length}+${extraDeck.length} cards)`);
    setShowSaveModal(false);
    setSaveName('');
  };

  const handleDeleteDeck = (deckName) => {
    deleteSavedDeck(deckName);
    setSavedDecks(getSavedDecks());
    setSuccessMsg(`Deleted "${deckName}"`);
  };

  const handleShareDeck = (deck) => {
    const code = encodeDeck(deck.name, deck.mainDeckIds, deck.extraDeckIds);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code).then(() => {
        setCopied(deck.name);
        setTimeout(() => setCopied(null), 2000);
      }).catch(() => {});
    } else {
      const el = document.createElement('textarea');
      el.value = code; el.style.position = 'fixed'; el.style.opacity = '0';
      document.body.appendChild(el); el.select();
      document.execCommand('copy'); document.body.removeChild(el);
      setCopied(deck.name);
      setTimeout(() => setCopied(null), 2000);
    }
  };

  const handleImportDeck = async () => {
    if (!importCode.trim()) { setError('Paste a deck code first'); return; }
    const decoded = decodeDeck(importCode.trim());
    if (!decoded) { setError('Invalid deck code. Check and try again.'); return; }

    setLoading(true); setError(''); setSuccessMsg('');
    try {
      const { main, extra } = await hydrateCardIds(decoded.mainDeckIds, decoded.extraDeckIds);
      setMainDeck(main);
      setExtraDeck(extra);
      setTab('mydeck');
      setImportCode('');
      // Also save it locally
      saveDeck(decoded.name, main, extra);
      setSavedDecks(getSavedDecks());
      setSuccessMsg(`Imported "${decoded.name}" (${main.length}+${extra.length} cards) and saved!`);
    } catch(e) {
      setError('Failed to import: ' + (e.message || 'Check connection'));
    }
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
          <button className="db-btn db-btn-secondary" onClick={() => {
            if (mainDeck.length === 0 && extraDeck.length === 0) { setError('Add cards before saving!'); return; }
            setSaveName(''); setShowSaveModal(true);
          }}>Save</button>
          <button className="db-btn db-btn-primary" onClick={submitDeck}>Done ({mainDeck.length})</button>
        </div>
      </div>
      <div className="db-tabs">
        <div className={`db-tab ${tab==='search'?'active':''}`} onClick={()=>setTab('search')}>Search</div>
        <div className={`db-tab ${tab==='mydeck'?'active':''}`} onClick={()=>setTab('mydeck')}>My Deck ({mainDeck.length}+{extraDeck.length})</div>
        <div className={`db-tab ${tab==='presets'?'active':''}`} onClick={()=>setTab('presets')}>Quick Load</div>
      </div>

      {successMsg && <div className="db-success-msg">{successMsg}</div>}

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
          {/* Saved Decks Section */}
          {savedDecks.length > 0 && (
            <>
              <div className="preset-section-title">Your Saved Decks</div>
              {savedDecks.map(d => (
                <div key={d.name} className="saved-deck-item">
                  <div className="saved-deck-info" onClick={() => loadSavedDeck(d)}>
                    <h4>{d.name}</h4>
                    <p>{d.mainCount || d.mainDeckIds?.length || 0}+{d.extraCount || d.extraDeckIds?.length || 0} cards</p>
                  </div>
                  <div className="saved-deck-actions">
                    <button className="saved-deck-btn share" onClick={(e) => { e.stopPropagation(); handleShareDeck(d); }}>
                      {copied === d.name ? 'Copied!' : 'Share'}
                    </button>
                    <button className="saved-deck-btn delete" onClick={(e) => { e.stopPropagation(); handleDeleteDeck(d.name); }}>
                      &times;
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Import Deck Code Section */}
          <div className="preset-section-title">Import Deck Code</div>
          <div className="import-deck-area">
            <input
              className="import-input"
              placeholder="Paste deck code here..."
              value={importCode}
              onChange={e => { setImportCode(e.target.value); setError(''); }}
            />
            <button className="db-btn db-btn-primary import-btn" onClick={handleImportDeck}>Import</button>
          </div>

          {/* Preset Decks Section */}
          <div className="preset-section-title">Preset Decks</div>
          <div style={{padding:'0 10px 5px',color:'#666',fontSize:'12px'}}>Tap to auto-load cards into your deck</div>
          {PRESETS.map(p => (
            <div key={p.archetype} className="preset-item" onClick={()=>loadPreset(p.archetype)}>
              <h4>{p.name}</h4>
              <p>{p.desc}</p>
            </div>
          ))}
        </div>
      )}

      {error && <div className="db-deck-summary" style={{color:'#ff4444'}}>{error}</div>}
      <div className="db-deck-summary">
        <span>Main: <span className="db-deck-count">{mainDeck.length}/40-60</span></span>
        <span>Extra: <span className="db-deck-count">{extraDeck.length}/15</span></span>
      </div>

      {/* Card Detail Modal */}
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

      {/* Save Deck Modal */}
      {showSaveModal && (
        <div className="save-modal-overlay" onClick={e=>{if(e.target===e.currentTarget)setShowSaveModal(false)}}>
          <div className="save-modal">
            <h3>Save Deck</h3>
            <p className="save-modal-info">{mainDeck.length} main + {extraDeck.length} extra deck cards</p>
            <input
              className="save-modal-input"
              placeholder="Deck name..."
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              maxLength={30}
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleSaveDeck()}
            />
            <div className="save-modal-btns">
              <button className="db-btn db-btn-primary" onClick={handleSaveDeck}>Save</button>
              <button className="db-btn db-btn-secondary" onClick={() => setShowSaveModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {loading && tab === 'presets' && <div className="db-loading">Loading deck...</div>}
    </div>
  );
}
