// ================= CANVAS =================
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const mazeEl = document.getElementById("mazeImg");

// ================= INPUT =================
const keys = new Set();
let dir = "down";

addEventListener("keydown", (e) => {
  if (e.repeat) return;

  const k = e.key.toLowerCase();
  if ("wasd".includes(k)) {
    keys.add(k);
    e.preventDefault();
  }
});

addEventListener("keyup", (e) => {
  keys.delete(e.key.toLowerCase());
});

// ================= SPRITE SHEET =================
const spriteSheet = new Image();
spriteSheet.src = "char/basic_character_spritesheet.png";

spriteSheet.onerror = () => {
  console.error("Failed to load sprite sheet:", spriteSheet.src);
};

const FRAME_WIDTH = 48;
const FRAME_HEIGHT = 48;
const FRAMES_PER_ROW = 4;

const DIR_ROW = {
  up: 1,
  down: 0,
  left: 2,
  right: 3,
};

let frameIndex = 0;
let frameTimer = 0;
const FRAME_DURATION = 0.14;

function updateAnimation(dt, moving) {
  if (!moving) {
    frameIndex = 0;
    frameTimer = 0;
    return;
  }

  frameTimer += dt;

  if (frameTimer >= FRAME_DURATION) {
    frameTimer = 0;
    frameIndex = (frameIndex + 1) % FRAMES_PER_ROW;
  }
}

// ================= COLLISION MASK =================
const maskCanvas = document.createElement("canvas");
const maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true });
let maskData = null;

function rebuildMask() {
  const r = canvas.getBoundingClientRect();

  if (
    !mazeEl ||
    !mazeEl.complete ||
    !mazeEl.naturalWidth ||
    r.width <= 0 ||
    r.height <= 0
  ) {
    maskData = null;
    return;
  }

  maskCanvas.width = Math.round(r.width);
  maskCanvas.height = Math.round(r.height);

  maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  maskCtx.drawImage(mazeEl, 0, 0, maskCanvas.width, maskCanvas.height);

  try {
    maskData = maskCtx.getImageData(
      0,
      0,
      maskCanvas.width,
      maskCanvas.height
    ).data;
  } catch (err) {
    console.warn("Collision disabled (cannot read maze pixels).", err);
    maskData = null;
  }
}

const WALL_ALPHA_MIN = 10;
const WALL_LUMA_MIN = 205;

function isWall(x, y) {
  if (!maskData) return false;

  const w = maskCanvas.width;
  const h = maskCanvas.height;

  if (x < 0 || y < 0 || x >= w || y >= h) return true;

  const ix = x | 0;
  const iy = y | 0;
  const idx = (iy * w + ix) * 4;

  const r = maskData[idx];
  const g = maskData[idx + 1];
  const b = maskData[idx + 2];
  const a = maskData[idx + 3];

  if (a < WALL_ALPHA_MIN) return false;

  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luma >= WALL_LUMA_MIN;
}

function hitsWallAt(px, py, halfW, halfH) {
  const inset = 2;

  const left = px - halfW + inset;
  const right = px + halfW - inset;
  const top = py - halfH + inset;
  const bottom = py + halfH - inset;

  const midX = (left + right) / 2;
  const midY = (top + bottom) / 2;

  return (
    isWall(left, top) ||
    isWall(right, top) ||
    isWall(left, bottom) ||
    isWall(right, bottom) ||
    isWall(midX, top) ||
    isWall(midX, bottom) ||
    isWall(left, midY) ||
    isWall(right, midY)
  );
}

function findNearestFreeSpot(sx, sy, halfW, halfH) {
  if (!maskData) return { x: sx, y: sy };

  if (!hitsWallAt(sx, sy, halfW, halfH)) {
    return { x: sx, y: sy };
  }

  const maxR = Math.max(maskCanvas.width, maskCanvas.height);

  for (let r = 2; r < maxR; r += 2) {
    for (let a = 0; a < 360; a += 10) {
      const rad = (a * Math.PI) / 180;
      const x = sx + Math.cos(rad) * r;
      const y = sy + Math.sin(rad) * r;

      if (!hitsWallAt(x, y, halfW, halfH)) {
        return { x, y };
      }
    }
  }

  return { x: sx, y: sy };
}

