// Captures deterministic gameplay clips for the trailer: the autopilot drives the real game,
// the sim is stepped at exactly 30 fps and every frame is screenshotted, then encoded with ffmpeg.
// Usage: node scripts/capture.mjs [clipName ...]   (game must be served on http://localhost:8080)
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const ROOT = path.dirname(new URL(import.meta.url).pathname) + '/..';
const CHROME = process.env.CHROME || `${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`;
const W = 1280, H = 720, FPS = 30;
const A = { S1: 0, S2: 1, I1: 0, N1: 1 }, B = { S1: 1, S2: 0, I1: 1, N1: 0 };

// seek: JS condition (g = game, t = train) to fast-forward to; setup: JS run before recording.
const CLIPS = {
  depart: { train: 'ironclad', plan: A, seek: 't.speed > 1', frames: 150, zoom: 0.62 },
  crew: { train: 'ironclad', plan: A, seek: "g.action && g.crew.workers.length && g.action.label.includes('Salvag') && g.stats.time > 60", frames: 150, zoom: 0.42,
    focus: 'g.crew.job ? t.pos.clone().lerp(g.crew.job.target, 0.6) : null' },
  junction: { train: 'ironclad', plan: A, seek: "t.seg.id === 'S1' && t.dist > 300", frames: 150, zoom: 0.95, hud: 'mini', ahead: 14 },
  desert: { train: 'vanguard', plan: B, seek: "t.seg.id === 'B' && t.dist > 125", frames: 210, zoom: 0.85, hud: 'mini' },
  factory: { train: 'ironclad', plan: A, seek: "t.seg.id === 'C' && t.dist > 95", frames: 210, zoom: 0.9 },
  snow: { train: 'ironclad', plan: A, seek: "t.seg.id === 'N1' && t.dist > 150", frames: 180, zoom: 0.8 },
  canyon: { train: 'vanguard', plan: B, seek: "t.seg.id === 'D' && t.dist > 560", frames: 150, zoom: 0.75 },
  boom: { train: 'vanguard', plan: B, seek: "t.seg.id === 'B' && t.dist > 170 && g.enemies.some(e => e.alive && e.state === 'chase')", frames: 150, zoom: 0.8,
    setup: 'g.train.health = 0;' }, // destruction sequence starts on the first frame
  arrival: { train: 'ironclad', plan: A, seek: "t.seg.id === 'N2' && t.dist > t.seg.length - 230", frames: 210, zoom: 0.9 },
};

// Vulkan (llvmpipe when there is no GPU passthrough) renders ~2x faster than SwiftShader here.
const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist'] });
const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CLIPS);
for (const name of names) {
  const clip = CLIPS[name];
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => console.log('PAGEERROR', name, e.message));
  await page.addInitScript((t) => localStorage.setItem('ltn-settings', JSON.stringify({ train: t, fps: false })), clip.train);
  await page.goto('http://localhost:8080/');
  await page.waitForFunction(() => window.__ltnReady);
  await page.addScriptTag({ content: fs.readFileSync(`${ROOT}/scripts/autopilot.js`, 'utf8') });
  // Freeze real time: from now on only our fixed 30 fps steps advance the game.
  const found = await page.evaluate(({ clip }) => {
    const g = window.__game;
    g.clock.getDelta = () => 0;
    window.__render = () => { const u = g.update; g.update = () => {}; g.frame(1 / 30); g.update = u; };
    const cond = new Function('g', 't', `return ${clip.seek};`);
    window.runBot({ plan: clip.plan, cruise: 14, maxSteps: 1, noSnap: true });
    for (let i = 0; i < 30 * 60 * 15; i++) {
      if (cond(g, g.train)) break;
      window.runBot({ plan: clip.plan, cruise: 14, maxSteps: 1, resume: true, noSnap: true });
      if (g.state !== 'PLAYING') return 'ended:' + g.state;
    }
    if (clip.setup) new Function('g', clip.setup)(g);
    // HUD: 'none' (default) hides the panels but keeps in-world markers/health bars/floaters;
    // 'mini' shrinks the panels into the corners so gameplay stays visible.
    const css = document.createElement('style');
    const panels = '#resources, #console, #objpanel, #prompt, #hazard-warn, #messages, #junction';
    css.textContent = clip.hud === 'mini'
      ? `#resources { transform: scale(.62); transform-origin: left top; } #console { transform: scale(.55); transform-origin: left bottom; }
         #objpanel { transform: scale(.55); transform-origin: right top; } #junction { transform: translateX(-50%) scale(.7); transform-origin: center top; }
         #prompt { transform: translateX(-50%) scale(.7); transform-origin: center bottom; left: 50%; } #hazard-warn { transform: translateX(-50%) scale(.7); top: 96px; }
         #messages { transform: translateX(-50%) scale(.75); top: 150px; }`
      : `${panels} { display: none !important; }`;
    document.head.appendChild(css);
    // Frame the action near screen centre instead of the far gameplay look-ahead point.
    const focus = new Function('g', 't', `return ${clip.focus || `t.pos.clone().addScaledVector(t.dir, ${clip.ahead ?? 6})`};`), orig = g.camCtl.update.bind(g.camCtl);
    g.camCtl.update = (dt, tr) => { const p = focus(g, tr); orig(dt, p ? { pos: p, dir: p.clone().set(0, 0, 0), speed: 0 } : tr); };
    g.camCtl.zoom = clip.zoom; g.camCtl.snap(g.train.pos);
    g.ui.clearTransient();
    for (let i = 0; i < 45; i++) window.__render(); // settle camera/particles
    return `${g.train.seg.id}@${g.train.dist.toFixed(0)} t=${g.stats.time.toFixed(0)}s`;
  }, { clip });
  console.log(name, 'start', found);
  const dir = `${ROOT}/public/frames/${name}`;
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const total = +process.env.FRAMES || clip.frames; // FRAMES=n for quick previews
  for (let f = 0; f < total; f++) {
    await page.evaluate((plan) => { const g = window.__game; if (g.state === 'PLAYING' && !g.dying) window.runBot({ plan, cruise: 14, maxSteps: 1, resume: true, noSnap: true }); else if (g.dying) g.update(1 / 30); window.__render(); }, clip.plan);
    await page.screenshot({ path: `${dir}/${String(f).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 92 });
  }
  fs.mkdirSync(`${ROOT}/public/clips`, { recursive: true });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${dir}/%04d.jpg`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', `${ROOT}/public/clips/${name}.mp4`]);
  console.log(name, 'done', total, 'frames');
  await page.close();
}
await browser.close();
