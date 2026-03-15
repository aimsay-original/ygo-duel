import { YGOPRO_BASE, CORS_PROXIES, CARD_BACK } from './constants';

export async function ygofetch(params) {
  const url = YGOPRO_BASE + '?' + params;
  for (const proxy of CORS_PROXIES) {
    try {
      const fetchUrl = proxy ? proxy + encodeURIComponent(url) : url;
      const res = await fetch(fetchUrl);
      if (!res.ok) continue;
      const data = await res.json();
      if (data.data) return data;
    } catch(e) {
      console.warn('Fetch failed with proxy:', proxy || 'direct', e.message);
      continue;
    }
  }
  throw new Error('All API attempts failed. Check your internet connection.');
}

export function cardImg(card) {
  if (!card) return CARD_BACK;
  if (card.card_images && card.card_images[0]) return card.card_images[0].image_url_small || card.card_images[0].image_url || CARD_BACK;
  if (card.image) return card.image;
  return CARD_BACK;
}

export function isExtraDeckCard(card) {
  if (!card || !card.type) return false;
  const t = card.type.toLowerCase();
  return t.includes('fusion') || t.includes('synchro') || t.includes('xyz') || t.includes('link');
}