// ================= PLAYER =================
const player = {
  x: 0,
  y: 0,
  speed: 180,
};

// ================= RESIZE =================
function resize() {
  const r = canvas.getBoundingClientRect();
  const dpr = devicePixelRatio || 1;

  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  rebuildMask();
}

addEventListener("resize", resize);

if (mazeEl) {
  mazeEl.addEventListener("load", rebuildMask);
}

// ================= SPRITE SIZE =================
function spriteSize() {
  const r = canvas.getBoundingClientRect();

  const dh = r.height * 0.1;
  const scale = dh / FRAME_HEIGHT;

  return {
    dw: FRAME_WIDTH * scale,
    dh,
    w: r.width,
    h: r.height,
    ready: spriteSheet.complete && spriteSheet.naturalWidth > 0,
  };
}

// ================= DRAW =================
function drawPlayer() {
  const { dw, dh, ready } = spriteSize();

  if (!ready) {
    ctx.fillRect(player.x - dw / 2, player.y - dh / 2, dw, dh);
    return;
  }

  const sx = frameIndex * FRAME_WIDTH;
  const sy = DIR_ROW[dir] * FRAME_HEIGHT;

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    spriteSheet,
    sx,
    sy,
    FRAME_WIDTH,
    FRAME_HEIGHT,
    player.x - dw / 2,
    player.y - dh / 2,
    dw,
    dh
  );
}

// ================= GAME LOOP =================
let last = 0;

function loop(t) {
  const dt = (t - last) / 1000 || 0;
  last = t;

  let mx = 0;
  let my = 0;

  if (keys.has("a")) {
    mx = -1;
    dir = "left";
  } else if (keys.has("d")) {
    mx = 1;
    dir = "right";
  } else if (keys.has("w")) {
    my = -1;
    dir = "up";
  } else if (keys.has("s")) {
    my = 1;
    dir = "down";
  }

  const moving = mx !== 0 || my !== 0;
  updateAnimation(dt, moving);

  const { dw, dh, w, h } = spriteSize();

  // lower-body collision box
  const hw = dw * 0.22;
  const hh = dh * 0.18;
  const bodyOffsetY = dh * 0.18;
  const collisionY = player.y + bodyOffsetY;

  if (maskData && hitsWallAt(player.x, collisionY, hw, hh)) {
    const p = findNearestFreeSpot(player.x, collisionY, hw, hh);
    player.x = p.x;
    player.y = p.y - bodyOffsetY;
  }

  const step = player.speed * dt;

  if (mx !== 0) {
    const nx = Math.max(hw, Math.min(w - hw, player.x + mx * step));

    if (!hitsWallAt(nx, collisionY, hw, hh)) {
      player.x = nx;
    }
  }

  if (my !== 0) {
    const ny = Math.max(hh, Math.min(h - hh, player.y + my * step));

    if (!hitsWallAt(player.x, ny + bodyOffsetY, hw, hh)) {
      player.y = ny;
    }
  }

  ctx.clearRect(0, 0, w, h);
  drawPlayer();

  requestAnimationFrame(loop);
}

// ================= START =================
resize();
rebuildMask();

const r = canvas.getBoundingClientRect();
player.x = r.width * 0.55;
player.y = r.height * 0.05;

{
  const { dw, dh } = spriteSize();

  const hw = dw * 0.22;
  const hh = dh * 0.18;
  const bodyOffsetY = dh * 0.18;
  const collisionY = player.y + bodyOffsetY;

  const p = findNearestFreeSpot(player.x, collisionY, hw, hh);
  player.x = p.x;
  player.y = p.y - bodyOffsetY;
}

requestAnimationFrame(loop);
