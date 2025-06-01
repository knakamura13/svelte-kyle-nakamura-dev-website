<script lang="ts">
	import { onMount } from 'svelte';

	let canvasElement: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D | null = null;

	// Game constants
	// const CANVAS_WIDTH = 400; // Old, now canvas is fullscreen
	// const CANVAS_HEIGHT = 800; // Old, now canvas is fullscreen
	const LANE_WIDTH = 400;
	const LANE_HEIGHT = 800;
	let LANE_OFFSET_X = 0;
	let LANE_OFFSET_Y = 0;

	const STONE_RADIUS = 15;
	const STONE_COLOR = 'red';
	const FRICTION = 0.985;

	interface Stone {
		x: number;
		y: number;
		velocityX: number;
		velocityY: number;
		radius: number;
		color: string;
		isMoving: boolean;
		isOutOfBounds: boolean;
	}

	let stone: Stone;
	let isStoneReadyForLaunch = true;

	// Input state
	let isDragging = false;
	let dragStartX: number | null = null;
	let dragStartY: number | null = null;
	let dragEndX: number | null = null;
	let dragEndY: number | null = null;

	function calculateLaneOffsets(canvasWidth: number, canvasHeight: number) {
		LANE_OFFSET_X = (canvasWidth - LANE_WIDTH) / 2;
		LANE_OFFSET_Y = (canvasHeight - LANE_HEIGHT) / 2;
	}

	function initializeStone() {
		stone = {
			x: LANE_OFFSET_X + LANE_WIDTH / 2, // Centered in the lane
			y: LANE_OFFSET_Y + LANE_HEIGHT - 50, // Near the bottom of the lane
			velocityX: 0,
			velocityY: 0,
			radius: STONE_RADIUS,
			color: STONE_COLOR,
			isMoving: false,
			isOutOfBounds: false
		};
		isStoneReadyForLaunch = true;
	}

	const windowMouseMove = (event: MouseEvent) => handleMouseMove(event);
	const windowMouseUp = () => handleMouseUp();
	const windowTouchMove = (event: TouchEvent) => handleTouchMove(event);
	const windowTouchEnd = () => handleTouchEnd();

	function handleResize() {
		if (!canvasElement || !ctx) return;
		canvasElement.width = window.innerWidth;
		canvasElement.height = window.innerHeight;
		calculateLaneOffsets(canvasElement.width, canvasElement.height);
		initializeStone(); // Re-initialize stone to be correctly positioned
		// No need to call drawGame() here, gameLoop will handle it
	}

	onMount(() => {
		if (canvasElement) {
			ctx = canvasElement.getContext('2d');

			// Set initial canvas size
			canvasElement.width = window.innerWidth;
			canvasElement.height = window.innerHeight;
			calculateLaneOffsets(canvasElement.width, canvasElement.height);

			initializeStone();

			canvasElement.addEventListener('mousedown', handleMouseDown);
			canvasElement.addEventListener('touchstart', handleTouchStart, { passive: false });

			window.addEventListener('resize', handleResize);

			gameLoop();
		}

		return () => {
			if (canvasElement) {
				canvasElement.removeEventListener('mousedown', handleMouseDown);
				canvasElement.removeEventListener('touchstart', handleTouchStart);
			}
			window.removeEventListener('resize', handleResize);
			window.removeEventListener('mousemove', windowMouseMove);
			window.removeEventListener('mouseup', windowMouseUp);
			window.removeEventListener('touchmove', windowTouchMove);
			window.removeEventListener('touchend', windowTouchEnd);
		};
	});

	function drawBackground(context: CanvasRenderingContext2D) {
		// Draw outer ice (full canvas)
		context.fillStyle = '#D0E0F0'; // Lighter blue for out-of-bounds ice
		context.fillRect(0, 0, context.canvas.width, context.canvas.height);

		// Draw curling lane
		context.fillStyle = '#E0E0E0'; // Original light grey for lane
		context.fillRect(LANE_OFFSET_X, LANE_OFFSET_Y, LANE_WIDTH, LANE_HEIGHT);
		// Optional: Draw lane borders
		context.strokeStyle = '#A0A0A0';
		context.lineWidth = 1;
		context.strokeRect(LANE_OFFSET_X, LANE_OFFSET_Y, LANE_WIDTH, LANE_HEIGHT);
		// TODO: Draw target (house) & starting line (relative to lane offsets)
	}

	function drawStone(context: CanvasRenderingContext2D, s: Stone) {
		const originalAlpha = context.globalAlpha;
		if (s.isOutOfBounds) {
			context.globalAlpha = 0.5;
		}

		context.beginPath();
		context.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
		context.fillStyle = s.color;
		context.fill();
		context.closePath();

		context.globalAlpha = originalAlpha;
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
		if (!isStoneReadyForLaunch || stone.isMoving) return; // Updated check
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
		isStoneReadyForLaunch = false; // Stone has been launched

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
		if (!isStoneReadyForLaunch || stone.isMoving) return; // Updated check
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
		isStoneReadyForLaunch = false; // Stone has been launched

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

			if (!stone.isOutOfBounds) {
				if (stone.x < LANE_OFFSET_X || stone.x > LANE_OFFSET_X + LANE_WIDTH) {
					stone.isOutOfBounds = true;
				}
			}

			if (Math.abs(stone.velocityX) < 0.05 && Math.abs(stone.velocityY) < 0.05) {
				stone.velocityX = 0;
				stone.velocityY = 0;
				stone.isMoving = false;
				// isStoneReadyForLaunch remains false until explicitly reset
			}

			// Wall collisions
			// Left/Right EDGES OF FULL CANVAS
			if (stone.x - stone.radius < 0) {
				stone.x = stone.radius;
				stone.velocityX = 0;
			} else if (stone.x + stone.radius > ctx.canvas.width) {
				// Use dynamic canvas width
				stone.x = ctx.canvas.width - stone.radius;
				stone.velocityX = 0;
			}

			// Top/Bottom EDGES OF THE LANE
			if (stone.y - stone.radius < LANE_OFFSET_Y) {
				stone.y = LANE_OFFSET_Y + stone.radius;
				stone.velocityY = 0;
			} else if (stone.y + stone.radius > LANE_OFFSET_Y + LANE_HEIGHT) {
				stone.y = LANE_OFFSET_Y + LANE_HEIGHT - stone.radius;
				stone.velocityY = 0;
				stone.isOutOfBounds = true;
			}
		}
	}

	function drawGame(context: CanvasRenderingContext2D) {
		context.clearRect(0, 0, context.canvas.width, context.canvas.height);
		drawBackground(context);
		drawStone(context, stone);
		if (isDragging) {
			drawAimingLine(context);
		}
	}

	function gameLoop() {
		if (!ctx || !stone) {
			requestAnimationFrame(gameLoop);
			return;
		}
		updateGame();
		drawGame(ctx);
		requestAnimationFrame(gameLoop);
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
		display: flex; // Optional: if you want to ensure it takes full space before canvas does
		width: 100vw;
		height: 100vh;
		margin: 0;
		padding: 0;
		overflow: hidden; // Prevent scrollbars if canvas slightly overflows due to rounding
		background-color: #333; // Fallback, canvas should cover this
	}

	#curlingCanvas {
		display: block; // Removes extra space below canvas if it's inline
		// width and height attributes are set in JS for rendering size
		// CSS width/height here would scale the rendered content if different from attributes
		// For 1:1 pixel mapping, we ensure attributes match window.innerWidth/Height
		// and don't explicitly set CSS width/height here unless for scaling a fixed-resolution canvas.
		// border: 1px solid black; // Removed, as it might interfere with full-screen feel
	}
</style>
