/* =====================================================================
   GEO POOL — CONTROLLERS. The computer and the simulated person share one
   shot-finding brain. It only uses what anyone at the table can see (where
   the balls are) and the same physics as the game. Strength decides how
   steady its cue arm is and how carefully it chooses; it never moves a ball.
   ===================================================================== */
const PoolBrain = (() => {
  const L = PoolLib, R = L.R;
  const erf = x => { const t = 1 / (1 + 0.3275911 * Math.abs(x)), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; };
  const unit = (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };

  // no other ball within a ball's width of the line a -> b
  function ballsClear(balls, ax, ay, bx, by, skip) {
    for (const o of balls) {
      if (!o.on || skip.includes(o.n)) continue;
      const c = L.closestOnSeg(o.x, o.y, ax, ay, bx, by);
      if ((o.x - c[0]) ** 2 + (o.y - c[1]) ** 2 < (2 * R - 0.5) ** 2) return false;
    }
    return true;
  }
  // the line doesn't run over a hole in the cloth (the ellipse's focus pocket), unless that hole is the goal
  function holesClear(T, ax, ay, bx, by, goal) {
    for (const p of T.pockets) {
      if (!p.hole || (goal && goal.px === p.x && goal.py === p.y)) continue;
      const c = L.closestOnSeg(p.x, p.y, ax, ay, bx, by);
      if (Math.hypot(p.x - c[0], p.y - c[1]) < p.cap + 3) return false;
    }
    return true;
  }
  // the line stays on the cloth (stops `short` pixels before b), so cushions and corners don't block it
  function clothClear(T, ax, ay, bx, by, short = 0) {
    const len = Math.hypot(bx - ax, by - ay) - short;
    for (let s = 0; s < len; s += 8) { const t = s / Math.hypot(bx - ax, by - ay); if (!L.fits(T, ax + (bx - ax) * t, ay + (by - ay) * t, -1)) return false; }
    return true;
  }
  // where a ray from (x, y) along (dx, dy) meets the ellipse the ball centres follow
  function ellipseExit(T, x, y, dx, dy) {
    const ex = (x - T.cx) / T.a, ey = (y - T.cy) / T.b, fx = dx / T.a, fy = dy / T.b;
    const A = fx * fx + fy * fy, B = 2 * (ex * fx + ey * fy), C = ex * ex + ey * ey - 1, t = (-B + Math.sqrt(B * B - 4 * A * C)) / (2 * A);
    return [x + dx * t, y + dy * t];
  }
  // every place a ball can be sent: real pockets, plus (on the ellipse) the far focus, which bounces into the focus pocket
  // aim points are where a ball's centre can actually reach: just off the cushion for side pockets, inside the corner for corner pockets
  function goals(T, focus) {
    const out = T.pockets.map(p => { const [nx, ny] = unit(p.aim[0] - p.x, p.aim[1] - p.y); return { x: p.aim[0], y: p.aim[1], px: p.x, py: p.y, nx, ny, cap: p.cap, hole: !!p.hole, corner: !!p.corner }; });
    if (focus && T.kind === 'ellipse') out.push({ x: T.f1[0], y: T.f1[1], cap: 0, focus: true });
    return out;
  }

  /* every pot this side could try from where the cue ball sits.
     Each comes with tol: how far off (radians) the cue can be and the ball still drops. */
  function shots(m, side, o = {}) {
    const T = m.table, balls = m.balls, cue = m.cue, out = [], cx = o.cx != null ? o.cx : cue.x, cy = o.cy != null ? o.cy : cue.y;
    for (const t of m.targets(side)) for (const g of goals(T, o.focus)) {
      const [dx, dy] = unit(g.x - t.x, g.y - t.y), gx = t.x - dx * 2 * R, gy = t.y - dy * 2 * R;
      if (!L.fits(T, gx, gy, -0.5)) continue;
      const ux = gx - cx, uy = gy - cy, dc = Math.hypot(ux, uy); if (dc < 2) continue;
      const cosc = (ux * dx + uy * dy) / dc; if (cosc < 0.2) continue;
      let w, dp;
      if (g.focus) {
        const [qx, qy] = ellipseExit(T, g.x, g.y, dx, dy), f2 = T.f2;
        if (!ballsClear(balls, t.x, t.y, g.x, g.y, [t.n, 0]) || !ballsClear(balls, g.x, g.y, qx, qy, [t.n, 0]) || !ballsClear(balls, qx, qy, f2[0], f2[1], [t.n, 0])) continue;
        if (!clothClear(T, t.x, t.y, g.x, g.y) || !holesClear(T, t.x, t.y, g.x, g.y)) continue;
        w = 8; dp = Math.hypot(g.x - t.x, g.y - t.y) + 2 * T.a;
      } else {
        if (!ballsClear(balls, t.x, t.y, g.x, g.y, [t.n, 0]) || !clothClear(T, t.x, t.y, g.x, g.y, g.cap * 0.9) || !holesClear(T, t.x, t.y, g.x, g.y, g)) continue;
        let face = 1;
        if (!g.corner && !g.hole) { face = -(dx * g.nx + dy * g.ny); if (face < -0.05) continue; face = 0.35 + 0.65 * Math.max(0, face); }
        w = (g.hole ? g.cap * 0.75 : g.cap * 0.7) * face; dp = Math.hypot(g.x - t.x, g.y - t.y);
      }
      if (!ballsClear(balls, cx, cy, gx, gy, [t.n, 0]) || !clothClear(T, cx, cy, gx, gy) || !holesClear(T, cx, cy, gx, gy)) continue;
      const vObj = L.speedFor(dp, 90), vHit = vObj / (cosc * (1 + L.E_BALL) / 2), v0 = L.speedFor(dc, vHit) * 1.08;
      if (v0 > L.MAXV * 1.12) continue;
      const tol = w * 2 * R * cosc / (dp * (dc + 20));
      out.push({ n: t.n, goal: g, a: Math.atan2(uy, ux), p: clamp(v0 / L.MAXV, 0.12, 1), tol, cut: Math.acos(clamp(cosc, -1, 1)), focus: !!g.focus });
    }
    return out;
  }
  const chance = (s, sigma) => erf(s.tol / (sigma * Math.SQRT2));

  // ball in hand: put the cue ball straight behind a ball, lined up with a pocket
  function placements(m, side, o = {}) {
    const T = m.table, out = [];
    for (const t of m.targets(side)) for (const g of goals(T, false)) {
      const [dx, dy] = unit(g.x - t.x, g.y - t.y);
      if (!ballsClear(m.balls, t.x, t.y, g.x, g.y, [t.n, 0]) || !clothClear(T, t.x, t.y, g.x, g.y, g.cap * 0.9) || !holesClear(T, t.x, t.y, g.x, g.y, g)) continue;
      for (const back of [45, 80, 130]) {
        const x = t.x - dx * (2 * R + back), y = t.y - dy * (2 * R + back);
        if (!L.placeOk(T, m.balls, x, y)) continue;
        const s = shots(m, side, { cx: x, cy: y }).find(c => c.n === t.n && c.goal.x === g.x && c.goal.y === g.y);
        if (s) out.push({ x, y, s });
      }
    }
    return out;
  }
  // when nothing can be potted: roll gently into one of your own balls so it isn't a foul
  function nudge(m, side) {
    const c = m.cue, opts = m.targets(side).filter(t => ballsClear(m.balls, c.x, c.y, t.x, t.y, [t.n, 0]) && clothClear(m.table, c.x, c.y, t.x, t.y, 2 * R) && holesClear(m.table, c.x, c.y, t.x, t.y));
    if (!opts.length) return null;
    const t = opts.reduce((a, b) => (Math.hypot(a.x - c.x, a.y - c.y) < Math.hypot(b.x - c.x, b.y - c.y) ? a : b));
    const d = Math.hypot(t.x - c.x, t.y - c.y);
    return { a: Math.atan2(t.y - c.y, t.x - c.x), p: clamp(L.speedFor(d + 60, 0) / L.MAXV, 0.15, 0.6) };
  }
  // no clean pot and no clean nudge: try some angles in your head and keep one that's legal
  function kick(m, side, tries, rng) {
    let best = null;
    for (let i = 0; i < tries; i++) {
      const a = rng.range(0, TAU), p = rng.range(0.25, 0.75), j = judge(m, side, a, p);
      if (j.pots) return { a, p };
      if (j.legal && !best) best = { a, p };
    }
    return best;
  }
  // imagine a batch of other shots (banks, combinations, kisses); keep one that still pots if the aim is a little off
  function search(m, side, tries, sigma, rng) {
    let best = null;
    for (let i = 0; i < tries; i++) {
      const a = rng.range(0, TAU), p = rng.range(0.2, 0.95), j = judge(m, side, a, p);
      if (!j.pots) continue;
      const robust = [-1.5, 1.5].filter(e => judge(m, side, a + e * sigma, p).pots).length / 2;
      const score = (0.4 + 0.6 * robust) * (0.7 + 0.3 * leave(m, side, j.r.balls, sigma));
      if (!best || score > best.score) best = { a, p, score };
    }
    return best;
  }
  // is this shot legal, and does it pot one of ours? (judged on a copy of the table)
  function judge(m, side, a, p) {
    const r = L.simulate(m.table, m.balls, a, p), K = L.kind, g = m.group[side], tg = m.targets(side).map(b => b.n);
    const legal = !r.scratch && r.first != null && tg.includes(r.first) && !(r.potted.includes(8) && !(g && m.onTable(g) === 0));
    const potsOwn = r.potted.some(n => (g ? K(n) === g : n !== 8)) || (g && m.onTable(g) === 0 && r.potted.includes(8));
    return { legal, pots: legal && potsOwn, r };
  }
  // how good is the next shot from where these balls end up? (0..1)
  function leave(m, side, balls, sigma) {
    const next = Object.assign(Object.create(Object.getPrototypeOf(m)), m, { balls });
    if (!next.cue.on) return 0;
    let best = 0;
    for (const s of shots(next, side)) best = Math.max(best, chance(s, sigma));
    return best;
  }
  return { search, leave, shots, chance, placements, nudge, kick, judge, erf };
})();

