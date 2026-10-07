/* =====================================================================
   ASTEROIDS — CONTROLLERS. The computer and the simulated person share one
   pilot "brain" and one sender "brain"; what differs is their limits:
   how often they re-think, how well they aim and lead, how reliably they dodge.
   ===================================================================== */
const AstBrain = {
  // knobs: think (s between decisions), aimErr (rad), lead (0..1), dodge (chance), fireTol (rad)
  pilot(st, m, dt, kn, rng) {
    const A = AstLib, s = m.ship, out = {};
    if (s.dead) return out;
    st.think -= dt;
    if (st.think <= 0) {
      st.think = kn.think * rng.range(0.8, 1.2);
      let threat = null, target = null, bestT = 1e9, bestD = 1e9;
      for (const r of m.rocks) {
        const dx = A.wrapD(r.x - s.x, W), dy = A.wrapD(r.y - s.y, H), dvx = r.vx - s.vx, dvy = r.vy - s.vy;
        const vv = dvx * dvx + dvy * dvy || 1e-6, tca = -(dx * dvx + dy * dvy) / vv;
        const close = Math.hypot(dx + dvx * tca, dy + dvy * tca), d = Math.hypot(dx, dy);
        if (tca > 0 && tca < 1.5 && close < r.r + A.SHIP_R + 22 && tca < bestT) { bestT = tca; threat = { r, dx, dy, dvx, dvy, tca }; }
        const score = d - (3 - r.size) * 40;
        if (score < bestD) { bestD = score; target = { r, dx, dy, dvx, dvy, d }; }
      }
      const aimAt = t => {                    // bullets inherit the ship's velocity, so solve in the ship's frame
        const vx = t.dvx * kn.lead, vy = t.dvy * kn.lead;
        const a = vx * vx + vy * vy - A.BSPD * A.BSPD, b = 2 * (t.dx * vx + t.dy * vy), c = t.dx * t.dx + t.dy * t.dy;
        const disc = b * b - 4 * a * c; let tt = 0;
        if (disc >= 0) { tt = Math.max((-b - Math.sqrt(disc)) / (2 * a), (-b + Math.sqrt(disc)) / (2 * a)); if (tt < 0) tt = 0; }
        return { ang: Math.atan2(t.dy + vy * tt, t.dx + vx * tt), t: tt };
      };
      if (threat && threat.tca < 0.75 && threat.r.size >= (kn.dodgeSmall ? 1 : 2) && rng.chance(kn.dodge)) {
        const pa = Math.atan2(threat.dvy, threat.dvx);
        let side = (threat.dx * Math.sin(pa) - threat.dy * Math.cos(pa)) > 0 ? -1 : 1;
        if (kn.space) {   // pick the side with more room between the other rocks
          const room = sd => { const a = pa + sd * Math.PI / 2, px = s.x + Math.cos(a) * 90, py = s.y + Math.sin(a) * 90; return Math.min(...m.rocks.filter(r => r !== threat.r).map(r => Math.hypot(A.wrapD(r.x - px, W), A.wrapD(r.y - py, H)) - r.r).concat([999])); };
          if (room(-side) > room(side) + 40) side = -side;
        }
        st.tgtA = pa + side * Math.PI / 2; st.mode = 'dodge';
      } else {
        const t = threat || target;
        if (t) { const aim = aimAt(t); st.tgtA = aim.ang + rng.range(-1, 1) * kn.aimErr; st.range = Math.hypot(t.dx, t.dy); st.mode = 'shoot'; }
        else { st.mode = 'idle'; st.tgtA = s.a; }
        if (kn.space && st.mode !== 'dodge' && !threat && Math.hypot(s.x - W / 2, s.y - H / 2) > 160 && Math.hypot(s.vx, s.vy) < 40) { st.mode = 'home'; st.tgtA = Math.atan2(H / 2 - s.y, W / 2 - s.x); }
      }
    }
    const err = angDiff(s.a, st.tgtA);
    out.turn = clamp(err / (A.ROT * dt), -1, 1);
    const spd = Math.hypot(s.vx, s.vy);
    if (st.mode === 'dodge' || st.mode === 'home') { if (Math.abs(err) < 0.6) out.thrust = true; }
    else if (st.mode === 'shoot' && Math.abs(err) < kn.fireTol && (st.range || 0) < A.BSPD * A.BLIFE * 0.95) out.fire = true;
    if (st.mode !== 'dodge' && st.mode !== 'home' && spd > 60) out.brake = true;
    return out;
  },
  // knobs: every (s between launches), lead (0..1), aimErr (rad), mix ([p1,p2,p3] size weights)
  sender(st, m, dt, kn, rng) {
    const A = AstLib, s = m.ship;
    st.think -= dt; if (st.think > 0) return null;
    st.think = kn.every * rng.range(0.5, 1.3);
    const r = rng.next(), size = r < kn.mix[0] ? 1 : r < kn.mix[0] + kn.mix[1] ? 2 : 3;
    if (m.energy < A.COST[size]) return null;
    let e, tries = 0;
    do { e = A.randomEdge(rng); tries++; } while (Math.hypot(A.wrapD(e.x - s.x, W), A.wrapD(e.y - s.y, H)) < 260 && tries < 20);
    const sp = m.speedCap(size) * rng.range(0.55, 1), tt = Math.hypot(s.x - e.x, s.y - e.y) / sp;
    const tx = s.x + s.vx * tt * kn.lead, ty = s.y + s.vy * tt * kn.lead;
    const ang = Math.atan2(ty - e.y, tx - e.x) + rng.range(-1, 1) * kn.aimErr;
    return { launch: { x: e.x, y: e.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, size } };
  },
};

