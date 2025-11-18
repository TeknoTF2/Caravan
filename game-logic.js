const { generateDeck, shuffleDeck } = require('./game-data.js');

class Game {
  constructor(roomId, winThreshold = 350) {
    this.roomId = roomId;
    this.players = [];
    this.deck = [];
    this.discardPile = [];
    this.currentPlayerIndex = 0;
    this.phase = 'waiting'; // waiting, vault, turn, ended
    this.winThreshold = winThreshold;
    this.roundNumber = 1;
    this.vaultPhaseComplete = {};
    this.winner = null;
  }

  addPlayer(playerId, playerName) {
    if (this.players.length >= 4) {
      return { success: false, message: 'Room is full' };
    }

    if (this.players.find(p => p.id === playerId)) {
      return { success: false, message: 'Player already in game' };
    }

    this.players.push({
      id: playerId,
      name: playerName,
      hand: [],
      vault: [],
      vaultCaravanType: null,
      isReady: false
    });

    return { success: true };
  }

  removePlayer(playerId) {
    this.players = this.players.filter(p => p.id !== playerId);
    if (this.players.length === 0) {
      this.phase = 'waiting';
    }
  }

  startGame() {
    if (this.players.length < 2) {
      return { success: false, message: 'Need at least 2 players' };
    }

    // Initialize deck
    this.deck = shuffleDeck(generateDeck());
    this.discardPile = [];

    // Deal 10 cards to each player
    this.players.forEach(player => {
      player.hand = this.drawCards(10);
      player.vault = [];
      player.vaultCaravanType = null;
    });

    // Randomly select first player
    this.currentPlayerIndex = Math.floor(Math.random() * this.players.length);
    this.phase = 'vault';
    this.roundNumber = 1;
    this.vaultPhaseComplete = {};

    return { success: true };
  }

  drawCards(count) {
    const cards = [];
    for (let i = 0; i < count; i++) {
      if (this.deck.length === 0) {
        this.reshuffleDeck();
      }
      if (this.deck.length > 0) {
        cards.push(this.deck.pop());
      }
    }
    return cards;
  }

  reshuffleDeck() {
    if (this.discardPile.length > 0) {
      this.deck = shuffleDeck(this.discardPile);
      this.discardPile = [];
    }
  }

  getPlayer(playerId) {
    return this.players.find(p => p.id === playerId);
  }

  addToVault(playerId, cardIds) {
    const player = this.getPlayer(playerId);
    if (!player) return { success: false, message: 'Player not found' };

    const cards = [];
    for (const cardId of cardIds) {
      const cardIndex = player.hand.findIndex(c => c.id === cardId);
      if (cardIndex === -1) {
        return { success: false, message: 'Card not in hand' };
      }
      cards.push(player.hand[cardIndex]);
    }

    // Check caravan type consistency
    const commodityCards = cards.filter(c => c.type === 'commodity');
    if (commodityCards.length > 0) {
      const caravanType = commodityCards[0].caravanType;

      // Check if all cards match the type
      if (!commodityCards.every(c => c.caravanType === caravanType)) {
        return { success: false, message: 'All commodity cards must be same type' };
      }

      // Set or verify vault caravan type
      if (player.vaultCaravanType === null) {
        player.vaultCaravanType = caravanType;
      } else if (player.vaultCaravanType !== caravanType) {
        return { success: false, message: 'Cards do not match your vault caravan type' };
      }
    }

    // Move cards from hand to vault
    for (const cardId of cardIds) {
      const cardIndex = player.hand.findIndex(c => c.id === cardId);
      const [card] = player.hand.splice(cardIndex, 1);
      player.vault.push(card);
    }

    return { success: true };
  }

  removeFromVault(playerId, cardIds) {
    const player = this.getPlayer(playerId);
    if (!player) return { success: false, message: 'Player not found' };

    for (const cardId of cardIds) {
      const cardIndex = player.vault.findIndex(c => c.id === cardId);
      if (cardIndex === -1) {
        return { success: false, message: 'Card not in vault' };
      }
      const [card] = player.vault.splice(cardIndex, 1);
      player.hand.push(card);
    }

    return { success: true };
  }

  completeVaultPhase(playerId) {
    this.vaultPhaseComplete[playerId] = true;

    // Check if all players completed vault phase
    if (this.players.every(p => this.vaultPhaseComplete[p.id])) {
      this.phase = 'turn';
      this.vaultPhaseComplete = {};
      return { allComplete: true };
    }

    return { allComplete: false };
  }

  declareVictory(playerId) {
    const player = this.getPlayer(playerId);
    if (!player) return { success: false, message: 'Player not found' };

    const commodityCards = player.vault.filter(c => c.type === 'commodity');

    if (!player.vaultCaravanType) {
      return { success: false, message: 'No caravan type set', eliminated: true };
    }

    // Check all cards match declared type
    if (!commodityCards.every(c => c.caravanType === player.vaultCaravanType)) {
      return { success: false, message: 'Mixed caravan types in vault', eliminated: true };
    }

    // Calculate total value
    const totalValue = commodityCards.reduce((sum, card) => sum + card.value, 0);

    if (totalValue < this.winThreshold) {
      return { success: false, message: 'Insufficient gold value', totalValue, eliminated: true };
    }

    this.winner = playerId;
    this.phase = 'ended';
    return { success: true, totalValue, caravanType: player.vaultCaravanType };
  }

  discardCards(playerId, cardIds) {
    const player = this.getPlayer(playerId);
    if (!player) return { success: false, message: 'Player not found' };

    for (const cardId of cardIds) {
      const cardIndex = player.hand.findIndex(c => c.id === cardId);
      if (cardIndex === -1) {
        return { success: false, message: 'Card not in hand' };
      }
      const [card] = player.hand.splice(cardIndex, 1);
      this.discardPile.push(card);
    }

    return { success: true };
  }

  nextTurn() {
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;

    // Check if round completed
    if (this.currentPlayerIndex === 0) {
      this.roundNumber++;
      this.phase = 'vault';
      this.vaultPhaseComplete = {};
      return { newRound: true };
    }

    return { newRound: false };
  }

  getGameState(forPlayerId = null) {
    return {
      roomId: this.roomId,
      phase: this.phase,
      currentPlayerIndex: this.currentPlayerIndex,
      currentPlayerId: this.players[this.currentPlayerIndex]?.id,
      roundNumber: this.roundNumber,
      winThreshold: this.winThreshold,
      deckSize: this.deck.length,
      discardPileSize: this.discardPile.length,
      discardPileTop: this.discardPile[this.discardPile.length - 1] || null,
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        handSize: p.hand.length,
        vaultSize: p.vault.length,
        hand: forPlayerId === p.id ? p.hand : null,
        vault: forPlayerId === p.id ? p.vault : null,
        vaultCaravanType: forPlayerId === p.id ? p.vaultCaravanType : null
      })),
      winner: this.winner
    };
  }
}

module.exports = Game;
