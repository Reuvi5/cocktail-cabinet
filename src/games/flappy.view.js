/* =====================================================================
   FLAPPY BIRD — VIEW + human controller
   ===================================================================== */
(() => {
  const F = FlappyLib;

  class FlappyHuman {
    constructor(side, model) { this.side = side; this.m = model; this.tap = false; }
    key(code, down) { if (down && this.side === 0 && ['Space', 'ArrowUp', 'KeyW'].includes(code)) this.tap = true; }
    mouse(type) { if (type === 'down' && this.side === 0) this.tap = true; }
    act(m) {
      if (this.side === 0) { const o = this.tap ? { flap: true } : null; this.tap = false; return o; }
      // the builder's next gap follows the pointer (a person always builds at the smallest allowed gap)
      return { gapY: Input.mouse.inside ? Input.mouse.y : m.prevY, gapSize: m.minGap };
    }
  }

  function drawBird(ctx, x, y, rot, flapT) {
    const BR = F.BR;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    const body = P.light ? '#e8458f' : '#ff6fb1';
    glow(ctx, body, 16); ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(0, 0, BR + 2, BR, 0, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = P.light ? '#7a2cc9' : '#b98cff';
    ctx.beginPath(); ctx.moveTo(-2, -BR + 1); ctx.lineTo(-8, -BR - 8); ctx.lineTo(2, -BR + 2); ctx.lineTo(0, -BR - 9); ctx.lineTo(6, -BR + 3); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(7, -3, 3.6, 0, TAU); ctx.fill();
    ctx.fillStyle = '#16121f'; ctx.beginPath(); ctx.arc(8, -3, 1.8, 0, TAU); ctx.fill();
    ctx.fillStyle = P.light ? '#d9a300' : '#ffd23f'; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(21, 3); ctx.lineTo(14, 5); ctx.fill();
    ctx.fillStyle = P.light ? '#7a2cc9' : '#b98cff'; ctx.beginPath(); ctx.ellipse(-5, 3, 8, 4, Math.sin(flapT * 20) * 0.6, 0, TAU); ctx.fill();
    ctx.restore();
  }

  class FlappyView {
    constructor(model, o) { this.m = model; this.ctrl = o.ctrl; this.parts = []; this.msg = ''; this.msgT = 0; }
    onEvent(e) {
      if (e.type === 'say') { this.msg = e.text; this.msgT = e.t; }
      if (e.type === 'burst') for (let i = 0; i < 26; i++) this.parts.push({ x: e.x, y: e.y, vx: rnd(-260, 120), vy: rnd(-300, 50), l: rnd(0.4, 0.9) });
    }
    update(dt) {
      this.msgT -= dt;
      for (const p of this.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 900 * dt; p.l -= dt; }
      this.parts = this.parts.filter(p => p.l > 0);
    }
    draw(ctx) {
      const m = this.m, L = P.light, GROUND = F.GROUND, CW = F.CW;
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, L ? '#e7e0ff' : '#120a2a'); sky.addColorStop(1, L ? '#fde7d8' : '#2a0f3a');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = L ? 'rgba(106,72,214,.12)' : '#1c0f33';
      for (let i = 0; i < 14; i++) { const x = ((i * 90 - m.scroll * 0.25) % 1260 + 1260) % 1260 - 100, hh = 60 + ((i * 53) % 90); ctx.fillRect(x, GROUND - hh, 70, hh); }
      for (const c of m.cols) {
        const top = c.gy - c.gap / 2, bot = c.gy + c.gap / 2, gr = ctx.createLinearGradient(c.x, 0, c.x + CW, 0);
        if (L) { gr.addColorStop(0, '#5b3cc4'); gr.addColorStop(0.5, '#8a6cf0'); gr.addColorStop(1, '#4c2fae'); }
        else { gr.addColorStop(0, '#6d3fe0'); gr.addColorStop(0.5, '#a78bff'); gr.addColorStop(1, '#5a2fc4'); }
        ctx.fillStyle = gr; ctx.fillRect(c.x, 0, CW, top); ctx.fillRect(c.x, bot, CW, GROUND - bot);
        ctx.fillStyle = L ? '#3d2890' : '#c9b8ff'; ctx.fillRect(c.x - 5, top - 16, CW + 10, 16); ctx.fillRect(c.x - 5, bot, CW + 10, 16);
      }
      ctx.fillStyle = P.pink; ctx.fillRect(0, GROUND, W, 3); ctx.fillStyle = L ? '#ead9f3' : '#150a22'; ctx.fillRect(0, GROUND + 3, W, H - GROUND);
      for (let x = -(m.scroll % 40); x < W; x += 40) { ctx.fillStyle = L ? '#d8c2e6' : '#2a1442'; ctx.fillRect(x, GROUND + 14, 20, 4); }
      const b = m.bird;
      if (b.alive) { ctx.save(); if (b.ghost > 0) ctx.globalAlpha = Math.floor(b.ghost * 10) % 2 ? 0.3 : 0.8; drawBird(ctx, F.BX, b.y, b.rot, m.time); ctx.restore(); }
      for (const p of this.parts) { ctx.fillStyle = rgba(P.pink, clamp(p.l * 2, 0, 1)); ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, TAU); ctx.fill(); }
      // the builder's rail: where the next gap is allowed to go
      const g = this.ctrl[1] === 'human' ? m.minGap : m.want.gap, [lo, hi] = m.allowed(g);
      ctx.fillStyle = rgba(P.pink, 0.08); ctx.fillRect(W - 26, 0, 26, GROUND);
      ctx.fillStyle = rgba(P.pink, 0.35); ctx.fillRect(W - 22, lo - g / 2, 18, hi - lo + g);
      if (this.ctrl[1] === 'human') {
        const y = clamp(Input.mouse.inside ? Input.mouse.y : m.prevY, lo, hi);
        ctx.strokeStyle = P.pink; ctx.lineWidth = 3; ctx.strokeRect(W - 24, y - g / 2, 22, g);
        ctx.setLineDash([6, 8]); ctx.strokeStyle = rgba(P.pink, 0.5); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(W - 180, y - g / 2); ctx.lineTo(W - 26, y - g / 2); ctx.moveTo(W - 180, y + g / 2); ctx.lineTo(W - 26, y + g / 2); ctx.stroke(); ctx.setLineDash([]);
        text(ctx, 'NEXT GAP', W - 30, clamp(y, 60, GROUND - 40), { size: 8, color: P.pink, align: 'right' });
      }
      panelBox(ctx, 6, 6, 200, 50); panelBox(ctx, W - 262, 8, 226, 28);
      text(ctx, `COLUMNS ${m.passed}/${F.WIN}`, 16, 22, { size: 12, color: L ? P.pink : P.yellow, align: 'left' });
      text(ctx, `STAGE ${m.stage}`, 16, 44, { size: 10, color: P.ink, align: 'left' });
      for (let i = 0; i < F.LIVES; i++) { ctx.fillStyle = i < m.lives ? P.pink : P.faint; ctx.beginPath(); ctx.arc(126 + i * 20, 44, 6, 0, TAU); ctx.fill(); }
      text(ctx, `GAP ${Math.round(g)}  MAX SHIFT ${m.maxD}`, W - 40, 22, { size: 9, color: P.violet, align: 'right' });
      if (this.msgT > 0) text(ctx, this.msg, W / 2, GROUND + 22, { size: 10, color: P.ink });
    }
  }

  Cab.register(Object.assign(GAMES.flappy, {
    name: 'Flappy Bird', accent: 'pink', View: FlappyView, Human: FlappyHuman,
    tagline: 'Flap through the gaps, or build the columns and watch the bird go splat.',
    about: 'The assignment\'s "Splat". The bird has to get through 30 columns and has 3 lives. The builder decides where each gap goes (and how wide) and wins if the bird crashes 3 times.',
    sides: [
      { name: 'Bird', color: 'pink', goal: 'Flap through all 30 columns before losing 3 lives.', cpuHelp: 'Simulates its flight ahead and flaps only when it must. It crashes for real when it gets it wrong.' },
      { name: 'Column builder', color: 'violet', goal: 'Place each gap where the bird will struggle to reach it.', cpuHelp: 'Swings the gaps up and down and squeezes them narrower as it gets stronger, always within the rules.' },
    ],
    modes: [
      Object.assign(GAMES.flappy.modes[0], { label: 'Normal', summary: 'You fly the bird. The computer builds the columns.', how: '<b>Space</b>, <b>↑</b> or <b>click</b> to flap.', hint: 'SPACE, UP ARROW OR CLICK TO FLAP' }),
      Object.assign(GAMES.flappy.modes[1], { label: 'Flipped', summary: 'You build the columns. The computer flies the bird.', how: '<b>Move the mouse</b> up and down. The next column\'s gap follows your pointer, inside the pink band on the right edge. You always build the narrowest gap allowed.', hint: 'MOVE THE MOUSE TO SET WHERE EACH GAP GOES' }),
    ],
    rules: '<b>Fair rules:</b> each gap can only move a limited distance from the previous one (the pink band) and can never be narrower than the stage minimum, so a skilled bird can always make it. A weaker computer builder leaves wider gaps. After a crash the bird respawns in the next gap and is see-through for a moment. Every 6 columns the minimum gap shrinks, the shift limit grows and the scrolling speeds up.',
    thumb(c, w, h) {
      const L = P.light, g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, L ? '#e7e0ff' : '#120a2a'); g.addColorStop(1, L ? '#fde7d8' : '#2a0f3a'); c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.fillStyle = L ? '#8a6cf0' : '#a78bff'; c.fillRect(200, 0, 50, 90); c.fillRect(200, 180, 50, 110); c.fillRect(330, 0, 50, 150); c.fillRect(330, 240, 50, 50);
      c.fillStyle = P.pink; c.fillRect(0, 285, w, 3);
      drawBird(c, 120, 140, -0.2, 0.3);
    },
  }));
})();
