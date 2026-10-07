/* =====================================================================
   BATTLESHIP — VIEW + human controller (placement and firing)
   ===================================================================== */
(() => {
  const N = BsLib.N, CS = 32, BOARD = [{ x: 48, y: 118 }, { x: 432, y: 118 }], FLEET = BsLib.FLEET, SIDE = ['BLUE', 'RED'];
  const cellAt = (b, x, y) => { const o = BOARD[b], cx = Math.floor((x - o.x) / CS), cy = Math.floor((y - o.y) / CS); return cx >= 0 && cy >= 0 && cx < N && cy < N ? { x: cx, y: cy } : null; };
  const BTNS = [{ id: 'rot', x: 432, y: 150, w: 150, h: 36, t: 'ROTATE (R)' }, { id: 'rand', x: 592, y: 150, w: 150, h: 36, t: 'RANDOM' }, { id: 'clear', x: 432, y: 196, w: 150, h: 36, t: 'CLEAR' }, { id: 'ready', x: 592, y: 196, w: 150, h: 36, t: 'READY' }];
  // the side whose fleet is being placed right now (people place one after the other)
  const placingSide = (m, ctrl) => (m.phase !== 'place' ? null : [0, 1].find(s => ctrl[s] === 'human' && !m.fleets[s]));

  class BattleshipHuman {
    constructor(side, model, ctrl) { this.side = side; this.m = model; this.ctrl = ctrl; this.ships = []; this.hor = true; this.q = []; this.rng = makeRng((Math.random() * 4294967296) >>> 0); this.ui = { curtain: null }; }
    myPlacement(m) { return placingSide(m, this.ctrl) === this.side; }
    key(code, down, m) { if (down && code === 'KeyR' && this.myPlacement(m)) this.hor = !this.hor; }
    mouse(type, x, y, btn, e, m) {
      if (type !== 'down' || e.__used) return;
      if (this.ui.curtain) { this.ui.curtain = null; e.__used = true; Sound.beep(500, 0.05); return; }
      if (this.myPlacement(m)) {
        e.__used = true;
        if (btn === 2) { this.hor = !this.hor; return; }
        for (const b of BTNS) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
          if (b.id === 'rot') this.hor = !this.hor;
          if (b.id === 'rand') this.ships = BsLib.randomFleet(this.rng, true);
          if (b.id === 'clear') this.ships = [];
          if (b.id === 'ready' && this.ships.length === FLEET.length) this.q.push({ fleet: this.ships });
          Sound.beep(600, 0.04); return;
        }
        const c = cellAt(0, x, y);
        if (c && this.ships.length < FLEET.length) {
          const len = FLEET[this.ships.length];
          if (BsLib.canPlace(this.ships, c.x, c.y, len, this.hor, false)) { this.ships.push(BsLib.mkShip(c.x, c.y, len, this.hor)); Sound.beep(400, 0.05); }
          else Sound.beep(150, 0.08, 'sawtooth');
        }
        return;
      }
      if (m.phase === 'battle' && m.turn === this.side && m.wait <= 0) {
        const c = cellAt(1, x, y);
        if (c && m.shots[this.side][c.y][c.x] === 0) { e.__used = true; this.q.push({ fire: c }); }
      }
    }
    act() { return this.q.shift() || null; }
  }

  class BattleshipView {
    constructor(model, o) {
      this.m = model; this.ctrl = o.ctrl; this.humans = o.ctrls.filter(c => c instanceof BattleshipHuman); this.k = o.ctrls.find(c => c.k != null)?.k || 0;
      this.ui = { curtain: null }; for (const h of this.humans) h.ui = this.ui;
      this.two = this.humans.length === 2; this.log = []; this.fx = [];
      if (this.two) this.ui.curtain = { side: 0, msg: 'Place your fleet' };
    }
    say(t) { this.log.unshift(t); this.log = this.log.slice(0, 3); }
    onEvent(e) {
      const m = this.m;
      if (e.type === 'placed' && this.two && !m.fleets[1] && e.side === 0) this.ui.curtain = { side: 1, msg: 'Place your fleet' };
      if (e.type === 'battle') { this.say('BLUE fires first.'); if (this.two) this.ui.curtain = { side: 0, msg: 'Battle stations!' }; }
      if (e.type === 'turn' && this.two) this.ui.curtain = { side: e.side, msg: 'Your turn to fire' };
      if (e.type === 'shot') {
        const who = this.two ? `${SIDE[e.side]} fires` : this.ctrl[e.side] === 'human' ? 'You fire' : 'Computer fires';
        this.say(`${who} at ${BsLib.cellName(e.x, e.y)} — ${e.outcome === 'miss' ? 'miss.' : e.outcome === 'hit' ? 'HIT!' : `sank the ${e.ship}!`}`);
        this.fx.push({ s: e.side, x: e.x, y: e.y, t: 0, hit: e.outcome !== 'miss' });
      }
    }
    update(dt) { for (const f of this.fx) f.t += dt; this.fx = this.fx.filter(f => f.t < 0.8); }
    viewer() { const m = this.m; if (!this.two) return this.ctrl[0] === 'human' ? 0 : 1; return m.phase === 'place' ? placingSide(m, this.ctrl) : m.turn; }
    drawBoard(ctx, b, fleet, shots, reveal, label, color, hover) {
      const o = BOARD[b], L = P.light;
      text(ctx, label, o.x + N * CS / 2, o.y - 34, { size: 11, color });
      for (let i = 0; i < N; i++) { text(ctx, 'ABCDEFGHIJ'[i], o.x + i * CS + CS / 2, o.y - 12, { size: 8, color: P.dim }); text(ctx, String(i + 1), o.x - 14, o.y + i * CS + CS / 2, { size: 8, color: P.dim }); }
      ctx.fillStyle = L ? '#d8ecf7' : '#071a2e'; ctx.fillRect(o.x, o.y, N * CS, N * CS);
      ctx.strokeStyle = L ? 'rgba(10,134,176,.22)' : 'rgba(53,224,255,.14)'; ctx.lineWidth = 1;
      for (let i = 0; i <= N; i++) { ctx.beginPath(); ctx.moveTo(o.x + i * CS, o.y); ctx.lineTo(o.x + i * CS, o.y + N * CS); ctx.stroke(); ctx.beginPath(); ctx.moveTo(o.x, o.y + i * CS); ctx.lineTo(o.x + N * CS, o.y + i * CS); ctx.stroke(); }
      if (fleet) for (const sh of fleet) if (reveal || sh.sunk) {
        const w = sh.hor ? sh.len : 1, h = sh.hor ? 1 : sh.len;
        ctx.fillStyle = sh.sunk ? rgba(P.red, 0.3) : (L ? '#7d8aa6' : '#5b6b8c'); ctx.strokeStyle = sh.sunk ? P.red : (L ? '#4a5570' : '#9fb0d6'); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(o.x + sh.x * CS + 4, o.y + sh.y * CS + 4, w * CS - 8, h * CS - 8, 10); ctx.fill(); ctx.stroke();
      }
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const v = shots[y][x], px = o.x + x * CS + CS / 2, py = o.y + y * CS + CS / 2;
        if (v === 1) { ctx.fillStyle = L ? 'rgba(27,29,46,.45)' : 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.arc(px, py, 4, 0, TAU); ctx.fill(); }
        if (v >= 2) { ctx.strokeStyle = P.red; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(px - 8, py - 8); ctx.lineTo(px + 8, py + 8); ctx.moveTo(px + 8, py - 8); ctx.lineTo(px - 8, py + 8); ctx.stroke(); }
      }
      if (hover) { ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.strokeRect(o.x + hover.x * CS + 2, o.y + hover.y * CS + 2, CS - 4, CS - 4); }
    }
    draw(ctx) {
      const m = this.m, L = P.light, sc = i => (i ? P.red : P.cyan), mo = Input.mouse;
      ctx.fillStyle = L ? '#f2f6f9' : '#040b16'; ctx.fillRect(0, 0, W, H);
      text(ctx, this.two ? 'TWO PLAYERS · PASS THE DEVICE BETWEEN TURNS' : `COMPUTER RANK: ${BS_RANKS[bsRank(this.k) - 1].toUpperCase()}`, W / 2, 26, { size: 9, color: P.dim });
      const ps = placingSide(m, this.ctrl);
      if (ps != null) {
        const h = this.humans.find(c => c.side === ps);
        this.drawBoard(ctx, 0, h.ships, BsLib.grid(), true, `${SIDE[ps]}: PLACE YOUR FLEET`, sc(ps));
        const c = mo.inside ? cellAt(0, mo.x, mo.y) : null;
        if (c && h.ships.length < FLEET.length) {
          const len = FLEET[h.ships.length], ok = BsLib.canPlace(h.ships, c.x, c.y, len, h.hor, false), o = BOARD[0];
          ctx.fillStyle = ok ? rgba(P.cyan, 0.35) : rgba(P.red, 0.3);
          for (let k = 0; k < len; k++) { const cx = c.x + (h.hor ? k : 0), cy = c.y + (h.hor ? 0 : k); if (cx < N && cy < N) ctx.fillRect(o.x + cx * CS + 3, o.y + cy * CS + 3, CS - 6, CS - 6); }
        }
        text(ctx, h.ships.length < FLEET.length ? `Next: ${BsLib.NAMES[FLEET[h.ships.length]]} (${FLEET[h.ships.length]})` : 'Fleet ready!', 587, 118, { size: 10, color: P.ink });
        for (const b of BTNS) {
          const on = b.id === 'ready' && h.ships.length === FLEET.length;
          ctx.fillStyle = b.id === 'ready' ? (on ? sc(ps) : P.faint) : (L ? '#dfe8ef' : '#13233d');
          ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 8); ctx.fill();
          text(ctx, b.t, b.x + b.w / 2, b.y + b.h / 2 + 1, { size: 9, color: on ? P.onAccent : P.ink });
        }
        text(ctx, 'Click to place · R or right-click to rotate', 587, 262, { size: 8, color: P.dim });
      } else if (m.phase !== 'place') {
        const own = this.viewer(), opp = 1 - own;
        let hover = null;
        if (m.phase === 'battle' && m.turn === own && this.ctrl[own] === 'human' && mo.inside) { const c = cellAt(1, mo.x, mo.y); if (c && m.shots[own][c.y][c.x] === 0) hover = c; }
        this.drawBoard(ctx, 0, m.fleets[own], m.shots[opp], true, this.two ? `${SIDE[own]}: YOUR WATERS` : 'YOUR WATERS', sc(own));
        this.drawBoard(ctx, 1, m.fleets[opp], m.shots[own], m.phase === 'done', 'ENEMY WATERS', sc(opp), hover);
        for (const f of this.fx) {
          const o = BOARD[f.s === own ? 1 : 0];
          ctx.strokeStyle = f.hit ? `rgba(255,120,60,${1 - f.t})` : rgba(L ? '#0a86b0' : '#b4dcff', 1 - f.t); ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(o.x + f.x * CS + CS / 2, o.y + f.y * CS + CS / 2, 6 + f.t * 30, 0, TAU); ctx.stroke();
        }
        if (m.phase === 'battle') {
          const t = m.turn, mine = t === own && this.ctrl[own] === 'human';
          text(ctx, mine ? 'YOUR SHOT — CLICK ENEMY WATERS' : `${this.ctrl[t] === 'cpu' ? 'COMPUTER' : SIDE[t]} IS AIMING…`, W / 2, 470, { size: 11, color: sc(t) });
        }
        [0, 1].forEach(s => { const o = BOARD[s === own ? 0 : 1], fl = m.fleets[s]; if (fl) fl.forEach((sh, i) => { ctx.fillStyle = sh.sunk ? rgba(P.red, 0.4) : sc(s); ctx.fillRect(o.x + i * 64, o.y + N * CS + 10, sh.len * 11, 6); }); });
      } else text(ctx, 'Computer is placing its fleet…', W / 2, 300, { size: 11 });
      this.log.forEach((l, i) => text(ctx, l, W / 2, 510 + i * 22, { size: 9, color: i ? P.dim : P.ink }));
      if (this.ui.curtain) {
        const c = this.ui.curtain;
        ctx.fillStyle = L ? '#f2f6f9' : '#040b16'; ctx.fillRect(0, 0, W, H);
        text(ctx, `PASS TO ${SIDE[c.side]}`, W / 2, 250, { size: 24, color: sc(c.side), glow: sc(c.side) });
        text(ctx, c.msg, W / 2, 300, { size: 12 });
        text(ctx, 'No peeking! Click when ready.', W / 2, 340, { size: 9, color: P.dim });
      }
    }
  }

  Cab.register(Object.assign(GAMES.battleship, {
    name: 'Battleship', accent: 'blue', View: BattleshipView, Human: BattleshipHuman, endDelay: 0.9,
    resultText(m, ctrl) {
      const s = m.result.winner, two = ctrl.every(c => c === 'human');
      return { title: two ? `${SIDE[s]} FLEET WINS!` : ctrl[s] === 'human' ? 'VICTORY!' : 'YOUR FLEET IS SUNK', detail: `${two ? SIDE[s] : ctrl[s] === 'human' ? 'You' : 'The computer'} sank every enemy ship in ${m.count[s]} shots.` };
    },
    tagline: 'Hide your fleet and hunt theirs, against the computer or a friend.',
    about: 'Our 7th game. Each admiral hides five ships on a 10×10 grid, then you take turns firing. The first to sink the whole enemy fleet wins.',
    sides: [
      { name: 'Blue admiral', color: 'cyan', goal: 'Hide your fleet, fire first, and sink every enemy ship.', cpuHelp: '' },
      { name: 'Red admiral', color: 'red', goal: 'Hide your fleet and sink every enemy ship first.', cpuHelp: 'Places its fleet and hunts yours using only hit, miss and sunk. Its rank follows the computer level.' },
    ],
    modes: [
      Object.assign(GAMES.battleship.modes[0], { label: 'vs Computer', summary: 'You command the blue fleet against the computer.', how: '<b>Click</b> to place each ship (<b>R</b> or right-click rotates, or press <b>Random</b>), then <b>click</b> enemy waters to fire.', hint: 'PLACE YOUR SHIPS, THEN CLICK TO FIRE' }),
      Object.assign(GAMES.battleship.modes[1], { label: '2 Players', summary: 'Two people on one device. A screen hides each fleet while you pass it over.', how: '<b>Click</b> to place each ship (<b>R</b> rotates), then take turns clicking enemy waters. Hand over the device when the "Pass to" screen appears.', hint: 'TAKE TURNS · PASS THE DEVICE WHEN ASKED' }),
    ],
    rules: '<b>Getting harder:</b> the computer level sets the admiral\'s rank. A Recruit mostly fires blind; an Ensign follows lines of hits; a Lieutenant searches on a checkerboard; from Captain up it weighs every place a ship could still be hiding. It never sees your fleet.',
    thumb(c, w, h) {
      const L = P.light;
      c.fillStyle = L ? '#d8ecf7' : '#071a2e'; c.fillRect(0, 0, w, h);
      c.strokeStyle = L ? 'rgba(10,134,176,.25)' : 'rgba(53,224,255,.18)'; for (let i = 0; i <= 12; i++) { c.beginPath(); c.moveTo(i * 34, 0); c.lineTo(i * 34, h); c.stroke(); c.beginPath(); c.moveTo(0, i * 34); c.lineTo(w, i * 34); c.stroke(); }
      c.fillStyle = L ? '#7d8aa6' : '#5b6b8c'; c.strokeStyle = L ? '#4a5570' : '#9fb0d6'; c.lineWidth = 2;
      [[40, 44, 164, 26], [250, 110, 26, 130], [70, 180, 96, 26]].forEach(([x, y, a, b]) => { c.beginPath(); c.roundRect(x, y, a, b, 9); c.fill(); c.stroke(); });
      c.strokeStyle = P.red; c.lineWidth = 3; [[120, 57], [263, 160], [330, 60]].forEach(([x, y]) => { c.beginPath(); c.moveTo(x - 8, y - 8); c.lineTo(x + 8, y + 8); c.moveTo(x + 8, y - 8); c.lineTo(x - 8, y + 8); c.stroke(); });
      c.fillStyle = L ? 'rgba(27,29,46,.45)' : 'rgba(255,255,255,.6)'; [[200, 230], [340, 240], [30, 120]].forEach(([x, y]) => { c.beginPath(); c.arc(x, y, 4, 0, TAU); c.fill(); });
    },
  }));
})();
