// Copies the web game into ./www for Capacitor (no bundler needed).
const fs = require('fs'), path = require('path');
const files = ['index.html', 'manifest.json', 'privacy.html', 'sw.js'], dirs = ['js', 'css', 'icons'];
fs.rmSync('www', { recursive: true, force: true }); fs.mkdirSync('www');
const cp = (s, d) => fs.statSync(s).isDirectory() ? (fs.mkdirSync(d, { recursive: true }), fs.readdirSync(s).forEach(f => cp(path.join(s, f), path.join(d, f)))) : fs.copyFileSync(s, d);
[...files, ...dirs].forEach(f => cp(f, path.join('www', f)));
// In the native build use AdMob instead of the mock ad provider.
const cfg = path.join('www', 'js', 'config.js');
fs.writeFileSync(cfg, fs.readFileSync(cfg, 'utf8').replace("AD_PROVIDER: 'mock'", "AD_PROVIDER: 'admob'"));
console.log('www/ ready (AD_PROVIDER=admob)');
