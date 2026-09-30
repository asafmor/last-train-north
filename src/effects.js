import * as THREE from 'three';

// Pooled point particles with per-particle size/colour/alpha. One draw call per system.
export class ParticleSystem {
  constructor(scene, max, additive, map) {
    this.max = max; this.cursor = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.grow = new Float32Array(max); this.grav = new Float32Array(max); this.a0 = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    const attr = (name, arr, n) => g.setAttribute(name, new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage));
    attr('position', this.pos, 3); attr('pcolor', this.col, 3); attr('psize', this.size, 1); attr('palpha', this.alpha, 1);
    this.uniforms = { scale: { value: 800 }, map: { value: map } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `attribute vec3 pcolor; attribute float psize; attribute float palpha; uniform float scale;
        varying vec3 vColor; varying float vAlpha;
        void main() { vColor = pcolor; vAlpha = palpha; vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = max(psize * scale / max(-mv.z, 0.1), 0.0); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vColor; varying float vAlpha;
        void main() { vec4 t = texture2D(map, gl_PointCoord); if (t.a < 0.01) discard;
          gl_FragColor = vec4(vColor * t.rgb, vAlpha * t.a); }`,
    });
    this.points = new THREE.Points(g, mat); this.points.frustumCulled = false;
    scene.add(this.points);
  }
  emit(x, y, z, vx, vy, vz, life, size, grow, r, g, b, alpha, grav = 0) {
    const i = this.cursor; this.cursor = (i + 1) % this.max;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.col[i3] = r; this.col[i3 + 1] = g; this.col[i3 + 2] = b;
    this.life[i] = life; this.maxLife[i] = life; this.size[i] = size; this.grow[i] = grow;
    this.a0[i] = alpha; this.alpha[i] = alpha; this.grav[i] = grav;
  }
  burst(x, y, z, n, speed, life, size, r, g, b, alpha = 1, grav = -9, up = 0.5) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.6);
      this.emit(x, y, z, Math.cos(a) * s, (Math.random() * 0.8 + up) * s, Math.sin(a) * s, life * (0.6 + Math.random() * 0.6), size, 0, r, g, b, alpha, grav);
    }
  }
  update(dt) {
    const drag = Math.max(0, 1 - dt * 1.2);
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.alpha[i] = 0; this.size[i] = 0; continue; }
      const i3 = i * 3;
      this.vel[i3 + 1] += this.grav[i] * dt;
      this.vel[i3] *= drag; this.vel[i3 + 2] *= drag;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.pos[i3 + 1] < 0.05 && this.grav[i] < 0) { this.pos[i3 + 1] = 0.05; this.vel[i3 + 1] *= -0.3; }
      this.size[i] += this.grow[i] * dt;
      this.alpha[i] = this.a0[i] * (this.life[i] / this.maxLife[i]);
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = a.pcolor.needsUpdate = a.psize.needsUpdate = a.palpha.needsUpdate = true;
  }
  clear() { this.life.fill(0); this.alpha.fill(0); this.size.fill(0); }
  setScale(v) { this.uniforms.scale.value = v; }
}

// Pooled bullet tracers: additive line segments that fade to black.
export class Tracers {
  constructor(scene, max = 48) {
    this.max = max; this.cursor = 0;
    this.pos = new Float32Array(max * 6); this.col = new Float32Array(max * 6); this.base = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
    this.lines.frustumCulled = false;
    scene.add(this.lines);
  }
  spawn(a, b, r, g, bl, life = 0.12) {
    const i = this.cursor; this.cursor = (i + 1) % this.max;
    this.pos.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
    this.base.set([r, g, bl], i * 3);
    this.life[i] = life; this.maxLife[i] = life;
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      const k = this.life[i] > 0 ? (this.life[i] -= dt, Math.max(0, this.life[i] / this.maxLife[i])) : 0;
      for (let v = 0; v < 2; v++) for (let c = 0; c < 3; c++) this.col[i * 6 + v * 3 + c] = this.base[i * 3 + c] * k;
    }
    this.lines.geometry.attributes.position.needsUpdate = true;
    this.lines.geometry.attributes.color.needsUpdate = true;
  }
  clear() { this.life.fill(0); }
}

