/* =====================================================================
   FLAPPY BIRD — MODEL. Side 0 is the bird, side 1 builds the columns.
   Actions:  side 0  { flap: true }
             side 1  { gapY: y, gapSize: px }   where the next gap should go and how big (never below the minimum)
   ===================================================================== */
const FlappyLib = { GROUND: 560, BX: 220, BR: 14, G: 1500, FLAP: -470, CW: 72, SPACING: 300, WIN: 30, LIVES: 3, MAXGAP: 250 };

class FlappyModel extends BaseModel {
  constructor(o) {
    super(o);
    this.bird = { y: 280, vy: 0, rot: 0, alive: true, ghost: 0 };
    this.lives = FlappyLib.LIVES; this.cols = []; this.passed = 0; this.stage = 1; this.scroll = 0;
    this.prevY = 290; this.want = { y: 290, gap: FlappyLib.MAXGAP };
    this.spawn(W + 40, 290, 205);   // the first column is always gentle
  }
  get speed() { return 165 + 10 * (this.stage - 1); }
  get minGap() { return Math.max(118, 192 - 14 * (this.stage - 1)); }
  get maxD() { return Math.min(230, 85 + 27 * (this.stage - 1)); }
  bounds(gap) { return [40 + gap / 2, FlappyLib.GROUND - 24 - gap / 2]; }
  allowed(gap) { const [lo, hi] = this.bounds(gap), d = this.maxD; return [Math.max(lo, this.prevY - d), Math.min(hi, this.prevY + d)]; }
  spawn(x, y, gap) {
    gap = clamp(Math.round(gap), this.minGap, FlappyLib.MAXGAP);
    const [lo, hi] = this.allowed(gap);
    y = clamp(y, lo, hi);
    this.cols.push({ x, gy: y, gap, passed: false }); this.prevY = y;
  }
  collides(y, x0) {
    const F = FlappyLib;
    if (y + F.BR >= F.GROUND) return true;
    for (const c of this.cols) {
      const cx = c.x - x0;
      if (cx > F.BX + F.BR || cx + F.CW < F.BX - F.BR) continue;
      const nx = clamp(F.BX, cx, cx + F.CW), top = c.gy - c.gap / 2, bot = c.gy + c.gap / 2;
      if ((F.BX - nx) ** 2 + (y - clamp(y, 0, top)) ** 2 < F.BR * F.BR) return true;
      if ((F.BX - nx) ** 2 + (y - clamp(y, bot, F.GROUND)) ** 2 < F.BR * F.BR) return true;
    }
    return false;
  }
  nextCol() { const F = FlappyLib; return this.cols.find(c => c.x + F.CW > F.BX - F.BR - 4); }
  step(dt, acts) {
    const F = FlappyLib, a0 = acts[0] || {}, a1 = acts[1] || {}, b = this.bird;
    this.time += dt;
    if (a1.gapY != null) this.want = { y: a1.gapY, gap: a1.gapSize != null ? a1.gapSize : this.minGap };
    if (a0.flap && b.alive) { b.vy = F.FLAP; this.sfx(700, 0.05, 'triangle', 0.03, 300); }
    b.vy += F.G * dt; b.y += b.vy * dt;
    if (b.y < F.BR) { b.y = F.BR; b.vy = 0; }
    b.rot = clamp(b.vy / 600, -0.5, 1.2);
    const v = this.speed * dt; this.scroll += v;
    for (const c of this.cols) c.x -= v;
    this.cols = this.cols.filter(c => c.x + F.CW > -10);
    const last = this.cols[this.cols.length - 1];
    if (!last || last.x <= W - F.SPACING + F.CW) this.spawn((last ? last.x : W) + F.SPACING, this.want.y, this.want.gap);
    for (const c of this.cols) if (!c.passed && c.x + F.CW < F.BX - F.BR) {
      c.passed = true; this.passed++; this.sfx(980, 0.04, 'square', 0.025);
      const ns = 1 + Math.floor(this.passed / 6);
      if (ns > this.stage) { this.stage = ns; this.say(`STAGE ${ns}: narrower gaps, bigger swings`, 2); }
      if (this.passed >= F.WIN) return this.finish(0, 'BIRD WINS!', `Made it through all ${F.WIN} columns.`);
    }
    if (b.ghost > 0) { b.ghost -= dt; return; }
    if (!this.collides(b.y, 0)) return;
    this.boom(0.35, 0.09); this.lives--; this.emit('burst', { x: F.BX, y: b.y });
    if (this.lives <= 0) { b.alive = false; return this.finish(1, 'SPLAT! BUILDER WINS', `The bird cleared ${this.passed} of ${F.WIN} columns.\nStage ${this.stage}.`); }
    const c = this.nextCol() || { gy: 290 };   // respawn in the middle of the nearest gap, see-through for a moment
    b.y = c.gy; b.vy = F.FLAP * 0.5; b.ghost = 1.6;
    this.say(`SPLAT! ${this.lives} ${this.lives === 1 ? 'LIFE' : 'LIVES'} LEFT`, 1.6);
  }
}

GAMES.flappy = {
  id: 'flappy', Model: FlappyModel, maxTime: 400,
  modes: [{ ctrl: ['human', 'cpu'] }, { ctrl: ['cpu', 'human'] }],
  stats: m => ({ passed: m.passed, lives: m.lives }),
};
