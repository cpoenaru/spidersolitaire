<script lang="ts">
	import type { Pile } from '$lib/types';
	import Card from './Card.svelte';
	import { flip } from 'svelte/animate';
	import { cubicOut } from 'svelte/easing';
	
	// Module-level variable to track the current drag source
	let currentDragSourcePile: number | null = null;
	
	interface Props {
		pile: Pile;
		pileIndex: number;
		selectedPile: number | null;
		selectedCardIndex: number | null;
		onCardClick: (pileIndex: number, cardIndex: number, skipAutoMove?: boolean) => void;
		onPileClick: (pileIndex: number) => void;
		onMouseDown?: () => void;
		onDragStart?: (pileIndex: number, cardIndex: number) => void;
		onDragEnd?: () => void;
		hiddenCardIds?: string[];
		disableAnimation?: boolean;
		hintCardIndex?: number;
		isHintTarget?: boolean;
		draggingPileIndex?: number | null;
		draggingCardIndex?: number | null;
	}
	
	let { pile, pileIndex, selectedPile, selectedCardIndex, onCardClick, onPileClick, onMouseDown, onDragStart, onDragEnd, hiddenCardIds = [], disableAnimation = false, hintCardIndex, isHintTarget = false, draggingPileIndex = null, draggingCardIndex = null }: Props = $props();
	
	function handleDragStart(cardIndex: number) {
		return (e: DragEvent) => {
			currentDragSourcePile = pileIndex;
			
			if (e.dataTransfer) {
				e.dataTransfer.effectAllowed = 'move';
				e.dataTransfer.setData('application/json', JSON.stringify({
					pileIndex,
					cardIndex
				}));
				
				// Create a container with all cards for drag image
				const container = document.createElement('div');
				container.style.position = 'absolute';
				container.style.top = '-1000px';
				container.style.width = '85px';
				document.body.appendChild(container);
				
				// Add all cards from this index onwards
				const cardsToShow = pile.cards.slice(cardIndex);
				cardsToShow.forEach((card, idx) => {
					const cardDiv = document.createElement('div');
					cardDiv.style.position = 'absolute';
					cardDiv.style.top = `${idx * 35}px`;
					cardDiv.style.width = '85px';
					cardDiv.style.height = '130px';
					cardDiv.style.borderRadius = '8px';
					cardDiv.style.border = '2px solid #333';
					cardDiv.style.background = card.faceUp ? '#fff' : '#222';
					cardDiv.textContent = card.faceUp ? `${card.rank}${card.suit}` : '';
					container.appendChild(cardDiv);
				});
				
				e.dataTransfer.setDragImage(container, 42, 15);
				
				// Clean up after a moment
				setTimeout(() => document.body.removeChild(container), 0);
			}
			
			onDragStart?.(pileIndex, cardIndex);
		};
	}
	
	function handleDragEndEvent() {
		// Reset drag state when drag ends
		currentDragSourcePile = null;
		onDragEnd?.();
	}
	
	function handleDragEnter(e: DragEvent) {
		e.preventDefault();
	}
	
	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = 'move';
		}
	}
	
	function handleDragLeave(e: DragEvent) {
		e.preventDefault();
	}
	
	function handleDrop(e: DragEvent) {
		e.preventDefault();
		currentDragSourcePile = null;
		
		if (e.dataTransfer) {
			const data = e.dataTransfer.getData('application/json');
			if (data) {
				try {
					const { pileIndex: sourcePile, cardIndex } = JSON.parse(data);
					if (sourcePile !== pileIndex && typeof sourcePile === 'number' && typeof cardIndex === 'number') {
						// Validate if this is a legal move
						const sourceCards = pile.cards.slice(cardIndex);
						const targetTopCard = pile.cards[pile.cards.length - 1];
						const firstCardToMove = sourceCards[0];
						
						// Check if move is valid
						let isValidMove = false;
						if (!targetTopCard) {
							// Empty pile - always valid
							isValidMove = true;
						} else if (firstCardToMove) {
							// Card must be one rank lower than target
							const rankValues: Record<string, number> = {
								'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
								'8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13
							};
							const targetValue = rankValues[targetTopCard.rank];
							const cardValue = rankValues[firstCardToMove.rank];
							isValidMove = cardValue === targetValue - 1;
						}
						
						if (isValidMove) {
							// Valid move - execute it
							onDragEnd?.();
							onCardClick(sourcePile, cardIndex, true);
							onPileClick(pileIndex);
						} else {
							// Invalid move - just end drag (cards return to source)
							onDragEnd?.();
						}
					}
				} catch (err) {
					console.error('Error handling drop:', err);
					onDragEnd?.();
				}
			}
		}
	}
