import * as THREE from 'three';
import { CONFIG, ZONES, zoneIndex, TRAIN_TYPES, ENEMY_TYPES } from './config.js';
import { BOARDS, ranked, loadRuns, clearRuns, fmtTime } from './leaderboard.js';

const $ = (id) => document.getElementById(id);
const _p = new THREE.Vector3(), _p2 = new THREE.Vector3();
const KIND_COLOR = { main: '#d8d0b8', safe: '#7fbf6a', danger: '#e0664a', spur: '#e0c050' };
const LOOT_COLOR = { fuel: '#ff9a30', parts: '#5ab8ff', supplies: '#7fdc6a', ammo: '#ffd84a', carriage: '#ff70e0' };

export class UIManager {
  constructor(game) {
    this.game = game;
    this.el = {};
    for (const id of ['hud', 'hp-bar', 'hp-text', 'fuel-bar', 'fuel-text', 'parts', 'supplies', 'ammo', 'speed', 'throttle-bar', 'cars',
      'zone', 'objective', 'dist-north', 'junction', 'j-dist', 'j-left', 'j-right', 'hazard-warn', 'messages', 'prompt', 'prompt-text',
      'prompt-progress', 'prompt-bar', 'prompt-sub', 'floaters', 'damage-flash', 'start-screen', 'pause-screen', 'end-screen',
      'end-title', 'end-reason', 'end-stats', 'end-score', 'needle', 'threat', 'threat-text', 'hazard-text', 'lever-label',
      'r-parts', 'r-supplies', 'r-ammo']) this.el[id] = $(id);
    this.nctx = this.el.needle.getContext('2d'); this.lastNeedle = null; this.lastRes = {};
    this.cache = {};
    this.msgs = []; this.floaters = []; this.flash = 0; this.mapT = 0;
    this.map = $('minimap'); this.mctx = this.map.getContext('2d');
    this.buildMapBase(game.world.network);
    // Camera looks along -offset: rotate the map so that direction is 'up', like the 3D view.
    this.mapRot = -Math.atan2(-CONFIG.CAMERA_OFFSET[0], CONFIG.CAMERA_OFFSET[2]);
    this.markerEls = new Map(); this.markerRoot = $('markers');
    this.initSettings();
  }

