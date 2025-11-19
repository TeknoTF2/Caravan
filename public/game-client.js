// Client-side game logic for Merchant's Caravan

const socket = io();

// State
let currentPlayerId = null;
let currentPlayerName = null;
let currentRoomId = null;
let gameState = null;
let selectedCards = [];
let pendingAction = null;

// DOM Elements
const screens = {
    lobby: document.getElementById('lobby-screen'),
    waiting: document.getElementById('waiting-room'),
    game: document.getElementById('game-screen'),
    gameOver: document.getElementById('game-over-screen')
};

// Show screen
function showScreen(screenName) {
    Object.values(screens).forEach(screen => screen.classList.remove('active'));
    screens[screenName].classList.add('active');
}

// Show toast notification
function showToast(message, duration = 3000) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), duration);
}

// Show modal
function showModal(title, body, onConfirm, onCancel) {
    const modal = document.getElementById('modal-overlay');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const confirmBtn = document.getElementById('modal-confirm');
    const cancelBtn = document.getElementById('modal-cancel');

    modalTitle.textContent = title;
    modalBody.innerHTML = body;

    confirmBtn.onclick = () => {
        modal.classList.remove('active');
        if (onConfirm) onConfirm();
    };

    cancelBtn.onclick = () => {
        modal.classList.remove('active');
        if (onCancel) onCancel();
    };

    modal.classList.add('active');
}

function hideModal() {
    document.getElementById('modal-overlay').classList.remove('active');
}

// Join room
document.getElementById('join-btn').addEventListener('click', () => {
    const name = document.getElementById('player-name').value.trim();
    const roomId = document.getElementById('room-id').value.trim();
    const winThreshold = parseInt(document.getElementById('win-threshold').value);

    if (!name || !roomId) {
        showToast('Please enter your name and room code');
        return;
    }

    currentPlayerName = name;
    currentRoomId = roomId;

    socket.emit('joinRoom', { roomId, name, winThreshold });
});

// Socket event: Joined room successfully
socket.on('joinedRoom', (data) => {
    if (data.success) {
        currentPlayerId = socket.id;
        document.getElementById('room-code').textContent = currentRoomId;
        document.getElementById('threshold-display').textContent = data.gameState.winThreshold;
        showScreen('waiting');
        updateWaitingRoom(data.gameState);
    } else {
        showToast(data.message);
    }
});

// Socket event: Player joined
socket.on('playerJoined', (data) => {
    showToast(`${data.playerName} joined the room`);
    updateWaitingRoom(data.gameState);
});

// Socket event: Player left
socket.on('playerLeft', (data) => {
    showToast(`${data.playerName} left the room`);
    if (data.gameState) {
        updateWaitingRoom(data.gameState);
    }
});

// Update waiting room
function updateWaitingRoom(state) {
    const playersList = document.getElementById('players-list');
    const startBtn = document.getElementById('start-game-btn');

    playersList.innerHTML = '';

    state.players.forEach(player => {
        const playerItem = document.createElement('div');
        playerItem.className = 'player-item';
        playerItem.textContent = player.name + (player.id === currentPlayerId ? ' (You)' : '');
        playersList.appendChild(playerItem);
    });

    if (state.players.length >= 2 && state.players.length <= 5) {
        startBtn.disabled = false;
        startBtn.textContent = `Start Game (${state.players.length} players)`;
    } else {
        startBtn.disabled = true;
        startBtn.textContent = `Start Game (need 2-5 players)`;
    }
}

// Start game
document.getElementById('start-game-btn').addEventListener('click', () => {
    socket.emit('startGame');
});

// Socket event: Game started
socket.on('gameStarted', (data) => {
    gameState = data.gameState;
    showScreen('game');
    updateGameUI();
    showToast('Game started! Vault phase begins.');
});

// Socket event: Phase changed
socket.on('phaseChanged', (data) => {
    showToast(`Phase: ${data.phase.toUpperCase()}${data.roundNumber ? ' - Round ' + data.roundNumber : ''}`);
    if (gameState) {
        gameState.phase = data.phase;
        gameState.roundNumber = data.roundNumber;
        updateGameUI();
    }
});

