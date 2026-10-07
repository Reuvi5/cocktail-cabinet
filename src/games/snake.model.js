/* =====================================================================
   SNAKE — MODEL. Side 0 steers the snake, side 1 places the apples.
   Actions:  side 0  { turn: {x,y} }  queue a turn (keyboard)  |  { dir: {x,y} }  set the next move outright
             side 1  { place: {x,y} }
   ===================================================================== */
const SnakeLib = (() => {
  const C = 20, R = 14, WIN = 20, PLACE_LIMIT = 4.5;
  const DIRS = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
  const idx = (x, y) => y * C + x;
  const inB = (x, y) => x >= 0 && y >= 0 && x < C && y < R;
  // each body cell frees up after (len - k + grow) moves
  function freeAt(body, grow) {
    const f = new Int16Array(C * R), n = body.length;
    for (let k = 0; k < n; k++) f[idx(body[k].x, body[k].y)] = n - k + grow;
    return f;
  }
  // time-aware BFS: a cell can be entered once it will have been vacated
  function bfs(sx, sy, fa) {
    const d = new Int16Array(C * R).fill(-1), par = new Int16Array(C * R).fill(-1);
    const q = [idx(sx, sy)]; d[q[0]] = 0;
    for (let h = 0; h < q.length; h++) {
      const c = q[h], cx = c % C, cy = (c / C) | 0;
      for (const dd of DIRS) {
        const nx = cx + dd.x, ny = cy + dd.y; if (!inB(nx, ny)) continue;
        const ni = idx(nx, ny); if (d[ni] >= 0) continue;
        if (fa[ni] > d[c] + 1) continue;
        d[ni] = d[c] + 1; par[ni] = c; q.push(ni);
      }
    }
    return { d, par };
  }
  function pathTo(res, sx, sy, tx, ty) {
    const out = []; let c = idx(tx, ty); if (res.d[c] < 0) return null;
    const s = idx(sx, sy);
    while (c !== s) { out.push({ x: c % C, y: (c / C) | 0 }); c = res.par[c]; }
    return out.reverse();
  }
  function flood(sx, sy, fa) { const r = bfs(sx, sy, fa); let n = 0; for (let i = 0; i < r.d.length; i++) if (r.d[i] > 0) n++; return n; }
  return { C, R, WIN, PLACE_LIMIT, DIRS, idx, inB, freeAt, bfs, pathTo, flood };
})();