  // ---- Settings ----
  initSettings() {
    const g = this.game, box = $('train-cards');
    const bar = (label, v) => `<div class="stat">${label}<i><b style="width:${Math.round(Math.min(1, v) * 100)}%"></b></i></div>`;
    for (const [key, t] of Object.entries(TRAIN_TYPES)) {
      const el = document.createElement('div'); el.className = 'tcard'; el.dataset.train = key;
      el.innerHTML = `<img src="${t.card}" alt=""><div class="tbody"><div class="tname">${t.name.toUpperCase()}</div><div class="tdesc">${t.desc}</div>
        ${bar('ARMOR', t.health)}${bar('SPEED', t.speed * 0.8)}${bar('ECONOMY', 0.8 / t.fuel)}${bar('FIREPOWER', t.damage / t.cooldown * 0.8)}</div>`;
      el.addEventListener('click', () => { g.settings.train = key; this.syncSettings(); });
      box.appendChild(el);
    }
    $('opt-fps').addEventListener('change', (e) => { g.settings.fps = e.target.checked; this.syncSettings(); });
    this.syncSettings(false);
  }
  syncSettings(save = true) {
    const g = this.game;
    for (const el of document.querySelectorAll('.tcard')) el.classList.toggle('sel', el.dataset.train === g.settings.train);
    $('opt-fps').checked = g.settings.fps;
    if (save) g.saveSettings(); else g.fps.el.classList.toggle('hidden', !g.settings.fps);
  }
  openSettings(from) { this.settingsFrom = from; this.el['start-screen'].classList.add('hidden'); this.el['pause-screen'].classList.add('hidden'); $('settings-screen').classList.remove('hidden'); }
  // ---- Leaderboard ----
  openBoard(highlightId = null) {
    this.boardHighlight = highlightId ?? this.boardHighlight;
    for (const id of ['start-screen', 'pause-screen', 'end-screen']) this.el[id].classList.add('hidden');
    $('board-screen').classList.remove('hidden');
    const tabs = $('board-tabs');
    if (!tabs.children.length) for (const b of BOARDS) {
      const btn = document.createElement('button'); btn.textContent = b.title; btn.dataset.board = b.id;
      btn.addEventListener('click', (e) => { e.currentTarget.blur(); this.renderBoard(b.id); });
      tabs.appendChild(btn);
    }
    this.renderBoard(this.boardTab || 'score');
  }
  renderBoard(id) {
    this.boardTab = id;
    const b = BOARDS.find((x) => x.id === id), rows = ranked(b).slice(0, 10);
    for (const t of $('board-tabs').children) t.classList.toggle('sel', t.dataset.board === id);
    $('board-empty').classList.toggle('hidden', rows.length > 0 || loadRuns().length > 0);
    const head = `<tr><th>#</th><th>${b.col}</th><th>Result</th><th>Train</th>${id === 'score' ? '' : '<th>Score</th>'}<th>Time</th><th>Distance</th><th>Supplies</th><th>Kills</th><th>Salvaged</th><th>Hull</th><th>Date</th></tr>`;
    const body = rows.map((r, i) => `<tr class="${r.id === this.boardHighlight ? 'mine' : ''}"><td class="rank">${i + 1}</td><td class="key">${b.fmt(b.value(r))}</td>
      <td class="${r.victory ? 'res-win' : 'res-loss'}" title="${r.reason}">${r.victory ? 'REACHED NORTH' : r.reason.includes('fuel') ? 'STRANDED' : 'DESTROYED'}</td>
      <td>${r.train}${r.cars > 1 ? ` +${r.cars - 1}` : ''}</td>${id === 'score' ? '' : `<td>${r.score.toLocaleString()}</td>`}<td>${fmtTime(r.time)}</td><td>${(r.distance / 1000).toFixed(2)} km</td>
      <td>${r.supplies}</td><td>${r.kills}</td><td>${r.salvaged}</td><td>${r.hull}</td><td>${new Date(r.date).toLocaleDateString()}</td></tr>`).join('');
    $('board-table').innerHTML = head + (body || `<tr><td colspan="12" style="text-align:center;color:#9a8e76">No qualifying runs yet${id === 'fastest' ? ' — reach the north to set a time' : ''}.</td></tr>`);
  }
  closeBoard() { $('board-screen').classList.add('hidden'); this.cache = {}; this.showScreen(this.game.state); }
  clearBoard() { if (confirm('Delete all leaderboard records?')) { clearRuns(); this.renderBoard(this.boardTab); } }

  closeSettings() { $('settings-screen').classList.add('hidden'); this.cache = {}; this.showScreen(this.game.state); }

