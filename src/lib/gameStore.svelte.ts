import type { GameState, MoveHistory, Difficulty, Card, Suit } from './types';
import { initializeGame, canPlaceCard, getMovableCards, checkForCompletedSequence, dealFromStock, hasValidMoves, findMeaningfulMoves, type MeaningfulMove } from './gameLogic';

class SpiderSolitaireGame {
	state = $state<GameState>(initializeGame('easy'));
	history = $state<MoveHistory[]>([]);
	selectedPile = $state<number | null>(null);
	selectedCardIndex = $state<number | null>(null);
	gameKey = $state<number>(Date.now()); // Unique key for each game instance
	initialState = $state<GameState>(JSON.parse(JSON.stringify(initializeGame('easy')))); // Store initial state for restart
	hint = $state<MeaningfulMove | null>(null); // Current hint
	
	canDeal = $derived(this.state.stock.length >= 10 && this.state.tableau.every(pile => pile.cards.length > 0));
	noMovesLeft = $derived(!this.state.gameWon && this.state.moves > 0 && !hasValidMoves(this.state));
	
	newGame(difficulty?: Difficulty) {
		const diff = difficulty || this.state.difficulty;
		this.state = initializeGame(diff);
		this.initialState = JSON.parse(JSON.stringify(this.state)); // Deep clone initial state
		this.history = [];
		this.selectedPile = null;
		this.selectedCardIndex = null;
		this.hint = null; // Clear hint
		this.gameKey = Date.now(); // Update game key to force component recreation
	}
	
	restartGame() {
		if (!this.initialState) return;
		this.state = JSON.parse(JSON.stringify(this.initialState)); // Deep clone from initial state
		this.history = [];
		this.selectedPile = null;
		this.selectedCardIndex = null;
		this.gameKey = Date.now(); // Update game key to force component recreation
	}
	
	selectCards(pileIndex: number, cardIndex: number, skipAutoMove: boolean = false) {
		const pile = this.state.tableau[pileIndex];
		const card = pile.cards[cardIndex];
		
		// Can only select face-up cards
		if (!card.faceUp) return;
		
		// Check if we can move these cards
		const movableCards = getMovableCards(pile, cardIndex);
		if (movableCards.length === 0) return;
		
		// Skip auto-move if explicitly requested (e.g., during drag & drop)
		if (skipAutoMove) {
			this.selectedPile = pileIndex;
			this.selectedCardIndex = cardIndex;
			return;
		}
		
		// Find best auto-move destination
		const bestPile = this.findBestMove(pileIndex, cardIndex);
		if (bestPile !== null && bestPile !== pileIndex) {
			// Auto-move to best location
			this.selectedPile = pileIndex;
			this.selectedCardIndex = cardIndex;
			this.moveCards(bestPile);
		} else {
			// Just select for manual move
			this.selectedPile = pileIndex;
			this.selectedCardIndex = cardIndex;
		}
	}
	
	findBestMove(sourcePileIndex: number, cardIndex: number): number | null {
		const sourcePile = this.state.tableau[sourcePileIndex];
		const cardsToMove = getMovableCards(sourcePile, cardIndex);
		
		if (cardsToMove.length === 0) return null;
		
		const firstCard = cardsToMove[0];
		const validMoves: Array<{pileIndex: number; orderedCount: number; hasUnordered: boolean}> = [];
		
		// Find all valid destination piles
		for (let i = 0; i < this.state.tableau.length; i++) {
			if (i === sourcePileIndex) continue;
			
			const targetPile = this.state.tableau[i];
			const targetCard = targetPile.cards[targetPile.cards.length - 1] || null;
			
			if (canPlaceCard(firstCard, targetCard)) {
				// Count ordered cards in target pile
				let orderedCount = 0;
				let hasUnordered = false;
				
				for (let j = targetPile.cards.length - 1; j > 0; j--) {
					const current = targetPile.cards[j];
					const prev = targetPile.cards[j - 1];
					
					if (!current.faceUp || !prev.faceUp) {
						hasUnordered = true;
						break;
					}
					
					const currentValue = this.getRankValue(current.rank);
					const prevValue = this.getRankValue(prev.rank);
					
					if (prevValue === currentValue + 1) {
						orderedCount++;
					} else {
						hasUnordered = true;
						break;
					}
				}
				
				// Add one for the last card itself
				if (targetPile.cards.length > 0) {
					orderedCount++;
				}
				
				validMoves.push({ pileIndex: i, orderedCount, hasUnordered });
			}
		}
		
		if (validMoves.length === 0) return null;
		
		// Sort by: 1) highest ordered count, 2) no unordered cards (prefer clean sequences)
		validMoves.sort((a, b) => {
			if (a.orderedCount !== b.orderedCount) {
				return b.orderedCount - a.orderedCount;
			}
			// Prefer piles without unordered cards
			if (a.hasUnordered !== b.hasUnordered) {
				return a.hasUnordered ? 1 : -1;
			}
			return 0;
		});
		
		return validMoves[0].pileIndex;
	}
	
