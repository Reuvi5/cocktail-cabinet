# Cocktail Cabinet — source and balance tools

`index.html` is the whole site (one static file). It is **built** from the files in `src/`
by `src/build.py`. Upload only `index.html` to Netlify.

## How the code is organised (MVC)

Every game is split into three parts:

| Part | File | What it does | Touches the page? |
|---|---|---|---|
| **Model** | `src/games/<game>.model.js` | The rules and the game state. `model.step(dt, actions)` moves the game forward; `model.result` says who won. | No |
| **Controllers** | `src/games/<game>.ai.js` | Decide each side's moves. `Computer(side, k)` is the opponent (strength `k` from 0 to 1). `SimHuman(side, s)` is a *model of a person* (skill `s`) used only for testing. | No |
| **View** | `src/games/<game>.view.js` | Draws the model on the canvas, and `Human` turns your keyboard and mouse into actions. | Yes |

`src/engine.js` holds the shared pieces: a seeded random-number generator, the base
model, and `simulateMatch()`, which plays one game with no screen.
`src/ui.js` runs the page: each tick it asks every controller for an action, steps the
model, then hands the model's events (sounds, explosions) to the view.

Imitation is a chat, so its model is a `ImitationRound` running on a clock
(`VirtualClock` in tests, real time on the page).

Geo Pool (game 8) follows the same split. `pool.model.js` holds the three tables (hexagon,
cross, ellipse), the ball physics and the 8-ball rules. The physics rewinds every ball-on-ball
hit to the exact moment of contact, so the aim guide is exact. `pool.ai.js` holds the shot-finding
brain shared by the computer and the simulated person. A stronger computer aims steadier,
checks its best shots on a copy of the table, plays for its next shot, and at the top levels
imagines banks and combinations. It never moves a ball. The ellipse's single focus pocket uses
real geometry: the ball centres follow an ellipse, so any ball rolled over the marked focus
bounces off the cushion into the pocket at the other focus.

## The simulated person

Each `SimHuman` plays a sensible strategy but has human limits, set by skill `s`
(novice 0.25, average 0.5, expert 0.8): reaction time of about 0.2–0.3 s, aiming error,
a top hand speed, occasional misreads and lapses of attention, and human typing speed
in Imitation. These numbers are assumptions; change them in the `*.ai.js` files.

## Monte Carlo calibration

Requires Node.js 18+.

```
node tools/calibrate.js                      # every game (about 20 minutes on 2 cores)
node tools/calibrate.js --games snake,flappy  # just some games
node tools/calibrate.js --n 400 --nv 300      # more games per point = smaller error bars
python3 src/build.py                          # rebuild index.html with the new table (run from src/)
```

For each game and mode the tool:

1. **Sweeps** computer strength `k = 0, 0.1 … 1` (plus extra points where the curve is steep),
   playing `--n` games at each against the average simulated person. Win rates are forced to
   be non-increasing in `k` (isotonic regression).
2. **Calibrates** each level 1–10 by finding the `k` where the average person's win rate hits
   the target: 85% at level 1 sliding evenly to 15% at level 10 (`TARGET` in `engine.js`).
3. **Validates** with fresh games (`--nv` per cell) at every level against novice, average and
   expert simulated people, with 95% (Wilson) confidence intervals.

Results go to `src/calibration.json`, which the build embeds in the page. The site's
**Balance Lab** (`#lab`) charts them and can run new simulations live in the browser.

Quick checks while tuning:

```
node tools/quick.js breakout 0 0.5 0.5 100   # game, mode, computer k, player skill, games
node tools/why.js snake 0 1 0.5 100          # how games end
```

## Where to tune

* **Rules** (affect both sides): constants and getters at the top of each `*.model.js`
  (speeds, gap sizes, waves, budgets).
* **Computer strength** (what `k` does): the `Computer` class in each `*.ai.js`.
* **The simulated person**: the `SimHuman` class in each `*.ai.js`.
* **Target curve**: `TARGET` in `src/engine.js`.

After any change, re-run `tools/calibrate.js` for that game and rebuild.
