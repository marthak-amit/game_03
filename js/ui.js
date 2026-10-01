// ============================================================
//  UI: menus, HUD, modals, daily rewards, missions, shop
// ============================================================
const $ = id => document.getElementById(id);
const fmt = n => n >= 10000 ? (n / 1000).toFixed(1).replace('.0', '') + 'k' : String(Math.floor(n));
const mmss = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
const shipSvg = col => `<svg class="ship" viewBox="-30 -30 60 60"><defs><filter id="gl${col.slice(1)}"><feGaussianBlur stdDeviation="3"/></filter></defs><path d="M22 0L-16 15L-8 0L-16-15Z" fill="${col}" filter="url(#gl${col.slice(1)})" opacity=".8"/><path d="M22 0L-16 15L-8 0L-16-15Z" fill="${col}"/><circle r="4" fill="#fff"/></svg>`;

// ---------- Daily missions ----------
const Missions = (() => {
  const seeded = (s) => () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  function ensure() {
    const m = Save.d.missions, t = Save.today();
    if (m.date === t) return m.list;
    let seed = 0; for (const c of t) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
    const r = seeded(seed), pool = MISSION_POOL.slice(), list = [];
    for (let i = 0; i < 3; i++) {
      const def = pool.splice(Math.floor(r() * pool.length), 1)[0], ti = Math.floor(r() * def.targets.length);
      list.push({ id: def.id, target: def.targets[ti], p: 0, done: false, claimed: false, rc: 150 + ti * 120, rg: i === 2 ? 2 + ti : 0 });
    }
    m.date = t; m.list = list; Save.save(); return list;
  }
  function record(s) {
    for (const m of ensure()) {
      const def = MISSION_POOL.find(x => x.id === m.id);
      const v = { kills: s.kills, time: s.time, boss: s.bosses, coins: s.picked, level: s.level, runs: 1 }[def.stat];
      m.p = def.sum ? m.p + v : Math.max(m.p, v);
      if (m.p >= m.target) m.done = true;
    }
    Save.save();
  }
  const ready = () => ensure().some(m => m.done && !m.claimed);
  return { ensure, record, ready };
})();

// ---------- Daily login / spin helpers ----------
const Daily = {
  yesterday() { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); },
  canClaim() { return Save.d.daily.last !== Save.today(); },
  claimedCount() { const d = Save.d.daily; if (this.canClaim()) return d.last === this.yesterday() ? d.streak % 7 : 0; return d.streak % 7 || 7; },
  spinInfo() { const s = Save.d.spin, t = Save.today(); if (s.date !== t) { s.date = t; s.free = true; s.extra = 0; } return s; },
  freeAdsInfo() { const s = Save.d.freeAds, t = Save.today(); if (s.date !== t) { s.date = t; s.n = 0; } return s; },
};
const grant = r => { if (r.c) Save.d.coins += r.c; if (r.g) Save.d.gems += r.g; Save.save(); };
const rewardTxt = r => [r.c ? r.c + '🪙' : '', r.g ? r.g + '💎' : ''].filter(Boolean).join(' ');

