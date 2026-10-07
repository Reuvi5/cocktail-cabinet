/* =====================================================================
   FLAPPY BIRD — CONTROLLERS (computer opponent + simulated human)
   ===================================================================== */
// frames until a crash if the bird flaps now (or not) and then coasts
function flappyLookahead(m, y, vy, flapNow, frames) {
  const F = FlappyLib, v = m.speed;
  let pos = y, vel = flapNow ? F.FLAP : vy, off = 0;
  for (let i = 0; i < frames; i++) {
    off += v * DT; vel += F.G * DT; pos += vel * DT; if (pos < F.BR) { pos = F.BR; vel = 0; }
    if (m.collides(pos, off)) return i;
  }
  return 99;
}

// longer look-ahead: tap now (or not), then keep flying with a simple rule (tap when below the aim point),
// and count how many frames the bird survives. Used by a strong computer bird.
function flappyRollout(m, y, vy, flapNow, frames) {
  const F = FlappyLib, v = m.speed;
  let pos = y, vel = flapNow ? F.FLAP : vy, off = 0, cool = flapNow ? 10 : 0;
  for (let i = 0; i < frames; i++) {
    if (i > 0) {
      cool--;
      const c = m.cols.find(c => c.x - off + F.CW > F.BX - F.BR - 4), aim = c ? c.gy + c.gap * 0.08 : 300;
      if (cool <= 0 && pos > aim && vel > -60) { vel = F.FLAP; cool = 10; }
    }
    off += v * DT; vel += F.G * DT; pos += vel * DT; if (pos < F.BR) { pos = F.BR; vel = 0; }
    if (m.collides(pos, off)) return i;
  }
  return 999;
}

class FlappyComputer {
  constructor(side, k, rng) { this.side = side; this.k = k; this.rng = rng; this.cool = 0; this.skip = 0; this.pending = null; }
  act(m, dt) { return this.side === 0 ? this.fly(m, dt) : this.build(m); }
  // The bird decides from what it sees, but its flaps land a little late; weaker birds are later and sloppier.
  fly(m, dt) {
    const F = FlappyLib, rng = this.rng, sk = clamp(0.2 + 0.85 * Math.pow(this.k, 1.2) + 0.03 * (m.stage - 1), 0, 1);
    let out = null;
    if (this.pending != null) { this.pending -= dt; if (this.pending <= 0) { this.pending = null; out = { flap: true }; } }
    const next = m.nextCol();
    if (next && this.noiseFor !== next) { this.noiseFor = next; this.noise = rng.range(-1, 1) * (1 - sk) * next.gap * 0.32; }
    this.cool -= dt; this.skip -= dt;
    if (this.skip > 0) return out;
    if (rng.chance((1 - sk) * 0.05)) { this.skip = rng.range(0.06, 0.18); return out; }
    if (this.cool > 0 || this.pending != null) return out;
    const b = m.bird, T = next ? next.gy + next.gap * 0.12 + this.noise : 300;
    let want = b.y > T && b.vy > -80;
    const coast = flappyLookahead(m, b.y, b.vy, false, 26), up = flappyLookahead(m, b.y, b.vy, true, 26);
    if (want && up < 16 && up <= coast) want = false;    // flapping now would hit the pipe above
    if (!want && coast < 9 && up > coast) want = true;    // must flap to survive
    if (sk > 0.6 && rng.chance(sk)) {                    // a strong bird also plans further ahead
      const rc = flappyRollout(m, b.y, b.vy, false, 75), ru = flappyRollout(m, b.y, b.vy, true, 75);
      if (ru !== rc) want = ru > rc;
    }
    if (want) { this.pending = rng.range(0, 0.03 + 0.16 * (1 - sk)); this.cool = 0.16; }
    return out;
  }
  // The builder swings the gaps harder, and squeezes them smaller, as it gets stronger.
  build(m) {
    const rng = this.rng, a = clamp(-0.2 + 1.2 * this.k + 0.04 * (m.stage - 1), 0, 1);   // a weak builder stays gentle all game
    const gap = Math.round(m.minGap + (FlappyLib.MAXGAP - m.minGap) * Math.pow(1 - a, 1.3));
    const last = m.cols[m.cols.length - 1];
    if (this.planned === last && this.plan) return this.plan;   // decide once per column
    this.planned = last;
    const [lo, hi] = m.bounds(gap), mid = (lo + hi) / 2;
    let dir = m.prevY > mid ? -1 : 1;
    if (rng.chance(0.25 * (1 - a))) dir = -dir;
    let y = m.prevY + dir * m.maxD * a * rng.range(0.75, 1.05) + rng.range(-30, 30) * (1 - a);
    if (this.k > 0.4 && m.stage >= 3 && rng.chance(0.15)) y = m.prevY + rng.range(-20, 20);   // feint
    this.plan = { gapY: y, gapSize: gap };
    return this.plan;
  }
}

