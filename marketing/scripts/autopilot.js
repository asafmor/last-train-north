// Injected into the page: autopilot that plays the game through the real input set.
window.runBot = function (opts) {
  const g = window.__game, inp = g.input, log = [];
  if (!g.ui.__wrapped) { const origMsg = g.ui.message.bind(g.ui); g.ui.__wrapped = true; window.__botLog = [];
    g.ui.message = (t, ty) => { window.__botLog.push(`${g.stats.time.toFixed(0)}s [${g.train.seg.id}] ${t}`); origMsg(t, ty); }; }
  log.push(...(window.__botLog || []).splice(0));
  if (!opts.resume) g.startGame();
  if (!opts.resume) window.__botState = { reverseOut: false, plan: opts.plan };
  const plan = window.__botState?.plan && opts.resume ? window.__botState.plan : opts.plan; // segId -> choice
  const hold = (k, on) => on ? inp.down.add(k) : inp.down.delete(k);
  const press = (k) => inp.pressed.add(k);
  let phase = 'drive', snaps = [], lastSnap = -99, reverseOut = window.__botState.reverseOut;
  const dt = 1 / 30;
  for (let i = 0; i < opts.maxSteps; i++) {
    if (g.state !== 'PLAYING' || (opts.stopTime && g.stats.time >= opts.stopTime)) break;
    const t = g.train;
    inp.down.clear();
    if (opts.holdW) { hold('up', true); if (g.enemies.some(e => e.alive && e.state !== 'idle' && e.pos.distanceTo(t.pos) < 40)) hold('fire', true); }
    else {
      // Route choice
      if (t.seg.next.length > 1) { const c = plan[t.seg.id] ?? 0; if (t.choice !== c) press(c ? 'right' : 'left'); }
      // Rail yard: after the spur is exhausted, reverse out.
      if (t.seg.id === 'Y' && !g.locations.some(l => !l.done && l.seg.id === 'Y')) reverseOut = true;
      if (reverseOut && t.seg.id === 'S2' && t.dist < t.seg.length - t.length - 10) { reverseOut = false; plan.S2 = 0; }
      const near = g.enemies.some(e => e.alive && e.state !== 'idle' && e.pos.distanceTo(t.pos) < 45);
      if (near) hold('fire', true);
      if (reverseOut && t.health < t.maxHealth * 0.45 && t.parts >= 2) { if (t.stopped && !g.action) press('repair'); else if (!t.stopped) hold(t.speed < 0 ? 'up' : 'down', true); }
      else if (reverseOut) hold('down', true);
      else {
        // Target speed from upcoming stops.
        let vmax = opts.cruise;
        const stopAt = (gap) => { vmax = Math.min(vmax, Math.sqrt(2 * 1.6 * Math.max(0, gap))); };
        for (const l of g.locations) if (!l.done && l.seg === t.seg && l.d > t.dist - 4 && !(opts.skip || []).includes(l.name)) stopAt(l.d - t.dist - 2);
        for (const h of g.hazards) if (h.active && h.seg === t.seg && h.dist > t.dist) {
          if (h.type.blocking) stopAt(h.dist - t.dist - 6 - 4); else if (h.dist - t.dist < 60) vmax = Math.min(vmax, 5);
        }
        if (t.seg.id === 'N2') stopAt(t.seg.length - 20 - t.dist);
        const threat = g.enemies.some(e => e.alive && e.state !== 'idle' && e.pos.distanceTo(t.pos) < 55);
        if (t.health < t.maxHealth * 0.5 && t.parts >= 2 && (!threat || t.health < t.maxHealth * 0.35)) vmax = 0;
        const needStop = vmax < 0.5;
        const fighting = g.enemies.some(e => e.alive && e.state !== 'idle' && e.pos.distanceTo(t.pos) < 32);
        if (fighting) hold('fire', true);
        if (needStop || t.speed > vmax + 0.5) hold('down', t.speed > 0.05 || needStop && false);
        else if (t.speed < vmax - 1.5 && t.fuel > 0) hold('up', true);
        if (t.stopped && !g.action) {
          if (t.health < t.maxHealth * 0.6 && t.parts >= 2) press('repair');
          else if (t.fuel < 6 && t.supplies >= 5) press('burn');
          else if (g.cand) press('interact');
          else if (needStop) { /* nothing to do here -> nudge */ hold('up', true); }
        }
      }
    }
    g.update(dt);
    inp.endFrame();
    if (opts.snapEvery && g.stats.time - lastSnap > opts.snapEvery) { lastSnap = g.stats.time; snaps.push({ time: g.stats.time.toFixed(0), seg: t.seg.id, dist: t.dist.toFixed(0), hp: t.health.toFixed(0), fuel: t.fuel.toFixed(1), parts: t.parts, sup: t.supplies, ammo: t.ammo, kills: g.stats.kills, cars: t.cars.length, enemies: g.enemies.length }); }
  }
  window.__botState.reverseOut = reverseOut;
  if (!opts.noSnap) { g.camCtl.snap(g.train.pos); g.camCtl.target.addScaledVector(g.train.dir, 12); g.camCtl.pos.addScaledVector(g.train.dir, 12); }
  const t = g.train;
  return { state: g.state, reason: document.getElementById('end-reason').textContent, time: g.stats.time.toFixed(0), seg: t.seg.id, dist: t.dist.toFixed(0), hp: t.health, fuel: t.fuel, parts: t.parts, sup: t.supplies, ammo: t.ammo, stats: g.stats, cars: t.carNames(), log, snaps };
};
