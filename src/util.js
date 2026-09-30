import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const DEG = Math.PI / 180;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sat = (v) => clamp(v, 0, 1);
export function smooth(e0, e1, x) { const t = sat((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); }
export function damp(rate, dt) { return 1 - Math.exp(-rate * dt); }

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const rrange = (rng, a, b) => a + (b - a) * rng();
export const rint = (rng, a, b) => Math.floor(a + (b - a + 1) * rng());
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

function hash2(x, z) { const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return h - Math.floor(h); }
export function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z) { return vnoise(x, z) * 0.55 + vnoise(x * 2.1, z * 2.1) * 0.3 + vnoise(x * 4.3, z * 4.3) * 0.15; }

// Biome weights by world z (sum to 1). Order along the journey:
// forest farmland -> desert dust flats -> industrial belt -> rocky canyons -> frozen north.
export const BIOMES = ['forest', 'desert', 'ind', 'rocky', 'snow'];
const BIOME_EDGES = [-720, -1480, -2380, -3180];
export function biomeWeights(z, out = {}) {
  const s = BIOME_EDGES.map((e) => smooth(e + 120, e - 120, z));
  out.forest = 1 - s[0];
  out.desert = s[0] * (1 - s[1]);
  out.ind = s[1] * (1 - s[2]);
  out.rocky = s[2] * (1 - s[3]);
  out.snow = s[3];
  return out;
}
export function biomeIndex(z) { let i = 0; for (const e of BIOME_EDGES) if (z < e) i++; return i; }

// ---------- Geometry kit: vertex-coloured, flat-shaded low-poly parts ----------
const BASE = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10, 1),
  cyl6: new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1),
  cone: new THREE.ConeGeometry(0.5, 1, 7, 1),
  ico: new THREE.IcosahedronGeometry(0.5, 0),
  sph: new THREE.SphereGeometry(0.5, 8, 6),
  taper: new THREE.CylinderGeometry(0.3, 0.5, 1, 7, 1),
  wheel: new THREE.CylinderGeometry(0.5, 0.5, 1, 14, 1),
  tri: new THREE.CylinderGeometry(0.5, 0.5, 1, 3, 1),
};
for (const k in BASE) {
  const g = BASE[k].index ? BASE[k].toNonIndexed() : BASE[k];
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  BASE[k] = g;
}
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

function paint(g, color) {
  _c.set(color);
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = _c.r; a[i * 3 + 1] = _c.g; a[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

// One primitive: P(shape, color, position, scale, rotation)
export function P(shape, color, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
  const g = BASE[shape].clone();
  _e.set(rx, ry, rz); _q.setFromEuler(_e);
  _m4.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
  g.applyMatrix4(_m4);
  return paint(g, color);
}

// Merge parts into one flat-shaded geometry.
export function merge(parts) {
  const g = mergeGeometries(parts, false);
  g.computeVertexNormals();
  for (const p of parts) p.dispose();
  return g;
}

// Transformed copy of an already-built geometry (for composing prefabs of prefabs).
export function place(geo, x = 0, y = 0, z = 0, ry = 0, s = 1) {
  const g = geo.clone();
  g.deleteAttribute('normal');
  _e.set(0, ry, 0); _q.setFromEuler(_e);
  _m4.compose(_p.set(x, y, z), _q, _s.set(s, s, s));
  g.applyMatrix4(_m4);
  return g;
}

// Raw triangle soup -> geometry with per-vertex colours.
export function soup(positions, colors) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

export const MAT = {
  vc: new THREE.MeshLambertMaterial({ vertexColors: true }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
  sleeper: new THREE.MeshLambertMaterial({ color: 0x6a5040 }),
};

// Canvas-texture sign sprite.
export function makeLabel(title, sub = '', color = '#ffcf7a', height = 3.2) {
  const W = 512, H = sub ? 150 : 100;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = 'rgba(20,18,14,0.85)';
  ctx.strokeStyle = color; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.roundRect(4, 4, W - 8, H - 8, 14); ctx.fill(); ctx.stroke();
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 50px Segoe UI, sans-serif';
  ctx.fillText(title, W / 2, sub ? 52 : H / 2, W - 30);
  if (sub) { ctx.fillStyle = '#e8dcc0'; ctx.font = '32px Segoe UI, sans-serif'; ctx.fillText(sub, W / 2, 110, W - 30); }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  spr.scale.set(height * W / H, height, 1);
  return spr;
}
