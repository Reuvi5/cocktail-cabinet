/* =====================================================================
   IMITATION — CONTROLLERS.
   Computer:   ImiBotWitness (an AI pretending to be a person)
               ImiBotJudge   (asks questions and machine tests, then votes)
   Simulated:  ImiSimWitness (a person pretending to be an AI)
               ImiSimJudge   (a person trying to spot the AI)
   All of them act only through the round and the clock.
   ===================================================================== */
class ImiBotWitness {
  constructor(k, clock, rng, round) {
    this.h = clamp(k, 0, 1); this.clock = clock; this.rng = rng; this.round = round; this.p = ImiLib.persona(rng);
    this.seen = new Set(); this.inbox = []; this.busy = false; this.dead = false;
    round.on(e => { if (e.type === 'msg' && e.from === 'judge') { this.inbox.push(e.text); this.pump(); } if (e.type === 'over') this.dead = true; });
  }
  get tell() { return 0.82 * (1 - this.h) + 0.03; }   // chance a reply comes out stiff and machine-like
  pump() {
    if (this.busy || this.dead || !this.inbox.length) return;
    this.busy = true;
    const msg = this.inbox.shift(), rng = this.rng, tell = rng.chance(this.tell);
    let { text: out, probe } = this.answer(msg, tell);
    let fix = null;
    if (tell && (!probe || /\s/.test(out))) out = ImiLib.formalize(out);
    else {
      if (rng.chance(0.3 * this.h)) { const t = ImiLib.typo(out, rng); out = t.s; fix = rng.chance(0.6) ? t.fix : null; }
      if (rng.chance(0.5)) out = out.replace(/'/g, '');
      out = out.replace(/\.$/, '');
    }
    const read = tell ? rng.range(250, 700) : rng.range(900, 2200) + msg.length * 18;   // machines answer at once; people read, think and type
    const think = probe && !tell ? rng.range(1500, 4000) + 2500 * this.h : 0;   // a convincing witness takes its time on tests
    const typeMs = Math.min(9000, tell ? out.length * 12 : out.length * rng.range(110, 190));
    const C = this.clock;
    C.after(read + think, () => {
      if (this.dead) return;
      this.round.typing('witness', true);
      C.after(typeMs, () => {
        if (this.dead) return;
        this.round.typing('witness', false); this.round.post('witness', out);
        const done = () => { this.busy = false; this.pump(); };
        if (fix) C.after(rng.range(900, 1600), () => { if (!this.dead) this.round.post('witness', fix); done(); }); else done();
      });
    });
  }
  answer(raw, tell) {
    const rng = this.rng, p = this.p, h = this.h, pick = a => rng.pick(a);
    let t = raw.toLowerCase().trim();
    const parts = t.split(/(?<=[.!?])\s+/).filter(Boolean); if (parts.length > 1) t = parts[parts.length - 1];   // answer the last sentence
    const key = t.replace(/[^a-z0-9 ]/g, '').trim();
    if (key && this.seen.has(key) && key.length > 6) return { text: pick(['you already asked that lol', 'deja vu, you asked that', 'lol same answer as before']) };
    this.seen.add(key);
    const nm = t.match(/\b(?:my name is|im|i am|i'm|call me)\s+([a-z]{2,12})\b/);
    if (nm && !/\b(a|an|the|not|just|so|very|bored|tired|good|fine|human|bot|ai|robot|here)\b/.test(nm[1])) { this.judgeName = nm[1]; return { text: `nice to meet you ${nm[1]}` }; }
    const back = rng.chance(0.3 * h) ? ' ' + pick(['wbu?', 'what about you?', 'you?']) : '';
    const cap = t.match(/capital of ([a-z ]+?)[?.!]*$/);
    if (cap && ImiLib.CAPITALS[cap[1].trim()]) {
      const c = cap[1].trim();
      if (tell) return { text: `The capital of ${c} is ${ImiLib.CAPITALS[c]}`, probe: true };
      return { text: ImiLib.HUMAN_GUESS[c] && rng.chance(0.7) ? ImiLib.HUMAN_GUESS[c] : `${ImiLib.CAPITALS[c]}?`, probe: true };
    }
    const rev = t.match(/(?:spell|write|type)\s+(?:the\s+word\s+)?["'“]?([a-z]+)["'”]?\s+backwards?/) || t.match(/reverse\s+(?:the\s+word\s+)?["'“]?([a-z]+)/);
    if (rev) {
      const r = rev[1].split('').reverse().join('');
      if (tell) return { text: r, probe: true };
      if (rng.chance(0.35)) return { text: pick(['why lol', 'ugh fine hold on... ', 'thats so random']) + ' ' + (rng.chance(0.5) ? r : r.slice(0, -2) + r.slice(-1) + r.slice(-2, -1)), probe: true };
      return { text: rng.chance(0.6) ? r : pick(['nah im good', 'lol no', 'is this a test?']), probe: true };
    }
    const cnt = t.match(/how many letters (?:are )?(?:in|does) (?:the word )?["'“]?([a-z]+)["'”]?/);
    if (cnt) {
      const n = cnt[1].length;
      if (tell) return { text: `There are ${n} letters in "${cnt[1]}"`, probe: true };
      return { text: rng.chance(0.7) ? `${n}? ${pick(['i counted on my fingers', 'i think', ''])}` : `${n + pick([-1, 1])}`, probe: true };
    }
    const only = t.match(/reply with only the word ["'“]?([a-z]+)["'”]?/);
    if (only) {
      if (tell) return { text: only[1].toUpperCase(), probe: true };
      return { text: pick([`${only[1].toUpperCase()} lol`, `why? ok ${only[1].toUpperCase()}`, `${only[1]}`, 'no lol']), probe: true };
    }
    const m = ImiLib.mathOf(t);
    if (m) {
      if (tell) return { text: String(m.v), probe: true };
      if (!m.hard && rng.chance(0.75)) return { text: `${m.v}${rng.chance(0.4) ? ' i think' : ''}`, probe: true };
      return { text: pick([`uh like ${Math.round(m.v * rng.range(0.9, 1.1))}?`, 'im not a calculator lol', `hold on... ${m.v}? i used my phone`, 'math is not my thing']), probe: true };
    }
    if (/\b(are|r) (you|u) (a |an )?(bot|ai|robot|machine|computer|program|chatgpt|human|real|person)\b/.test(t) || /\bprove\b/.test(t))
      return { text: tell ? pick(['I am a human being', 'No, I am not a robot. I am a person']) : pick(['lol no, are you?', 'im a person?? thats exactly what a bot would say though huh', 'pretty sure im human, last i checked', 'how would i even prove that lol ask me something']) };
    const rules = [
      [/^(hi|hey|hello|yo|sup|hiya|howdy|good (morning|afternoon|evening))\b/, () => pick(['hey', 'hi!', 'heyy', 'hello', 'yo']) + (this.judgeName ? ' ' + this.judgeName : '') + (rng.chance(0.5) ? ' how are you' : '')],
      [/how are (you|u)|how('s| is) (it going|your day)|how you doing|hows life/, () => `${p.mood}${back || ' wbu'}`],
      [/\b(your|ur) name\b|who are you|what should i call you/, () => `${p.name}${back}`],
      [/how old|your age|what age/, () => `${p.age}${back}`],
      [/where .*(from|live|located|based)|what (city|country|state)/, () => `${p.place}${back}`],
      [/breakfast|lunch|dinner|eat (today|this morning)|did you eat/, () => p.breakfast + (rng.chance(0.5) ? ', i should eat more honestly' : '')],
      [/(hobb|free time|for fun|weekend|spare time)/, () => p.hobby + back],
      [/(what do you do|job|work|school|study|major|student)/, () => p.job + back],
      [/(favou?rite|fav|best) (food|meal|snack)|hungry/, () => p.food],
      [/\bpets?\b|\bdog\b|\bcat\b/, () => p.pet],
      [/music|song|band|listen/, () => p.music],
      [/weather|raining|sunny|cold|hot outside/, () => pick(['kinda gray today', 'its actually nice out', 'hot. way too hot', 'raining again lol'])],
      [/what time|time is it/, () => { const d = new Date(); return `like ${d.getHours() % 12 || 12}${pick(['ish', ':' + String(d.getMinutes()).padStart(2, '0')])}`; }],
      [/what day|date today|today's date/, () => new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase() + '?'],
      [/dream/, () => pick(['i dreamed i missed a test i wasnt even signed up for', 'something about being late for a flight, classic', 'i never remember my dreams tbh'])],
      [/smell|taste|feel like|describe/, () => pick(['hard to describe honestly, kinda nostalgic?', 'like wet pavement lol', 'warm? thats the best i got', 'uhh like a summer evening i guess'])],
      [/annoy|hate|worst|mad/, () => pick(['my roommate leaving dishes in the sink', 'group projects', 'people who walk slow in the hallway', 'my phone battery'])],
      [/\bwhy\b/, () => pick(['idk just felt like it', 'good question honestly', 'why not lol'])],
      [/\b(love|like|enjoy)\b.*\?/, () => pick(['yeah kinda', 'honestly yes', 'not really', 'depends on the day'])],
      [/^(do|does|did|are|is|can|have|would|will|could|should|were|was)\b/, () => pick(['yeah', 'nah', 'kinda?', 'yes lol', 'not really', 'sometimes']) + (rng.chance(0.5) ? ' ' + pick(['why', 'you?', 'honestly', '']) : '')],
      [/\b(stupid|dumb|idiot|shut up)\b/, () => pick(['rude lol', 'ok wow', 'damn ok'])],
      [/^(ok|okay|k|cool|nice|lol|haha|same|true|fair)\b/, () => pick(['lol', 'yeah', 'so what now', 'ok what else you got', 'haha'])],
      [/\?$/, () => pick(['hmm idk', 'good question', 'never thought about it tbh', 'what do you mean?', 'why do you ask'])],
    ];
    for (const [re, fn] of rules) if (re.test(t)) return { text: fn() };
    return { text: pick(['lol', 'fair', 'wait really?', 'haha nice', 'oh ok', 'same honestly', 'interesting', 'hm']) + (rng.chance(0.4) ? ' ' + pick(['so what do you do for fun', 'where are you from', 'how is your day going']) + '?' : '') };
  }
}

class ImiBotJudge {
  constructor(k, clock, rng, round) {
    this.L = 1 + 5 * clamp(k, 0, 1); this.clock = clock; this.rng = rng; this.round = round; this.m = 0; this.notes = []; this.n = 0; this.dead = false;
    const L = this.L, nQ = Math.min(8, 5 + Math.floor(L / 2)), nProbe = Math.min(nQ - 2, 2 + Math.floor(L / 2));
    const qs = rng.shuffle(ImiLib.SMALL.slice()).slice(0, nQ - nProbe).map(q => ({ kind: 'small', q: ImiLib.titleCase(q) }));
    for (let i = 0; i < nProbe; i++) qs.push(ImiLib.probe(L, rng));
    this.qs = [qs[0], ...rng.shuffle(qs.slice(1))]; this.qi = -1; this.cur = null; this.buf = ''; this.timer = null;
    round.on(e => { if (e.type === 'msg' && e.from === 'witness') this.receive(e.text); if (e.type === 'over') this.dead = true; });
  }
  get threshold() { return 0.45 + 0.22 * (this.L - 1) + 0.25 * Math.max(0, this.L - 4); }
  after(ms, fn) { return this.clock.after(ms, () => { if (!this.dead) fn(); }); }
  start() { this.after(this.rng.range(900, 1600), () => this.next(this.rng.pick(['Hello. I will ask you a few questions.', "Hi. Let's begin.", 'Hey, a few questions, then I decide.']))); }
  say(text, then) {
    this.round.typing('judge', true);
    this.after(clamp(text.length * 25, 400, 1600), () => { this.round.typing('judge', false); this.round.post('judge', text); if (then) then(); });
  }
  next(prefix) {   // every judge message carries exactly one question
    if (this.timer) this.clock.cancel(this.timer);
    this.qi++;
    if (this.qi >= this.qs.length) return this.decide();
    this.cur = this.qs[this.qi]; this.buf = ''; this.gotAt = 0;
    this.say((prefix ? prefix + ' ' : '') + this.cur.q, () => {
      this.askedAt = this.clock.now();
      this.timer = this.after(35000, () => { this.note(-1.2, 'You went quiet for a long time; machines always answer.'); this.n++; this.next('Still there? Moving on.'); });
    });
  }
  receive(text) {
    if (this.dead || !this.cur || !this.askedAt) return;
    if (!this.gotAt) this.gotAt = this.clock.now();
    this.buf += (this.buf ? ' ' : '') + text;
    if (this.timer) this.clock.cancel(this.timer);
    this.timer = this.after(1600, () => { this.score(this.buf, this.gotAt - this.askedAt); this.cur = null; this.askedAt = 0; this.after(this.rng.range(500, 1300), () => this.next()); });
  }
  note(v, why) { this.m += v; if (why) this.notes.push({ v, why }); }
  score(ans, ms) {
    const q = this.cur, a = ans.trim(), low = a.toLowerCase(), L = this.L;
    this.n++;
    const slang = (a.match(ImiLib.SLANG) || []).length, formal = /^[A-Z0-9"]/.test(a) && /[.?!"]$/.test(a);
    if (q.kind === 'small') {
      let v = 0;
      if (formal) v += 0.8;
      if (a.split(/\s+/).length >= 6 && !slang) v += 0.4;
      if (slang) { v -= 0.9 * Math.min(2, slang); this.notes.push({ v: -1, why: `Slang like "${(a.match(ImiLib.SLANG) || [''])[0]}" reads human.` }); }
      if (/\bi\b/.test(a)) { v -= 0.6; this.notes.push({ v: -0.6, why: 'A lowercase "i" is a human habit.' }); }
      if (/(\w)\1\1/.test(low) || /[!?]{2,}|:\)|:\(|😂|😅|🙂/.test(a)) { v -= 0.8; this.notes.push({ v: -0.8, why: 'Stretched words or emoji feel human.' }); }
      const cps = a.length / Math.max(0.5, ms / 1000);
      if (cps > 4.5) v += 0.6; else if (cps < 1.2) v -= 0.4;
      if (/\b(as an ai|language model|i do not have (personal|a body)|i don't have (personal|a body)|i am an ai|i'm an ai|i am a (machine|robot|bot))\b/i.test(a)) {
        if (L <= 2) { v += 1.6; this.notes.push({ v: 1.6, why: 'You talked like an AI assistant.' }); }
        else { v -= 1.2; this.notes.push({ v: -1.2, why: 'Announcing you are an AI is exactly what a human faker would do.' }); }
      }
      if (/\b(my (mom|dad|mum|sister|brother|roommate|friend|teacher|boss))\b|\byesterday\b|\blast night\b/i.test(a)) v -= 0.4;
      if (v >= 0.8) this.notes.push({ v, why: `"${a.slice(0, 40)}${a.length > 40 ? '…' : ''}" was tidy and complete, very machine-like.` });
      this.note(v);
    } else {
      const norm = low.replace(/[^a-z0-9]/g, ''), want = q.ans.toLowerCase().replace(/[^a-z0-9]/g, '');
      const right = q.kind === 'only' ? a.replace(/[."']/g, '') === q.ans : q.kind === 'cap' ? norm.includes(want) : norm === want || new RegExp('\\b' + q.ans + '\\b').test(low.replace(/,/g, ''));
      const sec = (ms / 1000).toFixed(1);
      if (right && ms <= q.limit) {
        this.note(ms < q.limit / 2 ? 2.8 : 2.1, `Answered "${q.q}" correctly in ${sec}s.`);
        if (a.length > q.ans.length + 14 && q.kind !== 'cap') this.note(-0.6, 'Padded a test answer with chatter.');
      } else if (right) this.note(0.3, `Right answer to "${q.q}", but it took ${sec}s (limit ${q.limit / 1000}s).`);
      else if (/\b(idk|no|nope|why|nah|not doing|dont know|don't know)\b/.test(low) || a.length < 1) this.note(-2, `Dodged "${q.q}".`);
      else this.note(-1.8, `Got "${q.q}" wrong (${a.slice(0, 20)}).`);
    }
  }
  decide() {
    if (this.decided) return; this.decided = true;
    const avg = this.m / Math.max(1, this.n), verdict = avg >= this.threshold ? 'machine' : 'human';
    this.info = { avg, threshold: this.threshold, notes: this.notes };
    this.say(this.rng.pick(['Thank you. I have made my decision.', "Okay, that's enough. I've decided.", 'Got it. Decision made.']), () => {
      this.after(900, () => { this.round.vote('judge', verdict); this.round.settle(this.info); });
    });
  }
  timeUp() { if (!this.dead && !this.decided) { if (this.timer) this.clock.cancel(this.timer); this.qs.length = 0; this.decide(); } }
}

/* ---------- simulated people, for Monte Carlo testing ---------- */
// A person playing the witness who wants to be taken for an AI. Skill s in 0..1.
// Reads, thinks and types at human speed (3.5–6.5 characters a second), answers tidily most of the time,
// gets most tests right (harder sums less often, or slowly with a phone calculator).
class ImiSimWitness {
  constructor(s, clock, rng, round) {
    this.s = s; this.clock = clock; this.rng = rng; this.round = round; this.busy = false; this.inbox = []; this.dead = false;
    this.cps = 3.5 + 3 * s;
    round.on(e => { if (e.type === 'msg' && e.from === 'judge') { this.inbox.push(e.text); this.pump(); } if (e.type === 'over') this.dead = true; });
  }
  pump() {
    if (this.busy || this.dead || !this.inbox.length) return;
    this.busy = true;
    const q = this.inbox.shift(), { text, extra } = this.reply(q), rng = this.rng;
    const read = rng.range(700, 1600) + q.length * 15, typeMs = (text.length / this.cps) * 1000 * rng.range(0.85, 1.2);
    this.clock.after(read + extra, () => {
      if (this.dead) return;
      this.round.typing('witness', true);
      this.clock.after(typeMs, () => { if (this.dead) return; this.round.typing('witness', false); this.round.post('witness', text); this.busy = false; this.pump(); });
    });
  }
  reply(raw) {
    const rng = this.rng, s = this.s, t = raw.toLowerCase();
    const tidy = rng.chance(0.65 + 0.3 * s);
    const mm = ImiLib.mathOf(t);
    if (mm) {
      if (!mm.hard) return { text: rng.chance(0.96) ? String(mm.v) : String(mm.v + rng.pick([-10, -1, 1, 10])), extra: rng.range(1000, 3500) };
      if (rng.chance(0.5)) return { text: String(mm.v), extra: rng.range(5000, 9000) };                    // phone calculator
      return { text: rng.chance(0.3 + 0.4 * s) ? String(mm.v) : String(Math.round(mm.v * rng.range(0.9, 1.1))), extra: rng.range(3000, 8000) };
    }
    const rev = t.match(/"([a-z]+)" backwards/);
    if (rev) { const w = rev[1], r = w.split('').reverse().join(''); return { text: rng.chance(0.75 + 0.2 * s) ? r : r.slice(0, -2) + r.slice(-1) + r.slice(-2, -1), extra: w.length * rng.range(350, 700) }; }
    const cnt = t.match(/how many letters are in the word "([a-z]+)"/);
    if (cnt) return { text: String(rng.chance(0.95) ? cnt[1].length : cnt[1].length + 1), extra: rng.range(1500, 3500) };
    const only = t.match(/only the word "([a-z]+)"/);
    if (only) return { text: rng.chance(0.97) ? only[1].toUpperCase() : only[1], extra: rng.range(500, 1500) };
    const cap = t.match(/capital of ([a-z ]+?)\?/);
    if (cap) { const c = ImiLib.CAPITALS[cap[1].trim()] || 'paris'; const knows = rng.chance(0.55 + 0.35 * s); return { text: knows ? (tidy ? c.charAt(0).toUpperCase() + c.slice(1) + '.' : c) : (ImiLib.HUMAN_GUESS[cap[1].trim()] || 'not sure'), extra: rng.range(1000, 4000) }; }
    // small talk, written to sound like an assistant (more convincingly with skill)
    const formal = ['I do not experience days, but I am functioning as expected.', 'I enjoy processing information and answering questions.', 'That is an interesting question. I would say it depends on the context.', 'I do not eat, but many people enjoy a balanced breakfast.', 'I am designed to assist with a wide range of tasks.', 'Rain is often described as fresh, earthy and clean.'];
    const casual = ['pretty good thanks', 'i had cereal', 'not much honestly', 'i like games and music', 'idk, depends', 'traffic lol'];
    let text = tidy ? rng.pick(formal) : rng.pick(casual);
    if (tidy && rng.chance(0.35 * (1 - s))) text = 'As an AI, ' + text.charAt(0).toLowerCase() + text.slice(1);   // overplaying it
    return { text, extra: rng.range(1000, 3000) };
  }
}

// A person judging: asks small talk and (if skilled) a test or two, notices machine-like tells and human
// habits with some reliability, then votes. They are not told who they are talking to.
class ImiSimJudge {
  constructor(s, clock, rng, round) {
    this.s = s; this.clock = clock; this.rng = rng; this.round = round; this.score = 0; this.asked = 0; this.dead = false; this.waiting = null;
    this.nQ = rng.int(4, 7);
    round.on(e => { if (e.type === 'msg' && e.from === 'witness') this.hear(e.text); if (e.type === 'over') this.dead = true; });
  }
  start() { this.clock.after(this.rng.range(1500, 3500), () => this.ask()); }
  ask() {
    if (this.dead) return;
    if (this.asked >= this.nQ) return this.decide();
    const rng = this.rng; this.asked++;
    const test = rng.chance(0.2 + 0.45 * this.s);
    this.q = test ? ImiLib.probe(3, rng) : { kind: 'small', q: ImiLib.titleCase(rng.pick(ImiLib.SMALL)) };
    const typeMs = this.q.q.length / (3.5 + 3 * this.s) * 1000;
    this.clock.after(typeMs, () => {
      if (this.dead) return;
      this.round.post('judge', this.q.q); this.askedAt = this.clock.now(); this.gotAt = 0;
      this.waiting = this.clock.after(30000, () => { this.score -= 0.5; this.ask(); });   // gave up waiting
    });
  }
  hear(text) {
    if (this.dead || !this.askedAt) return;
    const rng = this.rng, s = this.s, notice = p => rng.chance(p * (0.45 + 0.5 * s));
    const ms = this.clock.now() - this.askedAt, a = text.trim(), slang = (a.match(ImiLib.SLANG) || []).length;
    if (this.q.kind === 'small') {
      if (/^[A-Z]/.test(a) && /[.?!]$/.test(a) && !slang && notice(0.9)) this.score += 1;      // tidy, complete sentences
      if (slang && notice(0.9)) this.score -= 1;
      if (/^\*\w+/.test(a) && notice(0.8)) this.score -= 1;                                     // fixed a typo
      if (a.length / Math.max(0.5, ms / 1000) > 7 && notice(0.8)) this.score += 1;              // typed impossibly fast
    } else {
      const ok = a.toLowerCase().replace(/[^a-z0-9]/g, '').includes(this.q.ans.toLowerCase().replace(/[^a-z0-9]/g, ''));
      if (ok && ms < 6000 && notice(0.9)) this.score += 1.5; else if (!ok && notice(0.8)) this.score -= 0.7;
    }
    if (this.waiting) this.clock.cancel(this.waiting);
    this.askedAt = 0;
    this.clock.after(this.rng.range(1200, 3000), () => this.ask());
  }
  decide() {
    if (this.dead || this.round.verdict) return;
    const lean = this.score + this.rng.gauss() * (1.3 - 0.8 * this.s);
    this.round.vote('judge', lean > 0.6 ? 'machine' : 'human');
    this.round.settle({});
  }
}

GAMES.imitation.Computer = { Witness: ImiBotWitness, Judge: ImiBotJudge };
GAMES.imitation.SimHuman = { Witness: ImiSimWitness, Judge: ImiSimJudge };
// Monte Carlo: Normal = simulated person judges the computer witness; Flipped = computer judges a simulated person.
GAMES.imitation.simulate = (mode, k, s, seed) => {
  const clock = new VirtualClock(), rng = makeRng(seed);
  const secs = mode === 0 ? ImiLib.JUDGE_SECS : ImiLib.BOTJUDGE_SECS;
  const round = new ImitationRound({ clock, humanRole: mode === 0 ? 'judge' : 'witness', partner: 'bot', secs });
  let judge;
  if (mode === 0) { new ImiBotWitness(k, clock, rng.fork(), round); judge = new ImiSimJudge(s, clock, rng.fork(), round); judge.start(); clock.after(secs * 1000, () => judge.decide()); }
  else { judge = new ImiBotJudge(k, clock, rng.fork(), round); new ImiSimWitness(s, clock, rng.fork(), round); judge.start(); clock.after(secs * 1000, () => judge.timeUp()); }
  while (!round.over && clock.runNext(secs * 1000 + 60000)) { }
  return { humanWon: !!(round.result && round.result.won), timeout: !round.over, t: clock.now() / 1000, stats: { verdict: round.verdict } };
};