const poolSigma = k => 0.0015 + 0.061 * Math.pow(1 - k, 2.2);   // the computer's aiming wobble, in radians

class PoolComputer {
  constructor(side, k, rng) { this.side = side; this.k = k; this.rng = rng; this.t = 0; this.plan = null; }
  act(m, dt) {
    if (m.result || m.turn !== this.side || m.phase !== 'aim' || m.wait > 0) { this.t = 0; this.plan = null; return null; }
    this.t += dt; if (this.t < 0.7) return null;              // a moment to "line up", so people can follow
    if (!this.plan) this.plan = this.think(m);
    const pl = this.plan;
    if (pl.place && m.inHand && !pl.placed) { pl.placed = true; return { place: pl.place }; }
    if (this.t < 1.1) return null;
    const k = this.k, sig = poolSigma(k), rng = this.rng;
    this.plan = null; this.t = 0;
    return { shoot: { a: pl.a + rng.gauss() * sig, p: clamp(pl.p * (1 + rng.gauss() * (0.02 + 0.12 * (1 - k))), 0.05, 1) } };
  }
  think(m) {
    const k = this.k, rng = this.rng, side = this.side, sig = poolSigma(k), B = PoolBrain;
    if (m.isBreak) { const f = m.balls.find(b => b.n !== 0 && b.on && Math.abs(b.x - m.table.foot[0]) < 2 && Math.abs(b.y - m.table.foot[1]) < 2) || m.balls[1]; return { a: Math.atan2(f.y - m.cue.y, f.x - m.cue.x) + rng.range(-0.01, 0.01), p: 0.7 + 0.3 * k }; }
    let place = null, cx = m.cue.x, cy = m.cue.y;
    if (m.inHand && rng.chance(0.25 + 0.75 * k)) {          // a weak computer often leaves the cue ball where it is
      const ps = B.placements(m, side).sort((a, b) => b.s.tol - a.s.tol);
      if (ps.length) { const pick = k > 0.5 ? ps[0] : rng.pick(ps.slice(0, 4)); place = { x: pick.x, y: pick.y }; cx = pick.x; cy = pick.y; }
    }
    const view = place ? Object.assign(Object.create(Object.getPrototypeOf(m)), m, { balls: m.balls.map(b => (b.n === 0 ? Object.assign({}, b, { x: cx, y: cy }) : b)) }) : m;
    let cands = B.shots(view, side, { focus: k > 0.45 }).map(s => Object.assign(s, { pr: B.chance(s, sig) }));
    cands.sort((a, b) => b.pr - a.pr);
    let pick = null;
    if (cands.length && rng.chance(0.6 * (1 - k))) pick = rng.pick(cands);              // misreads the table
    else if (cands.length && k >= 0.35) {                                                 // checks its best ideas on a copy of the table
      for (const c of cands.slice(0, 4)) {
        const j = B.judge(view, side, c.a, c.p);
        c.score = c.pr * (j.pots ? 1 : j.legal ? 0.35 : 0.05);
        if (j.pots && k > 0.6) c.score *= 0.7 + 0.6 * B.leave(view, side, j.r.balls, sig);   // a strong player also plays for the next shot
      }
      pick = cands.slice(0, 4).sort((a, b) => b.score - a.score)[0];
      if (pick.score < 0.06) pick = null;
    } else if (cands.length && cands[0].pr > 0.05) pick = cands[0];
    if (k > 0.7 && (!pick || (pick.score != null ? pick.score : pick.pr) < 0.5)) {   // a strong player looks for something cleverer
      const alt = B.search(view, side, Math.round(80 * (k - 0.7) / 0.3), sig, rng);
      if (alt && (!pick || alt.score > (pick.score != null ? pick.score : pick.pr))) pick = alt;
    }
    if (!pick) {
      pick = B.nudge(view, side);
      if (!pick) pick = B.kick(view, side, Math.round(4 + 26 * k), rng);
      if (!pick) pick = { a: rng.range(0, TAU), p: rng.range(0.3, 0.7) };
    }
    return { a: pick.a, p: pick.p, place };
  }
}

