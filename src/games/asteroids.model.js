/* =====================================================================
   ASTEROIDS — MODEL. Side 0 is the pilot, side 1 sends the asteroids.
   Actions:  side 0  { turn: -1..1, thrust: bool, brake: bool, fire: bool }
             side 1  { launch: { x, y, vx, vy, size } }   (x,y on an edge; the model enforces every rule)
   ===================================================================== */
const AstLib = {
  WAVES: 5, WAVE_T: 40, RAD: { 3: 46, 2: 26, 1: 14 }, COST: { 3: 34, 2: 20, 1: 12 },
  ROT: 4.4, THRUST: 330, MAXV: 330, BSPD: 540, BLIFE: 0.85, BCOOL: 0.2, SHIP_R: 11, SAFE: 180,
  wrapD: (d, m) => (d > m / 2 ? d - m : d < -m / 2 ? d + m : d),
  edgePoint(x, y) {
    const d = [x, W - x, y, H - y], m = Math.min(...d), i = d.indexOf(m);
    return i === 0 ? { x: -20, y } : i === 1 ? { x: W + 20, y } : i === 2 ? { x, y: -20 } : { x, y: H + 20 };
  },
  randomEdge(rng) { const t = rng.next(), s = rng.int(0, 3); return s === 0 ? { x: -20, y: t * H } : s === 1 ? { x: W + 20, y: t * H } : s === 2 ? { x: t * W, y: -20 } : { x: t * W, y: H + 20 }; },
};

