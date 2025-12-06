const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const energyEl = document.getElementById("energy");
const brainEl = document.getElementById("brainrots");

const state = {
  width: 960,
  height: 620,
  player: { x: 480, y: 310, r: 14, speed: 210, vx: 0, vy: 0, energy: 30, crystals: 2 },
  brainrots: [],
  thieves: [],
  crystals: [],
  walls: [],
  lightning: [],
  time: 0,
  score: 0,
  spawnTimer: 0,
  crystalTimer: 0,
  gameOver: false,
  pointer: { x: 480, y: 310, active: false },
};

const keys = {};
let lastTime = 0;
const mapGrid = { size: 40, cols: 24, rows: 15 };

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function resetGame() {
  state.player.x = state.width / 2;
  state.player.y = state.height / 2;
  state.player.energy = 30;
  state.player.crystals = 2;
  state.brainrots = Array.from({ length: 4 }, () => ({
    x: rand(120, state.width - 120),
    y: rand(120, state.height - 120),
    r: 12,
    vx: rand(-30, 30),
    vy: rand(-30, 30),
    carried: false,
  }));
  state.thieves = [];
  state.crystals = [];
  state.walls = [];
  state.time = 0;
  state.score = 0;
  state.spawnTimer = 0;
  state.crystalTimer = 0;
  state.gameOver = false;
}

resetGame();
resizeCanvas();

window.addEventListener("resize", resizeCanvas);
window.addEventListener("keydown", (e) => {
  keys[e.key.toLowerCase()] = true;
  if (e.key === " " || e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
    e.preventDefault();
  }
  if (e.key.toLowerCase() === "r") resetGame();
});
window.addEventListener("keyup", (e) => {
  keys[e.key.toLowerCase()] = false;
});
canvas.addEventListener("click", (e) => {
  const { x, y } = canvasToWorld(e);
  state.pointer = { x, y, active: true };
  shootLightning(x, y);
});
canvas.addEventListener("mousemove", (e) => {
  const { x, y } = canvasToWorld(e);
  state.pointer.x = x;
  state.pointer.y = y;
  state.pointer.active = true;
});
canvas.addEventListener("mouseleave", () => {
  state.pointer.active = false;
});

function resizeCanvas() {
  const scale = Math.min(window.innerWidth * 0.9 / state.width, 1);
  canvas.style.width = `${state.width * scale}px`;
  canvas.style.height = `${state.height * scale}px`;
}

function spawnThief() {
  const edge = Math.floor(Math.random() * 4);
  let x = 0, y = 0;
  if (edge === 0) { x = 0; y = rand(0, state.height); }
  if (edge === 1) { x = state.width; y = rand(0, state.height); }
  if (edge === 2) { x = rand(0, state.width); y = 0; }
  if (edge === 3) { x = rand(0, state.width); y = state.height; }
  state.thieves.push({
    x, y, r: 13, speed: rand(42, 60) + state.time * 0.35,
    carrying: null,
    stunned: 0,
  });
}

function spawnCrystal() {
  state.crystals.push({
    x: rand(80, state.width - 80),
    y: rand(80, state.height - 80),
    r: 10,
    ttl: 14,
  });
}

function updatePlayer(dt) {
  const { player } = state;
  if (state.pointer.active) {
    const dx = state.pointer.x - player.x;
    const dy = state.pointer.y - player.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 2) {
      const nx = dx / dist;
      const ny = dy / dist;
      player.vx = nx * player.speed;
      player.vy = ny * player.speed;
      player.x += player.vx * dt;
      player.y += player.vy * dt;
    } else {
      player.vx = 0;
      player.vy = 0;
    }
  } else {
    player.vx = 0;
    player.vy = 0;
  }

  player.x = Math.max(player.r, Math.min(state.width - player.r, player.x));
  player.y = Math.max(player.r, Math.min(state.height - player.r, player.y));

  if (keys[" "] && player.energy >= 10 && !player.charging) {
    player.energy -= 10;
    player.charging = 0.45;
    shockwave(player.x, player.y, 80);
  }
  if (player.charging) player.charging = Math.max(0, player.charging - dt);

  if (keys["e"] && player.crystals > 0 && !player.placing) {
    const dir = Math.atan2(player.vy || 0.001, player.vx || 0.001);
    const placeDist = 30;
    const wx = player.x + Math.cos(dir) * placeDist;
    const wy = player.y + Math.sin(dir) * placeDist;
    state.walls.push({ x: wx, y: wy, r: 14, ttl: 12 });
    player.crystals -= 1;
    player.placing = 0.25;
  }
  if (player.placing) player.placing = Math.max(0, player.placing - dt);
}

