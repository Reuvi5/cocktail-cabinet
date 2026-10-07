
/* =====================================================================
   ENGINE — pure code shared by the web page and the Monte Carlo runner.
   Nothing in this file (or in any *.model.js / *.ai.js file) touches the
   page: no window, no canvas, no keyboard, no sound. That is what lets the
   same game rules run thousands of times in Node to measure balance.

   The MVC contract every game follows:
     Model      new G.Model({ mode, sides, rng })
                  sides[i] = { kind: 'human' | 'computer', k }   (k = computer strength 0..1)
                  model.step(dt, actions)   advances the rules by dt seconds
                  model.result              null, or { winner, title, detail } when the game ends
                  model.events              things that happened (sounds, bursts, messages) for the view
     Controller act(model, dt) -> action   one per side. Three kinds:
                  G.Computer(side, k, rng)  the opponent you play against
                  G.SimHuman(side, s, rng)  a model of a person of skill s, used only for testing
                  G.Human(side, model)      your keyboard and mouse (defined with the view)
     View       new G.View(model, ...)  draw(ctx)   reads the model, never changes it
   ===================================================================== */
const W = 800, H = 600, TAU = Math.PI * 2, DT = 1 / 60;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const lerp = (a, b, t) => a + (b - a) * t;

/* ---------- seeded random numbers (mulberry32): same seed, same game ---------- */
function makeRng(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  const next = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const r = {
    next,
    range: (lo, hi) => lo + next() * (hi - lo),
    int: (lo, hi) => Math.floor(lo + next() * (hi - lo + 1)),
    pick: arr => arr[Math.floor(next() * arr.length)],
    chance: p => next() < p,
    sign: () => (next() < 0.5 ? -1 : 1),
    gauss: () => { let u = 0, v = 0; while (!u) u = next(); while (!v) v = next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); },
    shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; },
    fork: () => makeRng(Math.floor(next() * 4294967296)),
  };
  return r;
}

/* ---------- base model: result, events and who is playing each side ---------- */
class BaseModel {
  constructor(o) {
    this.mode = o.mode || 0;
    this.sides = o.sides;
    this.rng = o.rng || makeRng(1);
    this.events = [];
    this.result = null;
    this.time = 0;
  }
  isComputer(i) { return this.sides[i].kind === 'computer'; }
  ck(i) { return this.sides[i].k || 0; }                 // computer strength, for rules that handicap the computer
  emit(type, data) { this.events.push(Object.assign({ type }, data)); }
  sfx(f, d = 0.08, w = 'square', v = 0.04, sl = 0) { this.emit('sfx', { f, d, w, v, sl }); }
  boom(d = 0.3, v = 0.08) { this.emit('boom', { d, v }); }
  say(text, t = 1.5) { this.emit('say', { text, t }); }
  finish(winner, title, detail) { if (!this.result) this.result = { winner, title, detail }; }
}

/* ---------- game registry (filled in by each *.model.js) ---------- */
const GAMES = {};

/* Play one complete game with no screen, as fast as the computer can.
   humanSide is played by G.SimHuman(skill s); the other side by G.Computer(strength k). */
function simulateMatch(id, mode, k, s, seed, maxT) {
  const G = GAMES[id];
  if (G.simulate) return G.simulate(mode, k, s, seed);           // games with their own clock (Imitation)
  const ctrl = G.modes[mode].ctrl, rng = makeRng(seed);
  const sides = ctrl.map(c => (c === 'cpu' ? { kind: 'computer', k } : { kind: 'human', k: 0 }));
  const model = new G.Model({ mode, sides, rng: rng.fork() });
  const ctrls = ctrl.map((c, i) => (c === 'cpu' ? new G.Computer(i, k, rng.fork()) : new G.SimHuman(i, s, rng.fork())));
  const limit = maxT || G.maxTime || 900;
  while (!model.result && model.time < limit) {
    const acts = ctrls.map(c => c.act(model, DT));
    model.step(DT, acts);
    model.events.length = 0;
  }
  const humanSide = ctrl.indexOf('human');
  return { humanWon: model.result ? model.result.winner === humanSide : false, timeout: !model.result, t: model.time, stats: G.stats ? G.stats(model) : {} };
}

/* ---------- level -> computer strength, from Monte Carlo calibration ---------- */
let CALIBRATION = {};   // replaced at build time with the measured table
const TARGET = level => 0.85 - 0.70 * (level - 1) / 9;   // average player's win chance at each level
function strengthFor(id, mode, level) {
  const t = CALIBRATION[id] && CALIBRATION[id][mode];
  return t && t.k ? t.k[clamp(level, 1, 10) - 1] : (clamp(level, 1, 10) - 1) / 9;
}
const PLAYER_PROFILES = [{ id: 'novice', label: 'Novice', s: 0.25 }, { id: 'average', label: 'Average', s: 0.5 }, { id: 'expert', label: 'Expert', s: 0.8 }];