// Socket event: Game state update
socket.on('gameStateUpdate', (data) => {
    gameState = data.gameState;
    updateGameUI();
});

// Update entire game UI
function updateGameUI() {
    if (!gameState) return;

    // Update header
    document.getElementById('round-number').textContent = gameState.roundNumber;
    document.getElementById('current-phase').textContent = gameState.phase.toUpperCase();
    document.getElementById('game-threshold').textContent = gameState.winThreshold + 'g';
    document.getElementById('deck-size').textContent = gameState.deckSize;

    const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayerId);
    document.getElementById('current-player').textContent = currentPlayer ? currentPlayer.name : '-';

    // Update other players
    updateOtherPlayers();

    // Update player's hand and vault
    const myData = gameState.players.find(p => p.id === currentPlayerId);
    if (myData) {
        updatePlayerHand(myData.hand);
        updatePlayerVault(myData.vault, myData.vaultCaravanType);
    }

    // Update action panel based on phase
    updateActionPanel();

    // Clear selections
    selectedCards = [];
}

// Update other players display
function updateOtherPlayers() {
    const container = document.getElementById('other-players');
    container.innerHTML = '';

    gameState.players.forEach(player => {
        if (player.id === currentPlayerId) return;

        const card = document.createElement('div');
        card.className = 'opponent-card';
        if (player.id === gameState.currentPlayerId) {
            card.classList.add('current-turn');
        }

        card.innerHTML = `
            <h4>${player.name}</h4>
            <div class="stat"><span>Hand:</span><span>${player.handSize}</span></div>
            <div class="stat"><span>Vault:</span><span>${player.vaultSize}</span></div>
        `;

        container.appendChild(card);
    });
}

// Update player's hand
function updatePlayerHand(hand) {
    if (!hand) return;

    const container = document.getElementById('player-hand');
    document.getElementById('hand-count').textContent = hand.length;

    container.innerHTML = '';

    hand.forEach(card => {
        const cardEl = createCardElement(card);
        cardEl.addEventListener('click', () => toggleCardSelection(card, cardEl));
        container.appendChild(cardEl);
    });
}

// Update player's vault
function updatePlayerVault(vault, vaultType) {
    if (!vault) return;

    const container = document.getElementById('player-vault');
    document.getElementById('vault-count').textContent = vault.length;
    document.getElementById('vault-type').textContent = vaultType || 'Not Set';

    container.innerHTML = '';

    vault.forEach(card => {
        const cardEl = createCardElement(card);
        cardEl.addEventListener('click', () => toggleCardSelection(card, cardEl));
        container.appendChild(cardEl);
    });
}

// Create card element
function createCardElement(card) {
    const cardEl = document.createElement('div');
    cardEl.className = `card ${card.type}`;
    cardEl.dataset.cardId = card.id;

    if (card.type === 'commodity') {
        cardEl.classList.add(card.caravanType);
        cardEl.innerHTML = `
            <div class="card-name">${card.name}</div>
            <div class="card-value">${card.value}g</div>
            <div class="card-type">${card.caravanType.replace('_', ' ')}</div>
        `;
    } else if (card.type === 'action') {
        cardEl.innerHTML = `
            <div class="card-name">${card.name}</div>
            <div class="card-description">${card.description}</div>
        `;
    }

    return cardEl;
}

// Toggle card selection
function toggleCardSelection(card, cardEl) {
    const index = selectedCards.findIndex(c => c.id === card.id);

    if (index !== -1) {
        selectedCards.splice(index, 1);
        cardEl.classList.remove('selected');
    } else {
        selectedCards.push(card);
        cardEl.classList.add('selected');
    }
}

