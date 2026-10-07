/* =====================================================================
   MISSILE COMMAND — MODEL. Side 0 defends, side 1 attacks.
   Actions:  side 0  { fire: { x, y, base } }        base index 0..2, or omitted for the nearest with ammo
             side 1  { launch: { sx, tx, mirv } }    start x along the top, target x on the ground
   ===================================================================== */
const MslLib = {
  GY: 552, WAVES: 5, ISPD: 440, EXR: 42, GROW: 0.45, HOLD: 0.25, SHRINK: 0.45,
  BASES: [70, 400, 730], CITIES: [155, 228, 300, 500, 572, 645],
};

class MissileModel extends BaseModel {
  constructor(o) {
    super(o);
    const M = MslLib;
    this.wave = 1; this.score = 0; this.nextWaveT = 0;
    this.structs = [...M.BASES.map((x, i) => ({ type: 'base', x, alive: true, ammo: 0, i })), ...M.CITIES.map(x => ({ type: 'city', x, alive: true }))];
    this.missiles = []; this.inter = []; this.exps = [];
    this.startWave();
  }
  get speed() { return 40 + 11 * this.wave; }
  get cooldown() { return Math.max(0.42, 1.55 - 0.18 * this.wave); }
  // A person attacking gets the full missile budget; the computer holds some back until it is at full strength.
  get budget() {
    const base = 9 + 3.5 * this.wave;
    if (!this.isComputer(1)) return Math.round(base);
    const sk = clamp(0.1 + 0.75 * this.ck(1) + 0.03 * (this.wave - 1), 0, 0.95);
    return Math.round(base * (0.35 + 0.8 * sk));
  }
  startWave() {
    this.left = this.budget; this.cool = 1.5; this.waveOver = false;
    for (const s of this.structs) if (s.type === 'base') { s.alive = true; s.ammo = 10; }
    this.emit('banner', { text: 'WAVE ' + this.wave });
  }
  cities() { return this.structs.filter(s => s.type === 'city' && s.alive); }
  bases() { return this.structs.filter(s => s.type === 'base'); }
  nearestBase(x) { const bs = this.bases().filter(s => s.alive && s.ammo > 0); bs.sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x)); return bs[0]; }
  snap(x) { let best = null, bd = 45; for (const s of this.structs) if (Math.abs(s.x - x) < bd) { bd = Math.abs(s.x - x); best = s; } return best ? best.x : x; }
  /* ----- attacker rules ----- */
  launchReason(L) {
    if (this.waveOver) return 'Wave over';
    if (this.cool > 0) return 'Launcher reloading';
    if (this.left < (L.mirv ? 3 : 1)) return L.mirv ? 'Need 3 missiles for a splitter' : 'No missiles left this wave';
    if (L.mirv && this.wave < 3) return 'Splitters unlock in wave 3';
    return null;
  }
  launch(L) {
    const why = this.launchReason(L); if (why) return why;
    this.addMissile(clamp(L.sx, 10, W - 10), 0, clamp(L.tx, 10, W - 10), !!L.mirv, this.speed);
    this.left -= L.mirv ? 3 : 1; this.cool = this.cooldown * (L.mirv ? 1.6 : 1);
    this.sfx(220, 0.1, 'sawtooth', 0.02, -80);
    return null;
  }
  addMissile(x, y, tx, mirv, sp) {
    const d = Math.hypot(tx - x, MslLib.GY - y);
    this.missiles.push({ x0: x, y0: y, x, y, tx, vx: (tx - x) / d * sp, vy: (MslLib.GY - y) / d * sp, mirv, splitY: this.rng.range(210, 300), id: this.nextId = (this.nextId || 0) + 1 });
  }
  /* ----- defender rules ----- */
  fire(F) {
    const M = MslLib, base = F.base != null ? this.structs[F.base] : this.nearestBase(F.x);
    if (!base || !base.alive || base.ammo <= 0) return F.base != null ? 'That base is empty' : 'Out of ammo';
    const y = Math.min(F.y, M.GY - 30); base.ammo--;
    const d = Math.hypot(F.x - base.x, y - (M.GY - 16));
    this.inter.push({ x0: base.x, y0: M.GY - 16, x: base.x, y: M.GY - 16, tx: F.x, ty: y, vx: (F.x - base.x) / d * M.ISPD, vy: (y - M.GY + 16) / d * M.ISPD });
    this.sfx(760, 0.07, 'square', 0.025, 300);
    return null;
  }
  step(dt, acts) {
    const M = MslLib, a0 = acts[0] || {}, a1 = acts[1] || {};
    this.time += dt; this.cool -= dt;
    if (this.waveOver) { this.nextWaveT -= dt; if (this.nextWaveT <= 0) { this.wave++; this.startWave(); } }
    if (a1.launch) { const why = this.launch(a1.launch); if (why && why !== 'Wave over') this.emit('reject', { why }); }
    if (a0.fire) { const why = this.fire(a0.fire); if (why) this.emit('reject', { why }); }
    for (const m of this.missiles) {
      m.x += m.vx * dt; m.y += m.vy * dt;
      if (m.mirv && m.y >= m.splitY) {
        m.dead = true;
        const cands = this.structs.filter(s => s.alive);
        for (let k = 0; k < 3; k++) { const t = cands.length ? this.rng.pick(cands) : { x: this.rng.range(50, W - 50) }; this.addMissile(m.x, m.y, t.x, false, this.speed * 1.1); this.missiles[this.missiles.length - 1].x0 = m.x0; this.missiles[this.missiles.length - 1].y0 = m.y0; }
        this.sfx(300, 0.1, 'sawtooth', 0.02);
      }
      if (m.y >= M.GY) { m.dead = true; this.groundHit(m.x); }
    }
    for (const i of this.inter) {
      i.x += i.vx * dt; i.y += i.vy * dt;
      if ((i.vy < 0 && i.y <= i.ty) || Math.hypot(i.x - i.tx, i.y - i.ty) < 6) { i.dead = true; this.exps.push({ x: i.tx, y: i.ty, t: 0, max: M.EXR, r: 0 }); this.boom(0.25, 0.04); }
    }
    for (const e of this.exps) {
      e.t += dt;
      const T = e.t; e.r = Math.max(0, T < M.GROW ? e.max * T / M.GROW : T < M.GROW + M.HOLD ? e.max : e.max * (1 - (T - M.GROW - M.HOLD) / M.SHRINK));
      if (e.ground) continue;
      for (const m of this.missiles) if (!m.dead && Math.hypot(m.x - e.x, m.y - e.y) < e.r) { m.dead = true; this.score += 25; this.exps.push({ x: m.x, y: m.y, t: 0, max: 20, r: 0 }); }
    }
    this.exps = this.exps.filter(e => e.t < M.GROW + M.HOLD + M.SHRINK);
    this.missiles = this.missiles.filter(m => !m.dead); this.inter = this.inter.filter(i => !i.dead);
    if (!this.cities().length) return this.finish(1, 'ATTACKER WINS!', `Every city fell in wave ${this.wave}.\nDefender score ${this.score}.`);
    if (!this.waveOver && this.left <= 0 && !this.missiles.length) {
      const n = this.cities().length; this.score += n * 100;
      if (this.wave >= M.WAVES) return this.finish(0, 'DEFENDER WINS!', `${n} cit${n === 1 ? 'y' : 'ies'} survived all ${M.WAVES} waves.\nScore ${this.score}.`);
      this.waveOver = true; this.nextWaveT = 1.4;
      // bonus: surviving a wave rebuilds one lost city
      const lost = this.structs.find(s => s.type === 'city' && !s.alive);
      if (lost) { lost.alive = true; this.say(`Wave clear: +${n * 100}, and a city is rebuilt!`); }
      else this.say(`Wave clear: ${n} cities standing (+${n * 100})`);
    }
  }
  groundHit(x) {
    this.exps.push({ x, y: MslLib.GY, t: 0, max: 26, ground: true, r: 0 });
    for (const s of this.structs) if (s.alive && Math.abs(s.x - x) < 26) {
      s.alive = false; if (s.type === 'base') s.ammo = 0;
      this.emit('burst', { x: s.x, y: MslLib.GY - 8 }); this.boom(0.5, 0.09);
    }
  }
}

GAMES.missile = {
  id: 'missile', Model: MissileModel, maxTime: 400,
  modes: [{ ctrl: ['human', 'cpu'] }, { ctrl: ['cpu', 'human'] }],
  stats: m => ({ wave: m.wave, cities: m.cities().length }),
};