function updateBrainrots(dt) {
  for (const b of state.brainrots) {
    if (b.carried) continue;
    if (Math.random() < 0.01) {
      b.vx = rand(-40, 40);
      b.vy = rand(-40, 40);
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.x < b.r || b.x > state.width - b.r) b.vx *= -1;
    if (b.y < b.r || b.y > state.height - b.r) b.vy *= -1;
  }
}

function updateThieves(dt) {
  for (const t of state.thieves) {
    if (t.stunned > 0) {
      t.stunned -= dt;
      continue;
    }
    if (!t.carrying) {
      const target = state.brainrots.find((b) => !b.carried);
      if (!target) continue;
      const dx = target.x - t.x;
      const dy = target.y - t.y;
      const dist = Math.hypot(dx, dy) || 1;
      t.x += (dx / dist) * t.speed * dt;
      t.y += (dy / dist) * t.speed * dt;
      if (dist < target.r + t.r) {
        t.carrying = target;
        target.carried = true;
        t.exit = pickExit();
      }
    } else {
      const target = t.exit;
      const dx = target.x - t.x;
      const dy = target.y - t.y;
      const dist = Math.hypot(dx, dy) || 1;
      t.x += (dx / dist) * (t.speed + 20) * dt;
      t.y += (dy / dist) * (t.speed + 20) * dt;
      t.carrying.x = t.x;
      t.carrying.y = t.y;
      if (dist < 6) {
        // carried away
        state.brainrots = state.brainrots.filter((b) => b !== t.carrying);
        t.carrying = null;
      }
    }
  }
  // collisions with walls
  for (const t of state.thieves) {
    for (const w of state.walls) {
      const dx = t.x - w.x;
      const dy = t.y - w.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist < t.r + w.r) {
        const nx = dx / dist;
        const ny = dy / dist;
        t.x = w.x + (t.r + w.r + 1) * nx;
        t.y = w.y + (t.r + w.r + 1) * ny;
      }
    }
  }
}

function updateCrystals(dt) {
  state.crystalTimer -= dt;
  if (state.crystalTimer <= 0) {
    spawnCrystal();
    state.crystalTimer = rand(4, 7);
  }
  for (const c of state.crystals) c.ttl -= dt;
  state.crystals = state.crystals.filter((c) => c.ttl > 0);
}

function updateWalls(dt) {
  for (const w of state.walls) w.ttl -= dt;
  state.walls = state.walls.filter((w) => w.ttl > 0);
}

function updateLightning(dt) {
  for (const bolt of state.lightning) bolt.ttl -= dt;
  state.lightning = state.lightning.filter((b) => b.ttl > 0);
}

function shootLightning(targetX, targetY) {
  let hit = null;
  let closest = 9999;
  for (const t of state.thieves) {
    const d = Math.hypot(t.x - targetX, t.y - targetY);
    if (d < closest && d < t.r + 16) {
      closest = d;
      hit = t;
    }
  }
  if (!hit) return;
  if (hit.carrying) {
    hit.carrying.carried = false;
    hit.carrying = null;
    state.score += 12;
  }
  const bolt = makeBolt(state.player.x, state.player.y, hit.x, hit.y);
  state.lightning.push(bolt);
  state.thieves = state.thieves.filter((t) => t !== hit);
  state.score += 6;
}

