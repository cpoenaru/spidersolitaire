<script lang="ts">
	import type { Suit, Rank } from '$lib/types';
	import { fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	
	interface Props {
		suit?: Suit;
		rank?: Rank;
		faceUp?: boolean;
		selected?: boolean;
		onclick?: () => void;
		onmousedown?: () => void;
		ondragstart?: (e: DragEvent) => void;
		ondragend?: () => void;
		draggable?: boolean;
		animateIn?: boolean;
	}
	
	let {
		suit = '♠',
		rank = 'A',
		faceUp = true,
		selected = false,
		onclick,
		onmousedown,
		ondragstart,
		ondragend,
		draggable = false,
		animateIn = false
	}: Props = $props();
	
	const isRed = $derived(suit === '♥' || suit === '♦');
	
	function getCardImagePath(suit: Suit, rank: Rank): string {
		const suitMap: Record<Suit, string> = {
			'♠': 'SPADE',
			'♥': 'HEART',
			'♦': 'DIAMOND',
			'♣': 'CLUB'
		};
		
		const rankMap: Record<Rank, string> = {
			'A': '1',
			'2': '2',
			'3': '3',
			'4': '4',
			'5': '5',
			'6': '6',
			'7': '7',
			'8': '8',
			'9': '9',
			'10': '10',
			'J': '11-JACK',
			'Q': '12-QUEEN',
			'K': '13-KING'
		};
		
		return `/cards/${suitMap[suit]}-${rankMap[rank]}.svg`;
	}
	
	const cardImagePath = $derived(getCardImagePath(suit, rank));
</script>

<button
	class="card"
	class:face-down={!faceUp}
	class:selected
	onclick={onclick}
	onmousedown={onmousedown}
	ondragstart={ondragstart}
	ondragend={ondragend}
	{draggable}
	type="button"
>
	{#if faceUp}
		<img src={cardImagePath} alt="{rank} of {suit}" class="card-image"
			in:fade={{ duration: 150, easing: cubicOut }} />
	{:else}
		<div class="card-back" in:fade={{ duration: 150, easing: cubicOut }}></div>
	{/if}
</button>

<style>
	.card {
		width: 100%;
		height: 160px;
		border-radius: 8px;
		border: 2px solid #444;
		background: #fff;
		position: relative;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		justify-content: stretch;
		font-weight: bold;
		font-size: 18px;
		box-shadow: 0 4px 8px rgba(0, 0, 0, 0.6), 0 2px 4px rgba(0, 0, 0, 0.4);
		padding: 0;
		margin: 0;
		box-sizing: border-box;
		transition: transform 0.15s ease-out, box-shadow 0.15s ease-out;
	}
	
	.card:hover {
		transform: translateY(-2px);
		box-shadow: 0 6px 12px rgba(0, 0, 0, 0.7), 0 3px 6px rgba(0, 0, 0, 0.5);
	}
	
	.card.face-down {
		background: #1a1a1a;
		border-color: #333;
		cursor: default;
	}
	
	.card.selected {
		border-color: #fff;
		box-shadow: 0 0 15px rgba(255, 255, 255, 0.8);
		transform: translateY(-4px);
		animation: pulse 0.5s ease-in-out;
	}
	
	@keyframes pulse {
		0%, 100% {
			box-shadow: 0 0 15px rgba(255, 255, 255, 0.8);
		}
		50% {
			box-shadow: 0 0 25px rgba(255, 255, 255, 1);
		}
	}
	
	.card-image {
		width: 100%;
		height: 100%;
		object-fit: contain;
		display: block;
		border-radius: 6px;
	}
	
	.card-back {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
		border-radius: 6px;
		background:
			radial-gradient(circle at 30% 30%, #333 0%, transparent 50%),
			radial-gradient(circle at 70% 70%, #333 0%, transparent 50%),
			repeating-linear-gradient(
				45deg,
				#1a1a1a 0px,
				#1a1a1a 5px,
				#2a2a2a 5px,
				#2a2a2a 10px
			);
	}
	
	.card-back::before {
		content: '🕷️';
		font-size: 40px;
		opacity: 0.3;
	}
</style>
