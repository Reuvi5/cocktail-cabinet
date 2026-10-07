/* =====================================================================
   IMITATION — MODEL. A timed chat between a Judge and a Witness.
   The judge votes "human" or "machine"; the round knows the truth.
   Everything runs on a Clock, so a round can be played in real time on
   the page or thousands of times per second in a simulation.
   ===================================================================== */

/* Virtual clock: after(ms, fn), cancel(id), now(). advanceTo(t) runs everything due. */
class VirtualClock {
  constructor() { this.t = 0; this.q = []; this.seq = 0; }
  now() { return this.t; }
  after(ms, fn) { const id = ++this.seq; this.q.push({ at: this.t + Math.max(0, ms), id, fn }); return id; }
  cancel(id) { this.q = this.q.filter(e => e.id !== id); }
  // run the next due event; returns false when nothing is left
  runNext(limit) {
    if (!this.q.length) return false;
    let bi = 0; for (let i = 1; i < this.q.length; i++) if (this.q[i].at < this.q[bi].at || (this.q[i].at === this.q[bi].at && this.q[i].id < this.q[bi].id)) bi = i;
    const e = this.q[bi]; if (e.at > limit) return false;
    this.q.splice(bi, 1); this.t = e.at; e.fn();
    return true;
  }
}

const ImiLib = (() => {
  const SLANG = /\b(lol|lmao|idk|omg|haha\w*|hehe|u|ur|tbh|ngl|bruh|gonna|wanna|kinda|sorta|ya|yea|nah|rn|btw|imo|smh|dunno|cuz|tho|lowkey|fr)\b/gi;
  const CAPITALS = { australia: 'canberra', canada: 'ottawa', japan: 'tokyo', france: 'paris', brazil: 'brasilia', turkey: 'ankara', italy: 'rome', egypt: 'cairo', kenya: 'nairobi', 'new zealand': 'wellington', switzerland: 'bern', spain: 'madrid', germany: 'berlin', mexico: 'mexico city', peru: 'lima', norway: 'oslo', vietnam: 'hanoi', morocco: 'rabat' };
  const HUMAN_GUESS = { australia: 'sydney?', canada: 'toronto? no wait ottawa', brazil: 'rio? no its brasilia right', turkey: 'istanbul', switzerland: 'zurich? geneva? idk', 'new zealand': 'auckland?', morocco: 'marrakesh?', vietnam: 'hanoi i think' };
  const SMALL = ["how's your day going?", 'what did you have for breakfast?', "what's something that annoyed you this week?", 'describe the smell of rain.', 'tell me about the last dream you remember.', 'what do you do for fun?', 'where are you from?', "what's your favorite food?"];
  const WORDS = { 1: ['piano', 'lemon', 'tiger', 'cloud'], 2: ['garden', 'rocket', 'window', 'silver'], 3: ['blanket', 'pumpkin', 'captain', 'thunder'], 4: ['elephant', 'computer', 'umbrella', 'triangle'], 5: ['chocolate', 'telephone', 'adventure', 'butterfly'], 6: ['imitation', 'basketball', 'strawberry', 'volleyball'] };
  const titleCase = s => s.charAt(0).toUpperCase() + s.slice(1);
  function persona(rng) {
    const p = a => rng.pick(a);
    return {
      name: p(['maya', 'jordan', 'sam', 'alex', 'priya', 'diego', 'lena', 'noah', 'zoe', 'omar', 'tess', 'kai', 'ruby', 'eli', 'nina', 'marco']), age: rng.int(17, 26),
      place: p(['ohio', 'denver', 'atlanta', 'toronto', 'austin', 'chicago', 'phoenix', 'portland', 'manchester', 'dublin', 'seattle', 'a small town in michigan']),
      job: p(['im a junior in college, bio major', 'i work at a coffee shop', 'senior in high school', 'nursing student', 'i work in a warehouse rn', 'cs student (pray for me)', 'part time retail + community college']),
      hobby: p(['skateboarding', 'drawing mostly', 'playing guitar badly', 'baking', 'video games, mostly rocket league', 'running', 'volleyball', 'reading fantasy books', 'taking photos']),
      food: p(['tacos', 'ramen', 'pizza obviously', 'sushi', 'pad thai', 'mac and cheese']),
      pet: p(['a cat named biscuit', 'a dog named pepper', 'no pets, im allergic', 'a leopard gecko lol', 'two cats who hate each other']),
      music: p(['indie stuff mostly', 'hip hop', 'taylor swift honestly', 'lofi when i study', 'metal', 'country dont judge']),
      mood: p(['tired lol', 'pretty good', 'bored', 'kinda stressed, exams', 'good! just ate']),
      breakfast: p(['just coffee', 'cereal', 'nothing lol', 'eggs and toast', 'a granola bar in the car', 'leftover pizza']),
    };
  }
  function formalize(s) {
    s = s.replace(/\b(lol|lmao|haha\w*|hehe)\b/gi, '').replace(/\bidk\b/gi, "I don't know").replace(/\bu\b/gi, 'you').replace(/\bur\b/gi, 'your')
      .replace(/\bim\b/gi, "I'm").replace(/\bdont\b/gi, "don't").replace(/\bcant\b/gi, 'cannot').replace(/\bkinda\b/gi, 'somewhat').replace(/\bgonna\b/gi, 'going to')
      .replace(/\bnah\b/gi, 'no').replace(/\byeah\b/gi, 'yes').replace(/\brn\b/gi, 'right now').replace(/\btbh\b/gi, 'to be honest').replace(/[\s,]*\bwbu\b\??/gi, '. What about you?')
      .replace(/\bi\b/g, 'I').replace(/\s+([,.?!])/g, '$1').replace(/\s+/g, ' ').replace(/^[.\s]+/, '').replace(/([.?!])\.+/g, '$1').trim();
    s = s.charAt(0).toUpperCase() + s.slice(1);
    if (!/[.?!]$/.test(s)) s += '.';
    return s;
  }
  function typo(s, rng) {
    const words = s.split(' '), cands = words.map((w, i) => i).filter(i => /^[a-z]{4,}$/.test(words[i]));
    if (!cands.length) return { s, fix: null };
    const i = rng.pick(cands), w = words[i], k = rng.int(1, w.length - 2);
    if (w[k] === w[k + 1]) return { s, fix: null };
    words[i] = w.slice(0, k) + w[k + 1] + w[k] + w.slice(k + 2);
    return { s: words.join(' '), fix: '*' + w };
  }
  function mathOf(t) {
    const m = t.replace(/,/g, '').match(/(-?\d+(?:\.\d+)?)\s*(\+|plus|-|minus|\*|x|×|times|multiplied by|\/|÷|divided by)\s*(-?\d+(?:\.\d+)?)/i);
    if (!m) return null;
    const a = +m[1], b = +m[3], op = m[2].toLowerCase();
    let v = /\+|plus/.test(op) ? a + b : /-|minus/.test(op) ? a - b : /\*|x|×|times|multi/.test(op) ? a * b : b ? a / b : NaN;
    if (!isFinite(v)) return null;
    v = Math.round(v * 100) / 100;
    return { a, b, op, v, hard: Math.abs(a) > 20 && Math.abs(b) > 9 && !/\+|plus|-|minus/.test(op) || Math.abs(a) > 200 || Math.abs(b) > 200 };
  }
  // a machine test question; harder (and with a tighter time limit) at higher L (1..6)
  function probe(L, rng) {
    L = clamp(Math.round(L), 1, 6);
    const kind = rng.pick(['math', 'math', 'rev', 'count', 'only', 'cap']), w = rng.pick(WORDS[L]);
    const limit = [26, 21, 17, 14, 12, 10][L - 1] * 1000;
    if (kind === 'math') {
      let a, b, op;
      if (L <= 1) { a = rng.int(12, 49); b = rng.int(12, 49); op = '+'; }
      else if (L === 2) { a = rng.int(35, 99); b = rng.int(35, 99); op = '+'; }
      else if (L === 3) { a = rng.int(13, 49); b = rng.int(3, 9); op = '×'; }
      else if (L === 4) { a = rng.int(13, 39); b = rng.int(11, 19); op = '×'; }
      else { a = rng.int(21, 79); b = rng.int(12, 29); op = '×'; }
      return { kind, q: `Quick one: what is ${a} ${op} ${b}?`, ans: String(op === '+' ? a + b : a * b), limit, hard: op === '×' && b > 9 };
    }
    if (kind === 'rev') return { kind, q: `Spell the word "${w}" backwards.`, ans: w.split('').reverse().join(''), limit };
    if (kind === 'count') return { kind, q: `How many letters are in the word "${w}"?`, ans: String(w.length), limit };
    if (kind === 'only') { const x = rng.pick(['banana', 'orbit', 'marble', 'pickle', 'glacier']); return { kind, q: `Reply with only the word "${x}" in capital letters.`, ans: x.toUpperCase(), limit }; }
    const c = rng.pick(Object.keys(CAPITALS)); return { kind, q: `What's the capital of ${c.replace(/\b\w/g, m => m.toUpperCase())}?`, ans: CAPITALS[c], limit };
  }
  return { SLANG, CAPITALS, HUMAN_GUESS, SMALL, titleCase, persona, formalize, typo, mathOf, probe, JUDGE_SECS: 120, BOTJUDGE_SECS: 180 };
})();

