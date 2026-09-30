import * as THREE from 'three';
import { LOCATION_TYPES, HAZARD_TYPES, CAR_TYPES } from './config.js';
import { prefab } from './prefabs.js';
import { buildCar } from './models.js';
import { MAT, P, merge, rint } from './util.js';
import { LOOT_COLOR } from './ui.js';
import { matFor, TEX } from './assets.js';

// Volumetric-looking light shaft: soft fresnel edges, rising dust streaks, fade with height.
const beamGeo = new THREE.CylinderGeometry(1.1, 1.9, 34, 24, 1, true); beamGeo.translate(0, 17, 0);
const coreGeo = new THREE.CylinderGeometry(0.25, 0.4, 30, 12, 1, true); coreGeo.translate(0, 15, 0);
const glowGeo = new THREE.PlaneGeometry(9, 9); glowGeo.rotateX(-Math.PI / 2);
const BEAM_TIME = { value: 0 };
export function tickBeams(t) { BEAM_TIME.value = t; }
function beamShader(color, strength) {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, time: BEAM_TIME, strength: { value: strength } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 color; uniform float time; uniform float strength; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      float h(float x) { return fract(sin(x * 91.7) * 4375.5); }
      float n1(float x) { float i = floor(x), f = fract(x); return mix(h(i), h(i + 1.0), f * f * (3.0 - 2.0 * f)); }
      void main() {
        vec3 nn = vN / max(length(vN), 1e-4), vv = vV / max(length(vV), 1e-4);
        float edge = pow(clamp(abs(dot(nn, vv)), 0.0, 1.0), 1.6);               // bright centre, soft rim
        float fade = pow(clamp(1.0 - vUv.y, 0.0, 1.0), 1.7) * smoothstep(0.0, 0.04, vUv.y); // strong at base, dissolves upward
        float streak = 0.6 + 0.4 * n1(vUv.x * 18.0 + floor(vUv.y * 3.0)) * (0.6 + 0.4 * sin(vUv.y * 40.0 - time * 3.0 + vUv.x * 30.0));
        float flick = 0.85 + 0.15 * sin(time * 7.0 + vUv.x * 6.0);
        gl_FragColor = vec4(color * (1.2 + fade), clamp(edge * fade * streak * flick * strength, 0.0, 1.0));
      }`,
  });
}
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
let GLOW_TEX = null;
const gemGeo = new THREE.OctahedronGeometry(1.1, 0);
const beaconMats = {};
function beaconMat(key) {
  return beaconMats[key] ||= {
    beam: beamShader(LOOT_COLOR[key], 0.32), core: beamShader(LOOT_COLOR[key], 0.9),
    glow: new THREE.MeshBasicMaterial({ color: LOOT_COLOR[key], map: GLOW_TEX ||= glowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8 }),
    gem: new THREE.MeshBasicMaterial({ color: LOOT_COLOR[key] }),
    icon: TEX['icon_' + key] ? new THREE.SpriteMaterial({ map: TEX['icon_' + key], depthWrite: false }) : null,
  };
}

// A place the player can stop at and press E: salvage site or abandoned carriage.
export class SalvageLocation {
  constructor(game, kind, pos, heading, rng, carType = null) {
    this.game = game; this.pos = pos.clone(); this.done = false;
    this.group = new THREE.Group(); this.group.position.copy(pos); this.group.rotation.y = -heading;
    if (carType) {
      this.carType = carType; this.name = `Abandoned ${CAR_TYPES[carType].name}`; this.time = 3; this.main = 'carriage';
      const stub = new THREE.Mesh(prefab('stub'), matFor('stub')); stub.receiveShadow = true; this.group.add(stub);
      const car = buildCar(carType); car.group.rotation.z = 0.03; this.group.add(car.group);
      car.mat.color.setRGB(0.8, 0.75, 0.7);
      this.loot = {};
    } else {
      const t = LOCATION_TYPES[kind];
      this.name = t.name; this.time = t.time;
      this.loot = {};
      for (const k in t.loot) this.loot[k] = rint(rng, t.loot[k][0], t.loot[k][1]);
      this.main = Object.keys(this.loot).sort((a, b) => this.loot[b] - this.loot[a])[0];
      const m = new THREE.Mesh(prefab(t.prefab), matFor(t.prefab)); m.castShadow = true; m.receiveShadow = true;
      // Sites are modelled with +x facing away from the track; flip for left-side placement.
      this.group.add(m);
    }
    const bm = beaconMat(this.main);
    this.beam = new THREE.Group();
    this.beam.add(new THREE.Mesh(beamGeo, bm.beam), new THREE.Mesh(coreGeo, bm.core));
    this.glow = new THREE.Mesh(glowGeo, bm.glow); this.glow.position.y = 0.15; this.beam.add(this.glow);
    this.moteT = Math.random(); this.col = new THREE.Color(LOOT_COLOR[this.main]);
    if (bm.icon) { this.gem = new THREE.Sprite(bm.icon); this.gem.scale.setScalar(4.5); }
    else this.gem = new THREE.Mesh(gemGeo, bm.gem);
    this.gem.position.y = 9; this.gem.visible = false; // HTML pin (ui.updateMarkers) shows the icon
    this.beacon = new THREE.Group(); this.beacon.add(this.beam, this.gem); this.beacon.position.copy(pos);
    game.runGroup.add(this.group, this.beacon);
  }
  get lootText() {
    if (this.carType) return CAR_TYPES[this.carType].desc;
    return Object.keys(this.loot).map((k) => k[0].toUpperCase() + k.slice(1)).join(', ');
  }
  animate(t, dt = 0.016) {
    if (this.done) return;
    this.glow.scale.setScalar(1 + Math.sin(t * 2.2 + this.pos.x) * 0.12);
    // Dust motes drifting up through the shaft.
    this.moteT -= dt;
    if (this.moteT <= 0) {
      this.moteT = 0.12;
      const a = Math.random() * 6.28, r = Math.random() * 1.2, c = this.col, p = this.pos;
      this.game.fx.fire.emit(p.x + Math.cos(a) * r, p.y + 0.5, p.z + Math.sin(a) * r, 0, 2 + Math.random() * 2, 0, 3, 0.25, -0.05, c.r, c.g, c.b, 0.8, 0.1);
    }
  }
  finish() {
    this.done = true; this.beacon.visible = false;
    if (this.carType) this.group.visible = false;
    else this.group.traverse((o) => { if (o.isMesh) { o.material = MAT.salvaged; } });
  }
}

const HAZ_GEO = {};
function hazardGeo(type) {
  return HAZ_GEO[type] ||= ({
    debris: () => merge([P('box', '#6a5a4a', -0.4, 0.8, 0, 1.4, 0.8, 1.2, 0.2, 0.5, 0.1), P('cyl', '#7a3a2a', 0.8, 0.8, 0.4, 0.8, 1.1, 0.8, 1.4, 0, 0.3),
      P('wheel', '#1d1d1d', 0.2, 0.7, -0.8, 1, 0.4, 1, 0.3), P('box', '#8a8884', -0.8, 0.6, 0.9, 2.2, 0.2, 0.3, 0, 0.7, 0), P('ico', '#5a5046', 0.9, 0.55, -0.5, 1, 0.6, 1)]),
    fallentree: () => merge([P('cyl', '#5a4230', 0, 1.0, 0, 0.8, 9, 0.8, 0, 0.3, Math.PI / 2), P('cone', '#2e4a2c', 3.8, 1.4, -1.2, 2.8, 3, 2.8, 0, 0, Math.PI / 2),
      P('cone', '#365a33', 2.8, 1.3, -0.9, 2.4, 2.6, 2.4, 0, 0, Math.PI / 2 + 0.2), P('ico', '#4a3a2a', -4.2, 0.6, 1.3, 1.4, 1.2, 1.4)]),
    barricade: () => merge([P('box', '#6a4a30', 0, 1.2, 0, 5, 0.3, 0.3, 0, 0, 0.35), P('box', '#6a4a30', 0, 1.2, 0, 5, 0.3, 0.3, 0, 0, -0.35),
      P('box', '#d8d0c0', 0, 1.9, -0.25, 4.4, 0.35, 0.05), P('box', '#c02a1a', -1.2, 1.9, -0.26, 0.6, 0.35, 0.05), P('box', '#c02a1a', 0.2, 1.9, -0.26, 0.6, 0.35, 0.05), P('box', '#c02a1a', 1.6, 1.9, -0.26, 0.6, 0.35, 0.05),
      P('box', '#555', 0, 1.9, 0, 4.8, 0.3, 0.2), P('wheel', '#1d1d1d', -2.2, 0.4, 0.4, 1.2, 0.5, 1.2), P('wheel', '#1d1d1d', 2.3, 0.4, 0.2, 1.2, 0.5, 1.2),
      P('box', '#9a8a60', 0, 0.45, 0.8, 3.4, 0.6, 0.8), P('cone', '#aaa', -0.8, 1.0, -0.6, 0.2, 1, 0.2, -1.2, 0, 0), P('cone', '#aaa', 0.8, 1.0, -0.6, 0.2, 1, 0.2, -1.2, 0, 0)]),
    damagedtrack: () => merge([P('box', '#2a2620', 0, 0.3, 0, 3.6, 0.2, 5), P('box', '#9a9894', -0.9, 0.9, 0.6, 0.14, 0.16, 3.2, 0.4, 0.3, 0.2),
      P('box', '#9a9894', 0.8, 0.7, -0.8, 0.14, 0.16, 3, -0.3, -0.4, 0), P('box', '#5a4332', 1.6, 0.4, 1.5, 2.6, 0.14, 0.34, 0, 0.9, 0.3),
      P('box', '#5a4332', -1.4, 0.4, -1.2, 2.6, 0.14, 0.34, 0.2, -0.7, 0), P('ico', '#4a4038', 0, 0.35, 0, 2.5, 0.4, 3),
      P('cyl6', '#555', 2.6, 1, -2.8, 0.1, 2, 0.1), P('box', '#e8c030', 2.6, 2.1, -2.8, 0.8, 0.8, 0.05, 0, 0, Math.PI / 4)]),
    rockfall: () => merge([P('ico', '#7d8288', -0.8, 1.1, 0, 3, 2.3, 2.6, 0.3, 0.4, 0), P('ico', '#8a8f94', 1.4, 0.9, 0.8, 2.4, 1.9, 2.2, 0, 1, 0.3),
      P('ico', '#6d7278', 0.3, 0.6, -1.4, 1.8, 1.2, 1.6), P('ico', '#eef3f6', -0.7, 2.1, 0, 2.2, 0.5, 1.8, 0.3, 0.4, 0), P('ico', '#7d8288', 2.6, 0.4, -0.6, 1, 0.8, 1)]),
  }[type])();
}

export class Hazard {
  constructor(game, typeKey, seg, dist) {
    this.game = game; this.key = typeKey; this.type = HAZARD_TYPES[typeKey]; this.seg = seg; this.dist = dist; this.active = true;
    this.pos = seg.pointAt(dist, 0, 0, new THREE.Vector3());
    this.mesh = new THREE.Mesh(hazardGeo(typeKey), matFor(typeKey)); this.mesh.castShadow = true;
    this.mesh.position.copy(this.pos); this.mesh.rotation.y = -seg.headingAt(dist);
    game.runGroup.add(this.mesh);
  }
  clear() {
    this.active = false;
    if (this.key === 'damagedtrack') {
      this.mesh.geometry = REPAIRED; // fresh sleepers patch left behind
    } else this.mesh.visible = false;
  }
}
const REPAIRED = merge([P('box', '#8a6a48', 0, 0.3, -1.1, 2.7, 0.15, 0.34), P('box', '#8a6a48', 0, 0.3, 0, 2.7, 0.15, 0.34), P('box', '#8a6a48', 0, 0.3, 1.1, 2.7, 0.15, 0.34)]);
