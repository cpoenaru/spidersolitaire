<script lang="ts">
	import { game } from '$lib/gameStore.svelte';
	import Pile from '$lib/components/Pile.svelte';
	import Card from '$lib/components/Card.svelte';
	import type { Difficulty, Card as CardType } from '$lib/types';
	import { onMount } from 'svelte';
	import { scale } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	
	let isDealing = $state(false);
	let dealingCards = $state<Array<{id: number; targetPile: number; progress: number; card: CardType}>>([]);
	let dealtCardIds = $state<string[]>([]);
	
	let isMoving = $state(false);
	let isDragging = $state(false);
	let dragStarted = $state(false);
	let flyingCards = $state<Array<{
		card: CardType;
		id: number;
		sourcePile: number;
		sourceIndex: number;
		targetPile: number;
		targetOffset: number;
		progress: number;
	}>>([]);
	let justArrivedCardIds = $state<number[]>([]);
	
	// Drag preview state
	let showDragPreview = $state(false);
	let dragPreviewX = $state(0);
	let dragPreviewY = $state(0);
	let dragPreviewCards = $state<CardType[]>([]);
	let draggingPileIndex = $state<number | null>(null);
	let draggingCardIndex = $state<number | null>(null);
	
	// Track piles that should temporarily disable animation (for drag & drop)
	let pilesWithDisabledAnimation = $state<Set<number>>(new Set());
	
	let mouseDownTime = 0;
	let isMouseDragging = false;
	let showNewGameConfirm = $state(false);
	let pendingDifficulty = $state<Difficulty | undefined>(undefined);
	
	function handleMouseDown() {
		mouseDownTime = Date.now();
		isMouseDragging = false;
	}
	
	async function handleCardClick(pileIndex: number, cardIndex: number, skipAutoMove = false) {
		
		// If mouse was dragging, ignore the click
		if (isMouseDragging) {
			isMouseDragging = false;
			return;
		}
		
		// Safety check: ensure pile and card exist (can be stale from drag/drop)
		const pile = game.state.tableau[pileIndex];
		if (!pile || !pile.cards || cardIndex >= pile.cards.length || cardIndex < 0) {
			// Silently ignore - index may be stale from animations
			return;
		}
		
		const card = pile.cards[cardIndex];
		if (!card || !card.faceUp || isMoving) return;
		
		// If skipAutoMove is true (from drag & drop), just select
		if (skipAutoMove) {
			game.selectCards(pileIndex, cardIndex, true);
			return;
		}
		
		// Find best move destination
		const bestPile = game.findBestMove(pileIndex, cardIndex);
		
		if (bestPile !== null && bestPile !== pileIndex) {
			// Animate the move
			await animateMove(pileIndex, cardIndex, bestPile);
		} else {
			// Just select for manual move
			game.selectCards(pileIndex, cardIndex);
		}
	}
	
	function handleDragStart(pileIndex: number, cardIndex: number) {
		isMouseDragging = true;
		draggingPileIndex = pileIndex;
		draggingCardIndex = cardIndex;
		
		// Set up drag preview (our custom overlay)
		const pile = game.state.tableau[pileIndex];
		const cardsToMove = pile.cards.slice(cardIndex);
		dragPreviewCards = cardsToMove;
		showDragPreview = true;
		
		// Track mouse movement for drag preview
		window.addEventListener('dragover', handleDragMove);
	}
	
	function handleDragMove(e: DragEvent) {
		if (showDragPreview && e.clientX !== 0 && e.clientY !== 0) {
			// Constrain drag preview to window bounds with padding
			const padding = 20;
			const previewWidth = 110;
			const previewHeight = 160 + (dragPreviewCards.length - 1) * 35;
			
			dragPreviewX = Math.max(padding, Math.min(e.clientX, window.innerWidth - previewWidth - padding));
			dragPreviewY = Math.max(padding, Math.min(e.clientY, window.innerHeight - previewHeight - padding));
		}
	}
	
	function handleDragEnd() {
		// Reset the dragging flag immediately
		isMouseDragging = false;
		showDragPreview = false;
		dragPreviewCards = [];
		draggingPileIndex = null;
		draggingCardIndex = null;
		window.removeEventListener('dragover', handleDragMove);
	}
	
	async function handlePileClick(pileIndex: number, skipAnimation = false) {
		
		if (game.selectedPile === null || game.selectedCardIndex === null || isMoving) {
			return;
		}
		
		if (game.selectedPile === pileIndex) {
			game.clearSelection();
			return;
		}
		
		if (skipAnimation) {
			// Temporarily disable animation for both source and target piles
			const sourcePile = game.selectedPile;
			pilesWithDisabledAnimation.add(sourcePile);
			pilesWithDisabledAnimation.add(pileIndex);
			
			// Execute the move without animation
			game.moveCards(pileIndex);
			
			// Re-enable animations after a short delay (after the state has updated)
			setTimeout(() => {
				pilesWithDisabledAnimation.delete(sourcePile);
				pilesWithDisabledAnimation.delete(pileIndex);
				pilesWithDisabledAnimation = new Set(pilesWithDisabledAnimation); // Trigger reactivity
			}, 50);
		} else {
			// Animate the move
			await animateMove(game.selectedPile, game.selectedCardIndex, pileIndex);
		}
	}
	
	async function animateMove(sourcePileIndex: number, cardIndex: number, targetPileIndex: number) {
		const sourcePile = game.state.tableau[sourcePileIndex];
		const cardsToMove = sourcePile.cards.slice(cardIndex);
		
		if (cardsToMove.length === 0) return;
		
		// Set selection state
		game.selectedPile = sourcePileIndex;
		game.selectedCardIndex = cardIndex;
		
		// Check if move is valid
		const targetPile = game.state.tableau[targetPileIndex];
		const targetCard = targetPile.cards[targetPile.cards.length - 1] || null;
		
		// Import canPlaceCard check inline to avoid circular deps
		const firstCard = cardsToMove[0];
		let canPlace = false;
		if (!targetCard) {
			canPlace = true;
		} else {
			const targetValue = game.getRankValue(targetCard.rank);
			const cardValue = game.getRankValue(firstCard.rank);
			canPlace = cardValue === targetValue - 1;
		}
		
		if (!canPlace) {
			game.clearSelection();
			return;
		}
		
		isMoving = true;
		
		// Calculate target offsets BEFORE updating state
		const targetPileBeforeMove = game.state.tableau[targetPileIndex];
		const targetPileCardCount = targetPileBeforeMove.cards.length;
		
		// Deep clone cards for animation to avoid reference issues
		const clonedCardsForAnimation = cardsToMove.map(card => ({...card}));
		
		// Create flying cards with pre-calculated target offsets using cloned cards
		flyingCards = clonedCardsForAnimation.map((card, i) => ({
			card,
			id: card.id,
			sourcePile: sourcePileIndex,
			sourceIndex: cardIndex + i,
			targetPile: targetPileIndex,
			targetOffset: (targetPileCardCount + i) * 40,
			progress: 0
		}));
		
		// Store the card IDs that will arrive
		justArrivedCardIds = clonedCardsForAnimation.map(c => c.id);
		
		// Complete the move immediately but hide the arrived cards
		game.moveCards(targetPileIndex);
		
		// Animate all cards together with smoother timing
		const duration = 200;
		const startTime = Date.now();
		
		const animate = () => {
			const elapsed = Date.now() - startTime;
			const progress = Math.min(elapsed / duration, 1);
			
			flyingCards = flyingCards.map(fc => ({
				...fc,
				progress
			}));
			
			if (progress < 1) {
				requestAnimationFrame(animate);
			}
		};
		
		animate();
		
		// Wait for animation to complete
		await new Promise(resolve => setTimeout(resolve, duration));
		
		// Clear everything
		flyingCards = [];
		justArrivedCardIds = [];
		isMoving = false;
	}
	
	function handleNewGame(difficulty?: Difficulty) {
		// Don't restart if clicking the same difficulty
		if (difficulty && difficulty === game.state.difficulty && game.state.moves > 0 && !game.noMovesLeft) {
			return;
		}
		
		// Skip confirmation if game is already over (won or no moves left)
		if (game.state.gameWon || game.noMovesLeft) {
			game.newGame(difficulty);
			return;
		}
		
		// Confirm if there's an active game
		if (game.state.moves > 0) {
			pendingDifficulty = difficulty;
			showNewGameConfirm = true;
			return;
		}
		game.newGame(difficulty);
	}
	
	function confirmNewGame() {
		game.newGame(pendingDifficulty);
		showNewGameConfirm = false;
		pendingDifficulty = undefined;
	}
	
	function cancelNewGame() {
		showNewGameConfirm = false;
		pendingDifficulty = undefined;
	}
	
	async function handleDeal() {
		if (!game.canDeal || isDealing) return;
		
		isDealing = true;
		
		// Get the actual cards that will be dealt
		const cardsToAnimate = game.state.stock.slice(0, 10).map((card, i) => ({
			id: i,
			targetPile: i,
			progress: 0,
			card: { ...card, faceUp: false } // Start face down
		}));
		
		dealingCards = cardsToAnimate;
		
		// Store card IDs to hide them after dealing
		dealtCardIds = cardsToAnimate.map(c => c.card.id);
		
		// Actually deal the cards immediately but hide them
		game.deal();
		
		// Animate each card sequentially
		for (let i = 0; i < 10; i++) {
			await animateCard(i);
			await new Promise(resolve => setTimeout(resolve, 5));
		}
		
		// Clear everything
		dealingCards = [];
		dealtCardIds = [];
		isDealing = false;
	}
	
	async function animateCard(index: number) {
		return new Promise<void>(resolve => {
			const duration = 120;
			const startTime = Date.now();
			
			const animate = () => {
				const elapsed = Date.now() - startTime;
				const progress = Math.min(elapsed / duration, 1);
				
				dealingCards[index].progress = progress;
				
				if (progress < 1) {
					requestAnimationFrame(animate);
				} else {
					resolve();
				}
			};
			
			animate();
		});
	}
	
	function handleUndo() {
		game.undo();
	}
	
	function handleHint() {
		game.showHint();
	}
	
	function handleKeydown(e: KeyboardEvent) {
		if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
			e.preventDefault();
			handleUndo();
		}
		if (e.key === 'h' || e.key === 'H') {
			e.preventDefault();
			handleHint();
		}
	}
	
	function handleGlobalDragOver(e: DragEvent) {
		// Prevent default to allow drop everywhere and avoid "not allowed" cursor
		e.preventDefault();
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = 'move';
		}
	}
	
	onMount(() => {
		// Clear any residual animation state on mount
		isMoving = false;
		isDealing = false;
		flyingCards = [];
		dealingCards = [];
		justArrivedCardIds = [];
		dealtCardIds = [];
		
		// Force a fresh game state on mount to clear any HMR artifacts
		game.gameKey = Date.now();
		
		window.addEventListener('keydown', handleKeydown);
		// Add global dragover handler to prevent "not allowed" cursor
		window.addEventListener('dragover', handleGlobalDragOver);
		
		return () => {
			window.removeEventListener('keydown', handleKeydown);
			window.removeEventListener('dragover', handleGlobalDragOver);
		};
	});
	
	const difficultyNames: Record<Difficulty, string> = {
		easy: '1 Suit',
		medium: '2 Suits',
		hard: '4 Suits'
	};
	
	const stockDecks = $derived(Math.floor(game.state.stock.length / 10));
