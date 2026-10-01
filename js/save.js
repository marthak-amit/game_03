// Persistent save data (localStorage, with safe fallback)
const Save = (() => {
  const KEY = 'neonswarm_v1';
  const defaults = () => ({
    coins: 0, gems: 0,
    runs: 0, totalKills: 0, bestTime: 0, bestKills: 0, bestLevel: 0,
    up: { hp: 0, dmg: 0, spd: 0, mag: 0, reg: 0, coin: 0, rev: 0 },
    chars: ['nova'], char: 'nova',
    daily: { last: '', streak: 0 },
    spin: { date: '', free: false, extra: 0 },
    freeAds: { date: '', n: 0 },
    missions: { date: '', list: [] },
    adsRemoved: false, starter: false,
    settings: { sound: true, music: true, haptics: true },
    tutorial: false, created: Date.now(),
  });
  let data = defaults();
  const merge = (a, b) => { for (const k in b) { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k]) merge(a[k], b[k]); else a[k] = b[k]; } return a; };
  function load() {
    try { const raw = localStorage.getItem(KEY); if (raw) data = merge(defaults(), JSON.parse(raw)); } catch (e) { data = defaults(); }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} }
  function reset() { data = defaults(); save(); }
  const today = () => new Date().toISOString().slice(0, 10);
  load();
  return { get d() { return data; }, save, reset, today };
})();
