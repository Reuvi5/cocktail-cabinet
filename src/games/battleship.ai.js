/* =====================================================================
   BATTLESHIP — CONTROLLERS. Both use the same targeting brain; the knobs
   decide how much of it they use. Neither ever looks at the enemy fleet:
   they only see their own record of hits, misses and sunk ships.
   ===================================================================== */
const BsBrain = {
  // knobs: density (use probability density), parity (chance to search on a checkerboard),
  //        lines (chance to follow a line of hits), slip (chance of a random shot), noise
  pick(g, remaining, kn, rng) {
    const N = BsLib.N, unknown = [], hits = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { if (g[y][x] === 0) unknown.push({ x, y }); if (g[y][x] === 2) hits.push({ x, y }); }
    if (rng.chance(kn.slip)) return rng.pick(unknown);
    const free = (x, y) => x >= 0 && y >= 0 && x < N && y < N && g[y][x] === 0;
    const nb = c => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: c.x + dx, y: c.y + dy })).filter(p => free(p.x, p.y));
    if (kn.density) {
      const w = BsLib.grid();
      for (const len of remaining) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) for (const hor of [true, false]) {
        let ok = true, cover = 0;
        for (let k = 0; k < len; k++) {
          const cx = x + (hor ? k : 0), cy = y + (hor ? 0 : k);
          if (cx >= N || cy >= N || g[cy][cx] === 1 || g[cy][cx] === 3) { ok = false; break; }
          if (g[cy][cx] === 2) cover++;
        }
        if (!ok || (hits.length && !cover)) continue;
        const wt = hits.length ? Math.pow(20, cover) : 1;
        for (let k = 0; k < len; k++) { const cx = x + (hor ? k : 0), cy = y + (hor ? 0 : k); if (g[cy][cx] === 0) w[cy][cx] += wt; }
      }
      let best = [], bw = -1;
      for (const c of unknown) { const v = w[c.y][c.x] * (1 + rng.range(-kn.noise, kn.noise)); if (v > bw) { bw = v; best = [c]; } else if (v === bw) best.push(c); }
      return rng.pick(best.length ? best : unknown);
    }
    if (hits.length) {
      if (rng.chance(kn.lines)) for (const h of hits) for (const [dx, dy] of [[1, 0], [0, 1]]) {
        if (g[h.y + dy] && g[h.y + dy][h.x + dx] === 2) {
          let a = { x: h.x, y: h.y }, b = { x: h.x, y: h.y };
          while (g[a.y - dy] && g[a.y - dy][a.x - dx] === 2) a = { x: a.x - dx, y: a.y - dy };
          while (g[b.y + dy] && g[b.y + dy][b.x + dx] === 2) b = { x: b.x + dx, y: b.y + dy };
          const ends = [{ x: a.x - dx, y: a.y - dy }, { x: b.x + dx, y: b.y + dy }].filter(p => free(p.x, p.y));
          if (ends.length) return rng.pick(ends);
        }
      }
      const opts = hits.flatMap(nb);
      if (opts.length) return rng.pick(opts);
    }
    if (rng.chance(kn.parity)) {
      const mlen = Math.min(...remaining), par = unknown.filter(c => (c.x + c.y) % mlen === 0);
      if (par.length) return rng.pick(par);
    }
    return rng.pick(unknown);
  },
};
const BS_RANKS = ['Recruit', 'Ensign', 'Lieutenant', 'Captain', 'Commodore', 'Admiral'];
const bsRank = k => 1 + Math.min(5, Math.floor(k * 6));

class BattleshipComputer {
  constructor(side, k, rng) { this.side = side; this.k = k; this.rng = rng; this.t = 0; }
  act(m, dt) {
    const L = bsRank(this.k);
    if (m.phase === 'place') return m.fleets[this.side] ? null : { fleet: BsLib.randomFleet(this.rng, L >= 2) };
    if (m.phase !== 'battle' || m.turn !== this.side || m.wait > 0) { this.t = 0; return null; }
    this.t += dt; if (this.t < 0.55) return null;      // a beat before firing, so you can follow the game
    const kn = { density: L >= 4, noise: L >= 5 ? 0 : 0.15, lines: L >= 2 ? 1 : 0, parity: L >= 3 ? 1 : 0, slip: 0.75 * Math.pow(1 - this.k, 1.5) };   // a weak admiral mostly fires blind
    return { fire: BsBrain.pick(m.shots[this.side], m.remaining(1 - this.side), kn, this.rng) };
  }
}
/* A person, modelled. Skill s in 0..1: follows a line of hits most of the time, searches on a
   checkerboard if skilled, and now and then takes a hunch shot somewhere random. */
class BattleshipSimHuman {
  constructor(side, s, rng) { this.side = side; this.s = s; this.rng = rng; }
  act(m) {
    if (m.phase === 'place') return m.fleets[this.side] ? null : { fleet: BsLib.randomFleet(this.rng, this.rng.chance(0.5)) };
    if (m.phase !== 'battle' || m.turn !== this.side || m.wait > 0) return null;
    const s = this.s, kn = { density: false, lines: 0.6 + 0.4 * s, parity: s, slip: (1 - s) * 0.2 };
    return { fire: BsBrain.pick(m.shots[this.side], m.remaining(1 - this.side), kn, this.rng) };
  }
}
GAMES.battleship.Computer = BattleshipComputer;
GAMES.battleship.SimHuman = BattleshipSimHuman;