	getRankValue(rank: string): number {
		const values: Record<string, number> = {
			'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
			'8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13
		};
		return values[rank] || 0;
	}
	
	moveCards(targetPileIndex: number) {
		if (this.selectedPile === null || this.selectedCardIndex === null) return;
		if (this.selectedPile === targetPileIndex) {
			this.clearSelection();
			return;
		}
		
		const sourcePile = this.state.tableau[this.selectedPile];
		const targetPile = this.state.tableau[targetPileIndex];
		const cardsToMove = getMovableCards(sourcePile, this.selectedCardIndex);
		
		if (cardsToMove.length === 0) {
			this.clearSelection();
			return;
		}
		
		// Check if we can place the first card on target
		const targetCard = targetPile.cards[targetPile.cards.length - 1] || null;
		if (!canPlaceCard(cardsToMove[0], targetCard)) {
			this.clearSelection();
			return;
		}
		
		// Deep clone cards to move
		const clonedCardsToMove = cardsToMove.map(card => ({...card}));
		
		// Save the move for undo
		const historyEntry: MoveHistory = {
			from: this.selectedPile,
			to: targetPileIndex,
			cards: clonedCardsToMove.map(card => ({...card}))
		};
		
		// Remove cards from source pile - deep clone to avoid shared references
		const newSourceCards = sourcePile.cards.slice(0, this.selectedCardIndex).map(card => ({...card}));
		
		// Flip the new top card if it exists
		if (newSourceCards.length > 0 && !newSourceCards[newSourceCards.length - 1].faceUp) {
			// Create a new card object instead of mutating
			newSourceCards[newSourceCards.length - 1] = {
				...newSourceCards[newSourceCards.length - 1],
				faceUp: true
			};
			historyEntry.flippedCard = {
				pileIndex: this.selectedPile,
				cardId: newSourceCards[newSourceCards.length - 1].id
			};
		}
		
		// Update tableau - deep clone ALL piles to ensure complete immutability
		const newTableau = this.state.tableau.map((pile, idx) => {
			if (idx === this.selectedPile) {
				return { cards: newSourceCards };
			} else if (idx === targetPileIndex) {
				return { cards: [...targetPile.cards.map(card => ({...card})), ...clonedCardsToMove] };
			} else {
				return { cards: pile.cards.map(card => ({...card})) };
			}
		});
		
		this.state = {
			...this.state,
			tableau: newTableau,
			moves: this.state.moves + 1
		};
		
		this.history.push(historyEntry);
		this.clearSelection();
		
		// Check for completed sequences
		this.checkCompletedSequences();
	}
	
