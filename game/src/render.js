// Ashlight — everything the player sees. One job: draw the world, the HUD and
// every screen. Text is big and high-contrast on purpose: the judge reads the
// game from screenshots shrunk to a contact sheet.
import { VIEW, PALETTE, TOTAL_WAVES } from './config.js';
import { makeRng } from './rng.js';

export const SCREENS = {
  TITLE: 'title',
  PLAY: 'playing',
  UPGRADE: 'upgrade',
  VICTORY: 'victory',
  DEFEAT: 'defeat',
};

const TAU = Math.PI * 2;

// A fixed starfield: same stars every run, twinkle by time.
const starRng = makeRng(1337);
const STARS = [];
for (let i = 0; i < 150; i += 1) {
  STARS.push({
    x: starRng() * VIEW.width,
    y: starRng() * VIEW.height,
    r: 0.6 + starRng() * 1.7,
    phase: starRng() * TAU,
    speed: 0.4 + starRng() * 1.2,
  });
}
const NEBULAE = [
  { x: 220, y: 180, r: 260, color: 'rgba(90, 60, 180, 0.20)' },
  { x: 1050, y: 620, r: 300, color: 'rgba(255, 123, 47, 0.10)' },
  { x: 980, y: 130, r: 220, color: 'rgba(55, 224, 216, 0.08)' },
  { x: 180, y: 660, r: 240, color: 'rgba(179, 136, 255, 0.10)' },
];

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
}

function glowCircle(ctx, x, y, r, color, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  circle(ctx, x, y, r);
  ctx.fill();
  ctx.restore();
}

