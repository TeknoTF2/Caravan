// Game data for Merchant's Caravan

const COMMODITY_TYPES = {
  TEXTILES: 'TEXTILES',
  METALS: 'METALS',
  SPICES: 'SPICES',
  JEWELRY: 'JEWELRY',
  MONSTER_PARTS: 'MONSTER_PARTS'
};

const COMMODITIES = {
  // TEXTILES (31 cards, 465g total)
  TEXTILES: [
    { name: 'Cotton', value: 2, count: 13 },
    { name: 'Linen', value: 8, count: 10 },
    { name: 'Wool', value: 20, count: 5 },
    { name: 'Silk', value: 60, count: 2 },
    { name: 'Celestial Silk', value: 80, count: 1 }
  ],
  // METALS (31 cards, 555g total)
  METALS: [
    { name: 'Copper Ore', value: 2, count: 11 },
    { name: 'Iron Ore', value: 10, count: 9 },
    { name: 'Silver Ore', value: 25, count: 7 },
    { name: 'Gold Ore', value: 60, count: 3 },
    { name: 'Prismatic Ore', value: 120, count: 1 }
  ],
  // SPICES (31 cards, 545g total)
  SPICES: [
    { name: 'Pepper', value: 3, count: 12 },
    { name: 'Cinnamon', value: 15, count: 7 },
    { name: 'Saffron', value: 50, count: 6 },
    { name: 'Voidspice', value: 80, count: 4 },
    { name: "Dragon's Breath", value: 100, count: 2 }
  ],
  // JEWELRY (31 cards, 595g total)
  JEWELRY: [
    { name: 'Copper Rings', value: 5, count: 11 },
    { name: 'Silver Chains', value: 15, count: 9 },
    { name: 'Gold Necklaces', value: 35, count: 6 },
    { name: 'Gemstone Brooches', value: 100, count: 3 },
    { name: 'Royal Crowns', value: 180, count: 2 }
  ],
  // MONSTER PARTS (31 cards, 695g total)
  MONSTER_PARTS: [
    { name: 'Goblin Teeth', value: 2, count: 16 },
    { name: 'Troll Blood', value: 15, count: 9 },
    { name: 'Wyvern Scales', value: 60, count: 4 },
    { name: 'Dragon Heart', value: 200, count: 1 },
    { name: 'Behemoth Core', value: 250, count: 1 }
  ]
};

const ACTION_CARDS = [
  {
    name: 'Thief',
    count: 10,
    description: 'Target player shuffles their hand face-down. You randomly select 1 card from their hand.'
  },
  {
    name: 'Fire',
    count: 9,
    description: 'Target player discards 2 cards of their choice.'
  },
  {
    name: 'Smuggler',
    count: 8,
    description: 'Draw 3 cards, then discard 1 card of your choice.'
  },
  {
    name: 'Audit',
    count: 6,
    description: "Look at target player's hand."
  },
  {
    name: 'Market Day',
    count: 5,
    description: 'All players simultaneously reveal 1 card from hand. Auction revealed cards one at a time.'
  },
  {
    name: 'Tax Day',
    count: 4,
    description: 'All players discard 2 cards. Shuffle all discarded cards together and redistribute evenly.'
  },
  {
    name: 'Fence',
    count: 3,
    description: 'Swap 1 card from your vault with 1 card from your hand. Play during your regular turn only.'
  }
];

// Generate full deck
function generateDeck() {
  const deck = [];
  let cardId = 0;

  // Add commodity cards
  for (const [type, commodities] of Object.entries(COMMODITIES)) {
    for (const commodity of commodities) {
      for (let i = 0; i < commodity.count; i++) {
        deck.push({
          id: cardId++,
          type: 'commodity',
          caravanType: type,
          name: commodity.name,
          value: commodity.value
        });
      }
    }
  }

  // Add action cards
  for (const action of ACTION_CARDS) {
    for (let i = 0; i < action.count; i++) {
      deck.push({
        id: cardId++,
        type: 'action',
        name: action.name,
        description: action.description
      });
    }
  }

  return deck;
}

// Shuffle function
function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Export for both Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    COMMODITY_TYPES,
    COMMODITIES,
    ACTION_CARDS,
    generateDeck,
    shuffleDeck
  };
}
