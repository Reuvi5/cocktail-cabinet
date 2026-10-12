/* =====================================================================
   GEO POOL — MODEL. 8-ball on three geometric tables: hexagon, cross, ellipse.
   Side 0 (blue) breaks; side 1 (red) is the computer or a second player.
   Actions, on your turn only:
     { place: { x, y } }    with ball in hand: move the cue ball (checked here)
     { shoot: { a, p, sx, sy } }   aim angle in radians, power 0..1, and where the cue tip
                            strikes the cue ball: sy > 0 top spin (follow), sy < 0 back spin (draw),
                            sx side spin (curves the ball and changes how it comes off a cushion)
   Each table has a gadget: linked PORTALS (hexagon), pinball BUMPERS (cross), a gravity WELL (ellipse).
   The same physics runs for every player and for the computer's planning.
   ===================================================================== */
const PoolLib = (() => {
  const R = 11, MAXV = 1500, MU = 220, LIN = 0.5, E_BALL = 0.94, E_RAIL = 0.78, STOP = 5, CX = 400, CY = 335;
  const FOLLOW = 0.62, CURVE = 270, SPIN_LIFE = 1.4, DRAW_LIFE = 3, KICK = 240;   // spin and gadget strengths

  /* ---------- the three tables ----------
     walls are the cushion lines; a ball's centre stays at least R away from them.
     pockets: { x, y, cap } — a ball whose centre comes within cap is pocketed. */
  function poly(id, name, verts, pockets, head, foot) {
    const edges = verts.map((p, i) => [p, verts[(i + 1) % verts.length]]);
    const cx = verts.reduce((s, p) => s + p[0], 0) / verts.length, cy = verts.reduce((s, p) => s + p[1], 0) / verts.length;
    return { id, name, kind: 'poly', verts, edges, pockets, head, foot, centroid: [cx, cy] };
  }
  // a corner pocket sits on a vertex; its aim point is as deep into the corner as a ball's centre can get
  function corner(verts, i, cap) {
    const [x, y] = verts[i], [px, py] = verts[(i + verts.length - 1) % verts.length], [qx, qy] = verts[(i + 1) % verts.length];
    let ux = px - x, uy = py - y, vx = qx - x, vy = qy - y; const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy); ux /= lu; uy /= lu; vx /= lv; vy /= lv;
    const bx = ux + vx, by = uy + vy, lb = Math.hypot(bx, by), half = Math.acos(ux * vx + uy * vy) / 2, d = R / Math.sin(half);
    return { x, y, cap, corner: true, aim: [x + bx / lb * d, y + by / lb * d] };
  }
  // a side pocket sits in a cushion; (nx, ny) points into the table
  const side = (x, y, nx, ny, cap) => ({ x, y, cap, aim: [x + nx * R, y + ny * R] });
  const hexV = Array.from({ length: 6 }, (_, i) => [CX + 250 * Math.cos(i * Math.PI / 3), CY + 250 * Math.sin(i * Math.PI / 3)]);
  const crossV = [[310, 105], [490, 105], [490, 245], [650, 245], [650, 425], [490, 425], [490, 565], [310, 565], [310, 425], [150, 425], [150, 245], [310, 245]];
  const EA = 279, EB = 184, EC = Math.sqrt(EA * EA - EB * EB);   // ellipse the ball CENTRES follow: its foci are exact
  const TABLES = {
    hexagon: Object.assign(poly('hexagon', 'Hexagon', hexV, hexV.map((_, i) => corner(hexV, i, 25)), [272, CY], [468, CY]),
      { portals: [{ x: 338, y: 190, r: 15 }, { x: 462, y: 480, r: 15 }] }),        // roll into one, come out of the other
    cross: Object.assign(poly('cross', 'Cross', crossV, [0, 1, 3, 4, 6, 7, 9, 10].map(i => corner(crossV, i, 24)), [240, CY], [442, CY]),
      { bumpers: [2, 5, 8, 11].map(i => ({ x: crossV[i][0], y: crossV[i][1], r: 15 })) }),   // the four inside corners kick back
    ellipse: {
      id: 'ellipse', name: 'Ellipse', kind: 'ellipse', a: EA, b: EB, c: EC, cx: CX, cy: CY,
      f1: [CX - EC, CY], f2: [CX + EC, CY],
      pockets: [{ x: CX + EC, y: CY, cap: 15, hole: true, aim: [CX + EC, CY] }, side(CX, CY - EB - R, 0, 1, 22), side(CX, CY + EB + R, 0, -1, 22), side(CX - EA - R, CY, 1, 0, 22)],
      head: [262, CY], foot: [452, CY],
      well: { x: CX, y: CY, r: 90, g: 400 },   // pulls rolling balls toward its centre, so their paths bend
    },
  };
  const TABLE_IDS = ['hexagon', 'cross', 'ellipse'];

  /* ---------- geometry helpers ---------- */
  function closestOnSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    return [ax + dx * t, ay + dy * t];
  }
  function inPoly(x, y, verts) {
    let inside = false;
    for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
      const [xi, yi] = verts[i], [xj, yj] = verts[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  // can a ball centre sit at (x, y) without touching a cushion? (margin m beyond the radius)
  function fits(T, x, y, m = 0) {
    if (T.kind === 'ellipse') { const a = T.a - m, b = T.b - m, dx = x - T.cx, dy = y - T.cy; return dx * dx / (a * a) + dy * dy / (b * b) <= 1; }
    if (!inPoly(x, y, T.verts)) return false;
    for (const [p, q] of T.edges) { const c = closestOnSeg(x, y, p[0], p[1], q[0], q[1]); if (Math.hypot(x - c[0], y - c[1]) < R + m) return false; }
    return true;
  }

  /* ---------- cushions ---------- */
  // side spin grips the cushion and throws the ball sideways along it
  // (right spin comes off a cushion further to the right of the way the ball was going, left spin to the left)
  function railSpin(b, nx, ny, vn, ix, iy) {
    if (!b.ss) return;
    const tx = -ny, ty = nx, side = Math.sign(-iy * tx + ix * ty) || 1, k = b.ss * 0.45 * -vn * side;
    b.vx += tx * k; b.vy += ty * k; b.ss *= 0.5;
  }
  function collideWalls(T, b, hk) {
    if (T.kind === 'ellipse') {
      const dx = b.x - T.cx, dy = b.y - T.cy, f = dx * dx / (T.a * T.a) + dy * dy / (T.b * T.b);
      if (f <= 1) return;
      const s = 1 / Math.sqrt(f); b.x = T.cx + dx * s; b.y = T.cy + dy * s;
      let nx = -(dx * s) / (T.a * T.a), ny = -(dy * s) / (T.b * T.b); const nl = Math.hypot(nx, ny); nx /= nl; ny /= nl;
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) { const ix = b.vx, iy = b.vy; b.vx -= (1 + E_RAIL) * vn * nx; b.vy -= (1 + E_RAIL) * vn * ny; railSpin(b, nx, ny, vn, ix, iy); if (hk) hk.rail(b, -vn); }
      return;
    }
    for (const [p, q] of T.edges) {
      const c = closestOnSeg(b.x, b.y, p[0], p[1], q[0], q[1]), dx = b.x - c[0], dy = b.y - c[1], d = Math.hypot(dx, dy);
      if (d >= R) continue;
      let nx, ny;
      if (d > 1e-6) { nx = dx / d; ny = dy / d; } else { nx = T.centroid[0] - b.x; ny = T.centroid[1] - b.y; const l = Math.hypot(nx, ny); nx /= l; ny /= l; }
      b.x = c[0] + nx * R; b.y = c[1] + ny * R;
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) { const ix = b.vx, iy = b.vy; b.vx -= (1 + E_RAIL) * vn * nx; b.vy -= (1 + E_RAIL) * vn * ny; railSpin(b, nx, ny, vn, ix, iy); if (hk) hk.rail(b, -vn); }
    }
    if (!inPoly(b.x, b.y, T.verts)) {   // never leave the table: put it back just inside the nearest cushion
      let best = null, bd = 1e9;
      for (const [p, q] of T.edges) { const c = closestOnSeg(b.x, b.y, p[0], p[1], q[0], q[1]), d = Math.hypot(b.x - c[0], b.y - c[1]); if (d < bd) { bd = d; best = c; } }
      const nx = T.centroid[0] - best[0], ny = T.centroid[1] - best[1], l = Math.hypot(nx, ny);
      b.x = best[0] + nx / l * R; b.y = best[1] + ny / l * R; b.vx *= -0.5; b.vy *= -0.5;
    }
  }

  /* ---------- gadgets ---------- */
  function collideBumpers(T, b, hk) {
    for (const u of T.bumpers) {
      const dx = b.x - u.x, dy = b.y - u.y, d = Math.hypot(dx, dy);
      if (d >= u.r + R || d < 1e-6) continue;
      const nx = dx / d, ny = dy / d, vn = b.vx * nx + b.vy * ny;
      b.x = u.x + nx * (u.r + R); b.y = u.y + ny * (u.r + R);
      if (vn < 0) {
        b.vx -= 1.9 * vn * nx; b.vy -= 1.9 * vn * ny;
        if (-vn > 25) { b.vx += nx * KICK; b.vy += ny * KICK; if (hk && hk.bump) hk.bump(b, u, -vn); }
      }
    }
  }
  function warp(T, b, hk) {
    const P = T.portals;
    if (b.warp != null) { const q = P[b.warp]; if (Math.hypot(b.x - q.x, b.y - q.y) > q.r + R + 2) b.warp = null; else return; }
    for (let i = 0; i < 2; i++) {
      const p = P[i]; if (Math.hypot(b.x - p.x, b.y - p.y) >= p.r) continue;
      const q = P[1 - i], v = Math.hypot(b.vx, b.vy) || 1;
      b.x = q.x + b.vx / v; b.y = q.y + b.vy / v; b.warp = 1 - i;
      if (hk && hk.warp) hk.warp(b, p, q);
      return;
    }
  }

  /* ---------- one physics frame: move, pockets, cushions, ball-on-ball, then cloth friction ----------
     balls: [{ n, x, y, vx, vy, on, sf, ss }]  (sf/ss: follow and side spin, cue ball only)
     hk (optional): { hit(a, b, impulse), rail(b, impulse), pot(b, pocket), bump(b, bumper, impulse), warp(b, from, to) }
     returns true while anything is still rolling */
  function step(T, balls, dt, hk) {
    let maxv = 0;
    for (const b of balls) if (b.on && (b.vx || b.vy)) { const v = Math.hypot(b.vx, b.vy); if (v > maxv) maxv = v; }
    if (!maxv) return false;
    const n = Math.min(16, Math.max(1, Math.ceil(maxv * dt / (R * 0.45)))), h = dt / n, NB = balls.length;
    for (let s = 0; s < n; s++) {
      for (const b of balls) if (b.on && (b.vx || b.vy)) { b.x += b.vx * h; b.y += b.vy * h; }
      for (const b of balls) {
        if (!b.on || !(b.vx || b.vy)) continue;
        for (const p of T.pockets) if ((b.x - p.x) ** 2 + (b.y - p.y) ** 2 < p.cap * p.cap) { b.on = false; b.vx = b.vy = 0; b.x = p.x; b.y = p.y; if (hk) hk.pot(b, p); break; }
        if (!b.on) continue;
        collideWalls(T, b, hk);
        if (T.bumpers) collideBumpers(T, b, hk);
        if (T.portals) warp(T, b, hk);
      }
      for (let i = 0; i < NB; i++) {
        const a = balls[i]; if (!a.on) continue;
        for (let j = i + 1; j < NB; j++) {
          const c = balls[j]; if (!c.on || !(a.vx || a.vy || c.vx || c.vy)) continue;
          const dx = c.x - a.x, dy = c.y - a.y, d2 = dx * dx + dy * dy;
          if (d2 >= 4 * R * R) continue;
          // rewind both balls to the exact moment they touched, so the hit sends the ball where the geometry says
          const rvx = c.vx - a.vx, rvy = c.vy - a.vy, vv = rvx * rvx + rvy * rvy, pv = dx * rvx + dy * rvy;
          let back = 0;
          if (pv < 0 && vv > 1e-9) { const disc = pv * pv - vv * (d2 - 4 * R * R); if (disc >= 0) { back = (-pv - Math.sqrt(disc)) / vv; if (back < -h * 1.5 || back > 0) back = 0; } }
          a.x += a.vx * back; a.y += a.vy * back; c.x += c.vx * back; c.y += c.vy * back;
          const ex = c.x - a.x, ey = c.y - a.y, d = Math.hypot(ex, ey) || 0.01, nx = ex / d, ny = ey / d, vrel = (a.vx - c.vx) * nx + (a.vy - c.vy) * ny;
          if (vrel > 0) {
            const cue = a.n === 0 ? a : c.n === 0 ? c : null, pre = cue && cue.sf ? [cue.vx, cue.vy] : null;
            const jj = (1 + E_BALL) / 2 * vrel; a.vx -= jj * nx; a.vy -= jj * ny; c.vx += jj * nx; c.vy += jj * ny;
            if (pre) { cue.vx += pre[0] * cue.sf * FOLLOW; cue.vy += pre[1] * cue.sf * FOLLOW; cue.sf = 0; cue.ss *= 0.4; }   // follow or draw kicks in at the hit
            if (hk) hk.hit(a, c, vrel);
          }
          a.x -= a.vx * back; a.y -= a.vy * back; c.x -= c.vx * back; c.y -= c.vy * back;
          const gx = c.x - a.x, gy = c.y - a.y, g = Math.hypot(gx, gy) || 0.01;
          if (g < 2 * R) { const push = (2 * R - g) / 2; a.x -= gx / g * push; a.y -= gy / g * push; c.x += gx / g * push; c.y += gy / g * push; }
        }
      }
    }
    let moving = false;
    const W = T.well;
    for (const b of balls) {
      if (!b.on || !(b.vx || b.vy)) continue;
      if (W) { const dx = W.x - b.x, dy = W.y - b.y, d = Math.hypot(dx, dy); if (d < W.r && d > 1) { const g = W.g * (1 - d / W.r) * dt / d; b.vx += dx * g; b.vy += dy * g; } }
      if (b.ss) {   // side spin swerves the cue ball, and wears off
        const v0 = Math.hypot(b.vx, b.vy);
        if (v0 > 30) { const k = b.ss * CURVE * dt / v0, ox = b.vx, oy = b.vy; b.vx = ox - oy * k; b.vy = oy + ox * k; const v1 = Math.hypot(b.vx, b.vy); b.vx *= v0 / v1; b.vy *= v0 / v1; }   // right spin bends right
        b.ss *= Math.exp(-dt / SPIN_LIFE); if (Math.abs(b.ss) < 0.01) b.ss = 0;
      }
      if (b.sf) { b.sf *= Math.exp(-dt / DRAW_LIFE); if (Math.abs(b.sf) < 0.01) b.sf = 0; }
      const v = Math.hypot(b.vx, b.vy), nv = v - (MU + LIN * v) * dt;
      if (nv < STOP) { b.vx = b.vy = 0; } else { b.vx *= nv / v; b.vy *= nv / v; moving = true; }
    }
    return moving;
  }

  // play a shot to the end on a copy of the balls (used by the computer to think, never to move real balls)
  function simulate(T, balls, a, p, maxT = 20, sx = 0, sy = 0) {
    const bs = balls.map(b => ({ n: b.n, x: b.x, y: b.y, vx: 0, vy: 0, on: b.on, sf: 0, ss: 0 }));
    const cue = bs.find(b => b.n === 0), v = clamp(p, 0, 1) * MAXV, out = { first: null, potted: [], scratch: false, rails: 0, balls: bs };
    strike(cue, a, v, sx, sy);
    const hk = { hit(x, y) { if (out.first == null && (x.n === 0 || y.n === 0)) out.first = x.n === 0 ? y.n : x.n; }, rail() { out.rails++; }, pot(b) { if (b.n === 0) out.scratch = true; else out.potted.push(b.n); } };
    for (let t = 0; t < maxT && step(T, bs, DT, hk); t += DT);
    return out;
  }

  // the cue tip meets the cue ball: speed, direction and spin (sx, sy kept inside the ball's face)
  function strike(cue, a, v, sx = 0, sy = 0) {
    const l = Math.hypot(sx, sy); if (l > 1) { sx /= l; sy /= l; }
    cue.vx = Math.cos(a) * v; cue.vy = Math.sin(a) * v; cue.sf = sy || 0; cue.ss = sx || 0; cue.warp = null;
  }
  // can a ball sit here without touching a gadget?
  function gadgetFree(T, x, y) {
    for (const u of T.bumpers || []) if (Math.hypot(x - u.x, y - u.y) < u.r + R + 1) return false;
    for (const p of T.portals || []) if (Math.hypot(x - p.x, y - p.y) < p.r + R + 1) return false;
    return true;
  }

  // the standard 15-ball triangle, apex at the foot spot pointing at the cue ball
  function rack(T, rng) {
    const [fx, fy] = T.foot, sp = 2 * R + 0.15, others = rng.shuffle([1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15]);
    const solid = others.find(n => n < 8), stripe = others.find(n => n > 8);
    const rest = others.filter(n => n !== solid && n !== stripe), corners = rng.chance(0.5) ? [solid, stripe] : [stripe, solid];
    const balls = [{ n: 0, x: T.head[0], y: T.head[1], vx: 0, vy: 0, on: true }];
    for (let i = 0; i < 5; i++) for (let j = 0; j <= i; j++) {
      const n = i === 2 && j === 1 ? 8 : i === 4 && j === 0 ? corners[0] : i === 4 && j === 4 ? corners[1] : rest.pop();
      balls.push({ n, x: fx + i * sp * Math.cos(Math.PI / 6), y: fy + (j - i / 2) * sp, vx: 0, vy: 0, on: true });
    }
    return balls;
  }

  const kind = n => (n === 8 ? 'eight' : n < 8 ? 'solid' : 'stripe');
  // can the cue ball be put here? on the cloth, clear of pockets and other balls
  function placeOk(T, balls, x, y) {
    if (!isFinite(x) || !isFinite(y) || !fits(T, x, y, 0.5) || !gadgetFree(T, x, y)) return false;
    for (const p of T.pockets) if (Math.hypot(x - p.x, y - p.y) < p.cap + R) return false;
    for (const b of balls) if (b.on && b.n !== 0 && Math.hypot(x - b.x, y - b.y) < 2 * R + 0.5) return false;
    return true;
  }
  function freeSpot(T, balls, x, y) {   // the nearest legal spot to (x, y), searching outward
    for (let r = 0; r < 300; r += 6) for (let k = 0; k < Math.max(1, Math.round(r / 4)); k++) {
      const a = k * TAU / Math.max(1, Math.round(r / 4)), px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (placeOk(T, balls, px, py)) return [px, py];
    }
    return [T.head[0], T.head[1]];
  }
  // stopping distance helpers for an ideal rolling ball under this cloth friction
  const distBetween = (v0, v1) => (v0 - v1) / LIN - MU / (LIN * LIN) * Math.log((MU + LIN * v0) / (MU + LIN * v1));
  function speedFor(s, vEnd = 0) { let lo = vEnd, hi = 6000; for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (distBetween(mid, vEnd) < s) lo = mid; else hi = mid; } return hi; }

  return { R, MAXV, E_BALL, TABLES, TABLE_IDS, CX, CY, step, simulate, strike, rack, kind, placeOk, freeSpot, fits, speedFor, closestOnSeg };
})();

