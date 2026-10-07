// node tools/quick.js <game> <mode> <k> <s> <runs>   -> human win rate
const { load } = require('./load');
const [game, mode, k, s, n] = process.argv.slice(2);
const E = load(); let w = 0, t = 0, to = 0; const t0 = Date.now(); const st = [];
for (let i = 0; i < +n; i++) { const r = E.simulateMatch(game, +mode, +k, +s, 1000 + i); w += r.humanWon ? 1 : 0; t += r.t; to += r.timeout ? 1 : 0; if (i < 4) st.push(JSON.stringify(r.stats)); }
console.log(`${game} mode ${mode} k=${k} s=${s}: human wins ${w}/${n} (${(100 * w / n).toFixed(0)}%), avg game ${(t / n).toFixed(0)}s, timeouts ${to}, ${((Date.now() - t0) / n).toFixed(1)} ms/game  e.g. ${st.join(' ')}`);
