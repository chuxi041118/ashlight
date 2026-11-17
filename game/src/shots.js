// Ashlight — screenshot staging behind ?shot=. Each scene plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a
// simple autopilot, so the frame is what a real game looks like and the same
// seed always gives the same frame. Never used in normal play.
import { VIEW, TOTAL_WAVES } from './config.js';
import { SCREENS } from './render.js';
import { rollChoices, applyUpgrade } from './upgrades.js';

const STEP = 1 / 60;

// What the autopilot drafts, best first: damage shapes the run most.
const DRAFT_PRIORITY = ['fan', 'lance', 'overcharge', 'quickstep', 'magnet', 'heart'];

function nearestEnemy(world) {
  const p = world.player;
  let best = null;
  let bestD = Infinity;
  for (const e of world.enemies) {
    if (e.spawnT > 0) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return { enemy: best, dist: bestD };
}

function nearestShard(world) {
  const p = world.player;
  let best = null;
  let bestD = Infinity;
  for (const k of world.pickups) {
    const d = Math.hypot(k.x - p.x, k.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return { shard: best, dist: bestD };
}

// Kite what is close, chase shards when safe, otherwise orbit the centre
// while firing at the nearest foe. Good enough to reach the late waves.
export function autopilotInput(world) {
  const p = world.player;
  const { enemy, dist } = nearestEnemy(world);
  const { shard, dist: shardD } = nearestShard(world);
  let tx = VIEW.width / 2;
  let ty = VIEW.height / 2;
  let aimX = p.x;
  let aimY = p.y - 100;
  if (enemy) {
    aimX = enemy.x;
    aimY = enemy.y;
    if (dist < 150) {
      // Run from it.
      tx = p.x + (p.x - enemy.x);
      ty = p.y + (p.y - enemy.y);
    } else if (shard && shardD < 260 && dist > 200) {
      tx = shard.x;
      ty = shard.y;
    } else if (dist > 320) {
      // Close in to firing range.
      tx = enemy.x;
      ty = enemy.y;
    } else {
      // Strafe sideways around it.
      const dx = enemy.x - p.x;
      const dy = enemy.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      tx = p.x - (dy / len) * 120;
      ty = p.y + (dx / len) * 120;
    }
  }
  const mx = tx - p.x;
  const my = ty - p.y;
  const len = Math.hypot(mx, my) || 1;
  return {
    mx: mx / len,
    my: my / len,
    aimX,
    aimY,
    firing: !!enemy,
    dash: dist < 64,
  };
}

// Draft one upgrade the way a player would, then start the next wave.
// Returns false when the run is over.
function autoDraft(world) {
  const choices = rollChoices(world.rng, world.upgrades);
  if (choices.length === 0) return false;
  choices.sort((a, b) => DRAFT_PRIORITY.indexOf(a.id) - DRAFT_PRIORITY.indexOf(b.id));
  applyUpgrade(world, choices[0].id);
  if (world.wave >= TOTAL_WAVES) {
    world.phase = 'victory';
    return false;
  }
  world.phase = 'playing';
  world.beginWave(world.wave + 1);
  return true;
}

// Run the world forward with the autopilot for `seconds`. Stops early at a
// defeat, a victory, at the first upgrade draft (with stopAtUpgrade), or when
// stopWhen(world) says so. Returns true when the run is still going.
export function runAutopilot(world, seconds, opts) {
  const stopAtUpgrade = !!(opts && opts.stopAtUpgrade);
  const stopWhen = opts && opts.stopWhen;
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    if (world.phase === 'upgrade') {
      // Stop at a draft when asked to (and when stopWhen, if given, agrees);
      // otherwise draft like a player and keep going.
      if (stopAtUpgrade && (!stopWhen || stopWhen(world))) return false;
      world.choices = rollChoices(world.rng, world.upgrades);
      if (!autoDraft(world)) return false;
      continue;
    }
    if (world.phase !== 'playing') return false;
    world.step(STEP, autopilotInput(world));
    if (stopWhen && stopWhen(world)) return true;
  }
  return world.phase === 'playing';
}

// Stage one named scene and return the screen to draw over it.
// Seeds are fixed so every capture is reproducible.
export function stageShot(name, world) {
  if (name === 'play') {
    // Stop mid-wave-7 with a busy field, so the cover shows the real fight.
    // A seed whose run ends before wave 7 is retried with the next seed.
    for (const seed of [9, 2, 6, 8, 3]) {
      world.startRun(seed);
      runAutopilot(world, 240, {
        stopWhen: (w) => w.wave === 7 && w.enemies.length >= 14 && w.spawnQueue.length > 0
          && w.player.x > VIEW.width * 0.25 && w.player.x < VIEW.width * 0.75
          && w.player.y > VIEW.height * 0.25 && w.player.y < VIEW.height * 0.75,
      });
      if (world.phase === 'playing' && world.wave === 7) {
        return { screen: SCREENS.PLAY };
      }
    }
    return { screen: world.phase === 'playing' ? SCREENS.PLAY : SCREENS.DEFEAT };
  }
  if (name === 'upgrade') {
    world.startRun(21);
    // Stop at the first draft from wave 3 on, so the cards show a run with
    // upgrades already owned and a real score behind it.
    runAutopilot(world, 400, {
      stopWhen: (w) => w.phase === 'upgrade' && w.wave >= 3,
      stopAtUpgrade: true,
    });
    if (world.phase === 'upgrade') return { screen: SCREENS.UPGRADE };
    return { screen: SCREENS.PLAY };
  }
  if (name === 'victory') {
    world.startRun(1);
    runAutopilot(world, 900);
    return { screen: world.phase === 'victory' ? SCREENS.VICTORY : SCREENS.DEFEAT };
  }
  if (name === 'defeat') {
    // A run that actually loses, so the end screen tells the truth.
    for (const seed of [5, 13, 24, 25, 40]) {
      world.startRun(seed);
      runAutopilot(world, 900);
      if (world.phase === 'defeat') return { screen: SCREENS.DEFEAT };
    }
    return { screen: SCREENS.PLAY };
  }
  // Title: let the ambient background drift a little.
  world.reset(99);
  world.time = 4;
  return { screen: SCREENS.TITLE };
}
