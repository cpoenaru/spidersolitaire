import type { Card, Suit, Rank, Pile, GameState, Difficulty, CompletedSequence } from './types';

const allSuits: Suit[] = ['♠', '♥', '♦', '♣'];
const ranks: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

const rankValues: Record<Rank, number> = {
	'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
	'8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13
};

// Global counter to ensure unique card IDs across all game instances
let globalCardId = 0;

export function createDeck(difficulty: Difficulty = 'easy'): Card[] {
	const deck: Card[] = [];
	const gameTimestamp = Date.now();
	
	// Determine which suits to use based on difficulty
	let suitsToUse: Suit[];
	switch (difficulty) {
		case 'easy': // 1 suit
			suitsToUse = ['♠', '♠', '♠', '♠', '♠', '♠', '♠', '♠'];
			break;
		case 'medium': // 2 suits
			suitsToUse = ['♠', '♠', '♠', '♠', '♥', '♥', '♥', '♥'];
			break;
		case 'hard': // 4 suits
			suitsToUse = ['♠', '♠', '♥', '♥', '♦', '♦', '♣', '♣'];
			break;
	}
	
	// Create 8 decks of 13 cards each with globally unique IDs
	for (const suit of suitsToUse) {
		for (const rank of ranks) {
			deck.push({
				id: `${gameTimestamp}-${suit}-${rank}-${globalCardId++}`,
				suit,
				rank,
				faceUp: false
			});
		}
	}
	
	return deck;
}

export function shuffleDeck(deck: Card[]): Card[] {
	const shuffled = [...deck];
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
	}
	return shuffled;
}

export function initializeGame(difficulty: Difficulty = 'easy'): GameState {
	const deck = shuffleDeck(createDeck(difficulty));
	const tableau: Pile[] = Array.from({ length: 10 }, () => ({ cards: [] }));
	
	// Deal cards to tableau
	let cardIndex = 0;
	
	// First 4 columns get 6 cards, last 6 columns get 5 cards
	for (let col = 0; col < 10; col++) {
		const numCards = col < 4 ? 6 : 5;
		for (let row = 0; row < numCards; row++) {
			const card = deck[cardIndex++];
			// Only the top card is face up - create new object instead of mutating
			tableau[col].cards.push({
				...card,
				faceUp: row === numCards - 1
			});
		}
	}
	
	// Remaining cards go to stock
	const stock = deck.slice(cardIndex);
	
	return {
		tableau,
		stock,
		completedSequences: [],
		moves: 0,
		gameWon: false,
		difficulty
	};
}

export function canPlaceCard(cardToPlace: Card, targetCard: Card | null): boolean {
	// Can place on empty column
	if (!targetCard) return true;
	
	// Card must be one rank lower than target
	const cardValue = rankValues[cardToPlace.rank];
	const targetValue = rankValues[targetCard.rank];
	
	return cardValue === targetValue - 1;
}

export function getMovableCards(pile: Pile, startIndex: number): Card[] {
	const cards = pile.cards.slice(startIndex);
	
	// Check if cards form a valid descending sequence
	for (let i = 0; i < cards.length - 1; i++) {
		const currentValue = rankValues[cards[i].rank];
		const nextValue = rankValues[cards[i + 1].rank];
		
		if (currentValue !== nextValue + 1) {
			return [];
		}
	}
	
	return cards;
}

export function checkForCompletedSequence(pile: Pile): { completed: boolean; startIndex: number; suit?: Suit } {
	if (pile.cards.length < 13) return { completed: false, startIndex: -1 };
	
	// Check from the bottom of the pile
	for (let i = pile.cards.length - 13; i >= 0; i--) {
		const sequence = pile.cards.slice(i, i + 13);
		
		// Check if all cards are face up
		if (!sequence.every(card => card.faceUp)) continue;
		
		// Check if it's a complete K to A sequence of same suit
		const suit = sequence[0].suit;
		let isValid = true;
		
		for (let j = 0; j < 13; j++) {
			const expectedRank = ranks[12 - j]; // K, Q, J, ..., A
			if (sequence[j].suit !== suit || sequence[j].rank !== expectedRank) {
				isValid = false;
				break;
			}
		}
		
		if (isValid) {
			return { completed: true, startIndex: i, suit };
		}
	}
	
	return { completed: false, startIndex: -1 };
}

export function dealFromStock(state: GameState): GameState {
	if (state.stock.length < 10) return state;
	
	const newTableau = state.tableau.map((pile, index) => {
		const card = state.stock[index];
		// Create a new card object instead of mutating
		const faceUpCard = { ...card, faceUp: true };
		// Deep clone all existing cards in the pile
		return {
			cards: [...pile.cards.map(c => ({...c})), faceUpCard]
		};
	});
	
	return {
		...state,
		tableau: newTableau,
		stock: state.stock.slice(10),
		moves: state.moves + 1
	};
}

export interface MeaningfulMove {
	sourcePile: number;
	cardIndex: number;
	targetPile: number;
	priority: number; // Higher is better
	reason: string;
}

