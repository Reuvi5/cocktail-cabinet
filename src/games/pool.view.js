/* =====================================================================
   GEO POOL — VIEW + human controller (aim with the mouse, pull back to shoot)
   ===================================================================== */
(() => {
  const L = PoolLib, R = L.R, SIDE = ['BLUE', 'RED'];
  const BALL = { 1: '#f2c21b', 2: '#1f4fd8', 3: '#d42a1f', 4: '#6a2fb3', 5: '#f07a12', 6: '#178a3a', 7: '#7d1f22', 8: '#141414' };
  const ballColor = n => BALL[n > 8 ? n - 8 : n];
  const FELT = { hexagon: ['#0f6b45', '#2c9a64'], cross: ['#163f8c', '#3a6fc4'], ellipse: ['#4b2477', '#7a4cb3'] };
  const RAIL = { hexagon: ['#0a4a30', '#1e7a4c'], cross: ['#0e2b61', '#28539b'], ellipse: ['#331753', '#5c3790'] };
  const tableOf = store => { if (!store.table) { try { store.table = localStorage.getItem('cab-pool-table'); } catch (e) { } } if (!L.TABLES[store.table]) store.table = 'hexagon'; return store.table; };
  const myTurn = (m, side) => !m.result && m.turn === side && m.phase === 'aim';

  // where the cue ball would first touch a ball or a cushion, aiming along angle a
  function rayCast(m, a) {
    const c = m.cue, dx = Math.cos(a), dy = Math.sin(a), T = m.table;
    let tb = Infinity, ball = null;
    for (const b of m.balls) if (b.on && b.n !== 0) {
      const fx = c.x - b.x, fy = c.y - b.y, B = fx * dx + fy * dy, C = fx * fx + fy * fy - 4 * R * R, disc = B * B - C;
      if (disc < 0) continue; const t = -B - Math.sqrt(disc); if (t > 0 && t < tb) { tb = t; ball = b; }
    }
    let tw = 1400;
    for (let t = 2; t < 1400; t += 2) if (!L.fits(T, c.x + dx * t, c.y + dy * t, -0.5)) { tw = t; break; }
    if (ball && tb < tw) return { t: tb, ball, x: c.x + dx * tb, y: c.y + dy * tb, dx, dy };
    return { t: tw, x: c.x + dx * tw, y: c.y + dy * tw, dx, dy, wall: true };
  }
  function wallNormal(T, x, y) {
    if (T.kind === 'ellipse') { const nx = -(x - T.cx) / (T.a * T.a), ny = -(y - T.cy) / (T.b * T.b), l = Math.hypot(nx, ny); return [nx / l, ny / l]; }
    let best = null, bd = 1e9;
    for (const [p, q] of T.edges) { const c = L.closestOnSeg(x, y, p[0], p[1], q[0], q[1]), d = Math.hypot(x - c[0], y - c[1]); if (d < bd) { bd = d; best = c; } }
    const nx = x - best[0], ny = y - best[1], l = Math.hypot(nx, ny) || 1;
    return inside(T, x, y) ? [nx / l, ny / l] : [-nx / l, -ny / l];
  }
  const inside = (T, x, y) => L.fits(T, x, y, -R + 0.5);

  class PoolHuman {
    constructor(side, model) { this.side = side; this.m = model; this.q = []; this.aim = Math.PI; this.drag = null; this.moving = false; this.pend = null; this.pow = 0.5; this.power = 0; this.lastMouse = null; }
    key(code, down, m) {
      if (!down || !myTurn(m, this.side)) return;
      const fine = held('ShiftLeft', 'ShiftRight') ? 0.035 : 0.004;
      if (code === 'ArrowLeft') this.aim -= fine;
      if (code === 'ArrowRight') this.aim += fine;
      if (code === 'ArrowUp') this.pow = clamp(this.pow + 0.05, 0.05, 1);
      if (code === 'ArrowDown') this.pow = clamp(this.pow - 0.05, 0.05, 1);
      if (code === 'Space') this.q.push({ shoot: { a: this.aim, p: this.pow } });
      if (code.startsWith('Arrow')) this.keyed = true;
    }
    mouse(type, x, y, btn, e, m) {
      if (!myTurn(m, this.side)) { this.drag = null; this.moving = false; return; }
      const c = m.cue;
      if (type === 'move') {
        if (this.moving) { this.pend = { place: { x, y } }; return; }
        if (this.drag) { const pull = (this.drag.x - x) * Math.cos(this.aim) + (this.drag.y - y) * Math.sin(this.aim); this.power = clamp(pull / 220, 0, 1); return; }
        if (this.keyed && this.lastMouse && Math.hypot(x - this.lastMouse.x, y - this.lastMouse.y) < 6) return;
        this.keyed = false; this.lastMouse = { x, y };
        if (Math.hypot(x - c.x, y - c.y) > 4) this.aim = Math.atan2(y - c.y, x - c.x);
        return;
      }
      if (type === 'down') {
        if (m.inHand && Math.hypot(x - c.x, y - c.y) < 2 * R + 8) { this.moving = true; return; }
        if (!this.keyed && Math.hypot(x - c.x, y - c.y) > 4) this.aim = Math.atan2(y - c.y, x - c.x);
        this.drag = { x, y }; this.power = 0; return;
      }
      if (type === 'up') {
        if (this.moving) { this.moving = false; return; }
        if (this.drag) { if (this.power >= 0.03) { this.pow = this.power; this.q.push({ shoot: { a: this.aim, p: this.power } }); } this.drag = null; this.power = 0; }
      }
    }
    act(m) { if (this.pend) { const p = this.pend; this.pend = null; return p; } return this.q.shift() || null; }
  }

  class PoolView {
    constructor(model, o) {
      this.m = model; this.ctrl = o.ctrl; this.humans = o.ctrls.filter(c => c instanceof PoolHuman); this.two = this.humans.length === 2;
      this.msg = ''; this.msgT = 0; this.fx = []; this.sndT = 0; this.t = 0;
    }
    who(s) { return this.two ? SIDE[s] : this.ctrl[s] === 'human' ? 'YOU' : 'COMPUTER'; }
    say(t, d = 2.6) { this.msg = t; this.msgT = d; }
    onEvent(e) {
      const m = this.m;
      if (e.type === 'click' && this.sndT <= 0) { Sound.beep(1700 + Math.random() * 300, 0.025, 'square', clamp(e.v / 9000, 0.01, 0.07)); this.sndT = 0.03; }
      if (e.type === 'rail' && this.sndT <= 0) { Sound.beep(110, 0.06, 'sine', clamp(e.v / 12000, 0.01, 0.05)); this.sndT = 0.03; }
      if (e.type === 'pot') { Sound.beep(e.n === 0 ? 160 : 300, 0.12, 'triangle', 0.06, -150); this.fx.push({ x: e.x, y: e.y, t: 0, n: e.n }); }
      if (e.type === 'groups') this.say(`${this.who(e.side)} ${this.two || this.ctrl[e.side] === 'human' ? 'take' : 'takes'} ${e.group === 'solid' ? 'SOLIDS (1–7)' : 'STRIPES (9–15)'}`);
      if (e.type === 'foul') { this.say(e.why.toUpperCase()); Sound.beep(150, 0.15, 'sawtooth', 0.04); }
      if (e.type === 'say') this.say(e.text.toUpperCase(), e.t + 1);
      if (e.type === 'turn' && !e.same && !e.brk && this.msgT < 1.2) this.say(this.two ? `${SIDE[e.side]}'S TURN` : this.ctrl[e.side] === 'human' ? 'YOUR TURN' : "COMPUTER'S TURN", 1.6);
      void m;
    }
    update(dt) { this.t += dt; this.msgT -= dt; this.sndT -= dt; for (const f of this.fx) f.t += dt; this.fx = this.fx.filter(f => f.t < 0.7); }

    drawTable(ctx) {
      const T = this.m.table, Lt = P.light ? 1 : 0, felt = FELT[T.id][Lt], rail = RAIL[T.id][Lt], wood = P.light ? '#9a6434' : '#5b3417';
      const path = () => { ctx.beginPath(); if (T.kind === 'ellipse') ctx.ellipse(T.cx, T.cy, T.a + R, T.b + R, 0, 0, TAU); else { T.verts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); } };
      ctx.save(); ctx.lineJoin = 'round';
      path(); ctx.strokeStyle = wood; ctx.lineWidth = 48; ctx.stroke();
      path(); ctx.strokeStyle = P.light ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.07)'; ctx.lineWidth = 46; ctx.stroke();
      path(); ctx.strokeStyle = rail; ctx.lineWidth = 24; ctx.stroke();
      path(); ctx.fillStyle = felt; ctx.fill();
      // diamonds on the wood, and the spots
      ctx.fillStyle = P.light ? '#f4e6c8' : '#d8c08c';
      const [hx, hy] = T.head, [fx, fy] = T.foot;
      ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(hx, hy, 2.5, 0, TAU); ctx.arc(fx, fy, 2.5, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
      if (T.kind === 'ellipse') {   // the marked focus: send a ball over it and it bounces into the focus pocket
        const [x, y] = T.f1, pulse = 0.55 + 0.25 * Math.sin(this.t * 3);
        ctx.strokeStyle = `rgba(255,255,255,${pulse})`; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x + 8, y); ctx.lineTo(x, y + 8); ctx.lineTo(x - 8, y); ctx.closePath(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.arc(x, y, 2, 0, TAU); ctx.fill();
      }
      for (const p of T.pockets) {
        ctx.fillStyle = '#060606';
        if (p.hole) { ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, p.cap + 1, 0, TAU); ctx.fill(); ctx.stroke(); }
        else { ctx.beginPath(); ctx.arc(p.x, p.y, 19, 0, TAU); ctx.fill(); }
      }
      for (const f of this.fx) { ctx.strokeStyle = f.n === 0 ? `rgba(255,80,80,${1 - f.t / 0.7})` : `rgba(255,230,140,${1 - f.t / 0.7})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(f.x, f.y, 18 + f.t * 40, 0, TAU); ctx.stroke(); }
      ctx.restore();
    }
    drawBall(ctx, b, x = b.x, y = b.y, r = R) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.arc(x + 1.5, y + 2.5, r, 0, TAU); ctx.fill();
      if (b.n === 0) { ctx.fillStyle = '#f6f4ec'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
      else if (b.n > 8) {
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = '#f6f4ec'; ctx.fill(); ctx.clip();
        ctx.fillStyle = ballColor(b.n); ctx.fillRect(x - r, y - r * 0.55, 2 * r, r * 1.1);
      } else { ctx.fillStyle = ballColor(b.n); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
      ctx.restore();
      if (b.n) {
        ctx.fillStyle = '#fbfaf5'; ctx.beginPath(); ctx.arc(x, y, r * 0.48, 0, TAU); ctx.fill();
        ctx.fillStyle = '#151515'; ctx.font = `bold ${Math.round(r * 0.72)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(b.n), x, y + 0.5);
      }
      ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.4, r * 0.25, 0, TAU); ctx.fill();
    }
    drawGuide(ctx, h) {
      const m = this.m, c = m.cue, a = h.aim, hit = rayCast(m, a);
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(hit.x, hit.y); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(hit.x, hit.y, R, 0, TAU); ctx.stroke();
      if (hit.ball) {
        const b = hit.ball, nx = (b.x - hit.x) / (2 * R), ny = (b.y - hit.y) / (2 * R), cosc = hit.dx * nx + hit.dy * ny, legal = m.targets(m.turn).includes(b);
        ctx.strokeStyle = legal ? 'rgba(255,255,255,.9)' : 'rgba(255,90,90,.95)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + nx * (40 + 80 * cosc), b.y + ny * (40 + 80 * cosc)); ctx.stroke();
        const tx = hit.dx - cosc * nx, ty = hit.dy - cosc * ny, tl = Math.hypot(tx, ty);
        if (tl > 0.05) { ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(hit.x, hit.y); ctx.lineTo(hit.x + tx / tl * 60 * tl, hit.y + ty / tl * 60 * tl); ctx.stroke(); }
        if (!legal) text(ctx, '✕', b.x, b.y - 22, { size: 10, color: '#ff6a6a' });
      } else {
        const [nx, ny] = wallNormal(m.table, hit.x, hit.y), d = hit.dx * nx + hit.dy * ny, rx = hit.dx - 2 * d * nx, ry = hit.dy - 2 * d * ny;
        ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.moveTo(hit.x, hit.y); ctx.lineTo(hit.x + rx * 70, hit.y + ry * 70); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.restore();
    }
    drawCue(ctx, h) {
      const c = this.m.cue, a = h.aim, pull = 16 + (h.drag ? h.power : 0) * 90, ca = Math.cos(a), sa = Math.sin(a);
      const x0 = c.x - ca * pull, y0 = c.y - sa * pull, x1 = x0 - ca * 330, y1 = y0 - sa * 330;
      ctx.save(); ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(x0 + 2, y0 + 3); ctx.lineTo(x1 + 2, y1 + 3); ctx.stroke();
      const g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, '#f2efe6'); g.addColorStop(0.03, '#f2efe6'); g.addColorStop(0.04, '#2a6fd6'); g.addColorStop(0.06, '#d9b47a'); g.addColorStop(0.7, '#a8733c'); g.addColorStop(1, '#3a2212');
      ctx.strokeStyle = g; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.restore();
    }
    drawHud(ctx) {
      const m = this.m, L2 = P.light, col = [P.cyan, P.red];
      [0, 1].forEach(s => {
        const x = s ? W - 300 : 20, on = !m.result && m.turn === s, g = m.group[s];
        panelBox(ctx, x, 12, 280, 70, on ? rgba(col[s], L2 ? 0.12 : 0.16) : P.panel, on ? col[s] : P.panelLine);
        text(ctx, this.two ? `${SIDE[s]} PLAYER` : this.who(s), x + 16, 34, { size: 11, color: col[s], align: 'left' });
        text(ctx, g ? (g === 'solid' ? 'SOLIDS' : 'STRIPES') : 'OPEN TABLE', x + 264, 34, { size: 8, color: P.dim, align: 'right' });
        const list = g ? (g === 'solid' ? [1, 2, 3, 4, 5, 6, 7] : [9, 10, 11, 12, 13, 14, 15]).concat([8]) : [];
        list.forEach((n, i) => { const b = m.ball(n), bx = x + 24 + i * 31, by = 60; ctx.globalAlpha = b.on ? 1 : 0.18; this.drawBall(ctx, { n }, bx, by, 9); ctx.globalAlpha = 1; });
        if (!g) text(ctx, s === 0 ? 'BREAKS FIRST' : 'SINK A BALL TO CLAIM A GROUP', x + 16, 60, { size: 7, color: P.dim, align: 'left' });
      });
      text(ctx, m.table.name.toUpperCase() + ' TABLE', W / 2, 30, { size: 9, color: P.ink2 });
      let status = '';
      if (!m.result && m.phase === 'aim') {
        const t = m.turn, human = this.ctrl[t] === 'human';
        status = human ? (m.inHand ? 'BALL IN HAND · DRAG THE CUE BALL' : m.isBreak ? 'BREAK!' : this.two ? `${SIDE[t]} TO SHOOT` : 'YOUR SHOT') : 'COMPUTER IS LINING UP…';
      }
      text(ctx, status, W / 2, 56, { size: 8, color: P.amber });
    }
    draw(ctx) {
      const m = this.m;
      ctx.fillStyle = P.light ? '#ece6da' : '#07080d'; ctx.fillRect(0, 0, W, H);
      this.drawTable(ctx);
      const h = this.humans.find(c => c.side === m.turn), aiming = h && myTurn(m, h.side) && m.wait <= 0;
      if (aiming && !h.moving) this.drawGuide(ctx, h);
      for (const b of m.balls) if (b.on) this.drawBall(ctx, b);
      if (aiming && m.inHand) { ctx.strokeStyle = rgba(P.amber, 0.6 + 0.4 * Math.sin(this.t * 6)); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(m.cue.x, m.cue.y, R + 6, 0, TAU); ctx.stroke(); }
      if (aiming && !h.moving) this.drawCue(ctx, h);
      if (aiming) {   // power meter
        const p = h.drag ? h.power : h.pow, x = W - 26, y0 = 150, hh = 300;
        ctx.fillStyle = P.faint; ctx.fillRect(x, y0, 12, hh);
        const g = ctx.createLinearGradient(0, y0 + hh, 0, y0); g.addColorStop(0, '#3ad06a'); g.addColorStop(0.6, '#f2c21b'); g.addColorStop(1, '#e8402a');
        ctx.fillStyle = g; ctx.fillRect(x, y0 + hh * (1 - p), 12, hh * p);
        ctx.strokeStyle = P.panelLine; ctx.lineWidth = 1; ctx.strokeRect(x, y0, 12, hh);
        text(ctx, 'POWER', x + 6, y0 + hh + 16, { size: 6, color: P.dim });
      }
      this.drawHud(ctx);
      if (this.msgT > 0 && this.msg) { const w = Math.min(760, 40 + this.msg.length * 9.5); panelBox(ctx, W / 2 - w / 2, H - 38, w, 30); text(ctx, this.msg, W / 2, H - 22, { size: 9, color: P.ink }); }
    }
  }

  Cab.register(Object.assign(GAMES.pool, {
    name: 'Geo Pool', accent: 'green', View: PoolView, Human: PoolHuman, endDelay: 1.2,
    modelOpts: store => ({ table: tableOf(store) }),
    panelSection(store) {
      const cur = tableOf(store);
      return `<h4>TABLE</h4><div class="seg three tables" role="group" aria-label="Table shape">${L.TABLE_IDS.map(id => `<button type="button" data-table="${id}" class="${id === cur ? 'on' : ''}">${L.TABLES[id].name}</button>`).join('')}</div>
        <p class="modeline">${{ hexagon: 'Six walls and a pocket in every corner. The friendliest table.', cross: 'A plus sign with eight corner pockets. The inside corners stick out and bounce balls back.', ellipse: 'One focus pocket plus three cushion pockets. Roll a ball over the white diamond and it bounces straight into the focus pocket.' }[cur]}</p>`;
    },
    bindPanel(p, cab) {
      p.querySelectorAll('.seg.tables button').forEach(b => b.onclick = () => { b.blur(); if (b.dataset.table !== tableOf(cab.store())) { cab.store().table = b.dataset.table; try { localStorage.setItem('cab-pool-table', b.dataset.table); } catch (e) { } cab.renderPanel(); cab.newRound(); } });
    },
    resultText(m, ctrl) {
      const s = m.result.winner, two = ctrl.every(c => c === 'human');
      return { title: two ? `${SIDE[s]} WINS!` : ctrl[s] === 'human' ? 'YOU WIN!' : 'THE COMPUTER WINS', detail: `${two ? SIDE[s] : ctrl[s] === 'human' ? 'You' : 'The computer'}: ${m.result.detail.toLowerCase()}\n${m.table.name} table · ${m.shots[0] + m.shots[1]} shots` };
    },
    tagline: '8-ball pool on a hexagon, a cross and an ellipse.',
    about: 'Our 8th game: 8-ball pool on tables that aren\'t rectangles. Sink a ball to claim solids or stripes, clear your group, then sink the 8. Sink the 8 too early and you lose.',
    sides: [
      { name: 'Blue player', color: 'cyan', goal: 'Break, claim solids or stripes, clear them, then sink the 8.', cpuHelp: '' },
      { name: 'Red player', color: 'red', goal: 'Claim a group, clear it, then sink the 8 before Blue does.', cpuHelp: 'Looks for every pot it can see and picks the safest. A stronger computer aims steadier, checks its shot first and plays for its next shot.' },
    ],
    modes: [
      Object.assign(GAMES.pool.modes[0], { label: 'vs Computer', summary: 'You play blue and break. The computer plays red.', how: '<b>Move the mouse</b> to aim. <b>Press and drag back</b> to set the power, <b>release</b> to shoot. <b>← →</b> fine-tune the aim (<b>Shift</b> for bigger steps), <b>↑ ↓</b> set the power, <b>Space</b> shoots. After a foul you get <b>ball in hand</b>: drag the cue ball anywhere.', hint: 'AIM WITH THE MOUSE · DRAG BACK AND RELEASE TO SHOOT' }),
      Object.assign(GAMES.pool.modes[1], { label: '2 Players', summary: 'Two people take turns on one computer. Blue breaks.', how: 'Same controls for both players: <b>move the mouse</b> to aim, <b>press and drag back</b>, <b>release</b> to shoot. The screen says whose turn it is.', hint: 'TAKE TURNS · DRAG BACK AND RELEASE TO SHOOT' }),
    ],
    rules: '<b>Rules:</b> the first ball you sink after the break claims your group. Keep shooting while you sink your own balls. A <b>foul</b> (cue ball goes in, hits nothing, or hits the wrong ball first) gives the other player ball in hand. Sink the 8 only after your group is gone. <b>Getting harder:</b> the computer level sets how steady its aim is, how carefully it picks shots, and whether it plans its next shot. It uses the same physics and never moves a ball.',
    thumb(c, w, h) {
      const Lt = P.light ? 1 : 0;
      c.fillStyle = P.light ? '#ece6da' : '#07080d'; c.fillRect(0, 0, w, h);
      const pts = Array.from({ length: 6 }, (_, i) => [w / 2 + 150 * Math.cos(i * Math.PI / 3), h / 2 + 150 * Math.sin(i * Math.PI / 3)]);
      const path = () => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); };
      c.lineJoin = 'round'; path(); c.strokeStyle = P.light ? '#9a6434' : '#5b3417'; c.lineWidth = 30; c.stroke();
      path(); c.strokeStyle = RAIL.hexagon[Lt]; c.lineWidth = 14; c.stroke(); path(); c.fillStyle = FELT.hexagon[Lt]; c.fill();
      c.fillStyle = '#060606'; pts.forEach(([x, y]) => { c.beginPath(); c.arc(x, y, 12, 0, TAU); c.fill(); });
      const r = 9, sp = 18.4; let k = 0; const nums = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5];
      for (let i = 0; i < 4; i++) for (let j = 0; j <= i; j++) {
        const x = w / 2 + 40 + i * sp * 0.866, y = h / 2 + (j - i / 2) * sp, n = nums[k++];
        c.save(); c.beginPath(); c.arc(x, y, r, 0, TAU);
        if (n > 8) { c.fillStyle = '#f6f4ec'; c.fill(); c.clip(); c.fillStyle = ballColor(n); c.fillRect(x - r, y - r * 0.55, 2 * r, r * 1.1); } else { c.fillStyle = ballColor(n); c.fill(); }
        c.restore();
      }
      c.fillStyle = '#f6f4ec'; c.beginPath(); c.arc(w / 2 - 80, h / 2, r, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(255,255,255,.7)'; c.setLineDash([5, 5]); c.lineWidth = 1.5; c.beginPath(); c.moveTo(w / 2 - 80, h / 2); c.lineTo(w / 2 + 28, h / 2); c.stroke(); c.setLineDash([]);
    },
  }));
})();
