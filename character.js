const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const mazeImg = document.getElementById("mazeImg");

// ===== SPRITE SHEET =====
const spriteSheet = new Image();
spriteSheet.src = "char/basic_character_spritesheet.png";

const FRAME_WIDTH = 48;
const FRAME_HEIGHT = 48;
const FRAMES_PER_ROW = 4;

const DIR_ROW = {
  up: 1,
  down: 0,
  left: 2,
  right: 3,
};

let dir = "down";
let frameIndex = 0;
let frameTimer = 0;
const FRAME_DURATION = 0.15;

// ===== PLAYER =====
const player = {
  x: 0,
  y: 0,
  speed: 180,
};

const keys = new Set();

// smaller collision area around the feet
const FOOT_RADIUS_SCALE = 0.07; // try 0.10 to 0.16 if needed

// ===== MAZE COLLISION MASK =====
const maskCanvas = document.createElement("canvas");
const maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true });
let maskData = null;

function rebuildMask() {
  if (!mazeImg || !mazeImg.complete || !mazeImg.naturalWidth) {
    maskData = null;
    return;
  }

  const mazeRect = mazeImg.getBoundingClientRect();
  if (mazeRect.width <= 0 || mazeRect.height <= 0) {
    maskData = null;
    return;
  }

  maskCanvas.width = Math.round(mazeRect.width);
  maskCanvas.height = Math.round(mazeRect.height);

  maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  maskCtx.imageSmoothingEnabled = false;
  maskCtx.drawImage(mazeImg, 0, 0, maskCanvas.width, maskCanvas.height);

  try {
    maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data;
  } catch (err) {
    console.error("Could not read maze pixels:", err);
    maskData = null;
  }
}

// ===== CANVAS SIZE =====
function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  rebuildMask();
}

addEventListener("resize", resizeCanvas);

// ===== HELPERS =====
function getViewSize() {
  const rect = canvas.getBoundingClientRect();
  return {
    width: rect.width,
    height: rect.height,
  };
}

function spriteSize() {
  const { height, width } = getViewSize();

  const dh = height * 0.10;
  const scale = dh / FRAME_HEIGHT;

  return {
    dw: FRAME_WIDTH * scale,
    dh,
    width,
    height,
  };
}

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

function isWallAtCanvasPoint(x, y) {
  if (!maskData) return false;

  const mazeRect = mazeImg.getBoundingClientRect();
  if (
    x < 0 ||
    y < 0 ||
    x >= mazeRect.width ||
    y >= mazeRect.height
  ) {
    return true;
  }

  const ix = Math.max(0, Math.min(maskCanvas.width - 1, Math.floor(x)));
  const iy = Math.max(0, Math.min(maskCanvas.height - 1, Math.floor(y)));
  const idx = (iy * maskCanvas.width + ix) * 4;

  const r = maskData[idx];
  const g = maskData[idx + 1];
  const b = maskData[idx + 2];
  const a = maskData[idx + 3];

  // transparent = walkable
  if (a < 10) return false;

  // bright white = wall
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luma > 200;
}

function hitsWall(px, py, radius) {
  // center + ring around the feet
  if (isWallAtCanvasPoint(px, py)) return true;

  for (let angle = 0; angle < 360; angle += 20) {
    const rad = (angle * Math.PI) / 180;
    const x = px + Math.cos(rad) * radius;
    const y = py + Math.sin(rad) * radius;

    if (isWallAtCanvasPoint(x, y)) return true;
  }

  return false;
}

function findNearestOpenSpot(startX, startY, radius) {
  if (!maskData) return { x: startX, y: startY };
  if (!hitsWall(startX, startY, radius)) return { x: startX, y: startY };

  const maxR = Math.max(maskCanvas.width, maskCanvas.height);

  for (let r = 1; r < maxR; r += 2) {
    for (let angle = 0; angle < 360; angle += 15) {
      const rad = (angle * Math.PI) / 180;
      const x = startX + Math.cos(rad) * r;
      const y = startY + Math.sin(rad) * r;

      if (!hitsWall(x, y, radius)) {
        return { x, y };
      }
    }
  }

  return { x: startX, y: startY };
}

// ===== INPUT =====
addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();

  if ("wasd".includes(k)) {
    keys.add(k);
    e.preventDefault();
  }
});

addEventListener("keyup", (e) => {
  keys.delete(e.key.toLowerCase());
});

// ===== DRAW =====
function drawPlayer() {
  const { dw, dh } = spriteSize();

  const x = player.x - dw / 2;
  const y = player.y - dh / 2;

  if (!spriteSheet.complete || !spriteSheet.naturalWidth) {
    ctx.fillStyle = "red";
    ctx.fillRect(x, y, dw, dh);
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
    x,
    y,
    dw,
    dh
  );
}

// ===== LOOP =====
let last = 0;

function loop(t) {
  const dt = (t - last) / 1000 || 0;
  last = t;

  const { dw, dh, width, height } = spriteSize();

  let dx = 0;
  let dy = 0;

  if (keys.has("a")) {
    dx = -1;
    dir = "left";
  } else if (keys.has("d")) {
    dx = 1;
    dir = "right";
  } else if (keys.has("w")) {
    dy = -1;
    dir = "up";
  } else if (keys.has("s")) {
    dy = 1;
    dir = "down";
  }

  const moving = dx !== 0 || dy !== 0;
  updateAnimation(dt, moving);

  const footRadius = dh * FOOT_RADIUS_SCALE;
  const footOffsetY = dh * 0.20;

  const step = player.speed * dt;

  // move X first
  if (dx !== 0) {
    const nextX = player.x + dx * step;
    const footY = player.y + footOffsetY;

    if (!hitsWall(nextX, footY, footRadius)) {
      player.x = nextX;
    }
  }

  // move Y second
  if (dy !== 0) {
    const nextY = player.y + dy * step;
    const footY = nextY + footOffsetY;

    if (!hitsWall(player.x, footY, footRadius)) {
      player.y = nextY;
    }
  }

  // keep on canvas
  player.x = Math.max(dw / 2, Math.min(width - dw / 2, player.x));
  player.y = Math.max(dh / 2, Math.min(height - dh / 2, player.y));

  // if spawned into wall, nudge out
  const currentFootY = player.y + footOffsetY;
  if (hitsWall(player.x, currentFootY, footRadius)) {
    const open = findNearestOpenSpot(player.x, currentFootY, footRadius);
    player.x = open.x;
    player.y = open.y - footOffsetY;
  }

  ctx.clearRect(0, 0, width, height);
  drawPlayer();

  requestAnimationFrame(loop);
}

// ===== START =====
function startGame() {
  resizeCanvas();

  const { width, height, dh } = spriteSize();

  // initial spawn near top center
  player.x = width * 0.55;
  player.y = height * 0.08;

  const footRadius = dh * FOOT_RADIUS_SCALE;
  const footOffsetY = dh * 0.20;

  const open = findNearestOpenSpot(player.x, player.y + footOffsetY, footRadius);
  player.x = open.x;
  player.y = open.y - footOffsetY;

  requestAnimationFrame(loop);
}

if (mazeImg && !mazeImg.complete) {
  mazeImg.addEventListener("load", startGame);
} else {
  startGame();
}
