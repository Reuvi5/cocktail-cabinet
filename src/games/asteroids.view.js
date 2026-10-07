/* =====================================================================
   ASTEROIDS — VIEW + human controller
   ===================================================================== */
(() => {
  const A = AstLib;

  class AsteroidsHuman {
    constructor(side, model) { this.side = side; this.m = model; this.size = 3; this.drag = null; this.q = []; }
    key(code, down) { if (down && this.side === 1) { if (code === 'Digit1') this.size = 1; if (code === 'Digit2') this.size = 2; if (code === 'Digit3') this.size = 3; } }
    wheel(d) { if (this.side === 1) this.size = clamp(this.size + (d > 0 ? -1 : 1), 1, 3); }
    mouse(type, x, y, btn, e, m) {
      if (this.side !== 1) return;
      if (type === 'down' && btn === 2) { this.size = this.size === 1 ? 3 : this.size - 1; return; }
      if (type === 'down') this.drag = { x0: x, y0: y, x, y };
      if (type === 'move' && this.drag) { this.drag.x = x; this.drag.y = y; }
      if (type === 'up' && this.drag) {
        const d = this.drag; this.drag = null;
        const e0 = A.edgePoint(d.x0, d.y0), len = Math.hypot(d.x - d.x0, d.y - d.y0);
        let vx, vy;
        if (len < 12) { const s = m.ship, l = Math.hypot(s.x - e0.x, s.y - e0.y) || 1, sp = m.speedCap(this.size) * 0.7; vx = (s.x - e0.x) / l * sp; vy = (s.y - e0.y) / l * sp; }   // a click aims at the ship
        else { vx = (d.x - d.x0) * 1.2; vy = (d.y - d.y0) * 1.2; }
        this.q.push({ launch: { x: e0.x, y: e0.y, vx, vy, size: this.size } });
      }
    }
    act() {
      if (this.side === 1) return this.q.shift() || null;
      return { turn: (held('ArrowRight', 'KeyD') ? 1 : 0) - (held('ArrowLeft', 'KeyA') ? 1 : 0), thrust: held('ArrowUp', 'KeyW'), brake: held('ArrowDown', 'KeyS'), fire: held('Space') };
    }
  }

  function drawShip(ctx, x, y, a, thrust, alpha = 1) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.globalAlpha = alpha;
    ctx.strokeStyle = P.cyan; glow(ctx, P.cyan, 12); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-11, -10); ctx.lineTo(-6, 0); ctx.lineTo(-11, 10); ctx.closePath(); ctx.stroke();
    if (thrust && Math.random() > 0.3) { ctx.strokeStyle = P.amber; glow(ctx, P.amber, 12); ctx.beginPath(); ctx.moveTo(-8, -5); ctx.lineTo(-20 - Math.random() * 6, 0); ctx.lineTo(-8, 5); ctx.stroke(); }
    ctx.restore();
  }

  class AsteroidsView {
    constructor(model, o) {
      this.m = model; this.ctrl = o.ctrl; this.human = o.ctrls.find(c => c instanceof AsteroidsHuman);
      this.parts = []; this.msg = ''; this.msgT = 0; this.banner = ''; this.bannerT = 0;
      this.stars = Array.from({ length: 90 }, () => ({ x: rnd(0, W), y: rnd(0, H), s: rnd(0.5, 1.6) }));
    }
    onEvent(e) {
      if (e.type === 'banner') { this.banner = e.text; this.bannerT = 2; }
      if (e.type === 'reject') { this.msg = e.why; this.msgT = 1.3; }
      if (e.type === 'burst') for (let i = 0; i < (e.ship ? 30 : 8 + e.size * 4); i++) this.parts.push({ x: e.x, y: e.y, vx: rnd(-200, 200), vy: rnd(-200, 200), l: rnd(0.3, e.ship ? 1.2 : 0.7), ship: !!e.ship });
    }
    update(dt) {
      this.msgT -= dt; this.bannerT -= dt;
      for (const p of this.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.l -= dt; }
      this.parts = this.parts.filter(p => p.l > 0);
    }
    draw(ctx) {
      const m = this.m, L = P.light, s = m.ship, rockCol = L ? '#8a5a00' : P.amber;
      ctx.fillStyle = L ? '#f4f1ea' : '#020309'; ctx.fillRect(0, 0, W, H);
      for (const st of this.stars) { ctx.fillStyle = L ? `rgba(40,45,90,${st.s / 5})` : `rgba(200,210,255,${st.s / 2})`; ctx.fillRect(st.x, st.y, st.s, st.s); }
      ctx.lineWidth = 2;
      for (const r of m.rocks) {
        ctx.save(); ctx.translate(r.x, r.y); ctx.rotate(r.rot);
        ctx.strokeStyle = rockCol; glow(ctx, rockCol, 8); ctx.fillStyle = rgba(rockCol, L ? 0.12 : 0.06);
        ctx.beginPath(); r.shape.forEach((k, i) => { const a = i / r.shape.length * TAU; ctx.lineTo(Math.cos(a) * r.r * k, Math.sin(a) * r.r * k); }); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      for (const b of m.bullets) { ctx.fillStyle = P.ink; ctx.fillRect(b.x - 2, b.y - 2, 4, 4); }
      if (!s.dead) drawShip(ctx, s.x, s.y, s.a, s.thrust, s.inv > 0 ? (Math.floor(s.inv * 10) % 2 ? 0.3 : 1) : 1);
      for (const p of this.parts) { ctx.fillStyle = p.ship ? P.cyan : rockCol; ctx.globalAlpha = clamp(p.l * 1.5, 0, 1); ctx.fillRect(p.x, p.y, 3, 3); } ctx.globalAlpha = 1;
      const h = this.human;
      if (h && h.side === 1) {          // the sender's aim preview
        const mo = Input.mouse;
        if (h.drag) {
          const e = A.edgePoint(h.drag.x0, h.drag.y0), len = Math.hypot(h.drag.x - h.drag.x0, h.drag.y - h.drag.y0);
          ctx.strokeStyle = P.pink; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(e.x, e.y);
          if (len < 12) ctx.lineTo(s.x, s.y); else ctx.lineTo(e.x + (h.drag.x - h.drag.x0) * 1.2, e.y + (h.drag.y - h.drag.y0) * 1.2);
          ctx.stroke(); ctx.setLineDash([]);
          ctx.strokeStyle = rgba(P.pink, 0.6); ctx.beginPath(); ctx.arc(clamp(e.x, 0, W), clamp(e.y, 0, H), A.RAD[h.size], 0, TAU); ctx.stroke();
        } else if (mo.inside) { const e = A.edgePoint(mo.x, mo.y); ctx.strokeStyle = rgba(P.pink, 0.5); ctx.beginPath(); ctx.arc(clamp(e.x, 0, W), clamp(e.y, 0, H), A.RAD[h.size], 0, TAU); ctx.stroke(); }
        ctx.strokeStyle = rgba(P.pink, 0.2); ctx.setLineDash([3, 7]); ctx.beginPath(); ctx.arc(s.x, s.y, A.SAFE, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      }
      text(ctx, `WAVE ${m.wave}/${A.WAVES}`, 16, 22, { size: 12, color: P.ink, align: 'left' });
      text(ctx, `${Math.ceil(m.waveT)}s`, 190, 22, { size: 12, color: P.amber, align: 'left' });
      text(ctx, `SCORE ${m.score}`, 16, 46, { size: 10, color: P.cyan, align: 'left' });
      for (let i = 0; i < m.lives; i++) drawShip(ctx, 290 + i * 26, 24, -Math.PI / 2, false);
      text(ctx, 'ROCK ENERGY', W - 290, 22, { size: 9, color: P.pink, align: 'left' });
      bar(ctx, W - 170, 15, 150, 14, m.energy / 100, P.pink);
      const humanSender = h && h.side === 1;
      [3, 2, 1].forEach((sz, i) => {
        const on = humanSender && h.size === sz, x = W - 150 + i * 50;
        ctx.strokeStyle = on ? P.pink : P.panelLine; ctx.lineWidth = on ? 2 : 1;
        ctx.beginPath(); ctx.arc(x, 48, [0, 5, 8, 11][sz], 0, TAU); ctx.stroke();
        if (humanSender) text(ctx, String(sz), x + 18, 48, { size: 8, color: m.energy >= A.COST[sz] ? P.ink : P.dim });
      });
      if (this.bannerT > 0) text(ctx, this.banner, W / 2, H / 2 - 80, { size: 22, color: P.ink, glow: P.cyan });
      if (this.msgT > 0) text(ctx, this.msg, W / 2, H - 30, { size: 10, color: P.pink });
    }
  }

  Cab.register(Object.assign(GAMES.asteroids, {
    name: 'Asteroids', accent: 'amber', View: AsteroidsView, Human: AsteroidsHuman,
    tagline: 'Fly the ship, or hurl the rocks at it.',
    about: 'The pilot must survive 5 waves of 40 seconds each. The sender spends energy to fling asteroids in from the edges and wins by destroying all 3 ships.',
    sides: [
      { name: 'Pilot', color: 'cyan', goal: 'Survive all 5 waves. Shoot rocks to break them up.', cpuHelp: 'Tracks every rock, predicts collisions, leads its shots and dodges big rocks on a collision course.' },
      { name: 'Asteroid sender', color: 'pink', goal: 'Spend energy on rocks and smash all 3 ships.', cpuHelp: 'Launches from the edges and aims ahead of the ship. Stronger senders throw faster, smaller rocks more often.' },
    ],
    modes: [
      Object.assign(GAMES.asteroids.modes[0], { label: 'Normal', summary: 'You fly the ship. The computer sends the asteroids.', how: '<b>← →</b> rotate, <b>↑</b> thrust, <b>↓</b> brake, <b>Space</b> fire.', hint: 'ARROWS TO FLY, SPACE TO FIRE' }),
      Object.assign(GAMES.asteroids.modes[1], { label: 'Flipped', summary: 'You send the asteroids. The computer flies the ship.', how: '<b>Press</b> near an edge and <b>drag</b> to aim and set the speed. A quick <b>click</b> aims straight at the ship. <b>1 / 2 / 3</b>, the scroll wheel or right-click picks the size.', hint: 'DRAG FROM AN EDGE TO THROW A ROCK' }),
    ],
    rules: '<b>Fair rules:</b> rocks must launch at least 180 px from the ship (the dotted ring), cost energy, and obey a speed cap and a field limit. A weaker computer sender earns energy more slowly. Each wave raises the caps and the energy rate. A fresh ship gets 2.5 s of shield.',
    thumb(c, w, h) {
      const L = P.light, rock = L ? '#8a5a00' : P.amber;
      c.fillStyle = L ? '#f4f1ea' : '#020309'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) { c.fillStyle = L ? 'rgba(40,45,90,.25)' : 'rgba(200,210,255,.5)'; c.fillRect((i * 97) % w, (i * 53) % h, 1.5, 1.5); }
      c.strokeStyle = rock; c.lineWidth = 2; glow(c, rock, 8);
      [[90, 80, 34], [300, 210, 24], [320, 70, 14], [70, 230, 18]].forEach(([x, y, r]) => { c.beginPath(); for (let i = 0; i < 9; i++) { const a = i / 9 * TAU, k = 0.8 + ((i * 7) % 4) * 0.07; c.lineTo(x + Math.cos(a) * r * k, y + Math.sin(a) * r * k); } c.closePath(); c.stroke(); });
      c.strokeStyle = P.cyan; glow(c, P.cyan, 8); c.beginPath(); c.moveTo(200, 128); c.lineTo(190, 158); c.lineTo(200, 152); c.lineTo(210, 158); c.closePath(); c.stroke();
      c.shadowBlur = 0; c.fillStyle = P.ink; c.fillRect(199, 110, 3, 3); c.fillRect(199, 92, 3, 3);
    },
  }));
})();