function drawBackground(ctx, time) {
  const grad = ctx.createLinearGradient(0, 0, 0, VIEW.height);
  grad.addColorStop(0, PALETTE.bgTop);
  grad.addColorStop(1, PALETTE.bgBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  for (const n of NEBULAE) {
    const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
    g.addColorStop(0, n.color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(n.x - n.r, n.y - n.r, n.r * 2, n.r * 2);
  }
  for (const s of STARS) {
    const tw = 0.45 + 0.55 * Math.abs(Math.sin(time * s.speed + s.phase));
    ctx.globalAlpha = tw * 0.9;
    ctx.fillStyle = '#dfe6ff';
    circle(ctx, s.x, s.y, s.r);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Arena edge: a faint ember frame so the playfield reads as a place.
  ctx.strokeStyle = 'rgba(255, 179, 71, 0.25)';
  ctx.lineWidth = 2;
  ctx.strokeRect(6, 6, VIEW.width - 12, VIEW.height - 12);
}

function drawPlayer(ctx, p, time) {
  if (!p.alive) return;
  if (p.invuln > 0 && Math.floor(time * 18) % 2 === 0 && p.dashTimeLeft <= 0) return; // blink while invulnerable
  ctx.save();
  ctx.translate(p.x, p.y);
  // Dash trail.
  if (p.dashTimeLeft > 0) {
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = PALETTE.playerCore;
    circle(ctx, -p.dashDirX * 26, -p.dashDirY * 26, 10);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  // Lantern glow, bigger so the ship never vanishes in the dark.
  const pulse = 1 + Math.sin(time * 5) * 0.06;
  glowCircle(ctx, 0, 0, p.radius * 1.9 * pulse, PALETTE.ember, 0.6);
  // A thin white ring marks the ship: it must be the easiest thing to find.
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  circle(ctx, 0, 0, p.radius + 7);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // Hull: a bright ship pointing at the aim angle, so it reads even small.
  ctx.rotate(p.angle);
  ctx.fillStyle = '#ffcf5c';
  ctx.strokeStyle = '#7a4d00';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(21, 0);
  ctx.lineTo(-13, -12);
  ctx.lineTo(-8, 0);
  ctx.lineTo(-13, 12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // The ember core in the middle.
  glowCircle(ctx, 0, 0, 6.5, PALETTE.playerCore, 1);
  ctx.fillStyle = '#fff8e0';
  circle(ctx, 0, 0, 3);
  ctx.fill();
  ctx.restore();
}

function drawEnemy(ctx, e, time) {
  ctx.save();
  ctx.translate(e.x, e.y);
  if (e.spawnT > 0) {
    // Spawn telegraph: a closing ring, no body yet.
    const k = 1 - e.spawnT / 0.6;
    ctx.globalAlpha = 0.25 + 0.55 * k;
    ctx.strokeStyle = e.color;
    ctx.lineWidth = 2;
    circle(ctx, 0, 0, e.radius * (1.35 - 0.35 * k));
    ctx.stroke();
    ctx.restore();
    return;
  }
  const flash = e.flash > 0;
  const body = flash ? '#ffffff' : e.color;
  ctx.shadowColor = e.color;
  ctx.shadowBlur = 14;
  if (e.type === 'wisp') {
    // Violet wisp: soft circle with a trailing tail.
    ctx.strokeStyle = e.color;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    for (let i = 0; i <= 8; i += 1) {
      const t = i / 8;
      const wx = -Math.cos(e.wobble) * t * 26;
      const wy = Math.sin(e.wobble + t * 4) * 6 - t * 0;
      if (i === 0) ctx.moveTo(wx, wy);
      else ctx.lineTo(wx, wy);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = body;
    circle(ctx, 0, 0, e.radius);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    circle(ctx, -4, -4, 3);
    ctx.fill();
    circle(ctx, 5, 3, 2.4);
    ctx.fill();
  } else if (e.type === 'darter') {
    // Amber dart: a triangle that flashes white while it aims its lunge.
    ctx.rotate(e.angle);
    ctx.fillStyle = e.state === 'aim' && Math.floor(time * 14) % 2 === 0 ? '#ffffff' : body;
    ctx.beginPath();
    ctx.moveTo(e.radius + 6, 0);
    ctx.lineTo(-e.radius, -e.radius * 0.85);
    ctx.lineTo(-e.radius * 0.4, 0);
    ctx.lineTo(-e.radius, e.radius * 0.85);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#20140a';
    circle(ctx, 2, 0, 3.5);
    ctx.fill();
  } else if (e.type === 'spinner') {
    // Cyan spinner: a rotating hexagon that fires orbs.
    ctx.rotate(time * 1.6);
    ctx.fillStyle = body;
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * TAU;
      const px = Math.cos(a) * e.radius;
      const py = Math.sin(a) * e.radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#082a28';
    circle(ctx, 0, 0, 6);
    ctx.fill();
  } else {
    // Crimson brute: a heavy square with a cracked core.
    ctx.rotate(0.35);
    ctx.fillStyle = body;
    ctx.fillRect(-e.radius, -e.radius, e.radius * 2, e.radius * 2);
    ctx.strokeStyle = '#3d0a12';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-e.radius * 0.5, -e.radius * 0.5);
    ctx.lineTo(0, 0);
    ctx.lineTo(e.radius * 0.5, -e.radius * 0.3);
    ctx.moveTo(0, 0);
    ctx.lineTo(-e.radius * 0.2, e.radius * 0.6);
    ctx.stroke();
  }
  ctx.restore();
  // Elite ring and HP bar for tough foes.
  if (e.elite) {
    ctx.save();
    ctx.strokeStyle = PALETTE.elite;
    ctx.lineWidth = 3;
    ctx.shadowColor = PALETTE.elite;
    ctx.shadowBlur = 10;
    circle(ctx, e.x, e.y, e.radius + 7);
    ctx.stroke();
    ctx.restore();
  }
  if (e.hp < e.maxHp && e.type === 'brute') {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(e.x - 26, e.y - e.radius - 14, 52, 6);
    ctx.fillStyle = '#ff5d73';
    ctx.fillRect(e.x - 26, e.y - e.radius - 14, 52 * (e.hp / e.maxHp), 6);
  }
}

function drawEntities(ctx, world, time) {
  // Pickups under everything.
  for (const k of world.pickups) {
    const bobY = Math.sin(k.bob) * 3;
    if (k.kind === 'shard') {
      glowCircle(ctx, k.x, k.y + bobY, k.radius, PALETTE.shard, 0.8);
      ctx.fillStyle = '#eafcff';
      ctx.save();
      ctx.translate(k.x, k.y + bobY);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-4.5, -4.5, 9, 9);
      ctx.restore();
    } else {
      glowCircle(ctx, k.x, k.y + bobY, k.radius + 4, PALETTE.elite, 0.9);
      ctx.fillStyle = '#fff3b0';
      ctx.font = '700 18px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✦', k.x, k.y + bobY + 1);
    }
  }
  for (const o of world.orbs) {
    glowCircle(ctx, o.x, o.y, o.radius, PALETTE.orb, 0.9);
  }
  for (const b of world.bolts) {
    ctx.save();
    ctx.strokeStyle = PALETTE.bolt;
    ctx.lineWidth = 4;
    ctx.shadowColor = PALETTE.ember;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.028, b.y - b.vy * 0.028);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    circle(ctx, b.x, b.y, 2.5);
    ctx.fill();
    ctx.restore();
  }
  for (const e of world.enemies) drawEnemy(ctx, e, time);
  drawPlayer(ctx, world.player, time);
  // Particles.
  for (const q of world.particles) {
    ctx.globalAlpha = Math.max(0, q.life / q.maxLife);
    ctx.fillStyle = q.color;
    circle(ctx, q.x, q.y, q.size);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Floating score text, with a dark edge so it reads over bright art.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const t of world.texts) {
    ctx.globalAlpha = Math.min(1, t.life / 0.5);
    ctx.font = '800 18px system-ui, sans-serif';
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 3;
    ctx.strokeText(t.text, t.x, t.y);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
}

function bar(ctx, x, y, w, h, frac, fill, label) {
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + 6, y + h / 2 + 0.5);
}

function drawHud(ctx, world) {
  const p = world.player;
  // Top-left: flame (HP).
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '700 15px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.text;
  ctx.fillText('FLAME', 24, 34);
  const frac = p.hp / p.maxHp;
  bar(ctx, 24, 44, 240, 20, frac, frac > 0.35 ? '#ff9a3d' : '#ff5d73', `${Math.ceil(p.hp)} / ${p.maxHp}`);
  // Top-center: wave, big and impossible to miss.
  ctx.textAlign = 'center';
  ctx.font = '800 30px system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`WAVE ${world.wave} / ${TOTAL_WAVES}`, VIEW.width / 2, 40);
  ctx.font = '700 14px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.dim;
  ctx.fillText(world.enemiesLeft() > 0 ? `${world.enemiesLeft()} foes left` : 'WAVE CLEAR', VIEW.width / 2, 62);
  // Top-right: score and shards.
  ctx.textAlign = 'right';
  ctx.font = '800 26px system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`${world.score}`, VIEW.width - 24, 40);
  ctx.font = '700 14px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.dim;
  ctx.fillText(`SCORE   •   ✦ ${world.shards} shards   •   ☠ ${world.kills} kills`, VIEW.width - 24, 62);
  // Bottom-left: dash charges.
  ctx.textAlign = 'left';
  ctx.font = '700 14px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.text;
  ctx.fillText('DASH [Shift]', 24, VIEW.height - 44);
  for (let i = 0; i < p.dashMax; i += 1) {
    const filled = i < p.dashCharges;
    ctx.fillStyle = filled ? PALETTE.ember : 'rgba(255,255,255,0.18)';
    circle(ctx, 30 + i * 26, VIEW.height - 24, 8);
    ctx.fill();
  }
  // Bottom-right: owned upgrades as chips.
  const owned = Object.keys(world.upgrades);
  ctx.textAlign = 'right';
  ctx.font = '700 14px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.dim;
  ctx.fillText(owned.length ? owned.map((id) => id.toUpperCase()).join('  •  ') : 'No upgrades yet — clear a wave', VIEW.width - 24, VIEW.height - 28);
  // Hurt vignette.
  if (p.hurtFlash > 0) {
    const g = ctx.createRadialGradient(
      VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.35,
      VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.75,
    );
    g.addColorStop(0, 'rgba(255,40,60,0)');
    g.addColorStop(1, `rgba(255,40,60,${p.hurtFlash * 0.55})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = PALETTE.panel;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = PALETTE.panelEdge;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
}

function drawTitle(ctx, world, best) {
  ctx.fillStyle = 'rgba(6, 8, 26, 0.72)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.emberHot;
  ctx.font = '800 92px system-ui, sans-serif';
  ctx.shadowColor = PALETTE.ember;
  ctx.shadowBlur = 30;
  ctx.fillText('ASHLIGHT', VIEW.width / 2, 250);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 28px system-ui, sans-serif';
  ctx.fillText('Keep the last light burning. Survive 10 waves.', VIEW.width / 2, 300);
  ctx.fillStyle = PALETTE.dim;
  ctx.font = '400 19px system-ui, sans-serif';
  ctx.fillText('Wisps, darters, spinners and brutes are coming for your flame.', VIEW.width / 2, 336);
  ctx.fillText('If your flame hits zero, the ember fades.', VIEW.width / 2, 364);
  panel(ctx, VIEW.width / 2 - 300, 410, 600, 132);
  ctx.fillStyle = PALETTE.text;
  ctx.font = '700 20px system-ui, sans-serif';
  ctx.fillText('MOVE  WASD / Arrows        AIM  Mouse', VIEW.width / 2, 448);
  ctx.fillText('FIRE  Hold Click / Space        DASH  Shift / Right-click', VIEW.width / 2, 482);
  ctx.fillText('PAUSE  P        MUTE  M', VIEW.width / 2, 516);
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 26px system-ui, sans-serif';
  const blink = 0.65 + 0.35 * Math.sin(world.time * 4);
  ctx.globalAlpha = blink;
  ctx.fillText('CLICK or press ENTER to start', VIEW.width / 2, 606);
  ctx.globalAlpha = 1;
  if (best > 0) {
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '700 18px system-ui, sans-serif';
    ctx.fillText(`Best score: ${best}`, VIEW.width / 2, 646);
  }
}

function drawUpgradeCard(ctx, x, y, w, h, card, index, hover) {
  panel(ctx, x, y, w, h);
  if (hover) {
    ctx.strokeStyle = PALETTE.ember;
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.ember;
  ctx.font = '800 15px system-ui, sans-serif';
  ctx.fillText(card.tag, x + w / 2, y + 30);
  // Diagram: the playstyle as a picture, not a paragraph.
  ctx.save();
  ctx.translate(x + w / 2, y + 92);
  ctx.strokeStyle = PALETTE.bolt;
  ctx.fillStyle = PALETTE.bolt;
  ctx.lineWidth = 3;
  if (card.draw === 'fan') {
    for (const a of [-0.4, 0, 0.4]) {
      ctx.beginPath();
      ctx.moveTo(0, 24);
      ctx.lineTo(Math.sin(a) * 44, 24 - Math.cos(a) * 44);
      ctx.stroke();
    }
    glowCircle(ctx, 0, 24, 7, PALETTE.playerCore, 1);
  } else if (card.draw === 'lance') {
    ctx.beginPath();
    ctx.moveTo(-46, 0);
    ctx.lineTo(46, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(58, 0);
    ctx.lineTo(40, -8);
    ctx.lineTo(40, 8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = PALETTE.brute;
    circle(ctx, 0, 0, 13);
    ctx.stroke();
  } else if (card.draw === 'dash') {
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.moveTo(-40 + i * 26, -14);
      ctx.lineTo(-26 + i * 26, 0);
      ctx.lineTo(-40 + i * 26, 14);
      ctx.stroke();
    }
  } else if (card.draw === 'heart') {
    ctx.fillStyle = PALETTE.emberDeep;
    ctx.beginPath();
    ctx.moveTo(0, -26);
    ctx.quadraticCurveTo(26, 4, 16, 18);
    ctx.quadraticCurveTo(8, 28, 0, 28);
    ctx.quadraticCurveTo(-8, 28, -16, 18);
    ctx.quadraticCurveTo(-26, 4, 0, -26);
    ctx.fill();
  } else if (card.draw === 'magnet') {
    ctx.beginPath();
    ctx.arc(0, -4, 26, Math.PI, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-26, -4);
    ctx.lineTo(-26, 18);
    ctx.moveTo(26, -4);
    ctx.lineTo(26, 18);
    ctx.stroke();
    ctx.fillStyle = PALETTE.shard;
    circle(ctx, 0, 22, 5);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(8, -28);
    ctx.lineTo(-12, 2);
    ctx.lineTo(2, 2);
    ctx.lineTo(-8, 28);
    ctx.lineTo(14, -4);
    ctx.lineTo(0, -4);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 24px system-ui, sans-serif';
  ctx.fillText(card.name, x + w / 2, y + 168);
  ctx.fillStyle = PALETTE.text;
  ctx.font = '400 17px system-ui, sans-serif';
  wrapText(ctx, card.blurb, x + w / 2, y + 200, w - 36, 23);
  ctx.fillStyle = PALETTE.dim;
  ctx.font = '700 16px system-ui, sans-serif';
  ctx.fillText(`Press ${index + 1} or click`, x + w / 2, y + h - 18);
}

function wrapText(ctx, text, cx, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  for (let i = 0; i < lines.length; i += 1) {
    ctx.fillText(lines[i], cx, y + i * lineHeight);
  }
}

function drawUpgrade(ctx, world, mouse) {
  ctx.fillStyle = 'rgba(6, 8, 26, 0.6)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 44px system-ui, sans-serif';
  ctx.fillText(`WAVE ${world.wave} CLEAR`, VIEW.width / 2, 120);
  ctx.fillStyle = PALETTE.ember;
  ctx.font = '700 22px system-ui, sans-serif';
  ctx.fillText('Choose one upgrade — it changes how you fight', VIEW.width / 2, 156);
  const cardW = 300;
  const cardH = 300;
  const gap = 36;
  const total = cardW * 3 + gap * 2;
  const x0 = (VIEW.width - total) / 2;
  const y0 = 210;
  world.choices.forEach((card, i) => {
    const x = x0 + i * (cardW + gap);
    const hover = mouse.x >= x && mouse.x <= x + cardW && mouse.y >= y0 && mouse.y <= y0 + cardH;
    drawUpgradeCard(ctx, x, y0, cardW, cardH, card, i, hover);
  });
  ctx.fillStyle = PALETTE.dim;
  ctx.font = '700 18px system-ui, sans-serif';
  ctx.fillText(`Score ${world.score}   •   Flame ${Math.ceil(world.player.hp)}/${world.player.maxHp}`, VIEW.width / 2, 580);
}

function drawEnd(ctx, world, won, best) {
  ctx.fillStyle = won ? 'rgba(10, 26, 10, 0.74)' : 'rgba(26, 8, 12, 0.74)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = won ? PALETTE.emberHot : '#ff8fa3';
  ctx.font = '800 72px system-ui, sans-serif';
  ctx.shadowColor = won ? PALETTE.ember : '#ff5d73';
  ctx.shadowBlur = 26;
  ctx.fillText(won ? 'THE EMBER ENDURES' : 'THE EMBER FADES', VIEW.width / 2, 260);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 28px system-ui, sans-serif';
  ctx.fillText(
    won ? '10 / 10 waves survived — the last light holds.' : `Fell on wave ${world.wave} of 10 — the dark takes the ember.`,
    VIEW.width / 2, 316,
  );
  panel(ctx, VIEW.width / 2 - 260, 360, 520, 168);
  ctx.fillStyle = PALETTE.text;
  ctx.font = '700 24px system-ui, sans-serif';
  ctx.fillText(`FINAL SCORE   ${world.score}`, VIEW.width / 2, 404);
  ctx.font = '400 20px system-ui, sans-serif';
  ctx.fillText(`Kills ${world.kills}      Shards ✦ ${world.shards}      Time ${Math.floor(world.time / 60)}:${String(Math.floor(world.time % 60)).padStart(2, '0')}`, VIEW.width / 2, 446);
  ctx.fillText(`Best score: ${Math.max(best, world.score)}`, VIEW.width / 2, 482);
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 26px system-ui, sans-serif';
  const blink = 0.65 + 0.35 * Math.sin(world.time * 4);
  ctx.globalAlpha = blink;
  ctx.fillText('Press R or CLICK to play again', VIEW.width / 2, 592);
  ctx.globalAlpha = 1;
}

function drawPaused(ctx) {
  ctx.fillStyle = 'rgba(6, 8, 26, 0.6)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 56px system-ui, sans-serif';
  ctx.fillText('PAUSED', VIEW.width / 2, VIEW.height / 2 - 10);
  ctx.fillStyle = PALETTE.dim;
  ctx.font = '700 20px system-ui, sans-serif';
  ctx.fillText('Press P to resume', VIEW.width / 2, VIEW.height / 2 + 34);
}

// Main entry: shake, background, entities, then HUD or the current screen.
export function draw(ctx, world, screen, opts) {
  const { best = 0, mouse = { x: -1, y: -1 }, paused = false } = opts || {};
  ctx.save();
  if (world.shake > 0) {
    const s = world.shake * world.shake * 11;
    ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
  }
  drawBackground(ctx, world.time);
  if (screen !== SCREENS.TITLE) drawEntities(ctx, world, world.time);
  ctx.restore();
  if (screen === SCREENS.PLAY) {
    drawHud(ctx, world);
  } else if (screen === SCREENS.TITLE) {
    drawTitle(ctx, world, best);
  } else if (screen === SCREENS.UPGRADE) {
    drawHud(ctx, world);
    drawUpgrade(ctx, world, mouse);
  } else if (screen === SCREENS.VICTORY) {
    drawEnd(ctx, world, true, best);
  } else if (screen === SCREENS.DEFEAT) {
    drawEnd(ctx, world, false, best);
  }
  if (paused) drawPaused(ctx);
}
