// Loads the pure game code (engine + every *.model.js and *.ai.js) into a sandbox, exactly as the page runs it.
const fs = require('fs'), vm = require('vm'), path = require('path');
const SRC = path.join(__dirname, '..', 'src');
const ORDER = ['snake', 'breakout', 'flappy', 'asteroids', 'missile', 'imitation', 'battleship', 'pool'];
function pureFiles() {
  const out = ['engine.js'];
  for (const g of ORDER) for (const part of ['model', 'ai']) { const f = `games/${g}.${part}.js`; if (fs.existsSync(path.join(SRC, f))) out.push(f); }
  return out;
}
function load(calibration) {
  const ctx = vm.createContext({ console });
  for (const f of pureFiles()) vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
  if (calibration) vm.runInContext('CALIBRATION = ' + JSON.stringify(calibration), ctx);
  return vm.runInContext('({ GAMES, simulateMatch, TARGET, PLAYER_PROFILES, makeRng })', ctx);
}
module.exports = { load, pureFiles, ORDER, SRC };