	checkCompletedSequences() {
		const newCompletedSequences = [...this.state.completedSequences];
		let hasChanges = false;
		const completedThisCheck: Array<{ pileIndex: number; cards: Card[]; suit: Suit; flippedCard?: { cardId: string } }> = [];
		
		// Deep clone ALL piles to ensure complete immutability
		const newTableau = this.state.tableau.map((pile, i) => {
			const result = checkForCompletedSequence(pile);
			if (result.completed && result.suit) {
				hasChanges = true;
				
				// Save the cards that will be removed (for undo)
				const completedCards = pile.cards.slice(result.startIndex, result.startIndex + 13).map(card => ({...card}));
				
				const remainingCards = pile.cards.slice(0, result.startIndex).map(card => ({...card}));
				
				// Track if a card was flipped
				let flippedCardId: string | undefined;
				
				// Flip the new top card if it exists and is face-down
				if (remainingCards.length > 0 && !remainingCards[remainingCards.length - 1].faceUp) {
					flippedCardId = remainingCards[remainingCards.length - 1].id;
					remainingCards[remainingCards.length - 1] = {
						...remainingCards[remainingCards.length - 1],
						faceUp: true
					};
				}
				
				// Push the completed sequence info with optional flipped card
				const completedInfo: { pileIndex: number; cards: Card[]; suit: Suit; flippedCard?: { cardId: string } } = {
					pileIndex: i,
					cards: completedCards,
					suit: result.suit
				};
				
				if (flippedCardId) {
					completedInfo.flippedCard = { cardId: flippedCardId };
				}
				
				completedThisCheck.push(completedInfo);
				
				// Remove the completed sequence - deep clone remaining cards
				newCompletedSequences.push({
					id: `${result.suit}-${Date.now()}-${i}`,
					suit: result.suit
				});
				
				return { cards: remainingCards };
			}
			return { cards: pile.cards.map(card => ({...card})) };
		});
		
		if (hasChanges) {
			this.state = {
				...this.state,
				tableau: newTableau,
				completedSequences: newCompletedSequences,
				gameWon: newCompletedSequences.length === 8
			};
			
			// If we have history, attach the completed sequences to the last move
			if (this.history.length > 0 && completedThisCheck.length > 0) {
				this.history[this.history.length - 1].completedSequences = completedThisCheck;
			}
		}
	}
	
	deal() {
		if (!this.canDeal) return;
		
		// Save the cards that will be dealt for undo
		const dealtCards: Card[][] = [];
		for (let i = 0; i < 10; i++) {
			dealtCards.push([{...this.state.stock[i]}]);
		}
		
		// Save the previous state to history
		const historyEntry: MoveHistory = {
			type: 'deal',
			from: -1, // Special value for stock
			to: -1,
			cards: [],
			dealtCards: dealtCards
		};
		
		this.state = dealFromStock(this.state);
		this.history.push(historyEntry);
		this.clearSelection();
		
		// Check for completed sequences after dealing
		this.checkCompletedSequences();
	}
	
