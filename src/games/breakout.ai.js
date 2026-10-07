/* =====================================================================
   BREAKOUT — CONTROLLERS (computer opponent + simulated human)
   ===================================================================== */
class BreakoutComputer {
  constructor(side, k, rng) { this.side = side; this.k = k; this.rng = rng; this.think = 0; this.bthink = 1.5; this.serveT = 0; }
  sk(m) { return clamp(0.2 + 0.66 * this.k + 0.04 * (m.wall - 1), 0, 0.92); }            // paddle
  bsk(m) { return clamp(0.1 + 0.8 * this.k + 0.05 * (m.wall - 1), 0, 1); }               // brick layer
  act(m, dt) { return this.side === 0 ? this.paddle(m, dt) : this.layer(m, dt); }

  paddle(m, dt) {
    const B = BreakoutLib, b = m.ball, sk = this.sk(m), rng = this.rng, out = {};
    this.think -= dt;
    if (this.think <= 0) {
      this.think = Math.max(0.08, 0.42 - 0.32 * sk) * rng.range(0.8, 1.2);
      if (b.stuck) this.tgt = clamp(m.pad.x + rng.range(-120, 120), 100, W - 100);
      else if (b.vy > 0) {
        const t = (B.PY - B.PH / 2 - B.BR - b.y) / b.vy, x = B.reflectX(b.x + b.vx * t);
        let off = 0;
        if (rng.chance(sk)) {   // strike with the part of the paddle that sends the ball toward the most bricks
          let bsc = -1;
          for (let o = -0.75; o <= 0.76; o += 0.25) {
            const col = Math.floor((B.reflectX(x + Math.tan(o * 1.05) * (B.PY - B.cy(B.ROWS))) - B.X0) / B.PX); let n = 0;
            for (let r = 0; r < B.ROWS; r++) for (let c = col - 1; c <= col + 1; c++) if (c >= 0 && c < B.COLS) n += m.g[r][c];
            if (n > bsc) { bsc = n; off = o; }
          }
        }
        this.tgt = x - off * m.pw / 2 + (1 - sk) * 115 * (rng.next() * 2 - 1);
      } else this.tgt = m.pad.x + (b.x - m.pad.x) * 0.35;
    }
    if (this.tgt != null) out.target = this.tgt;
    if (b.stuck) { this.serveT += dt; if (this.serveT > 0.9) { out.serve = rng.range(-0.5, 0.5); this.serveT = 0; } }
    return out;
  }

  layer(m, dt) {
    const B = BreakoutLib, rng = this.rng, sk = this.bsk(m);
    if (m.phase === 'layout') {
      const keep = Math.round(m.budget * clamp(0.04 + 0.42 * sk + 0.02 * m.wall, 0, 0.5));
      return { layout: B.fill(B.pattern(m.wall, rng), m.budget - keep), ready: true };
    }
    this.bthink -= dt;
    if (this.bthink > 0 || m.cool > 0 || m.reserve < 1 || m.clearT > 0) return null;
    this.bthink = Math.max(0.5, 3 - 2.3 * sk - 0.15 * (m.wall - 1)) * rng.range(0.8, 1.25);
    const b = m.ball, want = sk > 0.85 && rng.chance(0.4) ? 3 : sk > 0.55 && rng.chance(0.6) ? 2 : 1, hp = Math.min(want, m.reserve);
    let best = null, bs = -1e9;
    for (let r = 0; r < B.ROWS; r++) for (let c = 0; c < B.COLS; c++) {
      if (m.dropReason(c, r, hp)) continue;
      let s = 0;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < B.ROWS && cc >= 0 && cc < B.COLS && m.g[rr][cc]) s += 1.5; }  // plug holes
      s += r * 0.35;                                                                 // low bricks send the ball back sooner
      if (!b.stuck && b.vy < 0) {                                                    // sit in the path of a rising ball
        const t = (B.cy(r) + B.BH - b.y) / b.vy;
        if (t > 0 && Math.abs(B.reflectX(b.x + b.vx * t) - (B.cx(c) + B.BW / 2)) < B.PX * 0.7) s += 14 * sk * sk;
      }
      s += rng.range(0, 5 * (1 - sk));
      if (s > bs) { bs = s; best = { c, r }; }
    }
    return best ? { drop: { c: best.c, r: best.r, hp } } : null;
  }
}

