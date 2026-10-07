/* =====================================================================
   BALANCE LAB — shows the Monte Carlo calibration and lets anyone run
   fresh simulations in the browser, using the very same Model and
   Controller code the games use.
   ===================================================================== */
const Lab = {
  game: 'snake', mode: 0, running: null,
  ids() { return Cab.games.filter(g => g.modes.some(m => m.ctrl.includes('cpu'))).map(g => g.id); },
  open() {
    const el = document.getElementById('lab');
    if (!this.built) { this.build(el); this.built = true; }
    this.render();
  },
  build(el) {
    el.innerHTML = `
      <div class="bar"><button class="chip" type="button" onclick="location.hash=''">← Cabinet</button><h2 style="--c:var(--cyan)">Balance Lab</h2></div>
      <section class="lab-intro">
        <p>Each game is built as <b>Model</b> (the rules), <b>Controllers</b> (you, the computer, or a <i>simulated person</i>) and <b>View</b> (the drawing).
        Because the model runs without a screen, we can play thousands of games in seconds. That is a <b>Monte Carlo</b> simulation.</p>
        <p>For every game and mode we swept the computer's strength from 0 to 1 against a simulated average player, then picked the strength for each level
        so the average player wins <b>85%</b> of games at level 1, sliding evenly to <b>15%</b> at level 10. The chart checks that with fresh games
        against novice, average and expert simulated players (shaded bands are 95% confidence intervals).</p>
      </section>
      <div class="lab-tabs" id="labTabs"></div>
      <div class="lab-grid">
        <div class="lab-card"><div class="lab-head"><h3 id="labTitle"></h3><div class="seg" id="labModes"></div></div>
          <canvas id="labChart" width="760" height="380" aria-label="Win rate by computer level"></canvas>
          <div class="lab-legend" id="labLegend"></div>
          <div class="lab-table" id="labTable"></div>
        </div>
        <div class="lab-card"><h3>Run it yourself</h3>
          <p class="lab-note">Plays real games with no screen: the computer at the level you pick against a simulated player. Each run uses new random seeds, so expect a few points of difference from the chart.</p>
          <label>Computer level <select id="labLevel">${Array.from({ length: 10 }, (_, i) => `<option${i === 4 ? ' selected' : ''}>${i + 1}</option>`).join('')}</select></label>
          <label>Simulated player <select id="labProfile">${PLAYER_PROFILES.map(p => `<option value="${p.s}"${p.id === 'average' ? ' selected' : ''}>${p.label} (skill ${p.s})</option>`).join('')}</select></label>
          <label>Games <select id="labN"><option>50</option><option selected>100</option><option>250</option><option>500</option></select></label>
          <button class="btn primary" id="labRun" type="button">Run simulation</button>
          <div class="lab-out" id="labOut" aria-live="polite"></div>
        </div>
      </div>`;
    el.querySelector('#labRun').onclick = () => this.run();
  },
  render() {
    const ids = this.ids(), tabs = document.getElementById('labTabs');
    tabs.innerHTML = ids.map(id => `<button type="button" class="chip${id === this.game ? ' on' : ''}" data-g="${id}">${Cab.byId[id].name}</button>`).join('');
    tabs.querySelectorAll('button').forEach(b => b.onclick = () => { this.game = b.dataset.g; this.mode = 0; this.render(); });
    const g = Cab.byId[this.game], modes = g.modes.map((m, i) => ({ m, i })).filter(x => x.m.ctrl.includes('cpu'));
    if (!modes.some(x => x.i === this.mode)) this.mode = modes[0].i;
    document.getElementById('labTitle').textContent = g.name;
    const seg = document.getElementById('labModes');
    seg.style.gridTemplateColumns = `repeat(${modes.length},1fr)`; seg.style.setProperty('--c', Cab.col(g.accent));
    seg.innerHTML = modes.map(x => `<button type="button" data-m="${x.i}" class="${x.i === this.mode ? 'on' : ''}">${x.m.label}</button>`).join('');
    seg.querySelectorAll('button').forEach(b => b.onclick = () => { this.mode = +b.dataset.m; this.render(); });
    this.chart(); this.table();
    document.getElementById('labOut').innerHTML = '';
  },
  data() { return CALIBRATION[this.game] && CALIBRATION[this.game][this.mode]; },
  colors() { return { novice: P.amber, average: P.cyan, expert: P.violet, target: P.ink }; },
  chart() {
    const cv = document.getElementById('labChart'), ctx = cv.getContext('2d'), d = this.data(), C = this.colors();
    const dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = 760 * dpr; cv.height = 380 * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const L = 52, R = 18, T = 18, B = 44, w = 760 - L - R, h = 380 - T - B;
    const X = lv => L + (lv - 1) / 9 * w, Y = p => T + (1 - p) * h;
    ctx.clearRect(0, 0, 760, 380);
    ctx.font = '12px "Space Grotesk", system-ui, sans-serif'; ctx.textBaseline = 'middle';
    for (let p = 0; p <= 1.001; p += 0.25) { ctx.strokeStyle = P.grid; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(L, Y(p)); ctx.lineTo(L + w, Y(p)); ctx.stroke(); ctx.fillStyle = P.dim; ctx.textAlign = 'right'; ctx.fillText(Math.round(p * 100) + '%', L - 8, Y(p)); }
    ctx.textAlign = 'center';
    for (let lv = 1; lv <= 10; lv++) ctx.fillText(String(lv), X(lv), T + h + 16);
    ctx.fillText('Computer level', L + w / 2, T + h + 36);
    ctx.save(); ctx.translate(14, T + h / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('Player win rate', 0, 0); ctx.restore();
    // target line
    ctx.strokeStyle = C.target; ctx.setLineDash([6, 6]); ctx.lineWidth = 1.5; ctx.beginPath();
    for (let lv = 1; lv <= 10; lv++) { const y = Y(TARGET(lv)); lv === 1 ? ctx.moveTo(X(lv), y) : ctx.lineTo(X(lv), y); }
    ctx.stroke(); ctx.setLineDash([]);
    if (!d) { ctx.fillStyle = P.dim; ctx.fillText('No calibration data yet', L + w / 2, T + h / 2); return; }
    for (const pr of PLAYER_PROFILES) {
      const v = d.validate[pr.id]; if (!v) continue;
      ctx.fillStyle = rgba(C[pr.id], 0.14); ctx.beginPath();
      v.forEach((c, i) => { i ? ctx.lineTo(X(i + 1), Y(c.hi)) : ctx.moveTo(X(1), Y(c.hi)); });
      for (let i = v.length - 1; i >= 0; i--) ctx.lineTo(X(i + 1), Y(v[i].lo));
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = C[pr.id]; ctx.lineWidth = pr.id === 'average' ? 3 : 2; ctx.beginPath();
      v.forEach((c, i) => { i ? ctx.lineTo(X(i + 1), Y(c.p)) : ctx.moveTo(X(1), Y(c.p)); }); ctx.stroke();
      ctx.fillStyle = C[pr.id]; v.forEach((c, i) => { ctx.beginPath(); ctx.arc(X(i + 1), Y(c.p), pr.id === 'average' ? 4 : 3, 0, TAU); ctx.fill(); });
    }
    document.getElementById('labLegend').innerHTML = PLAYER_PROFILES.map(pr => `<span><i style="background:${C[pr.id]}"></i>${pr.label} player</span>`).join('') + `<span><i class="dash" style="border-color:${C.target}"></i>Target for the average player</span>`;
  },
  table() {
    const d = this.data(), el = document.getElementById('labTable');
    if (!d) { el.innerHTML = ''; return; }
    const pc = x => Math.round(x * 100) + '%';
    el.innerHTML = `<table><thead><tr><th>Level</th>${d.k.map((_, i) => `<th>${i + 1}</th>`).join('')}</tr></thead><tbody>
      <tr><th>Computer strength</th>${d.k.map(k => `<td>${k.toFixed(2)}</td>`).join('')}</tr>
      <tr><th>Target</th>${d.k.map((_, i) => `<td>${pc(TARGET(i + 1))}</td>`).join('')}</tr>
      ${PLAYER_PROFILES.map(pr => `<tr><th>${pr.label}</th>${d.validate[pr.id].map(c => `<td title="95% CI ${pc(c.lo)}–${pc(c.hi)}, ${c.n} games">${pc(c.p)}</td>`).join('')}</tr>`).join('')}
      </tbody></table>
      <p class="lab-note">${d.sweep.length} strengths × ${d.n} games to calibrate, then ${d.nv} games for each level and player (${(d.sweep.length * d.n + 30 * d.nv).toLocaleString()} games for this mode). Calibrated ${new Date(d.at).toLocaleDateString()}.</p>`;
  },
  run() {
    if (this.running) { this.running.stop = true; return; }
    const lv = +document.getElementById('labLevel').value, s = +document.getElementById('labProfile').value, n = +document.getElementById('labN').value;
    const k = strengthFor(this.game, this.mode, lv), out = document.getElementById('labOut'), btn = document.getElementById('labRun');
    const job = this.running = { stop: false, w: 0, i: 0, t: 0 }, base = (Math.random() * 1e9) >>> 0, t0 = performance.now();
    btn.textContent = 'Stop';
    const step = () => {
      const until = performance.now() + 30;
      while (job.i < n && performance.now() < until && !job.stop) { const r = simulateMatch(this.game, this.mode, k, s, base + job.i); job.w += r.humanWon ? 1 : 0; job.t += r.t; job.i++; }
      const p = job.w / Math.max(1, job.i), z = 1.96, nn = Math.max(1, job.i), den = 1 + z * z / nn, c = p + z * z / (2 * nn), e = z * Math.sqrt(p * (1 - p) / nn + z * z / (4 * nn * nn));
      out.innerHTML = `<div class="big">${Math.round(p * 100)}%</div><div>player wins ${job.w} of ${job.i} games${job.i < n && !job.stop ? '…' : ''}</div>
        <div class="lab-note">95% confidence: ${Math.round(100 * (c - e) / den)}–${Math.round(100 * (c + e) / den)}% · average game ${(job.t / nn).toFixed(0)} s of play · computer strength ${k.toFixed(2)}${s === 0.5 ? ` · target ${Math.round(TARGET(lv) * 100)}%` : ''} · ${((performance.now() - t0) / 1000).toFixed(1)} s to run</div>
        <div class="lab-bar"><i style="width:${(job.i / n) * 100}%"></i></div>`;
      if (job.i < n && !job.stop) setTimeout(step, 0);
      else { this.running = null; btn.textContent = 'Run simulation'; }
    };
    step();
  },
};
