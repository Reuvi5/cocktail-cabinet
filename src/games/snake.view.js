/* =====================================================================
   SNAKE — VIEW + human controller (keyboard and mouse)
   ===================================================================== */
(() => {
  const CELL = 40, OY = 40, { C, R } = SnakeLib;

  class SnakeHuman {
    constructor(side) { this.side = side; this.q = []; }
    key(code, down) {
      if (!down || this.side !== 0) return;
      const m = { ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1], ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0] }[code];
      if (m) this.q.push({ turn: { x: m[0], y: m[1] } });
    }
    mouse(type, x, y) {
      if (type !== 'down' || this.side !== 1) return;
      this.q.push({ place: { x: Math.floor(x / CELL), y: Math.floor((y - OY) / CELL) } });
    }
    act() { return this.q.shift() || null; }
  }

  class SnakeView {
    constructor(model, o) { this.m = model; this.ctrl = o.ctrl; this.parts = []; this.msg = ''; this.msgT = 0; }
    onEvent(e) {
      if (e.type === 'say') { this.msg = e.text; this.msgT = e.t; }
      if (e.type === 'reject') { this.msg = e.why ? 'Not there: ' + e.why : 'Not there'; this.msgT = 1.6; Sound.beep(160, 0.1, 'sawtooth'); }
      if (e.type === 'burst') for (let i = 0; i < 14; i++) this.parts.push({ x: e.x * CELL + 20, y: OY + e.y * CELL + 20, vx: rnd(-120, 120), vy: rnd(-120, 120), l: rnd(0.3, 0.6) });
    }
    update(dt) {
      this.msgT -= dt;
      for (const p of this.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.l -= dt; }
      this.parts = this.parts.filter(p => p.l > 0);
    }
    draw(ctx) {
      const m = this.m, L = P.light, humanPlacer = this.ctrl[1] === 'human';
      ctx.fillStyle = L ? '#e9efdd' : '#070b06'; ctx.fillRect(0, 0, W, H);
      for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) { ctx.fillStyle = (x + y) % 2 ? (L ? '#e2eacf' : '#0c140a') : (L ? '#ecf1e2' : '#0a1109'); ctx.fillRect(x * CELL, OY + y * CELL, CELL, CELL); }
      if (!m.apple && humanPlacer) {   // dots on every legal square, and the hovered square
        const legal = m.legalCells(), set = new Set(legal.map(c => SnakeLib.idx(c.x, c.y)));
        ctx.fillStyle = rgba(P.red, L ? 0.35 : 0.3);
        for (const c of legal) { ctx.beginPath(); ctx.arc(c.x * CELL + 20, OY + c.y * CELL + 20, 3, 0, TAU); ctx.fill(); }
        if (Input.mouse.inside) {
          const cx = Math.floor(Input.mouse.x / CELL), cy = Math.floor((Input.mouse.y - OY) / CELL);
          if (SnakeLib.inB(cx, cy)) { ctx.fillStyle = set.has(SnakeLib.idx(cx, cy)) ? rgba(P.red, 0.35) : P.faint; ctx.fillRect(cx * CELL + 2, OY + cy * CELL + 2, CELL - 4, CELL - 4); }
        }
      }
      if (m.apple) {
        const a = m.apple, s = Math.min(1, a.t * 6);
        ctx.save(); ctx.translate(a.x * CELL + 20, OY + a.y * CELL + 21); ctx.scale(s, s);
        glow(ctx, P.red, 16); ctx.fillStyle = L ? '#e03434' : '#ff4747'; ctx.beginPath(); ctx.arc(0, 2, 13, 0, TAU); ctx.fill();
        ctx.shadowBlur = 0; ctx.fillStyle = L ? '#3c9a2a' : '#6ee85a'; ctx.beginPath(); ctx.ellipse(5, -12, 6, 3, -0.6, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.beginPath(); ctx.arc(-5, -3, 4, 0, TAU); ctx.fill();
        ctx.restore();
      }
      const n = m.body.length;
      m.body.forEach((b, i) => {
        const t = i / Math.max(1, n - 1), pad = i === 0 ? 3 : 5 + t * 2;
        ctx.fillStyle = i === 0 ? (L ? '#2f7a0a' : '#d8ff7a') : L ? `hsl(${100 - t * 25}, 65%, ${36 + t * 14}%)` : `hsl(${95 - t * 30}, 90%, ${55 - t * 18}%)`;
        ctx.beginPath(); ctx.roundRect(b.x * CELL + pad, OY + b.y * CELL + pad, CELL - pad * 2, CELL - pad * 2, 8); ctx.fill();
      });
      const h = m.body[0], ex = m.dir.x, ey = m.dir.y;
      ctx.fillStyle = L ? '#f4ffe6' : '#081004';
      for (const s of [-1, 1]) ctx.fillRect(h.x * CELL + 18 + ex * 8 + ey * s * 8 - 3, OY + h.y * CELL + 18 + ey * 8 + ex * s * 8 - 3, 6, 6);
      for (const p of this.parts) { ctx.fillStyle = rgba(P.red, clamp(p.l * 2, 0, 1)); ctx.fillRect(p.x, p.y, 4, 4); }
      ctx.fillStyle = L ? '#dfe7cf' : '#05080a'; ctx.fillRect(0, 0, W, OY);
      text(ctx, `APPLES ${m.eaten}/${SnakeLib.WIN}`, 14, 21, { size: 12, color: P.lime, align: 'left' });
      text(ctx, `STAGE ${m.stage}`, 250, 21, { size: 12, color: P.ink, align: 'left' });
      if (m.apple) {
        text(ctx, 'HUNGER', 400, 21, { size: 10, color: P.amber, align: 'left' });
        const f = m.hunger / m.hungerMax;
        bar(ctx, 480, 14, 180, 14, f, f < 0.3 ? P.red : P.amber);
        text(ctx, String(m.hunger), 672, 21, { size: 10, color: P.ink, align: 'left' });
      } else {
        const left = Math.max(0, SnakeLib.PLACE_LIMIT - m.placeT).toFixed(1) + 's';
        text(ctx, humanPlacer ? `CLICK A DOT TO DROP AN APPLE ${left}` : 'PLACER THINKING…', 400, 21, { size: 9, color: P.red, align: 'left' });
      }
      if (this.msgT > 0) { panelBox(ctx, 180, 520, 440, 40); text(ctx, this.msg, 400, 540, { size: 10 }); }
    }
  }

  Cab.register(Object.assign(GAMES.snake, {
    name: 'Snake', accent: 'lime', View: SnakeView, Human: SnakeHuman,
    tagline: 'Steer the snake, or drop the apples and try to make it crash.',
    about: 'The snake must eat 20 apples. The apple placer wins if the snake crashes into a wall or itself, or starves before reaching the next apple.',
    sides: [
      { name: 'Snake', color: 'lime', goal: 'Eat 20 apples without crashing or starving.', cpuHelp: 'Steers with path-finding, and checks it can still reach its own tail before chasing an apple.' },
      { name: 'Apple placer', color: 'red', goal: 'Drop each apple where the snake will struggle to reach it safely.', cpuHelp: 'Hunts for awkward spots: tucked into corners, beside the body, or where the direct route is a trap.' },
    ],
    modes: [
      Object.assign(GAMES.snake.modes[0], { label: 'Normal', summary: 'You steer the snake. The computer places the apples.', how: '<b>Arrow keys</b> or <b>WASD</b> to steer.', hint: 'ARROW KEYS OR WASD TO STEER' }),
      Object.assign(GAMES.snake.modes[1], { label: 'Flipped', summary: 'You place the apples. The computer steers the snake.', how: '<b>Click</b> any dotted square to drop the next apple. You have 4.5 seconds, or it lands at random.', hint: 'CLICK A DOTTED SQUARE TO DROP EACH APPLE' }),
    ],
    rules: '<b>Fair rules for both sides:</b> an apple must be reachable, at least 3 squares from the head, and reachable before the hunger bar runs out. Every 5 apples the snake speeds up and the hunger allowance shrinks. A weaker computer placer drops apples in easy spots; a stronger one hunts for traps.',
    thumb(c, w, h) {
      const L = P.light;
      c.fillStyle = L ? '#e9efdd' : '#0a1109'; c.fillRect(0, 0, w, h);
      const cs = 25, pts = [[3, 6], [4, 6], [5, 6], [6, 6], [7, 6], [7, 5], [7, 4], [8, 4], [9, 4], [10, 4], [11, 4]];
      pts.forEach(([x, y], i) => { c.fillStyle = L ? `hsl(${85 + i * 2},65%,${48 - i * 1.5}%)` : `hsl(${70 + i * 3},90%,${35 + i * 2}%)`; c.beginPath(); c.roundRect(x * cs + 3, y * cs + 3, cs - 6, cs - 6, 5); c.fill(); });
      c.fillStyle = P.red; glow(c, P.red, 14); c.beginPath(); c.arc(12 * cs + 50, 8 * cs + 12, 9, 0, TAU); c.fill(); c.shadowBlur = 0;
    },
  }));
})();
