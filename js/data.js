// Static game data: heroes, weapons, passives, meta upgrades, enemies.
const HEROES = {
  nova:    { name: 'Nova',    color: '#33ccff', weapon: 'blaster',   cost: 0,     mods: {},                 desc: 'Balanced pilot. Starts with Blaster.' },
  volt:    { name: 'Volt',    color: '#ffee44', weapon: 'lightning', cost: 2500,  mods: { spd: 0.06 },      desc: '+6% speed. Starts with Chain Lightning.' },
  blade:   { name: 'Blade',   color: '#ff44aa', weapon: 'orbit',     cost: 5000,  mods: { hp: 0.2 },        desc: '+20% HP. Starts with Orbit Blades.' },
  rocket:  { name: 'Rocket',  color: '#ff8833', weapon: 'missile',   cost: 9000,  mods: { dmg: 0.12 },      desc: '+12% damage. Starts with Homing Missiles.' },
  eclipse: { name: 'Eclipse', color: '#aa66ff', weapon: 'pulse',     cost: 16000, mods: { xp: 0.2, hp: 0.1 }, desc: '+20% XP, +10% HP. Starts with Nova Pulse.' },
};

const WEAPONS = {
  blaster:   { name: 'Blaster',         icon: '🔫', desc: ['Auto-fires at nearest foe', '+25% damage', 'Fire 2 shots', 'Bullets pierce 1', 'Fire 3 shots, +25% dmg'] },
  orbit:     { name: 'Orbit Blades',    icon: '🌀', desc: ['Blades circle you', '+1 blade', '+1 blade, bigger', '+1 blade, faster', '+1 blade, +dmg'] },
  lightning: { name: 'Chain Lightning', icon: '⚡', desc: ['Zaps 2 nearby foes', 'Faster strikes', 'Zaps 3 foes', 'More damage', 'Zaps 4 foes'] },
  missile:   { name: 'Homing Missiles', icon: '🚀', desc: ['Seeking explosive missile', 'Bigger blast', '2 missiles', 'Faster reload', '3 missiles'] },
  pulse:     { name: 'Nova Pulse',      icon: '💥', desc: ['Shockwave knocks foes back', 'Bigger radius', 'Faster pulse', 'More damage', 'Huge radius'] },
};

const PASSIVES = {
  might:  { name: 'Overcharge', icon: '🔥', desc: '+15% damage' },
  haste:  { name: 'Overclock',  icon: '⏱️', desc: '+12% fire rate' },
  vital:  { name: 'Vitality',   icon: '❤️', desc: '+25 max HP & heal' },
  swift:  { name: 'Thrusters',  icon: '👟', desc: '+8% move speed' },
  magnet: { name: 'Magnet',     icon: '🧲', desc: '+35% pickup range' },
  armor:  { name: 'Plating',    icon: '🛡️', desc: '-1 damage taken' },
  regen:  { name: 'Nanobots',   icon: '➕', desc: '+0.6 HP / sec' },
};

const META = {
  hp:   { name: 'Hull',        icon: '❤️', desc: '+10% max HP',        max: 10, base: 80,  g: 1.5 },
  dmg:  { name: 'Firepower',   icon: '🔥', desc: '+6% damage',         max: 10, base: 100, g: 1.55 },
  spd:  { name: 'Engines',     icon: '👟', desc: '+3% move speed',     max: 8,  base: 90,  g: 1.5 },
  mag:  { name: 'Magnet',      icon: '🧲', desc: '+12% pickup range',  max: 8,  base: 70,  g: 1.5 },
  reg:  { name: 'Repair',      icon: '➕', desc: '+0.25 HP / sec',     max: 8,  base: 120, g: 1.55 },
  coin: { name: 'Greed',       icon: '🪙', desc: '+8% coins per run',  max: 10, base: 150, g: 1.6 },
  rev:  { name: 'Second Wind', icon: '✨', desc: 'One free revive per run', max: 1, base: 2500, g: 1 },
};
const metaCost = (k) => Math.round(META[k].base * Math.pow(META[k].g, Save.d.up[k]));

// r: radius, hp: base hp, sp: speed, dmg: contact damage, xp: gem value, from: first spawn time, w: spawn weight
const ENEMIES = {
  grunt:    { r: 9,  hp: 14, sp: 52,  dmg: 8,  xp: 1, from: 0,   w: 10, col: '#ff4466', shape: 5 },
  runner:   { r: 7,  hp: 8,  sp: 105, dmg: 7,  xp: 1, from: 25,  w: 6,  col: '#ff9933', shape: 3 },
  tank:     { r: 15, hp: 70, sp: 36,  dmg: 14, xp: 4, from: 70,  w: 3,  col: '#aa66ff', shape: 6 },
  shooter:  { r: 10, hp: 22, sp: 50,  dmg: 8,  xp: 3, from: 110, w: 3,  col: '#44ff99', shape: 4 },
  splitter: { r: 12, hp: 36, sp: 48,  dmg: 9,  xp: 3, from: 150, w: 3,  col: '#ff55dd', shape: 4 },
  mini:     { r: 6,  hp: 8,  sp: 80,  dmg: 5,  xp: 1, from: 9e9, w: 0,  col: '#ff55dd', shape: 4 },
  boss:     { r: 34, hp: 450, sp: 38, dmg: 22, xp: 40, from: 9e9, w: 0,  col: '#ff2244', shape: 8 },
};

const DAILY_REWARDS = [
  { c: 100 }, { c: 200 }, { g: 3 }, { c: 350 }, { c: 500 }, { g: 8 }, { c: 1000, g: 15 },
];
const WHEEL = [
  { c: 50, l: '50🪙', col: '#2a6' }, { c: 200, l: '200🪙', col: '#26a' }, { g: 3, l: '3💎', col: '#a3a' }, { c: 100, l: '100🪙', col: '#a62' },
  { c: 500, l: '500🪙', col: '#26a' }, { g: 8, l: '8💎', col: '#a3a' }, { c: 1000, l: '1000🪙', col: '#c92' }, { c: 150, l: '150🪙', col: '#2a6' },
];
const MISSION_POOL = [
  { id: 'kills', txt: 'Defeat {n} enemies', targets: [150, 300, 600], stat: 'kills', sum: true },
  { id: 'time', txt: 'Survive {n} s in one run', targets: [120, 180, 300], stat: 'time' },
  { id: 'boss', txt: 'Defeat {n} boss', targets: [1, 2], stat: 'boss', sum: true },
  { id: 'coins', txt: 'Collect {n} coins', targets: [60, 120], stat: 'coins', sum: true },
  { id: 'level', txt: 'Reach level {n} in a run', targets: [8, 12, 16], stat: 'level' },
  { id: 'runs', txt: 'Play {n} runs', targets: [3, 5], stat: 'runs', sum: true },
];
