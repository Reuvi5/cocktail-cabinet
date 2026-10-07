// node tools/summary.js  -> how closely each calibrated game-mode tracks the target
const cal = require('../src/calibration.json');
const T = l => 0.85 - 0.70 * (l - 1) / 9; let all = [], games = 0, cells = 0;
for (const [g, modes] of Object.entries(cal)) for (const [m, d] of Object.entries(modes)) {
  const av = d.validate.average.map(c => c.p), err = av.map((p, i) => Math.abs(p - T(i + 1)));
  const inCI = d.validate.average.filter((c, i) => T(i + 1) >= c.lo && T(i + 1) <= c.hi).length;
  all.push(...err); games += d.sweep.reduce((a, s) => a + s.n, 0) + 3 * d.validate.average.reduce((a, c) => a + c.n, 0); cells += 10;
  console.log(`${(g + ' ' + (m === '0' ? 'normal' : g === 'battleship' ? '' : 'flipped')).padEnd(22)} avg error ${(100 * err.reduce((a, b) => a + b) / 10).toFixed(1).padStart(4)} pts   worst ${(100 * Math.max(...err)).toFixed(0).padStart(2)} pts   target inside 95% CI at ${inCI}/10 levels   L1 ${Math.round(av[0] * 100)}%  L10 ${Math.round(av[9] * 100)}%`);
}
console.log(`\noverall: mean |error| ${(100 * all.reduce((a, b) => a + b) / all.length).toFixed(1)} percentage points over ${cells} level checks; ${games.toLocaleString()} simulated games`);
