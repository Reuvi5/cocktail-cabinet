/* =====================================================================
   Cocktail Cabinet — the page: VIEW helpers, sound, input and the
   framework that runs each game as Model + Controllers + View.
   (Game rules and AI live in engine.js and games/*.model.js / *.ai.js.)
   ===================================================================== */
const STEP = DT;
// view-only randomness (particles, sparkle): not part of any game's rules
const rnd = (a, b) => a + Math.random() * (b - a);
const rndi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const FONT = '"Press Start 2P", ui-monospace, monospace';

/* ---------- theme palettes shared by every game screen ---------- */
const PALETTES = {
  dark: {
    light: false, glow: 1,
    bg: '#05060d', bg2: '#0b0d1a', ink: '#ffffff', ink2: '#cfd3ff', dim: '#9aa0d0', faint: 'rgba(255,255,255,.08)', grid: 'rgba(255,255,255,.05)',
    overlay: 'rgba(3,4,10,.74)', panel: 'rgba(8,9,20,.92)', panelLine: 'rgba(255,255,255,.14)', onAccent: '#07080f',
    cyan: '#35e0ff', pink: '#ff4fa3', lime: '#b6ff3b', amber: '#ffb627', violet: '#a78bff', red: '#ff5b5b', blue: '#5b8cff', yellow: '#ffd23f', orange: '#ff7a1a', green: '#4ade80',
  },
  light: {
    light: true, glow: 0.3,
    bg: '#f7f4ed', bg2: '#ece6d9', ink: '#1b1d2e', ink2: '#34374f', dim: '#6a6d82', faint: 'rgba(20,22,40,.08)', grid: 'rgba(20,22,40,.07)',
    overlay: 'rgba(247,244,237,.8)', panel: 'rgba(255,255,255,.96)', panelLine: 'rgba(20,22,40,.16)', onAccent: '#ffffff',
    cyan: '#0a86b0', pink: '#cc1a6d', lime: '#3b8a0e', amber: '#b86400', violet: '#6a48d6', red: '#cf2a2a', blue: '#2d5bdc', yellow: '#c99400', orange: '#d9570a', green: '#15803d',
  },
};
let P = PALETTES.dark;
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
const glow = (ctx, color, blur = 14) => { ctx.shadowColor = color; ctx.shadowBlur = blur * P.glow; };

function text(ctx, s, x, y, o = {}) {
  ctx.save();
  ctx.font = `${o.size || 14}px ${FONT}`;
  ctx.fillStyle = o.color || P.ink;
  ctx.textAlign = o.align || 'center';
  ctx.textBaseline = o.base || 'middle';
  if (o.glow) glow(ctx, o.glow, o.blur || 14);
  ctx.fillText(s, x, y);
  ctx.restore();
}
function panelBox(ctx, x, y, w, h, fill = P.panel, stroke = P.panelLine) {
  ctx.save(); ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 12); ctx.fill(); ctx.stroke(); ctx.restore();
}
function bar(ctx, x, y, w, h, frac, color, bg = P.faint) {
  ctx.fillStyle = bg; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color; ctx.fillRect(x, y, w * clamp(frac, 0, 1), h);
}

/* ---------- sound ---------- */
const Sound = {
  ctx: null, on: true,
  _c() { if (!this.ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) this.ctx = new AC(); } return this.ctx; },
  beep(f = 440, d = 0.08, type = 'square', v = 0.04, slide = 0) {
    if (!this.on) return;
    try {
      const c = this._c(); if (!c) return;
      const o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
      o.type = type; o.frequency.setValueAtTime(f, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(c.destination); o.start(t); o.stop(t + d + 0.02);
    } catch (e) { /* audio optional */ }
  },
  boom(d = 0.3, v = 0.08) {
    if (!this.on) return;
    try {
      const c = this._c(); if (!c) return;
      const n = Math.floor(c.sampleRate * d), buf = c.createBuffer(1, n, c.sampleRate), data = buf.getChannelData(0);
      for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
      const s = c.createBufferSource(), g = c.createGain(); g.gain.value = v;
      s.buffer = buf; s.connect(g).connect(c.destination); s.start();
    } catch (e) { }
  }
};