class PoolModel extends BaseModel {
  constructor(o) {
    super(o);
    const L = PoolLib;
    this.table = L.TABLES[o.table] || L.TABLES[this.rng.pick(L.TABLE_IDS)];
    this.balls = L.rack(this.table, this.rng);
    this.turn = 0; this.group = [null, null]; this.phase = 'aim'; this.isBreak = true; this.inHand = false;
    this.wait = 0; this.shots = [0, 0]; this.potCount = [0, 0]; this.rollT = 0; this.shot = null; this.lastFoul = null;
    this.emit('turn', { side: 0, inHand: false, brk: true });
  }
  get cue() { return this.balls[0]; }
  ball(n) { return this.balls.find(b => b.n === n); }
  onTable(group) { return this.balls.filter(b => b.on && b.n !== 0 && PoolLib.kind(b.n) === group).length; }
  // the balls this side may legally hit first right now
  targets(side) {
    const g = this.group[side];
    if (!g) return this.balls.filter(b => b.on && b.n !== 0 && b.n !== 8);
    if (this.onTable(g) > 0) return this.balls.filter(b => b.on && b.n !== 0 && PoolLib.kind(b.n) === g);
    return this.balls.filter(b => b.on && b.n === 8);
  }
  step(dt, acts) {
    this.time += dt;
    if (this.result) return;
    if (this.wait > 0) { this.wait -= dt; return; }
    if (this.phase === 'roll') return this.roll(dt);
    const a = acts[this.turn];
    if (!a) return;
    if (a.place && this.inHand) {
      const { x, y } = a.place;
      if (PoolLib.placeOk(this.table, this.balls, x, y)) { this.cue.x = x; this.cue.y = y; this.emit('placed', { x, y }); }
    }
    if (a.shoot && isFinite(a.shoot.a)) this.shoot(a.shoot.a, clamp(+a.shoot.p || 0, 0.04, 1), clamp(+a.shoot.sx || 0, -1, 1), clamp(+a.shoot.sy || 0, -1, 1));
  }
  shoot(a, p, sx = 0, sy = 0) {
    const c = this.cue;
    PoolLib.strike(c, a, p * PoolLib.MAXV, sx, sy);
    this.phase = 'roll'; this.rollT = 0; this.inHand = false; this.shots[this.turn]++;
    this.shot = { first: null, potted: [], scratch: false, rails: 0 };
    this.emit('shot', { side: this.turn, p });
    this.sfx(140 + 260 * p, 0.05, 'triangle', 0.05);
  }
  roll(dt) {
    const s = this.shot, self = this;
    const hk = {
      hit(x, y, imp) { if (s.first == null && (x.n === 0 || y.n === 0)) s.first = x.n === 0 ? y.n : x.n; if (imp > 40) self.emit('click', { v: imp }); },
      rail(b, imp) { s.rails++; if (imp > 60) self.emit('rail', { v: imp }); },
      pot(b, p) { if (b.n === 0) s.scratch = true; else s.potted.push(b.n); self.emit('pot', { n: b.n, x: p.x, y: p.y }); },
      bump(b, u, imp) { self.emit('bump', { x: u.x, y: u.y, v: imp }); },
      warp(b, p, q) { self.emit('warp', { n: b.n, x0: p.x, y0: p.y, x1: q.x, y1: q.y }); },
    };
    this.rollT += dt;
    const moving = PoolLib.step(this.table, this.balls, dt, hk);
    if (moving && this.rollT < 25) return;
    for (const b of this.balls) { b.vx = b.vy = 0; b.sf = b.ss = 0; b.warp = null; }
    this.resolve();
  }
  // 8-ball rules, simplified the way phone pool games play them (no calling pockets)
  resolve() {
    const s = this.shot, me = this.turn, opp = 1 - me, K = PoolLib.kind, brk = this.isBreak;
    const mine = this.group[me], clearedBefore = mine && this.onTable(mine) + s.potted.filter(n => K(n) === mine).length === 0;
    let foul = null;
    if (s.scratch) foul = 'Scratch! The cue ball went in.';
    else if (s.first == null) foul = 'Foul: the cue ball hit nothing.';
    else if (!brk) {
      if (mine) { const want = clearedBefore ? 'eight' : mine; if (K(s.first) !== want) foul = `Foul: hit ${want === 'eight' ? 'something other than the 8' : 'the wrong group'} first.`; }
      else if (s.first === 8) foul = 'Foul: hit the 8 ball first.';
    }
    const objs = s.potted.filter(n => n !== 8);
    this.potCount[me] += objs.length;
    this.isBreak = false;
    if (s.potted.includes(8)) {
      if (brk) {   // 8 on the break: put it back on the foot spot
        const b8 = this.ball(8), [x, y] = PoolLib.freeSpot(this.table, this.balls.filter(b => b.n !== 8), this.table.foot[0], this.table.foot[1]);
        Object.assign(b8, { x, y, on: true, vx: 0, vy: 0 }); this.say('The 8 went in on the break, so it goes back on the spot.');
      } else {
        const win = clearedBefore && !foul;
        this.phase = 'done';
        return this.finish(win ? me : opp, '', win ? 'Sank the 8 ball.' : (foul ? 'Sank the 8 ball on a foul.' : 'Sank the 8 ball too early.'));
      }
    }
    if (!foul && !brk && !mine && objs.length) {   // first legal pot claims a group
      const g = K(objs[0]); this.group[me] = g; this.group[opp] = g === 'solid' ? 'stripe' : 'solid';
      this.emit('groups', { side: me, group: g });
    }
    const g = this.group[me];
    const keep = !foul && (g ? objs.some(n => K(n) === g) : objs.length > 0);
    this.lastFoul = foul;
    if (foul) this.emit('foul', { side: me, why: foul });
    if (s.scratch || foul) {
      const c = this.cue;
      if (!c.on) { const [x, y] = PoolLib.freeSpot(this.table, this.balls, this.table.head[0], this.table.head[1]); Object.assign(c, { x, y, on: true }); }
      else if (!PoolLib.placeOk(this.table, this.balls, c.x, c.y)) { const [x, y] = PoolLib.freeSpot(this.table, this.balls, c.x, c.y); c.x = x; c.y = y; }
    }
    this.phase = 'aim'; this.wait = 0.35;
    this.dry = objs.length ? 0 : (this.dry || 0) + 1;
    if (this.dry >= 60) return this.rerack(opp);   // stalemate: 60 shots in a row without a pot
    if (!keep) this.turn = opp;
    this.inHand = !!foul;
    this.emit('turn', { side: this.turn, inHand: this.inHand, same: keep });
  }
  rerack(breaker) {
    this.balls = PoolLib.rack(this.table, this.rng);
    Object.assign(this, { turn: breaker, group: [null, null], isBreak: true, inHand: false, dry: 0, phase: 'aim', wait: 0.6 });
    this.say('Stalemate! Nobody can pot a ball, so the table is racked again.', 3);
    this.emit('rerack', {}); this.emit('turn', { side: breaker, inHand: false, brk: true });
  }
}

GAMES.pool = {
  id: 'pool', Model: PoolModel, maxTime: 2400,
  modes: [{ ctrl: ['human', 'cpu'] }, { ctrl: ['human', 'human'] }],
  stats: m => ({ table: m.table.id, shots: m.shots[0] + m.shots[1], left: m.balls.filter(b => b.on && b.n).length }),
};
