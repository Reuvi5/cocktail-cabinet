/* =====================================================================
   MISSILE COMMAND — CONTROLLERS. Computer and simulated person share one
   defender brain and one attacker brain, with different limits.
   ===================================================================== */
const MslBrain = {
  // knobs: every (s between shots), err (px of aim error), notice (s before re-covering a missed missile)
  defend(st, m, dt, kn, rng) {
    const M = MslLib;
    st.t -= dt; if (st.t > 0) return null;
    st.t = kn.every * rng.range(0.8, 1.25);
    st.covered = st.covered || {};
    const threats = m.missiles.filter(x => !(st.covered[x.id] > m.time) && x.y < M.GY - 60).map(x => {
      const tgt = m.structs.find(s => Math.abs(s.x - x.tx) < 24 && s.alive);
      return { x, tti: (M.GY - x.y) / x.vy, worth: tgt ? 1 : 0.1 };
    }).filter(t => t.worth > 0.5 || rng.chance(0.15)).sort((a, b) => a.tti - b.tti);
    for (const t of threats) {
      const x = t.x;
      if (m.exps.some(e => Math.hypot(e.x - x.x, e.y - x.y) < M.EXR + 10)) continue;   // a blast already has it
      let best = null;
      for (const b of m.bases()) {
        if (!b.alive || b.ammo <= 0) continue;
        let tt = 0.5, px = x.x, py = x.y;
        for (let k = 0; k < 6; k++) { px = x.x + x.vx * (tt + 0.2) * kn.lead; py = x.y + x.vy * (tt + 0.2) * kn.lead; tt = Math.hypot(px - b.x, py - M.GY + 16) / M.ISPD; }
        if (py > M.GY - 35) continue;
        if (!best || tt < best.tt) best = { b, px, py, tt };
      }
      if (!best) continue;
      st.covered[x.id] = m.time + best.tt + M.GROW + M.HOLD + kn.notice;
      return { fire: { x: best.px + rng.gauss() * kn.err, y: best.py + rng.gauss() * kn.err, base: best.b.i } };
    }
    return null;
  },
  // knobs: every (s), baseHunt (chance to aim at a base), mirv (chance), salvo (chance), spread (px)
  attack(st, m, dt, kn, rng) {
    st.t -= dt;
    if (st.t > 0 || m.cool > 0 || m.left <= 0 || m.waveOver) return null;
    const cities = m.cities(), bases = m.bases().filter(s => s.alive && s.ammo > 0);
    let tgt = bases.length && rng.chance(kn.baseHunt) ? rng.pick(bases) : rng.pick(cities.length ? cities : m.structs);
    if (cities.length && rng.chance(kn.smart || 0)) {   // a sharp attacker goes for the city hardest to defend
      const cover = c => Math.min(...bases.map(b => Math.abs(b.x - c.x)).concat([999]));
      tgt = cities.slice().sort((a, b) => cover(b) - cover(a))[rng.int(0, Math.min(1, cities.length - 1))];
    }
    const sx = clamp(tgt.x + rng.range(-kn.spread, kn.spread), 10, W - 10);
    const mirv = m.wave >= 3 && m.left >= 3 && rng.chance(kn.mirv);
    if (st.salvo > 0) { st.salvo--; st.t = 0; }
    else { st.t = kn.every * rng.range(0.3, 1.7); if (m.wave >= 2 && rng.chance(kn.salvo)) st.salvo = rng.int(1, Math.min(3, m.wave - 1)); }
    return { launch: { sx, tx: tgt.x + rng.range(-6, 6), mirv } };
  },
};

class MissileComputer {
  constructor(side, k, rng) { this.side = side; this.k = k; this.rng = rng; this.st = { t: side ? rng.range(1.2, 2) : 0.5, salvo: 0 }; }
  act(m, dt) {
    if (this.side === 0) {
      const sk = clamp(0.22 + 0.36 * this.k + 0.02 * (m.wave - 1), 0, 0.95);
      return MslBrain.defend(this.st, m, dt, { every: Math.max(0.35, 1.55 - 1.15 * sk), err: (1 - sk) * 43, lead: 1, notice: 2.6 * (1 - sk) * (1 - sk) }, this.rng);
    }
    const sk = clamp(0.1 + 0.75 * this.k + 0.03 * (m.wave - 1), 0, 0.95);
    return MslBrain.attack(this.st, m, dt, { every: Math.max(0.25, 1.7 - 1.0 * sk - 0.05 * m.wave), baseHunt: 0.04 + 0.28 * sk, mirv: 0.08 + 0.32 * sk, salvo: 0.45 * sk, spread: 120 + 50 * m.wave, smart: Math.max(0, sk - 0.4) }, this.rng);
  }
}

/* A person, modelled. Skill s in 0..1.
   Defender: clicks about twice a second, leads a falling missile only roughly, aims with a
   few dozen pixels of error and is slow to notice a shot that missed.
   Attacker: picks a city, fires as soon as the launcher reloads (more or less), tries splitters. */
class MissileSimHuman {
  constructor(side, s, rng) { this.side = side; this.s = s; this.rng = rng; this.st = { t: side ? rng.range(1.5, 2.5) : 0.8, salvo: 0 }; }
  act(m, dt) {
    const s = this.s;
    if (this.side === 0) return MslBrain.defend(this.st, m, dt, { every: 0.62 - 0.22 * s, err: 14 + (1 - s) * 34, lead: 0.7 + 0.3 * s, notice: 1.6 - s }, this.rng);
    return MslBrain.attack(this.st, m, dt, { every: 1.2 - 0.4 * s, baseHunt: 0.1 * s, mirv: 0.25 * s, salvo: 0.1, spread: 160 }, this.rng);
  }
}
GAMES.missile.Computer = MissileComputer;
GAMES.missile.SimHuman = MissileSimHuman;
