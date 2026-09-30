import * as THREE from 'three';
import { CONFIG, CONTENT, ENEMY_TYPES, CAR_TYPES, TRAIN_TYPES, START_SEGMENT, START_DIST, STATION_SEGMENT, STATION_PLATFORM, ZONES, zoneIndex } from './config.js';
import { World } from './world.js';
import { Train, FRONT } from './train.js';
import { Enemy } from './enemies.js';
import { SalvageLocation, Hazard, tickBeams } from './content.js';
import { ParticleSystem, Tracers, Projectiles } from './effects.js';
import { PostFX } from './postfx.js';
import { CrewManager } from './crew.js';
import { AudioManager } from './audio.js';
import { UIManager } from './ui.js';
import { TEX, initMaterials } from './assets.js';
import { saveRun } from './leaderboard.js';
import { biomeWeights, mulberry32, rrange, pick, clamp, damp } from './util.js';

export const STATE = { START_MENU: 'START_MENU', PLAYING: 'PLAYING', PAUSED: 'PAUSED', GAME_OVER: 'GAME_OVER', VICTORY: 'VICTORY' };
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _s = { x: 0, z: 0, h: 0 }, _bw = {};

class InputManager {
  constructor() {
    this.down = new Set(); this.pressed = new Set();
    const map = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
      Space: 'fire', KeyE: 'interact', KeyR: 'repair', KeyF: 'burn', Escape: 'pause', KeyP: 'pause' };
    window.addEventListener('keydown', (e) => {
      const k = map[e.code]; if (!k) return;
      e.preventDefault();
      if (!this.down.has(k)) this.pressed.add(k);
      this.down.add(k);
    });
    window.addEventListener('keyup', (e) => { const k = map[e.code]; if (k) this.down.delete(k); });
    window.addEventListener('blur', () => this.down.clear());
  }
  isDown(k) { return this.down.has(k); }
  wasPressed(k) { return this.pressed.has(k); }
  endFrame() { this.pressed.clear(); }
}

// Smoothly follows a look-ahead point from a fixed high diagonal offset.
class CameraController {
  constructor(camera) {
    this.cam = camera; this.zoom = 1; this.shake = 0;
    this.target = new THREE.Vector3(); this.pos = new THREE.Vector3(); this.offset = new THREE.Vector3(...CONFIG.CAMERA_OFFSET);
  }
  snap(focus) { this.target.copy(focus); this.pos.copy(focus).addScaledVector(this.offset, this.zoom); this.apply(); }
  update(dt, train) {
    _v.copy(train.pos).addScaledVector(train.dir, 12 + Math.abs(train.speed) * 1.3);
    const k = damp(CONFIG.CAMERA_LAG, dt);
    this.target.lerp(_v, k);
    _v.copy(this.target).addScaledVector(this.offset, this.zoom);
    this.pos.lerp(_v, k);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.apply();
  }
  apply() {
    const s = this.shake * this.shake * 1.2;
    this.cam.position.set(this.pos.x + (Math.random() - 0.5) * s, this.pos.y + (Math.random() - 0.5) * s, this.pos.z + (Math.random() - 0.5) * s);
    this.cam.lookAt(this.target);
  }
}

export class Game {
  constructor(container) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    initMaterials(this.renderer, this.scene);
    this.camera = new THREE.PerspectiveCamera(CONFIG.CAMERA_FOV, innerWidth / innerHeight, 1, 700);
    this.world = new World(this.scene);
    this.runGroup = new THREE.Group(); this.scene.add(this.runGroup);
    this.fx = { smoke: new ParticleSystem(this.scene, 1600, false, TEX.smoke), fire: new ParticleSystem(this.scene, 1200, true, TEX.fire) };
    this.tracers = new Tracers(this.scene);
    this.projectiles = new Projectiles(this.scene, this.fx);
    this.crew = new CrewManager(this);
    this.post = new PostFX(this.renderer, this.scene, this.camera);
    this.settings = Object.assign({ train: 'ironclad', fps: false }, JSON.parse(localStorage.getItem('ltn-settings') || '{}'));
    if (!TRAIN_TYPES[this.settings.train]) this.settings.train = 'ironclad';
    this.fps = { el: document.getElementById('fps'), n: 0, t: 0 };
    this.input = new InputManager();
    this.audio = new AudioManager();
    this.camCtl = new CameraController(this.camera);
    this.train = new Train(this);
    this.enemies = []; this.locations = []; this.hazards = []; this.triggers = [];
    this.stats = {};
    this.ui = new UIManager(this);

    const btn = (id, fn) => document.getElementById(id).addEventListener('click', (e) => { e.currentTarget.blur(); fn(); });
    btn('btn-start', () => this.startGame());
    btn('btn-resume', () => this.setState(STATE.PLAYING));
    btn('btn-restart', () => this.startGame());
    btn('btn-again', () => this.startGame());
    btn('btn-settings', () => this.ui.openSettings(STATE.START_MENU));
    btn('btn-settings2', () => this.ui.openSettings(STATE.PAUSED));
    btn('btn-settings-close', () => this.ui.closeSettings());
    btn('btn-board', () => this.ui.openBoard());
    btn('btn-board2', () => this.ui.openBoard(this.lastRunId));
    btn('btn-board-close', () => this.ui.closeBoard());
    btn('btn-board-clear', () => this.ui.clearBoard());
    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('wheel', (e) => {
      this.camCtl.zoom = clamp(this.camCtl.zoom * (e.deltaY > 0 ? 1.08 : 1 / 1.08), CONFIG.ZOOM_MIN, CONFIG.ZOOM_MAX);
    }, { passive: true });
    this.onResize();