/* ---------- input ---------- */
const Input = { keys: new Set(), mouse: { x: W / 2, y: H / 2, down: false, inside: false } };
const held = (...codes) => codes.some(c => Input.keys.has(c));

/* =====================================================================
   Cabinet controller. Every game has exactly two modes; a mode fixes
   which side the human plays and which side the computer plays.
   ===================================================================== */
const Cab = {
  games: [], byId: {}, g: null, inst: null, mode: 0, ctrl: ['human', 'cpu'], state: 'menu',
  paused: false, acc: 0, last: 0, stores: {}, result: null, overAt: 0, cv: null, ctx: null, dpr: 1, thumbs: [],

  register(g) { this.games.push(g); this.byId[g.id] = g; },
  col(key) { return P[key] || key; },

  init() {
    P = PALETTES[document.documentElement.dataset.theme] || PALETTES.dark;
    this.cv = document.getElementById('cv');
    this.ctx = this.cv.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.buildMenu();
    this.bindInput();
    document.getElementById('backBtn').onclick = () => { location.hash = ''; };
    const sb = document.getElementById('soundBtn');
    sb.onclick = () => { Sound.on = !Sound.on; sb.textContent = 'Sound: ' + (Sound.on ? 'on' : 'off'); };
    document.getElementById('themeBtn').onclick = () => this.setTheme(P.light ? 'dark' : 'light');
    this.syncThemeBtn();
    window.addEventListener('hashchange', () => this.route());
    this.route();
    requestAnimationFrame(t => this.loop(t));
  },

  setTheme(t) {
    document.documentElement.dataset.theme = t; P = PALETTES[t];
    try { localStorage.setItem('cab-theme', t); } catch (e) { }
    this.syncThemeBtn(); this.drawThumbs(); if (location.hash === '#lab') Lab.render();
    if (this.g) { document.getElementById('view').style.setProperty('--c', this.col(this.g.accent)); this.renderPanel(); }
  },
  syncThemeBtn() {
    const b = document.getElementById('themeBtn');
    b.textContent = P.light ? '☾ Dark' : '☀ Light';
    b.setAttribute('aria-label', 'Switch to ' + (P.light ? 'dark' : 'light') + ' theme');
  },

  resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cv.width = W * this.dpr; this.cv.height = H * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  },

  buildMenu() {
    const grid = document.getElementById('grid');
    this.games.forEach((g, i) => {
      const b = document.createElement('button');
      b.className = 'card'; b.type = 'button';
      b.innerHTML = `<canvas width="400" height="300"></canvas><div class="meta"><div class="num">0${i + 1}</div><h3>${g.name}</h3><p>${g.tagline}</p>
        <div class="modes">${g.modes.map(m => `<span>${m.label}</span>`).join('')}</div></div>`;
      b.onclick = () => { location.hash = g.id; };
      grid.appendChild(b);
      this.thumbs.push({ g, el: b, c: b.querySelector('canvas').getContext('2d') });
    });
    this.drawThumbs();
  },
  drawThumbs() {
    for (const { g, el, c } of this.thumbs) {
      el.style.setProperty('--c', this.col(g.accent));
      c.save(); c.fillStyle = P.bg; c.fillRect(0, 0, 400, 300);
      try { g.thumb(c, 400, 300); } catch (e) { console.error(e); }
      c.restore();
    }
  },

  route() {
    const id = location.hash.replace('#', '');
    document.getElementById('lab').hidden = id !== 'lab';
    if (id === 'lab') { this.close(); document.getElementById('menu').hidden = true; document.title = 'Balance Lab — Cocktail Cabinet'; Lab.open(); window.scrollTo(0, 0); return; }
    if (this.byId[id]) this.open(id); else this.close();
  },

  open(id) {
    this.teardown();
    const g = this.g = this.byId[id];
    this.mode = this.store().mode || 0;
    this.ctrl = g.modes[this.mode].ctrl.slice();
    document.getElementById('menu').hidden = true;
    document.getElementById('view').hidden = false;
    document.getElementById('view').style.setProperty('--c', this.col(g.accent));
    document.getElementById('gTitle').textContent = g.name;
    document.title = g.name + ' — Cocktail Cabinet';
    this.cv.hidden = !!g.dom;
    document.getElementById('domStage').hidden = !g.dom;
    this.renderPanel();
    this.newRound();
    window.scrollTo(0, 0);
  },

  close() {
    this.teardown();
    this.g = null; this.state = 'menu';
    document.getElementById('menu').hidden = false;
    document.getElementById('view').hidden = true;
    document.title = 'Cocktail Cabinet — Seven Arcade Games';
  },

  teardown() {
    if (this.inst && this.inst.destroy) { try { this.inst.destroy(); } catch (e) { console.error(e); } }
    this.inst = null;
    document.getElementById('domStage').innerHTML = '';
  },

  store() { const id = this.g.id; return (this.stores[id] = this.stores[id] || {}); },

  /* ---------- computer level: 1 (gentle) to 10 (sharp), per game and mode ----------
     It rises one step when you win and drops one step when you lose, so every
     player settles where the games are close. Saved in this browser. */
  levels: (() => { try { return JSON.parse(localStorage.getItem('cab-levels') || '{}'); } catch (e) { return {}; } })(),
  levelKey() { return this.g.id + ':' + this.mode; },
  hasCpu() { return this.g.modes[this.mode].ctrl.includes('cpu'); },
  level() { return clamp(this.levels[this.levelKey()] || 1, 1, 10); },
  setLevel(n) {
    this.levels[this.levelKey()] = clamp(n, 1, 10);
    try { localStorage.setItem('cab-levels', JSON.stringify(this.levels)); } catch (e) { }
  },
  // called when a round with the computer ends; returns a line for the results screen
  adjust(humanWon) {
    if (!this.hasCpu()) return '';
    const old = this.level(), nw = clamp(old + (humanWon ? 1 : -1), 1, 10);
    this.setLevel(nw);
    if (nw === old) return humanWon ? 'COMPUTER IS AT ITS TOUGHEST (LEVEL 10)' : 'COMPUTER IS AT ITS GENTLEST (LEVEL 1)';
    return humanWon ? `COMPUTER LEVEL UP: ${old} → ${nw}` : `COMPUTER EASES OFF: ${old} → ${nw}`;
  },

  setMode(i) {
    this.mode = i; this.store().mode = i;
    this.ctrl = this.g.modes[i].ctrl.slice();
    this.renderPanel(); this.newRound();
  },

  newRound() {
    this.teardown();
    this.result = null; this.paused = false; this.acc = 0; this.endT = null;
    const self = this, g = this.g, lvl = this.level(), k = strengthFor(g.id, this.mode, lvl);
    this.k = k;
    if (g.dom) {   // Imitation draws with HTML instead of a canvas
      this.state = 'play';
      this.inst = g.createDom({
        mode: this.mode, ctrl: this.ctrl.slice(), level: lvl, k, store: this.store(), stage: document.getElementById('domStage'),
        report(humanWon) { const m = self.adjust(humanWon); self.renderPanel(); return m; },
      });
      return;
    }
    // MODEL: the rules. CONTROLLERS: one per side. VIEW: draws the model.
    const rng = makeRng((Math.random() * 4294967296) >>> 0);
    const sides = this.ctrl.map(c => (c === 'cpu' ? { kind: 'computer', k } : { kind: 'human', k: 0 }));
    const model = new g.Model({ mode: this.mode, sides, rng: rng.fork() });
    const ctrls = this.ctrl.map((c, i) => (c === 'cpu' ? new g.Computer(i, k, rng.fork()) : new g.Human(i, model, this.ctrl)));
    const view = new g.View(model, { ctrl: this.ctrl.slice(), ctrls, level: lvl });
    this.inst = { model, ctrls, view };
    this.state = 'ready';
    this.drain();
  },

  // hand the model's events to the view and the speakers
  drain() {
    const { model, view } = this.inst;
    for (const e of model.events) {
      if (e.type === 'sfx') Sound.beep(e.f, e.d, e.w, e.v, e.sl);
      else if (e.type === 'boom') Sound.boom(e.d, e.v);
      if (view.onEvent) view.onEvent(e);
    }
    model.events.length = 0;
  },

  // one fixed tick of the game: every controller acts, then the model steps
  tick() {
    const { model, ctrls } = this.inst;
    const acts = ctrls.map(c => c.act(model, STEP));
    model.step(STEP, acts);
    this.drain();
    if (model.result && this.endT == null) this.endT = this.g.endDelay || 0;
  },

  finish() {
    const g = this.g, model = this.inst.model, r = Object.assign({}, model.result);
    if (g.resultText) Object.assign(r, g.resultText(model, this.ctrl));
    if (r.winner != null && this.ctrl.filter(c => c === 'human').length === 1) r.levelMsg = this.adjust(this.ctrl[r.winner] === 'human');
    this.result = r; this.state = 'over'; this.overAt = performance.now();
    this.renderPanel();
  },

  begin() { if (this.state === 'ready') { this.state = 'play'; Sound.beep(660, 0.08); Sound.beep(990, 0.1); } },

  roleTag(i) { return this.ctrl[i] === 'cpu' ? (this.g.opponentTag || 'COMPUTER') : this.ctrl.every(c => c === 'human') ? 'PLAYER ' + (i + 1) : 'YOU'; },

  renderPanel() {
    const g = this.g, p = document.getElementById('panel'), m = g.modes[this.mode];
    let html = `<h4>ABOUT</h4><p class="desc">${g.about}</p>
      <h4>MODE</h4>
      <div class="seg modes" role="group" aria-label="Game mode">${g.modes.map((mm, i) =>
        `<button type="button" data-mode="${i}" class="${i === this.mode ? 'on' : ''}">${mm.label}</button>`).join('')}</div>
      <p class="modeline">${m.summary}</p>
      <div class="roles">`;
    g.sides.forEach((s, i) => {
      const cpu = this.ctrl[i] === 'cpu';
      html += `<div class="role ${cpu ? 'cpu' : 'you'}" style="--sc:${this.col(s.color)}">
        <span class="tag">${this.roleTag(i)}</span>
        <div><b>${s.name}</b><p>${cpu ? s.cpuHelp : s.goal}</p></div></div>`;
    });
    html += `</div>`;
    if (this.hasCpu()) {
      const lv = this.level();
      html += `<h4>COMPUTER LEVEL</h4>
      <div class="lvl"><button type="button" class="btn sq" id="lvDown" aria-label="Easier" ${lv <= 1 ? 'disabled' : ''}>−</button>
        <div class="meter" aria-label="Computer level ${lv} of 10">${Array.from({ length: 10 }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div>
        <b>${lv}</b><button type="button" class="btn sq" id="lvUp" aria-label="Harder" ${lv >= 10 ? 'disabled' : ''}>+</button></div>
      <p class="lvlnote">Goes up one when you win, down one when you lose. Each level is calibrated by Monte Carlo simulation: an average player wins about ${Math.round(TARGET(lv) * 100)}% of games here. <a href="#lab">Balance Lab →</a></p>`;
    }
    html += `<h4>CONTROLS</h4><p class="how">${m.how}</p>
      <div class="btns">
        <button type="button" class="btn primary" id="bRestart">New game</button>
        ${g.dom ? '' : '<button type="button" class="btn" id="bPause">Pause (P)</button>'}
        ${g.panelExtra ? g.panelExtra(this.store()) : ''}
      </div>
      <div class="rules">${g.rules}</div>`;
    p.innerHTML = html;
    p.querySelectorAll('.seg.modes button').forEach(b => b.onclick = () => { b.blur(); if (+b.dataset.mode !== this.mode) this.setMode(+b.dataset.mode); });
    const r = p.querySelector('#bRestart'); if (r) r.onclick = () => { this.newRound(); r.blur(); };
    const pa = p.querySelector('#bPause'); if (pa) pa.onclick = () => { this.togglePause(); pa.blur(); };
    const lvStep = d => { this.setLevel(this.level() + d); this.renderPanel(); this.newRound(); };
    const ld = p.querySelector('#lvDown'); if (ld) ld.onclick = () => lvStep(-1);
    const lu = p.querySelector('#lvUp'); if (lu) lu.onclick = () => lvStep(1);
    if (g.bindPanel) g.bindPanel(p, this);
  },

  togglePause() { if (this.state === 'play') this.paused = !this.paused; },

  toCanvas(e) {
    const r = this.cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
  },

  bindInput() {
    const cv = this.cv;
    const active = () => this.g && !this.g.dom && this.inst;
    const humans = () => (this.inst && this.inst.ctrls ? this.inst.ctrls.filter(c => c.key || c.mouse || c.wheel) : []);
    window.addEventListener('keydown', e => {
      if (!this.g || this.g.dom) return;
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (e.repeat && Input.keys.has(e.code)) return;
      Input.keys.add(e.code);
      if (e.code === 'KeyP' || e.code === 'Escape') { this.togglePause(); return; }
      if (e.code === 'Enter') {
        if (this.state === 'ready') { this.begin(); return; }
        if (this.state === 'over' && performance.now() - this.overAt > 700) { this.newRound(); this.begin(); return; }
      }
      if (this.state === 'play' && !this.paused) for (const c of humans()) if (c.key) c.key(e.code, true, this.inst.model);
    });
    window.addEventListener('keyup', e => {
      Input.keys.delete(e.code);
      if (active() && this.state === 'play') for (const c of humans()) if (c.key) c.key(e.code, false, this.inst.model);
    });
    window.addEventListener('blur', () => Input.keys.clear());
    const mouse = (type, e) => {
      if (!active()) return;
      const p = this.toCanvas(e);
      Input.mouse.x = p.x; Input.mouse.y = p.y;
      if (type === 'down') {
        Input.mouse.down = true;
        if (this.state === 'ready') { this.begin(); return; }
        if (this.state === 'over') { if (performance.now() - this.overAt > 700) { this.newRound(); this.begin(); } return; }
        if (this.paused) { this.paused = false; return; }
      }
      if (type === 'up') Input.mouse.down = false;
      if (this.state === 'play' && !this.paused) for (const c of humans()) if (c.mouse) c.mouse(type, p.x, p.y, e.button || 0, e, this.inst.model);
    };
    // keep keyboard focus off panel buttons, so Space never presses one by accident
    const unfocus = () => { const a = document.activeElement; if (a && a !== document.body && a.blur) a.blur(); };
    cv.addEventListener('mousedown', e => { e.preventDefault(); unfocus(); mouse('down', e); });
    window.addEventListener('mousemove', e => { if (e.target === cv || Input.mouse.down) mouse('move', e); });
    window.addEventListener('mouseup', e => { if (Input.mouse.down) mouse('up', e); });
    cv.addEventListener('mouseenter', () => Input.mouse.inside = true);
    cv.addEventListener('mouseleave', () => Input.mouse.inside = false);
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('wheel', e => { const hs = humans().filter(c => c.wheel); if (active() && hs.length && this.state === 'play') { e.preventDefault(); for (const c of hs) c.wheel(Math.sign(e.deltaY)); } }, { passive: false });
    const touch = (type, e) => { const t = e.changedTouches[0]; if (!t) return; e.preventDefault(); Input.mouse.inside = true; mouse(type, { clientX: t.clientX, clientY: t.clientY, button: 0 }); };
    cv.addEventListener('touchstart', e => touch('down', e), { passive: false });
    cv.addEventListener('touchmove', e => touch('move', e), { passive: false });
    cv.addEventListener('touchend', e => touch('up', e), { passive: false });
  },

  loop(t) {
    requestAnimationFrame(tt => this.loop(tt));
    const dt = Math.min(0.1, (t - (this.last || t)) / 1000); this.last = t;
    const inst = this.inst;
    if (!inst || this.g.dom) return;
    if (this.state === 'play' && !this.paused) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= STEP && n < 8) {
        this.acc -= STEP; n++;
        if (this.endT != null) { this.endT -= STEP; if (this.endT <= 0) { this.finish(); break; } continue; }
        this.tick();
      }
      if (n >= 8) this.acc = 0;
    }
    if (inst.view.update) inst.view.update(this.paused ? 0 : dt);
    const ctx = this.ctx;
    ctx.clearRect(0, 0, W, H);
    ctx.save(); inst.view.draw(ctx); ctx.restore();
    if (this.state === 'ready') this.drawReady(ctx);
    else if (this.state === 'over') this.drawOver(ctx);
    else if (this.paused) { ctx.fillStyle = P.overlay; ctx.fillRect(0, 0, W, H); text(ctx, 'PAUSED', W / 2, H / 2 - 10, { size: 28, glow: P.ink }); text(ctx, 'press P or click to resume', W / 2, H / 2 + 30, { size: 10, color: P.dim }); }
  },

  drawReady(ctx) {
    const g = this.g, m = g.modes[this.mode], acc = this.col(g.accent);
    ctx.fillStyle = P.overlay; ctx.fillRect(0, 0, W, H);
    panelBox(ctx, 100, 120, 600, 360);
    text(ctx, g.name.toUpperCase(), W / 2, 170, { size: 24, color: acc, glow: acc });
    text(ctx, m.label.toUpperCase() + ' MODE' + (this.hasCpu() ? ` · COMPUTER LEVEL ${this.level()}` : ''), W / 2, 206, { size: 10, color: P.dim });
    g.sides.forEach((s, i) => {
      const y = 262 + i * 52, sc = this.col(s.color);
      text(ctx, this.roleTag(i), 140, y, { size: 12, color: this.ctrl[i] === 'cpu' ? P.dim : P.ink, align: 'left' });
      text(ctx, s.name.toUpperCase(), 660, y, { size: 12, color: sc, align: 'right' });
      ctx.fillStyle = P.faint; ctx.fillRect(140, y + 18, 520, 1);
    });
    text(ctx, m.hint, W / 2, 384, { size: 9, color: P.ink2 });
    if (Math.floor(performance.now() / 500) % 2) text(ctx, 'CLICK OR PRESS ENTER TO START', W / 2, 432, { size: 11, color: P.ink });
  },

  drawOver(ctx) {
    const r = this.result || {};
    ctx.fillStyle = P.overlay; ctx.fillRect(0, 0, W, H);
    panelBox(ctx, 100, 170, 600, 260);
    // color the headline by whether the human won
    let col = P.ink;
    if (r.winner != null) col = this.ctrl[r.winner] === 'human' ? P.green : P.red;
    if (this.ctrl.every(c => c === 'human') && r.winner != null) col = this.col(this.g.sides[r.winner].color);
    text(ctx, r.title || 'GAME OVER', W / 2, 225, { size: 22, color: col, glow: col });
    (r.detail || '').split('\n').forEach((l, i) => text(ctx, l, W / 2, 278 + i * 26, { size: 11, color: P.ink2 }));
    if (r.levelMsg) text(ctx, r.levelMsg, W / 2, 352, { size: 9, color: P.amber });
    if (Math.floor(performance.now() / 500) % 2) text(ctx, 'CLICK OR PRESS ENTER TO PLAY AGAIN', W / 2, 395, { size: 10, color: P.ink });
  },
};
