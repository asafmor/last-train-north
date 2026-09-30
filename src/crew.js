import * as THREE from 'three';
import { P, merge, MAT } from './util.js';

// Train crew: small animated workers who climb down when the player starts an E/R/F action,
// walk to the job, work (hammer / dig / carry crates), and climb back aboard afterwards.
const WALK = 3.6, RUN = 6.5;
let GEO = null;
function geo() {
  if (GEO) return GEO;
  GEO = {
    torso: merge([P('box', '#3a4a5a', 0, 0, 0, 0.5, 0.62, 0.3), P('box', '#ff8a1a', 0, 0.02, 0, 0.53, 0.46, 0.33), P('box', '#e8e0a0', 0, 0.02, 0.17, 0.5, 0.06, 0.01)]),
    head: merge([P('sph', '#c99a78', 0, 0, 0, 0.3, 0.32, 0.3), P('sph', '#f0c020', 0, 0.1, 0, 0.36, 0.2, 0.36), P('box', '#f0c020', 0, 0.06, -0.14, 0.34, 0.04, 0.16)]),
    limb: merge([P('box', '#2f3a48', 0, -0.25, 0, 0.16, 0.5, 0.16)]),
    arm: merge([P('box', '#ff8a1a', 0, -0.12, 0, 0.13, 0.26, 0.13), P('box', '#c99a78', 0, -0.36, 0, 0.11, 0.22, 0.11)]),
    hammer: merge([P('box', '#6a4a30', 0, -0.25, 0, 0.05, 0.5, 0.05), P('box', '#555', 0, -0.52, 0, 0.1, 0.12, 0.3)]),
    shovel: merge([P('box', '#6a4a30', 0, -0.35, 0, 0.05, 0.8, 0.05), P('box', '#777', 0, -0.8, 0, 0.22, 0.25, 0.04)]),
    crate: merge([P('box', '#8a6a40', 0, 0, 0, 0.55, 0.45, 0.45), P('box', '#6a4a28', 0, 0, 0.23, 0.57, 0.08, 0.02)]),
  };
  return GEO;
}

class Worker {
  constructor(parent) {
    const G = geo();
    this.root = new THREE.Group(); this.root.scale.setScalar(1.45);
    const m = (g) => { const x = new THREE.Mesh(g, MAT.vc); x.castShadow = true; return x; };
    this.hip = new THREE.Group(); this.hip.position.y = 0.72; this.root.add(this.hip);
    this.torso = m(G.torso); this.torso.position.y = 0.33; this.hip.add(this.torso);
    this.head = m(G.head); this.head.position.y = 0.82; this.hip.add(this.head);
    this.legL = m(G.limb); this.legL.position.set(-0.13, 0.02, 0); this.legR = m(G.limb); this.legR.position.set(0.13, 0.02, 0);
    this.armL = m(G.arm); this.armL.position.set(-0.33, 0.6, 0); this.armR = m(G.arm); this.armR.position.set(0.33, 0.6, 0);
    this.hip.add(this.legL, this.legR, this.armL, this.armR);
    this.tool = { hammer: m(G.hammer), shovel: m(G.shovel) };
    for (const t of Object.values(this.tool)) { t.position.set(0, -0.45, 0); t.rotation.x = Math.PI / 2; t.visible = false; this.armR.add(t); }
    this.crate = m(G.crate); this.crate.position.set(0, 0.5, -0.35); this.crate.visible = false; this.hip.add(this.crate);
    parent.add(this.root);
    this.phase = Math.random() * 6;
  }
}

export class CrewManager {
  constructor(game) { this.game = game; this.group = new THREE.Group(); game.scene.add(this.group); this.workers = []; this.idle = []; this.job = null; }

  // kind: 'salvage' | 'hazard' | 'repair' | 'burn' | 'couple'; target: world point of the job.
  start(kind, target, count) {
    this.job = { kind, target: target.clone(), active: true };
    const tr = this.game.train;
    for (let i = 0; i < count; i++) {
      const w = this.idle.pop() || new Worker(this.group);
      w.root.visible = true;
      // Climb down from the cab/car doors on the side facing the job.
      const side = Math.sign((target.x - tr.pos.x) * tr.right.x + (target.z - tr.pos.z) * tr.right.z) || 1;
      const part = tr.partPos[Math.min(i % 2, tr.partPos.length - 1)];
      w.home = new THREE.Vector3().copy(part).addScaledVector(tr.right, side * 1.9);
      w.root.position.copy(w.home); w.root.position.y = 1.4;
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.6, r = kind === 'repair' || kind === 'burn' ? 1.2 : 2.5 + Math.random() * 1.5;
      w.spot = new THREE.Vector3(target.x + Math.cos(a) * r, 0, target.z + Math.sin(a) * r);
      w.state = 'walk'; w.t = 0; w.carry = false; w.delay = i * 0.35;
      for (const t of Object.values(w.tool)) t.visible = false;
      const tool = kind === 'salvage' ? (i % 2 ? 'shovel' : 'hammer') : kind === 'burn' ? 'shovel' : kind === 'couple' ? null : 'hammer';
      if (tool) w.tool[tool].visible = true;
      w.crate.visible = false;
      this.workers.push(w);
    }
  }
  // Job finished or interrupted: everyone heads back aboard (running if interrupted).
  finish(interrupted = false) {
    if (!this.job) return;
    this.job.active = false; this.job = null;
    for (const w of this.workers) { w.state = 'return'; w.run = interrupted; for (const t of Object.values(w.tool)) t.visible = false; }
  }
  clear() {
    for (const w of this.workers) { w.root.visible = false; this.idle.push(w); }
    this.workers.length = 0; this.job = null;
  }

