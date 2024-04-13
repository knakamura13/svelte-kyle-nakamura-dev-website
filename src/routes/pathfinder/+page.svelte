<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { aStar, type PathNode } from '$lib/pathfinder';

	const gridSize = 20; // Size of each grid cell in pixels

	let debouncedResize: any;
	let path: PathNode[] = [];
	let gridWidth: number;
	let gridHeight: number;
	let grid: boolean[][];

	onMount(() => {
		debouncedResize = debounce(() => {
			const boundingBoxes = getBoundingBoxes();
			gridWidth = Math.ceil(window.innerWidth / gridSize);
			gridHeight = Math.ceil(window.innerHeight / gridSize);
			const grid = createGrid(boundingBoxes, gridSize, gridWidth, gridHeight);

			// findPath();

			console.log(grid);
		}, 250);

		window.addEventListener('resize', debouncedResize);

		// Initial calculation
		debouncedResize();
	});

	// Cleanup
	onDestroy(() => {
		if (debouncedResize) window.removeEventListener('resize', debouncedResize);
	});

	function getBoundingBoxes(): DOMRect[] {
		const elements = document.querySelectorAll('.obstacle');
		const boundingBoxes: DOMRect[] = [];

		elements.forEach((element) => {
			const rect = element.getBoundingClientRect();
			boundingBoxes.push(rect);
		});

		return boundingBoxes;
	}

	function createGrid(
		boundingBoxes: DOMRect[],
		gridSize: number,
		gridWidth: number,
		gridHeight: number
	): boolean[][] {
		// Initialize the grid
		grid = new Array(gridHeight).fill(null).map(() => new Array(gridWidth).fill(true));

		// Function to mark a cell as "blocked" for the pathfinding algorithm to avoid
		function _markCellBlocked(x: number, y: number) {
			if (x >= 0 && x < gridWidth && y >= 0 && y < gridHeight) {
				grid[y][x] = false;
			} else {
				grid[y][x] = true;
			}
		}

		// Iterate over bounding boxes to mark grid cells
		boundingBoxes.forEach((box: DOMRect) => {
			const startX = Math.floor(box.left / gridSize);
			const endX = Math.ceil(box.right / gridSize);
			const startY = Math.floor(box.top / gridSize);
			const endY = Math.ceil(box.bottom / gridSize);

			for (let x = startX; x < endX; x++) {
				for (let y = startY; y < endY; y++) {
					_markCellBlocked(x, y);
				}
			}
		});

		return grid;
	}

	function findPath() {
		const boundingBoxes = getBoundingBoxes();
		const gridWidth = Math.ceil(window.innerWidth / gridSize);
		const gridHeight = Math.ceil(window.innerHeight / gridSize);
		const grid = createGrid(boundingBoxes, gridSize, gridWidth, gridHeight);

		// Define start and end points randomly for demonstration
		const start: PathNode = {
			x: Math.floor(Math.random() * gridWidth),
			y: Math.floor(Math.random() * gridHeight),
			f: 0,
			g: 0,
			h: 0
		};

		let end: PathNode;
		do {
			end = {
				x: Math.floor(Math.random() * gridWidth),
				y: Math.floor(Math.random() * gridHeight),
				f: 0,
				g: 0,
				h: 0
			};
		} while (!grid[end.y][end.x]); // Ensure end is not an obstacle

		// Update the path using A*
		path = aStar(grid, start, end);
		console.log('Path:', path);
	}

	function isPath(x: number, y: number): boolean {
		return path.some((node: PathNode) => node.x === x && node.y === y);
	}

	function debounce(func: any, wait: number = 0): (...args: any[]) => void {
		let timeout: NodeJS.Timeout;

		return function executedFunction(...args: any[]) {
			const later = (): void => {
				clearTimeout(timeout);
				func(...args);
			};

			clearTimeout(timeout);
			timeout = setTimeout(later, wait);
		};
	}
</script>

<div id="playground">
	<div class="obstacle"></div>
	<div class="obstacle"></div>
	<div class="obstacle"></div>

	<!--	<button on:click={findPath}>Find Path</button>-->

	<!-- Visualize the grid and the path -->
	{#if gridWidth && gridHeight}
		<div class="grid">
			{#each Array(gridHeight) as _, y}
				<div class="row">
					{#each Array(gridWidth) as __, x}
						<div class="cell" class:obstacle={!grid[y][x]} class:path={isPath(x, y)}></div>
					{/each}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style lang="scss">
	$grid-size: 20px; // Define the grid size as a variable
	$grid-gap: 2px; // Define the gap size between grid cells

	#playground {
		position: fixed; // Fixed to cover the entire viewport
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		z-index: 1; // Base layer
		overflow: hidden; // Prevent scroll bars if the content is larger than the viewport
	}

	.grid {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		display: grid;
		grid-template-columns: repeat(auto-fill, $grid-size); // Fill the grid horizontally
		grid-template-rows: repeat(auto-fill, $grid-size); // Fill the grid vertically
		grid-gap: $grid-gap; // Set the gap between the cells
		z-index: 2; // Grid should be above the base content but below interactive elements
	}

	.obstacle {
		width: $grid-size;
		height: 200px;
		background-color: black;
		margin: 10px; // Spacing between obstacles
		z-index: 3; // Obstacles should be above the grid
	}

	.cell {
		width: $grid-size - ($grid-gap * 2); // Subtract grid-gap to account for the border
		height: $grid-size - ($grid-gap * 2); // Subtract grid-gap to account for the border
		background-color: rgba(white, 0.3); // Ensure cells have a visible background
		z-index: 2; // Same layer as the grid for correct overlay
		border: $grid-gap solid black; // Border width set to grid-gap

		&.obstacle {
			background-color: rgba(red, 0.3); // Visible background for occupied cells
			z-index: 3; // Above the plain cells
		}

		&.path {
			background-color: rgba(green, 0.3); // Visible background for path cells
			z-index: 4; // Above the obstacle cells
		}
	}
</style>