// Physical projectiles: glowing bullets (player/raiders) and smoke-trailing rockets (gun trucks).
// Each flies to a target point and calls onHit on arrival.
const _pv = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
export class Projectiles {
  constructor(scene, fx) {
    this.scene = scene; this.fx = fx; this.list = []; this.pool = { bullet: [], ebullet: [], rocket: [] };
    const slug = new THREE.CylinderGeometry(0.06, 0.06, 1, 6, 1, true); slug.rotateX(Math.PI / 2);
    this.geo = { slug, glow: new THREE.SphereGeometry(0.18, 8, 6) };
    const add = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.mat = { bullet: add(0xffd27a), ebullet: add(0xff6a3a), glowB: add(0xfff0c0), glowE: add(0xff9060) };
    const body = new THREE.CylinderGeometry(0.13, 0.13, 1.3, 8); body.rotateX(Math.PI / 2);
    const nose = new THREE.ConeGeometry(0.13, 0.4, 8); nose.rotateX(-Math.PI / 2); nose.translate(0, 0, -0.85);
    const fin = new THREE.BoxGeometry(0.5, 0.04, 0.3); fin.translate(0, 0, 0.55);
    this.rocketParts = { body, nose, fin, matBody: new THREE.MeshStandardMaterial({ color: 0x5a5e52, metalness: 0.6, roughness: 0.45 }),
      matNose: new THREE.MeshStandardMaterial({ color: 0xa8321e, metalness: 0.3, roughness: 0.5 }) };
  }
  make(type) {
    const g = new THREE.Group();
    if (type === 'rocket') {
      const R = this.rocketParts;
      g.add(new THREE.Mesh(R.body, R.matBody), new THREE.Mesh(R.nose, R.matNose));
      const f1 = new THREE.Mesh(R.fin, R.matBody), f2 = f1.clone(); f2.rotation.z = Math.PI / 2; g.add(f1, f2);
      const flame = new THREE.Mesh(this.geo.glow, this.mat.glowE); flame.position.z = 0.8; flame.scale.set(1.2, 1.2, 2.5); g.add(flame);
    } else {
      const streak = new THREE.Mesh(this.geo.slug, this.mat[type]); streak.scale.set(1.4, 1.4, 3.2); g.add(streak);
      g.add(new THREE.Mesh(this.geo.glow, type === 'bullet' ? this.mat.glowB : this.mat.glowE));
    }
    this.scene.add(g); return g;
  }
  fire(type, from, to, speed, onHit) {
    const mesh = this.pool[type].pop() || this.make(type);
    mesh.visible = true; mesh.position.copy(from); mesh.lookAt(to); mesh.rotateY(Math.PI);
    const dist = from.distanceTo(to);
    this.list.push({ type, mesh, from: from.clone(), to: to.clone(), t: 0, dur: Math.max(0.03, dist / speed), onHit, arc: type === 'rocket' ? Math.min(4, dist * 0.08) : 0, trailT: 0 });
  }
  update(dt) {
    const fx = this.fx;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.t += dt;
      const k = Math.min(1, p.t / p.dur);
      _pv.copy(p.mesh.position);
      p.mesh.position.lerpVectors(p.from, p.to, k);
      p.mesh.position.y += Math.sin(k * Math.PI) * p.arc;
      if (p.type === 'rocket') {
        p.mesh.lookAt(_pv); // face along travel (look back at previous point, model nose is -Z)
        p.trailT -= dt;
        if (p.trailT <= 0) {
          p.trailT = 0.02;
          const q = p.mesh.position;
          fx.smoke.emit(q.x, q.y, q.z, (Math.random() - 0.5) * 0.6, 0.4 + Math.random() * 0.4, (Math.random() - 0.5) * 0.6, 1.6, 0.7, 1.8, 0.62, 0.6, 0.57, 0.55, 0.2);
          fx.fire.emit(q.x, q.y, q.z, 0, 0, 0, 0.12, 0.8, -2, 1, 0.6, 0.2, 0.9, 0);
        }
      }
      if (k >= 1) {
        p.mesh.visible = false; this.pool[p.type].push(p.mesh); this.list.splice(i, 1);
        p.onHit?.(p.to);
      }
    }
  }
  clear() { for (const p of this.list) { p.mesh.visible = false; this.pool[p.type].push(p.mesh); } this.list.length = 0; }
}