</script>

<div
	class="pile"
	class:hint-target={isHintTarget}
	role="button"
	tabindex="0"
	onclick={() => onPileClick(pileIndex)}
	ondragenter={handleDragEnter}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
>
	{#if pile.cards.length === 0}
		<div class="empty-pile"/>
	{:else if disableAnimation}
		{#each pile.cards as card, index (card.id)}
			<div
				class="card-container"
				class:hidden={hiddenCardIds.includes(card.id)}
				class:hint-card={hintCardIndex !== undefined && index >= hintCardIndex}
				class:dragging={draggingPileIndex === pileIndex && draggingCardIndex !== null && index >= draggingCardIndex}
				style="top: {index * 35}px;"
			>
				<Card
					suit={card.suit}
					rank={card.rank}
					faceUp={card.faceUp}
					selected={selectedPile === pileIndex && selectedCardIndex !== null && index >= selectedCardIndex}
					onclick={() => onCardClick(pileIndex, index)}
					onmousedown={onMouseDown}
					ondragstart={card.faceUp ? handleDragStart(index) : undefined}
					ondragend={card.faceUp ? handleDragEndEvent : undefined}
					draggable={card.faceUp}
				/>
			</div>
		{/each}
	{:else}
		{#each pile.cards as card, index (card.id)}
			<div
				class="card-container"
				class:hidden={hiddenCardIds.includes(card.id)}
				class:hint-card={hintCardIndex !== undefined && index >= hintCardIndex}
				class:dragging={draggingPileIndex === pileIndex && draggingCardIndex !== null && index >= draggingCardIndex}
				style="top: {index * 35}px;"
				animate:flip={{ duration: 200, easing: cubicOut }}
			>
				<Card
					suit={card.suit}
					rank={card.rank}
					faceUp={card.faceUp}
					selected={selectedPile === pileIndex && selectedCardIndex !== null && index >= selectedCardIndex}
					onclick={() => onCardClick(pileIndex, index)}
					onmousedown={onMouseDown}
					ondragstart={card.faceUp ? handleDragStart(index) : undefined}
					ondragend={card.faceUp ? handleDragEndEvent : undefined}
					draggable={card.faceUp}
				/>
			</div>
		{/each}
	{/if}
</div>

<style>
	.pile {
		position: relative;
		min-height: 150px;
		width: 100%;
		min-width: 85px;
		max-width: 140px;
		flex: 1 1 auto;
		background: #0a0a0a;
		border-radius: 8px;
		cursor: pointer;
		overflow: visible;
	}
	
	.pile.hint-target {
		background: rgba(255, 215, 0, 0.1);
		border: 2px dashed #ffd700;
		animation: hintPulse 2s ease-in-out infinite;
	}
	
	@keyframes hintPulse {
		0%, 100% {
			border-color: #ffd700;
			box-shadow: 0 0 0 rgba(255, 215, 0, 0.4);
		}
		50% {
			border-color: #ffed4e;
			box-shadow: 0 0 20px rgba(255, 215, 0, 0.4);
		}
	}
	
	.empty-pile {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 150px;
		color: #444;
		font-size: 14px;
	}
	
	.card-container {
		position: absolute;
		left: 5px;
		right: 5px;
		width: calc(100% - 10px);
	}
	
	.card-container.hidden {
		opacity: 0;
		pointer-events: none;
	}
	
	.card-container.dragging {
		opacity: 0.5;
	}
	
	.card-container.hint-card {
		animation: hintGlow 2s ease-in-out infinite;
	}
	
	@keyframes hintGlow {
		0%, 100% {
			filter: drop-shadow(0 0 8px rgba(255, 215, 0, 0.6));
		}
		50% {
			filter: drop-shadow(0 0 16px rgba(255, 215, 0, 0.9));
		}
	}
</style>