// Update action panel based on phase and turn
function updateActionPanel() {
    const panel = document.getElementById('phase-actions');
    panel.innerHTML = '';

    const isMyTurn = gameState.currentPlayerId === currentPlayerId;

    if (gameState.phase === 'vault') {
        // Vault phase buttons
        const addBtn = createButton('Add to Vault', () => handleVaultAdd());
        const removeBtn = createButton('Remove from Vault', () => handleVaultRemove());
        const completeBtn = createButton('Complete Vault Phase', () => socket.emit('completeVaultPhase'));
        const declareBtn = createButton('Declare Victory!', () => socket.emit('declareVictory'), 'secondary');

        panel.appendChild(addBtn);
        panel.appendChild(removeBtn);
        panel.appendChild(completeBtn);
        panel.appendChild(declareBtn);
    } else if (gameState.phase === 'turn') {
        if (isMyTurn) {
            const drawBtn = createButton('Draw 2 Cards', () => socket.emit('drawCards'));
            const playActionBtn = createButton('Play Action Card', () => handlePlayAction());
            const tradeBtn = createButton('Propose Trade', () => handleTrade());
            const discardBtn = createButton('Discard Cards', () => handleDiscard());
            const endTurnBtn = createButton('End Turn', () => handleEndTurn());

            panel.appendChild(drawBtn);
            panel.appendChild(playActionBtn);
            panel.appendChild(tradeBtn);
            panel.appendChild(discardBtn);
            panel.appendChild(endTurnBtn);
        } else {
            const waitMsg = document.createElement('p');
            waitMsg.textContent = 'Waiting for other players...';
            waitMsg.style.color = 'var(--tavern-gold)';
            waitMsg.style.textAlign = 'center';
            panel.appendChild(waitMsg);
        }
    }
}

// Create button helper
function createButton(text, onClick, className = '') {
    const btn = document.createElement('button');
    btn.className = `tavern-btn small ${className}`;
    btn.textContent = text;
    btn.onclick = onClick;
    return btn;
}

// Handle vault add
function handleVaultAdd() {
    if (selectedCards.length === 0) {
        showToast('Select cards from your hand to add to vault');
        return;
    }

    if (selectedCards.length > 2) {
        showToast('You can only add up to 2 cards per vault phase');
        return;
    }

    socket.emit('vaultAction', {
        action: 'add',
        cardIds: selectedCards.map(c => c.id)
    });

    selectedCards = [];
}

// Handle vault remove
function handleVaultRemove() {
    if (selectedCards.length === 0) {
        showToast('Select cards from your vault to remove');
        return;
    }

    if (selectedCards.length > 2) {
        showToast('You can only remove up to 2 cards per vault phase');
        return;
    }

    socket.emit('vaultAction', {
        action: 'remove',
        cardIds: selectedCards.map(c => c.id)
    });

    selectedCards = [];
}

// Socket event: Vault updated
socket.on('vaultUpdated', (data) => {
    gameState = data.gameState;
    updateGameUI();
    showToast('Vault updated');
});

// Socket event: Cards drawn
socket.on('cardsDrawn', (data) => {
    gameState = data.gameState;
    updateGameUI();
    showToast(`Drew ${data.cards.length} cards`);
    // Force re-render of action panel to prevent soft-lock
    setTimeout(() => updateActionPanel(), 100);
});

// Handle play action
function handlePlayAction() {
    if (selectedCards.length !== 1) {
        showToast('Select exactly 1 action card to play');
        return;
    }

    const card = selectedCards[0];

    if (card.type !== 'action') {
        showToast('Selected card is not an action card');
        return;
    }

    // Handle different action types
    switch (card.name) {
        case 'Thief':
            handleThiefCard(card);
            break;
        case 'Fire':
            handleFireCard(card);
            break;
        case 'Smuggler':
            handleSmugglerCard(card);
            break;
        case 'Audit':
            handleAuditCard(card);
            break;
        case 'Fence':
            handleFenceCard(card);
            break;
        case 'Market Day':
            handleMarketDayCard(card);
            break;
        case 'Tax Day':
            handleTaxDayCard(card);
            break;
        default:
            showToast('Unknown action card');
    }
}