class AsteroidsModel extends BaseModel {
  constructor(o) {
    super(o);
    this.wave = 1; this.waveT = AstLib.WAVE_T; this.lives = 3; this.score = 0;
    this.ship = { x: W / 2, y: H / 2, vx: 0, vy: 0, a: -Math.PI / 2, thrust: false, inv: 2, cool: 0, dead: 0 };
    this.bullets = []; this.rocks = []; this.energy = 60;
    this.emit('banner', { text: 'WAVE 1' });
  }
  get regen() { return 5 + 2.6 * (this.wave - 1); }
  get cap() { return 3 + 1.5 * this.wave; }
  speedCap(size) { return (50 + 16 * this.wave) * (1 + (3 - size) * 0.3); }
  fieldCount() { return this.rocks.reduce((n, r) => n + (r.size === 3 ? 1 : r.size === 2 ? 0.5 : 0.25), 0); }
  // A person sending rocks earns energy at the full rate; a weaker computer sender holds back.
  get regenRate() {
    if (!this.isComputer(1)) return this.regen;
    const sk = clamp(0.1 + 0.75 * this.ck(1) + 0.04 * (this.wave - 1), 0, 0.95);
    return this.regen * (0.3 + 0.9 * sk);
  }
  rock(x, y, vx, vy, size) {
    const shape = []; for (let i = 0; i < 11; i++) shape.push(this.rng.range(0.72, 1.08));
    return { x, y, vx, vy, size, r: AstLib.RAD[size], rot: this.rng.range(0, TAU), spin: this.rng.range(-1.2, 1.2), shape };
  }
  launchReason(L) {
    const A = AstLib, s = this.ship;
    if (this.energy < A.COST[L.size]) return 'Not enough energy';
    if (this.fieldCount() + (L.size === 3 ? 1 : L.size === 2 ? 0.5 : 0.25) > this.cap) return 'Field is full';
    if (Math.hypot(A.wrapD(L.x - s.x, W), A.wrapD(L.y - s.y, H)) < A.SAFE) return 'Too close to the ship';
    return null;
  }
  launch(L) {
    const why = this.launchReason(L); if (why) return why;
    let { vx, vy } = L; const sp = Math.hypot(vx, vy), cap = this.speedCap(L.size);
    if (sp > cap) { vx *= cap / sp; vy *= cap / sp; }
    if (sp < 25) { const f = 25 / Math.max(1, sp); vx *= f; vy *= f; }
    this.rocks.push(this.rock(L.x, L.y, vx, vy, L.size)); this.energy -= AstLib.COST[L.size];
    this.sfx(120, 0.15, 'sawtooth', 0.03, -60);
    return null;
  }
  fire() {
    const A = AstLib, s = this.ship;
    if (s.cool > 0 || this.bullets.length >= 5 || s.dead) return;
    s.cool = A.BCOOL;
    this.bullets.push({ x: s.x + Math.cos(s.a) * 14, y: s.y + Math.sin(s.a) * 14, vx: s.vx + Math.cos(s.a) * A.BSPD, vy: s.vy + Math.sin(s.a) * A.BSPD, l: A.BLIFE });
    this.sfx(880, 0.05, 'square', 0.025, -400);
  }
  step(dt, acts) {
    const A = AstLib, s = this.ship, a0 = acts[0] || {}, a1 = acts[1] || {};
    this.time += dt;
    this.waveT -= dt;
    if (this.waveT <= 0) {
      if (this.wave >= A.WAVES) return this.finish(0, 'PILOT WINS!', `Survived all ${A.WAVES} waves.\nScore ${this.score}, ${this.lives} ship${this.lives === 1 ? '' : 's'} left.`);
      this.wave++; this.waveT = A.WAVE_T; this.energy = Math.min(100, this.energy + 30);
      this.emit('banner', { text: 'WAVE ' + this.wave }); this.sfx(440, 0.1); this.sfx(660, 0.15);
    }
    this.energy = Math.min(100, this.energy + this.regenRate * dt);
    if (a1.launch) { const why = this.launch(a1.launch); if (why) this.emit('reject', { why }); }
    s.cool -= dt; s.inv -= dt;
    if (s.dead) { s.dead -= dt; if (s.dead <= 0) Object.assign(s, { dead: 0, x: W / 2, y: H / 2, vx: 0, vy: 0, a: -Math.PI / 2, inv: 2.5 }); }
    else {
      s.a += clamp(a0.turn || 0, -1, 1) * A.ROT * dt;
      s.thrust = !!a0.thrust;
      if (a0.fire) this.fire();
      if (!s.thrust && a0.brake) { s.vx *= 1 - 0.9 * dt; s.vy *= 1 - 0.9 * dt; }
      if (s.thrust) { s.vx += Math.cos(s.a) * A.THRUST * dt; s.vy += Math.sin(s.a) * A.THRUST * dt; }
      s.vx *= 1 - 0.25 * dt; s.vy *= 1 - 0.25 * dt;
      const sp = Math.hypot(s.vx, s.vy); if (sp > A.MAXV) { s.vx *= A.MAXV / sp; s.vy *= A.MAXV / sp; }
      s.x = (s.x + s.vx * dt + W) % W; s.y = (s.y + s.vy * dt + H) % H;
    }
    for (const b of this.bullets) { b.x = (b.x + b.vx * dt + W) % W; b.y = (b.y + b.vy * dt + H) % H; b.l -= dt; }
    this.bullets = this.bullets.filter(b => b.l > 0);
    for (const r of this.rocks) {
      r.x += r.vx * dt; r.y += r.vy * dt; r.rot += r.spin * dt;
      if (r.entered) { r.x = (r.x + W) % W; r.y = (r.y + H) % H; }          // rocks fly in from off-screen, then wrap
      else if (r.x > r.r && r.x < W - r.r && r.y > r.r && r.y < H - r.r) r.entered = true;
      else if (r.x < -200 || r.x > W + 200 || r.y < -200 || r.y > H + 200) { r.x = (r.x + W) % W; r.y = (r.y + H) % H; r.entered = true; }
    }
    for (const b of this.bullets) for (const r of this.rocks) {
      if (r.dead || b.l <= 0) continue;
      if (Math.hypot(A.wrapD(b.x - r.x, W), A.wrapD(b.y - r.y, H)) < r.r * 0.92) { b.l = 0; this.breakRock(r); this.score += r.size === 3 ? 20 : r.size === 2 ? 50 : 100; }
    }
    if (!s.dead && s.inv <= 0) for (const r of this.rocks) {
      if (r.dead) continue;
      if (Math.hypot(A.wrapD(s.x - r.x, W), A.wrapD(s.y - r.y, H)) < r.r * 0.85 + A.SHIP_R * 0.8) {
        this.breakRock(r); this.lives--; s.dead = 1.4;
        this.emit('burst', { x: s.x, y: s.y, ship: true }); this.boom(0.6, 0.1);
        if (this.lives <= 0) { this.rocks = this.rocks.filter(q => !q.dead); return this.finish(1, 'SENDER WINS!', `The ship was destroyed in wave ${this.wave}.\nPilot score ${this.score}.`); }
        break;
      }
    }
    this.rocks = this.rocks.filter(r => !r.dead);
  }
  breakRock(r) {
    r.dead = true; this.boom(0.18 + r.size * 0.06, 0.05); this.emit('burst', { x: r.x, y: r.y, size: r.size });
    if (r.size > 1) for (let k = 0; k < 2; k++) {
      const a = Math.atan2(r.vy, r.vx) + (k ? 0.6 : -0.6) + this.rng.range(-0.3, 0.3), sp = Math.hypot(r.vx, r.vy) * this.rng.range(1.05, 1.35);
      const n = this.rock(r.x, r.y, Math.cos(a) * sp, Math.sin(a) * sp, r.size - 1); n.entered = true; this.rocks.push(n);
    }
  }
}

GAMES.asteroids = {
  id: 'asteroids', Model: AsteroidsModel, maxTime: 220,
  modes: [{ ctrl: ['human', 'cpu'] }, { ctrl: ['cpu', 'human'] }],
  stats: m => ({ wave: m.wave, lives: m.lives }),
};
