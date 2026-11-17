// Ashlight — wiring. One job: the frame loop, the screen state machine, and
// turning player gestures into world actions. All rules live in world.js.
import { VIEW, TOTAL_WAVES } from './config.js';
import { World } from './world.js';
import { Input } from './input.js';
import { Sfx } from './audio.js';
import { draw, SCREENS } from './render.js';
import { rollChoices, applyUpgrade } from './upgrades.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const BEST_KEY = 'ashlight-best-score';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = VIEW.width;
canvas.height = VIEW.height;

const world = new World(1);
const input = new Input(canvas);
const sfx = new Sfx();

let screen = SCREENS.TITLE;
let paused = false;
let muted = false;
let best = 0;
try {
  best = Number(window.localStorage.getItem(BEST_KEY) || 0) || 0;
} catch {
  best = 0;
}

function saveBest() {
  if (world.score > best) {
    best = world.score;
    try {
      window.localStorage.setItem(BEST_KEY, String(best));
    } catch {
      // Private mode or no storage: the score still shows this run.
    }
  }
}

// Roll the three upgrade cards when a wave clears.
function openUpgrade() {
  world.choices = rollChoices(world.rng, world.upgrades);
  screen = SCREENS.UPGRADE;
}

function pickUpgrade(index) {
  const card = world.choices[index];
  if (!card) return;
  applyUpgrade(world, card.id);
  sfx.play({ type: 'upgrade' });
  world.choices = [];
  if (world.wave >= TOTAL_WAVES) {
    world.phase = 'victory';
    screen = SCREENS.VICTORY;
    saveBest();
  } else {
    world.phase = 'playing';
    screen = SCREENS.PLAY;
    world.beginWave(world.wave + 1);
  }
}

function startRun() {
  sfx.ensure();
  world.startRun();
  screen = SCREENS.PLAY;
  paused = false;
}

// One simulation step: read input, step the world, play its sounds, react to
// phase changes the world announced.
function tick() {
  const reading = input.read();
  world.step(STEP, reading);
  for (const event of world.events) sfx.play(event);
  if (world.phase === 'upgrade' && screen === SCREENS.PLAY) openUpgrade();
  if (world.phase === 'victory' && screen === SCREENS.PLAY) {
    screen = SCREENS.VICTORY;
    saveBest();
  }
  if (world.phase === 'defeat' && screen === SCREENS.PLAY) {
    screen = SCREENS.DEFEAT;
    saveBest();
  }
}

function handlePresses() {
  if (input.wasPressed('KeyM')) {
    muted = sfx.toggleMute();
  }
  if (screen === SCREENS.TITLE) {
    if (input.wasPressed('Enter') || input.wasPressed('NumpadEnter')) startRun();
  } else if (screen === SCREENS.PLAY) {
    if (input.wasPressed('KeyP') || input.wasPressed('Escape')) paused = !paused;
  } else if (screen === SCREENS.UPGRADE) {
    if (input.wasPressed('Digit1')) pickUpgrade(0);
    if (input.wasPressed('Digit2')) pickUpgrade(1);
    if (input.wasPressed('Digit3')) pickUpgrade(2);
  } else if (screen === SCREENS.VICTORY || screen === SCREENS.DEFEAT) {
    if (input.wasPressed('KeyR') || input.wasPressed('Enter')) startRun();
  }
}

canvas.addEventListener('mousedown', (e) => {
  sfx.ensure();
  if (screen === SCREENS.TITLE) {
    startRun();
    return;
  }
  if (screen === SCREENS.UPGRADE) {
    const r = canvas.getBoundingClientRect();
    const mx = ((e.clientX - r.left) / r.width) * canvas.width;
    const my = ((e.clientY - r.top) / r.height) * canvas.height;
    const cardW = 300;
    const cardH = 300;
    const gap = 36;
    const total = cardW * 3 + gap * 2;
    const x0 = (VIEW.width - total) / 2;
    const y0 = 210;
    for (let i = 0; i < 3; i += 1) {
      const x = x0 + i * (cardW + gap);
      if (mx >= x && mx <= x + cardW && my >= y0 && my <= y0 + cardH) {
        pickUpgrade(i);
        return;
      }
    }
  }
  if (screen === SCREENS.VICTORY || screen === SCREENS.DEFEAT) startRun();
});

// Debug handle for playtesting (read-only state; the game never reads it).
window.__ashlight = {
  world,
  get screen() { return screen; },
  get paused() { return paused; },
  get best() { return best; },
};

// Screenshot staging: ?shot=play|upgrade|victory|defeat|title renders one
// fixed scene with no input. Anything else is the normal game.
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
if (shot) {
  const staged = stageShot(shot, world);
  screen = staged.screen;
  if (screen === SCREENS.UPGRADE) openUpgrade();
  draw(ctx, world, screen, { best, mouse: { x: -1, y: -1 } });
  window.__shotReady = true;
} else {
  let last = performance.now();
  let acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const elapsed = Math.min(0.1, (now - last) / 1000);
    last = now;
    handlePresses();
    if (!paused && screen === SCREENS.PLAY) {
      acc += elapsed;
      while (acc >= STEP) {
        acc -= STEP;
        tick();
        if (screen !== SCREENS.PLAY) {
          acc = 0;
          break;
        }
      }
    } else {
      // Ambient time still passes on menus so the starfield twinkles.
      world.time += elapsed;
    }
    draw(ctx, world, screen, {
      best,
      mouse: { x: input.mouseX, y: input.mouseY },
      paused,
    });
    input.endFrame();
  }
  requestAnimationFrame(frame);
}