</script>

<svelte:head>
	<!-- Primary Meta Tags -->
	<title>Spider Solitaire - Free Online Card Game | Play Now</title>
	<meta name="title" content="Spider Solitaire - Free Online Card Game | Play Now" />
	<meta name="description" content="Play Spider Solitaire online for free! Classic card game with 1, 2, or 4 suit modes. Features smooth animations, hints, undo, and works perfectly on mobile. No downloads or registration required." />
	<meta name="keywords" content="spider solitaire, solitaire, card game, free games, online games, patience, klondike, spider solitaire free, spider solitaire online, card games" />
	<meta name="author" content="Cosmin" />
	
	<!-- Open Graph / Facebook -->
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://spidersolitaire.cosmin.cc/" />
	<meta property="og:title" content="Spider Solitaire - Free Online Card Game" />
	<meta property="og:description" content="Play Spider Solitaire online for free! Choose from 1, 2, or 4 suit difficulty modes. Smooth animations, hints, and undo features. Perfect for mobile and desktop." />
	<meta property="og:image" content="https://spidersolitaire.cosmin.cc/web-app-manifest-512x512.png" />
	<meta property="og:image:width" content="512" />
	<meta property="og:image:height" content="512" />
	<meta property="og:site_name" content="Spider Solitaire" />
	<meta property="og:locale" content="en_US" />
	
	<!-- Twitter Card -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:url" content="https://spidersolitaire.cosmin.cc/" />
	<meta name="twitter:title" content="Spider Solitaire - Free Online Card Game" />
	<meta name="twitter:description" content="Play Spider Solitaire online for free! Choose from 1, 2, or 4 suit difficulty modes. Perfect for mobile and desktop." />
	<meta name="twitter:image" content="https://spidersolitaire.cosmin.cc/web-app-manifest-512x512.png" />
	
	<!-- Additional SEO Tags -->
	<meta name="application-name" content="Spider Solitaire" />
	<meta name="apple-mobile-web-app-title" content="Spider Solitaire" />
	<link rel="alternate" hreflang="en" href="https://spidersolitaire.cosmin.cc/" />

	<!-- Google Search Console -->
	<meta name="google-site-verification" content="rdN_Z5XRtvis60749amJ0Tw1Q8VNobvIA5qkwv5p6GQ" />
	
	<!-- JSON-LD Structured Data -->
	{@html `<script type="application/ld+json">
	{
		"@context": "https://schema.org",
		"@type": "WebApplication",
		"name": "Spider Solitaire",
		"url": "https://spidersolitaire.cosmin.cc/",
		"description": "Play Spider Solitaire online for free! Classic card game with multiple difficulty levels featuring smooth animations, hints, and undo functionality.",
		"applicationCategory": "Game",
		"genre": ["Card Game", "Solitaire", "Puzzle"],
		"operatingSystem": "Any",
		"browserRequirements": "Requires JavaScript. Requires HTML5.",
		"offers": {
			"@type": "Offer",
			"price": "0",
			"priceCurrency": "USD"
		},
		"author": {
			"@type": "Person",
			"name": "Cosmin",
			"url": "https://cosmin.cc"
		},
		"creator": {
			"@type": "Person",
			"name": "Cosmin",
			"url": "https://cosmin.cc"
		},
		"screenshot": "https://spidersolitaire.cosmin.cc/web-app-manifest-512x512.png",
		"featureList": [
			"3 difficulty modes (1, 2, or 4 suits)",
			"Smooth card animations",
			"Hint system",
			"Unlimited undo",
			"Mobile-friendly design",
			"No registration required",
			"Free to play"
		],
		"inLanguage": "en-US",
		"isAccessibleForFree": true
	}
	<\/script>`}