function makeBolt(x1, y1, x2, y2) {
  const segments = 6;
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const bx = x1 + (x2 - x1) * t + rand(-6, 6);
    const by = y1 + (y2 - y1) * t + rand(-6, 6);
    points.push({ x: bx, y: by });
  }
  return { points, ttl: 0.18 };
}

function canvasToWorld(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = state.width / rect.width;
  const scaleY = state.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
  };
}

function shockwave(x, y, radius) {
  for (const t of state.thieves) {
    const dx = t.x - x;
    const dy = t.y - y;
    const dist = Math.hypot(dx, dy) || 1;
    if (dist < radius) {
      const push = (radius - dist) * 1.3;
      t.x += (dx / dist) * push;
      t.y += (dy / dist) * push;
      t.stunned = 0.8;
      if (t.carrying) {
        t.carrying.carried = false;
        t.carrying = null;
      }
    }
  }
}

function handlePickups() {
  const p = state.player;
  // crystals
  state.crystals = state.crystals.filter((c) => {
    const dist = Math.hypot(p.x - c.x, p.y - c.y);
    if (dist < p.r + c.r + 2) {
      p.energy = Math.min(100, p.energy + 12);
      p.crystals += 1;
      state.score += 8;
      return false;
    }
    return true;
  });
  // thieves bump
  for (const t of state.thieves) {
    const dist = Math.hypot(p.x - t.x, p.y - t.y);
    if (dist < p.r + t.r) {
      t.stunned = 0.3;
      if (t.carrying) {
        t.carrying.carried = false;
        t.carrying = null;
        state.score += 15;
      }
    }
  }
}

function pickExit() {
  const edge = Math.floor(Math.random() * 4);
  if (edge === 0) return { x: 0, y: rand(0, state.height) };
  if (edge === 1) return { x: state.width, y: rand(0, state.height) };
  if (edge === 2) return { x: rand(0, state.width), y: 0 };
  return { x: rand(0, state.width), y: state.height };
}

function drawBackground() {
  const { size } = mapGrid;
  for (let y = 0; y < state.height; y += size) {
    for (let x = 0; x < state.width; x += size) {
      const noise = ((x * 13 + y * 7) % 37) / 37;
      const base = 20 + noise * 10;
      ctx.fillStyle = `rgb(${base}, ${base + 20}, ${base + 30})`;
      ctx.fillRect(x, y, size, size);
      ctx.strokeStyle = "rgba(0,0,0,0.07)";
      ctx.strokeRect(x, y, size, size);
    }
  }
}

