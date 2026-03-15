export const YGOPRO_BASE = 'https://db.ygoprodeck.com/api/v7/cardinfo.php';
export const CORS_PROXIES = [
  '',  // try direct first
  'https://corsproxy.io/?',
  'https://api.allorigins.win/raw?url='
];
export const CARD_BACK = import.meta.env.BASE_URL + 'card-back.svg';

export const PRESETS = [
  { name: 'Blue-Eyes', archetype: 'Blue-Eyes', desc: 'Classic powerhouse dragons' },
  { name: 'Dark Magician', archetype: 'Dark Magician', desc: 'Spellcaster mastery' },
  { name: 'HERO', archetype: 'HERO', desc: 'Fusion-based heroes' },
  { name: 'Stardust', archetype: 'Stardust', desc: 'Synchro dragon power' },
  { name: 'Utopia', archetype: 'Utopia', desc: 'Xyz rank-up warriors' },
  { name: 'Salamangreat', archetype: 'Salamangreat', desc: 'Link-based fire cyberse' },
  { name: 'Sky Striker', archetype: 'Sky Striker', desc: 'Spell-heavy control' },
  { name: 'Dragonmaid', archetype: 'Dragonmaid', desc: 'Dragon-transforming maids' },
  { name: 'Eldlich', archetype: 'Eldlich', desc: 'Golden zombie control' },
  { name: 'Branded', archetype: 'Branded', desc: 'Fusion-centric strategy' },
];
