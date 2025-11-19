// Client-side game logic for Merchant's Caravan

const socket = io();

// State
let currentPlayerId = null;
let currentPlayerName = null;
let currentRoomId = null;
let gameState = null;
let selectedCards = [];
let pendingAction = null;
let awaitingTaxDay = false;
let awaitingMarketDay = false;
let awaitingFire = false;
let awaitingTradeResponse = null;

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

    // Clear selections FIRST to prevent soft-locks
    selectedCards = [];

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
        // Vault phase buttons - always available
        const addBtn = createButton('Add to Vault', () => handleVaultAdd());
        const removeBtn = createButton('Remove from Vault', () => handleVaultRemove());
        const completeBtn = createButton('Complete Vault Phase', () => handleCompleteVaultPhase());
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
            // Not your turn - but you can still respond to actions
            const waitMsg = document.createElement('p');
            waitMsg.textContent = 'Waiting for current player...';
            waitMsg.style.color = 'var(--tavern-gold)';
            waitMsg.style.textAlign = 'center';
            waitMsg.style.marginBottom = '0.5rem';
            panel.appendChild(waitMsg);

            // Tax Day response
            if (awaitingTaxDay) {
                const taxInfo = document.createElement('p');
                taxInfo.textContent = '⚠️ Tax Day: Select 2 cards to discard';
                taxInfo.style.color = '#ff6b6b';
                taxInfo.style.fontWeight = 'bold';
                taxInfo.style.textAlign = 'center';
                panel.appendChild(taxInfo);

                const submitBtn = createButton('Submit Tax Day Cards', () => {
                    if (selectedCards.length !== 2) {
                        showToast('Select exactly 2 cards to discard');
                        return;
                    }
                    socket.emit('submitTaxDayCards', {
                        cardIds: selectedCards.map(c => c.id)
                    });
                    selectedCards = [];
                    awaitingTaxDay = false;
                    updateActionPanel();
                });
                panel.appendChild(submitBtn);
            }

            // Market Day response
            if (awaitingMarketDay) {
                const marketInfo = document.createElement('p');
                marketInfo.textContent = '⚠️ Market Day: Select 1 card to reveal';
                marketInfo.style.color = '#ffd700';
                marketInfo.style.fontWeight = 'bold';
                marketInfo.style.textAlign = 'center';
                panel.appendChild(marketInfo);

                const submitBtn = createButton('Submit Market Day Card', () => {
                    if (selectedCards.length !== 1) {
                        showToast('Select exactly 1 card to reveal');
                        return;
                    }
                    socket.emit('submitMarketDayCard', {
                        cardId: selectedCards[0].id
                    });
                    selectedCards = [];
                    awaitingMarketDay = false;
                    updateActionPanel();
                });
                panel.appendChild(submitBtn);
            }

            // Fire response
            if (awaitingFire) {
                const fireInfo = document.createElement('p');
                fireInfo.textContent = '⚠️ Fire: Select 2 cards to discard';
                fireInfo.style.color = '#ff4500';
                fireInfo.style.fontWeight = 'bold';
                fireInfo.style.textAlign = 'center';
                panel.appendChild(fireInfo);

                const submitBtn = createButton('Discard Cards', () => {
                    if (selectedCards.length !== 2) {
                        showToast('Select exactly 2 cards to discard');
                        return;
                    }
                    socket.emit('discardCards', {
                        cardIds: selectedCards.map(c => c.id)
                    });
                    selectedCards = [];
                    awaitingFire = false;
                    updateActionPanel();
                });
                panel.appendChild(submitBtn);
            }

            // Trade response
            if (awaitingTradeResponse) {
                const tradeInfo = document.createElement('p');
                tradeInfo.textContent = `⚠️ Trade from ${awaitingTradeResponse.fromPlayerName}: Select ${awaitingTradeResponse.requestedCardIds.length} card(s)`;
                tradeInfo.style.color = '#4CAF50';
                tradeInfo.style.fontWeight = 'bold';
                tradeInfo.style.textAlign = 'center';
                panel.appendChild(tradeInfo);

                const acceptBtn = createButton('Accept Trade', () => {
                    if (selectedCards.length !== awaitingTradeResponse.requestedCardIds.length) {
                        showToast(`Select exactly ${awaitingTradeResponse.requestedCardIds.length} card(s)`);
                        return;
                    }
                    socket.emit('acceptTrade', {
                        fromPlayerId: awaitingTradeResponse.fromPlayerId,
                        offeredCardIds: awaitingTradeResponse.offeredCardIds,
                        requestedCardIds: selectedCards.map(c => c.id)
                    });
                    selectedCards = [];
                    awaitingTradeResponse = null;
                    updateActionPanel();
                });
                panel.appendChild(acceptBtn);

                const declineBtn = createButton('Decline Trade', () => {
                    selectedCards = [];
                    awaitingTradeResponse = null;
                    showToast('Trade declined');
                    updateActionPanel();
                }, 'secondary');
                panel.appendChild(declineBtn);
            }

            // During Market Day, allow everyone to propose trades (for bidding)
            if (gameState.marketDayActive && !awaitingMarketDay) {
                const tradeBtn = createButton('Propose Trade (Market Day)', () => handleTrade());
                panel.appendChild(tradeBtn);
            }

            // General discard button (for other situations)
            if (!awaitingTaxDay && !awaitingFire && !awaitingTradeResponse) {
                const discardBtn = createButton('Discard Cards', () => handleDiscard());
                panel.appendChild(discardBtn);
            }
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

