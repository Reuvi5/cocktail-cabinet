// node tools/why.js <game> <mode> <k> <s> <n>  -> distribution of end stats
const { load } = require('./load'); const E = load(); const [g, mode, k, s, n] = process.argv.slice(2); const tally = {};
for (let i = 0; i < +n; i++) { const r = E.simulateMatch(g, +mode, +k, +s, 5000 + i); const key = JSON.stringify(r.stats) + (r.humanWon ? ' WIN' : ''); tally[key] = (tally[key] || 0) + 1; }
console.log(Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([a, b]) => `${String(b).padStart(3)}  ${a}`).join('\n'));
