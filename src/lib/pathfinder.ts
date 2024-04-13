export type PathNode = {
	x: number;
	y: number;
	f: number;
	g: number;
	h: number;
	parent?: PathNode;
};

export function aStar(grid: boolean[][], start: PathNode, goal: PathNode): PathNode[] {
	// Heuristic function to estimate distance to goal
	const heuristic = (node: PathNode, goal: PathNode): number => {
		return Math.abs(node.x - goal.x) + Math.abs(node.y - goal.y);
	};

	// Initialize open and closed list
	let openList: PathNode[] = [];
	let closedList: PathNode[] = [];
	openList.push(start);

	while (openList.length > 0) {
		// Find node with the lowest f(x) in the open list
		let current: PathNode = openList.reduce((prev, curr) => (prev.f < curr.f ? prev : curr));

		// Goal check
		if (current.x === goal.x && current.y === goal.y) {
			// Reconstruct path
			let path = [];
			while (current.parent) {
				path.push(current);
				current = current.parent;
			}
			return path.reverse();
		}

		// Move current node to the closed list
		openList = openList.filter((node) => node !== current);
		closedList.push(current);

		// Check each neighbor
		// (You'll need to implement a function to get neighbors considering your grid and obstacles)
		let neighbors: PathNode[] = getNeighbors(current, grid);
		for (const neighbor of neighbors) {
			// If neighbor is in closed list, skip
			if (closedList.find((node) => node.x === neighbor.x && node.y === neighbor.y)) {
				continue;
			}

			// Calculate g, h, and f
			neighbor.g = current.g + 1; // Assuming each move has a cost of 1
			neighbor.h = heuristic(neighbor, goal);
			neighbor.f = neighbor.g + neighbor.h;
			neighbor.parent = current;

			// If neighbor is not in open list or has a better path, add it to the open list
			if (
				!openList.find((node) => node.x === neighbor.x && node.y === neighbor.y) ||
				current.g + 1 < neighbor.g
			) {
				openList.push(neighbor);
			}
		}
	}

	return []; // Return an empty path if goal is not reached
}

function getNeighbors(node: PathNode, grid: boolean[][]): PathNode[] {
	const neighbors: PathNode[] = [];
	const directions = [
		{ x: 0, y: -1 }, // up
		{ x: 1, y: 0 }, // right
		{ x: 0, y: 1 }, // down
		{ x: -1, y: 0 } // left
		// Add diagonals if diagonal movement is allowed
	];

	for (const dir of directions) {
		const neighborX = node.x + dir.x;
		const neighborY = node.y + dir.y;

		// Check if the neighbor is within grid bounds and not an obstacle
		if (
			neighborX >= 0 &&
			neighborX < grid[0].length &&
			neighborY >= 0 &&
			neighborY < grid.length &&
			grid[neighborY][neighborX]
		) {
			neighbors.push({
				x: neighborX,
				y: neighborY,
				f: 0,
				g: 0,
				h: 0
			});
		}
	}

	return neighbors;
}
