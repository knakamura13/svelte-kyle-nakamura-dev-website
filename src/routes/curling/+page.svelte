<script lang="ts">
	import { onMount } from 'svelte';

	let canvasElement: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D | null = null;

	// Game constants
	const CANVAS_WIDTH = 400;
	const CANVAS_HEIGHT = 800;
	const STONE_RADIUS = 15;
	const STONE_COLOR = 'red'; // Player 1 stone color
	const FRICTION = 0.985; // Friction factor, stone slows down over time

	interface Stone {
		x: number;
		y: number;
		velocityX: number;
		velocityY: number;
		radius: number;
		color: string;
		isMoving: boolean;
	}

	let stone: Stone;

	// Input state
	let isDragging = false;
	let dragStartX: number | null = null;
	let dragStartY: number | null = null;
	let dragEndX: number | null = null;
	let dragEndY: number | null = null;

	function initializeStone() {
		stone = {
			x: CANVAS_WIDTH / 2,
			y: CANVAS_HEIGHT - 50, // Start near the bottom
			velocityX: 0,
			velocityY: 0,
			radius: STONE_RADIUS,
			color: STONE_COLOR,
			isMoving: false
		};
	}

	// Wrapped event handlers for adding/removing from window
	const windowMouseMove = (event: MouseEvent) => handleMouseMove(event);
	const windowMouseUp = (event: MouseEvent) => handleMouseUp(event);
	const windowTouchMove = (event: TouchEvent) => handleTouchMove(event);
	const windowTouchEnd = (event: TouchEvent) => handleTouchEnd(event);

	onMount(() => {
		if (canvasElement) {
			ctx = canvasElement.getContext('2d');
			canvasElement.width = CANVAS_WIDTH;
			canvasElement.height = CANVAS_HEIGHT;

			initializeStone();

			canvasElement.addEventListener('mousedown', handleMouseDown);
			// mousemove, mouseup, mouseleave are handled by window listeners added on drag

			// Touch events
			canvasElement.addEventListener('touchstart', handleTouchStart, { passive: false });
			// touchmove, touchend are handled by window listeners added on drag

			gameLoop(); // Start the game loop
		}

		return () => {
			// Cleanup canvas event listeners
			if (canvasElement) {
				canvasElement.removeEventListener('mousedown', handleMouseDown);
				canvasElement.removeEventListener('touchstart', handleTouchStart);
			}
			// Cleanup any lingering window event listeners (important if component unmounts mid-drag)
			window.removeEventListener('mousemove', windowMouseMove);
			window.removeEventListener('mouseup', windowMouseUp);
			window.removeEventListener('touchmove', windowTouchMove);
			window.removeEventListener('touchend', windowTouchEnd);
		};
	});

	function drawBackground(context: CanvasRenderingContext2D) {
		context.fillStyle = '#E0E0E0'; // Light grey for ice
		context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
		// TODO: Draw target (house) & starting line
	}

	function drawStone(context: CanvasRenderingContext2D, s: Stone) {
		context.beginPath();
		context.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
		context.fillStyle = s.color;
		context.fill();
		context.closePath();
	}

	function drawAimingLine(context: CanvasRenderingContext2D) {
		if (
			isDragging &&
			dragStartX !== null &&
			dragStartY !== null &&
			dragEndX !== null &&
			dragEndY !== null
		) {
			context.beginPath();
			context.moveTo(stone.x, stone.y);
			const aimX = stone.x - (dragEndX - dragStartX);
			const aimY = stone.y - (dragEndY - dragStartY);
			context.lineTo(aimX, aimY);
			context.strokeStyle = 'rgba(0, 0, 0, 0.5)';
			context.lineWidth = 2;
			context.stroke();
			context.closePath();
		}
	}

	function getMousePos(event: MouseEvent): { x: number; y: number } {
		const rect = canvasElement.getBoundingClientRect();
		return {
			x: event.clientX - rect.left,
			y: event.clientY - rect.top
		};
	}

	function getTouchPos(event: TouchEvent): { x: number; y: number } | null {
		if (event.touches.length > 0) {
			const rect = canvasElement.getBoundingClientRect();
			return {
				x: event.touches[0].clientX - rect.left,
				y: event.touches[0].clientY - rect.top
			};
		}
		return null;
	}

	function handleMouseDown(event: MouseEvent) {
		if (stone.isMoving) return;
		const pos = getMousePos(event);
		const distance = Math.sqrt((pos.x - stone.x) ** 2 + (pos.y - stone.y) ** 2);
		if (distance <= stone.radius + 10) {
			isDragging = true;
			dragStartX = pos.x;
			dragStartY = pos.y;
			dragEndX = pos.x;
			dragEndY = pos.y;
			window.addEventListener('mousemove', windowMouseMove);
			window.addEventListener('mouseup', windowMouseUp);
		}
	}

	function handleMouseMove(event: MouseEvent) {
		if (!isDragging) return;
		const pos = getMousePos(event);
		dragEndX = pos.x;
		dragEndY = pos.y;
	}

	function handleMouseUp() {
		// No event arg needed if we only use stored drag values
		if (
			!isDragging ||
			dragStartX === null ||
			dragStartY === null ||
			dragEndX === null ||
			dragEndY === null
		)
			return;

		const launchPowerMultiplier = 0.15;
		stone.velocityX = (dragStartX - dragEndX) * launchPowerMultiplier;
		stone.velocityY = (dragStartY - dragEndY) * launchPowerMultiplier;
		stone.isMoving = true;

		isDragging = false;
		window.removeEventListener('mousemove', windowMouseMove);
		window.removeEventListener('mouseup', windowMouseUp);
		dragStartX = null;
		dragStartY = null;
		dragEndX = null;
		dragEndY = null;
	}

	function handleTouchStart(event: TouchEvent) {
		event.preventDefault();
		if (stone.isMoving) return;
		const pos = getTouchPos(event);
		if (pos) {
			const distance = Math.sqrt((pos.x - stone.x) ** 2 + (pos.y - stone.y) ** 2);
			if (distance <= stone.radius + 20) {
				isDragging = true;
				dragStartX = pos.x;
				dragStartY = pos.y;
				dragEndX = pos.x;
				dragEndY = pos.y;
				window.addEventListener('touchmove', windowTouchMove, { passive: false });
				window.addEventListener('touchend', windowTouchEnd);
			}
		}
	}

	function handleTouchMove(event: TouchEvent) {
		event.preventDefault();
		if (!isDragging) return;
		const pos = getTouchPos(event);
		if (pos) {
			dragEndX = pos.x;
			dragEndY = pos.y;
		}
	}

	function handleTouchEnd() {
		// No event arg needed if we only use stored drag values
		if (
			!isDragging ||
			dragStartX === null ||
			dragStartY === null ||
			dragEndX === null ||
			dragEndY === null
		)
			return;

		const launchPowerMultiplier = 0.15;
		stone.velocityX = (dragStartX - dragEndX) * launchPowerMultiplier;
		stone.velocityY = (dragStartY - dragEndY) * launchPowerMultiplier;
		stone.isMoving = true;

		isDragging = false;
		window.removeEventListener('touchmove', windowTouchMove);
		window.removeEventListener('touchend', windowTouchEnd);
		dragStartX = null;
		dragStartY = null;
		dragEndX = null;
		dragEndY = null;
	}

	function updateGame() {
		if (stone.isMoving && ctx) {
			stone.x += stone.velocityX;
			stone.y += stone.velocityY;

			stone.velocityX *= FRICTION;
			stone.velocityY *= FRICTION;

			// Stop stone if velocity is very low
			if (Math.abs(stone.velocityX) < 0.05 && Math.abs(stone.velocityY) < 0.05) {
				stone.velocityX = 0;
				stone.velocityY = 0;
				stone.isMoving = false;
				// TODO: Here you could check for scoring or reset for next shot
				// For now, let's reset the stone's position if it stops NOT at the initial spot.
				// This is a temporary measure before full game logic.
				// if (stone.y < CANVAS_HEIGHT - 60) { // A simple check if it moved significantly
				// 	 initializeStone();
				// }
			}

			// Wall collisions (simple stop)
			if (stone.x - stone.radius < 0) {
				stone.x = stone.radius;
				stone.velocityX = 0; // Stop horizontal movement
			} else if (stone.x + stone.radius > CANVAS_WIDTH) {
				stone.x = CANVAS_WIDTH - stone.radius;
				stone.velocityX = 0; // Stop horizontal movement
			}

			if (stone.y - stone.radius < 0) {
				stone.y = stone.radius;
				stone.velocityY = 0; // Stop vertical movement
			} else if (stone.y + stone.radius > CANVAS_HEIGHT) {
				stone.y = CANVAS_HEIGHT - stone.radius;
				stone.velocityY = 0; // Stop vertical movement
			}
		}
	}

	function drawGame(context: CanvasRenderingContext2D) {
		context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT); // Clear canvas
		drawBackground(context);
		drawStone(context, stone);
		if (isDragging) {
			drawAimingLine(context);
		}
	}

	function gameLoop() {
		if (!ctx || !stone) {
			// Ensure context and stone are initialized
			requestAnimationFrame(gameLoop); // Try again next frame
			return;
		}
		updateGame();
		drawGame(ctx);
		requestAnimationFrame(gameLoop); // Keep the loop going
	}

	// Removed drawInitialBackground as its functionality is merged into gameLoop/drawGame
	// TODO: gameLoop function -> Implemented
	// TODO: input handling functions -> Implemented (basic mouse)
	// TODO: stone physics functions -> Implemented (basic movement & friction)
	// TODO: drawing functions for stone, target, etc. -> Implemented for stone and aim line
</script>

<div class="curling-container">
	<canvas bind:this={canvasElement} id="curlingCanvas"></canvas>
</div>

<style lang="scss">
	.curling-container {
		display: flex;
		justify-content: center;
		align-items: center;
		width: 100%;
		height: 100vh; // Use viewport height to center vertically
		background-color: #333; // Dark background for contrast
	}

	#curlingCanvas {
		border: 1px solid black;
		// The canvas width and height are set in the script,
		// but you could add max-width/max-height here if needed for responsiveness.
	}
</style>