function getSequenceLengthFromEnd(pile: Pile): number {
	if (pile.cards.length === 0) return 0;
	
	let length = 1;
	const lastCard = pile.cards[pile.cards.length - 1];
	if (!lastCard.faceUp) return 0;
	
	const suit = lastCard.suit;
	
	// Count backward from the end
	for (let i = pile.cards.length - 2; i >= 0; i--) {
		const currentCard = pile.cards[i];
		const nextCard = pile.cards[i + 1];
		
		if (!currentCard.faceUp || currentCard.suit !== suit) break;
		
		const currentValue = rankValues[currentCard.rank];
		const nextValue = rankValues[nextCard.rank];
		
		if (currentValue !== nextValue + 1) break;
		
		length++;
	}
	
	return length;
}

export function findMeaningfulMoves(state: GameState): MeaningfulMove[] {
	const moves: MeaningfulMove[] = [];
	
	// Check if any meaningful move exists
	for (let sourcePileIdx = 0; sourcePileIdx < state.tableau.length; sourcePileIdx++) {
		const sourcePile = state.tableau[sourcePileIdx];
		
		// Find all face-up cards in this pile
		for (let cardIdx = 0; cardIdx < sourcePile.cards.length; cardIdx++) {
			const card = sourcePile.cards[cardIdx];
			if (!card.faceUp) continue;
			
			// Check if this card and following cards can be moved
			const movableCards = getMovableCards(sourcePile, cardIdx);
			if (movableCards.length === 0) continue;
			
			const firstCard = movableCards[0];
			
			// Check if moving would flip a card (always useful)
			const wouldFlipCard = cardIdx > 0 && !sourcePile.cards[cardIdx - 1].faceUp;
			
			// Check all other piles as potential targets
			for (let targetPileIdx = 0; targetPileIdx < state.tableau.length; targetPileIdx++) {
				if (targetPileIdx === sourcePileIdx) continue;
				
				const targetPile = state.tableau[targetPileIdx];
				const targetCard = targetPile.cards[targetPile.cards.length - 1] || null;
				
				if (!canPlaceCard(firstCard, targetCard)) continue;
				
				// Moving to empty column is useful (provides flexibility)
				if (!targetCard) {
					moves.push({
						sourcePile: sourcePileIdx,
						cardIndex: cardIdx,
						targetPile: targetPileIdx,
						priority: wouldFlipCard ? 80 : 50,
						reason: wouldFlipCard ? 'Move to empty & flip card' : 'Move to empty column'
					});
					continue;
				}
				
				// Moving and flipping a card is always useful
				if (wouldFlipCard) {
					const priority = firstCard.suit === targetCard.suit ? 100 : 70;
					const reason = firstCard.suit === targetCard.suit ? 'Join same suit & flip card' : 'Flip a face-down card';
					moves.push({
						sourcePile: sourcePileIdx,
						cardIndex: cardIdx,
						targetPile: targetPileIdx,
						priority,
						reason
					});
					continue;
				}
				
				// Check if this move actually improves sequences (same suit only)
				if (firstCard.suit === targetCard.suit) {
					// Get current sequence lengths
					const targetCurrentSeq = getSequenceLengthFromEnd(targetPile);
					
					// After the move, the cards would combine - check if they form a valid longer sequence
					// The movableCards would be placed on top of targetCard
					// They already form a valid sequence (because getMovableCards validates this)
					// So the new sequence length would be: targetCurrentSeq + movableCards.length
					const potentialNewSeq = targetCurrentSeq + movableCards.length;
					
					// But we need to check: is this move actually creating progress?
					// It's only progress if:
					// 1. The target sequence grows (potentialNewSeq > targetCurrentSeq) - this is always true if we're adding cards
					// 2. AND we're not just moving cards that were already in a sequence somewhere else without benefit
					
					// Get the source sequence length from where we're taking the cards
					let sourceSeqFromMovedCards = movableCards.length;
					// Check if cards before the moved cards are part of the same suit sequence
					if (cardIdx > 0) {
						const cardBefore = sourcePile.cards[cardIdx - 1];
						if (cardBefore.faceUp && cardBefore.suit === firstCard.suit) {
							const cardBeforeValue = rankValues[cardBefore.rank];
							const firstCardValue = rankValues[firstCard.rank];
							if (cardBeforeValue === firstCardValue + 1) {
								// The moved cards were part of a longer sequence, don't break it up
								continue;
							}
						}
					}
					
					// Only meaningful if the resulting sequence is longer than what we're moving
					if (potentialNewSeq > sourceSeqFromMovedCards) {
						moves.push({
							sourcePile: sourcePileIdx,
							cardIndex: cardIdx,
							targetPile: targetPileIdx,
							priority: 60,
							reason: 'Build longer sequence'
						});
					}
				}
			}
		}
	}
	
	// Sort by priority (highest first)
	return moves.sort((a, b) => b.priority - a.priority);
}

export function hasValidMoves(state: GameState): boolean {
	// If we can deal from stock, we have moves
	if (state.stock.length >= 10 && state.tableau.every(pile => pile.cards.length > 0)) {
		return true;
	}
	
	// Check if any meaningful move exists
	const moves = findMeaningfulMoves(state);
	return moves.length > 0;
}