    this.newRun();
    this.setState(STATE.START_MENU);
    this.clock = new THREE.Clock();
    this.menuT = 0;
    const loop = () => { requestAnimationFrame(loop); this.frame(Math.min(this.clock.getDelta(), 0.05)); };
    loop();
  }

  onResize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    const scale = h * this.renderer.getPixelRatio() / (2 * Math.tan(CONFIG.CAMERA_FOV * Math.PI / 360));
    this.fx.smoke.setScale(scale); this.fx.fire.setScale(scale);
    this.post.setSize(w, h);
  }

  saveSettings() {
    localStorage.setItem('ltn-settings', JSON.stringify(this.settings));
    this.fps.el.classList.toggle('hidden', !this.settings.fps);
    // Swap the locomotive shown behind the menu straight away.
    if (this.state === STATE.START_MENU) this.newRun();
  }

  setState(s) {
    this.state = s;
    this.ui.showScreen(s);
    this.clock?.getDelta();
  }

  startGame() {
    this.audio.init();
    this.newRun();
    this.setState(STATE.PLAYING);
    this.ui.message(`${this.train.spec.name} ready. Hold W to build speed and head north.`, 'good');
    setTimeout(() => this.audio.whistle(this.train.spec.model), 400); // once; sample may still be decoding
  }

  // ---------- Run setup ----------
  newRun() {
    for (const e of this.enemies) e.dispose();
    for (const c of this.runGroup.children.slice()) this.runGroup.remove(c);
    this.enemies = []; this.locations = []; this.hazards = []; this.triggers = [];
    this.fx.smoke.clear(); this.fx.fire.clear(); this.tracers.clear(); this.projectiles.clear(); this.crew.clear(); this.ui.clearTransient();
    this.dying = null;
    this.seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    this.rng = mulberry32(this.seed);
    this.stats = { time: 0, distance: 0, kills: 0, salvaged: 0, suppliesCollected: 0, damageTaken: 0 };
    this.time = 0; this.action = null; this.fireCool = 0; this.roamT = CONFIG.ROAM_FIRST_DELAY; this.strandT = 0;
    this.lastDetect = -99; this.lowFuelWarned = false; this.lowHpWarned = false; this.ended = false;
    const net = this.world.network;
    this.train.reset(net, net.segs[START_SEGMENT], START_DIST, this.settings.train);
    this.buildContent();
    this.camCtl.zoom = 1; this.camCtl.snap(this.train.pos);
  }

  resolveTypes(list) { return list.filter((t) => !t.endsWith('?') || this.rng() < 0.5).map((t) => t.replace('?', '')); }

  buildContent() {
    const rng = this.rng, segs = this.world.network.segs;
    for (const c of CONTENT) {
      if (c.chance && rng() > c.chance) continue;
      const seg = segs[c.seg], d = c.d < 0 ? seg.length + c.d : c.d;
      if (c.loc || c.carriage) {
        const kind = c.loc ? pick(rng, c.loc) : null;
        if (c.loc && !kind) continue;
        const pos = seg.pointAt(d, c.side * c.off, Math.max(-0.15, 0), new THREE.Vector3());
        pos.y = c.carriage ? 0 : Math.max(-0.15, this.world.heightAt(pos.x, pos.z));
        const h = seg.headingAt(d) + (!c.carriage && c.side < 0 ? Math.PI : 0);
        const loc = new SalvageLocation(this, kind, pos, h, rng, c.carriage || null);
        loc.seg = seg; loc.d = d;
        this.locations.push(loc);
      }
      if (c.guards) {
        for (const t of this.resolveTypes(c.guards)) {
          seg.pointAt(d + rrange(rng, -12, 12), c.side * (c.off + rrange(rng, 8, 18)), 0, _v);
          this.enemies.push(new Enemy(this, t, _v.x, _v.z, true));
        }
      }
      if (c.hazard) {
        const k = pick(rng, c.hazard);
        if (k) this.hazards.push(new Hazard(this, k, seg, d));
      }
      if (c.ambush) this.triggers.push({ seg, d, types: this.resolveTypes(c.ambush), fired: false });
    }
  }

  spawnEnemy(type, x, z) {
    const e = new Enemy(this, type, x, z, false);
    this.enemies.push(e);
    return e;
  }

  // ---------- Main loop ----------
  frame(dt) {
    if (this.input.wasPressed('pause')) {
      if (this.state === STATE.PLAYING) this.setState(STATE.PAUSED);
      else if (this.state === STATE.PAUSED) this.setState(STATE.PLAYING);
    }
    if (this.state === STATE.PLAYING) {
      try { this.update(dt); } catch (err) { console.error(err); this.ui.message('Internal error: ' + err.message, 'bad'); }
    }
    if (this.state === STATE.START_MENU) {
      this.menuT += dt;
      this.camCtl.target.copy(this.train.pos).addScaledVector(this.train.dir, 10);
      const a = this.menuT * 0.08;
      this.camCtl.pos.set(this.train.pos.x + Math.sin(a) * 50, 38, this.train.pos.z + Math.cos(a) * 50);
      this.camCtl.apply();
    } else if (this.state === STATE.PLAYING) this.camCtl.update(dt, this.train);
    this.world.update(dt, this.camCtl.target, this.time);
    if (this.state !== STATE.START_MENU) this.ui.updateHUD(dt);
    if (this.state === STATE.PLAYING) this.ui.tick(dt, this.camera);
    if (this.state !== STATE.START_MENU) this.ui.updateMarkers(this.camera);
    this.audio.update(dt, this.train.speed, this.train.throttle, this.state === STATE.PLAYING && !this.dying, this.train.spec.model, this.train.axleOffsets());
    // Fog of war reach shrinks in snow/smog; wide open while in menus.
    const w = biomeWeights(this.train.pos.z, _bw);
    this.reveal = this.state === STATE.START_MENU ? 3 : (1 - w.snow * 0.28 - w.ind * 0.12) * (this.dying ? 1.6 : 1);
    this.post.update(this.train.pos, this.train.dir, this.reveal, this.scene.fog.color, this.time);
    this.post.render();
    this.input.endFrame();
    this.updateFps(dt);
  }

  updateFps(dt) {
    const f = this.fps; f.n++; f.t += dt;
    if (f.t >= 0.5) { if (this.settings.fps) f.el.textContent = `${Math.round(f.n / f.t)} FPS`; f.n = 0; f.t = 0; }
  }

  // Is a world point inside the currently revealed area? (fog of war)
  isRevealed(p) {
    const t = this.train, rx = p.x - t.pos.x, rz = p.z - t.pos.z;
    const fwd = rx * t.dir.x + rz * t.dir.z, side = rx * t.right.x + rz * t.right.z;
    const r = (fwd > 0 ? 72 : 26) * this.reveal, sr = 34 * this.reveal;
    return (fwd / r) ** 2 + (side / sr) ** 2 < 0.8;
  }

  update(dt) {
    this.time += dt;
    const t = this.train;
    if (this.dying) return this.updateDying(dt);
    this.stats.time += dt;
    t.updateControls(dt, this.input);                 // input
    t.updatePhysics(dt);                              // train movement + hazard collisions
    t.place();
    this.world.updateJunctionMarkers(t.seg.id, t.choice);
    this.updateInteraction(dt);                       // salvage / repair / couple
    this.updateWeapon(dt);                            // combat
    this.updateTriggers(dt);                          // events & spawning
    for (const e of this.enemies) {                   // enemy AI
      if (e.state === 'idle' && e.pos.distanceToSquared(t.pos) > 250 * 250) continue;
      e.update(dt);
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) if (this.enemies[i].remove) { this.enemies[i].dispose(); this.enemies.splice(i, 1); }
    t.animate(dt, this.fx);                           // animation & effects
    this.projectiles.update(dt);
    this.crew.update(dt);
    this.fx.smoke.update(dt); this.fx.fire.update(dt); this.tracers.update(dt);
    for (const l of this.locations) if (!l.done && l.pos.distanceToSquared(this.train.pos) < 200 * 200) l.animate(this.time, dt);
    tickBeams(this.time);
    this.checkWarnings();
    this.checkEnd(dt);
  }

  // ---------- Interaction ----------
  findInteraction() {
    const t = this.train;
    for (const h of this.hazards) {
      if (!h.active || !h.type.blocking || h.seg !== t.seg) continue;
      const gap = h.dist - (t.dist + FRONT);
      if (gap > -1 && gap < 14) return { kind: 'hazard', h };
    }
    let best = null, bd = CONFIG.SALVAGE_RADIUS;
    for (const l of this.locations) {
      if (l.done) continue;
      const d = t.nearestPart(l.pos, _v);
      if (d < bd) { bd = d; best = l; }
    }
    return best ? { kind: best.carType ? 'carriage' : 'salvage', loc: best } : null;
  }
  canRepair() { const t = this.train; return t.health < t.maxHealth - 1 && t.parts >= CONFIG.REPAIR_COST; }
  canBurn() { const t = this.train; return t.supplies >= CONFIG.BURN_SUPPLIES_COST && t.fuel < t.maxFuel - CONFIG.BURN_SUPPLIES_FUEL; }

  // crew = [kind, worldTarget, workers]: the train crew climbs down and animates the job.
  startAction(label, dur, onDone, crew = null) {
    this.action = { label, dur, t: 0, onDone, tick: 0 };
    if (crew) this.crew.start(...crew);
  }

  updateInteraction(dt) {
    const t = this.train, inp = this.input;
    this.cand = t.stopped ? this.findInteraction() : null;
    if (this.action) {
      const a = this.action;
      if (!t.stopped) { this.action = null; this.crew.finish(true); this.ui.message('Interrupted — the train moved.', 'warn'); return; }
      a.t += dt; a.tick -= dt;
      if (a.tick <= 0) { a.tick = 2.3; if (this.crew.job?.kind !== 'couple') this.audio.work(); }
      if (a.t >= a.dur) { this.action = null; this.crew.finish(); a.onDone(); }
      return;
    }
    if (!t.stopped) return;
    if (inp.wasPressed('interact')) {
      const c = this.cand;
      if (c?.kind === 'hazard') this.startHazardAction(c.h);
      else if (c?.kind === 'salvage') this.startAction(`Salvaging ${c.loc.name}`, c.loc.time, () => this.completeSalvage(c.loc), ['salvage', c.loc.pos, 3]);
      else if (c?.kind === 'carriage') this.startAction(`Coupling ${CAR_TYPES[c.loc.carType].name}`, c.loc.time, () => this.completeCarriage(c.loc), ['couple', c.loc.pos, 4]);
      else if (this.canRepair()) this.startRepair();
      else if (this.canBurn() && t.fuel < t.maxFuel * 0.3) this.startBurn();
      else this.audio.deny();
    } else if (inp.wasPressed('repair')) {
      if (this.canRepair()) this.startRepair();
      else this.ui.message(t.parts < CONFIG.REPAIR_COST ? `Need ${CONFIG.REPAIR_COST} Parts to patch the hull.` : 'Hull is intact.', 'warn');
    } else if (inp.wasPressed('burn')) {
      if (this.canBurn()) this.startBurn();
      else this.ui.message(t.supplies < CONFIG.BURN_SUPPLIES_COST ? `Need ${CONFIG.BURN_SUPPLIES_COST} Supplies to burn.` : 'Fuel tank is full.', 'warn');
    }
  }
  startRepair() {
    const t0 = this.train, spot = new THREE.Vector3().copy(t0.pos).addScaledVector(t0.right, 2.2);
    this.startAction('Patching hull', CONFIG.REPAIR_DURATION, () => {
      const t = this.train; t.parts -= CONFIG.REPAIR_COST; t.health = Math.min(t.maxHealth, t.health + CONFIG.REPAIR_AMOUNT);
      this.ui.floatText(_v.copy(t.pos).setY(5), `+${CONFIG.REPAIR_AMOUNT} Hull`, '#ff8a70'); this.audio.chime();
    }, ['repair', spot, 2]);
  }
  startBurn() {
    const t0 = this.train, spot = new THREE.Vector3().copy(t0.pos).addScaledVector(t0.dir, -4).addScaledVector(t0.right, 2);
    this.startAction('Burning supplies in the firebox', CONFIG.BURN_DURATION, () => {
      const t = this.train; t.supplies -= CONFIG.BURN_SUPPLIES_COST; t.fuel = Math.min(t.maxFuel, t.fuel + CONFIG.BURN_SUPPLIES_FUEL);
      this.ui.floatText(_v.copy(t.pos).setY(5), `+${CONFIG.BURN_SUPPLIES_FUEL} Fuel`, '#ff9a30'); this.audio.chime();
    }, ['burn', spot, 1]);
  }
  startHazardAction(h) {
    const t = this.train, ty = h.type;
    if (t.parts >= ty.cost) {
      this.startAction(`${ty.verb === 'Repair' ? 'Repairing' : ty.verb === 'Dismantle' ? 'Dismantling' : 'Clearing'} ${ty.name}`, ty.time, () => {
        t.parts -= ty.cost; h.clear();
        this.fx.smoke.burst(h.pos.x, 1, h.pos.z, 20, 5, 1.5, 1.5, 0.5, 0.45, 0.4, 0.6, 1, 0.2);
        this.ui.message(`${ty.name} cleared.${ty.cost ? ` −${ty.cost} Parts` : ''}`, 'good'); this.audio.debris(h.key === 'rockfall' ? 'rock' : 'wood'); this.audio.chime();
      }, ['hazard', h.pos, 3]);
    } else {
      this.startAction(`Makeshift repair: ${ty.name}`, CONFIG.MAKESHIFT_REPAIR_TIME, () => {
        h.clear(); this.damageTrain(CONFIG.MAKESHIFT_REPAIR_DAMAGE, null);
        this.ui.message('Makeshift repair done — it cost the hull.', 'warn');
      }, ['hazard', h.pos, 2]);
    }
  }
  completeSalvage(loc) {
    loc.finish(); this.stats.salvaged++;
    this.addLoot(loc.loot, loc.pos);
    this.audio.reward();
    this.ui.message(`Salvaged ${loc.name}`, 'good');
  }
  completeCarriage(loc) {
    loc.finish(); this.stats.salvaged++;
    this.train.addCar(loc.carType);
    const ct = CAR_TYPES[loc.carType];
    this.ui.message(`Coupled ${ct.name}! ${ct.desc}`, 'good');
    this.ui.floatText(_v.copy(loc.pos).setY(5), ct.name.toUpperCase(), '#ff70e0');
    this.audio.chime();
  }
  addLoot(loot, pos) {
    const t = this.train; let y = 5; const col = { fuel: '#ff9a30', parts: '#5ab8ff', supplies: '#7fdc6a', ammo: '#ffd84a' };
    for (const k in loot) {
      let n = loot[k]; if (!n) continue;
      if (k === 'fuel') { n = Math.min(n, Math.floor(t.maxFuel - t.fuel)); t.fuel = Math.min(t.maxFuel, t.fuel + loot[k]); }
      else if (k === 'supplies') {
        n = Math.min(n, t.supplyCap - t.supplies); t.supplies += n; this.stats.suppliesCollected += n;
        if (n < loot[k]) this.ui.message(`Cargo full — left ${loot[k] - n} supplies behind.`, 'warn');
      } else if (k === 'ammo') { n = Math.min(Math.round(n * t.spec.ammo), Math.round(CONFIG.MAX_AMMO * t.spec.ammo) - t.ammo); t.ammo += n; }
      else t[k] += n;
      if (n > 0) { this.ui.floatText(_v.copy(pos).setY(y), `+${n} ${k[0].toUpperCase() + k.slice(1)}`, col[k]); y += 1.8; }
    }
  }

  // ---------- Combat ----------
  updateWeapon(dt) {
    const t = this.train;
    this.fireCool -= dt;
    t.muzzleWorld(_v2);
    let target = null, best = CONFIG.WEAPON_RANGE;
    for (const e of this.enemies) {
      if (!e.alive || (e.incoming || 0) >= e.hp) continue; // already doomed by rounds in flight: don't waste ammo
      const d = Math.hypot(e.pos.x - _v2.x, e.pos.z - _v2.z);
      if (d < best) { best = d; target = e; }
    }
    t.aim(target ? target.pos : null, dt);
    if (!this.input.isDown('fire') || this.fireCool > 0) return;
    const pressed = this.input.wasPressed('fire');
    if (!target) { if (pressed) { this.ui.message('No target in range.', 'warn'); this.audio.deny(); } return; }
    if (t.ammo <= 0) { if (pressed) { this.ui.message('Out of ammunition!', 'bad'); this.audio.deny(); } return; }
    const spec = t.spec;
    t.ammo--; this.fireCool = CONFIG.WEAPON_COOLDOWN * spec.cooldown; t.onFire(); this.audio.shot(spec.model);
    const hit = Math.random() > CONFIG.WEAPON_FAR_MISS * (best / CONFIG.WEAPON_RANGE) ** 2;
    const speed = 170, tof = best / speed;
    // Lead the target; misses land in the dirt nearby.
    const aim = new THREE.Vector3().copy(target.pos).addScaledVector(target.vel, tof).setY(target.pos.y + 1.1);
    if (!hit) { aim.x += (Math.random() - 0.5) * 7; aim.z += (Math.random() - 0.5) * 7; aim.y = 0.2; }
    this.fx.fire.burst(_v2.x, _v2.y, _v2.z, 6, 7, 0.12, 0.7, 1, 0.8, 0.3, 1, 0, 0.2);
    this.fx.smoke.emit(_v2.x, _v2.y, _v2.z, 0, 1, 0, 0.8, 0.6, 1.6, 0.5, 0.48, 0.45, 0.35, 0.2);
    const dmg = CONFIG.WEAPON_DAMAGE * spec.damage;
    if (hit) target.incoming = (target.incoming || 0) + dmg;
    this.projectiles.fire('bullet', _v2, aim, speed, (p) => {
      if (hit) target.incoming -= dmg;
      if (hit && target.alive) {
        this.fx.fire.burst(p.x, p.y, p.z, 12, 10, 0.35, 0.35, 1, 0.7, 0.25, 1, -12, 0.6);
        target.damage(dmg); this.audio.hit();
      } else this.fx.smoke.burst(p.x, 0.3, p.z, 7, 3, 0.8, 0.9, 0.55, 0.5, 0.42, 0.6, -2, 0.8);
    });
  }

  enemyAttack(e, point) {
    const zone = zoneIndex(this.train.pos.z);
    const dmg = e.t.damage * CONFIG.ENEMY_DAMAGE * (1 + ZONES[zone].threat);
    if (e.t.melee) {
      this.damageTrain(dmg, point);
      return;
    }
    const from = new THREE.Vector3().copy(e.pos).setY(e.pos.y + 2);
    const aim = new THREE.Vector3().copy(point); aim.x += (Math.random() - 0.5) * 2; aim.z += (Math.random() - 0.5) * 2;
    const hit = Math.random() < CONFIG.ENEMY_HIT_CHANCE;
    if (!hit) { aim.x += (Math.random() - 0.5) * 9; aim.y = 0.3; }
    this.fx.fire.burst(from.x, from.y, from.z, 4, 5, 0.1, 0.6, 1, 0.6, 0.2, 1, 0, 0.2);
    if (e.type === 'truck') {
      // Gun trucks fire slow rockets: blast damage near the impact point.
      this.audio.rocket(e.pos.distanceTo(this.train.pos));
      this.projectiles.fire('rocket', from, aim, 38, (p) => {
        this.fx.fire.burst(p.x, p.y, p.z, 26, 11, 0.6, 0.9, 1, 0.55, 0.15, 1, -6, 0.5);
        this.fx.smoke.burst(p.x, p.y, p.z, 12, 4, 2.2, 2, 0.2, 0.19, 0.18, 0.7, 1.5, 0.6);
        this.audio.explosion(p.distanceTo(this.train.pos));
        if (this.train.nearestPart(p, _v3) < 7) this.damageTrain(dmg * 1.3, p);
      });
    } else {
      this.audio.enemyShot(e.pos.distanceTo(this.train.pos));
      this.projectiles.fire('ebullet', from, aim, 120, (p) => { if (hit) this.damageTrain(dmg, p); else this.fx.smoke.burst(p.x, 0.3, p.z, 5, 3, 0.6, 0.8, 0.55, 0.5, 0.42, 0.6, -2, 0.8); });
    }
  }

  damageTrain(amount, point) {
    const t = this.train, real = t.damage(amount);
    this.stats.damageTaken += real;
    this.ui.damageFlash(0.15 + real / 25);
    this.camCtl.shake = Math.min(1, this.camCtl.shake + real / 15);
    if (point) this.fx.fire.burst(point.x, point.y, point.z, 12, 8, 0.4, 0.3, 1, 0.8, 0.3, 1, -12, 0.5);
    this.audio.impact();
    if (point) this.ui.floatText(point, `-${Math.round(real)}`, '#ff6a50');
  }

  onEnemyDetected(e) {
    if (this.time - this.lastDetect < 12) return;
    this.lastDetect = this.time;
    this.ui.message(`${ENEMY_TYPES[e.type].name}s spotted! [Space] to fire`, 'warn');
    this.audio.warn();
  }
  onEnemyKilled(e) {
    this.stats.kills++;
    const p = e.pos;
    this.fx.fire.burst(p.x, p.y + 1, p.z, 30, 12, 0.7, 0.9, 1, 0.55, 0.15, 1, -6, 0.5);
    this.fx.smoke.burst(p.x, p.y + 1, p.z, 16, 4, 2.5, 2.2, 0.15, 0.14, 0.13, 0.7, 1.5, 0.6);
    this.audio.explosion();
    const loot = {};
    if (e.type === 'raider' && Math.random() < 0.5) loot.ammo = 3;
    if (e.type === 'truck') { loot.parts = 1; loot.ammo = 5; }
    if (e.type === 'crawler' && Math.random() < 0.25) loot.supplies = 2;
    if (Object.keys(loot).length) this.addLoot(loot, p);
  }

  hitDebris(h, speed) {
    h.clear(); this.audio.debris();
    this.fx.smoke.burst(h.pos.x, 1, h.pos.z, 18, 7, 1.2, 1.2, 0.4, 0.36, 0.3, 0.7, -3, 0.6);
    if (speed > CONFIG.HAZARD_SAFE_SPEED) {
      const dmg = (speed - 4) * CONFIG.HAZARD_DAMAGE_PER_SPEED;
      this.damageTrain(dmg, _v.copy(h.pos).setY(1.5));
      this.ui.message(`Hit ${h.type.name.toLowerCase()} at speed!`, 'bad');
    } else this.ui.message(`Pushed through the ${h.type.name.toLowerCase()} safely.`, 'good');
  }
  onCrash(what, v, h) {
    const dmg = v * CONFIG.CRASH_DAMAGE_PER_SPEED;
    this.damageTrain(dmg, _v.copy(this.train.pos).addScaledVector(this.train.dir, FRONT).setY(2));
    this.camCtl.shake = 1;
    this.ui.message(`CRASHED into the ${what.toLowerCase()} at ${Math.round(v * 3.6)} km/h!`, 'bad');
  }

  // ---------- Events ----------
  updateTriggers(dt) {
    const t = this.train, rng = this.rng;
    for (const tr of this.triggers) {
      if (tr.fired || tr.seg !== t.seg || t.dist < tr.d) continue;
      tr.fired = true;
      for (const type of tr.types) {
        const d = Math.min(tr.d + rrange(rng, 40, 80), tr.seg.length);
        tr.seg.pointAt(d, (rng() < 0.5 ? -1 : 1) * rrange(rng, 25, 45), 0, _v);
        this.spawnEnemy(type, _v.x, _v.z);
      }
      if (tr.types.length) {
        this.ui.message(tr.types.includes('crawler') ? 'Something is moving in the snow…' : 'AMBUSH! Raiders closing in!', 'bad');
        this.audio.warn(); this.lastDetect = this.time;
      }
    }
    // Random roaming threats, more frequent further north.
    this.roamT -= dt;
    if (this.roamT <= 0) {
      const zone = zoneIndex(t.pos.z), [a, b] = ZONES[zone].roam;
      this.roamT = rrange(rng, a, b);
      const alive = this.enemies.filter((e) => e.alive && e.state !== 'idle').length;
      const nearEnd = t.seg.id === STATION_SEGMENT;
      if (alive < CONFIG.MAX_ENEMIES && !nearEnd) {
        const types = pick(rng, ZONES[zone].spawn);
        t.sampleAt(-rrange(rng, 90, 130), _s);
        for (const type of types) {
          const side = rng() < 0.5 ? -1 : 1, lat = rrange(rng, 30, 50);
          this.spawnEnemy(type, _s.x + Math.cos(_s.h) * lat * side, _s.z + Math.sin(_s.h) * lat * side);
        }
      }
    }
  }

  onEnterSegment(seg) {
    if (this.state !== STATE.PLAYING) return;
    if (seg.kind === 'spur') this.ui.message('Dead-end spur. Hold S when stopped to reverse back out.', 'warn');
    else if (seg.kind !== 'main') this.ui.message(`Entering ${seg.name}`, seg.kind === 'danger' ? 'warn' : '');
  }

  // ---------- HUD helpers ----------
  hazardAhead() {
    const t = this.train, front = t.dist + FRONT;
    let best = null;
    const nxt = t.seg.next.length ? t.seg.next[t.seg.next.length > 1 ? t.choice : 0] : null;
    for (const h of this.hazards) {
      if (!h.active) continue;
      let d = null;
      if (h.seg === t.seg && h.dist > front - 1) d = h.dist - front;
      else if (h.seg === nxt) d = t.seg.length - front + h.dist;
      if (d !== null && d < 170 && (!best || d < best.dist)) best = { h, dist: Math.max(0, d) };
    }
    return best;
  }

  promptInfo() {
    const t = this.train;
    if (this.action) {
      const p = this.action.t / this.action.dur;
      return { text: `${this.action.label}... ${Math.floor(p * 100)}%`, progress: p, sub: 'Keep the train stopped' };
    }
    const hints = [];
    if (this.canRepair() && t.health < t.maxHealth * 0.85) hints.push(`[R] Patch hull (−${CONFIG.REPAIR_COST} Parts, +${CONFIG.REPAIR_AMOUNT})`);
    if (this.canBurn() && t.fuel < t.maxFuel * 0.3) hints.push(`[F] Burn ${CONFIG.BURN_SUPPLIES_COST} supplies → ${CONFIG.BURN_SUPPLIES_FUEL} fuel`);
    if (!t.stopped) {
      for (const l of this.locations) if (!l.done && t.nearestPart(l.pos, _v) < CONFIG.SALVAGE_RADIUS) return { text: `Stop the train to ${l.carType ? 'couple' : 'salvage'}: ${l.name}` };
      return null;
    }
    const c = this.cand;
    if (c?.kind === 'hazard') {
      const ty = c.h.type;
      if (t.parts >= ty.cost) return { text: `[E] ${ty.verb} ${ty.name}${ty.cost ? ` (−${ty.cost} Parts)` : ''}`, sub: hints.join('   ') };
      return { text: `[E] Makeshift repair: ${ty.name}`, sub: `Not enough Parts (${ty.cost}) — slow, damages hull` };
    }
    if (c?.kind === 'salvage') return { text: `[E] Salvage ${c.loc.name}`, sub: `Likely: ${c.loc.lootText}   ${hints.join('   ')}` };
    if (c?.kind === 'carriage') return { text: `[E] Couple ${c.loc.name}`, sub: `${c.loc.lootText}   ${hints.join('   ')}` };
    if (hints.length) return { text: hints[0], sub: hints.slice(1).join('   ') };
    return null;
  }

  objectiveText() {
    const t = this.train;
    if (t.fuel <= 0) return '<b style="color:#ff8a6a">OUT OF FUEL</b> — salvage fuel nearby or burn supplies [F].';
    if (t.seg.id === STATION_SEGMENT) return 'The Evacuation Station is ahead. <b>Brake and stop at the platform.</b>';
    if (t.seg.kind === 'spur') return 'Rail Yard spur (dead end). Salvage, couple the tanker, then <b>reverse out</b> (hold S).';
    if (t.fuel < t.maxFuel * 0.2) return 'Reach the Evacuation Station. <b style="color:#ffb070">Fuel low</b> — find <span style="color:#ff9a30">orange beacons</span>.';
    return 'Reach the <b>Northern Evacuation Station</b>. Stop at beacons to salvage.';
  }

  checkWarnings() {
    const t = this.train;
    if (t.fuel < t.maxFuel * 0.15 && !this.lowFuelWarned) { this.lowFuelWarned = true; this.ui.message('Fuel critical! Coast where you can.', 'bad'); this.audio.warn(); }
    if (t.fuel > t.maxFuel * 0.25) this.lowFuelWarned = false;
    if (t.health < t.maxHealth * 0.3 && !this.lowHpWarned) { this.lowHpWarned = true; this.ui.message('Hull critical! Stop and patch with Parts [R].', 'bad'); this.audio.warn(); }
    if (t.health > t.maxHealth * 0.4) this.lowHpWarned = false;
  }

  // ---------- End conditions ----------
  checkEnd(dt) {
    const t = this.train;
    if (t.health <= 0) return this.startDying();
    if (t.fuel <= 0 && Math.abs(t.speed) < 0.05 && !this.action) {
      const fuelHere = this.locations.some((l) => !l.done && (l.loot.fuel || l.carType === 'tanker') && t.nearestPart(l.pos, _v) < CONFIG.SALVAGE_RADIUS);
      if (!fuelHere && t.supplies < CONFIG.BURN_SUPPLIES_COST) {
        this.strandT += dt;
        if (this.strandT > CONFIG.STRAND_TIME) return this.endGame(false, 'Out of fuel and stranded in the wilderness.');
      } else this.strandT = 0;
    } else this.strandT = 0;
    if (t.seg.id === STATION_SEGMENT && t.dist >= t.seg.length - STATION_PLATFORM && t.stopped) this.endGame(true, 'The evacuation station opens its gates. Survivors pour onto the platform.');
  }

  // Train destroyed: chained explosions, wreck thrown off the rails, then the loss screen.
  startDying() {
    const t = this.train;
    this.action = null; this.crew.finish(true);
    this.dying = { t: 0, next: 0, parts: [] };
    const groups = [t.loco.group, ...t.cars.map((c) => c.group)];
    groups.forEach((g, i) => {
      const side = i % 2 ? 1 : -1;
      this.dying.parts.push({ g, vel: new THREE.Vector3().copy(t.dir).multiplyScalar(t.speed * 0.6).addScaledVector(t.right, side * (2 + Math.random() * 3)).setY(4 + Math.random() * 4 - i * 0.6),
        spin: new THREE.Vector3((Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.2, side * (0.8 + Math.random())), delay: i * 0.35 });
    });
    for (const m of [t.loco.bodyMat, ...t.cars.map((c) => c.mat)]) { m.color.setRGB(0.25, 0.22, 0.2); m.emissive.setRGB(0.25, 0.06, 0); }
    this.audio.bigExplosion(); this.camCtl.shake = 1;
    this.ui.message('THE ENGINE IS GOING UP!', 'bad');
  }
  updateDying(dt) {
    const D = this.dying; D.t += dt;
    const fx = this.fx;
    for (const p of D.parts) {
      if (D.t < p.delay) continue;
      if (!p.boom) { p.boom = true; const q = p.g.position; this.bigExplosion(q.x, 2, q.z); }
      p.vel.y -= 14 * dt;
      p.g.position.addScaledVector(p.vel, dt);
      if (p.g.position.y < 0) { p.g.position.y = 0; p.vel.multiplyScalar(0.4); p.vel.y = Math.abs(p.vel.y) * 0.3; p.spin.multiplyScalar(0.5); }
      p.g.rotation.x += p.spin.x * dt; p.g.rotation.y += p.spin.y * dt; p.g.rotation.z += p.spin.z * dt * (p.g.rotation.z > 1.4 ? 0 : 1);
      if (Math.random() < 0.5) { const q = p.g.position; fx.fire.emit(q.x + (Math.random() - 0.5) * 3, q.y + 2, q.z + (Math.random() - 0.5) * 5, 0, 3 + Math.random() * 2, 0, 0.6, 1.8, 0.5, 1, 0.5, 0.15, 0.9, 0);
        fx.smoke.emit(q.x, q.y + 3, q.z, (Math.random() - 0.5), 3, (Math.random() - 0.5), 3.5, 2.2, 2.5, 0.1, 0.09, 0.08, 0.7, 0.3); }
    }
    D.next -= dt;
    if (D.next <= 0 && D.t < 2.6) {
      D.next = 0.22 + Math.random() * 0.2;
      const p = D.parts[Math.floor(Math.random() * D.parts.length)].g.position;
      this.bigExplosion(p.x + (Math.random() - 0.5) * 4, 1.5, p.z + (Math.random() - 0.5) * 6, 0.6);
    }
    this.camCtl.shake = Math.max(this.camCtl.shake, 0.5 * (1 - D.t / 3.5));
    this.projectiles.update(dt); fx.smoke.update(dt); fx.fire.update(dt); this.tracers.update(dt); this.crew.update(dt);
    for (const e of this.enemies) if (!e.alive) e.update(dt);
    if (D.t > 3.6) this.endGame(false, 'The train was destroyed.');
  }
  bigExplosion(x, y, z, k = 1) {
    const fx = this.fx;
    fx.fire.burst(x, y, z, Math.round(45 * k), 16 * k, 0.9, 1.4 * k, 1, 0.55, 0.15, 1, -5, 0.6);
    fx.fire.burst(x, y, z, Math.round(20 * k), 24 * k, 1.2, 0.35, 1, 0.8, 0.4, 1, -14, 0.9);
    for (let i = 0; i < 14 * k; i++) fx.smoke.emit(x, y + 1, z, (Math.random() - 0.5) * 8, 2 + Math.random() * 5, (Math.random() - 0.5) * 8, 3 + Math.random() * 2, 2.5 * k, 3, 0.12, 0.11, 0.1, 0.8, 0.5);
    this.audio.explosion(); this.camCtl.shake = Math.min(1, this.camCtl.shake + 0.5 * k); this.ui.damageFlash(0.4 * k);
  }

  score(victory) {
    const t = this.train, s = this.stats;
    return Math.round(s.distance / 10 + t.supplies * 10 + s.kills * 25 + s.salvaged * 30 +
      (victory ? 1000 + t.health * 3 + t.fuel * 2 + t.parts * 10 + t.ammo * 2 : 0));
  }

  endGame(victory, reason) {
    if (this.ended) return;
    this.ended = true;
    const t = this.train, s = this.stats;
    const mm = Math.floor(s.time / 60), ss = String(Math.floor(s.time % 60)).padStart(2, '0');
    const rows = [
      ['Journey time', `${mm}:${ss}`],
      ['Distance travelled', `${(s.distance / 1000).toFixed(2)} km`],
      ['Remaining hull', `${Math.ceil(t.health)} / ${t.maxHealth}`],
      ['Remaining fuel', `${Math.ceil(t.fuel)} / ${t.maxFuel}`],
      ['Supplies recovered', `${t.supplies} delivered (${s.suppliesCollected} collected)`],
      ['Enemies defeated', s.kills],
      ['Locations salvaged', s.salvaged],
      ['Train', t.carNames().join(', ')],
    ];
    const score = this.score(victory);
    const saved = saveRun({ date: Date.now(), victory, reason, score, time: Math.round(s.time), distance: Math.round(s.distance), supplies: t.supplies,
      kills: s.kills, salvaged: s.salvaged, hull: Math.ceil(t.health), train: t.spec.name, cars: t.cars.length + 1 });
    this.lastRunId = saved.id;
    this.ui.showEnd(victory, reason, rows, score, saved.placed);
    this.action = null;
    if (victory) this.audio.victory(); else this.audio.gameOver();
    this.setState(victory ? STATE.VICTORY : STATE.GAME_OVER);
  }
}
