// ============================================================
//  Monetization layer: Ads + IAP behind one tiny API.
//  Game code only ever calls Ads.rewarded / Ads.interstitial /
//  Store.buy — swapping providers never touches gameplay.
// ============================================================
const Track = { ev(name, p) { try { console.debug('[track]', name, p || ''); window.gtag && window.gtag('event', name, p || {}); } catch (e) {} } };

const Ads = (() => {
  let lastInter = Date.now();   // first interstitial can't appear instantly
  const C = CONFIG;
  const cap = () => (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AdMob) || null;

  // ---------- Mock provider (dev / web demo) ----------
  function mockAd(kind, done) {
    const el = document.getElementById('adlayer');
    const secs = kind === 'rewarded' ? 3 : 2;
    el.innerHTML = `<div class="adbox"><div class="adtag">TEST AD · ${kind}</div>
      <div class="adbig">📺</div><div class="adtxt">Your real ad plays here.</div>
      <div class="adtimer" id="adt">${secs}</div>
      <button class="btn small ghost" id="adx" disabled>Please wait…</button></div>`;
    el.classList.add('show');
    let s = secs; const t = setInterval(() => {
      s--; const te = document.getElementById('adt'); if (te) te.textContent = Math.max(s, 0);
      if (s <= 0) {
        clearInterval(t);
        const b = document.getElementById('adx'); b.disabled = false;
        b.textContent = kind === 'rewarded' ? 'Claim reward ✔' : 'Close ✕';
        b.onclick = () => { el.classList.remove('show'); el.innerHTML = ''; done(true); };
      }
    }, 1000);
  }

  // ---------- AdMob provider (Capacitor build) ----------
  async function admobShow(kind, done) {
    const A = cap(); if (!A) return mockAd(kind, done);
    try {
      if (kind === 'rewarded') {
        await A.prepareRewardVideoAd({ adId: C.ADMOB.rewarded });
        let rewarded = false;
        const h1 = await A.addListener('onRewardedVideoAdReward', () => { rewarded = true; });
        const h2 = await A.addListener('onRewardedVideoAdDismissed', () => { h1.remove(); h2.remove(); done(rewarded); });
        await A.showRewardVideoAd();
      } else {
        await A.prepareInterstitial({ adId: C.ADMOB.interstitial });
        const h = await A.addListener('onInterstitialAdDismissed', () => { h.remove(); done(true); });
        await A.showInterstitial();
      }
    } catch (e) { console.warn('AdMob failed', e); done(kind !== 'rewarded'); }
  }

  const show = (kind, done) => (C.AD_PROVIDER === 'admob' ? admobShow : mockAd)(kind, done);

  return {
    removed: () => Save.d.adsRemoved,
    // Rewarded video. cb(true) only if the user earned the reward.
    rewarded(placement, cb) {
      Track.ev('ad_rewarded_request', { placement });
      show('rewarded', ok => { Track.ev('ad_rewarded_' + (ok ? 'ok' : 'fail'), { placement }); lastInter = Date.now(); cb(ok); });
    },
    // Interstitial at natural breaks only. Always calls cb.
    interstitial(cb) {
      const ok = !Save.d.adsRemoved && Save.d.runs > C.INTERSTITIAL_AFTER_RUNS && Date.now() - lastInter > C.INTERSTITIAL_COOLDOWN_MS;
      if (!ok) return cb();
      Track.ev('ad_interstitial');
      show('interstitial', () => { lastInter = Date.now(); cb(); });
    },
    async banner(on) {
      const A = cap(); if (!A || C.AD_PROVIDER !== 'admob' || Save.d.adsRemoved) return;
      try { on ? await A.showBanner({ adId: C.ADMOB.banner, position: 'BOTTOM_CENTER', adSize: 'ADAPTIVE_BANNER' }) : await A.hideBanner(); } catch (e) {}
    },
    init() { const A = cap(); if (A && C.AD_PROVIDER === 'admob') A.initialize({}).catch(() => {}); },
  };
})();

// ---------- In-app purchases ----------
const Products = [
  { id: 'remove_ads', name: 'Remove Ads', desc: 'No pop-up ads. Rewarded ads stay optional.', price: '₹149', icon: '🚫', once: true, grant: () => { Save.d.adsRemoved = true; } },
  { id: 'starter', name: 'Starter Pack', desc: '3000 coins + 30 gems + Volt hero', price: '₹49', icon: '🎁', once: true, hot: true, grant: () => { Save.d.coins += 3000; Save.d.gems += 30; if (!Save.d.chars.includes('volt')) Save.d.chars.push('volt'); Save.d.starter = true; } },
  { id: 'gems_s', name: '80 Gems', desc: 'Revives & coin packs', price: '₹79', icon: '💎', grant: () => { Save.d.gems += 80; } },
  { id: 'gems_m', name: '500 Gems', desc: 'Best value +25% bonus', price: '₹349', icon: '💎', grant: () => { Save.d.gems += 500; } },
  { id: 'gems_l', name: '1200 Gems', desc: 'Mega pile +50% bonus', price: '₹699', icon: '💎', grant: () => { Save.d.gems += 1200; } },
];
const Store = {
  owned: id => (id === 'remove_ads' && Save.d.adsRemoved) || (id === 'starter' && Save.d.starter),
  buy(id, cb) {
    const p = Products.find(x => x.id === id); if (!p) return;
    Track.ev('iap_attempt', { id });
    // MOCK: replace with RevenueCat / cordova-plugin-purchase when the Play account is ready.
    if (!confirm(`TEST PURCHASE\n${p.name} — ${p.price}\n\nNo real money is charged in this build.`)) return cb(false);
    p.grant(); Save.save(); Track.ev('iap_success', { id }); cb(true);
  },
};
