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
		onPileClick: (pileIndex: number, skipAnimation?: boolean) => void;
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
			
			// Add dragging class to body for cursor override
			document.body.classList.add('dragging');
			
			if (e.dataTransfer) {
				e.dataTransfer.effectAllowed = 'move';
				e.dataTransfer.setData('application/json', JSON.stringify({
					pileIndex,
					cardIndex
				}));
				
				// Create a transparent 1x1 pixel image to hide default drag ghost
				const transparentImg = document.createElement('img');
				transparentImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
				e.dataTransfer.setDragImage(transparentImg, 0, 0);
			}
			
			onDragStart?.(pileIndex, cardIndex);
		};
	}
	
	function handleDragEndEvent() {
		// Remove dragging class from body
		document.body.classList.remove('dragging');
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
			// Always use 'move' to avoid the "not allowed" cursor
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
						// Attempt the move - game logic will validate
						// Skip animation since the visual movement already happened during drag
						onDragEnd?.();
						onCardClick(sourcePile, cardIndex, true);
						onPileClick(pileIndex, true);
					} else {
						// Same pile or invalid data
						onDragEnd?.();
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
				style="top: {index * 40}px;"
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
				style="top: {index * 40}px;"
				animate:flip={{ duration: 300, easing: cubicOut }}
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
		min-height: 160px;
		width: 100%;
		min-width: 110px;
		max-width: 120px;
		flex: 1 1 auto;
		border-radius: 8px;
		cursor: pointer;
		overflow: visible;
	}
	
	/* Hide default drag cursor */
	:global(body.dragging) {
		cursor: grabbing !important;
	}
	
	:global(body.dragging *) {
		cursor: grabbing !important;
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
		height: 160px;
		background: #1a1a1a;
		border: 2px solid #333;
		border-radius: 8px;
		margin: 0 3px;
		color: #444;
		font-size: 14px;
	}
	
	.card-container {
		position: absolute;
		left: 3px;
		right: 3px;
		width: calc(100% - 6px);
		cursor: grab;
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
