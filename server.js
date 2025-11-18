const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const Game = require('./game-logic');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Serve static files
app.use(express.static('public'));

// Game rooms
const games = new Map();

// Helper to get or create game
function getOrCreateGame(roomId) {
  if (!games.has(roomId)) {
    games.set(roomId, new Game(roomId));
  }
  return games.get(roomId);
}

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  let currentRoom = null;
  let playerName = null;

  // Join or create room
  socket.on('joinRoom', ({ roomId, name, winThreshold }) => {
    currentRoom = roomId;
    playerName = name;

    socket.join(roomId);
    const game = getOrCreateGame(roomId);

    // Set win threshold if new game
    if (game.players.length === 0 && winThreshold) {
      game.winThreshold = winThreshold;
    }

    const result = game.addPlayer(socket.id, name);

    if (result.success) {
      io.to(roomId).emit('playerJoined', {
        playerId: socket.id,
        playerName: name,
        gameState: game.getGameState()
      });

      socket.emit('joinedRoom', {
        success: true,
        gameState: game.getGameState(socket.id)
      });
    } else {
      socket.emit('joinedRoom', {
        success: false,
        message: result.message
      });
    }
  });

  // Start game
  socket.on('startGame', () => {
    if (!currentRoom) return;

    const game = games.get(currentRoom);
    if (!game) return;

    const result = game.startGame();

    if (result.success) {
      // Send individual game states to each player
      game.players.forEach(player => {
        io.to(player.id).emit('gameStarted', {
          gameState: game.getGameState(player.id)
        });
      });

      // Notify all about phase change
      io.to(currentRoom).emit('phaseChanged', {
        phase: 'vault',
        roundNumber: 1
      });
    } else {
      socket.emit('error', { message: result.message });
    }
  });

  // Vault phase actions
  socket.on('vaultAction', ({ action, cardIds }) => {
    if (!currentRoom) return;

    const game = games.get(currentRoom);
    if (!game) return;

    let result;
    if (action === 'add') {
      result = game.addToVault(socket.id, cardIds);
    } else if (action === 'remove') {
      result = game.removeFromVault(socket.id, cardIds);
    }

    if (result.success) {
      socket.emit('vaultUpdated', {
        gameState: game.getGameState(socket.id)
      });
    } else {
      socket.emit('error', { message: result.message });
    }
  });

  // Complete vault phase
  socket.on('completeVaultPhase', () => {
    if (!currentRoom) return;

    const game = games.get(currentRoom);
    if (!game) return;

    const result = game.completeVaultPhase(socket.id);

    if (result.allComplete) {
      // All players ready, start turn phase
      game.players.forEach(player => {
        io.to(player.id).emit('gameStateUpdate', {
          gameState: game.getGameState(player.id)
        });
      });

      io.to(currentRoom).emit('phaseChanged', {
        phase: 'turn',
        currentPlayerId: game.players[game.currentPlayerIndex].id
      });
    } else {
      socket.emit('vaultPhaseComplete', { waiting: true });
    }
  });

  // Draw cards during turn
  socket.on('drawCards', () => {
    if (!currentRoom) return;

    const game = games.get(currentRoom);
    if (!game) return;

    if (game.players[game.currentPlayerIndex].id !== socket.id) {
      socket.emit('error', { message: 'Not your turn' });
      return;
    }

    const player = game.getPlayer(socket.id);
    const cards = game.drawCards(2);
    player.hand.push(...cards);

    socket.emit('cardsDrawn', {
      cards,
      gameState: game.getGameState(socket.id)
    });

    // Update other players about deck size
    io.to(currentRoom).emit('gameStateUpdate', {
      gameState: game.getGameState()
    });
  });

  // Play action card
  socket.on('playAction', ({ cardId, targetPlayerId, data }) => {
    if (!currentRoom) return;

    const game = games.get(currentRoom);
    if (!game) return;

    if (game.players[game.currentPlayerIndex].id !== socket.id) {
      socket.emit('error', { message: 'Not your turn' });
      return;
    }

    const player = game.getPlayer(socket.id);
    const cardIndex = player.hand.findIndex(c => c.id === cardId);

    if (cardIndex === -1) {
      socket.emit('error', { message: 'Card not found' });
      return;
    }

    const card = player.hand[cardIndex];

    if (card.type !== 'action') {
      socket.emit('error', { message: 'Not an action card' });
      return;
    }

    // Remove card from hand and add to discard
    player.hand.splice(cardIndex, 1);
    game.discardPile.push(card);

    // Emit action event for client-side handling
    io.to(currentRoom).emit('actionPlayed', {
      playerId: socket.id,
      playerName: player.name,
      card,
      targetPlayerId,
      data
    });

    // Update game states
    game.players.forEach(p => {
      io.to(p.id).emit('gameStateUpdate', {
        gameState: game.getGameState(p.id)
      });
    });
  });

  // Discard cards
  socket.on('discardCards', ({ cardIds }) => {
    if (!currentRoom) return;

    const game = games.get(currentRoom);
    if (!game) return;

    const result = game.discardCards(socket.id, cardIds);

    if (result.success) {
      socket.emit('gameStateUpdate', {
        gameState: game.getGameState(socket.id)
      });

      io.to(currentRoom).emit('playerDiscarded', {
        playerId: socket.id,
        count: cardIds.length
      });
    } else {
      socket.emit('error', { message: result.message });
    }
  });

  // Trade cards
  socket.on('proposeTrade', ({ targetPlayerId, offeredCardIds, requestedCardIds }) => {
    if (!currentRoom) return;

    io.to(targetPlayerId).emit('tradeProposed', {
      fromPlayerId: socket.id,
      fromPlayerName: playerName,
      offeredCardIds,
      requestedCardIds
    });
  });

  socket.on('acceptTrade', ({ fromPlayerId, offeredCardIds, requestedCardIds }) => {
    if (!currentRoom) return;

    const game = games.get(currentRoom);
    if (!game) return;

    const player1 = game.getPlayer(fromPlayerId);
    const player2 = game.getPlayer(socket.id);

    if (!player1 || !player2) {
      socket.emit('error', { message: 'Players not found' });
      return;
    }

    // Transfer cards
    const p1Cards = [];
    const p2Cards = [];

    // Get cards from player 1
    for (const cardId of offeredCardIds) {
      const idx = player1.hand.findIndex(c => c.id === cardId);
      if (idx !== -1) {
        p1Cards.push(player1.hand.splice(idx, 1)[0]);
      }
    }

    // Get cards from player 2
    for (const cardId of requestedCardIds) {
      const idx = player2.hand.findIndex(c => c.id === cardId);
      if (idx !== -1) {
        p2Cards.push(player2.hand.splice(idx, 1)[0]);
      }
    }

    // Exchange
    player1.hand.push(...p2Cards);
    player2.hand.push(...p1Cards);

    // Update both players
    io.to(fromPlayerId).emit('tradeCompleted', {
      gameState: game.getGameState(fromPlayerId)
    });

    io.to(socket.id).emit('tradeCompleted', {
      gameState: game.getGameState(socket.id)
    });

    // Notify room
    io.to(currentRoom).emit('tradeAnnouncement', {
      player1: player1.name,
      player2: player2.name
    });
  });

  // End turn
  socket.on('endTurn', () => {
    if (!currentRoom) return;

    const game = games.get(currentRoom);
    if (!game) return;

    if (game.players[game.currentPlayerIndex].id !== socket.id) {
      socket.emit('error', { message: 'Not your turn' });
      return;
    }

    const result = game.nextTurn();

    if (result.newRound) {
      // Start new vault phase
      game.players.forEach(player => {
        io.to(player.id).emit('gameStateUpdate', {
          gameState: game.getGameState(player.id)
        });
      });

      io.to(currentRoom).emit('phaseChanged', {
        phase: 'vault',
        roundNumber: game.roundNumber
      });
    } else {
      // Next player's turn
      game.players.forEach(player => {
        io.to(player.id).emit('gameStateUpdate', {
          gameState: game.getGameState(player.id)
        });
      });

      io.to(currentRoom).emit('turnChanged', {
        currentPlayerId: game.players[game.currentPlayerIndex].id,
        currentPlayerName: game.players[game.currentPlayerIndex].name
      });
    }
  });

  // Declare victory
  socket.on('declareVictory', () => {
    if (!currentRoom) return;

    const game = games.get(currentRoom);
    if (!game) return;

    const result = game.declareVictory(socket.id);

    if (result.success) {
      const player = game.getPlayer(socket.id);
      io.to(currentRoom).emit('gameEnded', {
        winner: {
          id: socket.id,
          name: player.name,
          caravanType: result.caravanType,
          totalValue: result.totalValue,
          vault: player.vault
        }
      });
    } else {
      socket.emit('victoryFailed', {
        message: result.message,
        eliminated: result.eliminated
      });

      if (result.eliminated) {
        game.removePlayer(socket.id);
        io.to(currentRoom).emit('playerEliminated', {
          playerId: socket.id,
          playerName: playerName
        });
      }
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);

    if (currentRoom) {
      const game = games.get(currentRoom);
      if (game) {
        game.removePlayer(socket.id);

        if (game.players.length === 0) {
          games.delete(currentRoom);
        } else {
          io.to(currentRoom).emit('playerLeft', {
            playerId: socket.id,
            playerName,
            gameState: game.getGameState()
          });
        }
      }
    }
  });
});

// Use PORT from environment (for Render) or default to 3000
const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🍺 Merchant's Caravan tavern is open on port ${PORT}!`);
});
