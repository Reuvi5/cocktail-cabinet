/* =====================================================================
   BREAKOUT — VIEW + human controller
   ===================================================================== */
(() => {
  const B = BreakoutLib;
  const BTN = [{ id: 'auto', x: 160, w: 160, t: 'SURPRISE ME' }, { id: 'clear', x: 330, w: 140, t: 'CLEAR' }, { id: 'ready', x: 480, w: 160, t: 'READY' }];
  const BTN_Y = 372, BTN_H = 40;
  const cellAt = (x, y) => { const c = Math.floor((x - B.X0) / B.PX), r = Math.floor((y - B.Y0) / B.PYG); return c >= 0 && r >= 0 && c < B.COLS && r < B.ROWS && x - B.cx(c) <= B.BW && y - B.cy(r) <= B.BH ? { c, r } : null; };

  class BreakoutHuman {
    constructor(side, model) { this.side = side; this.m = model; this.hp = 1; this.q = []; this.useKeys = false; this.lm = null; this.rng = makeRng((Math.random() * 4294967296) >>> 0); }
    key(code, down, m) {
      if (!down) return;
      if (this.side === 0 && code === 'Space') this.q.push({ serve: true });
      if (this.side === 1) {
        if (code === 'Digit1') this.hp = 1; if (code === 'Digit2') this.hp = 2; if (code === 'Digit3') this.hp = 3;
        if (code === 'Enter' && m.phase === 'layout') this.q.push({ ready: true });
      }
    }
    wheel(d) { if (this.side === 1) this.hp = clamp(this.hp + (d > 0 ? -1 : 1), 1, 3); }
    mouse(type, x, y, btn, e, m) {
      if (type !== 'down') return;
      if (this.side === 0) { this.q.push({ serve: true }); return; }
      if (m.phase === 'layout') {
        for (const b of BTN) if (x >= b.x && x <= b.x + b.w && y >= BTN_Y && y <= BTN_Y + BTN_H) {
          if (b.id === 'ready') this.q.push({ ready: true });
          if (b.id === 'clear') this.q.push({ clear: true });
          if (b.id === 'auto') this.q.push({ layout: B.fill(B.pattern(m.wall, this.rng), m.budget) });
          return;
        }
        const k = cellAt(x, y); if (!k) return;
        const cur = m.g[k.r][k.c];
        let hp = btn === 2 ? 0 : (cur + 1) % 4;
        if (hp - cur > m.budget - m.spent) hp = 0;   // can't afford a tougher brick: clear it instead
        this.q.push({ set: { c: k.c, r: k.r, hp } });
        return;
      }
      const k = cellAt(x, y); if (k) this.q.push({ drop: { c: k.c, r: k.r, hp: this.hp } });
    }
    act(m) {
      const out = Object.assign({}, this.q.shift() || {});   // one input per tick, none lost
      if (this.side === 0) {
        const dir = held('ArrowLeft', 'KeyA') ? -1 : held('ArrowRight', 'KeyD') ? 1 : 0;
        if (dir) { this.useKeys = true; out.target = m.pad.x + dir * 2000; }
        else if (this.useKeys) out.target = m.pad.x;
        if (Input.mouse.inside && (this.lm == null || Math.abs(Input.mouse.x - this.lm) > 2)) { this.useKeys = false; this.lm = Input.mouse.x; }
        if (!dir && !this.useKeys && Input.mouse.inside) out.target = Input.mouse.x;
      }
      return out;
    }
  }

  class BreakoutView {
    constructor(model, o) { this.m = model; this.ctrl = o.ctrl; this.human = o.ctrls.find(c => c instanceof BreakoutHuman); this.parts = []; this.flash = []; this.trail = []; this.msg = ''; this.msgT = 0; }
    onEvent(e) {
      if (e.type === 'say') { this.msg = e.text; this.msgT = e.t; }
      if (e.type === 'reject') { this.msg = { reserve: 'Not enough reserve', taken: 'Square already has a brick', reloading: 'Reloading…' }[e.why] || 'Too close to the ball'; this.msgT = 1.2; Sound.beep(150, 0.06, 'sawtooth'); }
      if (e.type === 'drop') this.flash.push({ c: e.c, r: e.r, t: 0 });
      if (e.type === 'burst') for (let k = 0; k < 10; k++) this.parts.push({ x: e.x, y: e.y, vx: rnd(-160, 160), vy: rnd(-160, 100), l: rnd(0.25, 0.55) });
    }
    update(dt) {
      this.msgT -= dt;
      for (const p of this.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 400 * dt; p.l -= dt; }
      this.parts = this.parts.filter(p => p.l > 0);
      for (const f of this.flash) f.t += dt; this.flash = this.flash.filter(f => f.t < 0.6);
      const b = this.m.ball; if (b.stuck) this.trail = []; else { this.trail.push({ x: b.x, y: b.y }); if (this.trail.length > 10) this.trail.shift(); }
    }
    brickColor(hp) { return [null, P.amber, P.orange, P.red][hp]; }
    drawBrick(ctx, c, r, hp, ghost) {
      const x = B.cx(c), y = B.cy(r);
      ctx.globalAlpha = ghost ? 0.5 : 1;
      ctx.fillStyle = this.brickColor(hp); ctx.beginPath(); ctx.roundRect(x, y, B.BW, B.BH, 4); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillRect(x + 3, y + 3, B.BW - 6, 3);
      if (hp > 1) text(ctx, String(hp), x + B.BW / 2, y + B.BH / 2 + 1, { size: 9, color: 'rgba(0,0,0,.55)' });
      ctx.globalAlpha = 1;
    }
    drawButton(ctx, b, on) {
      const primary = b.id === 'ready';
      ctx.fillStyle = primary && on ? P.cyan : P.faint; ctx.strokeStyle = P.panelLine; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(b.x, BTN_Y, b.w, BTN_H, 8); ctx.fill(); ctx.stroke();
      text(ctx, b.t, b.x + b.w / 2, BTN_Y + BTN_H / 2 + 1, { size: 9, color: primary && on ? P.onAccent : P.ink });
    }
    draw(ctx) {
      const m = this.m, mouse = Input.mouse, humanLayer = this.ctrl[1] === 'human', hp = this.human ? this.human.hp : 1;
      ctx.fillStyle = P.light ? '#f7f4ed' : '#05060d'; ctx.fillRect(0, 0, W, H);
      if (humanLayer) {      // empty slots, so the brick layer can see where bricks can go
        ctx.strokeStyle = P.grid; ctx.lineWidth = 1;
        for (let r = 0; r < B.ROWS; r++) for (let c = 0; c < B.COLS; c++) if (!m.g[r][c]) { ctx.beginPath(); ctx.roundRect(B.cx(c) + 0.5, B.cy(r) + 0.5, B.BW - 1, B.BH - 1, 4); ctx.stroke(); }
      }
      for (let r = 0; r < B.ROWS; r++) for (let c = 0; c < B.COLS; c++) if (m.g[r][c]) this.drawBrick(ctx, c, r, m.g[r][c]);
      for (const f of this.flash) { ctx.strokeStyle = rgba(P.cyan, 1 - f.t / 0.6); ctx.lineWidth = 3; ctx.strokeRect(B.cx(f.c) - 3, B.cy(f.r) - 3, B.BW + 6, B.BH + 6); }
      if (humanLayer && mouse.inside) {
        const k = cellAt(mouse.x, mouse.y);
        if (k) {
          if (m.phase === 'layout') { ctx.strokeStyle = P.cyan; ctx.lineWidth = 2; ctx.strokeRect(B.cx(k.c) - 1, B.cy(k.r) - 1, B.BW + 2, B.BH + 2); }
          else if (!m.g[k.r][k.c]) {
            if (!m.dropReason(k.c, k.r, hp)) this.drawBrick(ctx, k.c, k.r, hp, true);
            else { ctx.strokeStyle = P.red; ctx.lineWidth = 2; ctx.strokeRect(B.cx(k.c), B.cy(k.r), B.BW, B.BH); }
          }
        }
        if (m.phase === 'play' && !m.ball.stuck) { ctx.strokeStyle = rgba(P.red, 0.25); ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.arc(m.ball.x, m.ball.y, B.MIN_D, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
      }
      const p = m.pad, b = m.ball;
      ctx.save(); glow(ctx, P.cyan, 18); ctx.fillStyle = P.cyan; ctx.beginPath(); ctx.roundRect(p.x - m.pw / 2, B.PY - B.PH / 2, m.pw, B.PH, 6); ctx.fill(); ctx.restore();
      if (m.phase === 'play') {
        this.trail.forEach((t, i) => { ctx.fillStyle = rgba(P.cyan, i * 0.05); ctx.beginPath(); ctx.arc(t.x, t.y, 3 + i * 0.3, 0, TAU); ctx.fill(); });
        ctx.save(); glow(ctx, P.cyan, 14); ctx.fillStyle = P.light ? '#1b1d2e' : '#ffffff'; ctx.beginPath(); ctx.arc(b.x, b.y, B.BR, 0, TAU); ctx.fill(); ctx.restore();
      }
      for (const pt of this.parts) { ctx.fillStyle = rgba(P.amber, clamp(pt.l * 2, 0, 1)); ctx.fillRect(pt.x, pt.y, 4, 4); }
      ctx.fillStyle = P.light ? '#ece6d9' : '#0a0c18'; ctx.fillRect(0, 0, W, 40);
      text(ctx, `WALL ${m.wall}/${B.WALLS}`, 14, 21, { size: 11, color: P.ink, align: 'left' });
      text(ctx, `SCORE ${m.score}`, 160, 21, { size: 10, color: P.cyan, align: 'left' });
      for (let i = 0; i < m.lives; i++) { ctx.fillStyle = P.cyan; ctx.beginPath(); ctx.arc(330 + i * 16, 20, 5, 0, TAU); ctx.fill(); }
      text(ctx, 'BRICK RESERVE', 470, 21, { size: 9, color: P.orange, align: 'left' });
      text(ctx, String(m.phase === 'layout' ? m.budget - m.spent : m.reserve), 600, 21, { size: 11, color: P.ink, align: 'left' });
      if (humanLayer && m.phase === 'play') {
        [1, 2, 3].forEach(h => {
          const x = 650 + (h - 1) * 48, on = hp === h;
          ctx.fillStyle = this.brickColor(h); ctx.globalAlpha = on ? 1 : 0.35; ctx.beginPath(); ctx.roundRect(x, 12, 40, 17, 3); ctx.fill(); ctx.globalAlpha = 1;
          text(ctx, String(h), x + 20, 21, { size: 8, color: 'rgba(0,0,0,.6)' });
          if (on) { ctx.strokeStyle = P.ink; ctx.lineWidth = 2; ctx.strokeRect(x - 2, 10, 44, 21); }
        });
        if (m.cool > 0) bar(ctx, 650, 34, 136, 3, 1 - m.cool / B.COOLDOWN, P.cyan);
      }
      if (m.phase === 'layout' && humanLayer) {
        text(ctx, `DESIGN WALL ${m.wall}`, W / 2, 316, { size: 14, color: P.cyan });
        text(ctx, `${m.budget - m.spent} of ${m.budget} points left — unspent points become your mid-game reserve`, W / 2, 344, { size: 8, color: P.dim });
        BTN.forEach(bt => this.drawButton(ctx, bt, m.count() > 0));
        text(ctx, 'CLICK: ADD / TOUGHEN   RIGHT-CLICK: REMOVE', W / 2, 440, { size: 8, color: P.dim });
      } else if (b.stuck && this.ctrl[0] === 'human' && m.phase === 'play') text(ctx, 'CLICK OR SPACE TO SERVE', W / 2, 500, { size: 10, color: P.ink });
      if (this.msgT > 0) text(ctx, this.msg, W / 2, m.phase === 'layout' ? 470 : 460, { size: 12, color: P.ink, glow: P.cyan });
    }
  }

  Cab.register(Object.assign(GAMES.breakout, {
    name: 'Breakout', accent: 'cyan', View: BreakoutView, Human: BreakoutHuman,
    tagline: 'Smash the wall, or build it and make the paddle sweat.',
    about: 'The paddle has to smash 3 walls. The brick layer designs each wall on a points budget, drops extra bricks mid-game, and wins if the paddle runs out of balls.',
    sides: [
      { name: 'Paddle', color: 'cyan', goal: 'Clear all 3 walls before you run out of balls.', cpuHelp: 'Predicts where the ball will land, then angles each hit toward the thickest part of the wall.' },
      { name: 'Brick layer', color: 'orange', goal: 'Design each wall and drop extra bricks to make the paddle lose every ball.', cpuHelp: 'Builds a new pattern for each wall (armored rows, pillars, fortresses) and plugs the holes you knock in it.' },
    ],
    modes: [
      Object.assign(GAMES.breakout.modes[0], { label: 'Normal', summary: 'You play the paddle. The computer designs every wall and drops extra bricks during play.', how: '<b>Mouse</b> or <b>← →</b> to move the paddle. <b>Click</b> or <b>Space</b> to serve.', hint: 'MOUSE OR ARROW KEYS TO MOVE, CLICK TO SERVE' }),
      Object.assign(GAMES.breakout.modes[1], { label: 'Flipped', summary: 'You design the walls and drop extra bricks mid-game. The computer plays the paddle.', how: '<b>Before each wall:</b> click squares to lay bricks. Click again to make a brick tougher (2 or 3 hits); right-click removes one. Then press <b>Ready</b>.<br><b>During play:</b> click an empty square to drop a brick from your reserve. <b>1 / 2 / 3</b> or the scroll wheel picks its toughness.', hint: 'LAY OUT YOUR WALL, THEN DROP BRICKS MID-GAME' }),
    ],
    rules: '<b>Fair rules:</b> each wall has a points budget, and tougher bricks cost more. Points not spent on the layout become a reserve for mid-game drops, but a drop can\'t land within 100 px of the ball and only one is allowed every 0.9 s. A weaker computer gets a smaller budget. The paddle starts with 4 balls and earns another for each wall it clears. Each wall is faster, with a bigger budget and a shorter paddle.',
    thumb(c, w, h) {
      const cols = [P.amber, P.orange, P.red];
      for (let r = 0; r < 5; r++) for (let k = 0; k < 8; k++) { if ((r + k) % 5 === 3) continue; c.fillStyle = cols[r < 2 ? 0 : r < 4 ? 1 : 2]; c.beginPath(); c.roundRect(22 + k * 46, 50 + r * 22, 40, 16, 3); c.fill(); }
      glow(c, P.cyan, 14); c.fillStyle = P.cyan; c.beginPath(); c.roundRect(160, 268, 90, 10, 5); c.fill();
      c.fillStyle = P.light ? '#1b1d2e' : '#fff'; c.beginPath(); c.arc(240, 200, 7, 0, TAU); c.fill(); c.shadowBlur = 0;
      c.strokeStyle = P.cyan; c.lineWidth = 3; c.strokeRect(22 + 3 * 46 - 3, 50 + 3 * 22 - 3, 46, 22);
    },
  }));
})();
