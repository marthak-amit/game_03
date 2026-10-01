// ============================================================
//  NEON SWARM — core engine (canvas 2D, mobile-first)
// ============================================================
const Game = (() => {
  const TAU = Math.PI * 2;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, DPR = 1, Z = 1;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    Z = clamp(Math.min(W, H) / 430, 0.8, 1.35);
  }
  window.addEventListener('resize', resize); resize();

  // ---------- glow sprite cache ----------
  const glowCache = {};
  function glow(col, r) {
    const k = col + r; if (glowCache[k]) return glowCache[k];
    const c = document.createElement('canvas'); c.width = c.height = r * 2;
    const g = c.getContext('2d'), gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, col + 'aa'); gr.addColorStop(1, col + '00');
    g.fillStyle = gr; g.fillRect(0, 0, r * 2, r * 2);
    return (glowCache[k] = c);
  }
  function poly(x, y, r, n, rot) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) { const a = rot + i * TAU / n; i ? ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    ctx.closePath();
  }

  // ---------- state ----------
  const G = { state: 'menu', t: 0 };
  let P, enemies, bullets, ebullets, gems, picks, parts, texts, fx;
  let cam = { x: 0, y: 0 }, shake = 0, flash = 0, menuT = 0;
  const grid = new Map(), GC = 64, tmp = [];
  const input = { jx: 0, jy: 0, keys: {}, touch: null };
  const gk = (cx, cy) => cx * 100003 + cy;

  // ---------- input (floating joystick + keyboard) ----------
  canvas.addEventListener('pointerdown', e => {
    Sfx.init();
    if (G.state !== 'play') return;
    input.touch = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  });
  canvas.addEventListener('pointermove', e => { const t = input.touch; if (t && t.id === e.pointerId) { t.x = e.clientX; t.y = e.clientY; } });
  const endTouch = e => { if (input.touch && input.touch.id === e.pointerId) input.touch = null; };
  canvas.addEventListener('pointerup', endTouch); canvas.addEventListener('pointercancel', endTouch);
  window.addEventListener('keydown', e => { input.keys[e.key.toLowerCase()] = true; if (e.key === 'Escape' || e.key === 'p') Game.togglePause(); });
  window.addEventListener('keyup', e => { input.keys[e.key.toLowerCase()] = false; });
  function moveVec() {
    let x = 0, y = 0; const t = input.touch, k = input.keys;
    if (t) { let dx = t.x - t.ox, dy = t.y - t.oy; const d = Math.hypot(dx, dy), R = 55; if (d > 6) { const m = Math.min(d, R) / R; x = dx / d * m; y = dy / d * m; } if (d > R * 1.6) { t.ox = t.x - dx / d * R * 1.6; t.oy = t.y - dy / d * R * 1.6; } }
    if (k.a || k.arrowleft) x -= 1; if (k.d || k.arrowright) x += 1; if (k.w || k.arrowup) y -= 1; if (k.s || k.arrowdown) y += 1;
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    return [x, y];
  }

  // ---------- run setup ----------
  function startRun() {
    const d = Save.d, hero = HEROES[d.char], up = d.up;
    const m = hero.mods;
    P = {
      x: 0, y: 0, r: 11, ang: -Math.PI / 2, col: hero.color,
      maxHp: Math.round(100 * (1 + up.hp * 0.1) * (1 + (m.hp || 0))), hp: 0,
      spd: 150 * (1 + up.spd * 0.03) * (1 + (m.spd || 0)),
      dmgMul: (1 + up.dmg * 0.06) * (1 + (m.dmg || 0)), xpMul: 1 + (m.xp || 0),
      magnet: 90 * (1 + up.mag * 0.12), regen: up.reg * 0.25,
      armor: 0, rateMul: 1, inv: 0, lvl: 1, xp: 0, xpNeed: 4,
      w: {}, p: {}, hitFlash: 0,
    };
    P.hp = P.maxHp;
    P.w[hero.weapon] = { lv: 1, cd: 0.3 };
    enemies = []; bullets = []; ebullets = []; gems = []; picks = []; parts = []; texts = []; fx = [];
    Object.assign(G, {
      state: 'play', t: 0, kills: 0, coins: 0, bosses: 0, spawnT: 0, hordeT: 40, bossT: 90, bossN: 0, boss: null,
      revived: false, pending: 0, choices: null, combo: 0, comboT: 0, tipT: Save.d.tutorial ? 0 : 5,
      freeRevive: up.rev > 0,
    });
    cam.x = 0; cam.y = 0; shake = 0; flash = 0; input.touch = null;
    UI.showHud(true); Sfx.refresh();
    Track.ev('run_start', { hero: d.char });
  }

  // ---------- derived weapon stats ----------
  const dmgMul = () => P.dmgMul * (1 + 0.15 * (P.p.might || 0));
  const rateMul = () => P.rateMul * (1 + 0.12 * (P.p.haste || 0));

  // ---------- spatial grid ----------
  function buildGrid() {
    grid.clear();
    for (const e of enemies) { if (e.dead) continue; const k = gk(Math.floor(e.x / GC), Math.floor(e.y / GC)); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(e); }
  }
  function nearby(x, y, r) {
    tmp.length = 0;
    const x0 = Math.floor((x - r) / GC), x1 = Math.floor((x + r) / GC), y0 = Math.floor((y - r) / GC), y1 = Math.floor((y + r) / GC);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) { const a = grid.get(gk(cx, cy)); if (a) for (let i = 0; i < a.length; i++) tmp.push(a[i]); }
    return tmp;
  }
  function nearest(x, y, range, skip) {
    let best = null, bd = range * range;
    for (const e of enemies) { if (e.dead || (skip && skip.includes(e))) continue; const d = (e.x - x) ** 2 + (e.y - y) ** 2; if (d < bd) { bd = d; best = e; } }
    return best;
  }

  // ---------- effects ----------
  function burst(x, y, col, n, sp = 120, life = 0.5, size = 3) {
    for (let i = 0; i < n && parts.length < 450; i++) { const a = rnd(0, TAU), s = rnd(sp * 0.3, sp); parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * rnd(0.6, 1), max: life, size: rnd(size * 0.5, size), col }); }
  }
  function text(x, y, txt, col = '#fff', big = false) { if (texts.length < 36) texts.push({ x, y, txt, col, life: 0.7, big }); }
  function addShake(v) { shake = Math.min(14, Math.max(shake, v)); }

  // ---------- enemies ----------
  const hs = () => 1 + G.t / 45 * 0.3 + (G.t / 60) ** 2 * 0.05;
  function spawnEnemy(type, x, y) {
    const d = ENEMIES[type];
    const hp = d.hp * hs() * (type === 'boss' ? 1 + G.bossN * 0.8 : 1);
    const e = { type, x, y, r: d.r, hp, max: hp, sp: d.sp * (1 + Math.min(0.5, G.t / 600)) * rnd(0.92, 1.08), dmg: d.dmg * (1 + G.t / 400), col: d.col, shape: d.shape,
      kx: 0, ky: 0, flash: 0, ot: 0, shootT: rnd(1, 2.5), dead: false, t: rnd(0, 6), phase: 0, pt: 3 };
    if (type === 'mini') e.sp *= 1;
    enemies.push(e); return e;
  }
  function spawnRing(type, n, dist) { for (let i = 0; i < n; i++) { const a = i * TAU / n; spawnEnemy(type, P.x + Math.cos(a) * dist, P.y + Math.sin(a) * dist); } }
  function pickType() {
    let tot = 0; const av = [];
    for (const k in ENEMIES) { const d = ENEMIES[k]; if (d.w > 0 && G.t >= d.from) { av.push(k); tot += d.w; } }
    let r = Math.random() * tot; for (const k of av) { r -= ENEMIES[k].w; if (r <= 0) return k; } return 'grunt';
  }
  function spawnLogic(dt) {
    G.spawnT -= dt;
    const target = Math.min(240, 10 + G.t * 0.55);
    if (G.spawnT <= 0 && enemies.length < target) {
      G.spawnT = 0.28;
      const n = 1 + Math.floor(G.t / 70);
      for (let i = 0; i < n; i++) {
        const a = rnd(0, TAU), d = Math.hypot(W, H) / Z / 2 + 40;
        spawnEnemy(pickType(), P.x + Math.cos(a) * d, P.y + Math.sin(a) * d);
      }
    }
    G.hordeT -= dt;
    if (G.hordeT <= 0) { G.hordeT = 38; spawnRing(G.t > 100 ? 'runner' : 'grunt', 22 + Math.floor(G.t / 15), Math.hypot(W, H) / Z / 2 + 60); UI.banner('⚠ SWARM INCOMING'); Sfx.play('boss'); }
    G.bossT -= dt;
    if (G.bossT <= 0) {
      G.bossT = 90; const a = rnd(0, TAU);
      G.boss = spawnEnemy('boss', P.x + Math.cos(a) * 320, P.y + Math.sin(a) * 320); G.bossN++;
      UI.banner('☠ BOSS APPROACHING'); Sfx.play('boss'); addShake(8);
    }
  }
  function hurtEnemy(e, dmg, kx = 0, ky = 0) {
    if (e.dead) return;
    e.hp -= dmg; e.flash = 0.08; e.kx += kx; e.ky += ky;
    if (dmg >= 1) text(e.x, e.y - e.r, Math.round(dmg), '#fff');
    Sfx.play('hit');
    if (e.hp <= 0) killEnemy(e);
  }
  function killEnemy(e) {
    e.dead = true; G.kills++; G.combo++; G.comboT = 1.2;
    const d = ENEMIES[e.type];
    burst(e.x, e.y, e.col, e.type === 'boss' ? 40 : 7, e.type === 'boss' ? 260 : 120, 0.5, 3);
    Sfx.play('kill');
    gems.push({ x: e.x, y: e.y, v: d.xp, att: false, vx: rnd(-30, 30), vy: rnd(-30, 30) });
    const r = Math.random();
    if (r < 0.035) picks.push({ x: e.x + 6, y: e.y, k: 'coin', v: 1 });
    else if (r < 0.042) picks.push({ x: e.x, y: e.y, k: 'heal' });
    else if (r < 0.0445) picks.push({ x: e.x, y: e.y, k: 'magnet' });
    if (e.type === 'splitter') { for (let i = 0; i < 2; i++) spawnEnemy('mini', e.x + rnd(-8, 8), e.y + rnd(-8, 8)); }
    if (e.type === 'boss') {
      G.bosses++; G.boss = null; ebullets.length = 0; addShake(12); flash = 0.5; Sfx.play('boom');
      picks.push({ x: e.x, y: e.y, k: 'chest' });
      for (let i = 0; i < 12; i++) picks.push({ x: e.x + rnd(-40, 40), y: e.y + rnd(-40, 40), k: 'coin', v: 3 });
      UI.banner('BOSS DEFEATED!');
    }
  }
  function damagePlayer(n) {
    if (P.inv > 0 || G.state !== 'play') return;
    n = Math.max(1, Math.round(n - P.armor));
    P.hp -= n; P.inv = 0.45; P.hitFlash = 0.25; addShake(6); Sfx.play('hurt'); Haptic(30);
    text(P.x, P.y - 16, '-' + n, '#f44', true);
    if (P.hp <= 0) die();
  }
  function die() {
    P.hp = 0; G.state = 'dead'; Sfx.play('lose'); Haptic([60, 40, 120]);
    burst(P.x, P.y, P.col, 50, 260, 0.9, 4); addShake(14);
    setTimeout(() => finishRun(), 700);
  }
  function summary() {
    const d = Save.d, base = G.coins + G.kills * 0.15 + G.t * 0.5;
    return { time: Math.floor(G.t), kills: G.kills, level: P.lvl, coins: Math.floor(base * (1 + d.up.coin * 0.08)), picked: G.coins, bosses: G.bosses, canRevive: !G.revived };
  }
  function finishRun() {
    const s = summary();
    if (G.freeRevive && !G.revived) { G.freeRevive = false; revive(true); UI.banner('✨ SECOND WIND'); return; }
    UI.showHud(false); UI.gameOver(s);
  }
  // Called once when the player leaves the results screen (so revive can't double-count).
  function commit(s, bonus) {
    const d = Save.d;
    d.runs++; d.totalKills += s.kills; d.coins += s.coins + (bonus || 0);
    s.newBest = s.time > d.bestTime; d.bestTime = Math.max(d.bestTime, s.time);
    d.bestKills = Math.max(d.bestKills, s.kills); d.bestLevel = Math.max(d.bestLevel, s.level);
    d.tutorial = true; Save.save(); Track.ev('run_end', { t: s.time, kills: s.kills });
    Missions.record(s);
  }
  function revive(silent) {
    P.hp = Math.round(P.maxHp * 0.6); P.inv = 2.5; G.state = 'play'; G.revived = true;
    buildGrid();
    for (const e of enemies) { if (e.dead) continue; const dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy) || 1; if (d < 320) { if (e.type === 'boss') hurtEnemy(e, e.max * 0.1); else killEnemy(e); } }
    ebullets.length = 0; fx.push({ k: 'ring', x: P.x, y: P.y, r: 10, max: 320, life: 0.5, t: 0.5, col: '#fff' });
    Sfx.play('revive'); UI.showHud(true);
  }

  // ---------- leveling ----------
  function addXp(v) {
    P.xp += v * P.xpMul;
    while (P.xp >= P.xpNeed) { P.xp -= P.xpNeed; P.lvl++; P.xpNeed = Math.round(4 + P.lvl * 3.2 + P.lvl * P.lvl * 0.3); G.pending++; }
    if (G.pending > 0 && G.state === 'play') openLevelUp();
  }
  function buildChoices() {
    const pool = [];
    const wOwned = Object.keys(P.w).length, pOwned = Object.keys(P.p).length;
    for (const k in WEAPONS) { const w = P.w[k]; if (w && w.lv < 5) pool.push({ kind: 'w', id: k, lv: w.lv + 1, wt: 3 }); else if (!w && wOwned < 5) pool.push({ kind: 'w', id: k, lv: 1, wt: 2 }); }
    for (const k in PASSIVES) { const l = P.p[k] || 0; if (l < 5 && (l > 0 || pOwned < 5)) pool.push({ kind: 'p', id: k, lv: l + 1, wt: l ? 2 : 1.5 }); }
    const out = [];
    while (out.length < 3 && pool.length) {
      let tot = pool.reduce((s, c) => s + c.wt, 0), r = Math.random() * tot, i = 0;
      for (; i < pool.length; i++) { r -= pool[i].wt; if (r <= 0) break; }
      out.push(pool.splice(Math.min(i, pool.length - 1), 1)[0]);
    }
    while (out.length < 3) out.push(out.length % 2 ? { kind: 'x', id: 'coins', lv: 0 } : { kind: 'x', id: 'heal', lv: 0 });
    return out;
  }
  function openLevelUp() {
    G.state = 'levelup'; G.pending--; G.choices = buildChoices();
    Sfx.play('levelup'); Haptic(25); UI.levelUp(G.choices);
  }
  function applyChoice(c) {
    if (c.kind === 'w') { if (P.w[c.id]) P.w[c.id].lv = c.lv; else P.w[c.id] = { lv: 1, cd: 0.2 }; }
    else if (c.kind === 'p') {
      P.p[c.id] = c.lv;
      if (c.id === 'vital') { P.maxHp += 25; P.hp = Math.min(P.maxHp, P.hp + 25); }
      if (c.id === 'swift') P.spd *= 1.08 / 1;
      if (c.id === 'magnet') P.magnet *= 1.35;
      if (c.id === 'armor') P.armor += 1;
      if (c.id === 'regen') P.regen += 0.6;
    } else if (c.id === 'heal') P.hp = Math.min(P.maxHp, P.hp + P.maxHp * 0.3);
    else if (c.id === 'coins') G.coins += 50;
  }

  // ---------- weapons ----------
  function fireBullet(x, y, a, spd, dmg, life, pierce, kind) {
    bullets.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, dmg, life, pierce, r: kind === 'missile' ? 5 : 4, kind, hit: [], a, tgt: null });
  }
  function explode(x, y, r, dmg) {
    fx.push({ k: 'ring', x, y, r: 6, max: r, life: 0.3, t: 0.3, col: '#ff8833' });
    burst(x, y, '#ff8833', 14, 180, 0.4, 3); Sfx.play('boom'); addShake(3);
    for (const e of nearby(x, y, r + 20).slice()) { if (e.dead) continue; const d = Math.hypot(e.x - x, e.y - y); if (d < r + e.r) hurtEnemy(e, dmg, (e.x - x) / (d || 1) * 60, (e.y - y) / (d || 1) * 60); }
  }
  function updateWeapons(dt) {
    const dm = dmgMul(), rm = rateMul();
    for (const k in P.w) {
      const w = P.w[k], L = w.lv;
      if (k === 'orbit') { updateOrbit(w, dt, dm); continue; }
      w.cd -= dt * rm; if (w.cd > 0) continue;
      if (k === 'blaster') {
        const t = nearest(P.x, P.y, 380); if (!t) { w.cd = 0.1; continue; }
        const n = [1, 1, 2, 2, 3][L - 1], base = Math.atan2(t.y - P.y, t.x - P.x);
        for (let i = 0; i < n; i++) fireBullet(P.x, P.y, base + (i - (n - 1) / 2) * 0.16, 430, 10 * (1 + 0.25 * (L >= 5 ? 3 : L - 1) ) * dm, 1.1, L >= 4 ? 1 : 0, 'b');
        P.ang = base; w.cd = 0.55 * (1 - 0.05 * (L - 1)); Sfx.play('shoot');
      } else if (k === 'lightning') {
        const n = [2, 2, 3, 3, 4][L - 1], dmg = (14 + 5 * L) * dm * (L >= 4 ? 1.3 : 1), got = [];
        let fx0 = P.x, fy0 = P.y;
        for (let i = 0; i < n; i++) { const t = nearest(fx0, fy0, 260, got); if (!t) break; got.push(t); fx.push({ k: 'bolt', x: fx0, y: fy0, x2: t.x, y2: t.y, life: 0.16, t: 0.16 }); hurtEnemy(t, dmg); fx0 = t.x; fy0 = t.y; }
        w.cd = got.length ? 1.5 - 0.15 * (L - 1) - (L >= 2 ? 0.15 : 0) : 0.15; if (got.length) Sfx.play('zap');
      } else if (k === 'missile') {
        const n = [1, 1, 2, 2, 3][L - 1];
        if (!nearest(P.x, P.y, 420)) { w.cd = 0.15; continue; }
        for (let i = 0; i < n; i++) { const a = rnd(0, TAU); fireBullet(P.x, P.y, a, 200, (24 + 7 * L) * dm, 2.4, 99, 'missile'); }
        w.cd = 2.3 - 0.15 * (L - 1) - (L >= 4 ? 0.3 : 0); Sfx.play('shoot');
      } else if (k === 'pulse') {
        const R = 85 + 14 * L + (L >= 5 ? 30 : 0), dmg = (13 + 6 * L) * dm;
        fx.push({ k: 'ring', x: P.x, y: P.y, r: 10, max: R, life: 0.35, t: 0.35, col: P.col });
        for (const e of nearby(P.x, P.y, R + 20).slice()) { if (e.dead) continue; const dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy) || 1; if (d < R + e.r) hurtEnemy(e, dmg, dx / d * 160, dy / d * 160); }
        w.cd = 3.3 - 0.3 * (L - 1) - (L >= 3 ? 0.3 : 0); Sfx.play('boom'); addShake(2);
      }
    }
  }
  let orbitBlades = [];
  function updateOrbit(w, dt, dm) {
    const L = w.lv, n = [2, 2, 3, 4, 5][L - 1], R = 52 + (L >= 3 ? 10 : 0) + (L >= 5 ? 8 : 0), spd = 2.6 + (L >= 4 ? 1 : 0) + (rateMul() - 1) * 2;
    w.a = (w.a || 0) + dt * spd; orbitBlades.length = 0;
    const dmg = (8 + 3 * L) * dm;
    for (let i = 0; i < n; i++) {
      const a = w.a + i * TAU / n, bx = P.x + Math.cos(a) * R, by = P.y + Math.sin(a) * R; orbitBlades.push([bx, by, a]);
      for (const e of nearby(bx, by, 24)) { if (e.dead || e.ot > G.t) continue; if (Math.hypot(e.x - bx, e.y - by) < e.r + 9) { e.ot = G.t + 0.35; hurtEnemy(e, dmg, Math.cos(a + 1.57) * 40, Math.sin(a + 1.57) * 40); } }
    }
  }

  // ---------- update ----------
  function update(dt) {
    G.t += dt;
    if (G.comboT > 0) { G.comboT -= dt; if (G.comboT <= 0) G.combo = 0; }
    const [mx, my] = moveVec();
    P.x += mx * P.spd * dt; P.y += my * P.spd * dt;
    if (mx || my) P.ang = Math.atan2(my, mx);
    if (P.inv > 0) P.inv -= dt; if (P.hitFlash > 0) P.hitFlash -= dt;
    if (P.regen > 0) P.hp = Math.min(P.maxHp, P.hp + P.regen * dt);
    spawnLogic(dt); buildGrid(); orbitBlades.length = 0;

    // enemies
    for (const e of enemies) {
      if (e.dead) continue;
      e.t += dt; if (e.flash > 0) e.flash -= dt;
      const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy) || 1, nx = dx / d, ny = dy / d;
      let vx = nx * e.sp, vy = ny * e.sp;
      if (e.type === 'shooter') {
        if (d < 170) { vx = -nx * e.sp; vy = -ny * e.sp; } else if (d < 230) { vx = -ny * e.sp * 0.6; vy = nx * e.sp * 0.6; }
        e.shootT -= dt; if (e.shootT <= 0 && d < 330) { e.shootT = 2.2; ebullets.push({ x: e.x, y: e.y, vx: nx * 130, vy: ny * 130, life: 4, dmg: e.dmg, r: 5 }); }
      } else if (e.type === 'boss') {
        e.pt -= dt;
        if (e.phase === 1) { vx = e.dx * 280; vy = e.dy * 280; if (e.pt <= 0) { e.phase = 0; e.pt = 3; } }
        else if (e.pt <= 0) {
          if (Math.random() < 0.5) { e.phase = 1; e.pt = 0.7; e.dx = nx; e.dy = ny; }
          else { const n = 12 + G.bossN * 2; for (let i = 0; i < n; i++) { const a = i * TAU / n + e.t; ebullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, life: 5, dmg: 10, r: 5 }); } e.pt = 2.6; Sfx.play('zap'); }
        }
      }
      e.x += (vx + e.kx) * dt; e.y += (vy + e.ky) * dt;
      e.kx *= Math.pow(0.02, dt); e.ky *= Math.pow(0.02, dt);
      // soft separation
      if (e.type !== 'boss') for (const o of nearby(e.x, e.y, e.r * 2)) {
        if (o === e || o.dead) continue; const ox = e.x - o.x, oy = e.y - o.y, md = (e.r + o.r) * 0.85, dd2 = ox * ox + oy * oy;
        if (dd2 < md * md && dd2 > 0.01) { const dd = Math.sqrt(dd2), push = (md - dd) / md * 90 * dt; e.x += ox / dd * push; e.y += oy / dd * push; }
      }
      if (d < e.r + P.r) damagePlayer(e.dmg);
    }

    updateWeapons(dt);

    // player bullets
    for (const b of bullets) {
      if (b.kind === 'missile') {
        if (!b.tgt || b.tgt.dead) b.tgt = nearest(b.x, b.y, 500);
        if (b.tgt) { const want = Math.atan2(b.tgt.y - b.y, b.tgt.x - b.x); let da = want - b.a; da = Math.atan2(Math.sin(da), Math.cos(da)); b.a += clamp(da, -5 * dt, 5 * dt); }
        const sp = Math.min(380, Math.hypot(b.vx, b.vy) + 250 * dt); b.vx = Math.cos(b.a) * sp; b.vy = Math.sin(b.a) * sp;
      }
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      let hit = false;
      for (const e of nearby(b.x, b.y, 24)) {
        if (e.dead || b.hit.includes(e)) continue;
        if (Math.hypot(e.x - b.x, e.y - b.y) < e.r + b.r) {
          if (b.kind === 'missile') { hit = true; break; }
          hurtEnemy(e, b.dmg, b.vx * 0.05, b.vy * 0.05); b.hit.push(e); burst(b.x, b.y, '#8ef', 2, 80, 0.2, 2);
          if (b.pierce-- <= 0) { b.life = 0; break; }
        }
      }
      if (b.kind === 'missile' && (hit || b.life <= 0)) { explode(b.x, b.y, 50 + 7 * (P.w.missile ? P.w.missile.lv : 1), b.dmg); b.life = 0; }
    }
    // enemy bullets
    for (const b of ebullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (Math.hypot(b.x - P.x, b.y - P.y) < b.r + P.r) { damagePlayer(b.dmg); b.life = 0; }
    }
    // gems & pickups
    const mr = P.magnet;
    for (const g of gems) {
      const dx = P.x - g.x, dy = P.y - g.y, d = Math.hypot(dx, dy) || 1;
      if (!g.att && (d < mr || G.vac)) g.att = true;
      if (g.att) { const sp = 260 + (G.vac ? 400 : 0) + Math.max(0, 140 - d); g.x += dx / d * sp * dt; g.y += dy / d * sp * dt; }
      else { g.x += (g.vx || 0) * dt; g.y += (g.vy || 0) * dt; g.vx *= 0.9; g.vy *= 0.9; }
      if (d < P.r + 6) { g.got = true; addXp(g.v); Sfx.play('gem', Math.min(G.combo, 8) % 8); }
    }
    for (const p of picks) {
      const dx = P.x - p.x, dy = P.y - p.y, d = Math.hypot(dx, dy) || 1;
      if (d < mr * 0.7 || G.vac || p.k === 'coin' && d < mr) { p.x += dx / d * 260 * dt; p.y += dy / d * 260 * dt; }
      if (d < P.r + 10) {
        p.got = true;
        if (p.k === 'coin') { G.coins += p.v; Sfx.play('coin'); }
        else if (p.k === 'heal') { P.hp = Math.min(P.maxHp, P.hp + P.maxHp * 0.25); text(P.x, P.y - 20, '+HP', '#4f8', true); Sfx.play('revive'); }
        else if (p.k === 'magnet') { G.vac = 1.2; text(P.x, P.y - 20, 'MAGNET!', '#4cf', true); Sfx.play('gem', 5); }
        else if (p.k === 'chest') { G.coins += 40; Save.d.gems += 1; Sfx.play('win'); Haptic(40); UI.chest(); }
      }
    }
    if (G.vac) { G.vac -= dt; if (G.vac <= 0) G.vac = 0; }
    // fx
    for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy *= 0.94; p.life -= dt; }
    for (const t of texts) { t.y -= 30 * dt; t.life -= dt; }
    for (const f of fx) f.t -= dt;
    // cleanup
    enemies = enemies.filter(e => !e.dead && Math.hypot(e.x - P.x, e.y - P.y) < 1100 || (!e.dead && e.type === 'boss'));
    bullets = bullets.filter(b => b.life > 0); ebullets = ebullets.filter(b => b.life > 0);
    gems = gems.filter(g => !g.got); picks = picks.filter(p => !p.got);
    parts = parts.filter(p => p.life > 0); texts = texts.filter(t => t.life > 0); fx = fx.filter(f => f.t > 0);
    if (G.vac === undefined) G.vac = 0;
    if (G.tipT > 0) G.tipT -= dt;
    UI.hud(P, G);
  }

  // ---------- render ----------
  function drawBg(cx, cy) {
    ctx.fillStyle = '#07061a'; ctx.fillRect(0, 0, W / Z, H / Z);
    const s = 80, ox = -((cx % s) + s) % s, oy = -((cy % s) + s) % s;
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(90,70,255,0.13)'; ctx.beginPath();
    for (let x = ox; x < W / Z + s; x += s) { ctx.moveTo(x, 0); ctx.lineTo(x, H / Z); }
    for (let y = oy; y < H / Z + s; y += s) { ctx.moveTo(0, y); ctx.lineTo(W / Z, y); }
    ctx.stroke();
    ctx.fillStyle = 'rgba(180,200,255,0.5)';
    for (let i = 0; i < 40; i++) { const px = ((i * 137.5 - cx * 0.3) % (W / Z) + W / Z) % (W / Z), py = ((i * 91.3 - cy * 0.3) % (H / Z) + H / Z) % (H / Z); ctx.fillRect(px, py, 1.5, 1.5); }
  }
  function drawShip(x, y, a, col, r, inv) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(glow(col, 40), -40, -40); ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = inv ? 0.5 + 0.5 * Math.sin(G.t * 40) : 1;
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(r * 1.3, 0); ctx.lineTo(-r, r * 0.9); ctx.lineTo(-r * 0.5, 0); ctx.lineTo(-r, -r * 0.9); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function render() {
    ctx.setTransform(DPR * Z, 0, 0, DPR * Z, 0, 0);
    const playing = G.state !== 'menu';
    const sx = shake ? rnd(-shake, shake) : 0, sy = shake ? rnd(-shake, shake) : 0;
    const cx = playing ? cam.x : menuT * 25, cy = playing ? cam.y : menuT * 12;
    drawBg(cx, cy);
    if (!playing) { return; }
    ctx.save(); ctx.translate(W / Z / 2 - cam.x + sx, H / Z / 2 - cam.y + sy);
    const vx0 = cam.x - W / Z / 2 - 60, vx1 = cam.x + W / Z / 2 + 60, vy0 = cam.y - H / Z / 2 - 60, vy1 = cam.y + H / Z / 2 + 60;
    const vis = (x, y) => x > vx0 && x < vx1 && y > vy0 && y < vy1;
    // gems
    for (const g of gems) { if (!vis(g.x, g.y)) continue; const c = g.v >= 20 ? '#ff66ff' : g.v >= 3 ? '#66ff99' : '#55bbff'; ctx.fillStyle = c; poly(g.x, g.y, 4 + Math.min(g.v, 8) * 0.3, 4, G.t * 3); ctx.fill(); }
    ctx.globalCompositeOperation = 'lighter';
    for (const g of gems) { if (vis(g.x, g.y)) ctx.drawImage(glow('#55bbff', 10), g.x - 10, g.y - 10); }
    ctx.globalCompositeOperation = 'source-over';
    for (const p of picks) {
      if (!vis(p.x, p.y)) continue;
      const bob = Math.sin(G.t * 6) * 2;
      if (p.k === 'coin') { ctx.fillStyle = '#ffd23c'; ctx.beginPath(); ctx.arc(p.x, p.y + bob, 6, 0, TAU); ctx.fill(); ctx.fillStyle = '#b8860b'; ctx.fillRect(p.x - 1, p.y + bob - 3, 2, 6); }
      else { ctx.font = '18px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(p.k === 'heal' ? '💚' : p.k === 'magnet' ? '🧲' : '🎁', p.x, p.y + 6 + bob); }
    }
    // enemies
    for (const e of enemies) {
      if (!vis(e.x, e.y)) continue;
      ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(glow(e.col, 24), e.x - 24 * (e.r / 12 + 0.3), e.y - 24 * (e.r / 12 + 0.3), 48 * (e.r / 12 + 0.3), 48 * (e.r / 12 + 0.3)); ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = e.flash > 0 ? '#fff' : e.col; poly(e.x, e.y, e.r, e.shape, e.t * (e.type === 'boss' ? 1 : 2)); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; poly(e.x, e.y, e.r * 0.5, e.shape, e.t * (e.type === 'boss' ? 1 : 2)); ctx.fill();
    }
    // bullets
    ctx.globalCompositeOperation = 'lighter';
    for (const b of bullets) { if (!vis(b.x, b.y)) continue; ctx.drawImage(glow(b.kind === 'missile' ? '#ff9933' : '#66eeff', 14), b.x - 14, b.y - 14); }
    for (const b of ebullets) ctx.drawImage(glow('#ff3366', 14), b.x - 14, b.y - 14);
    ctx.globalCompositeOperation = 'source-over';
    for (const b of bullets) { if (!vis(b.x, b.y)) continue; ctx.fillStyle = b.kind === 'missile' ? '#ffd' : '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.7, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#ff6688'; for (const b of ebullets) { ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill(); }
    // orbit blades
    for (const o of orbitBlades) { ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(glow('#ff44aa', 24), o[0] - 24, o[1] - 24); ctx.globalCompositeOperation = 'source-over'; ctx.save(); ctx.translate(o[0], o[1]); ctx.rotate(o[2] * 4); ctx.fillStyle = '#ffd0ee'; poly(0, 0, 9, 3, 0); ctx.fill(); ctx.restore(); }
    // fx
    for (const f of fx) {
      const k = 1 - f.t / f.life;
      if (f.k === 'ring') { ctx.strokeStyle = f.col; ctx.globalAlpha = 1 - k; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(f.x, f.y, f.r + (f.max - f.r) * k, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
      else if (f.k === 'bolt') { ctx.strokeStyle = '#ffee66'; ctx.lineWidth = 3; ctx.globalAlpha = f.t / f.life; ctx.beginPath(); ctx.moveTo(f.x, f.y); const n = 5; for (let i = 1; i < n; i++) { const t = i / n; ctx.lineTo(f.x + (f.x2 - f.x) * t + rnd(-8, 8), f.y + (f.y2 - f.y) * t + rnd(-8, 8)); } ctx.lineTo(f.x2, f.y2); ctx.stroke(); ctx.globalAlpha = 1; }
    }
    // player
    if (G.state !== 'dead') {
      drawShip(P.x, P.y, P.ang, P.hitFlash > 0 ? '#ff4444' : P.col, P.r, P.inv > 0);
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(P.x - 14, P.y + 17, 28, 4); ctx.fillStyle = P.hp / P.maxHp > 0.35 ? '#4f8' : '#f44'; ctx.fillRect(P.x - 14, P.y + 17, 28 * clamp(P.hp / P.maxHp, 0, 1), 4);
    }
    // particles
    ctx.globalCompositeOperation = 'lighter';
    for (const p of parts) { ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.col; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.textAlign = 'center';
    for (const t of texts) { ctx.globalAlpha = clamp(t.life * 2, 0, 1); ctx.fillStyle = t.col; ctx.font = (t.big ? 'bold 15px' : 'bold 11px') + ' sans-serif'; ctx.fillText(t.txt, t.x, t.y); }
    ctx.globalAlpha = 1;
    ctx.restore();
    // screen-space: joystick, damage vignette, tip
    if (input.touch && G.state === 'play') {
      const t = input.touch, a = Math.atan2(t.y - t.oy, t.x - t.ox), d = Math.min(55, Math.hypot(t.x - t.ox, t.y - t.oy));
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(t.ox / Z, t.oy / Z, 55 / 1, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc((t.ox + Math.cos(a) * d) / Z, (t.oy + Math.sin(a) * d) / Z, 22, 0, TAU); ctx.fill();
    }
    if (P && P.hitFlash > 0) { ctx.fillStyle = `rgba(255,0,40,${P.hitFlash * 0.8})`; ctx.fillRect(0, 0, W / Z, H / Z); }
    if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash})`; ctx.fillRect(0, 0, W / Z, H / Z); }
    if (G.tipT > 0 && G.state === 'play') { ctx.globalAlpha = Math.min(1, G.tipT); ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('👆 Drag anywhere to move — you auto-fire!', W / Z / 2, H / Z * 0.72); ctx.globalAlpha = 1; }
  }

  // ---------- main loop ----------
  let last = performance.now(), acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (G.state === 'menu') menuT += dt;
    if (G.state === 'play' || G.state === 'dead') {
      if (G.state === 'dead') { dt *= 0.4; G.t += 0; }
      if (G.state === 'play') update(dt);
      else { for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; } parts = parts.filter(p => p.life > 0); }
      cam.x += (P.x - cam.x) * Math.min(1, dt * 8); cam.y += (P.y - cam.y) * Math.min(1, dt * 8);
      shake = Math.max(0, shake - dt * 30); if (flash > 0) flash = Math.max(0, flash - dt * 1.5);
    }
    render();
  }
  requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'play') Game.pause(); });

  return {
    G, get P() { return P; }, dbg() { return { P, enemies, gems }; },
    start() { Sfx.init(); startRun(); },
    pause() { if (G.state === 'play') { G.state = 'paused'; input.touch = null; UI.pause(true); } },
    resume() { if (G.state === 'paused') { G.state = 'play'; UI.pause(false); } },
    togglePause() { G.state === 'play' ? Game.pause() : G.state === 'paused' && Game.resume(); },
    pick(i) { applyChoice(G.choices[i]); G.choices = null; G.state = 'play'; if (G.pending > 0) openLevelUp(); else UI.hideLevelUp(); },
    reroll() { G.choices = buildChoices(); UI.levelUp(G.choices); },
    summary, commit, revive() { revive(); }, quit() { G.state = 'menu'; UI.showHud(false); },
    addCoins(n) { G.coins += n; },
    toMenu() { G.state = 'menu'; UI.showHud(false); },
  };
})();
