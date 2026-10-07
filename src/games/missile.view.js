/* =====================================================================
   MISSILE COMMAND — VIEW + human controller
   ===================================================================== */
(() => {
  const M = MslLib, GY = M.GY;

  class MissileHuman {
    constructor(side, model) { this.side = side; this.m = model; this.q = []; this.drag = null; }
    key(code, down) {
      if (!down || this.side !== 0) return;
      const bi = { KeyA: 0, KeyS: 1, KeyD: 2 }[code];
      if (bi != null) this.q.push({ fire: { x: Input.mouse.x, y: Input.mouse.y, base: bi } });
    }
    mouse(type, x, y, btn, e, m) {
      if (this.side === 0) { if (type === 'down') this.q.push({ fire: { x, y } }); return; }
      if (type === 'down') this.drag = { x0: x, y0: y, x, y, mirv: btn === 2 || (e && e.shiftKey) };
      if (type === 'move' && this.drag) { this.drag.x = x; this.drag.y = y; }
      if (type === 'up' && this.drag) {
        const d = this.drag; this.drag = null;
        const quick = Math.hypot(d.x - d.x0, d.y - d.y0) < 12;
        this.q.push({ launch: quick ? { sx: d.x0 + rnd(-140, 140), tx: m.snap(d.x0), mirv: d.mirv } : { sx: d.x0, tx: m.snap(d.x), mirv: d.mirv } });
      }
    }
    act() { return this.q.shift() || null; }
  }

  class MissileView {
    constructor(model, o) { this.m = model; this.ctrl = o.ctrl; this.human = o.ctrls.find(c => c instanceof MissileHuman); this.parts = []; this.msg = ''; this.msgT = 0; this.banner = ''; this.bannerT = 0; }
    onEvent(e) {
      if (e.type === 'banner') { this.banner = e.text; this.bannerT = 2.2; }
      if (e.type === 'say' || e.type === 'reject') { this.msg = e.text || e.why; this.msgT = 1.4; }
      if (e.type === 'burst') for (let k = 0; k < 20; k++) this.parts.push({ x: e.x, y: e.y, vx: rnd(-120, 120), vy: rnd(-220, -40), l: rnd(0.5, 1.2) });
    }
    update(dt) {
      this.msgT -= dt; this.bannerT -= dt;
      for (const p of this.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt; p.l -= dt; }
      this.parts = this.parts.filter(p => p.l > 0);
    }
    drawStruct(ctx, s) {
      const L = P.light;
      if (s.type === 'city') {
        if (!s.alive) { ctx.fillStyle = L ? '#8a6a4a' : '#3a2410'; ctx.fillRect(s.x - 20, GY - 6, 40, 6); return; }
        ctx.fillStyle = P.cyan;
        [[-20, 12], [-13, 22], [-5, 16], [3, 26], [11, 14], [16, 19]].forEach(([dx, h]) => ctx.fillRect(s.x + dx, GY - h, 7, h));
        ctx.fillStyle = L ? '#e6f7ff' : '#07243a'; for (let k = 0; k < 6; k++) ctx.fillRect(s.x - 18 + k * 7, GY - 8, 2, 2);
      } else {
        ctx.fillStyle = s.alive ? P.amber : (L ? '#b89a78' : '#4a3010');
        ctx.beginPath(); ctx.moveTo(s.x - 34, GY); ctx.lineTo(s.x - 14, GY - 22); ctx.lineTo(s.x + 14, GY - 22); ctx.lineTo(s.x + 34, GY); ctx.fill();
        if (s.alive) text(ctx, String(s.ammo), s.x, GY - 11, { size: 9, color: L ? '#ffffff' : '#1a0f00' });
        if (this.ctrl[0] === 'human') text(ctx, 'ASD'[s.i], s.x, GY + 22, { size: 9, color: L ? 'rgba(255,255,255,.8)' : 'rgba(255,255,255,.5)' });
      }
    }
    draw(ctx) {
      const m = this.m, L = P.light, g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, L ? '#dfe9f7' : '#05030f'); g.addColorStop(1, L ? '#fbe7d3' : '#1b0b1f'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = L ? '#a8703c' : '#6b3a12'; ctx.fillRect(0, GY, W, H - GY); ctx.fillStyle = P.amber; ctx.fillRect(0, GY, W, 2);
      for (const s of m.structs) this.drawStruct(ctx, s);
      ctx.lineWidth = 2;
      for (const x of m.missiles) { ctx.strokeStyle = rgba(x.mirv ? P.pink : P.red, 0.8); ctx.beginPath(); ctx.moveTo(x.x0, x.y0); ctx.lineTo(x.x, x.y); ctx.stroke(); ctx.fillStyle = P.ink; ctx.fillRect(x.x - 2, x.y - 2, 4, 4); }
      for (const i of m.inter) {
        ctx.strokeStyle = rgba(P.cyan, 0.7); ctx.beginPath(); ctx.moveTo(i.x0, i.y0); ctx.lineTo(i.x, i.y); ctx.stroke();
        ctx.strokeStyle = P.cyan; ctx.beginPath(); ctx.moveTo(i.tx - 5, i.ty - 5); ctx.lineTo(i.tx + 5, i.ty + 5); ctx.moveTo(i.tx + 5, i.ty - 5); ctx.lineTo(i.tx - 5, i.ty + 5); ctx.stroke();
      }
      for (const e of m.exps) { ctx.fillStyle = e.ground ? `rgba(255,120,40,${Math.max(0, 0.8 - e.t)})` : `hsla(${(e.t * 900) % 360},100%,${L ? 55 : 65}%,.85)`; ctx.beginPath(); ctx.arc(e.x, e.y, e.r || 0, 0, TAU); ctx.fill(); }
      for (const p of this.parts) { ctx.fillStyle = rgba(P.orange, clamp(p.l, 0, 1)); ctx.fillRect(p.x, p.y, 3, 3); }
      const mx = Input.mouse.x, my = Input.mouse.y, h = this.human;
      if (h && h.side === 0 && Input.mouse.inside) {
        ctx.strokeStyle = P.cyan; ctx.lineWidth = 2; ctx.beginPath();
        ctx.moveTo(mx - 12, my); ctx.lineTo(mx - 4, my); ctx.moveTo(mx + 4, my); ctx.lineTo(mx + 12, my);
        ctx.moveTo(mx, my - 12); ctx.lineTo(mx, my - 4); ctx.moveTo(mx, my + 4); ctx.lineTo(mx, my + 12); ctx.stroke();
      }
      if (h && h.side === 1) {
        if (h.drag) {
          const d = h.drag, quick = Math.hypot(d.x - d.x0, d.y - d.y0) < 12;
          ctx.strokeStyle = d.mirv ? P.pink : P.red; ctx.setLineDash([5, 6]); ctx.beginPath(); ctx.moveTo(d.x0, 0); ctx.lineTo(m.snap(quick ? d.x0 : d.x), GY); ctx.stroke(); ctx.setLineDash([]);
        } else if (Input.mouse.inside) {
          ctx.strokeStyle = rgba(P.red, 0.55); ctx.beginPath(); ctx.moveTo(mx, 0); ctx.lineTo(mx, 14); ctx.stroke();
          ctx.beginPath(); ctx.arc(m.snap(mx), GY - 10, 16, 0, TAU); ctx.stroke();
        }
      }
      text(ctx, `WAVE ${m.wave}/${M.WAVES}`, 16, 22, { size: 12, color: P.ink, align: 'left' });
      text(ctx, `DEFENDER ${m.score}`, 16, 44, { size: 10, color: P.cyan, align: 'left' });
      text(ctx, `ATTACKER MISSILES ${m.left}`, W - 16, 22, { size: 10, color: P.red, align: 'right' });
      bar(ctx, W - 176, 36, 160, 8, 1 - Math.max(0, m.cool) / m.cooldown, P.red);
      if (this.bannerT > 0) text(ctx, this.banner, W / 2, 220, { size: 22, color: P.ink, glow: P.red });
      if (this.msgT > 0) text(ctx, this.msg, W / 2, 260, { size: 10, color: P.amber });
    }
  }

  Cab.register(Object.assign(GAMES.missile, {
    name: 'Missile Command', accent: 'red', View: MissileView, Human: MissileHuman,
    tagline: 'Defend six cities, or be the one raining missiles down on them.',
    about: 'Our flip: the attack is a real player. The defender must keep at least one city standing through 5 waves. The attacker aims every missile and wins by flattening all six cities.',
    sides: [
      { name: 'Defender', color: 'cyan', goal: 'Blow up incoming missiles and keep a city alive for 5 waves.', cpuHelp: 'Ranks incoming missiles by time to impact, works out an intercept point and fires from the best base.' },
      { name: 'Attacker', color: 'red', goal: 'Aim every missile and flatten all six cities.', cpuHelp: 'Picks targets, mixes in attacks on bases, and fires timed salvos and splitters when it is strong.' },
    ],
    modes: [
      Object.assign(GAMES.missile.modes[0], { label: 'Normal', summary: 'You defend the cities. The computer launches the missiles.', how: '<b>Click</b> to fire from the nearest base. <b>A / S / D</b> fire from the left / middle / right base at the pointer.', hint: 'CLICK TO FIRE AN INTERCEPTOR' }),
      Object.assign(GAMES.missile.modes[1], { label: 'Flipped', summary: 'You launch the missiles. The computer defends.', how: '<b>Click</b> above a target to launch at it. <b>Drag</b> from where a missile starts to where it lands. <b>Right-click</b> or <b>Shift</b> for a splitter (wave 3+, costs 3).', hint: 'CLICK OR DRAG TO LAUNCH A MISSILE' }),
    ],
    rules: '<b>Fair rules:</b> the attacker has a missile budget and a reload timer each wave (a weaker computer attacker uses less of it); the defender gets 10 shots per base per wave. Bases are rebuilt every wave, and each wave you survive rebuilds one lost city. Missiles get faster and reload quicker each wave.',
    thumb(c, w, h) {
      const L = P.light, g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, L ? '#dfe9f7' : '#05030f'); g.addColorStop(1, L ? '#fbe7d3' : '#1b0b1f'); c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.fillStyle = L ? '#a8703c' : '#6b3a12'; c.fillRect(0, 270, w, 30);
      c.fillStyle = P.cyan; [60, 120, 270, 330].forEach(x => { c.fillRect(x, 255, 7, 15); c.fillRect(x + 8, 248, 7, 22); c.fillRect(x + 16, 258, 7, 12); });
      c.fillStyle = P.amber; [20, 190, 370].forEach(x => { c.beginPath(); c.moveTo(x - 18, 270); c.lineTo(x - 8, 258); c.lineTo(x + 8, 258); c.lineTo(x + 18, 270); c.fill(); });
      c.strokeStyle = rgba(P.red, 0.8); c.lineWidth = 2; [[40, 0, 140, 190], [300, 0, 250, 150], [200, 0, 90, 120]].forEach(([a, b, d, e]) => { c.beginPath(); c.moveTo(a, b); c.lineTo(d, e); c.stroke(); });
      c.fillStyle = `hsla(300,100%,${L ? 55 : 65}%,.85)`; c.beginPath(); c.arc(250, 150, 26, 0, TAU); c.fill();
      c.strokeStyle = rgba(P.cyan, 0.7); c.beginPath(); c.moveTo(190, 258); c.lineTo(245, 158); c.stroke();
    },
  }));
})();
