/* =====================================================================
   SNAKE — CONTROLLERS (computer opponent + simulated human for testing)
   ===================================================================== */
class SnakeComputer {
  constructor(side, k, rng) { this.side = side; this.k = k; this.rng = rng; this.wait = rng.range(0.35, 0.8); }
  act(m, dt) { return this.side === 0 ? this.steer(m, dt) : this.placeApple(m, dt); }

  // Placer. Below zero "smart" is friendly (open, easy squares); above zero it hunts for traps.
  placeApple(m, dt) {
    if (m.apple) { this.wait = this.rng.range(0.35, 0.8); return null; }
    this.wait -= dt; if (this.wait > 0) return null;
    const { DIRS, inB, pathTo } = SnakeLib, rng = this.rng, cells = m.legalCells();
    if (!cells.length) return null;
    const smart = clamp(-0.8 + 1.5 * this.k + 0.03 * (m.stage - 1), -0.8, 1);
    let best = null, bs = -1e9;
    for (const c of rng.shuffle(cells.slice()).slice(0, 70)) {
      let s = 0;
      if (!m.safeAfter(pathTo(m._legalRes, m.body[0].x, m.body[0].y, c.x, c.y))) s += 40;
      s += (c.d / c.b) * 25;
      let walls = 0; for (const dd of DIRS) { const nx = c.x + dd.x, ny = c.y + dd.y; if (!inB(nx, ny) || m.body.some(b => b.x === nx && b.y === ny)) walls++; }
      s += walls * 6;
      s = s * smart + rng.next() * 60 * (1 - Math.abs(smart) * 0.8);
      if (smart < 0) {   // a friendly placer also likes apples straight ahead of the snake, away from its body
        const h = m.body[0], ahead = (m.dir.x && c.y === h.y && Math.sign(c.x - h.x) === m.dir.x) || (m.dir.y && c.x === h.x && Math.sign(c.y - h.y) === m.dir.y);
        if (ahead) s += 30 * -smart;
        s -= walls * 8 * -smart;
      }
      if (s > bs) { bs = s; best = c; }
    }
    this.wait = 99;
    return { place: { x: best.x, y: best.y } };
  }

  // Snake. Path-finds to the apple; a weaker snake skips the "can I get back out" check and wanders now and then.
  steer(m, dt) {
    if (!m.willMove(dt)) return null;
    const { DIRS, idx, inB, freeAt, bfs, pathTo, flood } = SnakeLib, rng = this.rng, k = this.k;
    const h = m.body[0], fa = freeAt(m.body, m.grow);
    const moves = DIRS.filter(d => !(d.x === -m.dir.x && d.y === -m.dir.y)).filter(d => { const nx = h.x + d.x, ny = h.y + d.y; return inB(nx, ny) && fa[idx(nx, ny)] <= 1; });
    if (!moves.length) return null;
    if (rng.chance(Math.pow(1 - k, 1.5) * 0.3 * (m.hunger > 4 ? 1 : 0.2))) return { dir: rng.pick(moves) };
    const careful = rng.chance(clamp(0.9 * k + 0.02 * (m.stage - 1), 0, 0.97));
    if (m.apple) {
      const path = pathTo(bfs(h.x, h.y, fa), h.x, h.y, m.apple.x, m.apple.y);
      if (path && path.length && (!careful || m.safeAfter(path) || m.hunger <= path.length + 2)) return { dir: { x: path[0].x - h.x, y: path[0].y - h.y } };
    }
    // stall safely: keep the tail reachable, prefer the longest way round, else the most space
    let best = null, bs = -1e9;
    for (const d of moves) {
      const nb = [{ x: h.x + d.x, y: h.y + d.y }].concat(m.body);
      if (m.grow <= 0) nb.pop();
      const f2 = freeAt(nb, Math.max(0, m.grow - 1)), t = nb[nb.length - 1];
      const tailD = bfs(nb[0].x, nb[0].y, f2).d[idx(t.x, t.y)];
      let s = flood(nb[0].x, nb[0].y, f2);
      if (tailD > 0) s += 1000 + tailD * 2;
      if (m.apple) s -= (Math.abs(nb[0].x - m.apple.x) + Math.abs(nb[0].y - m.apple.y)) * 0.5;
      if (s > bs) { bs = s; best = d; }
    }
    return { dir: best };
  }
}

