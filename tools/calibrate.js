#!/usr/bin/env node
/* =====================================================================
   Monte Carlo calibration.
     node tools/calibrate.js [--games snake,breakout] [--n 150] [--nv 100] [--out src/calibration.json]

   1. SWEEP     For each game and mode, play N games at computer strength k = 0, 0.1 … 1
                against the average simulated person (skill 0.5). Win rates are made
                monotone (isotonic regression), since a stronger computer can't help you.
   2. CALIBRATE For each level 1–10, pick the k at which the average person's win chance
                hits the target: 85% at level 1 sliding evenly to 15% at level 10.
   3. VALIDATE  Play fresh games at every level against novice, average and expert
                simulated people and report win rates with 95% confidence intervals.
   Uses every CPU core (worker threads). Same seed, same result.
   ===================================================================== */
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os'), fs = require('fs'), path = require('path');

if (!isMainThread) {
  const E = require('./load').load();
  parentPort.on('message', job => {
    let wins = 0, t = 0, timeouts = 0;
    for (const seed of job.seeds) { const r = E.simulateMatch(job.game, job.mode, job.k, job.s, seed); wins += r.humanWon ? 1 : 0; t += r.t; timeouts += r.timeout ? 1 : 0; }
    parentPort.postMessage({ id: job.id, wins, n: job.seeds.length, t, timeouts });
  });
  return;
}

const args = process.argv.slice(2), opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };
const { ORDER } = require('./load');
const E = require('./load').load();
const games = (opt('games') || ORDER.join(',')).split(',');
const N = +(opt('n') || 150), NV = +(opt('nv') || 100), OUT = opt('out') || path.join(__dirname, '..', 'src', 'calibration.json');
const KGRID = Array.from({ length: 11 }, (_, i) => i / 10);
const PROFILES = E.PLAYER_PROFILES, TARGET = E.TARGET;

// ---------- worker pool ----------
const workers = Array.from({ length: Math.max(1, os.cpus().length) }, () => new Worker(__filename));
let nextId = 0; const pending = new Map(); const queue = []; const idle = workers.slice();
for (const w of workers) w.on('message', r => { pending.get(r.id)(r); pending.delete(r.id); idle.push(w); drain(); });
function drain() { while (idle.length && queue.length) { const w = idle.pop(), j = queue.shift(); w.postMessage(j); } }
function run(game, mode, k, s, seeds) {
  const chunks = [], size = Math.ceil(seeds.length / (workers.length * 2));
  for (let i = 0; i < seeds.length; i += size) chunks.push(seeds.slice(i, i + size));
  return Promise.all(chunks.map(c => new Promise(res => { const id = nextId++; pending.set(id, res); queue.push({ id, game, mode, k, s, seeds: c }); drain(); })))
    .then(rs => rs.reduce((a, r) => ({ wins: a.wins + r.wins, n: a.n + r.n, t: a.t + r.t, timeouts: a.timeouts + r.timeouts }), { wins: 0, n: 0, t: 0, timeouts: 0 }));
}
const seedsFor = (tag, n) => { const r = E.makeRng(hash(tag)); return Array.from({ length: n }, () => Math.floor(r.next() * 4294967296)); };
function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

// ---------- statistics ----------
function wilson(w, n, z = 1.96) {   // 95% confidence interval for a win rate
  if (!n) return [0, 1]; const p = w / n, d = 1 + z * z / n, c = p + z * z / (2 * n), e = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [Math.max(0, (c - e) / d), Math.min(1, (c + e) / d)];
}
function isotonicDecreasing(ps, ws) {   // pool-adjacent-violators, so win rate never rises with k
  const blocks = ps.map((p, i) => ({ p, w: ws[i], n: 1 }));
  for (let i = 0; i < blocks.length - 1;) {
    if (blocks[i].p < blocks[i + 1].p) {
      const a = blocks[i], b = blocks[i + 1], w = a.w + b.w;
      blocks.splice(i, 2, { p: (a.p * a.w + b.p * b.w) / w, w, n: a.n + b.n });
      if (i > 0) i--;
    } else i++;
  }
  return blocks.flatMap(b => Array(b.n).fill(b.p));
}
function invert(ks, fit, target) {      // smallest k where the fitted win rate reaches target
  if (target >= fit[0]) return { k: 0, flag: 'floor' };
  if (target <= fit[fit.length - 1]) return { k: 1, flag: 'ceiling' };
  for (let i = 0; i < ks.length - 1; i++) {
    const a = fit[i], b = fit[i + 1];
    if (a >= target && b <= target) return { k: a === b ? ks[i] : ks[i] + (ks[i + 1] - ks[i]) * (a - target) / (a - b), flag: null };
  }
  return { k: 1, flag: 'ceiling' };
}
const pct = x => (100 * x).toFixed(0).padStart(3) + '%';