class SnakeModel extends BaseModel {
  constructor(o) {
    super(o);
    this.body = [{ x: 6, y: 7 }, { x: 5, y: 7 }, { x: 4, y: 7 }];
    this.dir = { x: 1, y: 0 }; this.queue = [];
    this.grow = 0; this.eaten = 0; this.stage = 1;
    this.stepT = 0; this.apple = null; this.placeT = 0;
    this.hunger = 0; this.hungerMax = 1; this.moves = 0;
  }
  /* ----- rules that tighten every 5 apples ----- */
  get interval() { return Math.max(0.125, 0.165 - (this.stage - 1) * 0.01); }
  get growBy() { return 1; }
  budget(ax, ay) {
    const h = this.body[0], man = Math.abs(ax - h.x) + Math.abs(ay - h.y), L = this.stage;
    return Math.ceil(man * Math.max(1.5, 2.5 - 0.22 * (L - 1)) + Math.max(7, 18 - 2.2 * (L - 1)));
  }
  willMove(dt) { return this.stepT + dt >= this.interval; }
  /* ----- placement rules, the same for both placers ----- */
  validity(x, y, res) {
    const { inB, bfs, freeAt, idx } = SnakeLib;
    if (!inB(x, y)) return { ok: false };
    if (this.body.some(b => b.x === x && b.y === y)) return { ok: false, why: 'on the snake' };
    const h = this.body[0];
    if (Math.abs(x - h.x) + Math.abs(y - h.y) < 3) return { ok: false, why: 'too close to the head' };
    res = res || bfs(h.x, h.y, freeAt(this.body, this.grow));
    const d = res.d[idx(x, y)];
    if (d < 0) return { ok: false, why: 'unreachable' };
    const b = this.budget(x, y);
    if (d > b) return { ok: false, why: 'too far to reach in time' };
    return { ok: true, d, b, res };
  }
  // every legal square at once (one BFS), cached until the snake moves
  legalCells() {
    const key = this.moves + ':' + this.grow;
    if (this._legalKey === key) return this._legal;
    const { C, R, bfs, freeAt } = SnakeLib, h = this.body[0], res = bfs(h.x, h.y, freeAt(this.body, this.grow)), out = [];
    for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) { const v = this.validity(x, y, res); if (v.ok) out.push({ x, y, d: v.d, b: v.b }); }
    this._legalKey = key; this._legal = out; this._legalRes = res;
    return out;
  }
  place(x, y) {
    const v = this.validity(x, y); if (!v.ok) return v;
    this.apple = { x, y, t: 0 }; this.hungerMax = v.b; this.hunger = v.b; this.placeT = 0;
    this.sfx(520, 0.06, 'triangle');
    return v;
  }
  // after following path and eating, can the snake still reach its tail?
  safeAfter(path) {
    if (!path) return false;
    const { bfs, freeAt, idx } = SnakeLib, n = this.body.length;
    let nb = path.slice().reverse().concat(this.body);
    nb = nb.slice(0, n + Math.min(this.grow, path.length));
    const h = nb[0], t = nb[nb.length - 1];
    return bfs(h.x, h.y, freeAt(nb, this.growBy)).d[idx(t.x, t.y)] > 0;
  }
  /* ----- one tick ----- */
  step(dt, acts) {
    this.time += dt;
    const a0 = acts[0] || {}, a1 = acts[1] || {};
    if (a0.dir) this.queue = [a0.dir];
    else if (a0.turn) {
      const last = this.queue.length ? this.queue[this.queue.length - 1] : this.dir, m = a0.turn;
      if (!(m.x === -last.x && m.y === -last.y) && !(m.x === last.x && m.y === last.y) && this.queue.length < 2) this.queue.push(m);
    }
    if (this.apple) this.apple.t += dt;
    else {
      if (a1.place) { const v = this.place(a1.place.x, a1.place.y); if (!v.ok) { this.emit('reject', { why: v.why }); } }
      if (!this.apple) {
        this.placeT += dt;
        if (this.placeT >= SnakeLib.PLACE_LIMIT) {
          const cells = this.legalCells();
          if (cells.length) { const c = this.rng.pick(cells); this.place(c.x, c.y); this.say('Too slow: apple dropped at random'); }
        }
      }
    }
    this.stepT += dt;
    if (this.stepT >= this.interval) { this.stepT -= this.interval; this.move(); }
  }
  move() {
    const { inB } = SnakeLib;
    if (this.queue.length) { const d = this.queue.shift(); if (!(d.x === -this.dir.x && d.y === -this.dir.y)) this.dir = d; }
    const h = this.body[0], nx = h.x + this.dir.x, ny = h.y + this.dir.y, tailMoves = this.grow <= 0;
    const hit = !inB(nx, ny) || this.body.some((b, i) => b.x === nx && b.y === ny && !(tailMoves && i === this.body.length - 1));
    if (hit) return this.die(inB(nx, ny) ? 'The snake bit itself' : 'The snake hit the wall');
    this.body.unshift({ x: nx, y: ny }); this.moves++;
    if (this.grow > 0) this.grow--; else this.body.pop();
    if (!this.apple) return;
    this.hunger--;
    if (nx === this.apple.x && ny === this.apple.y) {
      this.eaten++; this.grow += this.growBy; this.apple = null; this.placeT = 0;
      this.emit('burst', { x: nx, y: ny }); this.sfx(880, 0.07); this.sfx(1320, 0.06);
      const ns = 1 + Math.floor(this.eaten / 5);
      if (ns > this.stage) { this.stage = ns; this.say('Stage ' + ns + ': faster, hungrier'); }
      if (this.eaten >= SnakeLib.WIN) this.finish(0, 'SNAKE WINS!', `Ate all ${SnakeLib.WIN} apples.\nThe placer couldn't stop it.`);
    } else if (this.hunger <= 0) this.die('The snake starved');
  }
  die(why) {
    this.dead = why; this.boom(0.4);
    this.finish(1, 'APPLE PLACER WINS!', `${why} after ${this.eaten} apple${this.eaten === 1 ? '' : 's'}.\nStage ${this.stage}.`);
  }
}

GAMES.snake = {
  id: 'snake', Model: SnakeModel, maxTime: 600,
  modes: [{ ctrl: ['human', 'cpu'] }, { ctrl: ['cpu', 'human'] }],
  stats: m => ({ apples: m.eaten, stage: m.stage, end: m.dead || '' }),
};