  // ---- Floating world markers: salvage pins, hazard pins, enemy health bars ----
  marker(key, cls, html) {
    let el = this.markerEls.get(key);
    if (!el) { el = document.createElement('div'); el.className = cls; el.innerHTML = html; this.markerRoot.appendChild(el); this.markerEls.set(key, el); }
    el.seen = true; return el;
  }
  place(el, pos, camera) {
    _p.copy(pos).project(camera);
    if (_p.z > 1 || Math.abs(_p.x) > 1.1 || Math.abs(_p.y) > 1.1) { el.style.display = 'none'; return false; }
    el.style.display = ''; el.style.left = ((_p.x + 1) / 2 * innerWidth) + 'px'; el.style.top = ((1 - _p.y) / 2 * innerHeight) + 'px';
    return true;
  }
  updateMarkers(camera) {
    const g = this.game, t = g.train;
    for (const el of this.markerEls.values()) el.seen = false;
    const show = g.state === 'PLAYING' && !g.dying;
    if (show) {
      for (const l of g.locations) {
        if (l.done) continue;
        const d = t.nearestPart(l.pos, _p2);
        if (d > 170 || !g.isRevealed(l.pos)) continue;
        const icon = l.main === 'carriage' ? 'assets/icon_train.png' : `assets/icon_${l.main}.png`;
        const kind = l.carType ? 'CARRIAGE' : Object.keys(l.loot).map((k) => k.toUpperCase()).join(' · ');
        const el = this.marker(l, 'mk', `<div class="pin"><img src="${icon}" alt=""></div><div class="tag"><span class="kind">${kind}</span>${l.name}<small></small></div>`);
        el.classList.toggle('near', d < 22);
        el.querySelector('small').textContent = d < 22 ? (t.stopped ? 'PRESS [E]' : 'STOP HERE') : `${Math.round(d)} M`;
        this.place(el, _p2.copy(l.pos).setY(l.pos.y + 12), camera);
      }
      for (const h of g.hazards) {
        if (!h.active || h.pos.distanceTo(t.pos) > 150 || !g.isRevealed(h.pos)) continue;
        const el = this.marker(h, 'mk hz', `<div class="pin"><img src="assets/icon_warning.png" alt=""></div><div class="tag"><span class="kind">${h.type.blocking ? 'TRACK BLOCKED' : 'SLOW DOWN'}</span>${h.type.name}<small></small></div>`);
        el.querySelector('small').textContent = `${Math.round(h.pos.distanceTo(t.pos))} M`;
        this.place(el, _p2.copy(h.pos).setY(5), camera);
      }
      for (const L of g.world.labels) {
        const d = L.pos.distanceTo(t.pos);
        if (d > (L.far ? 420 : 190) || (!L.far && !g.isRevealed(L.pos))) continue;
        const el = this.marker(L, `wl ${L.kind}`, `<div class="wl-plate">${L.arrow === '◀' ? '<i>◀</i>' : ''}<div><b>${L.title}</b><span>${L.sub}</span></div>${L.arrow === '▶' ? '<i>▶</i>' : ''}</div><div class="wl-post"></div>`);
        el.style.opacity = L.far && !g.isRevealed(L.pos) ? 0.75 : 1;
        this.place(el, L.pos, camera);
      }
      for (const e of g.enemies) {
        if (!e.alive || (e.state === 'idle' && e.hp >= e.t.hp) || e.pos.distanceTo(t.pos) > 120 || !g.isRevealed(e.pos)) continue;
        const el = this.marker(e, 'ehp', `<b></b><span>${ENEMY_TYPES[e.type].name.toUpperCase()}</span>`);
        el.firstChild.style.transform = `scaleX(${e.hp / e.t.hp})`;
        this.place(el, _p2.copy(e.pos).setY(e.pos.y + (e.type === 'truck' ? 4.5 : 3.6)), camera);
      }
    }
    for (const [k, el] of this.markerEls) if (!el.seen) { el.remove(); this.markerEls.delete(k); }
  }

  set(id, prop, val) {
    const k = id + prop;
    if (this.cache[k] === val) return;
    this.cache[k] = val;
    if (prop === 'text') this.el[id].textContent = val;
    else if (prop === 'html') this.el[id].innerHTML = val;
    else if (prop === 'width') this.el[id].style.width = val;
    else if (prop === 'hidden') this.el[id].classList.toggle('hidden', val);
    else if (prop === 'class') this.el[id].className = val;
  }

  showScreen(state) {
    document.getElementById('settings-screen').classList.add('hidden');
    document.getElementById('board-screen').classList.add('hidden');
    this.set('start-screen', 'hidden', state !== 'START_MENU');
    this.set('pause-screen', 'hidden', state !== 'PAUSED');
    this.set('end-screen', 'hidden', state !== 'GAME_OVER' && state !== 'VICTORY');
    this.set('hud', 'hidden', state === 'START_MENU');
  }

  message(text, type = '') {
    const d = document.createElement('div'); d.textContent = text; d.className = type;
    this.el.messages.appendChild(d);
    this.msgs.push({ d, life: 4 });
    while (this.msgs.length > 5) this.msgs.shift().d.remove();
  }
  floatText(pos, text, color = '#fff') {
    const d = document.createElement('div'); d.textContent = text; d.style.color = color;
    this.el.floaters.appendChild(d);
    this.floaters.push({ d, pos: pos.clone(), life: 1.8 });
  }
  damageFlash(k) { this.flash = Math.min(1, this.flash + k); }
  clearTransient() {
    for (const m of this.msgs) m.d.remove(); for (const f of this.floaters) f.d.remove();
    this.msgs = []; this.floaters = []; this.flash = 0;
  }