</svelte:head>

<div class="game-container">
	<div class="top-bar">
		<div class="left-section">
			<!-- Stock piles -->
			<div class="stock-area" id="stock-pile">
				<button
					class="stock-pile"
					class:hint-deal={game.hint?.sourcePile === -1}
					onclick={handleDeal}
					disabled={!game.canDeal || isDealing}
					title="Deal cards"
				>
					{#each Array(Math.min(stockDecks, 5)) as _, i}
						<div class="stock-deck" style="left: {i * 2}px; top: {i * 2}px;"></div>
					{/each}
					{#if stockDecks === 0}
						<div class="stock-empty"></div>
					{/if}
				</button>
				<div class="stock-label">{stockDecks} left</div>
			</div>
			
			<!-- Completed sequences -->
			<div class="completed-sequences">
				{#each game.state.completedSequences as sequence (sequence.id)}
					<div class="completed-card" in:scale={{ duration: 400, start: 0.5 }}>
						<span class="suit-large" class:red={sequence.suit === '♥' || sequence.suit === '♦'}>
							{sequence.suit}
						</span>
					</div>
				{/each}
				{#each Array(8 - game.state.completedSequences.length) as _, i}
					<div class="completed-card empty"></div>
				{/each}
			</div>
		</div>
		
		<div class="center-section">
			<h1>🕷️ Spider Solitaire</h1>
			<div class="game-info">
				<div class="difficulty-selector">
					{#each ['easy', 'medium', 'hard'] as diff}
						<button
							class="difficulty-btn"
							class:active={game.state.difficulty === diff}
							onclick={() => handleNewGame(diff as Difficulty)}
						>
							{difficultyNames[diff as Difficulty]}
						</button>
					{/each}
				</div>
			</div>
		</div>
		
		<div class="right-section">
			<div class="stats">
				<div class="stat">
					<span class="value">{game.state.moves}</span>
					<span class="label">Moves</span>
				</div>
			</div>
			<div class="controls">
				<button onclick={() => handleNewGame()} class="btn btn-new" title="New Game">
					New
				</button>
				<button onclick={handleUndo} disabled={game.history.length === 0} class="btn btn-undo" title="Undo (Ctrl+Z)">
					Undo
				</button>
				<button onclick={handleHint} class="btn btn-hint" title="Show Hint (H)">
					💡 Hint
				</button>
			</div>
		</div>
	</div>
	
	{#if game.state.gameWon}
		<div class="win-message">
			<div class="win-content">
				<h2>🎉 Congratulations!</h2>
				<p>You won in {game.state.moves} moves!</p>
				<button onclick={() => handleNewGame()} class="btn btn-primary">
					Play Again
				</button>
			</div>
		</div>
	{/if}
	
	{#if game.noMovesLeft}
		<div class="no-moves-message">
			<div class="no-moves-content">
				<h2>🕷️ No More Moves</h2>
				<p>There are no valid moves available.</p>
				<div class="no-moves-buttons">
					<button onclick={() => handleNewGame()} class="btn btn-modal">
						New Game
					</button>
					<button onclick={handleUndo} disabled={game.history.length === 0} class="btn btn-modal">
						Undo Last Move
					</button>
					<button onclick={() => game.restartGame()} class="btn btn-modal">
						Restart This Game
					</button>
				</div>
			</div>
		</div>
	{/if}
	
	{#if game.hint}
		<div class="hint-message">
			<div class="hint-content">
				<span class="hint-icon">💡</span>
				<span class="hint-text">{game.hint.reason}</span>
				<button onclick={() => game.clearHint()} class="hint-close" title="Close (or wait 5s)">×</button>
			</div>
		</div>
	{/if}
	
	{#if showNewGameConfirm}
		<div class="confirm-overlay">
			<div class="confirm-content">
				<h2>Start New Game?</h2>
				<p>
					{pendingDifficulty
						? `Start a new game with ${difficultyNames[pendingDifficulty]}?`
						: 'Start a new game?'}
				</p>
				<p class="confirm-warning">Your current progress will be lost.</p>
				<div class="confirm-buttons">
					<button onclick={confirmNewGame} class="btn btn-primary">
						Yes, New Game
					</button>
					<button onclick={cancelNewGame} class="btn btn-secondary">
						Cancel
					</button>
				</div>
			</div>
		</div>
	{/if}
	
	{#key game.gameKey}
		<div class="tableau" id="tableau">
			{#each game.state.tableau as pile, pileIndex (game.gameKey + '-' + pileIndex)}
				{@const sourceHiddenCards = isMoving ? flyingCards.filter(fc => fc.sourcePile === pileIndex).map(fc => fc.id) : []}
				{@const isTargetPile = isMoving && flyingCards.length > 0 && flyingCards[0].targetPile === pileIndex}
				{@const targetHiddenCards = isTargetPile ? justArrivedCardIds : []}
				{@const dealingHiddenCards = isDealing ? dealtCardIds : []}
				{@const hiddenCards = [...sourceHiddenCards, ...targetHiddenCards, ...dealingHiddenCards]}
				{@const isHintSource = game.hint?.sourcePile === pileIndex}
				{@const isHintTarget = game.hint?.targetPile === pileIndex}
				{@const hintCardIndex = isHintSource ? game.hint?.cardIndex : null}
				<div class="pile-wrapper" id="pile-{pileIndex}">
					<Pile
						{pile}
						{pileIndex}
						selectedPile={game.selectedPile}
						selectedCardIndex={game.selectedCardIndex}
						onCardClick={handleCardClick}
						onPileClick={handlePileClick}
						onMouseDown={handleMouseDown}
						onDragStart={handleDragStart}
						onDragEnd={handleDragEnd}
						hiddenCardIds={hiddenCards}
						disableAnimation={isTargetPile || pilesWithDisabledAnimation.has(pileIndex)}
						hintCardIndex={hintCardIndex ?? undefined}
						isHintTarget={isHintTarget}
						{draggingPileIndex}
						{draggingCardIndex}
					/>
				</div>
			{/each}
		</div>
	{/key}
	
	<!-- Dealing animation overlay -->
	{#if isDealing}
		<div class="dealing-overlay">
			{#each dealingCards as dealCard (dealCard.id)}
				{@const stockEl = document.getElementById('stock-pile')}
				{@const pileWrapperEl = document.getElementById(`pile-${dealCard.targetPile}`)}
				{@const pileEl = pileWrapperEl?.querySelector('.pile')}
				{@const stockRect = stockEl?.getBoundingClientRect()}
				{@const pileRect = pileEl?.getBoundingClientRect()}
				{#if stockRect && pileRect}
					{@const startX = stockRect.left}
					{@const startY = stockRect.top}
					{@const pile = game.state.tableau[dealCard.targetPile]}
					{@const lastCardOffset = (pile.cards.length - 1) * 40}
					{@const endX = pileRect.left + 3}
					{@const endY = pileRect.top + lastCardOffset}
					{@const currentX = startX + (endX - startX) * dealCard.progress}
					{@const currentY = startY + (endY - startY) * dealCard.progress}
					{@const shouldFlip = dealCard.progress >= 0.7}
					<div
						class="flying-card"
						style="left: {currentX}px; top: {currentY}px; width: calc({pileRect.width}px - 6px); opacity: {dealCard.progress < 0.1 ? dealCard.progress * 10 : 1};"
					>
						<Card
							suit={dealCard.card.suit}
							rank={dealCard.card.rank}
							faceUp={shouldFlip}
						/>
					</div>
				{/if}
			{/each}
		</div>
	{/if}
	
	<!-- Moving cards animation overlay -->
	{#if isMoving && flyingCards.length > 0}
		<div class="dealing-overlay">
			{#each flyingCards as flyingCard, idx (flyingCard.id)}
				{@const sourcePileWrapperEl = document.getElementById(`pile-${flyingCard.sourcePile}`)}
				{@const targetPileWrapperEl = document.getElementById(`pile-${flyingCard.targetPile}`)}
				{@const sourcePileEl = sourcePileWrapperEl?.querySelector('.pile')}
				{@const targetPileEl = targetPileWrapperEl?.querySelector('.pile')}
				{@const sourceRect = sourcePileEl?.getBoundingClientRect()}
				{@const targetRect = targetPileEl?.getBoundingClientRect()}
				{#if sourceRect && targetRect}
					{@const sourceCardOffset = flyingCard.sourceIndex * 40}
					{@const startX = sourceRect.left + 3}
					{@const startY = sourceRect.top + sourceCardOffset}
					
					{@const endX = targetRect.left + 3}
					{@const endY = targetRect.top + flyingCard.targetOffset}
					
					{@const currentX = startX + (endX - startX) * flyingCard.progress}
					{@const currentY = startY + (endY - startY) * flyingCard.progress}
					<div
						class="flying-card"
						style="left: {currentX}px; top: {currentY}px; width: calc({sourceRect.width}px - 6px); z-index: {1000 + idx};"
					>
						<Card
							suit={flyingCard.card.suit}
							rank={flyingCard.card.rank}
							faceUp={flyingCard.card.faceUp}
						/>
					</div>
				{/if}
			{/each}
		</div>
		{/if}
		
		<!-- Drag preview overlay -->
		{#if showDragPreview && dragPreviewCards.length > 0}
			<div
				class="drag-preview"
				style="left: {dragPreviewX - 55}px; top: {dragPreviewY - 15}px;"
			>
				{#each dragPreviewCards as card, idx}
					<div class="drag-preview-card" style="top: {idx * 40}px;">
						<Card
							suit={card.suit}
							rank={card.rank}
							faceUp={card.faceUp}
						/>
					</div>
				{/each}
			</div>
		{/if}
		
		<footer>
			<a href="https://cosmin.cc" target="_blank" rel="noopener noreferrer">cosmin.cc</a>
		</footer>
	</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		background: #000;
		min-height: 100vh;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
		color: #fff;
		overflow-x: hidden;
	}
	
	.game-container {
		max-width: 1400px;
		margin: 0 auto;
		padding: 20px 15px;
		position: relative;
		overflow: visible;
		min-width: 320px;
	}
	
	.top-bar {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		gap: 20px;
		margin-bottom: 20px;
		align-items: start;
	}
	
	.left-section {
		display: flex;
		gap: 15px;
		align-items: flex-start;
	}
	
	.stock-area {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 5px;
	}
	
	.stock-pile {
		width: 100px;
		height: 140px;
		position: relative;
		border: 2px solid #333;
		border-radius: 8px;
		background: #0a0a0a;
		cursor: pointer;
		transition: all 0.2s;
	}
	
	.stock-pile:hover:not(:disabled) {
		border-color: #555;
		transform: translateY(-2px);
	}
	
	.stock-pile:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
	
	.stock-pile.hint-deal {
		border-color: #ffd700;
		box-shadow: 0 0 20px rgba(255, 215, 0, 0.6), 0 0 40px rgba(255, 215, 0, 0.4);
		animation: hintGlow 2s ease-in-out infinite;
	}
	
	@keyframes hintGlow {
		0%, 100% {
			border-color: #ffd700;
			box-shadow: 0 0 20px rgba(255, 215, 0, 0.6), 0 0 40px rgba(255, 215, 0, 0.4);
		}
		50% {
			border-color: #ffed4e;
			box-shadow: 0 0 30px rgba(255, 215, 0, 0.8), 0 0 60px rgba(255, 215, 0, 0.6);
		}
	}
	
	.stock-deck {
		position: absolute;
		width: calc(100% - 8px);
		height: calc(100% - 8px);
		background: #1a1a1a;
		border: 2px solid #444;
		border-radius: 6px;
		background: repeating-linear-gradient(
			45deg,
			#0a0a0a,
			#0a0a0a 10px,
			#222 10px,
			#222 20px
		);
	}
	
	.stock-empty {
		width: 100%;
		height: 100%;
		border: 2px dashed #333;
		border-radius: 6px;
	}
	
	.stock-label {
		font-size: 12px;
		color: #888;
	}
	
	.completed-sequences {
		display: flex;
		gap: 8px;
	}
	
	.completed-card {
		width: 90px;
		height: 125px;
		border: 2px solid #333;
		border-radius: 8px;
		background: #1a1a1a;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 48px;
	}
	
	.completed-card.empty {
		background: #0a0a0a;
		border-style: dashed;
	}
	
	.suit-large {
		color: #fff;
	}
	
	.suit-large.red {
		color: #dc143c;
	}
	
	.center-section {
		text-align: center;
	}
	
	h1 {
		font-size: 32px;
		margin: 0 0 10px 0;
		text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
	}
	
	.game-info {
		display: flex;
		flex-direction: column;
		gap: 10px;
		align-items: center;
	}
	
	.difficulty-selector {
		display: flex;
		gap: 8px;
	}
	
	.difficulty-btn {
		padding: 6px 16px;
		font-size: 13px;
		font-weight: bold;
		border: 2px solid #333;
		border-radius: 6px;
		background: #111;
		color: #888;
		cursor: pointer;
		transition: all 0.2s;
	}
	
	.difficulty-btn:hover {
		border-color: #555;
		color: #aaa;
	}
	
	.difficulty-btn.active {
		background: #222;
		border-color: #fff;
		color: #fff;
	}
	
	.right-section {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 10px;
	}
	
	.stats {
		display: flex;
		gap: 20px;
	}
	
	.stat {
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	
	.label {
		font-size: 12px;
		color: #888;
	}
	
	.value {
		font-size: 24px;
		font-weight: bold;
	}
	
	.controls {
		display: flex;
		gap: 10px;
	}
	
	.btn {
		padding: 8px 16px;
		font-size: 14px;
		font-weight: bold;
		border: 2px solid #333;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.2s;
		background: #111;
		color: #fff;
	}
	
	.btn:hover:not(:disabled) {
		background: #222;
		border-color: #555;
		transform: translateY(-1px);
	}
	
	.btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}
	
	.btn-new {
		border-color: #fff;
	}
	
	.btn-new:hover:not(:disabled) {
		background: #fff;
		color: #000;
	}
	
	.btn-undo {
		border-color: #888;
	}
	
	.btn-hint {
		border-color: #ffd700;
		color: #ffd700;
	}
	
	.btn-hint:hover:not(:disabled) {
		background: #ffd700;
		color: #000;
	}
	
	.btn-primary {
		border-color: #fff;
		padding: 12px 24px;
		font-size: 16px;
	}
	
	.btn-primary:hover {
		background: #fff;
		color: #000;
	}
	
	.hint-message {
		position: fixed;
		top: 80px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 999;
		animation: slideInDown 0.3s ease-out;
	}
	
	@keyframes slideInDown {
		from {
			opacity: 0;
			transform: translateX(-50%) translateY(-20px);
		}
		to {
			opacity: 1;
			transform: translateX(-50%) translateY(0);
		}
	}
	
	.hint-content {
		background: linear-gradient(135deg, #2a2a1a 0%, #3a3a2a 100%);
		border: 2px solid #ffd700;
		padding: 16px 24px;
		border-radius: 12px;
		display: flex;
		align-items: center;
		gap: 12px;
		box-shadow: 0 4px 20px rgba(255, 215, 0, 0.4);
		min-width: 300px;
	}
	
	.hint-icon {
		font-size: 24px;
		animation: pulse 2s ease-in-out infinite;
	}
	
	@keyframes pulse {
		0%, 100% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.2);
		}
	}
	
	.hint-text {
		flex: 1;
		font-size: 16px;
		color: #ffd700;
		font-weight: bold;
	}
	
	.hint-close {
		background: none;
		border: 2px solid #ffd700;
		color: #ffd700;
		font-size: 24px;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s;
		padding: 0;
		line-height: 1;
	}
	
	.hint-close:hover {
		background: #ffd700;
		color: #000;
		transform: rotate(90deg);
	}
	
	.tableau {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		margin-top: 20px;
		min-height: 700px;
		overflow: visible;
		width: 100%;
	}
	
	.pile-wrapper {
		flex: 1;
		overflow: visible;
	}
	
	.dealing-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		pointer-events: none;
		z-index: 999;
	}
	
	.flying-card {
		position: absolute;
		height: 160px;
		transition: opacity 0.1s;
		filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.5));
		box-sizing: border-box;
		pointer-events: none;
	}
	
	.flying-card :global(.card) {
		width: 100%;
		height: 100%;
		transition: none !important;
	}
	
	.flying-card :global(.card):hover {
		transform: none !important;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.5) !important;
	}
	
	.flying-card :global(.card-image),
	.flying-card :global(.card-back) {
		transition: none !important;
	}
	
	.win-message {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.95);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		animation: fadeIn 0.5s ease-out;
	}
	
	@keyframes fadeIn {
		from {
			opacity: 0;
			backdrop-filter: blur(0px);
		}
		to {
			opacity: 1;
			backdrop-filter: blur(5px);
		}
	}
	
	.win-content {
		background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%);
		border: 3px solid #ffd700;
		padding: 40px;
		border-radius: 16px;
		text-align: center;
		animation: celebrate 0.8s ease-out;
		box-shadow: 0 0 40px rgba(255, 215, 0, 0.5);
	}
	
	@keyframes celebrate {
		0% {
			transform: scale(0.5) rotate(-5deg);
			opacity: 0;
		}
		50% {
			transform: scale(1.1) rotate(2deg);
		}
		100% {
			transform: scale(1) rotate(0deg);
			opacity: 1;
		}
	}
	
	.win-content h2 {
		font-size: 36px;
		margin: 0 0 20px 0;
		animation: bounce 1s ease-in-out infinite;
		color: #ffd700;
		text-shadow: 0 0 20px rgba(255, 215, 0, 0.5);
	}
	
	@keyframes bounce {
		0%, 100% {
			transform: translateY(0);
		}
		50% {
			transform: translateY(-10px);
		}
	}
	
	.win-content p {
		font-size: 20px;
		margin: 0 0 30px 0;
		color: #aaa;
	}
	
	footer {
		text-align: center;
		padding: 20px;
		margin-top: 30px;
	}
	
	footer a {
		color: #888;
		text-decoration: none;
		font-size: 14px;
		transition: color 0.2s;
	}
	
	footer a:hover {
		color: #fff;
	}
	
	.no-moves-message {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.95);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		animation: fadeIn 0.5s ease-out;
	}
	
	.no-moves-content {
		background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%);
		border: 3px solid #ff6b6b;
		padding: 40px;
		border-radius: 16px;
		text-align: center;
		animation: slideDown 0.6s ease-out;
		box-shadow: 0 0 40px rgba(255, 107, 107, 0.5);
		min-width: 400px;
	}
	
	@keyframes slideDown {
		0% {
			transform: translateY(-100px);
			opacity: 0;
		}
		100% {
			transform: translateY(0);
			opacity: 1;
		}
	}
	
	.no-moves-content h2 {
		font-size: 32px;
		margin: 0 0 20px 0;
		color: #ff6b6b;
		text-shadow: 0 0 20px rgba(255, 107, 107, 0.5);
	}
	
	.no-moves-content p {
		font-size: 18px;
		margin: 0 0 30px 0;
		color: #aaa;
	}
	
	.no-moves-buttons {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	
	.btn-modal {
		width: 100%;
		padding: 12px 24px;
		font-size: 16px;
		border-color: #fff;
	}
	
	.btn-modal:hover:not(:disabled) {
		background: #fff;
		color: #000;
	}
	
	.btn-modal:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}
	
	.confirm-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.9);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		animation: fadeIn 0.3s ease-out;
	}
	
	.confirm-content {
		background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%);
		border: 2px solid #ffd700;
		padding: 40px;
		border-radius: 16px;
		text-align: center;
		animation: slideDown 0.3s ease-out;
		box-shadow: 0 0 40px rgba(255, 215, 0, 0.3);
		min-width: 400px;
		max-width: 500px;
	}
	
	.confirm-content h2 {
		font-size: 28px;
		margin: 0 0 20px 0;
		color: #ffd700;
	}
	
	.confirm-content p {
		font-size: 16px;
		margin: 0 0 15px 0;
		color: #ccc;
	}
	
	.confirm-warning {
		font-size: 14px;
		color: #ff6b6b;
		margin-bottom: 30px !important;
	}
	
	.confirm-buttons {
		display: flex;
		gap: 12px;
		justify-content: center;
	}
	
	.btn-secondary {
		background: #222;
		border-color: #666;
		color: #ccc;
	}
	
	.btn-secondary:hover {
		background: #333;
		border-color: #888;
	}
	
	@media (max-width: 1200px) {
		.top-bar {
			grid-template-columns: 1fr;
			gap: 15px;
		}
		
		.left-section,
		.center-section,
		.right-section {
			justify-content: center;
			align-items: center;
		}
		
		.right-section {
			flex-direction: row;
		}
		
		.tableau {
			gap: 6px;
		}
		
		.completed-sequences {
			gap: 5px;
			flex-wrap: wrap;
		}
		
		.completed-card {
			width: 65px;
			height: 90px;
			font-size: 32px;
		}
		
		:global(.card) {
			height: 140px;
		}
		
		.pile-wrapper {
			min-width: 90px;
		}
	}
	
	@media (max-width: 900px) {
		.game-container {
			padding: 15px 10px;
		}
		
		h1 {
			font-size: 26px;
		}
		
		.tableau {
			gap: 4px;
		}
		
		.completed-sequences {
			gap: 4px;
		}
		
		.completed-card {
			width: 55px;
			height: 75px;
			font-size: 28px;
		}
		
		.stock-pile {
			width: 80px;
			height: 110px;
		}
		
		:global(.card) {
			height: 120px;
		}
		
		.pile-wrapper {
			min-width: 75px;
		}
	}
	
	@media (max-width: 768px) {
		h1 {
			font-size: 22px;
		}
		
		.difficulty-btn {
			padding: 5px 12px;
			font-size: 12px;
		}
		
		.btn {
			padding: 6px 12px;
			font-size: 13px;
		}
		
		.value {
			font-size: 20px;
		}
		
		.tableau {
			min-height: 500px;
		}
	}
	
	@media (max-width: 600px) {
		.game-container {
			padding: 10px 5px;
		}
		
		h1 {
			font-size: 20px;
			margin: 0 0 8px 0;
		}
		
		.left-section {
			flex-direction: column;
			gap: 10px;
			align-items: center;
		}
		
		.completed-sequences {
			gap: 3px;
		}
		
		.completed-card {
			width: 45px;
			height: 60px;
			font-size: 22px;
		}
		
		.stock-pile {
			width: 70px;
			height: 95px;
		}
		
		.tableau {
			gap: 3px;
			min-height: 450px;
		}
		
		:global(.card) {
			height: 100px;
		}
		
		.pile-wrapper {
			min-width: 60px;
		}
		
		.difficulty-btn {
			padding: 4px 10px;
			font-size: 11px;
		}
		
		.btn {
			padding: 5px 10px;
			font-size: 12px;
		}
		
		.controls {
			gap: 6px;
		}
		
		.confirm-content,
		.no-moves-content {
			min-width: 280px;
			padding: 30px 20px;
		}
		
		.confirm-content h2,
		.no-moves-content h2 {
			font-size: 22px;
		}
		
		.win-content {
			padding: 30px 20px;
		}
		
		.win-content h2 {
			font-size: 28px;
		}
	}
	
	.drag-preview {
		position: fixed;
		pointer-events: none;
		z-index: 10000;
		width: 110px;
		filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.5));
	}
	
	.drag-preview-card {
		position: absolute;
		left: 0;
		width: 110px;
		height: 160px;
	}
</style>