class AsteroidsComputer {
  constructor(side, k, rng) { this.side = side; this.k = k; this.rng = rng; this.st = { think: side ? rng.range(0.6, 1.4) : 0, tgtA: -Math.PI / 2 }; }
  act(m, dt) {
    if (this.side === 0) {
      const sk = clamp(0.1 + 0.85 * this.k + 0.04 * (m.wave - 1), 0, 1);
      return AstBrain.pilot(this.st, m, dt, { think: Math.max(0.04, 0.36 - 0.32 * sk), aimErr: (1 - sk) * 0.26, lead: 1, dodge: sk + 0.25, space: sk > 0.7, fireTol: 0.09 + (1 - sk) * 0.05 }, this.rng);
    }
    const sk = clamp(0.1 + 0.75 * this.k + 0.04 * (m.wave - 1), 0, 0.95);
    return AstBrain.sender(this.st, m, dt, {
      every: Math.max(0.45, 1.9 - 1.3 * sk - 0.08 * m.wave), lead: sk, aimErr: (1 - sk) * 0.7,
      mix: sk < 0.35 ? [0.15, 0.25, 0.6] : sk < 0.65 ? [0.3, 0.35, 0.35] : [0.4, 0.35, 0.25],
    }, this.rng);
  }
}

/* A person, modelled. Skill s in 0..1.
   Pilot: re-thinks about four times a second (people can't react faster than ~0.2 s),
   leads moving rocks only partly, aims with some error and spots incoming rocks less reliably.
   Sender: aims at where the ship is now (leading a little with skill), with a mix of sizes. */
class AsteroidsSimHuman {
  constructor(side, s, rng) { this.side = side; this.s = s; this.rng = rng; this.st = { think: side ? rng.range(0.8, 1.6) : 0, tgtA: -Math.PI / 2 }; }
  act(m, dt) {
    const s = this.s;
    if (this.side === 0) return AstBrain.pilot(this.st, m, dt, { think: 0.32 - 0.12 * s, aimErr: 0.08 + (1 - s) * 0.22, lead: 0.3 + 0.6 * s, dodge: 0.3 + 0.55 * s, fireTol: 0.16 }, this.rng);
    return AstBrain.sender(this.st, m, dt, { every: 1.5 - 0.6 * s, lead: 0.5 * s, aimErr: 0.15 + (1 - s) * 0.35, mix: [0.3, 0.35, 0.35] }, this.rng);
  }
}
GAMES.asteroids.Computer = AsteroidsComputer;
GAMES.asteroids.SimHuman = AsteroidsSimHuman;