(async () => {
  const t0 = Date.now(), out = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
  for (const g of games) {
    const G = E.GAMES[g]; if (!G) { console.log('unknown game', g); continue; }
    out[g] = out[g] || {};
    for (let mode = 0; mode < G.modes.length; mode++) {
      if (!G.modes[mode].ctrl.includes('cpu')) continue;
      const sweep = [];
      const measure = async k => { const r = await run(g, mode, k, 0.5, seedsFor(`${g}/${mode}/sweep/${k}`, N)); sweep.push({ k, w: r.wins, n: r.n, t: r.t / r.n, timeouts: r.timeouts }); };
      for (const k of KGRID) await measure(k);
      // refine: where the curve is steep, measure extra strengths between the 90% and 10% points
      {
        const f0 = isotonicDecreasing(sweep.map(x => x.w / x.n), sweep.map(x => x.n));
        const a = KGRID[Math.max(0, f0.findIndex(p => p < 0.9) - 1)], bi = f0.findIndex(p => p <= 0.1), b = bi < 0 ? 1 : KGRID[bi];
        if (b - a <= 0.61) for (let i = 1; i <= 8; i++) { const k = +(a + (b - a) * i / 9).toFixed(4); if (!sweep.some(x => Math.abs(x.k - k) < 0.01)) await measure(k); }
        sweep.sort((p, q) => p.k - q.k);
      }
      const KS = sweep.map(x => x.k), fit = isotonicDecreasing(sweep.map(x => x.w / x.n), sweep.map(x => x.n));
      const levels = Array.from({ length: 10 }, (_, i) => { const r = invert(KS, fit, TARGET(i + 1)); return { level: i + 1, target: TARGET(i + 1), k: +r.k.toFixed(3), flag: r.flag }; });
      const validate = {};
      for (const P of PROFILES) {
        validate[P.id] = [];
        for (const L of levels) { const r = await run(g, mode, L.k, P.s, seedsFor(`${g}/${mode}/val/${P.id}/${L.level}`, NV)); const ci = wilson(r.wins, r.n); validate[P.id].push({ w: r.wins, n: r.n, p: r.wins / r.n, lo: ci[0], hi: ci[1], t: r.t / r.n }); }
      }
      out[g][mode] = { k: levels.map(l => l.k), flags: levels.map(l => l.flag), sweep: sweep.map((x, i) => ({ k: x.k, p: x.w / x.n, fit: fit[i], n: x.n, t: +x.t.toFixed(1), timeouts: x.timeouts })), validate, n: N, nv: NV, at: new Date().toISOString() };
      // report
      console.log(`\n${g} — ${mode ? 'flipped' : 'normal'}   (sweep ${N} games per point, validation ${NV} per cell)`);
      console.log('  sweep  k: ' + sweep.map(x => x.k.toFixed(2).padStart(4)).join(' '));
      console.log('     win %: ' + sweep.map(x => pct(x.w / x.n).padStart(4)).join(' '));
      console.log('  level        ' + levels.map(l => String(l.level).padStart(4)).join(' '));
      console.log('  strength k   ' + levels.map(l => l.k.toFixed(2).padStart(4)).join(' ') + (levels.some(l => l.flag) ? '   (' + [...new Set(levels.filter(l => l.flag).map(l => l.flag))].join(', ') + ' reached)' : ''));
      console.log('  target       ' + levels.map(l => pct(l.target)).join(' '));
      for (const P of PROFILES) console.log(`  ${P.label.padEnd(12)} ` + validate[P.id].map(v => pct(v.p)).join(' '));
      fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
    }
  }
  console.log(`\nwrote ${OUT} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  for (const w of workers) w.terminate();
})();
