# Building a Browser Game with a Coding Agent

A field guide for coding agents building a complete, polished browser game, from an empty folder to a published game with a trailer. It is deliberately generic: the advice applies to any genre. Each section ends with links to the full documentation.

## 1. Pick the smallest stack that ships

- **No build step.** Use plain ES modules plus an [import map](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script/type/importmap) that loads libraries from a CDN ([jsDelivr](https://www.jsdelivr.com/)). Then `python -m http.server` is the whole dev environment, and GitHub Pages hosts it as-is.
- **3D:** [Three.js](https://threejs.org/docs/) ([manual](https://threejs.org/manual/), [examples](https://threejs.org/examples/)). **2D:** Canvas 2D, or [Phaser](https://docs.phaser.io/) / [PixiJS](https://pixijs.com/guides).
- Pin library versions in the import map, so a CDN update can't break the game.
- Add a visible error screen for load failures (CDN down, WebGL unavailable). A blank page is the worst bug report.

## 2. Structure the code

Keep the module boundaries boring:

| Module | Responsibility |
| --- | --- |
| `config.js` | **Every** tuning number, plus content tables (levels, enemies, items). Balancing should never touch logic files. |
| `game.js` | State machine (`MENU → PLAYING ⇄ PAUSED → DYING → GAME_OVER / VICTORY`), main loop, and wiring between systems. |
| One file per system | Player/vehicle, world/level, enemies, effects, audio, UI, post-processing. Each exposes `update(dt)` and owns its own scene objects. |
| `ui.js` | Pure DOM: HTML/CSS HUD and menus layered over the canvas. This is far easier to style and keep crisp than in-canvas UI. |
| `util.js` | RNG, noise, geometry helpers, math. |

Rules that saved time:

- **One explicit state machine.** Input, audio and the loop all branch on `game.state`. Most "the game still runs behind the menu" bugs come from implicit state.
- **Clamp `dt`** (for example `Math.min(dt, 0.05)`) so tab-switching or a slow frame can't launch objects through walls.
- **Expose the game for tests:** set `window.__game = game` and a `window.__ready = true` flag once assets load. Every automated check and the trailer capture depend on these.
- **Seeded RNG** for procedural content, so runs are reproducible and bugs can be replayed.
- **Persist small things in `localStorage`** (settings, leaderboard) with `try/catch` and schema checks. Storage can be full, disabled or corrupted.
- **Performance:** merge static geometry, use `InstancedMesh` for repeated props, chunk the world and cull by distance, reuse particle buffers, and dispose geometry/materials on restart. Watch `renderer.info.render.calls`. See the [Three.js performance tips](https://discoverthreejs.com/tips-and-tricks/).
- **Handle `resize`** and cap `devicePixelRatio` (around 2).

## 3. Visuals: procedural first, generated textures second

- Build models procedurally from primitives with vertex colours, then merge them ([`BufferGeometryUtils.mergeGeometries`](https://threejs.org/docs/#examples/en/utils/BufferGeometryUtils)). This gives zero asset loading, a consistent style, and is easy to vary.
- Add surface detail with **triplanar-mapped tiling textures** injected via [`material.onBeforeCompile`](https://threejs.org/docs/#api/en/materials/Material.onBeforeCompile). This needs no UVs.
  - Sample in **object space** for moving models. In world space the texture "swims" across them.
  - Sample in world space for static scenery.
- Use `MeshStandardMaterial` plus an environment map ([`PMREMGenerator`](https://threejs.org/docs/#api/en/extras/PMREMGenerator) + `RoomEnvironment`) so metal reads as metal.
- For post-processing, use [`EffectComposer`](https://threejs.org/docs/#manual/en/introduction/How-to-use-post-processing) (bloom, custom fog or vignette passes). **Guard against NaN in custom shaders:** guard every `normalize`/division, and `pow` with a negative base. A single NaN pixel gets smeared by bloom into big black rectangles, and these often appear only on some GPUs.

## 4. Generate image assets with the Codex CLI

The [Codex CLI](https://developers.openai.com/codex/cli) can create images non-interactively with its built-in image tool. See [`docs/codex-cli.md`](codex-cli.md) for setup and flags.

```bash
timeout 900 codex exec --skip-git-repo-check -s workspace-write --ephemeral \
  "Use your image generation tool to create this image: <prompt>. \
   Save the PNG to ./assets/raw/<name>.png. Do not create any other files. Reply only with the saved path." \
  < /dev/null > logs/gen_<name>.log 2>&1
```

- **`< /dev/null` is mandatory** when you run it in the background or in parallel. Otherwise `codex` waits on stdin forever.
- Run several generations in parallel (each takes about 1–3 minutes). Always use a `timeout`.
- **Prompt recipes:**
  - Textures: "seamless tileable top-down texture of …, flat even lighting, no text, square".
  - Sprites and icons: "… centred on a pure black (or flat green) background, no text".
  - UI panels: "ornate frame …, empty centre, symmetric" (for CSS `border-image`).
- **Never ship raw output.** Keep originals in `assets/raw/` and write one reproducible script (Python + [Pillow](https://pillow.readthedocs.io/)/numpy) that:
  - resizes;
  - makes textures tile (cross-fade the edges) and normalises their brightness, so they multiply cleanly with vertex colours;
  - keys out backgrounds to alpha and trims halos;
  - exports JPG for opaque images and PNG/WebP for alpha.
- **Verify every asset visually, in-game.** Open the image file, then take an in-game screenshot. Generators add text, frames and drop shadows you did not ask for.
- Load textures with a fallback placeholder, so a missing file degrades the look instead of crashing.

## 5. Find free sounds and music

| Source | Notes |
| --- | --- |
| [OpenGameArt.org](https://opengameart.org) | Mostly CC0/CC-BY. Packs such as "100 CC0 SFX" cover most needs. |
| [Freesound.org](https://freesound.org) | Huge library, but the API needs a key. Check each sound's licence. |
| [Kenney.nl](https://kenney.nl/assets?q=audio) | CC0 UI and impact packs. |
| [Pixabay sound effects](https://pixabay.com/sound-effects/) / [music](https://pixabay.com/music/) | Free licence, no attribution required. |
| [Incompetech](https://incompetech.com/music/) | CC-BY music. |

- Prefer **CC0**. For CC-BY assets, record the author, link and licence in a `CREDITS.md` *as you download*.
- Normalise and trim with [ffmpeg](https://ffmpeg.org/ffmpeg-filters.html#loudnorm), for example `ffmpeg -i in.wav -af "silenceremove=1:0:-50dB,loudnorm" -ac 1 -c:a libvorbis -q:a 4 out.ogg`. Keep files mono and small.
- Play everything through the [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API):
  - Use one `AudioContext`, created or resumed on the first user gesture (autoplay policy).
  - Route sounds through a master gain.
  - Give looping beds (engine, ambience) pitch and gain driven by gameplay values. Speed-linked audio sells motion more than anything else.
  - Use random pitch variation on repeated SFX.
  - Keep procedural fallbacks (oscillator/noise) if a file fails to load.

## 6. Run and verify like a player

Serve with `python -m http.server 8080` and test with [Playwright](https://playwright.dev/docs/library) (`playwright-core` with a local Chromium is enough).

- **Smoke test:** load the page, wait for `window.__ready`, collect `pageerror` and console errors, take screenshots of every state.
- **Real input:** use `page.keyboard.down/up` (not direct function calls) to walk through menu → play → pause → restart → game over, plus a `setViewportSize` resize check.
- **An autopilot bot** that plays a full run through `window.__game` is the single most valuable test. It proves the game is winnable, finds soft-locks, and produces balance numbers (time, resources left). Run it for every character, route and difficulty. Also check that the naive strategy ("hold forward") *loses*.
- **Headless WebGL:** launch Chromium with `--use-angle=vulkan --enable-features=Vulkan --ignore-gpu-blocklist`. On machines without a GPU, Mesa llvmpipe is about 2× faster than the default SwiftShader. Software renderers still hide some GPU-only bugs, so ask the human to confirm visual glitches on real hardware.
- **Look at the screenshots yourself.** Many bugs (wrong winding, inverted normals, a light pointing backwards, an off-centre HUD) produce no errors.
- When you `pkill` test processes, use a pattern like `capture[.]mjs` so it doesn't match (and kill) your own shell.

## 7. UI and HUD

- Use HTML/CSS overlays: generated art via `border-image` for panels, and Google Fonts for display type.
- Project 3D positions to screen coordinates for world labels and health bars (`vector.project(camera)`).
- Lay out for **1280×720 through 4K**. Use `clamp()` and `vmin` units, and test a short viewport (`max-height` media queries) so menus don't overflow.
- Fix the size of elements whose text changes (for example THROTTLE/BRAKE), so the layout doesn't jump.
- `ctx.save()/restore()` resets canvas text alignment. Set `textAlign`/`textBaseline` immediately before each `fillText`.

## 8. Make a marketing trailer with Remotion

[Remotion](https://www.remotion.dev/docs) renders React components to MP4. Start with the [fundamentals](https://www.remotion.dev/docs/the-fundamentals), [animating properties](https://www.remotion.dev/docs/animating-properties), [transitions](https://www.remotion.dev/docs/transitions), [audio](https://www.remotion.dev/docs/using-audio), [Google Fonts](https://www.remotion.dev/docs/google-fonts) and [rendering](https://www.remotion.dev/docs/render).

1. **Capture deterministic gameplay.**
   - Drive the real game with the autopilot in Playwright.
   - Freeze real time: stub the clock, then step the simulation by exactly `1/30` s per frame and screenshot each frame.
   - Encode with ffmpeg: `ffmpeg -framerate 30 -i f_%05d.jpg -c:a none -c:v libx264 -crf 18 -pix_fmt yuv420p clip.mp4`.
   - This gives smooth 30 fps footage even when headless rendering runs at 3 fps.
2. **Frame for the viewer.**
   - Hide or shrink the HUD during capture (inject CSS). Large panels hide the action in a video.
   - Move the camera closer to the action than in normal play.
   - Seek to interesting moments with conditions (a fight, a biome change, a victory) instead of fixed times.
3. **Compose the trailer.**
   - Structure: cold open → logo → 4–8 short gameplay beats with one-line captions → feature cards → climax → call to action with the URL.
   - Use `TransitionSeries` with fades and slides, and `spring()` for text.
   - Music and SFX come from the same free sources (credit them).
   - Keep it 45–60 s.
4. **Render and publish.**
   - Run `npx remotion render`, then ffmpeg to:
     - produce a web MP4 (`-movflags +faststart`, about 1600 px wide);
     - produce a small GIF preview for the README (`fps=10,scale=640`, palettegen, under 5 MB);
     - extract a poster frame.
   - Check stills of the transition and end frames (`npx remotion still … --frame=N`). Overlaps hide there.
5. Keep raw captures out of git (`.gitignore`). Commit only the final media.

## 9. Publish

```bash
gh repo create <name> --public --source . --push
touch .nojekyll                       # serve files/folders starting with _ as-is
gh api repos/<owner>/<name>/pages -X POST -f 'source[branch]=main' -f 'source[path]=/'
gh api repos/<owner>/<name>/pages/builds/latest --jq .status   # wait for "built"
```

- See the [GitHub Pages docs](https://docs.github.com/en/pages) and the [`gh` manual](https://cli.github.com/manual/).
- Use relative asset paths, because the site lives under `/<repo>/`.
- After deploying, run the smoke test against the **live URL**.
- Pages serves MP4 fine. Link the README GIF to the Pages-hosted MP4, since GitHub doesn't inline large repo videos.
- In the README, put the play link first, then the trailer, controls, objective, features, run instructions, and asset credits.

## 10. Definition of done (checklist)

- [ ] Every state reachable with the keyboard; no console errors across a full run
- [ ] The bot wins with every character/route; the naive strategy loses
- [ ] Every generated asset checked in-game; credits file complete
- [ ] Resize, restart, pause and audio-unlock work
- [ ] Settings and leaderboard survive reload and corrupted storage
- [ ] Live URL tested; trailer, GIF and README links return 200
- [ ] Known limitations written down honestly
