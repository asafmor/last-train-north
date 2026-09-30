# Trailer tooling

Source for the Last Train North trailer, built with [Remotion](https://www.remotion.dev).

```bash
npm install
python -m http.server 8080 --directory ..   # serve the game (in another terminal)
node scripts/capture.mjs                    # record gameplay clips (autopilot drives the real game at a fixed 30 fps)
npx remotion studio remotion/index.ts       # preview / edit
./scripts/publish.sh                        # render ../media/trailer.mp4, GIF preview and poster
```

- `scripts/capture.mjs`: clip list (route, locomotive, start condition, framing and HUD mode)
- `scripts/autopilot.js`: the bot that plays the game during capture
- `remotion/Trailer.tsx`: scenes, captions, transitions and sound design
- `public/`: art copied from `../assets`; music and SFX from OpenGameArt (CC0), see `../assets/audio/CREDITS.md`