function drawPlayer() {
  const p = state.player;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = "#66ffc4";
  ctx.beginPath();
  ctx.arc(0, 0, p.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#0f2f28";
  ctx.stroke();
  if (p.charging) {
    ctx.strokeStyle = "rgba(102,255,196,0.4)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, p.r + 8, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBrainrots() {
  for (const b of state.brainrots) {
    ctx.save();
    ctx.translate(b.x, b.y);
    const base = b.carried ? "#f6a0a0" : "#f0e7ff";
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.arc(0, 0, b.r + 2, 0, Math.PI * 2);
    ctx.fill();

    // ears
    ctx.fillStyle = "#d8b9ff";
    ctx.beginPath();
    ctx.moveTo(-b.r + 2, -b.r + 4);
    ctx.lineTo(-b.r + 10, -b.r - 8);
    ctx.lineTo(-b.r + 16, -b.r + 4);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(b.r - 2, -b.r + 4);
    ctx.lineTo(b.r - 10, -b.r - 8);
    ctx.lineTo(b.r - 16, -b.r + 4);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "#241b2f";
    ctx.lineWidth = 3;
    ctx.stroke();

    // face
    ctx.fillStyle = "#241b2f";
    ctx.beginPath();
    ctx.arc(-6, -2, 2.2, 0, Math.PI * 2);
    ctx.arc(6, -2, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.lineTo(-3, 6);
    ctx.lineTo(3, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawThieves() {
  for (const t of state.thieves) {
    ctx.save();
    ctx.translate(t.x, t.y);
    // ninja hood
    ctx.fillStyle = t.stunned > 0 ? "#6cb2ff" : "#1a1a22";
    ctx.beginPath();
    ctx.arc(0, 0, t.r + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#0b0b12";
    ctx.stroke();

    // headband stripe
    ctx.fillStyle = "#3a3af5";
    ctx.fillRect(-t.r - 1, -4, (t.r + 1) * 2, 8);

    // eyes
    ctx.fillStyle = "#f4f4f4";
    ctx.fillRect(-6, -2, 4, 3);
    ctx.fillRect(2, -2, 4, 3);
    ctx.fillStyle = "#111";
    ctx.fillRect(-5, -1, 2, 1);
    ctx.fillRect(3, -1, 2, 1);

    // sharp teeth grin
    ctx.fillStyle = "#fbe5b4";
    ctx.beginPath();
    ctx.moveTo(-6, 6);
    ctx.lineTo(0, 10);
    ctx.lineTo(6, 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#1a1a22";
    ctx.beginPath();
    ctx.moveTo(-4, 6);
    ctx.lineTo(-2, 9);
    ctx.lineTo(0, 6);
    ctx.lineTo(2, 9);
    ctx.lineTo(4, 6);
    ctx.closePath();
    ctx.fill();

    if (t.carrying) {
      ctx.fillStyle = "#00000088";
      ctx.fillRect(-t.r, -t.r - 6, t.r * 2, 8);
    }
    ctx.restore();
  }
}

function drawCrystals() {
  for (const c of state.crystals) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.fillStyle = "#7be3ff";
    ctx.beginPath();
    ctx.moveTo(0, -c.r);
    ctx.lineTo(c.r, 0);
    ctx.lineTo(0, c.r);
    ctx.lineTo(-c.r, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#0a2d3a";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
}

function drawWalls() {
  for (const w of state.walls) {
    ctx.save();
    ctx.translate(w.x, w.y);
    ctx.fillStyle = "#7dd38f";
    ctx.fillRect(-w.r, -w.r, w.r * 2, w.r * 2);
    ctx.strokeStyle = "#0f2b18";
    ctx.lineWidth = 3;
    ctx.strokeRect(-w.r, -w.r, w.r * 2, w.r * 2);
    ctx.restore();
  }
}

function drawLightning() {
  ctx.save();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(120,219,255,0.9)";
  for (const bolt of state.lightning) {
    const pts = bolt.points;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }
  ctx.restore();
}

function render() {
  ctx.clearRect(0, 0, state.width, state.height);
  drawBackground();
  drawCrystals();
  drawWalls();
  drawBrainrots();
  drawThieves();
  drawLightning();
  drawPlayer();
  if (state.gameOver) {
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(0, 0, state.width, state.height);
    ctx.fillStyle = "#f4f6f7";
    ctx.font = "28px Trebuchet MS";
    ctx.textAlign = "center";
    ctx.fillText("All brainrots stolen. Press R to restart.", state.width / 2, state.height / 2);
  }
}

function update(dt) {
  if (state.gameOver) return;
  state.time += dt;
  state.score += dt * 2;
  updatePlayer(dt);
  updateBrainrots(dt);
  updateThieves(dt);
  updateCrystals(dt);
  updateWalls(dt);
  updateLightning(dt);
  handlePickups();
  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    spawnThief();
    state.spawnTimer = Math.max(1.2, 3.8 - state.time * 0.04);
  }
  if (state.brainrots.length === 0) {
    state.gameOver = true;
  }
  scoreEl.textContent = `Score: ${state.score.toFixed(0)}`;
  energyEl.textContent = `Energy: ${state.player.energy | 0} | Crystals: ${state.player.crystals}`;
  brainEl.textContent = `Brainrots: ${state.brainrots.length}`;
}

function loop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
