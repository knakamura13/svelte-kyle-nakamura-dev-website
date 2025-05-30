<script lang="ts">
  import { onMount } from 'svelte';
  import SpinSelector from '$lib/components/SpinSelector.svelte';

  let canvas: HTMLCanvasElement;
  const width = 400;
  const height = 800;
  const target = { x: width / 2, y: 100, r: 40 };

  type Stone = {
    x: number;
    y: number;
    r: number;
    vx: number;
    vy: number;
    color: 'blue' | 'red';
    thrown: boolean;
    spin: number; // +1 clockwise, -1 counter
  };

  let ctx: CanvasRenderingContext2D;
  let stones: Stone[] = [];
  const stoneRadius = 20;
  const startPos = { x: width / 2, y: height - 50 };
  const maxTurnsPerTeam = 4;

  let isDragging = false;
  let dragStart = { x: 0, y: 0 };

  let currentTeam: 'blue' | 'red' = 'blue';
  let turnsTaken = 0;
  let scored = false;
  let finalScore = '';
  
  let selectedSpin: number = 1;
  let showSpinSelector = true;

  function spawnStone() {
    stones.push({
      x: startPos.x,
      y: startPos.y,
      r: stoneRadius,
      vx: 0,
      vy: 0,
      color: currentTeam,
      thrown: false,
      spin: currentTeam === 'blue' ? selectedSpin : -1
    });
  }

  function anyStoneMoving() {
    return stones.some(s => Math.abs(s.vx) > 0.05 || Math.abs(s.vy) > 0.05);
  }

  function update() {
    for (const s of stones) {
      s.x += s.vx;
      s.y += s.vy;

      s.vx *= 0.98;
      s.vy *= 0.98;

      const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);

      if (speed < 2 && speed > 0.05) {
        const curlIntensity = (2 - speed) * 0.05;
        const normalX = -s.vy;
        const normalY = s.vx;
        const length = Math.sqrt(normalX * normalX + normalY * normalY);
        const nx = (normalX / length) * s.spin;
        const ny = (normalY / length) * s.spin;
        s.vx += nx * curlIntensity;
        s.vy += ny * curlIntensity;
      }

      if (speed < 0.05) {
        s.vx = 0;
        s.vy = 0;
      }
    }

    resolveCollisions();
  }

  function resolveCollisions() {
    for (let i = 0; i < stones.length; i++) {
      for (let j = i + 1; j < stones.length; j++) {
        const a = stones[i];
        const b = stones[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = a.r + b.r;

        if (dist < minDist && dist > 0) {
          const nx = dx / dist;
          const ny = dy / dist;
          const overlap = minDist - dist;
          a.x -= nx * overlap / 2;
          a.y -= ny * overlap / 2;
          b.x += nx * overlap / 2;
          b.y += ny * overlap / 2;

          const dvx = b.vx - a.vx;
          const dvy = b.vy - a.vy;
          const dot = dvx * nx + dvy * ny;

          if (dot < 0) {
            const impulse = dot;
            a.vx += impulse * nx;
            a.vy += impulse * ny;
            b.vx -= impulse * nx;
            b.vy -= impulse * ny;
          }
        }
      }
    }
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);

    // Target
    ctx.beginPath();
    ctx.arc(target.x, target.y, target.r, 0, Math.PI * 2);
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Stones
    for (const s of stones) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = s.color;
      ctx.fill();
    }

    if (scored) {
      ctx.fillStyle = '#000';
      ctx.font = '20px sans-serif';
      ctx.fillText(finalScore, 10, 30);
    }
  }

  function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
  }

  function getMousePos(e: MouseEvent | TouchEvent) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e instanceof MouseEvent ? e.clientX : e.touches[0].clientX;
    const clientY = e instanceof MouseEvent ? e.clientY : e.touches[0].clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }

  function startDrag(e: MouseEvent | TouchEvent) {
    if (anyStoneMoving() || currentTeam === 'red' || turnsTaken >= maxTurnsPerTeam * 2) return;
    const { x, y } = getMousePos(e);
    const current = stones.at(-1);
    if (!current) return;

    const dx = x - current.x;
    const dy = y - current.y;
    if (Math.sqrt(dx * dx + dy * dy) <= current.r) {
      isDragging = true;
      dragStart = { x, y };
    }
  }

  function drag(e: MouseEvent | TouchEvent) {
    if (!isDragging) return;
    const { x, y } = getMousePos(e);
    const current = stones.at(-1);
    if (current) {
      current.x = x;
      current.y = y;
    }
  }