// Thief: Target player shuffles hand, you randomly steal 1 card
function handleThiefCard(card) {
    selectTargetPlayer((targetId) => {
        showModal(
            'Playing Thief',
            `<p>You will randomly steal 1 card from the target player's hand.</p><p>Continue?</p>`,
            () => {
                socket.emit('playAction', {
                    cardId: card.id,
                    targetPlayerId: targetId,
                    actionType: 'thief'
                });
                selectedCards = [];
            },
            () => selectedCards = []
        );
    });
}

// Fire: Target player discards 2 cards
function handleFireCard(card) {
    selectTargetPlayer((targetId) => {
        showModal(
            'Playing Fire',
            `<p>Target player will discard 2 cards of their choice.</p><p>Continue?</p>`,
            () => {
                socket.emit('playAction', {
                    cardId: card.id,
                    targetPlayerId: targetId,
                    actionType: 'fire'
                });
                selectedCards = [];
            },
            () => selectedCards = []
        );
    });
}

// Smuggler: Draw 3 cards, then discard 1
function handleSmugglerCard(card) {
    showModal(
        'Playing Smuggler',
        `<p>You will draw 3 cards, then choose 1 card to discard.</p><p>Continue?</p>`,
        () => {
            socket.emit('playAction', {
                cardId: card.id,
                actionType: 'smuggler'
            });
            selectedCards = [];
        },
        () => selectedCards = []
    );
}

// Audit: Look at target player's hand
function handleAuditCard(card) {
    selectTargetPlayer((targetId) => {
        socket.emit('playAction', {
            cardId: card.id,
            targetPlayerId: targetId,
            actionType: 'audit'
        });
        selectedCards = [];
    });
}

// Fence: Swap 1 vault card with 1 hand card
function handleFenceCard(card) {
    showModal(
        'Playing Fence',
        `<p><strong>Step 1:</strong> Select 1 card from your VAULT</p>
         <p><strong>Step 2:</strong> Select 1 card from your HAND</p>
         <p><strong>Step 3:</strong> Click Confirm to swap them</p>
         <p>Select your cards now, then click Confirm when ready.</p>`,
        () => {
            if (selectedCards.length !== 2) {
                showToast('You must select exactly 2 cards (1 from vault, 1 from hand)');
                return;
            }

            const player = gameState.players.find(p => p.id === currentPlayerId);
            const vaultCardIds = player.vault.map(c => c.id);
            const handCardIds = player.hand.map(c => c.id);

            const vaultCard = selectedCards.find(c => vaultCardIds.includes(c.id));
            const handCard = selectedCards.find(c => handCardIds.includes(c.id));

            if (!vaultCard || !handCard) {
                showToast('Select 1 card from vault AND 1 card from hand');
                return;
            }

            socket.emit('playAction', {
                cardId: card.id,
                actionType: 'fence',
                data: {
                    vaultCardId: vaultCard.id,
                    handCardId: handCard.id
                }
            });
            selectedCards = [];
        },
        () => selectedCards = []
    );
}

// Market Day: Auction system
function handleMarketDayCard(card) {
    showModal(
        'Playing Market Day',
        `<p>All players will simultaneously reveal 1 card from their hand.</p>
         <p>Cards will be auctioned one at a time.</p>
         <p><strong>Select 1 card from your hand to reveal</strong></p>`,
        () => {
            if (selectedCards.length !== 1) {
                showToast('Select exactly 1 card to reveal');
                return;
            }

            socket.emit('playAction', {
                cardId: card.id,
                actionType: 'marketDay',
                data: {
                    revealedCardId: selectedCards[0].id
                }
            });
            selectedCards = [];
        },
        () => selectedCards = []
    );
}

// Tax Day: All discard 2, redistribute
function handleTaxDayCard(card) {
    showModal(
        'Playing Tax Day',
        `<p>All players will discard 2 cards.</p>
         <p>All discarded cards will be shuffled and redistributed evenly.</p>
         <p><strong>Select 2 cards from your hand to discard</strong></p>`,
        () => {
            if (selectedCards.length !== 2) {
                showToast('Select exactly 2 cards to discard');
                return;
            }

            socket.emit('playAction', {
                cardId: card.id,
                actionType: 'taxDay',
                data: {
                    discardedCardIds: selectedCards.map(c => c.id)
                }
            });
            selectedCards = [];
        },
        () => selectedCards = []
    );
}