  // Real-time UI animation (messages, floaters, flash). Frozen while paused.
  tick(dt, camera) {
    for (let i = this.msgs.length - 1; i >= 0; i--) {
      const m = this.msgs[i]; m.life -= dt; m.d.style.opacity = Math.min(1, m.life);
      if (m.life <= 0) { m.d.remove(); this.msgs.splice(i, 1); }
    }
    const W = innerWidth, H = innerHeight;
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i]; f.life -= dt; f.pos.y += dt * 2.5;
      _p.copy(f.pos).project(camera);
      f.d.style.left = ((_p.x + 1) / 2 * W) + 'px'; f.d.style.top = ((1 - _p.y) / 2 * H) + 'px';
      f.d.style.opacity = Math.min(1, f.life);
      if (f.life <= 0) { f.d.remove(); this.floaters.splice(i, 1); }
    }
    this.flash = Math.max(0, this.flash - dt * 1.8);
    this.el['damage-flash'].style.opacity = this.flash;
  }

  updateHUD(dt) {
    const g = this.game, t = g.train;
    const hp = t.health / t.maxHealth, fu = t.fuel / t.maxFuel;
    this.set('hp-bar', 'width', (hp * 100).toFixed(1) + '%');
    this.set('hp-bar', 'class', 'fill hp' + (hp < 0.3 ? ' low' : ''));
    this.set('hp-text', 'text', `${Math.ceil(t.health)} / ${t.maxHealth}`);
    this.set('fuel-bar', 'width', (fu * 100).toFixed(1) + '%');
    this.set('fuel-bar', 'class', 'fill fuel' + (fu < 0.15 ? ' low' : ''));
    this.set('fuel-text', 'text', `${Math.ceil(t.fuel)} / ${t.maxFuel}`);
    this.resource('parts', t.parts, `${t.parts}`, t.parts < 2);
    this.resource('supplies', t.supplies, `${t.supplies}<small>/${t.supplyCap}</small>`, false);
    this.resource('ammo', t.ammo, `${t.ammo}`, t.ammo < 8);
    this.set('speed', 'text', String(Math.round(Math.abs(t.speed) * 3.6)) + (t.speed < -0.2 ? 'R' : ''));
    this.drawNeedle(Math.abs(t.speed) * 3.6);
    // Vertical lever: up = forward throttle, down = reverse, full red = brakes.
    const th = t.throttle, bar = this.el['throttle-bar'].style;
    if (t.braking) { bar.bottom = '0'; bar.height = '100%'; bar.background = 'linear-gradient(#ff8a6a, #b8301c)'; }
    else if (th >= 0) { bar.bottom = '50%'; bar.height = th * 50 + '%'; bar.background = 'linear-gradient(#b8f07a, #5aa032)'; }
    else { bar.bottom = (50 + th * 50) + '%'; bar.height = -th * 50 + '%'; bar.background = 'linear-gradient(#f0d070, #c09020)'; }
    this.set('lever-label', 'text', t.braking ? 'BRAKE' : th < -0.02 ? 'REVERSE' : 'THROTTLE');
    this.set('cars', 'text', t.carNames().join(' · '));
    const threats = g.enemies.reduce((n, e) => n + (e.alive && e.state !== 'idle' && e.pos.distanceTo(t.pos) < 90 ? 1 : 0), 0);
    this.set('threat', 'hidden', threats === 0);
    if (threats) this.set('threat-text', 'text', `${threats} HOSTILE${threats > 1 ? 'S' : ''} — [SPACE] FIRE`);

    const z = t.pos.z;
    this.set('zone', 'text', ZONES[zoneIndex(z)].name);
    this.set('objective', 'html', g.objectiveText());
    this.set('dist-north', 'text', `Evacuation Station: ${(Math.max(0, t.pos.distanceTo(g.world.stationPos)) / 1000).toFixed(2)} km`);

    // Junction chooser.
    const seg = t.seg, remain = seg.length - t.dist;
    if (seg.next.length > 1 && remain < 220) {
      this.set('junction', 'hidden', false);
      this.set('j-dist', 'text', `IN ${Math.max(0, Math.round(remain - 6))} m`);
      for (let i = 0; i < 2; i++) {
        const id = i ? 'j-right' : 'j-left', info = seg.junction[i], el = this.el[id];
        if (el.dataset.seg !== seg.id) {
          el.querySelector('.jname').textContent = info.title;
          el.querySelector('.jdesc').textContent = info.desc;
          el.dataset.seg = seg.id;
        }
        this.set(id, 'class', 'jopt' + (t.choice === i ? ' sel' : ''));
      }
    } else this.set('junction', 'hidden', true);

    const hz = g.hazardAhead();
    if (hz) {
      const blocking = hz.h.type.blocking;
      this.set('hazard-warn', 'hidden', false);
      this.set('hazard-text', 'text', `${hz.h.type.name.toUpperCase()} ${Math.round(hz.dist)} m — ` +
        (blocking ? 'track blocked: stop and press [E]' : `slow below ${Math.round(6 * 3.6)} km/h`));
    } else this.set('hazard-warn', 'hidden', true);

    // Prompt.
    const pr = g.promptInfo();
    this.set('prompt', 'hidden', !pr);
    if (pr) {
      this.set('prompt-text', 'text', pr.text);
      this.set('prompt-sub', 'text', pr.sub || '');
      this.set('prompt-progress', 'hidden', pr.progress === undefined);
      if (pr.progress !== undefined) this.set('prompt-bar', 'width', (pr.progress * 100).toFixed(0) + '%');
    }

    this.mapT -= dt;
    if (this.mapT <= 0) { this.mapT = 0.1; this.drawMap(); }
  }

  resource(id, value, html, low) {
    this.set(id, 'html', html);
    this.set('r-' + id, 'class', 'res' + (low ? ' low' : ''));
    const prev = this.lastRes[id];
    this.lastRes[id] = value;
    if (prev !== undefined && value > prev) {
      const el = this.el[id]; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
    }
  }

  // Needle over the generated gauge face: 0..70 km/h across a 270° arc.
  drawNeedle(kmh) {
    const v = Math.round(kmh * 2) / 2;
    if (v === this.lastNeedle) return;
    this.lastNeedle = v;
    const c = this.nctx, R = 110;
    c.clearRect(0, 0, 220, 220);
    const a = (-135 + Math.min(v, 70) / 70 * 270) * Math.PI / 180;
    c.save(); c.translate(R, R); c.rotate(a);
    c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 4; c.shadowOffsetY = 2;
    c.fillStyle = '#b01e14';
    c.beginPath(); c.moveTo(-4, 14); c.lineTo(-1.5, -76); c.lineTo(1.5, -76); c.lineTo(4, 14); c.closePath(); c.fill();
    c.restore();
    c.fillStyle = '#c8a050'; c.beginPath(); c.arc(R, R, 9, 0, 7); c.fill();
    c.fillStyle = '#6a5028'; c.beginPath(); c.arc(R, R, 4, 0, 7); c.fill();
  }

  // ---- Minimap: static network pre-rendered, dynamic markers on top ----
  buildMapBase(net) {
    const S = this.mapScale = 0.5, x0 = this.mapX0 = -260, z0 = this.mapZ0 = 120;
    const cv = this.mapBase = document.createElement('canvas');
    cv.width = 560 * S; cv.height = 4250 * S;
    const c = cv.getContext('2d');
    c.lineCap = 'round';
    for (const id in net.segs) {
      const s = net.segs[id];
      c.strokeStyle = KIND_COLOR[s.kind]; c.lineWidth = 3; c.beginPath();
      for (let i = 0; i < s.n; i += 4) { const X = (s.px[i] - x0) * S, Y = (z0 - s.pz[i]) * S; i ? c.lineTo(X, Y) : c.moveTo(X, Y); }
      c.lineTo((s.px[s.n - 1] - x0) * S, (z0 - s.pz[s.n - 1]) * S);
      c.stroke();
    }
    c.font = '10px Segoe UI, sans-serif'; c.fillStyle = '#e8dcc0';
    for (const id in net.segs) {
      const s = net.segs[id]; if (s.kind === 'main') continue;
      const m = Math.floor(s.n / 2), X = (s.px[m] - x0) * S, Y = (z0 - s.pz[m]) * S;
      c.textAlign = s.px[m] < s.px[0] ? 'right' : 'left';
      c.fillText(s.name, X + (c.textAlign === 'left' ? 6 : -6), Y);
    }
  }
  toMap(x, z, cx, cz) { return [(x - cx) * this.mapScale + 120, (z - cz) * this.mapScale + 120]; }
  // Minimap is rotated to match the camera (north points the same way as on screen), centred on the train.
  drawMap() {
    const g = this.game, t = g.train, c = this.mctx, S = this.mapScale;
    const cx = t.pos.x, cz = t.pos.z, rot = this.mapRot;
    c.fillStyle = '#1b1915'; c.fillRect(0, 0, 240, 240);
    c.save(); c.translate(120, 120); c.rotate(rot); c.translate(-120, -120);
    c.drawImage(this.mapBase, -((cx - this.mapX0) * S - 120), -((this.mapZ0 - cz) * S - 120));
    if (t.seg.next.length > 1) {
      const b = t.seg.next[t.choice];
      c.strokeStyle = '#7dff8a'; c.lineWidth = 4; c.beginPath();
      for (let i = 0; i < Math.min(b.n, 160); i += 4) { const [X, Y] = this.toMap(b.px[i], b.pz[i], cx, cz); i ? c.lineTo(X, Y) : c.moveTo(X, Y); }
      c.stroke();
    }
    for (const l of g.locations) {
      if (l.done) continue;
      const [X, Y] = this.toMap(l.pos.x, l.pos.z, cx, cz);
      c.fillStyle = LOOT_COLOR[l.main]; c.beginPath(); c.arc(X, Y, 3.5, 0, 7); c.fill();
    }
    c.strokeStyle = '#ff5030'; c.lineWidth = 2;
    for (const h of g.hazards) {
      if (!h.active) continue;
      const [X, Y] = this.toMap(h.pos.x, h.pos.z, cx, cz);
      c.beginPath(); c.moveTo(X - 3, Y - 3); c.lineTo(X + 3, Y + 3); c.moveTo(X + 3, Y - 3); c.lineTo(X - 3, Y + 3); c.stroke();
    }
    c.fillStyle = '#ff3a2a';
    for (const e of g.enemies) {
      if (!e.alive || e.state === 'idle') continue;
      const [X, Y] = this.toMap(e.pos.x, e.pos.z, cx, cz); c.fillRect(X - 2, Y - 2, 4, 4);
    }
    const st = g.world.stationPos, [SX, SY] = this.toMap(st.x, st.z, cx, cz);
    c.fillStyle = '#7dff8a'; c.font = 'bold 14px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('★', SX, SY);
    c.save(); c.translate(120, 120); c.rotate(t.h);
    c.fillStyle = '#ffe070'; c.strokeStyle = '#3a2a08'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(0, -9); c.lineTo(6, 7); c.lineTo(0, 3); c.lineTo(-6, 7); c.closePath(); c.fill(); c.stroke();
    c.restore();
    c.restore();

    // Compass rose on the rim: world directions rotated like the map.
    const R = 108;
    const rim = (ang, r = R) => [120 + Math.sin(ang + rot) * r, 120 - Math.cos(ang + rot) * r];
    c.textAlign = 'center'; c.textBaseline = 'middle'; // restore() above reset these
    for (const [lbl, ang] of [['N', 0], ['E', Math.PI / 2], ['S', Math.PI], ['W', -Math.PI / 2]]) {
      const [X, Y] = rim(ang, 94), north = lbl === 'N';
      c.beginPath(); c.arc(X, Y, north ? 11 : 9, 0, 7);
      c.fillStyle = north ? '#8a1e12' : 'rgba(20,18,14,0.9)'; c.fill();
      c.lineWidth = 1.5; c.strokeStyle = north ? '#ffb08a' : '#b8904a'; c.stroke();
      c.font = `600 ${north ? 15 : 12}px Oswald, sans-serif`; c.fillStyle = north ? '#fff' : '#f0dca8';
      c.fillText(lbl, X, Y + 0.5);
    }
    // Station off-map: arrow on the rim pointing at it.
    const dx = st.x - cx, dz = st.z - cz;
    if (Math.hypot(dx, dz) * S > R - 8) {
      const ang = Math.atan2(dx, -dz), [X, Y] = rim(ang, 70);
      c.save(); c.translate(X, Y); c.rotate(ang + rot);
      c.fillStyle = '#7dff8a'; c.beginPath(); c.moveTo(0, -8); c.lineTo(6, 4); c.lineTo(-6, 4); c.closePath(); c.fill();
      c.restore();
      c.fillStyle = '#7dff8a'; c.font = '600 10px Oswald, sans-serif'; c.fillText('EVAC', X, Y + 13);
    }
  }

  showEnd(victory, reason, rows, score, placed = []) {
    $('end-records').innerHTML = placed.map((p) => `★ NEW #${p.rank} — ${p.board.title.toUpperCase()}`).join('<br>');
    this.set('end-title', 'text', victory ? 'YOU REACHED THE NORTH' : 'THE TRAIN HAS STOPPED');
    this.el['end-title'].className = victory ? 'win' : 'lose';
    this.set('end-reason', 'text', reason);
    this.el['end-stats'].innerHTML = rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
    this.set('end-score', 'text', `SCORE ${score}`);
  }
}
export { LOOT_COLOR };
