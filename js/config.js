// ============================================================
//  NEON SWARM — central config. Edit IDs here when your ad /
//  IAP accounts are ready. Nothing else needs to change.
// ============================================================
window.CONFIG = {
  GAME_NAME: 'Neon Swarm',
  VERSION: '1.0.0',

  // 'mock'  -> built-in fake ads / fake purchases (development)
  // 'admob' -> Capacitor AdMob plugin (Android/iOS build)
  AD_PROVIDER: 'mock',
  IAP_PROVIDER: 'mock',

  // Google's official TEST ids. Replace with your real ones later.
  ADMOB: {
    testing: true,            // set false ONLY with your real ad unit ids
    appId: 'ca-app-pub-3940256099942544~3347511713',
    rewarded: 'ca-app-pub-3940256099942544/5224354917',
    interstitial: 'ca-app-pub-3940256099942544/1033173712',
    banner: 'ca-app-pub-3940256099942544/6300978111',
  },

  // Ad pacing (protects retention => protects long-term revenue)
  INTERSTITIAL_AFTER_RUNS: 3,     // no interstitials for the first N runs
  INTERSTITIAL_COOLDOWN_MS: 90000,
  REWARDED_DAILY_CAP_FREE_COINS: 5,
  REWARDED_DAILY_CAP_SPIN: 5,

  // Gameplay economy
  REVIVE_GEM_COST: 5,
};