// Select target player
function selectTargetPlayer(callback) {
    const players = gameState.players.filter(p => p.id !== currentPlayerId);

    let modalBody = '<div style="display: flex; flex-direction: column; gap: 0.5rem;">';
    players.forEach(player => {
        modalBody += `<button class="tavern-btn small" onclick="selectPlayer('${player.id}')">${player.name}</button>`;
    });
    modalBody += '</div>';

    window.selectPlayer = (playerId) => {
        hideModal();
        callback(playerId);
        delete window.selectPlayer;
    };

    showModal('Select Target Player', modalBody, null, () => {
        delete window.selectPlayer;
    });
}

// Socket event: Action played
socket.on('actionPlayed', (data) => {
    showToast(`${data.playerName} played ${data.card.name}`);
});

// Socket event: Card stolen (Thief victim)
socket.on('cardStolen', (data) => {
    showToast(`${data.byPlayer} stole a card from you!`);
});

// Socket event: Card received (Thief player)
socket.on('cardReceived', (data) => {
    showToast(`You stole ${data.card.name} from ${data.fromPlayer}!`);
});

// Socket event: Must discard (Fire victim)
socket.on('mustDiscard', (data) => {
    showModal(
        'Fire Card Effect',
        `<p>${data.reason}</p><p>Select ${data.count} cards to discard</p>`,
        () => {
            if (selectedCards.length !== data.count) {
                showToast(`Select exactly ${data.count} cards`);
                return;
            }

            socket.emit('discardCards', {
                cardIds: selectedCards.map(c => c.id)
            });
            selectedCards = [];
        }
    );
});

// Socket event: Smuggler drawn cards
socket.on('smugglerDrawn', (data) => {
    gameState.players.find(p => p.id === currentPlayerId).hand.push(...data.cards);
    updateGameUI();

    showModal(
        'Smuggler Effect',
        `<p>You drew ${data.cards.length} cards!</p><p>Now select ${data.mustDiscard} card to discard</p>`,
        () => {
            if (selectedCards.length !== data.mustDiscard) {
                showToast(`Select exactly ${data.mustDiscard} card`);
                return;
            }

            socket.emit('discardCards', {
                cardIds: selectedCards.map(c => c.id)
            });
            selectedCards = [];
        }
    );
});

// Socket event: Audit result
socket.on('auditResult', (data) => {
    let cardsHTML = '<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem;">';

    data.hand.forEach(card => {
        if (card.type === 'commodity') {
            cardsHTML += `
                <div class="card commodity ${card.caravanType}" style="width: 80px; height: 112px;">
                    <div class="card-name">${card.name}</div>
                    <div class="card-value">${card.value}g</div>
                    <div class="card-type">${card.caravanType.replace('_', ' ')}</div>
                </div>`;
        } else {
            cardsHTML += `
                <div class="card action" style="width: 80px; height: 112px;">
                    <div class="card-name">${card.name}</div>
                </div>`;
        }
    });

    cardsHTML += '</div>';

    showModal(
        `Audit: ${data.targetPlayer}'s Hand`,
        cardsHTML,
        () => {}
    );
});

// Socket event: Tax Day started
socket.on('taxDayStarted', (data) => {
    showToast(`${data.initiator} played Tax Day! (Note: Manual implementation - all players discard 2 cards)`);
});

// Socket event: Market Day started
socket.on('marketDayStarted', (data) => {
    showToast(`${data.initiator} played Market Day! (Note: Manual implementation - reveal and auction cards)`);
});

