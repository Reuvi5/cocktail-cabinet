/* =====================================================================
   IMITATION — VIEW (HTML chat screen) + two-browser matchmaking.
   The round itself is ImitationRound (the model); the computer judge and
   witness are controllers from imitation.ai.js; this file only shows the
   round and turns your typing and clicks into moves.
   ===================================================================== */
(() => {
  const PREFIX = 'cocktailcab-imitation-v2-', SLOTS = 6;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ADJ = ['quiet', 'rusty', 'lucky', 'mellow', 'sly', 'brave', 'fuzzy', 'amber', 'neon', 'swift', 'cosmic', 'salty', 'sleepy', 'witty'];
  const NOUN = ['otter', 'falcon', 'pixel', 'comet', 'maple', 'badger', 'lynx', 'kettle', 'raven', 'cactus', 'walrus', 'panda', 'noodle', 'moth'];
  const handle = () => pick(ADJ) + '_' + pick(NOUN) + rndi(10, 99);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  // the page's clock: real time
  class RealClock {
    constructor() { this.ids = new Set(); }
    now() { return performance.now(); }
    after(ms, fn) { const id = setTimeout(() => { this.ids.delete(id); fn(); }, ms); this.ids.add(id); return id; }
    cancel(id) { clearTimeout(id); this.ids.delete(id); }
    stop() { for (const id of this.ids) clearTimeout(id); this.ids.clear(); }
  }

  /* -------------------------------------------------------------------
     Two-browser matchmaking with PeerJS (public signalling, no API key).
     Lobby slots are well-known peer ids; the lowest free slot hosts.
     ------------------------------------------------------------------- */
  const Net = {
    ok() { return typeof window.Peer === 'function'; },
    opts() {
      const q = new URLSearchParams(location.search), o = { debug: 0 };
      if (q.get('peerhost')) Object.assign(o, { host: q.get('peerhost'), port: +(q.get('peerport') || 9000), path: q.get('peerpath') || '/', secure: q.get('peersecure') === '1' });
      return o;
    },
    peer(id) {
      return new Promise((res, rej) => {
        let p; try { p = id ? new Peer(id, this.opts()) : new Peer(this.opts()); } catch (e) { return rej(e); }
        const to = setTimeout(() => { rej(new Error('timeout')); p.destroy(); }, 9000);
        const onErr = e => { clearTimeout(to); rej(e); try { p.destroy(); } catch (_) { } };
        p.on('open', () => { clearTimeout(to); p.off('error', onErr); p.on('error', () => { }); res(p); });
        p.on('error', onErr);
      });
    },
    // ask one host for a seat; resolves the open connection if we get "welcome", else null
    join(peer, id, mode) {
      return new Promise(res => {
        let done = false; const conn = peer.connect(id, { reliable: true });
        const fin = c => { if (done) return; done = true; clearTimeout(t); peer.off('error', onErr); if (!c) try { conn.close(); } catch (_) { } res(c); };
        const onErr = e => { if (e && e.type === 'peer-unavailable' && String(e.message || '').includes(id)) fin(null); };
        const t = setTimeout(() => fin(null), 2800);
        peer.on('error', onErr);
        conn.on('error', () => fin(null));
        conn.on('close', () => fin(null));
        conn.on('open', () => conn.send({ t: 'join', mode }));
        conn.on('data', d => { if (d && d.t === 'welcome') fin(conn); else if (d && d.t === 'busy') fin(null); });
      });
    },
    // try several hosts at once; keep the first that welcomes us, politely decline the rest
    joinAny(peer, ids, mode) {
      if (!ids.length) return Promise.resolve(null);
      return new Promise(res => {
        let winner = null, left = ids.length;
        ids.forEach(id => this.join(peer, id, mode).then(c => {
          left--;
          if (c && !winner) { winner = c; this.buffer(c); c.send({ t: 'confirm' }); res(c); }
          else if (c) { try { c.send({ t: 'decline' }); } catch (_) { } setTimeout(() => c.close(), 300); }
          if (!left && !winner) res(null);
        }));
      });
    },
    // keep every message from the moment we are matched, so nothing is lost before the chat screen is ready
    buffer(c) { if (!c.__inbox) { c.__inbox = []; c.on('data', d => c.__inbox.push(d)); } return c; },
    // returns { promise, cancel }. promise resolves { conn, host, keep } or null
    // mode 'normal' (judge) or 'flipped' (plays the AI). Two 'flipped' players never pair: nobody would judge.
    search(mode) {
      let cancelled = false, matched = false; const peers = [];
      const ids = Array.from({ length: SLOTS }, (_, i) => PREFIX + 'lobby-' + i);
      const cleanup = keep => peers.forEach(p => { if (p !== keep) try { p.destroy(); } catch (_) { } });
      const promise = (async () => {
        if (!this.ok()) return null;
        const guest = await this.peer().catch(() => null); if (!guest) return null; peers.push(guest);
        let hostPeer = null, mySlot = ids.length, resolveHost, pending = null;
        const hostWait = new Promise(r => { resolveHost = r; });
        const onConn = c => {
          c.on('data', d => {
            if (!d) return;
            if (d.t === 'join') {
              if (matched || cancelled || pending || (mode === 'flipped' && d.mode === 'flipped')) { c.send({ t: 'busy' }); setTimeout(() => c.close(), 400); return; }
              pending = c; c.send({ t: 'welcome' });
              setTimeout(() => { if (pending === c && !matched) pending = null; }, 4000);
            } else if (d.t === 'confirm' && pending === c && !matched && !cancelled) {
              matched = true; this.buffer(c); resolveHost({ conn: c, host: true, keep: hostPeer });
            } else if (d.t === 'decline' && pending === c) pending = null;
          });
          c.on('close', () => { if (pending === c && !matched) pending = null; });
        };
        while (!cancelled && !matched) {
          // 1) look for someone already hosting a lower slot than ours
          const c = await this.joinAny(guest, ids.slice(0, Math.min(mySlot, ids.length)), mode);
          if (c && !matched && !cancelled) { matched = true; if (hostPeer) try { hostPeer.destroy(); } catch (_) { } return { conn: c, host: false, keep: guest }; }
          if (c) c.close();
          if (matched || cancelled) break;
          // 2) otherwise host the lowest free slot and wait
          if (!hostPeer) {
            for (let i = 0; i < ids.length && !cancelled && !matched; i++) {
              try { hostPeer = await this.peer(ids[i]); mySlot = i; peers.push(hostPeer); hostPeer.on('connection', onConn); break; }
              catch (e) { hostPeer = null; }
            }
          }
          if (!hostPeer) { await wait(rnd(1200, 2500)); continue; }
          if (mySlot === 0 && mode !== 'flipped') return await hostWait;
          const r = await Promise.race([hostWait, wait(rnd(2500, 4500)).then(() => null)]);
          if (r) return r;
        }
        return matched ? await hostWait : null;
      })().then(r => { if (cancelled) { cleanup(null); return null; } if (r) cleanup(r.keep); return r; }).catch(e => { console.warn('matchmaking failed', e); cleanup(null); return null; });
      return { promise, cancel() { if (matched) return; cancelled = true; cleanup(null); } }; // once matched, the chat owns the connection
    },
  };

  window.CabNet = Net; // exposed for debugging from the console

  const MODES = {
    normal: {
      title: 'SPOT THE BOT', button: 'FIND A MATCH',
      intro: 'You\'ll be matched with a stranger. It could be <b>another player</b> in a different browser, or <b>our AI pretending to be a person</b>. Chat, then make the call: human or AI?',
      steps: [['1 · MATCH', 'We find you a stranger. You won\'t be told who, or what, it is.'], ['2 · CHAT', 'Ask anything for up to 2 minutes. Try to catch a slip.'], ['3 · VOTE', 'Human or AI? You can vote after 3 messages.']],
    },
    flipped: {
      title: 'BE THE BOT', button: 'FIND A JUDGE',
      intro: 'Now you\'re the one on trial, and you want to be mistaken for a machine. The judge may be <b>our computer</b> or <b>a real player</b> in another browser.',
      steps: [['1 · MATCH', 'We find you a judge. You won\'t be told who, or what, it is.'], ['2 · ANSWER', 'Reply to every question the way an AI would: fast, exact and tidy.'], ['3 · VERDICT', 'The judge votes. You win if it says AI.']],
    },
  };


  class ImitationScreen {
    constructor(env) {
      this.env = env; this.st = env.store; this.timers = []; this.cleanups = [];
      this.mode = env.mode === 0 ? 'normal' : 'flipped';
      for (const k of ['judged', 'judgedRight', 'witnessed', 'fooled']) this.st[k] = this.st[k] || 0;
      this.root = document.createElement('div'); this.root.className = 'imi'; env.stage.appendChild(this.root);
      this.home();
    }
    T(fn, ms) { const t = setTimeout(() => { if (!this.gone) fn(); }, ms); this.timers.push(t); return t; }
    clear() { this.timers.forEach(clearTimeout); this.timers = []; this.cleanups.forEach(f => { try { f(); } catch (_) { } }); this.cleanups = []; clearInterval(this.tick); }
    destroy() { this.gone = true; this.clear(); }
    html(h) { this.root.innerHTML = h; return this.root; }
    scoreLine() {
      const s = this.st;
      return this.mode === 'normal' ? `YOUR CALLS: ${s.judgedRight} RIGHT OF ${s.judged} · COMPUTER LEVEL ${Cab.level()}` : `JUDGES FOOLED: ${s.fooled} OF ${s.witnessed} · COMPUTER LEVEL ${Cab.level()}`;
    }
    home() {
      this.clear();
      const M = MODES[this.mode];
      const r = this.html(`<div class="scr">
        <h2>${M.title}</h2><p>${M.intro}</p>
        <div class="steps">${M.steps.map(([a, b]) => `<div><b>${a}</b>${b}</div>`).join('')}</div>
        <button class="play" data-a="go">${M.button}</button>
        <div class="score">${this.scoreLine()}</div></div>`);
      r.querySelector('[data-a=go]').onclick = () => this.matchmake();
    }
    matchmake() {
      this.clear();
      const r = this.html(`<div class="scr">
        <div class="spin"></div><h2>FINDING A MATCH</h2>
        <p>${this.mode === 'normal' ? 'Looking for someone to chat with…' : 'Looking for a judge…'}</p>
        <div class="log"></div><button class="ghost" data-a="cancel">Cancel</button></div>`);
      const log = r.querySelector('.log'), line = s => { log.innerHTML += '› ' + esc(s) + '<br>'; };
      const started = performance.now(), minWait = rnd(3500, 6500), fallbackAt = rnd(10000, 14000), me = handle();
      let done = false, matchedRes = null;
      const search = Net.search(this.mode);
      this.cleanups.push(() => search.cancel());
      r.querySelector('[data-a=cancel]').onclick = () => {
        done = true; search.cancel();
        if (matchedRes) { try { matchedRes.conn.send({ t: 'bye' }); } catch (_) { } setTimeout(() => { try { matchedRes.keep.destroy(); } catch (_) { } }, 300); }
        this.home();
      };
      line('Joining the lobby…');
      this.T(() => line('Looking for an open seat…'), 1300);
      // identical steps whether the partner turns out to be a person or the house AI
      const connectAs = (partnerHandle, go) => {
        const rest = Math.max(0, minWait - (performance.now() - started));
        this.T(() => { line(`Match found: ${partnerHandle}`); this.T(() => { line('Connecting…'); this.T(() => { line('Starting chat…'); this.T(go, 700); }, 900); }, 800); }, rest);
      };
      search.promise.then(res => {
        if (done || this.gone) { if (res) try { res.keep.destroy(); } catch (_) { } return; }
        if (!res) return;   // nobody around: the fallback below takes over
        done = true; matchedRes = res;
        const conn = res.conn, inbox = Net.buffer(conn).__inbox;
        conn.send({ t: 'hello', handle: me, mode: this.mode });
        const poll = setInterval(() => {
          const h = inbox.find(d => d.t === 'hello'); if (!h) return;
          clearInterval(poll);
          const role = this.mode === 'flipped' ? 'witness' : h.mode === 'normal' ? 'mutual' : 'judge';
          connectAs(h.handle, () => this.chat({ role, partner: 'net', conn, peer: res.keep, inbox: inbox.filter(d => d.t !== 'hello' && d.t !== 'confirm'), handle: h.handle }));
        }, 100);
        this.cleanups.push(() => clearInterval(poll));
      });
      this.T(() => {
        if (done) return;
        done = true; search.cancel();
        const ph = handle();
        connectAs(ph, () => this.chat({ role: this.mode === 'normal' ? 'judge' : 'witness', partner: 'bot', handle: ph }));
      }, fallbackAt);
    }

    chat(o) {
      this.clear();
      const role = o.role, judging = role !== 'witness';
      const meName = role === 'witness' ? 'witness' : 'judge', themName = meName === 'judge' ? 'witness' : 'judge';
      const goal = role === 'witness' ? 'Convince the judge you are an <b>AI</b>. Answer fast, exactly and tidily. Pasting is off.'
        : role === 'mutual' ? 'Is your partner a <b>human</b> or an <b>AI</b>? (They are deciding the same about you.) Vote after 3 messages.'
          : 'Is your partner a <b>human</b> or an <b>AI</b>? Ask anything, then vote. Voting unlocks after 3 messages.';
      const r = this.html(`
        <div class="head"><span class="rtag">${role === 'witness' ? 'WITNESS' : 'JUDGE'}</span><span class="who">Chatting with <b>${esc(o.handle)}</b></span><span class="timer"></span></div>
        <div class="goal">${goal}</div>
        <div class="msgs" aria-live="polite"></div>
        <div class="typing"></div>
        ${judging ? '<div class="verdict"><span>Your call:</span><button class="vb h" data-v="human" disabled>Human</button><button class="vb mach" data-v="machine" disabled>AI</button></div>' : ''}
        <div class="compose"><input maxlength="220" placeholder="Type a message and press Enter" aria-label="Message"><button class="vb" data-a="send">Send</button></div>`);
      const msgs = r.querySelector('.msgs'), typingEl = r.querySelector('.typing'), timerEl = r.querySelector('.timer'), input = r.querySelector('.compose input');
      const add = (cls, t) => { const d = document.createElement('div'); d.className = 'm ' + cls; d.textContent = t; msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight; };
      let typingT = 0;
      const setTyping = on => { typingEl.textContent = on ? `${o.handle} is typing…` : ''; clearTimeout(typingT); if (on) typingT = setTimeout(() => typingEl.textContent = '', 6000); };
      const lockInput = msg => { input.disabled = true; input.placeholder = msg; r.querySelector('[data-a=send]').disabled = true; };

      // MODEL: one round on the real clock
      const clock = new RealClock(), rng = makeRng((Math.random() * 4294967296) >>> 0);
      const secs = role === 'witness' && o.partner === 'bot' ? ImiLib.BOTJUDGE_SECS : ImiLib.JUDGE_SECS;
      const round = new ImitationRound({ clock, humanRole: role, partner: o.partner, secs });
      this.cleanups.push(() => clock.stop());
      // VIEW: show what happens in the round
      round.on(e => {
        if (e.type === 'msg' && e.from === themName) { setTyping(false); add('them', String(e.text).slice(0, 300)); }
        if (e.type === 'typing' && e.from === themName) setTyping(e.on);
        if (e.type === 'over') { clearInterval(this.tick); this.T(() => this.result(o, e.result, bot), 1000); }
      });

      // CONTROLLER for the other side: the computer, or a person in another browser
      let bot = null;
      if (o.partner === 'net') {
        const conn = o.conn;
        const onData = d => {
          if (!d || round.over) return;
          if (d.t === 'msg') round.post(themName, String(d.text));
          if (d.t === 'typing') round.typing(themName, true);
          if (d.t === 'verdict') {
            if (role === 'witness') { add('sys', 'The judge has voted.'); round.vote('judge', d.v); round.settle(); }
            if (role === 'mutual') { add('sys', 'Your partner has voted.'); round.vote('witness', d.v); if (round.verdict) round.settle(); }
          }
          if (d.t === 'bye') { add('sys', 'Your partner left the chat.'); round.settle({ left: !(role === 'mutual' && round.verdict) }); }
        };
        (o.inbox || []).forEach(onData);
        conn.__inbox = { push: onData };
        conn.on('close', () => onData({ t: 'bye' }));
        round.on(e => { if (e.type === 'msg' && e.from === meName) conn.send({ t: 'msg', text: e.text }); if (e.type === 'vote' && e.from === 'judge' && judging) conn.send({ t: 'verdict', v: e.v }); });
        this.cleanups.push(() => { try { if (!round.over) conn.send({ t: 'bye' }); } catch (_) { } setTimeout(() => { try { o.peer.destroy(); } catch (_) { } }, 400); });
      } else if (role === 'judge') bot = new ImiBotWitness(this.env.k, clock, rng.fork(), round);
      else { bot = new ImiBotJudge(this.env.k, clock, rng.fork(), round); bot.start(); }

      // CONTROLLER for you: typing and voting
      let sent = 0, lastPing = 0;
      input.addEventListener('paste', e => { e.preventDefault(); add('sys', 'Pasting is off. Type it yourself!'); });
      input.addEventListener('drop', e => e.preventDefault());
      input.addEventListener('input', () => { const n = performance.now(); if (n - lastPing > 1500 && o.partner === 'net') { lastPing = n; try { o.conn.send({ t: 'typing' }); } catch (_) { } } });
      const send = () => {
        const t = input.value.trim(); if (!t || round.over || input.disabled) return;
        input.value = ''; add('me', t); round.post(meName, t); sent++;
        if (judging && sent >= 3 && !round.verdict) r.querySelectorAll('.verdict .vb').forEach(b => b.disabled = false);
        input.focus();
      };
      input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
      r.querySelector('[data-a=send]').onclick = send;
      setTimeout(() => input.focus(), 50);
      add('sys', judging ? 'Connected. Say hi. You ask the questions.' : 'Connected. The judge will ask the questions.');
      r.querySelectorAll('.verdict .vb').forEach(b => b.onclick = () => {
        if (round.over || round.verdict) return;
        round.vote('judge', b.dataset.v);
        r.querySelectorAll('.verdict .vb').forEach(x => x.disabled = true);
        add('sys', `You voted: ${b.dataset.v === 'machine' ? 'AI' : 'HUMAN'}`);
        if (role === 'mutual' && !round.theirVerdict) { add('sys', 'Waiting for your partner to vote…'); lockInput('Waiting for your partner to vote…'); this.T(() => round.settle(), 30000); }
        else round.settle();
      });
      // the round's clock on screen
      this.tick = setInterval(() => {
        const left = Math.ceil(round.timeLeft() / 1000);
        timerEl.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
        if (left > 0 || round.over) return;
        if (judging && !round.verdict) { lockInput('Time is up. Cast your vote!'); r.querySelectorAll('.verdict .vb').forEach(b => b.disabled = false); timerEl.textContent = 'VOTE!'; }
        else if (bot && bot.timeUp) bot.timeUp();
        else if (round.timeLeft() <= 0 && performance.now() > round.endsAt + 30000) round.settle(role === 'witness' ? { noVote: true } : {});
      }, 250);
    }

    result(o, x, bot) {
      this.clear();
      const st = this.st, role = o.role, net = o.partner === 'net';
      let head, body = '', reasons = '';
      const win = x.won;
      if (x.left || x.noVote) { head = x.left ? 'PARTNER LEFT' : 'NO VOTE'; body = x.left ? 'The other player disconnected before the round finished.' : 'The judge never voted.'; }
      else if (role === 'witness') {
        st.witnessed++; if (win) st.fooled++;
        head = win ? 'YOU PASSED AS AN AI!' : 'THE JUDGE SAW A HUMAN';
        body = `The judge voted <b>${x.verdict === 'machine' ? 'AI' : 'HUMAN'}</b>. Your judge was ${net ? '<b>a real person</b> in another browser.' : '<b>the computer</b>.'}`;
      } else {
        st.judged++; if (win) st.judgedRight++;
        head = win ? 'GOOD CALL!' : 'FOOLED!';
        body = `You said <b>${x.verdict === 'machine' ? 'AI' : 'HUMAN'}</b>. It was ${net ? '<b>a real person</b> in another browser.' : '<b>our AI</b>, pretending to be a person.'}`;
        if (role === 'mutual') body += x.theirVerdict ? ` They guessed you were <b>${x.theirVerdict === 'machine' ? 'an AI' : 'human'}</b>.` : ' They didn\'t vote in time.';
      }
      if (x.notes) {
        const seen = new Set(), n = x.notes.slice().sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).filter(k => !seen.has(k.why) && seen.add(k.why)).slice(0, 4);
        reasons = `<div class="reasons"><b>What the judge noticed</b><ul>${n.map(k => `<li>${k.v > 0 ? '🤖' : '🧑'} ${esc(k.why)}</li>`).join('') || '<li>Not much to go on.</li>'}</ul></div>`;
      }
      // rounds against the house AI move the computer level: up when you win, down when you lose
      const lvMsg = !net && win != null ? this.env.report(win) : '';
      const r = this.html(`<div class="scr">
        <h2 class="${win == null ? '' : win ? 'win' : 'lose'}">${head}</h2><p>${body}</p>${reasons}${lvMsg ? `<div class="score">${lvMsg}</div>` : ''}
        <div class="row"><button class="play" data-a="again">PLAY AGAIN</button><button class="ghost" data-a="home">Back</button></div>
        <div class="score">${this.scoreLine()}</div></div>`);
      r.querySelector('[data-a=again]').onclick = () => { this.env.k = strengthFor('imitation', this.env.mode, Cab.level()); this.matchmake(); };
      r.querySelector('[data-a=home]').onclick = () => this.home();
    }
  }

  Cab.register(Object.assign(GAMES.imitation, {
    name: 'Imitation', accent: 'violet', opponentTag: 'OPPONENT', createDom: env => new ImitationScreen(env),
    tagline: 'Human or AI? Spot the bot, or play the bot and fool the judge.',
    about: 'Turing\'s imitation game. A judge chats with a stranger and decides whether it\'s a person or a machine.',
    sides: [
      { name: 'Judge', color: 'violet', goal: 'Chat with a stranger, then decide: human or AI?', cpuHelp: 'Usually the computer: it mixes small talk with machine tests (quick sums, spelling backwards, exact instructions), scores every answer, then votes. It can also be a real player in another browser.' },
      { name: 'Witness', color: 'cyan', goal: 'Convince the judge that you are an AI.', cpuHelp: 'Usually our AI, playing a person with a made-up life, typos, human typing speed and dodges. It can also be a real player in another browser.' },
    ],
    modes: [
      Object.assign(GAMES.imitation.modes[0], { label: 'Normal', summary: 'You are the judge. Chat with a stranger, then decide whether it\'s a human or an AI.', how: 'Press <b>Find a match</b>. <b>Type</b> and press <b>Enter</b> to chat. After 3 messages, click <b>Human</b> or <b>AI</b>.', hint: '' }),
      Object.assign(GAMES.imitation.modes[1], { label: 'Flipped', summary: 'You are the witness, and you play the AI. Convince the judge you\'re a machine.', how: 'Press <b>Find a judge</b>. <b>Type</b> your answers and press <b>Enter</b>. Pasting is disabled.', hint: '' }),
    ],
    rules: '<b>Getting harder:</b> the computer level rises when you win a round and drops when you lose one. Higher up, the AI witness drops its tells (stiff grammar, instant answers), and the AI judge sets harder tests with tighter time limits.<br><br><b>Two browsers:</b> open the page in two browsers and press the button in both within a few seconds of each other. Pick Normal in one and Flipped in the other for judge vs witness, or Normal in both to size each other up.',
    thumb(c, w, h) {
      const L = P.light;
      c.fillStyle = L ? '#f3efff' : '#0a0b17'; c.fillRect(0, 0, w, h);
      const them = L ? '#e6e0f5' : '#1b1e38', me = L ? '#6a48d6' : '#3a2c86';
      const bub = (x, y, bw, col) => { c.fillStyle = col; c.beginPath(); c.roundRect(x, y, bw, 34, 14); c.fill(); };
      bub(30, 40, 190, them); bub(180, 90, 190, me); bub(30, 140, 150, them); bub(210, 190, 160, me);
      [[48, 57, 120, 0], [198, 107, 140, 1], [48, 157, 90, 0], [228, 207, 100, 1]].forEach(([x, y, l, m]) => { c.fillStyle = m ? 'rgba(255,255,255,.6)' : (L ? 'rgba(27,29,46,.35)' : 'rgba(255,255,255,.45)'); c.fillRect(x, y - 3, l, 6); });
      c.font = '28px ' + FONT; c.fillStyle = P.violet; c.textAlign = 'center'; c.fillText('?', 330, 55); c.fillText('?', 60, 245);
    },
  }));
})();
