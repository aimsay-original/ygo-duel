// Deck persistence via localStorage + shareable deck codes for cross-device sync

const STORAGE_KEY = 'ygo-saved-decks';

export function getSavedDecks() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveDeck(name, mainDeck, extraDeck) {
  const decks = getSavedDecks();
  const entry = {
    name,
    mainDeckIds: mainDeck.map(c => c.id),
    extraDeckIds: extraDeck.map(c => c.id),
    mainCount: mainDeck.length,
    extraCount: extraDeck.length,
    createdAt: Date.now()
  };
  // Replace if same name exists
  const idx = decks.findIndex(d => d.name === name);
  if (idx >= 0) decks[idx] = entry;
  else decks.push(entry);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(decks));
  return entry;
}

export function deleteSavedDeck(name) {
  const decks = getSavedDecks().filter(d => d.name !== name);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(decks));
}

// Encode deck as a shareable code (base64 of compact JSON)
export function encodeDeck(name, mainDeckIds, extraDeckIds) {
  const payload = JSON.stringify({ n: name, m: mainDeckIds, e: extraDeckIds });
  return btoa(payload);
}

// Decode a shareable code back to deck data
export function decodeDeck(code) {
  try {
    const cleaned = code.trim();
    const payload = JSON.parse(atob(cleaned));
    if (!payload.n || !Array.isArray(payload.m)) return null;
    return {
      name: payload.n,
      mainDeckIds: payload.m,
      extraDeckIds: payload.e || []
    };
  } catch {
    return null;
  }
}