  update(dt) {
    const g = this.game, world = g.world, tr = g.train;
    for (let i = this.workers.length - 1; i >= 0; i--) {
      const w = this.workers[i], p = w.root.position;
      w.phase += dt; w.t += dt;
      if (w.delay > 0) { w.delay -= dt; p.y = Math.max(0, p.y - dt * 3); continue; }
      let dest = null, speed = WALK;
      if (w.state === 'walk') dest = w.spot;
      else if (w.state === 'carry') dest = w.home;
      else if (w.state === 'return') { dest = w.home; speed = w.run ? RUN : WALK; if (!tr.stopped) { w.home.copy(tr.partPos[0]).addScaledVector(tr.right, 1.9); speed = RUN * 1.5; } }
      let moving = false;
      if (dest) {
        const dx = dest.x - p.x, dz = dest.z - p.z, d = Math.hypot(dx, dz);
        if (d > 0.25) {
          const s = Math.min(d, speed * dt); p.x += dx / d * s; p.z += dz / d * s;
          w.root.rotation.y = Math.atan2(-dx, -dz); moving = true;
        } else if (w.state === 'walk') { w.state = 'work'; w.t = 0; }
        else if (w.state === 'carry') { w.state = 'walk'; w.crate.visible = false; }
        else if (w.state === 'return') { w.root.visible = false; this.idle.push(w); this.workers.splice(i, 1); continue; }
      }
      p.y = Math.max(-0.1, world.heightAt(p.x, p.z));
      if (w.state === 'work' && this.job) {
        const tgt = this.job.target; w.root.rotation.y = Math.atan2(-(tgt.x - p.x), -(tgt.z - p.z));
        // Salvagers periodically haul a crate back to the train.
        if (this.job.kind === 'salvage' && w.t > 2.2 + (i % 3) && i % 2 === 0) { w.state = 'carry'; w.crate.visible = true; }
      }
      this.pose(w, moving, speed);
    }
  }

  pose(w, moving, speed) {
    const t = w.phase;
    if (moving) {
      const f = speed * 2.4, s = Math.sin(t * f) * (speed > WALK ? 0.9 : 0.6);
      w.legL.rotation.x = s; w.legR.rotation.x = -s;
      w.armL.rotation.x = w.crate.visible ? 1.3 : -s * 0.8; w.armR.rotation.x = w.crate.visible ? 1.3 : s * 0.8;
      w.hip.position.y = 0.72 + Math.abs(Math.cos(t * f)) * 0.06; w.hip.rotation.x = speed > WALK ? -0.25 : -0.05;
    } else if (w.state === 'work') {
      const kind = this.job?.kind;
      w.legL.rotation.x = 0.35; w.legR.rotation.x = -0.25;
      if (kind === 'salvage' && w.tool.shovel.visible || kind === 'burn') {
        const c = Math.sin(t * 5); // dig / shovel coal
        w.hip.rotation.x = -0.45 - c * 0.2; w.hip.position.y = 0.62; w.armL.rotation.x = 0.9 + c * 0.5; w.armR.rotation.x = 0.9 + c * 0.5;
      } else if (kind === 'couple') {
        w.hip.rotation.x = -0.2; w.hip.position.y = 0.7; w.armL.rotation.x = 1.4; w.armR.rotation.x = 1.4 + Math.sin(t * 3) * 0.2;
      } else {
        // Hammer swing with a spark on each strike.
        const c = (t * 2.2) % 1, sw = c < 0.6 ? 1.0 + 1.8 * (c / 0.6) : 2.8 - 1.8 * ((c - 0.6) / 0.4);
        w.hip.rotation.x = -0.3; w.hip.position.y = 0.66; w.armR.rotation.x = sw; w.armL.rotation.x = 0.6;
        if (c < w.lastC) {
          const q = w.root.position, fx = this.game.fx.fire, dir = w.root.rotation.y;
          fx.burst(q.x - Math.sin(dir) * 0.7, q.y + 0.3, q.z - Math.cos(dir) * 0.7, 5, 4, 0.3, 0.18, 1, 0.8, 0.35, 1, -12, 0.8);
        }
        w.lastC = c;
      }
    } else {
      w.legL.rotation.x = w.legR.rotation.x = 0; w.armL.rotation.x = w.armR.rotation.x = 0; w.hip.rotation.x = 0; w.hip.position.y = 0.72;
    }
  }
}
