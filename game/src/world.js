// Ashlight — the world simulation. One job: hold every moving thing and step
// it forward. Pure logic, no DOM, no audio: the same file runs in the browser
// and in a headless seed search. It emits events; main.js turns them into sound.
import {
  VIEW, PLAYER, ENEMIES, ELITE, TOTAL_WAVES,
  SHARD_SCORE, SHARD_HEAL, CORE_SCORE, CORE_HEAL, SHARD_DROP_CHANCE,
} from './config.js';
import { makeRng, range, chance, pick } from './rng.js';
import { buildWave, spawnInterval, hpScale, speedScale, waveSize } from './waves.js';

const TAU = Math.PI * 2;

function dist(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// A fresh player: base stats, upgrade multipliers applied on top.
export function freshPlayer() {
  return {
    x: VIEW.width / 2,
    y: VIEW.height / 2,
    radius: PLAYER.radius,
    angle: -Math.PI / 2,
    hp: PLAYER.maxHp,
    maxHp: PLAYER.maxHp,
    speedMul: 1,
    fireTimer: 0,
    fireIntervalMul: 1,
    boltCount: 1,
    boltDamageMul: 1,
    pierce: 0,
    dashMax: PLAYER.dashCharges,
    dashCharges: PLAYER.dashCharges,
    dashTimer: 0,
    dashTimeLeft: 0,
    dashRechargeMul: 1,
    dashDirX: 0,
    dashDirY: -1,
    pickupRadius: PLAYER.pickupRadius,
    invuln: 0,
    hurtFlash: 0,
    alive: true,
  };
}

export class World {
  constructor(seed) {
    this.reset(seed);
  }

  reset(seed) {
    this.rng = makeRng(seed);
    this.seed = seed;
    this.time = 0;
    this.player = freshPlayer();
    this.enemies = [];
    this.bolts = [];
    this.orbs = [];
    this.particles = [];
    this.pickups = [];
    this.texts = [];
    this.wave = 0;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.betweenTimer = 0;
    this.phase = 'title'; // title | playing | upgrade | victory | defeat
    this.score = 0;
    this.kills = 0;
    this.shards = 0;
    this.upgrades = {};
    this.choices = [];
    this.shake = 0;
    this.events = [];
    this.waveKills = 0;
    this.waveTotal = 0;
  }

  startRun(seed) {
    this.reset(seed === undefined ? (Date.now() % 2147483647) : seed);
    this.phase = 'playing';
    this.beginWave(1);
  }

  beginWave(n) {
    this.wave = n;
    this.spawnQueue = buildWave(n, this.rng);
    this.waveTotal = this.spawnQueue.length;
    this.waveKills = 0;
    this.spawnTimer = 0.5;
    this.events.push({ type: 'wave', wave: n });
  }

  // One fixed step. `input` is {mx, my, aimX, aimY, firing, dash} in world units.
  step(dt, input) {
    this.time += dt;
    this.events.length = 0;
    if (this.phase !== 'playing') return;
    const p = this.player;
    if (!p.alive) return;

    // --- timers ---
    p.fireTimer -= dt;
    p.invuln = Math.max(0, p.invuln - dt);
    p.hurtFlash = Math.max(0, p.hurtFlash - dt);
    p.dashTimer -= dt;
    if (p.dashCharges < p.dashMax && p.dashTimer <= 0) {
      p.dashCharges += 1;
      p.dashTimer = PLAYER.dashRecharge * p.dashRechargeMul;
    }
    this.shake = Math.max(0, this.shake - dt * 2.2);

    // --- dash ---
    if (input.dash && p.dashCharges > 0 && p.dashTimeLeft <= 0) {
      p.dashCharges -= 1;
      p.dashTimer = PLAYER.dashRecharge * p.dashRechargeMul;
      p.dashTimeLeft = PLAYER.dashTime;
      const len = Math.hypot(input.mx, input.my) || 1;
      p.dashDirX = (input.mx || 0) / len;
      p.dashDirY = (input.my || 0) / len;
      if (input.mx === 0 && input.my === 0) {
        p.dashDirX = Math.cos(p.angle);
        p.dashDirY = Math.sin(p.angle);
      }
      p.invuln = Math.max(p.invuln, PLAYER.dashInvuln);
      this.burst(p.x, p.y, 10, '#ffe9a8', 160);
      this.events.push({ type: 'dash' });
    }

    // --- move ---
    let vx = input.mx * PLAYER.speed * p.speedMul;
    let vy = input.my * PLAYER.speed * p.speedMul;
    if (p.dashTimeLeft > 0) {
      p.dashTimeLeft -= dt;
      vx = p.dashDirX * PLAYER.dashSpeed;
      vy = p.dashDirY * PLAYER.dashSpeed;
    }
    p.x = clamp(p.x + vx * dt, p.radius, VIEW.width - p.radius);
    p.y = clamp(p.y + vy * dt, p.radius, VIEW.height - p.radius);
    p.angle = Math.atan2(input.aimY - p.y, input.aimX - p.x);

    // --- fire ---
    if (input.firing && p.fireTimer <= 0) {
      p.fireTimer = PLAYER.fireInterval * p.fireIntervalMul;
      const count = p.boltCount;
      const spread = 0.14;
      for (let i = 0; i < count; i += 1) {
        const off = (i - (count - 1) / 2) * spread;
        const a = p.angle + off;
        this.bolts.push({
          x: p.x + Math.cos(a) * (p.radius + 6),
          y: p.y + Math.sin(a) * (p.radius + 6),
          vx: Math.cos(a) * PLAYER.boltSpeed,
          vy: Math.sin(a) * PLAYER.boltSpeed,
          damage: PLAYER.boltDamage * p.boltDamageMul,
          pierce: p.pierce,
          life: PLAYER.boltLife,
          radius: PLAYER.boltRadius,
        });
      }
      this.events.push({ type: 'shoot' });
    }

    // --- spawn ---
    if (this.spawnQueue.length > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = spawnInterval(this.wave);
        const next = this.spawnQueue.shift();
        this.spawnEnemy(next.type, next.elite);
      }
    }

    this.updateEnemies(dt);
    this.updateBolts(dt);
    this.updateOrbs(dt);
    this.updatePickups(dt);
    this.updateParticles(dt);
    this.updateTexts(dt);

    // --- wave clear ---
    if (this.spawnQueue.length === 0 && this.enemies.length === 0 && p.alive) {
      if (this.wave >= TOTAL_WAVES) {
        this.phase = 'victory';
        this.events.push({ type: 'victory' });
      } else {
        this.phase = 'upgrade';
        this.events.push({ type: 'waveclear', wave: this.wave });
      }
    }
  }

  spawnEnemy(type, elite) {
    const base = ENEMIES[type];
    const edge = Math.floor(this.rng() * 4);
    let x;
    let y;
    const m = 30;
    if (edge === 0) { x = range(this.rng, m, VIEW.width - m); y = m; }
    else if (edge === 1) { x = range(this.rng, m, VIEW.width - m); y = VIEW.height - m; }
    else if (edge === 2) { x = m; y = range(this.rng, m, VIEW.height - m); }
    else { x = VIEW.width - m; y = range(this.rng, m, VIEW.height - m); }
    const hpMul = hpScale(this.wave) * (elite ? ELITE.hpMul : 1);
    const spMul = speedScale(this.wave);
    this.enemies.push({
      type, elite,
      x, y,
      radius: base.radius * (elite ? 1.25 : 1),
      hp: base.hp * hpMul,
      maxHp: base.hp * hpMul,
      speed: base.speed * spMul * range(this.rng, 0.9, 1.1),
      score: base.score * (elite ? ELITE.scoreMul : 1),
      contact: base.contact,
      color: base.color,
      spawnT: 0.6,
      flash: 0,
      state: 'chase',
      stateT: 0,
      angle: 0,
      fireTimer: range(this.rng, 1, 2),
      wobble: range(this.rng, 0, TAU),
    });
  }

  updateEnemies(dt) {
    const p = this.player;
    for (let i = this.enemies.length - 1; i >= 0; i -= 1) {
      const e = this.enemies[i];
      e.flash = Math.max(0, e.flash - dt);
      if (e.spawnT > 0) {
        e.spawnT -= dt;
        continue;
      }
      const d = dist(e.x, e.y, p.x, p.y) || 1;
      const nx = (p.x - e.x) / d;
      const ny = (p.y - e.y) / d;
      e.wobble += dt * 2;
      if (e.type === 'wisp') {
        const wob = Math.sin(e.wobble) * 0.5;
        e.x += (nx * Math.cos(wob) - ny * Math.sin(wob)) * e.speed * dt;
        e.y += (nx * Math.sin(wob) + ny * Math.cos(wob)) * e.speed * dt;
      } else if (e.type === 'darter') {
        e.stateT -= dt;
        if (e.state === 'chase') {
          e.x += nx * e.speed * dt;
          e.y += ny * e.speed * dt;
          if (d < 300) {
            e.state = 'aim';
            e.stateT = 0.5;
            e.angle = Math.atan2(ny, nx);
          }
        } else if (e.state === 'aim') {
          e.angle = Math.atan2(ny, nx);
          if (e.stateT <= 0) {
            e.state = 'lunge';
            e.stateT = 0.34;
            this.events.push({ type: 'lunge' });
          }
        } else {
          e.x += Math.cos(e.angle) * 560 * dt;
          e.y += Math.sin(e.angle) * 560 * dt;
          if (e.stateT <= 0) e.state = 'chase';
        }
      } else if (e.type === 'spinner') {
        if (d > 280) {
          e.x += nx * e.speed * dt;
          e.y += ny * e.speed * dt;
        } else if (d < 200) {
          e.x -= nx * e.speed * 0.7 * dt;
          e.y -= ny * e.speed * 0.7 * dt;
        } else {
          e.x += -ny * e.speed * 0.5 * dt;
          e.y += nx * e.speed * 0.5 * dt;
        }
        e.fireTimer -= dt;
        if (e.fireTimer <= 0 && d < 560) {
          e.fireTimer = 1.7;
          this.orbs.push({
            x: e.x, y: e.y,
            vx: nx * 210, vy: ny * 210,
            radius: 7, damage: 10, life: 4,
          });
          this.events.push({ type: 'orb' });
        }
      } else if (e.type === 'brute') {
        e.x += nx * e.speed * dt;
        e.y += ny * e.speed * dt;
      }
      e.x = clamp(e.x, e.radius, VIEW.width - e.radius);
      e.y = clamp(e.y, e.radius, VIEW.height - e.radius);
      // Contact with the player.
      if (p.invuln <= 0 && dist(e.x, e.y, p.x, p.y) < e.radius + p.radius - 2) {
        this.hurtPlayer(e.contact, e.x, e.y);
        // Knock the enemy back a little so one touch is not a chain of hits.
        e.x += (e.x - p.x) * 0.4;
        e.y += (e.y - p.y) * 0.4;
      }
    }
  }

  updateBolts(dt) {
    for (let i = this.bolts.length - 1; i >= 0; i -= 1) {
      const b = this.bolts[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      let dead = b.life <= 0 || b.x < -20 || b.x > VIEW.width + 20 || b.y < -20 || b.y > VIEW.height + 20;
      if (!dead) {
        for (let j = this.enemies.length - 1; j >= 0; j -= 1) {
          const e = this.enemies[j];
          if (e.spawnT > 0) continue;
          if (dist(b.x, b.y, e.x, e.y) < b.radius + e.radius) {
            e.hp -= b.damage;
            e.flash = 0.09;
            this.burst(b.x, b.y, 4, '#fff3c4', 120);
            this.events.push({ type: 'hit' });
            if (e.hp <= 0) this.killEnemy(j);
            if (b.pierce > 0) {
              b.pierce -= 1;
            } else {
              dead = true;
            }
            break;
          }
        }
      }
      if (dead) this.bolts.splice(i, 1);
    }
  }

  updateOrbs(dt) {
    const p = this.player;
    for (let i = this.orbs.length - 1; i >= 0; i -= 1) {
      const o = this.orbs[i];
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      o.life -= dt;
      let dead = o.life <= 0 || o.x < -20 || o.x > VIEW.width + 20 || o.y < -20 || o.y > VIEW.height + 20;
      if (!dead && p.invuln <= 0 && dist(o.x, o.y, p.x, p.y) < o.radius + p.radius - 2) {
        this.hurtPlayer(o.damage, o.x, o.y);
        dead = true;
      }
      if (dead) this.orbs.splice(i, 1);
    }
  }

  updatePickups(dt) {
    const p = this.player;
    for (let i = this.pickups.length - 1; i >= 0; i -= 1) {
      const k = this.pickups[i];
      k.life -= dt;
      k.bob += dt * 3;
      const d = dist(k.x, k.y, p.x, p.y);
      if (d < p.pickupRadius) {
        const pull = 420 * dt;
        k.x += ((p.x - k.x) / (d || 1)) * pull;
        k.y += ((p.y - k.y) / (d || 1)) * pull;
      }
      if (d < p.radius + k.radius + 4) {
        if (k.kind === 'shard') {
          this.score += SHARD_SCORE;
          this.shards += 1;
          p.hp = Math.min(p.maxHp, p.hp + SHARD_HEAL);
          this.addText(p.x, p.y - 24, `+${SHARD_SCORE}`, '#8ef6ff');
        } else {
          this.score += CORE_SCORE;
          p.hp = Math.min(p.maxHp, p.hp + CORE_HEAL);
          this.addText(p.x, p.y - 24, `+${CORE_SCORE} EMBER CORE`, '#ffd700');
        }
        this.events.push({ type: 'pickup' });
        this.pickups.splice(i, 1);
      } else if (k.life <= 0) {
        this.pickups.splice(i, 1);
      }
    }
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const q = this.particles[i];
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vx *= 1 - 2.4 * dt;
      q.vy *= 1 - 2.4 * dt;
      q.life -= dt;
      if (q.life <= 0) this.particles.splice(i, 1);
    }
  }

  updateTexts(dt) {
    for (let i = this.texts.length - 1; i >= 0; i -= 1) {
      const t = this.texts[i];
      t.y -= 34 * dt;
      t.life -= dt;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
  }

  killEnemy(index) {
    const e = this.enemies[index];
    this.enemies.splice(index, 1);
    this.score += e.score;
    this.kills += 1;
    this.waveKills += 1;
    this.burst(e.x, e.y, e.type === 'brute' ? 26 : 14, e.color, e.type === 'brute' ? 260 : 200);
    this.addText(e.x, e.y - e.radius - 6, `+${e.score}`, '#f4ead8');
    this.events.push({ type: 'kill', big: e.type === 'brute' });
    if (e.type === 'brute') {
      for (let k = 0; k < 2; k += 1) {
        const w = {
          type: 'wisp', elite: false,
          x: e.x + range(this.rng, -24, 24), y: e.y + range(this.rng, -24, 24),
          radius: ENEMIES.wisp.radius,
          hp: ENEMIES.wisp.hp * hpScale(this.wave),
          maxHp: ENEMIES.wisp.hp * hpScale(this.wave),
          speed: ENEMIES.wisp.speed * speedScale(this.wave),
          score: ENEMIES.wisp.score, contact: ENEMIES.wisp.contact,
          color: ENEMIES.wisp.color, spawnT: 0.25, flash: 0,
          state: 'chase', stateT: 0, angle: 0, fireTimer: 0,
          wobble: range(this.rng, 0, TAU),
        };
        this.enemies.push(w);
      }
    }
    if (e.elite) {
      this.pickups.push({ kind: 'core', x: e.x, y: e.y, radius: 12, life: 12, bob: 0 });
    } else if (chance(this.rng, SHARD_DROP_CHANCE)) {
      this.pickups.push({ kind: 'shard', x: e.x, y: e.y, radius: 8, life: 10, bob: 0 });
    }
  }

  hurtPlayer(amount, fromX, fromY) {
    const p = this.player;
    p.hp -= amount;
    p.invuln = PLAYER.hurtInvuln;
    p.hurtFlash = 0.35;
    this.shake = Math.min(1, this.shake + 0.55);
    this.burst(p.x, p.y, 12, '#ff5d73', 220);
    this.addText(p.x, p.y - 26, `-${amount}`, '#ff8fa3');
    this.events.push({ type: 'hurt' });
    if (p.hp <= 0) {
      p.hp = 0;
      p.alive = false;
      this.phase = 'defeat';
      this.burst(p.x, p.y, 60, '#ffb347', 320);
      this.events.push({ type: 'defeat' });
    }
  }

  burst(x, y, count, color, speed) {
    for (let i = 0; i < count; i += 1) {
      const a = this.rng() * TAU;
      const s = range(this.rng, speed * 0.3, speed);
      this.particles.push({
        x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: range(this.rng, 0.3, 0.7), maxLife: 0.7,
        size: range(this.rng, 2, 5), color,
      });
    }
  }

  addText(x, y, text, color) {
    this.texts.push({ x, y, text, color, life: 0.9 });
  }

  enemiesLeft() {
    return this.spawnQueue.length + this.enemies.length;
  }
}
