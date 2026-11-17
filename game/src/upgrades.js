// Ashlight — the upgrade draft. One job: offer three different playstyles
// after each cleared wave and apply the one the player picks.
import { UPGRADES } from './config.js';
import { shuffle } from './rng.js';

// Three distinct cards the player does not already own to the max.
export function rollChoices(rng, owned) {
  const pool = UPGRADES.filter((u) => (owned[u.id] || 0) < u.max);
  return shuffle(rng, pool).slice(0, 3);
}

export function applyUpgrade(world, id) {
  const p = world.player;
  const owned = world.upgrades;
  owned[id] = (owned[id] || 0) + 1;
  switch (id) {
    case 'fan':
      p.boltCount += 2;
      p.boltDamageMul *= 0.85;
      break;
    case 'lance':
      p.pierce += 1;
      p.fireIntervalMul *= 1.25;
      break;
    case 'quickstep':
      p.dashMax += 1;
      p.dashCharges = Math.min(p.dashMax, p.dashCharges + 1);
      p.dashRechargeMul *= 0.6;
      break;
    case 'heart':
      p.maxHp += 30;
      p.hp = Math.min(p.maxHp, p.hp + 30);
      break;
    case 'magnet':
      p.pickupRadius *= 2.5;
      p.speedMul *= 1.12;
      break;
    case 'overcharge':
      p.boltDamageMul *= 1.35;
      p.speedMul *= 0.92;
      break;
    default:
      break;
  }
}

export function upgradeName(id) {
  const found = UPGRADES.find((u) => u.id === id);
  return found ? found.name : id;
}
