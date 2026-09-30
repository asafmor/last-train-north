import * as THREE from 'three';
import { CONFIG, ENEMY_TYPES } from './config.js';
import { buildEnemy } from './models.js';
import { damp } from './util.js';

const _near = new THREE.Vector3(), _to = new THREE.Vector3(), _dv = new THREE.Vector3();

// Detect → approach → hold attack position → attack → take damage → die.
export class Enemy {
  constructor(game, type, x, z, idle) {
    this.game = game; this.type = type; this.t = ENEMY_TYPES[type];
    this.hp = this.t.hp; this.state = idle ? 'idle' : 'chase';
    this.pos = new THREE.Vector3(x, 0, z); this.vel = new THREE.Vector3();
    this.heading = Math.random() * Math.PI * 2;
    this.side = Math.random() < 0.5 ? -1 : 1;
    this.ahead = (Math.random() - 0.5) * 20;
    this.cool = 0.8 + Math.random();
    this.deadT = 0; this.hitT = 0; this.bob = Math.random() * 10; this.remove = false;
    const m = buildEnemy(type);
    this.root = m.root; this.pivot = m.pivot; this.bg = m.bg; this.fg = m.fg;
    this.bg.visible = this.fg.visible = false; // HTML health bars (ui.updateMarkers) replace these
    this.root.position.copy(this.pos);
    game.runGroup.add(this.root);
    this.updateBar();
  }
  get alive() { return this.state !== 'dead'; }

  update(dt) {
    const g = this.game, tr = g.train;
    this.bob += dt;
    if (this.state === 'dead') {
      this.deadT += dt;
      this.root.position.y -= dt * 0.5;
      if (this.deadT > 3) this.remove = true;
      return;
    }
    const dist = tr.nearestPart(this.pos, _near);
    if (this.state === 'idle') {
      if (dist < CONFIG.ENEMY_DETECT_RANGE) { this.state = 'chase'; g.onEnemyDetected(this); }
      else { this.pivot.position.y = this.t.melee ? Math.abs(Math.sin(this.bob * 1.5)) * 0.1 : 0; return; }
    }
    if (dist > CONFIG.ENEMY_LOSE_RANGE) { this.remove = true; return; }

    // Target point: melee hugs the nearest car, ranged pace the loco on one flank.
    if (this.t.melee) _to.copy(_near).addScaledVector(tr.right, this.side * this.t.standoff);
    else _to.copy(tr.pos).addScaledVector(tr.right, this.side * this.t.standoff).addScaledVector(tr.dir, this.ahead);
    _to.y = 0; _to.sub(this.pos); _to.y = 0;
    const gap = _to.length();
    _dv.copy(tr.dir).multiplyScalar(tr.speed * 0.9);
    if (gap > 0.01) _dv.addScaledVector(_to, Math.min(this.t.speed, gap * 1.3) / gap);
    if (_dv.length() > this.t.speed) _dv.setLength(this.t.speed);
    // Steer velocity toward desired with limited acceleration.
    _dv.sub(this.vel);
    const maxDv = this.t.accel * dt;
    if (_dv.length() > maxDv) _dv.setLength(maxDv);
    this.vel.add(_dv);
    // Keep apart from other enemies.
    for (const o of g.enemies) {
      if (o === this || !o.alive) continue;
      const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z, d2 = dx * dx + dz * dz;
      if (d2 < 16 && d2 > 1e-4) { const k = (4 - Math.sqrt(d2)) * 2 * dt; this.pos.x += dx * k; this.pos.z += dz * k; }
    }
    this.pos.addScaledVector(this.vel, dt);
    this.pos.y = Math.max(-0.15, g.world.heightAt(this.pos.x, this.pos.z));
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > 1) {
      const want = Math.atan2(this.vel.x, -this.vel.z);
      let diff = want - this.heading; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.heading += diff * damp(6, dt);
    }
    this.root.position.copy(this.pos);
    this.pivot.rotation.y = -this.heading;
    if (this.t.melee) this.pivot.position.y = Math.abs(Math.sin(this.bob * (6 + sp * 0.4))) * 0.35;
    else this.pivot.rotation.z = Math.sin(this.bob * 9) * 0.02 * Math.min(sp, 10);
    this.hitT = Math.max(0, this.hitT - dt);
    this.pivot.scale.setScalar(1 + this.hitT * 0.6);

    this.cool -= dt;
    if (dist < this.t.range && this.cool <= 0) {
      this.cool = this.t.cooldown * (0.85 + Math.random() * 0.3);
      g.enemyAttack(this, _near);
    }
  }

  damage(n) {
    if (!this.alive) return;
    this.hp -= n; this.hitT = 0.25;
    if (this.state === 'idle') { this.state = 'chase'; this.game.onEnemyDetected(this); }
    if (this.hp <= 0) { this.hp = 0; this.state = 'dead'; this.game.onEnemyKilled(this); }
    this.updateBar();
  }
  updateBar() { this.fg.scale.x = 2.9 * Math.max(0, this.hp / this.t.hp); }
  dispose() { this.game.runGroup.remove(this.root); }
}
