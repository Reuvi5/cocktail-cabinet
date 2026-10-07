/* =====================================================================
   BREAKOUT — MODEL. Side 0 is the paddle, side 1 the brick layer.
   Actions:  side 0  { target: x, serve: angle | true }
             side 1  layout phase: { set: {c,r,hp} } | { layout: grid } | { clear: true } | { ready: true }
                     play phase:   { drop: {c,r,hp} }
   ===================================================================== */
const BreakoutLib = (() => {
  const COLS = 13, ROWS = 9, BW = 56, BH = 22, PX = 60, PYG = 26, X0 = 12, Y0 = 64;
  const PY = 556, PH = 12, BR = 7, WALLS = 3, PSPEED = 1100, MIN_D = 100, COOLDOWN = 0.9, TOP = 40;
  const cx = c => X0 + c * PX, cy = r => Y0 + r * PYG;
  const emptyGrid = () => Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
  const reflectX = x => { const lo = BR, hi = W - BR, span = hi - lo, m = ((x - lo) % (2 * span) + 2 * span) % (2 * span); return m > span ? lo + 2 * span - m : lo + m; };
  // the computer's wall designs (also used by the "Surprise me" button)
  function pattern(L, rng) {
    const kinds = ['rows', 'pyramid', 'checker'];
    if (L >= 2) kinds.push('shield', 'pillars');
    if (L >= 3) kinds.push('fortress', 'shield');
    const k = rng.pick(kinds), out = [], bottom = clamp(2 + L, 3, ROWS - 1);
    const tough = r => (r >= bottom - 1 ? (L >= 4 ? 3 : L >= 2 ? 2 : 1) : r >= bottom - 3 && L >= 3 ? 2 : 1);
    if (k === 'rows') for (let r = bottom; r >= 0; r--) for (let c = 0; c < COLS; c++) out.push({ c, r, hp: tough(r) });
    if (k === 'checker') for (let r = bottom; r >= 0; r--) for (let c = 0; c < COLS; c++) if ((c + r) % 2 === 0) out.push({ c, r, hp: tough(r) + (L >= 3 ? 1 : 0) });
    if (k === 'pyramid') for (let r = bottom; r >= 0; r--) { const half = Math.max(0, 6 - (bottom - r)); for (let c = 6 - half; c <= 6 + half; c++) out.push({ c, r, hp: tough(r) }); }
    if (k === 'shield') { for (let c = 0; c < COLS; c++) out.push({ c, r: bottom, hp: Math.min(3, L) }); for (let r = bottom - 1; r >= 0; r--) for (let c = 0; c < COLS; c++) out.push({ c, r, hp: 1 }); }
    if (k === 'pillars') for (let r = bottom; r >= 0; r--) for (let c = 0; c < COLS; c++) if (c % 3 !== 1) out.push({ c, r, hp: r === bottom ? Math.min(3, L) : 1 });
    if (k === 'fortress') {
      const inside = [];
      for (let r = 0; r <= bottom; r++) for (let c = 1; c < COLS - 1; c++) { const edge = r === bottom || c === 1 || c === COLS - 2; (edge ? out : inside).push({ c, r, hp: edge ? 3 : 1 }); }
      out.sort((a, b) => b.r - a.r); out.push(...inside);
    }
    return out;
  }
  // fill a grid from a pattern, spending at most `points`
  function fill(pat, points) {
    const g = emptyGrid(); let left = points;
    for (const k of pat) { if (left <= 0) break; if (g[k.r][k.c]) continue; const hp = Math.min(k.hp, left); g[k.r][k.c] = hp; left -= hp; }
    return g;
  }
  return { COLS, ROWS, BW, BH, PX, PYG, X0, Y0, PY, PH, BR, WALLS, PSPEED, MIN_D, COOLDOWN, TOP, cx, cy, emptyGrid, reflectX, pattern, fill };
})();