const UI = (() => {
  let cur = 'home', spinning = false, goState = null, lastHud = {};
  const scr = $('screen'), modal = $('modal');

  function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 1800); }
  function banner(t) { const b = $('banner'); b.textContent = t; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); }
  const click = () => Sfx.play('click');

  // ---------- HUD ----------
  function showHud(on) { $('hud').classList.toggle('hidden', !on); scr.classList.toggle('hidden', on); lastHud = {}; if (on) Ads.banner(false); }
  function set(id, v, prop = 'textContent') { if (lastHud[id] !== v) { lastHud[id] = v; $(id)[prop] = v; } }
  function hud(P, G) {
    set('hptxt', Math.ceil(P.hp) + '/' + P.maxHp);
    const hp = Math.max(0, P.hp / P.maxHp * 100).toFixed(0) + '%'; if (lastHud.hp !== hp) { lastHud.hp = hp; $('hpfill').style.width = hp; }
    const xp = (P.xp / P.xpNeed * 100).toFixed(0) + '%'; if (lastHud.xp !== xp) { lastHud.xp = xp; $('xpfill').style.width = xp; }
    set('lvl', 'LV ' + P.lvl); set('timer', mmss(G.t)); set('kills', '☠ ' + G.kills); set('coins', '🪙 ' + G.coins);
    const b = G.boss; $('bossbar').classList.toggle('hidden', !b); if (b) $('bossfill').style.width = Math.max(0, b.hp / b.max * 100) + '%';
  }
  $('pausebtn').onclick = () => { click(); Game.pause(); };

  // ---------- modals ----------
  let modalKind = '';
  function openModal(html, kind = '') { modalKind = kind; modal.innerHTML = `<div class="panel">${html}</div>`; modal.classList.add('show'); }
  function closeModal() { clearInterval(lu.iv); modalKind = ''; modal.classList.remove('show'); modal.innerHTML = ''; }

  // ---------- level-up (with countdown: 15 s first time, 10 s afterwards; auto-picks at 0) ----------
  const lu = { t: 0, total: 10, last: 0, paused: false, iv: 0, shown: -1 };
  function luShow() {
    const el = $('lunum'); if (!el) return;
    const n = Math.max(0, Math.ceil(lu.t)); el.textContent = n; $('lufill').style.width = Math.max(0, lu.t / lu.total * 100) + '%';
    $('lutimer').classList.toggle('warn', lu.t <= 4);
  }
  function luTick() {
    const now = performance.now(), dt = Math.min(0.25, (now - lu.last) / 1000); lu.last = now;
    if (lu.paused || document.hidden || $('adlayer').classList.contains('show')) return;
    const before = Math.ceil(lu.t); lu.t -= dt; luShow();
    if (lu.t <= 3.05 && Math.ceil(lu.t) !== before && lu.t > 0) { Sfx.play('tick'); Haptic(10); }
    if (lu.t <= 0) { clearInterval(lu.iv); Game.pickRandom(); }
  }

  function levelUp(choices, secs) {
    const cards = choices.map((c, i) => {
      let ic, nm, ds, lv = '';
      if (c.kind === 'w') { const w = WEAPONS[c.id]; ic = w.icon; nm = w.name; ds = w.desc[c.lv - 1]; lv = c.lv === 1 ? 'NEW' : 'LV ' + c.lv; }
      else if (c.kind === 'p') { const p = PASSIVES[c.id]; ic = p.icon; nm = p.name; ds = p.desc; lv = c.lv === 1 ? 'NEW' : 'LV ' + c.lv; }
      else if (c.id === 'heal') { ic = '💚'; nm = 'Repair Kit'; ds = 'Heal 30% HP'; } else { ic = '🪙'; nm = 'Coin Cache'; ds = '+50 coins this run'; }
      return `<button class="choice" data-i="${i}"><span class="ic">${ic}</span><span><div class="nm">${nm}</div><div class="ds">${ds}</div></span><span class="lv">${lv}</span></button>`;
    }).join('');
    openModal(`<h2>⬆ LEVEL UP!</h2>
      <div class="lutimer" id="lutimer"><div class="lubar"><i id="lufill"></i></div><div class="lunum" id="lunum">${Math.ceil(lu.t)}</div></div>
      ${cards}<button class="btn ad small" id="reroll">📺 Reroll choices</button>`, 'levelup');
    modal.querySelectorAll('.choice').forEach(b => b.onclick = () => { click(); Game.pick(+b.dataset.i); });
    $('reroll').onclick = () => { lu.paused = true; Ads.rewarded('reroll', ok => { lu.paused = false; lu.last = performance.now(); if (ok) Game.reroll(); }); };
    if (secs) { lu.total = lu.t = secs; lu.last = performance.now(); lu.paused = false; clearInterval(lu.iv); lu.iv = setInterval(luTick, 100); }
    luShow();
  }
  const hideLevelUp = closeModal;
  Game.pickWrap = null;
  function pause(on) {
    if (!on) return closeModal();
    openModal(`<h2>PAUSED</h2><div class="col"><button class="btn" id="rs">▶ Resume</button>
      <div class="row2"><button class="btn ghost small" id="snd">${Save.d.settings.sound ? '🔊 Sound on' : '🔇 Sound off'}</button><button class="btn ghost small" id="mus">${Save.d.settings.music ? '🎵 Music on' : '🎵 Music off'}</button></div>
      <button class="btn ghost" id="qt">🏠 Quit run</button></div>`, 'pause');
    $('rs').onclick = () => { click(); Game.resume(); };
    $('snd').onclick = () => { Save.d.settings.sound = !Save.d.settings.sound; Save.save(); pause(true); };
    $('mus').onclick = () => { Save.d.settings.music = !Save.d.settings.music; Save.save(); Sfx.refresh(); pause(true); };
    $('qt').onclick = () => { closeModal(); const s = Game.summary(); Game.G.state = 'dead'; UI.showHud(false); UI.gameOver(s); };
  }
  function chest() { toast('🎁 Chest: +40🪙 +1💎'); }

  function gameOver(s) {
    goState = { s, doubled: false }; scr.classList.add('hidden');
    Sfx.stopMusic();
    const reviveBtns = s.canRevive ? `<div class="row2"><button class="btn ad" id="rvad">📺 Revive</button><button class="btn gold" id="rvgem">💎 ${CONFIG.REVIVE_GEM_COST}</button></div>` : '';
    openModal(`<h2>💀 RUN OVER</h2>
      <div class="stats"><div class="stat"><b>${mmss(s.time)}</b><span>SURVIVED</span></div><div class="stat"><b>${s.kills}</b><span>KILLS</span></div><div class="stat"><b>${s.level}</b><span>LEVEL</span></div><div class="stat"><b>${s.bosses}</b><span>BOSSES</span></div></div>
      ${s.time > Save.d.bestTime ? '<div style="color:var(--g);font-weight:800">🏆 NEW BEST TIME!</div>' : `<div style="opacity:.6;font-size:12px">Best: ${mmss(Save.d.bestTime)}</div>`}
      <div class="earn" id="earn">+${s.coins} 🪙</div>
      <div class="col">${reviveBtns}<button class="btn ad" id="dbl">📺 Double coins ×2</button>
      <div class="row2"><button class="btn ghost" id="home">🏠 Home</button><button class="btn" id="again">▶ Play again</button></div></div>`, 'over');
    if (s.canRevive) {
      $('rvad').onclick = () => Ads.rewarded('revive', ok => { if (ok) doRevive(); });
      $('rvgem').onclick = () => { if (Save.d.gems >= CONFIG.REVIVE_GEM_COST) { Save.d.gems -= CONFIG.REVIVE_GEM_COST; Save.save(); doRevive(); } else { toast('Not enough 💎'); } };
    }
    $('dbl').onclick = () => Ads.rewarded('double_coins', ok => { if (ok) { goState.doubled = true; $('earn').textContent = `+${s.coins * 2} 🪙 ×2!`; $('dbl').disabled = true; Sfx.play('coin'); } });
    const leave = next => { Game.commit(s, goState.doubled ? s.coins : 0); closeModal(); Ads.interstitial(next); };
    $('home').onclick = () => { click(); leave(() => { Game.toMenu(); go('home'); }); };
    $('again').onclick = () => { click(); leave(() => Game.start()); };
  }
  function doRevive() { closeModal(); Game.revive(); }

  // ---------- Screens ----------
  const nav = active => `<div class="nav">${[['home', '🏠', 'Home'], ['up', '⬆️', 'Upgrades'], ['heroes', '🧑‍🚀', 'Heroes'], ['rewards', '🎁', 'Rewards'], ['shop', '🛒', 'Shop']].map(([k, i, n]) =>
    `<button data-go="${k}" class="${k === active ? 'on' : ''}"><b>${i}</b>${n}${k === 'rewards' && (Daily.canClaim() || Missions.ready() || Daily.spinInfo().free) ? '<span class="dot"></span>' : ''}${k === 'shop' && !Save.d.starter ? '<span class="dot"></span>' : ''}</button>`).join('')}</div>`;
  const top = () => `<div class="topbar"><div class="pill">🪙 <span>${fmt(Save.d.coins)}</span></div><div class="pill">💎 <span>${fmt(Save.d.gems)}</span></div><div class="sp"></div><button class="iconbtn" data-go="settings">⚙️</button></div>`;
  function render(html, active) {
    scr.innerHTML = top() + html + nav(active);
    scr.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { click(); go(b.dataset.go); });
  }
  function go(name) {
    cur = name; scr.dataset.view = name; Sfx.refresh(); Ads.banner(name === 'home');
    ({ home, up, heroes, rewards, shop, settings })[name]();
  }

  function home() {
    const d = Save.d, h = HEROES[d.char], ids = Object.keys(HEROES), i = ids.indexOf(d.char);
    render(`<div class="home">
      <div><h1 class="logo">NEON<br>SWARM</h1><div class="sub">SURVIVE THE HORDE</div></div>
      <div class="heropick"><button class="iconbtn" id="pv">◀</button><div class="heroname" style="color:${h.color};min-width:120px">${h.name}</div><button class="iconbtn" id="nx">▶</button></div>
      <div class="herodesc">${h.desc}</div>
      <button class="btn play" id="play">PLAY</button>
      <div style="opacity:.7;font-size:13px">🏆 Best ${mmss(d.bestTime)} · ☠ ${d.bestKills} kills</div>
      ${window.__pwa ? '<button class="btn small ghost" id="inst">📲 Install app</button>' : ''}
    </div>`, 'home');
    const pick = dir => { for (let k = 1; k <= ids.length; k++) { const id = ids[(i + dir * k + ids.length * 2) % ids.length]; if (d.chars.includes(id)) { d.char = id; Save.save(); Game.startDemo(); return home(); } } };
    $('pv').onclick = () => { click(); pick(-1); }; $('nx').onclick = () => { click(); pick(1); };
    $('play').onclick = () => { Sfx.init(); Sfx.play('click'); Sfx.refresh(); Game.start(); };
    if ($('inst')) $('inst').onclick = () => window.__pwa.prompt();
  }

  function up() {
    const d = Save.d;
    render(`<h2>Permanent Upgrades</h2><div class="scroll">${Object.keys(META).map(k => {
      const m = META[k], lv = d.up[k], maxed = lv >= m.max, cost = maxed ? 0 : metaCost(k);
      const pips = m.max <= 10 ? `<div class="pips">${Array.from({ length: m.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div>` : '';
      return `<div class="card"><div class="ic">${m.icon}</div><div class="mid"><div class="nm">${m.name} ${m.max > 1 ? `<small style="opacity:.6">Lv ${lv}/${m.max}</small>` : ''}</div><div class="ds">${m.desc}</div>${pips}</div>
      <button class="btn small ${d.coins >= cost && !maxed ? 'gold' : 'ghost'}" data-up="${k}" ${maxed ? 'disabled' : ''}>${maxed ? 'MAX' : '🪙 ' + fmt(cost)}</button></div>`;
    }).join('')}</div>`, 'up');
    scr.querySelectorAll('[data-up]').forEach(b => b.onclick = () => {
      const k = b.dataset.up, c = metaCost(k);
      if (d.coins < c) { toast('Not enough coins — play or watch an ad!'); return; }
      d.coins -= c; d.up[k]++; Save.save(); Sfx.play('levelup'); up();
    });
  }

  function heroes() {
    const d = Save.d;
    render(`<h2>Heroes</h2><div class="scroll">${Object.keys(HEROES).map(k => {
      const h = HEROES[k], own = d.chars.includes(k), sel = d.char === k;
      return `<div class="card herocard ${sel ? 'sel' : ''}">${shipSvg(h.color)}<div class="mid"><div class="nm" style="color:${h.color}">${h.name}</div><div class="ds">${h.desc}</div></div>
      <button class="btn small ${own ? (sel ? 'ghost' : '') : 'gold'}" data-hero="${k}">${sel ? '✔ Equipped' : own ? 'Equip' : '🪙 ' + fmt(h.cost)}</button></div>`;
    }).join('')}</div>`, 'heroes');
    scr.querySelectorAll('[data-hero]').forEach(b => b.onclick = () => {
      const k = b.dataset.hero, h = HEROES[k];
      if (!d.chars.includes(k)) { if (d.coins < h.cost) return toast('Need ' + fmt(h.cost - d.coins) + ' more coins'); d.coins -= h.cost; d.chars.push(k); Sfx.play('win'); }
      d.char = k; Save.save(); heroes();
    });
  }

  function rewards() {
    const d = Save.d, can = Daily.canClaim(), cc = Daily.claimedCount(), sp = Daily.spinInfo(), fa = Daily.freeAdsInfo(), ms = Missions.ensure();
    const spinsLeft = (sp.free ? 1 : 0), extraLeft = CONFIG.REWARDED_DAILY_CAP_SPIN - sp.extra;
    render(`<h2>Rewards</h2><div class="scroll">
      <h3>📅 DAILY LOGIN</h3>
      <div class="days">${DAILY_REWARDS.map((r, i) => `<div class="day ${i < cc ? 'done' : ''} ${can && i === cc ? 'now' : ''}">Day ${i + 1}<b>${r.g && !r.c ? '💎' : '🪙'}</b>${r.c && r.g ? r.c + '+' + r.g + '💎' : r.c || r.g}</div>`).join('')}</div>
      <div class="row2" style="margin-top:10px"><button class="btn gold small" id="dl" ${can ? '' : 'disabled'}>${can ? 'Claim' : 'Claimed ✔'}</button>${can ? '<button class="btn ad small" id="dl2">📺 Claim ×2</button>' : ''}</div>
      <h3>🎡 LUCKY SPIN</h3>
      <div class="wheelwrap"><div class="pointer"></div><div class="wheel" id="wheel" style="background:conic-gradient(${WHEEL.map((w, i) => `${w.col} ${i * 45}deg ${(i + 1) * 45}deg`).join(',')})">
        ${WHEEL.map((w, i) => `<span style="transform:rotate(${i * 45 + 22.5}deg) translateY(-84px)">${w.l}</span>`).join('')}</div></div>
      <div class="row2"><button class="btn gold small" id="spin">${spinsLeft ? 'FREE SPIN' : 'Spin used'}</button><button class="btn ad small" id="spinad" ${extraLeft > 0 ? '' : 'disabled'}>📺 Spin (${Math.max(0, extraLeft)})</button></div>
      <h3>🎯 DAILY MISSIONS</h3>
      ${ms.map((m, i) => { const def = MISSION_POOL.find(x => x.id === m.id); return `<div class="card mis"><div class="row"><div class="nm" style="font-size:14px">${def.txt.replace('{n}', m.target)}</div><button class="btn small ${m.done && !m.claimed ? 'gold' : 'ghost'}" data-m="${i}" ${m.done && !m.claimed ? '' : 'disabled'}>${m.claimed ? '✔' : rewardTxt({ c: m.rc, g: m.rg })}</button></div><div class="bar"><i style="width:${Math.min(100, m.p / m.target * 100)}%"></i></div></div>`; }).join('')}
      <h3>🪙 FREE COINS</h3>
      <div class="card"><div class="ic">📺</div><div class="mid"><div class="nm">Watch &amp; earn 250 🪙</div><div class="ds">${fa.n}/${CONFIG.REWARDED_DAILY_CAP_FREE_COINS} today</div></div><button class="btn ad small" id="fc" ${fa.n < CONFIG.REWARDED_DAILY_CAP_FREE_COINS ? '' : 'disabled'}>Watch</button></div>
    </div>`, 'rewards');

    const claim = mult => {
      const r = DAILY_REWARDS[cc % 7]; for (let k = 0; k < mult; k++) grant(r);
      const y = d.daily.last === Daily.yesterday(); d.daily.streak = y ? d.daily.streak + 1 : 1; d.daily.last = Save.today(); Save.save();
      Sfx.play('win'); toast('Reward claimed: ' + rewardTxt(r) + (mult > 1 ? ' ×2' : '')); rewards();
    };
    if ($('dl')) $('dl').onclick = () => can && claim(1);
    if ($('dl2')) $('dl2').onclick = () => Ads.rewarded('daily_x2', ok => ok && claim(2));
    const doSpin = () => {
      if (spinning) return; spinning = true;
      const idx = Math.floor(Math.random() * WHEEL.length), rot = 360 * 6 + (360 - (idx * 45 + 22.5));
      const w = $('wheel'); w.style.transform = `rotate(${rot}deg)`; Sfx.play('zap');
      setTimeout(() => { spinning = false; grant(WHEEL[idx]); Sfx.play('win'); toast('You won ' + WHEEL[idx].l + '!'); rewards(); }, 4100);
    };
    $('spin').onclick = () => { if (sp.free && !spinning) { sp.free = false; Save.save(); doSpin(); } else if (!spinning) toast('Come back tomorrow or watch an ad!'); };
    $('spinad').onclick = () => { if (spinning) return; Ads.rewarded('spin', ok => { if (ok) { sp.extra++; Save.save(); doSpin(); } }); };
    scr.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { const m = ms[+b.dataset.m]; m.claimed = true; grant({ c: m.rc, g: m.rg }); Sfx.play('win'); rewards(); });
    $('fc').onclick = () => Ads.rewarded('free_coins', ok => { if (ok) { fa.n++; d.coins += 250; Save.save(); Sfx.play('coin'); rewards(); } });
  }

  function shop() {
    const d = Save.d;
    render(`<h2>Shop</h2><div class="scroll">
      ${Products.map(p => { const own = Store.owned(p.id); return `<div class="card ${p.hot && !own ? 'hot' : ''}"><div class="ic">${p.icon}</div><div class="mid"><div class="nm">${p.name}${p.hot && !own ? '<span class="badge">BEST DEAL</span>' : ''}</div><div class="ds">${p.desc}</div></div><button class="btn small ${own ? 'ghost' : 'gold'}" data-buy="${p.id}" ${own ? 'disabled' : ''}>${own ? 'Owned ✔' : p.price}</button></div>`; }).join('')}
      <h3>SPEND GEMS</h3>
      ${[[1000, 20], [5000, 80], [15000, 200]].map(([c, g]) => `<div class="card"><div class="ic">🪙</div><div class="mid"><div class="nm">${fmt(c)} Coins</div></div><button class="btn small ${d.gems >= g ? 'gold' : 'ghost'}" data-cg="${c}:${g}">💎 ${g}</button></div>`).join('')}
    </div>`, 'shop');
    scr.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => Store.buy(b.dataset.buy, ok => { if (ok) { Sfx.play('win'); Ads.banner(false); shop(); } }));
    scr.querySelectorAll('[data-cg]').forEach(b => b.onclick = () => { const [c, g] = b.dataset.cg.split(':').map(Number); if (d.gems < g) return toast('Not enough 💎'); d.gems -= g; d.coins += c; Save.save(); Sfx.play('coin'); shop(); });
  }

  function privacy() {
    openModal(`<h2>🔒 Privacy Policy</h2><div class="policy">
      <p><b>Neon Swarm</b> stores your game progress only on your device. We do not collect personal information ourselves.</p>
      <p><b>Ads.</b> The game shows ads through Google AdMob, which may use your device's advertising ID to show ads and measure performance. You can reset your advertising ID or opt out of personalized ads in your phone's Settings → Google → Ads.</p>
      <p><b>Purchases.</b> In-app purchases are processed by Google Play. We never see your payment details.</p>
      <p><b>Children.</b> The game is not directed at children under 13.</p>
      <p><b>Contact.</b> Add your support email here before publishing.</p></div>
      <button class="btn" id="pvclose">← Back</button>`, 'privacy');
    $('pvclose').onclick = () => { click(); closeModal(); };
  }

  function settings() {
    const s = Save.d.settings;
    render(`<h2>Settings</h2><div class="scroll">
      ${[['sound', '🔊 Sound effects'], ['music', '🎵 Music'], ['haptics', '📳 Vibration']].map(([k, n]) => `<div class="setrow"><span>${n}</span><div class="tog ${s[k] ? 'on' : ''}" data-t="${k}"></div></div>`).join('')}
      <div class="setrow"><span>Version</span><span style="opacity:.6">${CONFIG.VERSION}</span></div>
      <div class="col"><button class="btn ghost small" id="priv">Privacy policy</button><button class="btn ghost small" id="rst">Reset progress</button></div></div>`, 'settings');
    scr.querySelectorAll('[data-t]').forEach(t => t.onclick = () => { s[t.dataset.t] = !s[t.dataset.t]; Save.save(); Sfx.refresh(); Haptic(20); settings(); });
    $('priv').onclick = () => privacy();
    $('rst').onclick = () => { if (confirm('Erase ALL progress?')) { Save.reset(); go('home'); } };
  }

  // PWA install
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); window.__pwa = { prompt: () => { e.prompt(); window.__pwa = null; } }; if (cur === 'home') home(); });
  // Prevent iOS rubber-band / pinch zoom
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('touchmove', e => { if (!e.target.closest('.scroll,.panel')) e.preventDefault(); }, { passive: false });

  // ---------- Android back button / lock-screen handling (Capacitor) ----------
  const nativeApp = Ads.isNative() ? (() => { try { return window.Capacitor.registerPlugin('App'); } catch (e) { return null; } })() : null;
  function back() {
    if ($('adlayer').classList.contains('show')) return;
    if (modal.classList.contains('show')) {
      if (modalKind === 'pause') Game.resume(); else if (modalKind === 'privacy') closeModal();
      return;                                         // level-up / game-over: must choose
    }
    const st = Game.G.state;
    if (st === 'play') return Game.pause();
    if (st === 'dead' || st === 'levelup') return;
    if (cur !== 'home') return go('home');
    if (nativeApp) nativeApp.exitApp();
  }
  if (nativeApp) {
    nativeApp.addListener('backButton', back);
    nativeApp.addListener('appStateChange', ({ isActive }) => { if (isActive) Sfx.resume(); else { Sfx.suspend(); Game.pause(); } });
  }
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && modal.classList.contains('show') && modalKind === 'privacy') closeModal(); });

  Ads.init(); Sfx.setMode('menu'); Game.startDemo(); Sfx.refresh(); go('home');
  // browsers need a gesture before audio starts
  window.addEventListener('pointerdown', () => { Sfx.init(); Sfx.refresh(); }, { once: true });
  return { showHud, hud, banner, toast, levelUp, hideLevelUp, pause, gameOver, chest, go };
})();