/* One round of chat. Players talk to it; anyone (the view, the other player) can listen. */
class ImitationRound {
  constructor({ clock, humanRole, partner, secs }) {
    this.clock = clock; this.humanRole = humanRole;     // 'judge' | 'witness' | 'mutual'
    this.partner = partner;                              // 'bot' | 'net'
    this.msgs = []; this.listeners = []; this.verdict = null; this.theirVerdict = null; this.over = false;
    this.endsAt = clock.now() + secs * 1000; this.result = null;
  }
  on(fn) { this.listeners.push(fn); }
  emit(e) { for (const f of this.listeners.slice()) f(e); }
  post(from, text) { if (this.over) return; const m = { from, text, t: this.clock.now() }; this.msgs.push(m); this.emit({ type: 'msg', ...m }); }
  typing(from, on) { if (!this.over) this.emit({ type: 'typing', from, on }); }
  sys(text) { this.emit({ type: 'sys', text }); }
  // the judge's verdict about the witness ('human' | 'machine')
  vote(from, v) {
    if (this.over) return;
    if (from === 'judge') this.verdict = v; else this.theirVerdict = v;
    this.emit({ type: 'vote', from, v });
  }
  timeLeft() { return Math.max(0, this.endsAt - this.clock.now()); }
  // the human player's result: did they win?
  settle(extra) {
    if (this.over) return; this.over = true;
    const truth = this.humanRole === 'witness' ? 'human' : this.partner === 'net' ? 'human' : 'machine';
    let won = null;
    if (!(extra && (extra.left || extra.noVote))) won = this.humanRole === 'witness' ? this.verdict === 'machine' : this.verdict === truth;
    this.result = Object.assign({ won, truth, verdict: this.verdict, theirVerdict: this.theirVerdict }, extra || {});
    this.emit({ type: 'over', result: this.result });
  }
}

GAMES.imitation = { id: 'imitation', dom: true, modes: [{ ctrl: ['human', 'cpu'] }, { ctrl: ['cpu', 'human'] }] };
