<script lang="ts">
	import type { Pile } from '$lib/types';
	import Card from './Card.svelte';
	import { flip } from 'svelte/animate';
	import { cubicOut } from 'svelte/easing';
	
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
	}
	
	let { pile, pileIndex, selectedPile, selectedCardIndex, onCardClick, onPileClick, onMouseDown, onDragStart, onDragEnd, hiddenCardIds = [], disableAnimation = false, hintCardIndex, isHintTarget = false }: Props = $props();
	
	let isDragOver = $state(false);
	
	function handleDragStart(cardIndex: number) {
		return (e: DragEvent) => {
			if (e.dataTransfer) {
				e.dataTransfer.effectAllowed = 'move';
				e.dataTransfer.setData('application/json', JSON.stringify({
					pileIndex,
					cardIndex
				}));
			}
			onDragStart?.(pileIndex, cardIndex);
		};
	}
	
	function handleDragEndEvent() {
		onDragEnd?.();
	}
	
	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = 'move';
		}
		isDragOver = true;
	}
	
	function handleDragLeave() {
		isDragOver = false;
	}
	
	function handleDrop(e: DragEvent) {
		console.log('handleDrop called', { pileIndex });
		e.preventDefault();
		isDragOver = false;
		
		if (e.dataTransfer) {
			const data = e.dataTransfer.getData('application/json');
			console.log('Drop data:', data);
			if (data) {
				try {
					const { pileIndex: sourcePile, cardIndex } = JSON.parse(data);
					console.log('Drop from pile', sourcePile, 'to pile', pileIndex);
					if (sourcePile !== pileIndex && typeof sourcePile === 'number' && typeof cardIndex === 'number') {
						// Reset drag end first so selection can happen
						onDragEnd?.();
						
						console.log('Selecting cards from drop (skip auto-move)');
						// First select the cards that were dragged (skip auto-move)
						onCardClick(sourcePile, cardIndex, true);
						console.log('Calling onPileClick for drop');
						// Then move them to the target pile
						onPileClick(pileIndex);
					}
				} catch (err) {
					console.error('Error handling drop:', err);
				}
			}
		}
	}
</script>

<div
	class="pile"
	class:drag-over={isDragOver}
	class:hint-target={isHintTarget}
	role="button"
	tabindex="0"
	onclick={() => onPileClick(pileIndex)}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
>
	{#if pile.cards.length === 0}
		<div class="empty-pile">Empty</div>
	{:else if disableAnimation}
		{#each pile.cards as card, index (card.id)}
			<div
				class="card-container"
				class:hidden={hiddenCardIds.includes(card.id)}
				class:hint-card={hintCardIndex !== undefined && index >= hintCardIndex}
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
	
	.pile.drag-over {
		background: #1a1a1a;
		border-color: #666;
		border-style: solid;
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
