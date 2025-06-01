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
	const STONE_COLOR_RED = 'red';
	const STONE_COLOR_BLUE = 'blue';
	let currentPlayerColor: string;
	const FRICTION = 0.985;
	const MIN_DRAG_DISTANCE = 30; // Minimum pullback distance for a valid launch

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

	let activeStone: Stone;
	let playedStones: Stone[] = [];
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

	function prepareNewStone() {
		activeStone = {
			x: LANE_OFFSET_X + LANE_WIDTH / 2,
			y: LANE_OFFSET_Y + LANE_HEIGHT - 50,
			velocityX: 0,
			velocityY: 0,
			radius: STONE_RADIUS,
			color: currentPlayerColor,
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
		// If a stone was ready, re-prepare it in new position. Played stones remain.
		if (isStoneReadyForLaunch && activeStone && !activeStone.isMoving) {
			prepareNewStone();
		}
	}

	onMount(() => {
		if (canvasElement) {
			ctx = canvasElement.getContext('2d');

			// Set initial canvas size
			canvasElement.width = window.innerWidth;
			canvasElement.height = window.innerHeight;
			calculateLaneOffsets(canvasElement.width, canvasElement.height);

			currentPlayerColor = STONE_COLOR_RED; // Red starts
			prepareNewStone();

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
			dragEndY !== null &&
			activeStone
		) {
			context.beginPath();
			context.moveTo(activeStone.x, activeStone.y);

			let aimingDx = dragStartX - dragEndX;
			let aimingDy = dragStartY - dragEndY;
			const currentAimingDistance = Math.sqrt(aimingDx * aimingDx + aimingDy * aimingDy);

			if (currentAimingDistance > 0 && currentAimingDistance < MIN_DRAG_DISTANCE) {
				const scaleFactor = MIN_DRAG_DISTANCE / currentAimingDistance;
				aimingDx *= scaleFactor;
				aimingDy *= scaleFactor;
			}

			// If currentAimingDistance is 0, aimingDx/Dy are 0, lineTo will be to activeStone.x,y (no visible line)
			const aimX = activeStone.x + aimingDx;
			const aimY = activeStone.y + aimingDy;

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

	function resetDragState() {
		dragStartX = null;
		dragStartY = null;
		dragEndX = null;
		dragEndY = null;
	}

	function handleMouseDown(event: MouseEvent) {
		if (!activeStone || !isStoneReadyForLaunch || activeStone.isMoving) return;
		const pos = getMousePos(event);
		const distance = Math.sqrt((pos.x - activeStone.x) ** 2 + (pos.y - activeStone.y) ** 2);
		if (distance <= activeStone.radius + 10) {
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
			dragEndY === null ||
			!activeStone
		) {
			isDragging = false;
			window.removeEventListener('mousemove', windowMouseMove);
			window.removeEventListener('mouseup', windowMouseUp);
			resetDragState();
			return;
		}

		const dx = dragStartX - dragEndX;
		const dy = dragStartY - dragEndY;
		const dragDistance = Math.sqrt(dx * dx + dy * dy);

		if (dragDistance > 0) {
			// Any drag means a potential launch
			let launchDx = dx;
			let launchDy = dy;

			if (dragDistance < MIN_DRAG_DISTANCE) {
				const scaleFactor = MIN_DRAG_DISTANCE / dragDistance;
				launchDx = dx * scaleFactor;
				launchDy = dy * scaleFactor;
			}

			const launchPowerMultiplier = 0.15;
			activeStone.velocityX = launchDx * launchPowerMultiplier;
			activeStone.velocityY = launchDy * launchPowerMultiplier;
			activeStone.isMoving = true;
			isStoneReadyForLaunch = false;
		}
		// If dragDistance is 0 (click without drag), no launch occurs, stone remains ready.

		isDragging = false;
		window.removeEventListener('mousemove', windowMouseMove);
		window.removeEventListener('mouseup', windowMouseUp);
		resetDragState();
	}

	function handleTouchStart(event: TouchEvent) {
		event.preventDefault();
		if (!activeStone || !isStoneReadyForLaunch || activeStone.isMoving) return;
		const pos = getTouchPos(event);
		if (pos) {
			const distance = Math.sqrt((pos.x - activeStone.x) ** 2 + (pos.y - activeStone.y) ** 2);
			if (distance <= activeStone.radius + 20) {
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
			dragEndY === null ||
			!activeStone
		) {
			isDragging = false;
			window.removeEventListener('touchmove', windowTouchMove);
			window.removeEventListener('touchend', windowTouchEnd);
			resetDragState();
			return;
		}

		const dx = dragStartX - dragEndX;
		const dy = dragStartY - dragEndY;
		const dragDistance = Math.sqrt(dx * dx + dy * dy);

		if (dragDistance > 0) {
			// Any drag means a potential launch
			let launchDx = dx;
			let launchDy = dy;

			if (dragDistance < MIN_DRAG_DISTANCE) {
				const scaleFactor = MIN_DRAG_DISTANCE / dragDistance;
				launchDx = dx * scaleFactor;
				launchDy = dy * scaleFactor;
			}

			const launchPowerMultiplier = 0.15;
			activeStone.velocityX = launchDx * launchPowerMultiplier;
			activeStone.velocityY = launchDy * launchPowerMultiplier;
			activeStone.isMoving = true;
			isStoneReadyForLaunch = false;
		}
		// If dragDistance is 0 (tap release at same spot), no launch occurs.

		isDragging = false;
		window.removeEventListener('touchmove', windowTouchMove);
		window.removeEventListener('touchend', windowTouchEnd);
		resetDragState();
	}

	function updateGame() {
		if (!activeStone) return; // Nothing to update if no active stone

		if (activeStone.isMoving && ctx) {
			activeStone.x += activeStone.velocityX;
			activeStone.y += activeStone.velocityY;

			activeStone.velocityX *= FRICTION;
			activeStone.velocityY *= FRICTION;

			if (!activeStone.isOutOfBounds) {
				if (activeStone.x < LANE_OFFSET_X || activeStone.x > LANE_OFFSET_X + LANE_WIDTH) {
					activeStone.isOutOfBounds = true;
				}
			}

			const stoppedThreshold = 0.05;
			const effectivelyStopped =
				Math.abs(activeStone.velocityX) < stoppedThreshold &&
				Math.abs(activeStone.velocityY) < stoppedThreshold;

			// Wall collisions and stopping conditions
			let hitWall = false;
			if (activeStone.x - activeStone.radius < 0) {
				activeStone.x = activeStone.radius;
				activeStone.velocityX = 0;
				hitWall = true;
			} else if (activeStone.x + activeStone.radius > ctx.canvas.width) {
				activeStone.x = ctx.canvas.width - activeStone.radius;
				activeStone.velocityX = 0;
				hitWall = true;
			}

			if (activeStone.y - activeStone.radius < LANE_OFFSET_Y) {
				activeStone.y = LANE_OFFSET_Y + activeStone.radius;
				activeStone.velocityY = 0;
				hitWall = true;
				activeStone.isOutOfBounds = true; // Hitting top of lane is out
			} else if (activeStone.y + activeStone.radius > LANE_OFFSET_Y + LANE_HEIGHT) {
				activeStone.y = LANE_OFFSET_Y + LANE_HEIGHT - activeStone.radius;
				activeStone.velocityY = 0;
				hitWall = true;
				activeStone.isOutOfBounds = true;
			}

			if (effectivelyStopped || hitWall) {
				activeStone.isMoving = false;
				activeStone.velocityX = 0; // Ensure it's fully stopped
				activeStone.velocityY = 0;

				playedStones.push({ ...activeStone }); // Add a copy to played stones

				// Switch player and prepare next stone
				currentPlayerColor =
					currentPlayerColor === STONE_COLOR_RED ? STONE_COLOR_BLUE : STONE_COLOR_RED;
				prepareNewStone();
			}
		}
	}

	function drawGame(context: CanvasRenderingContext2D) {
		context.clearRect(0, 0, context.canvas.width, context.canvas.height);
		drawBackground(context);

		// Draw all played stones
		for (const s of playedStones) {
			drawStone(context, s);
		}

		// Draw the active stone (being aimed, moving, or just landed before next turn)
		if (activeStone) {
			drawStone(context, activeStone);
		}

		if (isDragging && activeStone && !activeStone.isMoving) {
			// Only draw aim line if current stone is ready
			drawAimingLine(context);
		}
	}

	function gameLoop() {
		if (!ctx) {
			// activeStone might not be ready first frame, but ctx should be
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
