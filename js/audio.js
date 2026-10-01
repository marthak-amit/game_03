// Fully synthesized audio — zero asset files, instant load.
const Sfx = (() => {
  let ac = null, master = null, musicGain = null, musicOn = false, step = 0, nextT = 0, timer = null;
  let suspended = false, held = false, muted = false;   // suspended: app in background / phone locked; held: game paused
  const last = {};
  function init() {
    if (ac) { if (ac.state === 'suspended' && !suspended) ac.resume(); return; }
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
      musicGain = ac.createGain(); musicGain.gain.value = 0.16; musicGain.connect(master);
    } catch (e) { ac = null; }
  }
  function tone(f, dur, type = 'square', vol = 0.15, slide = 0, delay = 0, dest) {
    if (!ac || !Save.d.settings.sound || suspended) return;
    const t = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || master); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol = 0.2, hp = 800) {
    if (!ac || !Save.d.settings.sound || suspended) return;
    const n = ac.sampleRate * dur, b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = ac.createBufferSource(); s.buffer = b;
    const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = ac.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(master); s.start();
  }
  const throttle = (k, ms) => { const n = performance.now(); if (last[k] && n - last[k] < ms) return false; last[k] = n; return true; };
  const sfx = {
    shoot() { if (throttle('s', 70)) tone(720, 0.06, 'square', 0.04, -300); },
    hit() { if (throttle('h', 45)) tone(200, 0.05, 'sawtooth', 0.05, -80); },
    kill() { if (throttle('k', 35)) { tone(300, 0.1, 'triangle', 0.08, -200); } },
    gem(p = 0) { if (throttle('g', 40)) tone(660 + p * 60, 0.08, 'sine', 0.07, 200); },
    coin() { tone(1200, 0.07, 'square', 0.05); tone(1600, 0.1, 'square', 0.05, 0, 0.06); },
    hurt() { if (throttle('hu', 120)) { tone(110, 0.25, 'sawtooth', 0.18, -60); noise(0.15, 0.15, 300); } },
    levelup() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', 0.14, 0, i * 0.07)); },
    boom() { noise(0.35, 0.28, 120); tone(90, 0.3, 'sawtooth', 0.15, -50); },
    zap() { if (throttle('z', 80)) { tone(1400, 0.1, 'sawtooth', 0.05, -900); } },
    boss() { tone(80, 0.8, 'sawtooth', 0.2, -20); tone(60, 0.8, 'square', 0.15, 0, 0.3); },
    click() { tone(500, 0.05, 'square', 0.06); },
    tick() { tone(1000, 0.06, 'square', 0.08); },
    win() { [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.14, 0, i * 0.09)); },
    lose() { [330, 262, 196, 131].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.12, 0, i * 0.14)); },
    revive() { [262, 392, 523, 784].forEach((f, i) => tone(f, 0.2, 'sine', 0.15, 0, i * 0.08)); },
  };
  // tiny generative synthwave loop
  const bass = [55, 55, 65.4, 55, 73.4, 73.4, 65.4, 49];
  const arp = [220, 262, 330, 262, 294, 349, 440, 349];
  function schedule() {
    if (!ac || !musicOn || suspended || held || !Save.d.settings.music) return;
    while (nextT < ac.currentTime + 0.3) {
      const i = step % 16, bi = Math.floor(i / 2) % 8;
      if (i % 2 === 0) tone(bass[bi], 0.22, 'sawtooth', 0.35, 0, nextT - ac.currentTime, musicGain);
      tone(arp[(i + Math.floor(step / 16)) % 8] * (i % 4 === 3 ? 2 : 1), 0.1, 'square', 0.12, 0, nextT - ac.currentTime, musicGain);
      if (i % 4 === 0) { /* kick */ tone(120, 0.12, 'sine', 0.5, -90, nextT - ac.currentTime, musicGain); }
      nextT += 0.15; step++;
    }
  }
  function startMusic() {
    init(); if (!ac || musicOn || suspended) return; musicOn = true; nextT = ac.currentTime + 0.05;
    timer = setInterval(schedule, 100);
  }
  function stopMusic() { musicOn = false; clearInterval(timer); }
  // ---- phone lock / app switch: silence everything until the app is visible again ----
  const pause = () => { clearInterval(timer); if (ac && ac.state === 'running') ac.suspend().catch(() => {}); };
  function suspend() { suspended = true; pause(); }
  function resume() {
    if (!suspended) return; suspended = false;
    if (ac) ac.resume().catch(() => {});
    if (musicOn) { nextT = (ac ? ac.currentTime : 0) + 0.1; clearInterval(timer); timer = setInterval(schedule, 100); }
  }
  // ---- game pause: music holds, resumes where it left off ----
  function hold() { held = true; }
  function release() { if (!held) return; held = false; if (ac) nextT = ac.currentTime + 0.05; }
  const hidden = () => document.hidden || document.visibilityState === 'hidden';
  document.addEventListener('visibilitychange', () => hidden() ? suspend() : resume());
  window.addEventListener('pagehide', suspend); window.addEventListener('pageshow', () => { if (!hidden()) resume(); });
  document.addEventListener('pause', suspend); document.addEventListener('resume', resume);
  return {
    init, mute(m) { muted = m; }, play(n, a) { if (muted) return; init(); if (sfx[n]) sfx[n](a); }, startMusic, stopMusic, suspend, resume, hold, release,
    setMode() {}, setIntensity() {},
    refresh() { if (Save.d.settings.music) startMusic(); else stopMusic(); },
  };
})();
const Haptic = (ms) => { try { if (Save.d.settings.haptics && navigator.vibrate) navigator.vibrate(ms); } catch (e) {} };
