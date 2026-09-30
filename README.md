# Last Train North

A 3D isometric survival/strategy browser game. You don't control a person, you control the train:
it is your vehicle, base, inventory, weapon and health bar. Keep it moving north to the Evacuation Station.

## Run

```bash
python -m http.server 8080
```

Open <http://localhost:8080>. No build step. Three.js loads from the jsDelivr CDN, so the first load needs internet.

## Controls

| Key | Action |
| --- | --- |
| `W` / `↑` | Throttle |
| `S` / `↓` | Brake; hold while stopped to reverse |
| `A` / `D` (`←` / `→`) | Choose the branch at the next junction |
| `Space` | Fire the turret at the nearest enemy in range |
| `E` | Context action: salvage, clear or repair track, couple a carriage |
| `R` | Patch the hull (costs Parts) |
| `F` | Burn Supplies in the firebox for Fuel |
| `Esc` | Pause / resume |
| Mouse wheel | Zoom |

## Objective

Reach the **Northern Evacuation Station** and stop at its platform. On the way:

- **Fuel** burns while the engine works. Coast when you can, and stop at orange beacons to refuel.
- **Junctions** give real choices: short and dangerous routes, or long and safe ones, plus a dead-end rail yard that holds a fuel tanker.
- **Hazards**: slow below 22 km/h for debris. Barricades, rockfalls and damaged track block the line and must be cleared with `E`.
- **Enemies**: raiders in the south and industrial belt, crawlers in the snow. Ammo is scarce, and far shots miss more often.
- **Carriages** (Fuel Tanker, Armored Car, Cargo Car) can be found and coupled. Each one visibly joins the train and changes its stats.
- **Score** rewards distance, supplies delivered, kills, salvage and arriving in good shape.

A typical successful run takes 9–13 minutes.

## Features

- **Two locomotives** (Settings): the *Ironclad* armored steam engine (tough, heavy cannon) and the *Vanguard* diesel (faster, frugal, twin machine guns, thinner armor).
- **Five regions** along the line: forest farmland, desert dust flats, the industrial belt, rocky canyons and the frozen north. Each has its own terrain, props, lighting and weather.
- **Fog of war**: you can see further ahead (headlight) than to the sides or behind. Visibility shrinks in smog and snow.
- **Train crew**: when you salvage, repair, clear track or couple a car, crew members climb down and do the work. They hammer, dig and carry crates back to the train.
- **Leaderboard**: every finished run, win or loss, is saved locally and ranked five ways (score, fastest victory, supplies, kills, distance).
- **Settings**: locomotive choice and an FPS counter, saved in your browser.
- **Sound**: CC0/CC-BY samples. Rolling rumble and rail-joint clacks follow speed, steam chuffs are locked to wheel revolutions, and the diesel drone follows the throttle. See `assets/audio/CREDITS.md`.

## Project layout

- `index.html`, `style.css`: page, HUD and menus
- `src/config.js`: all tuning values, the track network, and per-run content and events
- `src/game.js`: state machine, main loop, interaction, combat and events
- `src/train.js`, `src/track.js`, `src/world.js`, `src/enemies.js`, `src/content.js`: simulation and world systems
- `src/models.js`, `src/prefabs.js`: procedural low-poly models
- `src/assets.js`: texture loading and the triplanar detail material
- `src/postfx.js`: fog of war and bloom post-processing
- `src/crew.js`: animated train crew
- `src/leaderboard.js`: local high-score tables
- `assets/`: textures, sprites, icons, HUD art, locomotive cards and key art generated with the Codex CLI. `assets/raw/` holds the originals.
- `assets/audio/`: sound effects from OpenGameArt (CC0 / CC-BY). Credits are in `assets/audio/CREDITS.md`.
- `tools/process_assets.py`: converts `assets/raw/*` into the web-ready files (needs Pillow and numpy)
