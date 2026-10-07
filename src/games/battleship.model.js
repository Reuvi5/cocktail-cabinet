/* =====================================================================
   BATTLESHIP — MODEL. Two admirals; blue (side 0) fires first.
   Actions:  { fleet: [{x,y,len,hor}, ...] }   during placement
             { fire: {x,y} }                    on your turn
   shots[s][y][x]: what side s knows about the enemy grid — 0 unknown, 1 miss, 2 hit, 3 sunk
   ===================================================================== */
const BsLib = (() => {
  const N = 10, FLEET = [5, 4, 3, 3, 2], NAMES = { 5: 'Carrier', 4: 'Battleship', 3: 'Cruiser', 2: 'Destroyer' };
  const grid = () => Array.from({ length: N }, () => new Array(N).fill(0));
  const cellName = (x, y) => 'ABCDEFGHIJ'[x] + (y + 1);
  function canPlace(ships, x, y, len, hor, noTouch) {
    for (let k = 0; k < len; k++) {
      const cx = x + (hor ? k : 0), cy = y + (hor ? 0 : k);
      if (cx < 0 || cy < 0 || cx >= N || cy >= N) return false;
      for (const s of ships) for (const c of s.cells) {
        if (c.x === cx && c.y === cy) return false;
        if (noTouch && Math.abs(c.x - cx) <= 1 && Math.abs(c.y - cy) <= 1) return false;
      }
    }
    return true;
  }
  function mkShip(x, y, len, hor) { const cells = []; for (let k = 0; k < len; k++) cells.push({ x: x + (hor ? k : 0), y: y + (hor ? 0 : k), hit: false }); return { x, y, len, hor, cells, sunk: false }; }
  function randomFleet(rng, noTouch) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const ships = []; let ok = true;
      for (const len of FLEET) {
        let placed = false;
        for (let t = 0; t < 300 && !placed; t++) { const hor = rng.chance(0.5), x = rng.int(0, N - 1), y = rng.int(0, N - 1); if (canPlace(ships, x, y, len, hor, noTouch)) { ships.push(mkShip(x, y, len, hor)); placed = true; } }
        if (!placed) { ok = false; break; }
      }
      if (ok) return ships;
    }
    return randomFleet(rng, false);
  }
  // checks a submitted fleet: right ship sizes, on the board, no overlaps
  function validFleet(list) {
    if (!Array.isArray(list) || list.length !== FLEET.length) return null;
    const lens = list.map(s => s.len).sort((a, b) => b - a);
    if (lens.join() !== FLEET.slice().sort((a, b) => b - a).join()) return null;
    const ships = [];
    for (const s of list) { if (!canPlace(ships, s.x, s.y, s.len, s.hor, false)) return null; ships.push(mkShip(s.x, s.y, s.len, s.hor)); }
    return ships;
  }
  return { N, FLEET, NAMES, grid, cellName, canPlace, mkShip, randomFleet, validFleet };
})();

class BattleshipModel extends BaseModel {
  constructor(o) {
    super(o);
    this.fleets = [null, null]; this.shots = [BsLib.grid(), BsLib.grid()];
    this.turn = 0; this.phase = 'place'; this.wait = 0; this.lastShot = [null, null]; this.count = [0, 0];
  }
  remaining(side) { return this.fleets[side] ? this.fleets[side].filter(s => !s.sunk).map(s => s.len) : []; }
  step(dt, acts) {
    this.time += dt;
    if (this.phase === 'place') {
      for (let s = 0; s < 2; s++) if (!this.fleets[s] && acts[s] && acts[s].fleet) { const f = BsLib.validFleet(acts[s].fleet); if (f) { this.fleets[s] = f; this.emit('placed', { side: s }); } }
      if (this.fleets[0] && this.fleets[1]) { this.phase = 'battle'; this.emit('battle', {}); }
      return;
    }
    if (this.phase !== 'battle') return;
    if (this.wait > 0) { this.wait -= dt; if (this.wait <= 0) { this.turn = 1 - this.turn; this.emit('turn', { side: this.turn }); } return; }
    const a = acts[this.turn];
    if (a && a.fire) this.fire(this.turn, a.fire.x, a.fire.y);
  }
  fire(s, x, y) {
    const g = this.shots[s];
    if (x < 0 || y < 0 || x >= BsLib.N || y >= BsLib.N || g[y][x] !== 0) return;
    const enemy = this.fleets[1 - s]; let hitShip = null;
    for (const sh of enemy) for (const c of sh.cells) if (c.x === x && c.y === y) { c.hit = true; hitShip = sh; }
    this.lastShot[s] = { x, y }; this.count[s]++;
    let outcome = 'miss';
    if (!hitShip) { g[y][x] = 1; this.sfx(220, 0.1, 'triangle'); }
    else {
      g[y][x] = 2; this.boom(0.3, 0.07); outcome = 'hit';
      if (hitShip.cells.every(c => c.hit)) { hitShip.sunk = true; for (const c of hitShip.cells) g[c.y][c.x] = 3; outcome = 'sunk'; }
    }
    this.emit('shot', { side: s, x, y, outcome, ship: hitShip ? BsLib.NAMES[hitShip.len] : null });
    if (enemy.every(sh => sh.sunk)) { this.phase = 'done'; return this.finish(s, (s ? 'RED' : 'BLUE') + ' FLEET WINS!', `Every enemy ship sunk in ${this.count[s]} shots.`); }
    this.wait = 0.5;
  }
}

GAMES.battleship = {
  id: 'battleship', Model: BattleshipModel, maxTime: 400,
  modes: [{ ctrl: ['human', 'cpu'] }, { ctrl: ['human', 'human'] }],
  stats: m => ({ shots: m.count[0] + m.count[1] }),
};