// Handle complete vault phase
function handleCompleteVaultPhase() {
    // Clear any lingering selections
    selectedCards = [];
    document.querySelectorAll('.card.selected').forEach(el => {
        el.classList.remove('selected');
    });

    socket.emit('completeVaultPhase');
    showToast('Waiting for other players to complete vault phase...');
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

    const cardIds = selectedCards.map(c => c.id);

    socket.emit('vaultAction', {
        action: 'add',
        cardIds: cardIds
    });

    // Clear selections immediately
    selectedCards = [];

    // Clear visual selections
    document.querySelectorAll('.card.selected').forEach(el => {
        el.classList.remove('selected');
    });
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

    const cardIds = selectedCards.map(c => c.id);

    socket.emit('vaultAction', {
        action: 'remove',
        cardIds: cardIds
    });

    // Clear selections immediately
    selectedCards = [];

    // Clear visual selections
    document.querySelectorAll('.card.selected').forEach(el => {
        el.classList.remove('selected');
    });
}

// Socket event: Vault updated
socket.on('vaultUpdated', (data) => {
    gameState = data.gameState;
    selectedCards = []; // Ensure selections are cleared
    updateGameUI();
    showToast('Vault updated');

    // Force re-render to prevent soft-lock
    setTimeout(() => {
        updateActionPanel();
    }, 100);
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
         <p>Cards will be displayed, then players can bid via trades.</p>
         <p><strong>Select 1 card from your hand to reveal</strong></p>`,
        () => {
            if (selectedCards.length !== 1) {
                showToast('Select exactly 1 card to reveal');
                return;
            }

            const revealedCardId = selectedCards[0].id;

            // First, play the action card
            socket.emit('playAction', {
                cardId: card.id,
                actionType: 'marketDay',
                data: {
                    revealedCardId: revealedCardId
                }
            });

            // The card was already submitted via the action
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

            // First, play the action card
            socket.emit('playAction', {
                cardId: card.id,
                actionType: 'taxDay'
            });

            // Then immediately submit your cards
            socket.emit('submitTaxDayCards', {
                cardIds: selectedCards.map(c => c.id)
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
    awaitingFire = true;
    showToast(data.reason + ' - Select 2 cards to discard');
    updateActionPanel();
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
    // Only set flag if you're not the initiator (they already submitted)
    if (data.initiator !== gameState.players.find(p => p.id === currentPlayerId)?.name) {
        awaitingTaxDay = true;
        showToast(`${data.initiator} played Tax Day! Select 2 cards to discard`);
        updateActionPanel();
    }
});

// Socket event: Tax Day submitted by a player
socket.on('taxDaySubmitted', (data) => {
    if (data.playerId === currentPlayerId) {
        awaitingTaxDay = false; // Clear the flag when we submit
        showToast('Submitted! Waiting for other players...');
        updateActionPanel();
    } else {
        showToast(`${data.playerName} submitted their cards`);
    }
});

// Socket event: Tax Day completed
socket.on('taxDayCompleted', (data) => {
    gameState = data.gameState;
    updateGameUI();
    showToast('Tax Day completed! Cards redistributed.');
});

// Socket event: Market Day started
socket.on('marketDayStarted', (data) => {
    // Only set flag if you're not the initiator (they already submitted)
    if (data.initiatorId !== currentPlayerId) {
        awaitingMarketDay = true;
        showToast(`${data.initiator} played Market Day! Select 1 card to reveal`);
        updateActionPanel();
    } else {
        showToast('Market Day started! Waiting for other players to reveal cards...');
    }
});

// Socket event: Market Day submitted by a player
socket.on('marketDaySubmitted', (data) => {
    if (data.playerId === currentPlayerId) {
        awaitingMarketDay = false; // Clear the flag when we submit
        showToast('Submitted! Waiting for other players...');
        updateActionPanel();
    } else {
        showToast(`${data.playerName} revealed their card`);
    }
});

// Socket event: Market Day cards revealed
socket.on('marketDayRevealed', (data) => {
    gameState = data.gameState;
    updateGameUI();

    // Display all revealed cards
    let cardsHTML = '<div style="margin-bottom: 1rem;"><p><strong>Revealed Cards:</strong></p></div>';
    cardsHTML += '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 0.5rem;">';

    data.revealedCards.forEach(reveal => {
        const card = reveal.card;
        const cardClass = card.type === 'commodity' ? `commodity ${card.caravanType}` : 'action';

        cardsHTML += `
            <div style="text-align: center;">
                <div class="card ${cardClass}" style="width: 100px; height: 140px; margin: 0 auto;">
                    <div class="card-name">${card.name}</div>`;

        if (card.type === 'commodity') {
            cardsHTML += `
                    <div class="card-value">${card.value}g</div>
                    <div class="card-type">${card.caravanType.replace('_', ' ')}</div>`;
        } else {
            cardsHTML += `<div class="card-description" style="font-size: 0.4rem;">${card.description}</div>`;
        }

        cardsHTML += `
                </div>
                <div style="font-size: 0.8rem; margin-top: 0.25rem;">${reveal.playerName}</div>
            </div>`;
    });

    cardsHTML += '</div>';
    cardsHTML += '<p style="margin-top: 1rem; color: var(--tavern-gold);">Use "Propose Trade" to bid on cards. Highest bidder wins each card. Unbid cards return to owners.</p>';

    showModal(
        'Market Day - Cards Revealed!',
        cardsHTML,
        () => {
            showToast('Market Day active - use trades to bid on cards!');
        }
    );
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
    awaitingTradeResponse = data;
    showToast(`${data.fromPlayerName} wants to trade ${data.offeredCardIds.length} for ${data.requestedCardIds.length} cards`);
    updateActionPanel();
});

// Socket event: Trade completed
socket.on('tradeCompleted', (data) => {
    gameState = data.gameState;
    awaitingTradeResponse = null; // Clear trade state
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

// Socket event: General notification
socket.on('notification', (data) => {
    showToast(data.message);
});
