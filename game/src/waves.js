// Ashlight — wave composition. One job: turn a wave number into a shuffled
// spawn queue, with the mix and the elite chance growing as the run goes on.
import { WAVES, TOTAL_WAVES, ELITE } from './config.js';
import { chance, shuffle } from './rng.js';

export function waveSize(wave) {
  const row = WAVES[Math.min(wave, TOTAL_WAVES) - 1];
  return row[0] + row[1] + row[2] + row[3];
}

// A spawn queue: [{type, elite}] in spawn order. Spawn timing lives in world.js.
export function buildWave(wave, rng) {
  const row = WAVES[Math.min(wave, TOTAL_WAVES) - 1];
  const types = ['wisp', 'darter', 'spinner', 'brute'];
  const queue = [];
  for (let i = 0; i < 4; i += 1) {
    for (let n = 0; n < row[i]; n += 1) queue.push(types[i]);
  }
  const shuffled = shuffle(rng, queue);
  const eliteChance = wave >= 3 ? ELITE.chanceBase + ELITE.chancePerWave * wave : 0;
  return shuffled.map((type) => ({ type, elite: chance(rng, eliteChance) }));
}

export function spawnInterval(wave) {
  return Math.max(0.25, 0.55 - wave * 0.03);
}

export function hpScale(wave) {
  return 1 + 0.15 * (wave - 1);
}

export function speedScale(wave) {
  return 1 + 0.035 * (wave - 1);
}