/* A person, modelled. Skill s in 0..1.
   Paddle: sees the ball about a quarter of a second late, guesses where it will land
   (well for one bounce, worse for more), and the hand overshoots or lags a little.
   Brick layer: lays a sensible wall, keeps some points back and drops a brick every
   few seconds, aimed at the ball's path only as well as their skill allows. */
class BreakoutSimHuman {
  constructor(side, s, rng) {
    this.side = side; this.s = s; this.rng = rng; this.hist = []; this.think = 0; this.drop = rng.range(2, 4);
    this.react = 0.3 - 0.16 * s;                 // seconds behind what is on screen
  }
  act(m, dt) { return this.side === 0 ? this.paddle(m, dt) : this.layer(m, dt); }
  paddle(m, dt) {
    const B = BreakoutLib, rng = this.rng, s = this.s, b = m.ball;
    this.hist.push({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, stuck: b.stuck });
    const lag = Math.round(this.react / dt); if (this.hist.length > lag + 1) this.hist.shift();
    const seen = this.hist[0];
    this.think -= dt;
    if (this.think <= 0) {
      this.think = rng.range(0.06, 0.14);
      if (seen.stuck) this.tgt = m.pad.x;
      else if (seen.vy > 0) {
        const t = (B.PY - B.PH / 2 - B.BR - seen.y) / seen.vy, raw = seen.x + seen.vx * t;
        const bounces = Math.floor(Math.abs(raw - W / 2) / (W / 2));
        const guess = B.reflectX(raw);
        const sigma = (1 - s) * 45 + bounces * (1 - s) * 90 + t * 25 * (1 - s);
        // now and then a bounce is misread completely (the ball is expected on the wrong side)
        const misread = bounces > 0 && rng.chance(0.12 * (1 - s) * bounces) ? (W - guess - guess) : 0;
        // once per descent a person commits to a read of the ball; some reads are just off
        if (this.descent !== b.vy > 0 && seen.vy > 0) { this.descent = true; this.lapse = rng.chance(0.07 * (1.15 - s)) ? rng.sign() * rng.range(70, 150) : rng.gauss() * (1 - s) * 18; }
        this.tgt = guess + misread + rng.gauss() * sigma + (this.lapse || 0);
      } else { this.descent = false; this.tgt = lerp(m.pad.x, seen.x, 0.25); }   // drifts toward the ball while it is up in the bricks
    }
    // a hand can only move so fast
    const hand = (600 + 500 * s) * dt;
    this.hand = this.hand == null ? m.pad.x : this.hand;
    this.hand += clamp(this.tgt - this.hand, -hand, hand);
    const out = { target: this.hand };
    if (b.stuck && rng.chance(dt / 0.8)) out.serve = true;
    return out;
  }
  layer(m, dt) {
    const B = BreakoutLib, rng = this.rng, s = this.s;
    if (m.phase === 'layout') {
      const keep = Math.round(m.budget * rng.range(0.1, 0.3));
      return { layout: B.fill(B.pattern(m.wall, rng), m.budget - keep), ready: true };
    }
    this.drop -= dt; if (this.drop > 0 || m.reserve < 1) return null;
    this.drop = rng.range(1.8, 4.2) - s;
    const b = m.ball, hp = Math.min(m.reserve, rng.chance(0.3) ? 2 : 1);
    const cands = [];
    for (let r = 0; r < B.ROWS; r++) for (let c = 0; c < B.COLS; c++) if (!m.dropReason(c, r, hp)) cands.push({ c, r });
    if (!cands.length) return null;
    // aim for the ball's column when it is rising, as accurately as skill allows
    const aimX = !b.stuck && b.vy < 0 ? b.x + b.vx * 0.4 + rng.gauss() * 140 * (1 - s) : rng.range(0, W);
    cands.sort((p, q) => Math.abs(B.cx(p.c) - aimX) - Math.abs(B.cx(q.c) - aimX) + (q.r - p.r) * 6);
    return { drop: Object.assign(rng.pick(cands.slice(0, 4)), { hp }) };
  }
}
GAMES.breakout.Computer = BreakoutComputer;
GAMES.breakout.SimHuman = BreakoutSimHuman;
