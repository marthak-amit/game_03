// Fully synthesized audio — zero asset files, instant load.
const Sfx = (() => {
  let ac = null, master = null, musicGain = null, musicOn = false, step = 0, nextT = 0, timer = null;
  let mode = 'menu', bpm = 128, suspended = false, noiseBuf = null, muted = false;
  const last = {};
  function init() {
    if (ac) { if (ac.state === 'suspended' && !suspended) ac.resume(); return; }
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.gain.value = 0.75;
      const comp = ac.createDynamicsCompressor(); master.connect(comp); comp.connect(ac.destination);
      musicGain = ac.createGain(); musicGain.gain.value = 0.3; musicGain.connect(master);
      const n = ac.sampleRate * 0.5; noiseBuf = ac.createBuffer(1, n, ac.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ac = null; }
  }
  // generic synth note. `at` = absolute audio time, `lp` = optional lowpass cutoff
  function note(f, dur, type, vol, at, dest, slide = 0, lp = 0) {
    if (!ac) return;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, at);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(25, f + slide), at + dur);
    g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(vol, at + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    let out = g; if (lp) { const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; o.connect(fl); fl.connect(g); } else o.connect(g);
    g.connect(dest || master); o.start(at); o.stop(at + dur + 0.03);
  }
  function hit(dur, vol, hp, at, dest, bp = 0) { // noise burst (hat / snare / boom)
    if (!ac) return;
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    const f = ac.createBiquadFilter(); f.type = bp ? 'bandpass' : 'highpass'; f.frequency.value = bp || hp;
    const g = ac.createGain(); g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    s.connect(f); f.connect(g); g.connect(dest || master); s.start(at, Math.random() * 0.2); s.stop(at + dur + 0.02);
  }
  const tone = (f, dur, type = 'square', vol = 0.15, slide = 0, delay = 0) => { if (ac && Save.d.settings.sound && !suspended) note(f, dur, type, vol, ac.currentTime + delay, master, slide); };
  const noise = (dur, vol = 0.2, hp = 800) => { if (ac && Save.d.settings.sound && !suspended) hit(dur, vol, hp, ac.currentTime); };
  const throttle = (k, ms) => { const n = performance.now(); if (last[k] && n - last[k] < ms) return false; last[k] = n; return true; };
  const sfx = {
    shoot() { if (throttle('s', 60)) tone(880, 0.07, 'square', 0.05, -420); },
    hit() { if (throttle('h', 40)) tone(240, 0.05, 'sawtooth', 0.06, -90); },
    kill() { if (throttle('k', 30)) { tone(420, 0.09, 'triangle', 0.1, -260); } },
    gem(p = 0) { if (throttle('g', 35)) tone(700 + p * 70, 0.09, 'sine', 0.09, 260); },
    coin() { tone(1300, 0.07, 'square', 0.06); tone(1750, 0.12, 'square', 0.06, 0, 0.06); },
    hurt() { if (throttle('hu', 120)) { tone(130, 0.28, 'sawtooth', 0.22, -70); noise(0.18, 0.2, 300); } },
    levelup() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.2, 'triangle', 0.17, 0, i * 0.065)); },
    boom() { noise(0.4, 0.35, 120); tone(100, 0.35, 'sawtooth', 0.2, -60); },
    zap() { if (throttle('z', 70)) tone(1500, 0.1, 'sawtooth', 0.06, -1000); },
    boss() { tone(90, 0.9, 'sawtooth', 0.25, -25); tone(70, 0.9, 'square', 0.18, 0, 0.3); noise(0.6, 0.15, 200); },
    click() { tone(620, 0.05, 'square', 0.07); },
    tick() { tone(1000, 0.06, 'square', 0.08); },
    start() { tone(180, 0.5, 'sawtooth', 0.2, 700); noise(0.5, 0.18, 400); [392, 523, 784].forEach((f, i) => tone(f, 0.18, 'square', 0.1, 0, 0.18 + i * 0.1)); },
    win() { [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.17, 0, i * 0.08)); },
    lose() { [330, 262, 196, 131].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.14, 0, i * 0.13)); },
    revive() { [262, 392, 523, 784].forEach((f, i) => tone(f, 0.2, 'sine', 0.17, 0, i * 0.07)); },
  };

  // ---------------- music: 4-bar loop (Am - F - C - G), drums + bass + arp + pad + lead ----------------
  const ROOT = [55, 43.65, 65.41, 49];                                   // bass roots
  const CH = [[220, 261.6, 329.6], [174.6, 220, 261.6], [261.6, 329.6, 392], [196, 246.9, 293.7]];
  const HOOK = [[0, 2, 4, 2, 5, 4, 2, 0], [0, 2, 4, 5, 4, 2, 4, 2]];      // lead melody step idx into A-minor pentatonic
  const PENTA = [440, 523.3, 587.3, 659.3, 784, 880];
  function bar(i, t0, sp) {
    const play = mode === 'play', c = Math.floor(step / 16) % 4, d = musicGain;
    const sl = sp * 1; // 16th length
    if (i === 0) for (const f of CH[c]) note(f, sl * 15, 'triangle', 0.09, t0, d, 0, 1400);       // pad
    // drums
    const kick = play ? i % 4 === 0 : (i === 0 || i === 8 || i === 10);
    if (kick) { note(150, 0.16, 'sine', 0.9, t0, d, -110); }
    if (i === 4 || i === 12) { hit(0.14, 0.45, 0, t0, d, 1800); if (play) note(190, 0.08, 'triangle', 0.25, t0, d, -60); }
    if (i % 2 === 0) hit(0.04, play ? 0.16 : 0.1, 7000, t0, d); else if (play && i % 4 === 3) hit(0.03, 0.08, 8000, t0, d);
    if (i === 14) hit(0.18, 0.1, 6000, t0, d);
    // bass: root on beats + off-beat pulses
    if (i % 4 === 0 || (play ? i % 4 === 2 : i === 10)) note(ROOT[c] * (i % 8 === 6 ? 2 : 1), sl * 3.4, 'sawtooth', play ? 0.32 : 0.26, t0, d, 0, 420);
    // arpeggio
    const arpIdx = [0, 1, 2, 1, 0, 2, 1, 2][i % 8], oct = (i % 16 >= 8 && play) ? 2 : 1;
    note(CH[c][arpIdx] * 2 * oct * (i % 4 === 3 ? 1 : 1), sl * 1.7, 'square', play ? 0.075 : 0.06, t0, d, 0, 3200);
    // lead hook (play mode, every 2nd loop)
    if (play && Math.floor(step / 64) % 2 === 1 && i % 2 === 0) {
      const h = HOOK[c % 2][(i / 2) % 8]; note(PENTA[h], sl * 3.6, 'sawtooth', 0.085, t0, d, 0, 4500);
    }
  }
  function schedule() {
    if (!ac || !musicOn || suspended || !Save.d.settings.music) return;
    const sp = 60 / bpm / 4;
    if (nextT < ac.currentTime - 0.2) nextT = ac.currentTime + 0.05;   // recover after stalls
    while (nextT < ac.currentTime + 0.35) { bar(step % 16, nextT, sp); nextT += sp; step++; }
  }
  function startMusic() {
    init(); if (!ac || musicOn || suspended) return; musicOn = true; nextT = ac.currentTime + 0.05; step = 0;
    clearInterval(timer); timer = setInterval(schedule, 80);
  }
  function stopMusic() { musicOn = false; clearInterval(timer); }
  // ---- phone lock / app switch: silence EVERYTHING until the app is visible again ----
  function suspend() { suspended = true; clearInterval(timer); if (ac && ac.state === 'running') ac.suspend().catch(() => {}); }
  function resume() {
    if (!suspended) return; suspended = false;
    if (ac) ac.resume().catch(() => {});
    if (musicOn) { nextT = (ac ? ac.currentTime : 0) + 0.1; clearInterval(timer); timer = setInterval(schedule, 80); }
  }
  const hidden = () => document.hidden || document.visibilityState === 'hidden';
  document.addEventListener('visibilitychange', () => hidden() ? suspend() : resume());
  window.addEventListener('pagehide', suspend); window.addEventListener('pageshow', () => { if (!hidden()) resume(); });
  window.addEventListener('blur', () => { if (hidden()) suspend(); });
  document.addEventListener('pause', suspend); document.addEventListener('resume', resume);  // cordova-style events
  return {
    init, mute(m) { muted = m; }, play(n, a) { if (muted) return; init(); if (sfx[n]) sfx[n](a); }, startMusic, stopMusic, suspend, resume,
    setMode(m) { mode = m; bpm = m === 'play' ? 146 : 128; },
    setIntensity(t) { if (mode === 'play') bpm = Math.min(168, 146 + t / 12); },
    refresh() { if (Save.d.settings.music) startMusic(); else stopMusic(); },
  };
})();
const Haptic = (ms) => { try { if (Save.d.settings.haptics && navigator.vibrate) navigator.vibrate(ms); } catch (e) {} };
