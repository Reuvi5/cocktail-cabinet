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

  const SPIN = { x: 757, y: 528, r: 28 };   // the spin selector, bottom right
  // play the shot on a copy of the table with the real physics, and record what the guide should show:
  // the cue ball's path to its first hit (bends, cushions and portal jumps included), then a short stretch
  // of where the object ball and the cue ball go next
  function trace(m, a, p, sx, sy) {
    const T = m.table, bs = m.balls.map(b => ({ n: b.n, x: b.x, y: b.y, vx: 0, vy: 0, on: b.on, sf: 0, ss: 0 })), cue = bs.find(b => b.n === 0);
    L.strike(cue, a, p * L.MAXV, sx, sy);
    const out = { segs: [[[cue.x, cue.y]]], hit: null, obj: null, objPath: [], after: [], warps: [] };
    let len = 0, lx = cue.x, ly = cue.y, after = 0;
    const hk = {
      hit(x, y) { if (!out.hit && (x.n === 0 || y.n === 0)) { const o = x.n === 0 ? y : x; out.hit = [cue.x, cue.y]; out.obj = o; out.objPath.push([o.x, o.y]); out.after.push([cue.x, cue.y]); } },
      warp(b, from, to) { if (b.n === 0 && !out.hit) { out.segs[out.segs.length - 1].push([from.x, from.y]); out.segs.push([[to.x, to.y]]); out.warps.push([from, to]); lx = to.x; ly = to.y; } },
      rail() { }, pot(b) { if (b.n === 0 && !out.hit) out.potted = true; }, bump() { },
    };
    for (let t = 0; t < 6; t += DT) {
      const moving = L.step(T, bs, DT, hk);
      if (!out.hit) {
        if (!cue.on) break;
        out.segs[out.segs.length - 1].push([cue.x, cue.y]); len += Math.hypot(cue.x - lx, cue.y - ly); lx = cue.x; ly = cue.y;
        if (len > 900) break;
      } else {
        after += DT;
        const o = out.obj, op = out.objPath[out.objPath.length - 1];
        if (o.on && Math.hypot(o.x - out.objPath[0][0], o.y - out.objPath[0][1]) < 130 && (o.x !== op[0] || o.y !== op[1])) out.objPath.push([o.x, o.y]);
        if (cue.on && Math.hypot(cue.x - out.hit[0], cue.y - out.hit[1]) < 90) out.after.push([cue.x, cue.y]);
        if (after > 0.8) break;
      }
      if (!moving) break;
    }
    return out;
  }
  const poly = (ctx, pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); };

  class PoolHuman {
    constructor(side, model) { this.side = side; this.m = model; this.q = []; this.aim = Math.PI; this.drag = null; this.moving = false; this.pend = null; this.pow = 0.5; this.power = 0; this.lastMouse = null; this.sx = 0; this.sy = 0; this.spinDrag = false; }
    setSpin(x, y) { const l = Math.hypot(x, y); if (l > 0.9) { x *= 0.9 / l; y *= 0.9 / l; } this.sx = Math.round(x * 20) / 20; this.sy = Math.round(y * 20) / 20; }
    fire(p) { this.q.push({ shoot: { a: this.aim, p, sx: this.sx, sy: this.sy } }); this.sx = this.sy = 0; }
    key(code, down, m) {
      if (!down || !myTurn(m, this.side)) return;
      const fine = held('ShiftLeft', 'ShiftRight') ? 0.035 : 0.004;
      if (code === 'ArrowLeft') this.aim -= fine;
      if (code === 'ArrowRight') this.aim += fine;
      if (code === 'ArrowUp') this.pow = clamp(this.pow + 0.05, 0.05, 1);
      if (code === 'ArrowDown') this.pow = clamp(this.pow - 0.05, 0.05, 1);
      if (code === 'KeyW') this.setSpin(this.sx, this.sy + 0.15);
      if (code === 'KeyS') this.setSpin(this.sx, this.sy - 0.15);
      if (code === 'KeyA') this.setSpin(this.sx - 0.15, this.sy);
      if (code === 'KeyD') this.setSpin(this.sx + 0.15, this.sy);
      if (code === 'KeyX') this.setSpin(0, 0);
      if (code === 'Space') this.fire(this.pow);
      if (code.startsWith('Arrow')) this.keyed = true;
    }
    mouse(type, x, y, btn, e, m) {
      if (!myTurn(m, this.side)) { this.drag = null; this.moving = false; return; }
      const c = m.cue;
      const onSpin = Math.hypot(x - SPIN.x, y - SPIN.y) < SPIN.r + 6;
      if (this.spinDrag) { if (type === 'up') this.spinDrag = false; else this.setSpin((x - SPIN.x) / (SPIN.r * 0.8), -(y - SPIN.y) / (SPIN.r * 0.8)); return; }
      if (type === 'down' && onSpin) { this.spinDrag = true; this.setSpin((x - SPIN.x) / (SPIN.r * 0.8), -(y - SPIN.y) / (SPIN.r * 0.8)); return; }
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
        if (this.drag) { if (this.power >= 0.03) { this.pow = this.power; this.fire(this.power); } this.drag = null; this.power = 0; }
      }
    }
    act(m) { if (this.pend) { const p = this.pend; this.pend = null; return p; } return this.q.shift() || null; }
  }

  class PoolView {
    constructor(model, o) {
      this.m = model; this.ctrl = o.ctrl; this.humans = o.ctrls.filter(c => c instanceof PoolHuman); this.two = this.humans.length === 2;
      this.msg = ''; this.msgT = 0; this.fx = []; this.sndT = 0; this.t = 0; this.flash = []; this.guide = null; this.guideKey = '';
    }
    who(s) { return this.two ? SIDE[s] : this.ctrl[s] === 'human' ? 'YOU' : 'COMPUTER'; }
    say(t, d = 2.6) { this.msg = t; this.msgT = d; }
    onEvent(e) {
      const m = this.m;
      if (e.type === 'click' && this.sndT <= 0) { Sound.beep(1700 + Math.random() * 300, 0.025, 'square', clamp(e.v / 9000, 0.01, 0.07)); this.sndT = 0.03; }
      if (e.type === 'rail' && this.sndT <= 0) { Sound.beep(110, 0.06, 'sine', clamp(e.v / 12000, 0.01, 0.05)); this.sndT = 0.03; }
      if (e.type === 'pot') { Sound.beep(e.n === 0 ? 160 : 300, 0.12, 'triangle', 0.06, -150); this.fx.push({ x: e.x, y: e.y, t: 0, n: e.n }); }
      if (e.type === 'bump') { Sound.beep(520 + Math.random() * 80, 0.08, 'square', 0.05, 240); this.flash.push({ x: e.x, y: e.y, t: 0, c: '#ffd23f' }); }
      if (e.type === 'warp') { Sound.beep(880, 0.12, 'sine', 0.05, -500); this.flash.push({ x: e.x0, y: e.y0, t: 0, c: '#2ee6d6' }, { x: e.x1, y: e.y1, t: 0, c: '#ff4fd8' }); }
      if (e.type === 'groups') this.say(`${this.who(e.side)} ${this.two || this.ctrl[e.side] === 'human' ? 'take' : 'takes'} ${e.group === 'solid' ? 'SOLIDS (1–7)' : 'STRIPES (9–15)'}`);
      if (e.type === 'foul') { this.say(e.why.toUpperCase()); Sound.beep(150, 0.15, 'sawtooth', 0.04); }
      if (e.type === 'say') this.say(e.text.toUpperCase(), e.t + 1);
      if (e.type === 'turn' && !e.same && !e.brk && this.msgT < 1.2) this.say(this.two ? `${SIDE[e.side]}'S TURN` : this.ctrl[e.side] === 'human' ? 'YOUR TURN' : "COMPUTER'S TURN", 1.6);
      void m;
    }
    update(dt) {
      this.t += dt; this.msgT -= dt; this.sndT -= dt;
      for (const f of this.fx) f.t += dt; this.fx = this.fx.filter(f => f.t < 0.7);
      for (const f of this.flash) f.t += dt; this.flash = this.flash.filter(f => f.t < 0.45);
    }
    // the gadgets: portals (hexagon), bumpers (cross), gravity well (ellipse)
    drawGadgets(ctx) {
      const T = this.m.table, t = this.t;
      ctx.save();
      if (T.well) {
        const w = T.well, g = ctx.createRadialGradient(w.x, w.y, 4, w.x, w.y, w.r);
        g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(0.6, 'rgba(0,0,0,.18)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, TAU); ctx.fill();
        for (let i = 0; i < 4; i++) {   // rings drifting inward
          const f = ((t * 0.35 + i / 4) % 1), r = w.r * (1 - f);
          ctx.strokeStyle = `rgba(255,255,255,${0.22 * f})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(w.x, w.y, r, 0, TAU); ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 1.5;
        for (let k = 0; k < 3; k++) { const a0 = t * 0.9 + k * TAU / 3; ctx.beginPath(); for (let s = 0; s <= 20; s++) { const r = w.r * 0.95 * (1 - s / 22), a = a0 + s * 0.16; s ? ctx.lineTo(w.x + Math.cos(a) * r, w.y + Math.sin(a) * r) : ctx.moveTo(w.x + Math.cos(a) * r, w.y + Math.sin(a) * r); } ctx.stroke(); }
      }
      (T.portals || []).forEach((p, i) => {
        const col = i ? '#ff4fd8' : '#2ee6d6', g = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, p.r + 6);
        g.addColorStop(0, '#05050a'); g.addColorStop(0.7, rgba(col, 0.55)); g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 6, 0, TAU); ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 2.5;
        for (let k = 0; k < 3; k++) { const a = (i ? -1 : 1) * t * 2.4 + k * TAU / 3; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 1, a, a + 1.3); ctx.stroke(); }
      });
      for (const u of T.bumpers || []) {
        ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.arc(u.x + 2, u.y + 3, u.r, 0, TAU); ctx.fill();
        const g = ctx.createRadialGradient(u.x - 4, u.y - 5, 2, u.x, u.y, u.r); g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#c9ced8'); g.addColorStop(1, '#7c8394');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(u.x, u.y, u.r, 0, TAU); ctx.fill();
        ctx.fillStyle = '#f2b81b'; ctx.beginPath(); ctx.arc(u.x, u.y, u.r * 0.55, 0, TAU); ctx.fill();
        ctx.fillStyle = '#7a4b00'; ctx.beginPath(); ctx.arc(u.x, u.y, u.r * 0.22, 0, TAU); ctx.fill();
      }
      for (const f of this.flash) { ctx.strokeStyle = rgba(f.c, 1 - f.t / 0.45); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(f.x, f.y, 16 + f.t * 50, 0, TAU); ctx.stroke(); }
      ctx.restore();
    }
    drawSpin(ctx, h) {
      const { x, y, r } = SPIN;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.arc(x + 2, y + 3, r, 0, TAU); ctx.fill();
      ctx.fillStyle = '#f6f4ec'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, r * 0.8, 0, TAU); ctx.stroke();
      const dx = x + h.sx * r * 0.8, dy = y - h.sy * r * 0.8;
      ctx.fillStyle = '#d42a1f'; ctx.beginPath(); ctx.arc(dx, dy, 5, 0, TAU); ctx.fill();
      ctx.restore();
      const lbl = h.sy > 0.1 ? 'FOLLOW' : h.sy < -0.1 ? 'DRAW' : h.sx ? '' : 'CENTRE', side = h.sx > 0.1 ? 'RIGHT' : h.sx < -0.1 ? 'LEFT' : '';
      text(ctx, 'SPIN', x, y - r - 10, { size: 6, color: P.dim });
      text(ctx, [lbl, side].filter(Boolean).join(' + ') || 'CENTRE', x, y + r + 11, { size: 6, color: P.ink2 });
    }

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
      const m = this.m, c = m.cue, p = h.drag && h.power > 0.03 ? h.power : h.pow;
      const key = [h.aim.toFixed(4), p.toFixed(3), h.sx, h.sy, c.x.toFixed(1), c.y.toFixed(1), m.shots[0] + m.shots[1]].join();
      if (key !== this.guideKey) { this.guideKey = key; this.guide = trace(m, h.aim, p, h.sx, h.sy); }
      const g = this.guide;
      ctx.save(); ctx.lineJoin = 'round';
      ctx.strokeStyle = g.potted && !g.hit ? 'rgba(255,110,110,.85)' : 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 6]);
      for (const sg of g.segs) poly(ctx, sg);
      ctx.setLineDash([]);
      for (const [a, b] of g.warps) { ctx.strokeStyle = '#2ee6d6'; ctx.beginPath(); ctx.arc(a.x, a.y, a.r + 5, 0, TAU); ctx.stroke(); ctx.strokeStyle = '#ff4fd8'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 5, 0, TAU); ctx.stroke(); }
      if (g.hit) {
        const legal = m.targets(m.turn).some(b => b.n === g.obj.n);
        ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(g.hit[0], g.hit[1], R, 0, TAU); ctx.stroke();
        ctx.strokeStyle = legal ? 'rgba(255,255,255,.95)' : 'rgba(255,90,90,.95)'; ctx.lineWidth = 2.5; poly(ctx, g.objPath);
        ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 4]); poly(ctx, g.after); ctx.setLineDash([]);
        if (!legal) { const b = m.ball(g.obj.n); text(ctx, '✕', b.x, b.y - 22, { size: 10, color: '#ff6a6a' }); }
      } else if (g.potted) { const sg = g.segs[g.segs.length - 1], e = sg[sg.length - 1]; text(ctx, 'SCRATCH', e[0], e[1] - 18, { size: 7, color: '#ff6a6a' }); }
      ctx.restore();
    }
    drawCue(ctx, h) {
      const c = this.m.cue, a = h.aim, pull = 16 + (h.drag ? h.power : 0) * 90, ca = Math.cos(a), sa = Math.sin(a), off = h.sx * R * 0.7;
      const x0 = c.x - ca * pull - sa * off, y0 = c.y - sa * pull + ca * off, x1 = x0 - ca * 330, y1 = y0 - sa * 330;
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
      this.drawGadgets(ctx);
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
        this.drawSpin(ctx, h);
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
        <p class="modeline">${{ hexagon: 'Six walls, a pocket in every corner, and two linked <b>portals</b>: a ball that rolls into one comes out of the other, same speed, same direction.', cross: 'A plus sign with eight corner pockets. Its four inside corners are pinball <b>bumpers</b> that kick balls back out faster.', ellipse: 'A <b>gravity well</b> in the middle bends rolling balls. One pocket sits on a focus: roll a ball over the white diamond and it bounces straight into it.' }[cur]}</p>`;
    },
    bindPanel(p, cab) {
      p.querySelectorAll('.seg.tables button').forEach(b => b.onclick = () => { b.blur(); if (b.dataset.table !== tableOf(cab.store())) { cab.store().table = b.dataset.table; try { localStorage.setItem('cab-pool-table', b.dataset.table); } catch (e) { } cab.renderPanel(); cab.newRound(); } });
    },
    resultText(m, ctrl) {
      const s = m.result.winner, two = ctrl.every(c => c === 'human');
      return { title: two ? `${SIDE[s]} WINS!` : ctrl[s] === 'human' ? 'YOU WIN!' : 'THE COMPUTER WINS', detail: `${two ? SIDE[s] : ctrl[s] === 'human' ? 'You' : 'The computer'}: ${m.result.detail.toLowerCase()}\n${m.table.name} table · ${m.shots[0] + m.shots[1]} shots` };
    },
    tagline: '8-ball with spin, portals, bumpers and a gravity well.',
    about: 'Our 8th game: 8-ball on tables that aren\'t rectangles, each with its own gadget. Put spin on the cue ball to follow through, draw back or swerve around a ball. Sink a ball to claim solids or stripes, clear your group, then sink the 8.',
    sides: [
      { name: 'Blue player', color: 'cyan', goal: 'Break, claim solids or stripes, clear them, then sink the 8.', cpuHelp: '' },
      { name: 'Red player', color: 'red', goal: 'Claim a group, clear it, then sink the 8 before Blue does.', cpuHelp: 'Looks for every pot it can see and picks the safest. A stronger computer aims steadier, picks follow or draw, plans its next shot and finds swerves, bank, portal and bumper shots.' },
    ],
    modes: [
      Object.assign(GAMES.pool.modes[0], { label: 'vs Computer', summary: 'You play blue and break. The computer plays red.', how: '<b>Move the mouse</b> to aim. <b>Press and drag back</b> to set the power, <b>release</b> to shoot. <b>Spin:</b> click the cue ball at the bottom right, or <b>W/S</b> follow and draw, <b>A/D</b> side spin (it swerves), <b>X</b> centre. <b>← →</b> fine-tune the aim (<b>Shift</b> for bigger steps), <b>↑ ↓</b> power, <b>Space</b> shoots. After a foul you get <b>ball in hand</b>: drag the cue ball anywhere. The guide line runs the real physics, so it shows curves, portal jumps and where the cue ball goes after the hit.', hint: 'AIM WITH THE MOUSE · DRAG BACK AND RELEASE TO SHOOT' }),
      Object.assign(GAMES.pool.modes[1], { label: '2 Players', summary: 'Two people take turns on one computer. Blue breaks.', how: 'Same controls for both players: <b>move the mouse</b> to aim, <b>press and drag back</b>, <b>release</b> to shoot. Set <b>spin</b> on the cue ball at the bottom right (or <b>W A S D</b>). The screen says whose turn it is.', hint: 'TAKE TURNS · DRAG BACK AND RELEASE TO SHOOT' }),
    ],
    rules: '<b>Rules:</b> the first ball you sink after the break claims your group. Keep shooting while you sink your own balls. A <b>foul</b> (cue ball goes in, hits nothing, or hits the wrong ball first) gives the other player ball in hand. Sink the 8 only after your group is gone. <b>Spin:</b> top spin follows the object ball, back spin draws the cue ball back, side spin curves its path and throws it off cushions. <b>Getting harder:</b> the computer level sets how steady its aim is, how carefully it picks shots, whether it uses spin and plans its next shot, and (at the top) whether it hunts for swerves and gadget shots. It uses the same physics and never moves a ball.',
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
      [[w / 2 - 50, h / 2 - 90, '#2ee6d6'], [w / 2 + 40, h / 2 + 95, '#ff4fd8']].forEach(([x, y, col]) => { c.fillStyle = '#05050a'; c.beginPath(); c.arc(x, y, 12, 0, TAU); c.fill(); c.strokeStyle = col; c.lineWidth = 3; c.beginPath(); c.arc(x, y, 13, 0, TAU); c.stroke(); });
      c.fillStyle = '#f6f4ec'; c.beginPath(); c.arc(w / 2 - 80, h / 2, r, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(255,255,255,.7)'; c.setLineDash([5, 5]); c.lineWidth = 1.5; c.beginPath(); c.moveTo(w / 2 - 80, h / 2); c.lineTo(w / 2 + 28, h / 2); c.stroke(); c.setLineDash([]);
    },
  }));
})();