/* A person, modelled. Skill s in 0..1.
   Bird: plays a sensible strategy, but misjudges the height a little, aims with some error,
   taps a little late and now and then loses focus for a moment.
   Builder: alternates high and low gaps, with swings as large as a person tends to try. */
class FlappySimHuman {
  constructor(side, s, rng) {
    this.side = side; this.s = s; this.rng = rng; this.cool = 0; this.pending = null;
  }
  act(m, dt) { return this.side === 0 ? this.fly(m, dt) : this.build(m); }
  fly(m, dt) {
    // A person plays a sensible strategy (stay a little below the middle of the next gap, and
    // tap if the bird is about to hit something). People know when they tapped, so they track the
    // bird closely; what they lack is precision: a slightly wrong read of the height, an aim
    // point that wanders, taps that land late, and the odd moment of inattention.
    const rng = this.rng, s = this.s, b = m.bird;
    let out = null;
    if (this.pending != null) { this.pending -= dt; if (this.pending <= 0) { this.pending = null; out = { flap: true }; } }
    this.cool -= dt; this.look -= dt; this.blink -= dt;
    if (!(this.look > 0)) { this.look = 0.12; this.eye = rng.gauss() * (1 - s) * 18; }
    if (this.blink > 0) return out;
    if (rng.chance((1 - s) * 0.006)) { this.blink = rng.range(0.08, 0.22); return out; }   // about one lapse every 5 s for an average player
    const next = m.nextCol();
    if (next && this.aimFor !== next) { this.aimFor = next; this.aim = next.gy + next.gap * 0.12 + rng.gauss() * next.gap * (0.2 - 0.12 * s); }
    if (this.cool > 0 || this.pending != null) return out;
    const y = b.y + this.eye, T = next ? this.aim : 300;
    let want = y > T && b.vy > -80;
    const coast = flappyLookahead(m, y, b.vy, false, 26), up = flappyLookahead(m, y, b.vy, true, 26);
    if (want && up < 16 && up <= coast && rng.chance(0.5 + 0.45 * s)) want = false;   // a tap now would hit the pipe above
    if (!want && coast < 10 && up > coast && rng.chance(0.55 + 0.4 * s)) want = true;   // must tap to survive
    if (want) { this.pending = Math.abs(rng.gauss()) * (0.085 - 0.06 * s); this.cool = 0.17; }
    return out;
  }
  build(m) {
    const rng = this.rng, last = m.cols[m.cols.length - 1];
    if (this.planned === last && this.plan) return this.plan;
    this.planned = last;
    const [lo, hi] = m.bounds(m.minGap), mid = (lo + hi) / 2;
    const dir = m.prevY > mid ? -1 : 1, size = rng.range(0.45, 0.85) + 0.15 * this.s;
    this.plan = { gapY: m.prevY + dir * m.maxD * size + rng.gauss() * 25, gapSize: m.minGap };
    return this.plan;
  }
}
GAMES.flappy.Computer = FlappyComputer;
GAMES.flappy.SimHuman = FlappySimHuman;