// Handle trade
function handleTrade() {
    if (selectedCards.length === 0) {
        showToast('Select cards you want to trade');
        return;
    }

    selectTargetPlayer((targetId) => {
        const offeredCards = [...selectedCards];
        selectedCards = [];

        showModal(
            'Trade Offer',
            `<p>You are offering ${offeredCards.length} card(s). Request how many cards in return?</p>
            <input type="number" id="trade-request-count" min="0" max="12" value="1">`,
            () => {
                const requestCount = parseInt(document.getElementById('trade-request-count').value) || 0;
                socket.emit('proposeTrade', {
                    targetPlayerId: targetId,
                    offeredCardIds: offeredCards.map(c => c.id),
                    requestedCardIds: Array(requestCount).fill(null) // Placeholder
                });
                showToast('Trade proposed');
            }
        );
    });
}

// Socket event: Trade proposed
socket.on('tradeProposed', (data) => {
    showModal(
        'Trade Offer',
        `<p>${data.fromPlayerName} wants to trade!</p>
        <p>They offer: ${data.offeredCardIds.length} card(s)</p>
        <p>They request: ${data.requestedCardIds.length} card(s)</p>
        <p>Select ${data.requestedCardIds.length} card(s) from your hand to trade</p>`,
        () => {
            if (selectedCards.length !== data.requestedCardIds.length) {
                showToast(`Select exactly ${data.requestedCardIds.length} card(s)`);
                return;
            }

            socket.emit('acceptTrade', {
                fromPlayerId: data.fromPlayerId,
                offeredCardIds: data.offeredCardIds,
                requestedCardIds: selectedCards.map(c => c.id)
            });

            selectedCards = [];
        },
        () => {
            selectedCards = [];
            showToast('Trade declined');
        }
    );
});

// Socket event: Trade completed
socket.on('tradeCompleted', (data) => {
    gameState = data.gameState;
    updateGameUI();
    showToast('Trade completed!');
});

// Socket event: Trade announcement
socket.on('tradeAnnouncement', (data) => {
    showToast(`${data.player1} traded with ${data.player2}`);
});

// Handle discard
function handleDiscard() {
    if (selectedCards.length === 0) {
        showToast('Select cards to discard');
        return;
    }

    socket.emit('discardCards', { cardIds: selectedCards.map(c => c.id) });
    selectedCards = [];
}

// Handle end turn
function handleEndTurn() {
    const myData = gameState.players.find(p => p.id === currentPlayerId);

    if (myData && myData.handSize > 12) {
        showToast('You must discard down to 12 cards before ending your turn');
        return;
    }

    socket.emit('endTurn');
}

// Socket event: Turn changed
socket.on('turnChanged', (data) => {
    showToast(`${data.currentPlayerName}'s turn`);
    updateGameUI();
});

// Socket event: Game ended
socket.on('gameEnded', (data) => {
    const winnerAnnouncement = document.getElementById('winner-announcement');
    const winnerDetails = document.getElementById('winner-details');

    winnerAnnouncement.textContent = `🎉 ${data.winner.name} Wins! 🎉`;

    winnerDetails.innerHTML = `
        <p><strong>Caravan Type:</strong> ${data.winner.caravanType.replace('_', ' ')}</p>
        <p><strong>Total Value:</strong> ${data.winner.totalValue} gold</p>
        <p><strong>Cards in Vault:</strong> ${data.winner.vault.length}</p>
    `;

    showScreen('gameOver');
});

// Socket event: Victory failed
socket.on('victoryFailed', (data) => {
    showToast(`Victory declaration failed: ${data.message}`);

    if (data.eliminated) {
        showToast('You have been eliminated from the game!');
    }
});

// Socket event: Player eliminated
socket.on('playerEliminated', (data) => {
    showToast(`${data.playerName} was eliminated!`);
});

// Socket event: Error
socket.on('error', (data) => {
    showToast(`Error: ${data.message}`);
});

// Socket event: Player discarded
socket.on('playerDiscarded', (data) => {
    if (data.playerId !== currentPlayerId) {
        const player = gameState.players.find(p => p.id === data.playerId);
        if (player) {
            showToast(`${player.name} discarded ${data.count} card(s)`);
        }
    }
});