class BreakoutModel extends BaseModel {
  constructor(o) {
    super(o);
    this.wall = 1; this.lives = 4; this.score = 0; this.clearT = 0; this.cool = 0;
    this.pad = { x: W / 2, tgt: W / 2 };
    this.startWall();
  }
  get pw() { return 120 - 10 * (this.wall - 1); }
  get speed() { return 335 + 30 * (this.wall - 1); }
  // A person laying bricks gets the full budget; the computer gets less at low strength, a little more at the top.
  get budget() {
    const base = 24 + 9 * (this.wall - 1);
    if (!this.isComputer(1)) return base;
    const k = this.ck(1), sk = clamp(0.1 + 0.8 * k + 0.05 * (this.wall - 1), 0, 1);
    return Math.round(base * (0.4 + 0.9 * sk + 0.8 * Math.pow(sk, 4)));
  }
  startWall() {
    const B = BreakoutLib;
    this.g = B.emptyGrid(); this.spent = 0; this.reserve = 0; this.cool = 0;
    this.ball = this.newBall(); this.phase = 'layout';
    this.say(`WALL ${this.wall}`, 1.6);
  }
  newBall() { return { x: this.pad.x, y: BreakoutLib.PY - BreakoutLib.PH / 2 - BreakoutLib.BR, vx: 0, vy: 0, stuck: true, t: 0, sp: this.speed }; }
  count() { let n = 0; for (const row of this.g) for (const v of row) if (v) n++; return n; }
  cost(g) { let n = 0; for (const row of g) for (const v of row) n += v; return n; }
  /* ----- brick layer rules ----- */
  layoutSet(c, r, hp) {
    const cost = hp - this.g[r][c];
    if (cost > this.budget - this.spent) { this.say('Not enough points', 1.2); this.sfx(150, 0.08, 'sawtooth'); return false; }
    this.g[r][c] = hp; this.spent += cost; this.sfx(300 + hp * 120, 0.04, 'triangle');
    return true;
  }
  ready() {
    if (!this.count()) { this.say('Lay at least one brick', 1.2); return; }
    this.reserve = this.budget - this.spent; this.phase = 'play'; this.cool = 0;
    this.sfx(660, 0.08); this.sfx(990, 0.1);
  }
  dropReason(c, r, hp) {
    const B = BreakoutLib;
    if (this.phase !== 'play' || this.clearT > 0) return 'wait';
    if (this.g[r][c]) return 'taken';
    if (this.reserve < hp) return 'reserve';
    if (this.cool > 0) return 'reloading';
    if (dist(B.cx(c) + B.BW / 2, B.cy(r) + B.BH / 2, this.ball.x, this.ball.y) < B.MIN_D) return 'too close to the ball';
    return null;
  }
  drop(c, r, hp) {
    const why = this.dropReason(c, r, hp); if (why) return why;
    this.g[r][c] = hp; this.reserve -= hp; this.cool = BreakoutLib.COOLDOWN;
    this.emit('drop', { c, r }); this.sfx(200, 0.08, 'square', 0.03, 200);
    return null;
  }
  serve(aim) {
    const b = this.ball; if (!b.stuck) return;
    const a = typeof aim === 'number' ? aim : this.rng.range(-0.45, 0.45);
    b.stuck = false; b.sp = this.speed; b.vx = Math.sin(a) * b.sp; b.vy = -Math.cos(a) * b.sp;
    this.sfx(440, 0.06);
  }
  /* ----- one tick ----- */
  step(dt, acts) {
    const B = BreakoutLib, a0 = acts[0] || {}, a1 = acts[1] || {};
    this.time += dt; this.cool -= dt;
    if (this.phase === 'layout') {
      if (a1.clear) { this.g = B.emptyGrid(); this.spent = 0; }
      if (a1.layout) { const c = this.cost(a1.layout); if (c <= this.budget) { this.g = a1.layout.map(r => r.slice()); this.spent = c; } }
      if (a1.set) this.layoutSet(a1.set.c, a1.set.r, a1.set.hp);
      if (a1.ready) this.ready();
      if (typeof a0.target === 'number') this.pad.tgt = a0.target;
      this.movePad(dt);
      return;
    }
    if (this.clearT > 0) {
      this.clearT -= dt;
      if (this.clearT <= 0) { this.wall++; this.lives = Math.min(6, this.lives + 1); this.startWall(); }
      return;
    }
    if (a1.drop) { const why = this.drop(a1.drop.c, a1.drop.r, a1.drop.hp); if (why && why !== 'wait') this.emit('reject', { why }); }
    if (typeof a0.target === 'number') this.pad.tgt = a0.target;
    if (a0.serve != null && a0.serve !== false) this.serve(a0.serve);
    this.movePad(dt);
    const b = this.ball;
    if (b.stuck) { b.t += dt; if (b.t > 3) this.serve(); }
    for (let i = 0; i < 3 && !this.result; i++) this.moveBall(dt / 3);
    if (!this.result && !this.count()) {
      if (this.wall >= B.WALLS) return this.finish(0, 'BREAKER WINS!', `All ${B.WALLS} walls smashed.\n${this.lives} ball${this.lives === 1 ? '' : 's'} to spare. Score ${this.score}.`);
      this.clearT = 1.3; this.say(`WALL ${this.wall} CLEARED! +1 BALL`); this.sfx(660, 0.1); this.sfx(880, 0.12); this.sfx(1100, 0.15);
    }
  }
  movePad(dt) {
    const p = this.pad, sp = BreakoutLib.PSPEED * dt;
    p.x = clamp(p.x + clamp(p.tgt - p.x, -sp, sp), this.pw / 2, W - this.pw / 2);
    if (this.ball.stuck) this.ball.x = p.x;
  }
  moveBall(dt) {
    const B = BreakoutLib, b = this.ball, p = this.pad;
    if (b.stuck) { b.x = p.x; b.y = B.PY - B.PH / 2 - B.BR; return; }
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.x < B.BR) { b.x = B.BR; b.vx = Math.abs(b.vx); }
    if (b.x > W - B.BR) { b.x = W - B.BR; b.vx = -Math.abs(b.vx); }
    if (b.y < B.TOP + B.BR) { b.y = B.TOP + B.BR; b.vy = Math.abs(b.vy); }
    if (b.vy > 0 && b.y + B.BR >= B.PY - B.PH / 2 && b.y < B.PY + B.PH / 2 && Math.abs(b.x - p.x) < this.pw / 2 + B.BR) {
      const off = clamp((b.x - p.x) / (this.pw / 2), -1, 1), ang = off * 1.05;
      b.sp = Math.min(this.speed + 120, b.sp + 6);
      b.vx = Math.sin(ang) * b.sp; b.vy = -Math.cos(ang) * b.sp; b.y = B.PY - B.PH / 2 - B.BR;
      this.sfx(392, 0.05); this.emit('paddle', {});
    }
    const c0 = Math.floor((b.x - B.BR - B.X0) / B.PX), c1 = Math.floor((b.x + B.BR - B.X0) / B.PX), r0 = Math.floor((b.y - B.BR - B.Y0) / B.PYG), r1 = Math.floor((b.y + B.BR - B.Y0) / B.PYG);
    hit: for (let r = Math.max(0, r0); r <= Math.min(B.ROWS - 1, r1); r++) for (let c = Math.max(0, c0); c <= Math.min(B.COLS - 1, c1); c++) {
      if (!this.g[r][c]) continue;
      const x = B.cx(c), y = B.cy(r), nx = clamp(b.x, x, x + B.BW), ny = clamp(b.y, y, y + B.BH);
      if ((b.x - nx) ** 2 + (b.y - ny) ** 2 >= B.BR * B.BR) continue;
      const ox = Math.min(b.x + B.BR - x, x + B.BW - (b.x - B.BR)), oy = Math.min(b.y + B.BR - y, y + B.BH - (b.y - B.BR));
      if (ox < oy) b.vx = b.x < x + B.BW / 2 ? -Math.abs(b.vx) : Math.abs(b.vx);
      else b.vy = b.y < y + B.BH / 2 ? -Math.abs(b.vy) : Math.abs(b.vy);
      this.g[r][c]--; this.score += 10;
      this.sfx(520 + this.g[r][c] * 140, 0.04, 'triangle');
      if (!this.g[r][c]) this.emit('burst', { x: x + B.BW / 2, y: y + B.BH / 2 });
      break hit;
    }
    const minVy = 0.28 * b.sp;   // never let the ball crawl sideways forever
    if (Math.abs(b.vy) < minVy) { b.vy = (b.vy < 0 ? -1 : 1) * minVy; b.vx = Math.sign(b.vx || 1) * Math.sqrt(b.sp * b.sp - minVy * minVy); }
    if (b.y > H + 20) {
      this.lives--; this.boom(0.3, 0.07);
      if (this.lives <= 0) return this.finish(1, 'BRICK LAYER WINS!', `The paddle ran out of balls on wall ${this.wall}.\nScore ${this.score}.`);
      this.say('BALL LOST', 1.2); this.ball = this.newBall();
    }
  }
}

GAMES.breakout = {
  id: 'breakout', Model: BreakoutModel, maxTime: 900,
  modes: [{ ctrl: ['human', 'cpu'] }, { ctrl: ['cpu', 'human'] }],
  stats: m => ({ wall: m.wall, lives: m.lives }),
};