/* A person, modelled. Skill s in 0..1: how steady the aim and power are, how often they spot
   the easiest pot, whether they use ball in hand well, and (if skilled) the ellipse's focus trick. */
const poolHumanSigma = s => 0.004 + 0.022 * Math.pow(1 - s, 1.2);
class PoolSimHuman {
  constructor(side, s, rng) { this.side = side; this.s = s; this.rng = rng; this.plan = null; }
  act(m) {
    if (m.result || m.turn !== this.side || m.phase !== 'aim' || m.wait > 0) { this.plan = null; return null; }
    const s = this.s, rng = this.rng, B = PoolBrain, side = this.side;
    if (!this.plan) {
      if (m.isBreak) { const f = m.balls.find(b => b.n !== 0 && Math.abs(b.x - m.table.foot[0]) < 2) || m.balls[1]; this.plan = { a: Math.atan2(f.y - m.cue.y, f.x - m.cue.x) + rng.gauss() * 0.01, p: rng.range(0.75, 1) }; }
      else {
        let place = null, view = m;
        if (m.inHand && rng.chance(0.3 + 0.7 * s)) {
          const ps = B.placements(m, side).sort((a, b) => b.s.tol - a.s.tol);
          if (ps.length) { const pk = rng.chance(0.4 + 0.6 * s) ? ps[0] : rng.pick(ps.slice(0, 5)); place = { x: pk.x, y: pk.y }; view = Object.assign(Object.create(Object.getPrototypeOf(m)), m, { balls: m.balls.map(b => (b.n === 0 ? Object.assign({}, b, { x: pk.x, y: pk.y }) : b)) }); }
        }
        const sig = poolHumanSigma(s), cands = B.shots(view, side, { focus: s > 0.6 && rng.chance(s) }).map(c => Object.assign(c, { pr: B.chance(c, sig) * (1 + rng.gauss() * 0.35 * (1 - s)) }));
        cands.sort((a, b) => b.pr - a.pr);
        let pick = cands.length ? (rng.chance(0.55 + 0.45 * s) ? cands[0] : rng.pick(cands.slice(0, 3))) : null;
        if (!pick || pick.pr < 0.04) pick = B.nudge(view, side) || B.kick(view, side, Math.round(4 + 14 * s), rng) || pick || { a: rng.range(0, TAU), p: 0.5 };
        this.plan = { a: pick.a, p: pick.p, place };
      }
    }
    const pl = this.plan;
    if (pl.place && m.inHand && !pl.placed) { pl.placed = true; return { place: pl.place }; }
    this.plan = null;
    return { shoot: { a: pl.a + rng.gauss() * poolHumanSigma(s), p: clamp(pl.p * (1 + rng.gauss() * (0.05 + 0.12 * (1 - s))), 0.05, 1) } };
  }
}
GAMES.pool.Computer = PoolComputer;
GAMES.pool.SimHuman = PoolSimHuman;