function endDrag(e: MouseEvent | TouchEvent) {
  if (!isDragging) return;
  const { x, y } = getMousePos(e);
  const current = stones.at(-1);
  if (current) {
    const dx = dragStart.x - x;
    const dy = dragStart.y - y;
    current.vx = dx * 0.2;
    current.vy = dy * 0.2;
    current.thrown = true;
    turnsTaken++;
    showSpinSelector = false;
  }
  isDragging = false;
}

  function aiShoot() {
    const s = stones.at(-1);
    if (!s) return;

    const dx = target.x - s.x;
    const dy = target.y - s.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const scale = 6;

    s.vx = (dx / length) * scale;
    s.vy = (dy / length) * scale;
    s.thrown = true;
    turnsTaken++;
  }

function checkSpawn() {
  if (isDragging || anyStoneMoving() || turnsTaken >= maxTurnsPerTeam * 2) return;
  currentTeam = (turnsTaken % 2 === 0) ? 'blue' : 'red';
  showSpinSelector = currentTeam === 'blue';
  spawnStone();
  if (currentTeam === 'red') {
    setTimeout(() => aiShoot(), 500);
  }
}

  function scoreGame() {
    if (scored || anyStoneMoving() || isDragging || stones.length < 8) return;

    const inHouse = stones.filter(s => {
      const dx = s.x - target.x;
      const dy = s.y - target.y;
      return Math.sqrt(dx * dx + dy * dy) <= target.r;
    });

    if (inHouse.length === 0) {
      finalScore = 'No points scored (no stones in house)';
      scored = true;
      return;
    }

    const sorted = [...inHouse].sort((a, b) => {
      const da = (a.x - target.x) ** 2 + (a.y - target.y) ** 2;
      const db = (b.x - target.x) ** 2 + (b.y - target.y) ** 2;
      return da - db;
    });

    const scoringTeam = sorted[0].color;
    const opponent = scoringTeam === 'blue' ? 'red' : 'blue';

    let score = 0;
    for (const s of sorted) {
      if (s.color === scoringTeam) {
        score++;
      } else {
        break;
      }
    }

    finalScore = scoringTeam === 'blue'
      ? `🏅 Player (Blue) scores ${score} point${score > 1 ? 's' : ''}`
      : `🤖 AI (Red) scores ${score} point${score > 1 ? 's' : ''}`;
    scored = true;
  }

  onMount(() => {
    ctx = canvas.getContext('2d')!;
    spawnStone();
    gameLoop();
    const interval = setInterval(() => {
      checkSpawn();
      if (turnsTaken >= maxTurnsPerTeam * 2 && !anyStoneMoving() && !scored) {
        scoreGame();
      }
    }, 500);
    return () => clearInterval(interval);
  });
</script>

<!-- Spin direction selector -->
<SpinSelector
  bind:visible={showSpinSelector}
  on:spinselect={(e) => selectedSpin = e.detail.spin}
/>

<!-- Game canvas -->
<canvas
  bind:this={canvas}
  width={width}
  height={height}
  on:mousedown={startDrag}
  on:mousemove={drag}
  on:mouseup={endDrag}
  on:touchstart={startDrag}
  on:touchmove={drag}
  on:touchend={endDrag}
/>

<style>
  canvas {
    border: 2px solid #ccc;
    display: block;
    margin: 0 auto;
    touch-action: none;
    background-color: #f0f8ff;
  }
</style>