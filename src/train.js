import * as THREE from 'three';
import { CONFIG, CAR_TYPES, TRAIN_TYPES } from './config.js';
import { buildLocomotive, buildCar } from './models.js';
import { clamp, lerp, damp } from './util.js';

const FRONT = 6;          // loco centre to front coupler
const GAP = 0.8;          // coupler gap between vehicles
const _s = { x: 0, z: 0, h: 0 }, _s2 = { x: 0, z: 0, h: 0 };
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const DARK = new THREE.Color(0.45, 0.4, 0.36), WHITE = new THREE.Color(1, 1, 1);

// The train is the player: vehicle, inventory, weapon platform and health pool.
export class Train {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.pos = new THREE.Vector3(); this.dir = new THREE.Vector3(0, 0, -1); this.right = new THREE.Vector3(1, 0, 0);
    this.partPos = []; // world centres of loco + cars, refreshed each frame
  }

  reset(network, seg, dist, typeKey = 'ironclad') {
    for (const c of this.group.children.slice()) this.group.remove(c);
    this.spec = TRAIN_TYPES[typeKey] || TRAIN_TYPES.ironclad;
    this.loco = buildLocomotive(this.spec.model); this.group.add(this.loco.group);
    this.dead = false;
    this.cars = [];
    this.network = network; this.seg = seg; this.dist = dist; this.stack = [];
    this.choice = 0; this.speed = 0; this.throttle = 0; this.reverseHold = 0; this.wheelAngle = 0;
    this.fuel = CONFIG.STARTING_FUEL; this.health = Math.round(CONFIG.STARTING_HEALTH * this.spec.health);
    this.parts = CONFIG.STARTING_PARTS; this.supplies = CONFIG.STARTING_SUPPLIES; this.ammo = Math.round(CONFIG.STARTING_AMMO * this.spec.ammo);
    this.hitFlash = 0; this.fxT = 0; this.turretYaw = 0; this.recoil = 0; this.flashT = 0;
    this.addCar('cargo', true);
    this.place();
  }

  addCar(type, silent = false) {
    const car = buildCar(type); this.cars.push(car); this.group.add(car.group);
    this.recalc();
    if (!silent) {
      if (type === 'tanker') this.fuel = Math.min(this.maxFuel, this.fuel + 25);
      if (type === 'armored') this.health = Math.min(this.maxHealth, this.health + 40);
    }
    this.place();
  }
  count(type) { return this.cars.filter((c) => c.type === type).length; }
  recalc() {
    this.maxFuel = CONFIG.MAX_FUEL + 60 * this.count('tanker');
    this.maxHealth = Math.round(CONFIG.STARTING_HEALTH * this.spec.health) + 40 * this.count('armored');
    this.armor = this.count('armored') ? 0.25 : 0;
    this.supplyCap = CONFIG.SUPPLY_CAPACITY_BASE + CONFIG.SUPPLY_CAPACITY_PER_CARGO * this.count('cargo');
    this.length = 12 + this.cars.reduce((a, c) => a + c.length + GAP, 0);
  }
  carNames() { return [this.spec.name, ...this.cars.map((c) => CAR_TYPES[c.type].name)]; }

  get stopped() { return Math.abs(this.speed) < CONFIG.STOP_SPEED; }

  // Samples the track `offset` metres behind the loco centre (negative = ahead), following travelled history.
  sampleAt(offset, out) {
    let d = this.dist - offset, s = this.seg, i = this.stack.length - 1;
    while (d < 0 && i >= 0) { s = this.stack[i--]; d += s.length; }
    if (d > s.length && s.next.length) { d -= s.length; s = s.next.length > 1 ? s.next[this.choice] : s.next[0]; }
    return s.sample(d, out);
  }

  updateControls(dt, input) {
    const fwd = input.isDown('up'), back = input.isDown('down');
    let target = 0, braking = false;
    if (fwd && !back) { if (this.speed < -0.2) braking = true; else target = 1; }
    else if (back && !fwd) {
      if (this.speed > 0.2) braking = true;
      else {
        this.reverseHold += dt;
        if (this.reverseHold > CONFIG.REVERSE_ENGAGE_TIME || this.speed < -0.05) target = -1; else braking = true;
      }
    }
    if (!back) this.reverseHold = 0;
    if (this.fuel <= 0) target = 0;
    const rate = target === 0 ? CONFIG.THROTTLE_RESPONSE * 2.5 : CONFIG.THROTTLE_RESPONSE;
    this.throttle += clamp(target - this.throttle, -rate * dt, rate * dt);
    this.braking = braking;
    if (input.wasPressed('left')) this.setChoice(0);
    if (input.wasPressed('right')) this.setChoice(1);
  }
  setChoice(c) {
    if (this.seg.next.length > 1 && this.choice !== c) { this.choice = c; this.game.audio.click(); }
  }

  updatePhysics(dt) {
    const mass = 1 + CONFIG.CAR_MASS_PENALTY * (this.cars.length - 1);
    let a = 0;
    const sp = this.spec;
    if (this.throttle > 0) a = this.throttle * CONFIG.TRAIN_ACCELERATION * sp.accel * Math.max(0, 1 - (Math.max(0, this.speed) / (CONFIG.MAX_TRAIN_SPEED * sp.speed)) ** 2) / mass;
    else if (this.throttle < 0) a = this.throttle * CONFIG.REVERSE_ACCELERATION * Math.max(0, 1 - Math.max(0, -this.speed) / CONFIG.REVERSE_SPEED) / mass;
    this.speed += a * dt;
    // Losses always oppose motion and never reverse it.
    const loss = (CONFIG.ROLLING_FRICTION + CONFIG.DRAG * this.speed * this.speed + (this.braking ? CONFIG.TRAIN_BRAKING : 0)) * dt;
    if (this.speed > 0) this.speed = Math.max(0, this.speed - loss);
    else if (this.speed < 0) this.speed = Math.min(0, this.speed + loss);

    if (this.fuel > 0) {
      const use = (CONFIG.FUEL_IDLE + Math.abs(this.throttle) * CONFIG.FUEL_CONSUMPTION) * sp.fuel * (1 + CONFIG.CAR_FUEL_PENALTY * (this.cars.length - 1));
      this.fuel = Math.max(0, this.fuel - use * dt);
    }
    const ds = this.speed * dt;
    this.move(ds);
    this.game.stats.distance += Math.abs(ds);
    this.wheelAngle -= ds / 0.75;
  }

  move(ds) {
    let d = this.dist + ds;
    if (ds > 0) d = this.checkHazards(d);
    // Forward over junctions / into dead ends.
    while (d > this.seg.length) {
      if (!this.seg.next.length) break;
      const nxt = this.seg.next.length > 1 ? this.seg.next[this.choice] : this.seg.next[0];
      this.stack.push(this.seg); d -= this.seg.length; this.enterSegment(nxt);
    }
    const endLimit = this.seg.next.length ? Infinity : this.seg.length - 1.5 - FRONT;
    if (d > endLimit) { d = endLimit; this.crash('buffer stop'); }
    // Backward through travelled history.
    while (d < 0 && this.stack.length) { const prev = this.stack.pop(); d += prev.length; this.enterSegment(prev); }
    if (!this.stack.length && d < this.length + 2) { d = this.length + 2; if (this.speed < 0) this.speed = 0; }
    this.dist = d;
  }
  enterSegment(seg) { this.seg = seg; this.choice = 0; this.game.onEnterSegment(seg); }

  // Blocking hazards stop the train (crash damage if fast); debris damages above safe speed.
  checkHazards(d) {
    for (const h of this.game.hazards) {
      if (!h.active || h.seg !== this.seg) continue;
      const frontOld = this.dist + FRONT, frontNew = d + FRONT;
      if (h.type.blocking) {
        const stop = h.dist - 1.5;
        if (frontOld <= stop + 0.01 && frontNew > stop) { d = stop - FRONT; this.crash(h.type.name, h); }
      } else if (frontOld < h.dist && frontNew >= h.dist) {
        this.game.hitDebris(h, this.speed);
      }
    }
    return d;
  }
  crash(what, hazard) {
    const v = Math.abs(this.speed);
    if (v > CONFIG.CRASH_SAFE_SPEED) this.game.onCrash(what, v, hazard);
    this.speed = 0; this.throttle = Math.min(this.throttle, 0);
  }

  damage(amount) {
    const real = amount * (1 - this.armor);
    this.health = Math.max(0, this.health - real);
    this.hitFlash = 0.25;
    return real;
  }

  // Positions loco + cars along the travelled path; each car orients from its two bogies.
  place() {
    this.sampleAt(-4, _s); this.sampleAt(4, _s2);
    this.setPose(this.loco.group, _s, _s2);
    this.pos.copy(this.loco.group.position); this.pos.y = 0;
    this.h = this.loco.group.userData.h;
    this.dir.set(Math.sin(this.h), 0, -Math.cos(this.h)); this.right.set(Math.cos(this.h), 0, Math.sin(this.h));
    this.partPos.length = 0; this.partPos.push(this.loco.group.position);
    let off = FRONT + GAP;
    for (const car of this.cars) {
      const c = off + car.length / 2;
      this.sampleAt(c - 3.3, _s); this.sampleAt(c + 3.3, _s2);
      this.setPose(car.group, _s, _s2);
      this.partPos.push(car.group.position);
      off += car.length + GAP;
    }
  }
  setPose(obj, a, b) {
    const h = Math.atan2(a.x - b.x, -(a.z - b.z));
    obj.position.set((a.x + b.x) / 2, 0, (a.z + b.z) / 2);
    obj.rotation.y = -h; obj.userData.h = h;
  }

  // Distances (m) from the loco's front axle to each axle group, for rail-joint clack timing.
  axleOffsets() {
    if (this._axles?.n === this.cars.length) return this._axles.list;
    const list = [2, 9]; let off = FRONT + GAP;
    for (const car of this.cars) { list.push(off + 1.7, off + car.length - 1.7); off += car.length + GAP; }
    this._axles = { n: this.cars.length, list };
    return list;
  }

  nearestPart(p, out) {
    let best = Infinity;
    for (const q of this.partPos) { const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2; if (d < best) { best = d; out.copy(q); } }
    out.y = 2; return Math.sqrt(best);
  }

  aim(target, dt) {
    let want = 0;
    if (target) {
      this.loco.group.localToWorld(_v.copy(this.loco.turret.position));
      want = Math.atan2(-(target.x - _v.x), -(target.z - _v.z)) - this.loco.group.rotation.y;
      want = Math.atan2(Math.sin(want), Math.cos(want));
    }
    let diff = want - this.turretYaw; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.turretYaw += diff * damp(target ? 14 : 3, dt);
    this.loco.turret.rotation.y = this.turretYaw;
  }
  muzzleWorld(out) { return this.loco.turret.localToWorld(out.copy(this.loco.muzzle)); }
  onFire() { this.recoil = 1; this.flashT = 0.06; }

  // Wheels, rods, exhaust, damage smoke, hit flash.
  animate(dt, fx) {
    const L = this.loco;
    for (const w of L.wheels) w.rotation.x = this.wheelAngle * (L.diesel ? 1.66 : 1);
    for (const w of L.smallWheels) w.rotation.x = this.wheelAngle * 1.66;
    for (const car of this.cars) for (const w of car.wheels) w.rotation.x = this.wheelAngle * 1.66;
    for (const r of L.rods) { r.position.y = 0.75 + Math.sin(this.wheelAngle) * 0.35; r.position.z = -0.8 + Math.cos(this.wheelAngle) * 0.35; }
    this.recoil = Math.max(0, this.recoil - dt * 8);
    L.barrel.position.z = this.recoil * 0.35;
    this.flashT -= dt; L.flash.visible = this.flashT > 0;
    if (L.flash.visible) L.flash.material.rotation = Math.random() * 6;

    const hp = this.health / this.maxHealth;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    const tint = lerp(0.55, 1, clamp(hp * 1.4, 0, 1));
    const mats = [L.bodyMat, ...this.cars.map((c) => c.mat)];
    for (const m of mats) { m.color.copy(DARK).lerp(WHITE, tint); m.emissive.setRGB(this.hitFlash * 1.6, this.hitFlash * 0.3, 0); }

    this.fxT -= dt;
    if (this.fxT > 0) return;
    this.fxT = 0.045;
    const g = L.group;
    const smoke = fx.smoke, fire = fx.fire;
    const work = 0.25 + Math.abs(this.throttle);
    if (this.fuel > 0 && Math.random() < work) {
      g.localToWorld(_v.copy(L.chimney));
      const c = lerp(0.18, 0.55, hp) * (L.diesel ? 0.45 : 1), sz = L.diesel ? 0.6 : 1;
      if (L.diesel) _v.x += (Math.random() < 0.5 ? -0.8 : 0) * Math.cos(this.h), _v.z += 0;
      smoke.emit(_v.x, _v.y, _v.z, -this.dir.x * this.speed * 0.4 + (Math.random() - 0.5), 2.5 + Math.random() * 1.5 + Math.abs(this.throttle) * 2, -this.dir.z * this.speed * 0.4 + (Math.random() - 0.5),
        2.8 * sz, 1.2 * sz, 2.2 * sz, c, c * 0.97, c * 0.94, 0.55, 0.4);
    }
    if (hp < 0.5 && Math.random() < 0.6) {
      g.localToWorld(_v.copy(L.hood)); _v.x += (Math.random() - 0.5) * 1.5;
      smoke.emit(_v.x, _v.y, _v.z, 0, 1.8, 0, 2.2, 0.9, 1.8, 0.12, 0.11, 0.1, 0.6, 0.3);
    }
    if (hp < 0.25) {
      g.localToWorld(_v.copy(L.hood)); _v.x += (Math.random() - 0.5) * 1.8; _v.z += (Math.random() - 0.5) * 3;
      fire.emit(_v.x, _v.y, _v.z, (Math.random() - 0.5), 2 + Math.random() * 2, (Math.random() - 0.5), 0.45, 0.9, -1, 1, 0.45, 0.1, 0.9, 0);
      if (Math.random() < 0.3) fire.burst(_v.x, _v.y, _v.z, 2, 5, 0.5, 0.25, 1, 0.8, 0.3, 1, -9, 0.8);
    }
  }
}
export { FRONT };