	undo() {
		if (this.history.length === 0) return;
		
		const lastMove = this.history.pop()!;
		
		// Handle undoing a deal operation
		if (lastMove.type === 'deal' && lastMove.dealtCards) {
			// First, restore any completed sequences from this move (if any)
			let newCompletedSequences = [...this.state.completedSequences];
			let newTableau = this.state.tableau.map(pile => ({ cards: pile.cards.map(card => ({...card})) }));
			
			if (lastMove.completedSequences && lastMove.completedSequences.length > 0) {
				// Remove the completed sequences that were added during this move
				newCompletedSequences = newCompletedSequences.slice(0, -(lastMove.completedSequences.length));
				
				// Add the cards back to their piles (before we remove the dealt cards)
				newTableau = newTableau.map((pile, idx) => {
					const restored = lastMove.completedSequences?.find(cs => cs.pileIndex === idx);
					if (restored) {
						let cards = [...pile.cards, ...restored.cards];
						
						// If the top card before the restored sequence was flipped, flip it back
						if (restored.flippedCard) {
							const cardIdx = cards.findIndex(c => c.id === restored.flippedCard!.cardId);
							if (cardIdx !== -1) {
								cards[cardIdx] = {...cards[cardIdx], faceUp: false};
							}
						}
						
						return { cards };
					}
					return pile;
				});
			}
			
			// Now remove the dealt cards from each pile
			newTableau = newTableau.map(pile => ({
				cards: pile.cards.slice(0, -1)
			}));
			
			// Reconstruct the stock by adding the dealt cards back to the front
			const cardsToAddBack = lastMove.dealtCards.flat().map(card => ({...card}));
			const newStock = [...cardsToAddBack, ...this.state.stock.map(card => ({...card}))];
			
			this.state = {
				...this.state,
				tableau: newTableau,
				stock: newStock,
				completedSequences: newCompletedSequences,
				gameWon: newCompletedSequences.length === 8,
				moves: this.state.moves - 1
			};
			
			this.clearSelection();
			return;
		}
		
		// Handle undoing a regular card move
		
		// First, restore any completed sequences from this move (before undoing the card movement)
		let newCompletedSequences = [...this.state.completedSequences];
		let newTableau = this.state.tableau.map(pile => ({ cards: pile.cards.map(card => ({...card})) }));
		
		if (lastMove.completedSequences && lastMove.completedSequences.length > 0) {
			// Remove the completed sequences that were added during this move
			newCompletedSequences = newCompletedSequences.slice(0, -(lastMove.completedSequences.length));
			
			// Add the cards back to their piles
			newTableau = newTableau.map((pile, idx) => {
				const restored = lastMove.completedSequences?.find(cs => cs.pileIndex === idx);
				if (restored) {
					let cards = [...pile.cards, ...restored.cards];
					
					// If the top card before the restored sequence was flipped, flip it back
					if (restored.flippedCard) {
						const cardIdx = cards.findIndex(c => c.id === restored.flippedCard!.cardId);
						if (cardIdx !== -1) {
							cards[cardIdx] = {...cards[cardIdx], faceUp: false};
						}
					}
					
					return { cards };
				}
				return pile;
			});
		}
		
		// Now undo the card move - use the ORIGINAL card IDs to find them in the target pile
		// (in case a completed sequence was restored, we need to find the specific cards that were moved)
		const movedCardIds = lastMove.cards.map(c => c.id);
		const targetPile = newTableau[lastMove.to];
		
		// Find the moved cards by their IDs and extract them
		const cardsToMoveBack: Card[] = [];
		const remainingTargetCards: Card[] = [];
		
		for (const card of targetPile.cards) {
			if (movedCardIds.includes(card.id) && cardsToMoveBack.length < lastMove.cards.length) {
				cardsToMoveBack.push({...card});
			} else {
				remainingTargetCards.push({...card});
			}
		}
		
		newTableau = newTableau.map((pile, idx) => {
			if (idx === lastMove.to) {
				// Remove the moved cards from target
				return {
					cards: remainingTargetCards
				};
			} else if (idx === lastMove.from) {
				// Add cards back to source
				let cards = [...pile.cards, ...cardsToMoveBack];
				
				// Flip the card back if it was flipped during the original move
				if (lastMove.flippedCard && lastMove.flippedCard.pileIndex === idx) {
					const cardIndex = cards.findIndex(c => c.id === lastMove.flippedCard!.cardId);
					if (cardIndex !== -1) {
						cards[cardIndex] = {...cards[cardIndex], faceUp: false};
					}
				}
				
				return { cards };
			} else {
				return pile;
			}
		});
		
		this.state = {
			...this.state,
			tableau: newTableau,
			completedSequences: newCompletedSequences,
			gameWon: newCompletedSequences.length === 8,
			moves: this.state.moves - 1
		};
		
		this.clearSelection();
	}
	
	clearSelection() {
		this.selectedPile = null;
		this.selectedCardIndex = null;
	}
	
	showHint() {
		// Clear any existing hint
		this.hint = null;
		
		// Find all meaningful moves
		const moves = findMeaningfulMoves(this.state);
		
		if (moves.length === 0) {
			// If no card moves but we can deal, suggest dealing
			if (this.canDeal) {
				this.hint = {
					sourcePile: -1, // Special value for "deal" hint
					cardIndex: -1,
					targetPile: -1,
					priority: 100,
					reason: 'Deal new cards from stock'
				};
				
				// Auto-clear hint after 5 seconds
				setTimeout(() => {
					this.hint = null;
				}, 5000);
			}
			return;
		}
		
		// Show the best move (highest priority)
		this.hint = moves[0];
		
		// Auto-clear hint after 5 seconds
		setTimeout(() => {
			this.hint = null;
		}, 5000);
	}
	
	clearHint() {
		this.hint = null;
	}
}

// Create game instance
let game = new SpiderSolitaireGame();

// Handle HMR (Hot Module Replacement) to prevent stale state
if (import.meta.hot) {
	// Force complete reinitialization on HMR
	import.meta.hot.accept(() => {
		game = new SpiderSolitaireGame();
	});
	
	// Dispose of old module data
	import.meta.hot.dispose(() => {
	});
}

export { game };
