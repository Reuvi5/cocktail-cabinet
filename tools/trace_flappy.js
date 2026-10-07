const { load } = require('./load'); const E = load(); const G = E.GAMES.flappy;
const rng = E.makeRng(7); const m = new G.Model({ mode: 0, sides: [{ kind: 'human' }, { kind: 'computer', k: 0 }], rng: rng.fork() });
const h = new G.SimHuman(0, 0.5, rng.fork()), c = new G.Computer(1, 0, rng.fork());
let lives = m.lives, flaps = 0;
for (let i = 0; i < 60 * 40 && !m.result; i++) {
  const a = [h.act(m, 1 / 60), c.act(m, 1 / 60)]; if (a[0] && a[0].flap) flaps++;
  const py = m.bird.y, pvy = m.bird.vy; m.step(1 / 60, a); if (m.lives < lives) console.log("   crashed from y=" + Math.round(py) + " vy=" + Math.round(pvy));
  if (m.lives < lives || i % 30 === 0) { const n = m.nextCol(); console.log(`t=${m.time.toFixed(2)} y=${Math.round(m.bird.y)} vy=${Math.round(m.bird.vy)} next gap ${n ? Math.round(n.gy) + '±' + n.gap / 2 + ' x=' + Math.round(n.x) : '-'} flaps=${flaps}${m.lives < lives ? '  <<< CRASH' : ''}`); lives = m.lives; }
  m.events.length = 0;
}
