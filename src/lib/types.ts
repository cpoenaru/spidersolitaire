export type Suit = '♠' | '♥' | '♦' | '♣';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Card {
	id: string;
	suit: Suit;
	rank: Rank;
	faceUp: boolean;
}

export interface Pile {
	cards: Card[];
}

export interface CompletedSequence {
	id: string;
	suit: Suit;
}

export interface GameState {
	tableau: Pile[];
	stock: Card[];
	completedSequences: CompletedSequence[];
	moves: number;
	gameWon: boolean;
	difficulty: Difficulty;
}

export interface MoveHistory {
	type?: 'move' | 'deal';
	from: number;
	to: number;
	cards: Card[];
	flippedCard?: { pileIndex: number; cardId: string };
	// For deal operations: store the cards dealt to each pile
	dealtCards?: Card[][];
	// For tracking completed sequences that were removed during this move
	completedSequences?: Array<{ pileIndex: number; cards: Card[]; suit: Suit; flippedCard?: { cardId: string } }>;
}