/* A person, modelled. Skill s in 0..1.
   Snake: heads for the apple by eye (no path-finding), spots obvious dead ends only
   sometimes, and now and then turns a beat late (more often as the snake speeds up).
   Placer: takes 0.6–2 s to choose and likes far corners and spots beside the body. */
class SnakeSimHuman {
  constructor(side, s, rng) { this.side = side; this.s = s; this.rng = rng; this.think = rng.range(0.6, 2); }
  act(m, dt) { return this.side === 0 ? this.steer(m, dt) : this.placeApple(m, dt); }
  steer(m, dt) {
    if (!m.willMove(dt)) return null;
    const { DIRS, idx, inB, freeAt, flood } = SnakeLib, rng = this.rng, s = this.s;
    const h = m.body[0], fa = freeAt(m.body, m.grow);
    const opts = DIRS.filter(d => !(d.x === -m.dir.x && d.y === -m.dir.y)).map(d => {
      const nx = h.x + d.x, ny = h.y + d.y, dead = !inB(nx, ny) || fa[idx(nx, ny)] > 1;
      return { d, dead, nx, ny };
    });
    const alive = opts.filter(o => !o.dead);
    if (!alive.length) return null;
    // looks a few squares ahead for traps, more reliably when skilled
    const sees = rng.chance(0.45 + 0.5 * s);
    let best = null, bs = -1e9;
    for (const o of alive) {
      let sc = 0;
      if (m.apple) sc -= Math.abs(o.nx - m.apple.x) + Math.abs(o.ny - m.apple.y);
      if (o.d.x === m.dir.x && o.d.y === m.dir.y) sc += 0.4;                    // likes going straight
      if (sees) { const nb = [{ x: o.nx, y: o.ny }].concat(m.body); nb.pop(); const room = flood(o.nx, o.ny, freeAt(nb, m.grow)); if (room < m.body.length + 4) sc -= 60; }
      sc += rng.range(0, 1.2 - s);
      if (sc > bs) { bs = sc; best = o; }
    }
    // reaction: at high speed a turn sometimes comes one square late
    // (people plan turns ahead, so a late turn straight into a wall or the body is rarer)
    const straight = opts.find(o => o.d.x === m.dir.x && o.d.y === m.dir.y);
    const late = (1 - s) * 0.07 * Math.pow(0.165 / m.interval, 2) * (straight && straight.dead ? 0.2 : 1);
    if (!(best.d.x === m.dir.x && best.d.y === m.dir.y) && rng.chance(late)) return null;
    // and very occasionally a plain slip of the finger into danger
    if (rng.chance((1 - s) * 0.0015)) { const d = rng.pick(opts); return { dir: d.d }; }
    return { dir: best.d };
  }
  placeApple(m, dt) {
    if (m.apple) { this.think = this.rng.range(0.6, 2.0); return null; }
    this.think -= dt; if (this.think > 0) return null;
    const cells = m.legalCells(); if (!cells.length) return null;
    const { DIRS, inB, C, R } = SnakeLib, rng = this.rng, h = m.body[0];
    let best = null, bs = -1e9;
    for (const c of cells) {
      let sc = (c.d / c.b) * 10 * this.s;                                   // far away (as far as the rules allow)
      const edge = (c.x === 0 || c.y === 0 || c.x === C - 1 || c.y === R - 1) ? 1 : 0;
      let touch = 0; for (const dd of DIRS) { const nx = c.x + dd.x, ny = c.y + dd.y; if (inB(nx, ny) && m.body.some(b => b.x === nx && b.y === ny)) touch++; }
      sc += edge * 3 * this.s + touch * 3 * this.s + rng.range(0, 12 * (1 - this.s) + 2);
      if (sc > bs) { bs = sc; best = c; }
    }
    this.think = 99;
    return { place: { x: best.x, y: best.y } };
  }
}
GAMES.snake.Computer = SnakeComputer;
GAMES.snake.SimHuman = SnakeSimHuman;
