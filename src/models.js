import * as THREE from 'three';
import { P, merge, MAT } from './util.js';
import { TEX } from './assets.js';

const PI = Math.PI;
// Models face local -Z (forward). Loco is 12 m long, cars 10 m.
const WHEEL_BIG = merge([P('wheel', '#262626', 0, 0, 0, 1.5, 0.2, 1.5, 0, 0, PI / 2), P('box', '#9a2a1e', 0, 0, 0, 0.24, 1.3, 0.14), P('box', '#9a2a1e', 0, 0, 0, 0.24, 0.14, 1.3)]);
const WHEEL_SMALL = merge([P('wheel', '#262626', 0, 0, 0, 0.9, 0.2, 0.9, 0, 0, PI / 2), P('box', '#6a6a6a', 0, 0, 0, 0.24, 0.8, 0.12)]);
const ROD = merge([P('box', '#b8b8b0', 0, 0, 0, 0.08, 0.14, 3.9)]);

function addWheel(group, geo, x, y, z, list) {
  const m = new THREE.Mesh(geo, MAT.trainSteel); m.position.set(x, y, z); m.castShadow = true; group.add(m); list.push(m);
}

export function buildLocomotive(kind = 'steam') {
  if (kind === 'diesel') return buildDiesel();
  const g = new THREE.Group();
  const bodyMat = MAT.trainPaint(); bodyMat.emissive = new THREE.Color(0, 0, 0);
  const body = merge([
    P('box', '#2b2b2b', 0, 1.0, 0, 2.4, 0.5, 11.6),
    P('box', '#8a2a1e', 0, 0.95, -5.9, 3, 0.55, 0.4),
    P('box', '#9c5a2c', 0.75, 0.55, -6.5, 1.7, 0.8, 0.25, 0.4, -0.5, 0), P('box', '#9c5a2c', -0.75, 0.55, -6.5, 1.7, 0.8, 0.25, 0.4, 0.5, 0),
    P('cyl', '#3d4a3a', 0, 2.3, -1.4, 2.1, 6.6, 2.1, PI / 2, 0, 0),
    P('cyl', '#262626', 0, 2.3, -5.0, 2.25, 1.0, 2.25, PI / 2, 0, 0),
    P('box', '#7a4a2a', 0, 2.3, -5.55, 2.2, 1.9, 0.2),
    P('taper', '#1c1c1c', 0, 3.8, -4.3, 0.8, 1.3, 0.8, PI, 0, 0),
    P('sph', '#4a5a44', 0, 3.3, -1.8, 1.1, 0.9, 1.3),
    P('box', '#7a4a2a', 1.22, 2.0, -1.5, 0.14, 1.3, 6.4, 0, 0, 0.18), P('box', '#7a4a2a', -1.22, 2.0, -1.5, 0.14, 1.3, 6.4, 0, 0, -0.18),
    P('box', '#3a3a36', 1.35, 1.3, -0.5, 0.5, 0.1, 9), P('box', '#3a3a36', -1.35, 1.3, -0.5, 0.5, 0.1, 9),
    P('box', '#4a5a44', 0, 2.8, 3.6, 2.8, 2.8, 3.6),
    P('box', '#333533', 0, 4.35, 3.6, 3.1, 0.25, 4.0),
    P('box', '#1a2228', 1.41, 3.3, 3.2, 0.05, 0.9, 1.4), P('box', '#1a2228', -1.41, 3.3, 3.2, 0.05, 0.9, 1.4),
    P('box', '#1a2228', 0.7, 3.4, 1.79, 0.8, 0.7, 0.05), P('box', '#1a2228', -0.7, 3.4, 1.79, 0.8, 0.7, 0.05),
    P('box', '#7a4a2a', 1.45, 2.3, 3.6, 0.1, 1.2, 3.4), P('box', '#7a4a2a', -1.45, 2.3, 3.6, 0.1, 1.2, 3.4),
    P('box', '#2b2b2b', 0, 1.9, 5.7, 2.6, 1.4, 0.8),
    P('box', '#8a2a1e', 0, 0.95, 5.9, 3, 0.55, 0.4),
  ]);
  const bodyMesh = new THREE.Mesh(body, bodyMat); bodyMesh.castShadow = true; bodyMesh.receiveShadow = true; g.add(bodyMesh);

  const lamp = new THREE.Mesh(merge([P('cyl', '#fff2c0', 0, 0, 0, 0.6, 0.2, 0.6, PI / 2, 0, 0)]), MAT.glow);
  lamp.position.set(0, 3.1, -5.72); g.add(lamp);
  // Fake light cone so the headlight reads in fog.
  const coneGeo = new THREE.ConeGeometry(3.5, 22, 16, 1, true); coneGeo.translate(0, -11, 0); coneGeo.rotateX(PI / 2 - 0.08);
  const cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: 0xffe8b0, transparent: true, opacity: 0.045, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  cone.position.set(0, 3.1, -5.8); g.add(cone);

  const wheels = [], rods = [];
  for (const z of [-2.6, -0.8, 1.0]) for (const x of [-1.25, 1.25]) addWheel(g, WHEEL_BIG, x, 0.75, z, wheels);
  const smallWheels = [];
  for (const z of [-4.6, 4.6]) for (const x of [-1.2, 1.2]) addWheel(g, WHEEL_SMALL, x, 0.45, z, smallWheels);
  for (const x of [-1.42, 1.42]) { const r = new THREE.Mesh(ROD, MAT.trainSteel); r.position.set(x, 0.75, -0.8); g.add(r); rods.push(r); }

  // Turret on the boiler.
  const turret = new THREE.Group(); turret.position.set(0, 3.4, 0.6); g.add(turret);
  turret.add(new THREE.Mesh(merge([P('cyl', '#2a2a2a', 0, 0.15, 0, 1.5, 0.3, 1.5), P('box', '#556048', 0, 0.55, 0, 1.2, 0.6, 1.3),
    P('box', '#6a4a2a', 0, 0.7, -0.75, 1.4, 0.9, 0.12, -0.2, 0, 0)]), MAT.trainSteel));
  const barrel = new THREE.Mesh(merge([P('cyl', '#1a1a1a', 0.2, 0.6, -1.4, 0.16, 1.8, 0.16, PI / 2, 0, 0), P('cyl', '#1a1a1a', -0.2, 0.6, -1.4, 0.16, 1.8, 0.16, PI / 2, 0, 0)]), MAT.trainSteel);
  turret.add(barrel);
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.fire, color: 0xffd890, blending: THREE.AdditiveBlending, depthWrite: false }));
  flash.position.set(0, 0.6, -2.7); flash.scale.setScalar(2.4); flash.visible = false; turret.add(flash);
  for (const c of turret.children) if (c.isMesh) c.castShadow = true;

  return { group: g, bodyMat, wheels, smallWheels, rods, turret, barrel, flash, length: 12,
    chimney: new THREE.Vector3(0, 4.6, -4.3), hood: new THREE.Vector3(0, 3.4, -2.5), muzzle: new THREE.Vector3(0, 0.6, -2.4) };
}

// Armored diesel: long hood, cab up front, hazard-striped nose, twin-gun roof turret.
function buildDiesel() {
  const g = new THREE.Group();
  const bodyMat = MAT.trainPaint(); bodyMat.emissive = new THREE.Color(0, 0, 0);
  const O = '#b8561e', K = '#1c1c1c', parts = [
    P('box', '#262626', 0, 1.0, 0, 2.5, 0.5, 11.8),
    P('box', '#262626', 0, 0.65, -3.6, 2.0, 0.6, 3.2), P('box', '#262626', 0, 0.65, 3.6, 2.0, 0.6, 3.2),
    P('box', O, 0, 2.3, 1.2, 2.3, 2.1, 8.6),                        // long hood
    P('box', '#9a4818', 0, 3.42, 1.2, 2.0, 0.14, 8.4),
    P('box', O, 0, 2.7, -4.0, 2.8, 2.9, 2.6),                       // cab
    P('box', '#333', 0, 4.25, -4.0, 3.0, 0.2, 2.9),
    P('box', '#1a2228', 0, 3.3, -5.31, 2.3, 0.8, 0.05), P('box', '#1a2228', 1.41, 3.3, -4.0, 0.05, 0.8, 1.8), P('box', '#1a2228', -1.41, 3.3, -4.0, 0.05, 0.8, 1.8),
    P('box', O, 0, 1.75, -5.7, 2.8, 1.3, 0.9, 0.3, 0, 0),           // sloped nose
    P('box', '#555', 0, 0.8, -6.25, 3.0, 0.5, 0.3),
    P('box', '#7a6a58', 0.75, 0.55, -6.55, 1.6, 0.8, 0.22, 0.45, -0.45, 0), P('box', '#7a6a58', -0.75, 0.55, -6.55, 1.6, 0.8, 0.22, 0.45, 0.45, 0),
    P('box', '#555', 0, 0.95, 5.95, 3.0, 0.5, 0.3),
  ];
  // Black hazard stripes on nose and hood flanks.
  for (let i = -1; i <= 1; i++) parts.push(P('box', K, i * 0.9, 1.75, -6.17, 0.35, 1.4, 0.05, 0.3, 0, 0.7));
  for (const x of [-1.16, 1.16]) for (let z = -1.5; z <= 4.5; z += 2) parts.push(P('box', K, x, 2.3, z, 0.05, 2.3, 0.5, 0.7, 0, 0));
  // Radiator grilles and exhaust stacks.
  for (let z = 3.5; z <= 5.3; z += 0.3) parts.push(P('box', '#2a2a2a', 1.16, 2.6, z, 0.06, 1.2, 0.1), P('box', '#2a2a2a', -1.16, 2.6, z, 0.06, 1.2, 0.1));
  parts.push(P('cyl', '#222', 0.4, 3.75, 2.6, 0.35, 0.8, 0.35), P('cyl', '#222', -0.4, 3.75, 2.6, 0.35, 0.8, 0.35));
  const body = new THREE.Mesh(merge(parts), bodyMat); body.castShadow = true; body.receiveShadow = true; g.add(body);

  const lamp = new THREE.Mesh(merge([P('cyl', '#fff2c0', 0.8, 0, 0, 0.35, 0.15, 0.35, PI / 2, 0, 0), P('cyl', '#fff2c0', -0.8, 0, 0, 0.35, 0.15, 0.35, PI / 2, 0, 0)]), MAT.glow);
  lamp.position.set(0, 2.2, -6.12); g.add(lamp);
  const coneGeo = new THREE.ConeGeometry(3.5, 22, 16, 1, true); coneGeo.translate(0, -11, 0); coneGeo.rotateX(PI / 2 - 0.08);
  const cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: 0xffe8b0, transparent: true, opacity: 0.045, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  cone.position.set(0, 2.2, -6.2); g.add(cone);

  const wheels = [];
  for (const bz of [-3.6, 3.6]) for (const dz of [-1.1, 0, 1.1]) for (const x of [-1.15, 1.15]) addWheel(g, WHEEL_SMALL, x, 0.5, bz + dz, wheels);

  const turret = new THREE.Group(); turret.position.set(0, 3.5, -0.3); g.add(turret);
  turret.add(new THREE.Mesh(merge([P('cyl', '#2a2a2a', 0, 0.12, 0, 1.3, 0.25, 1.3), P('box', '#3a3a34', 0, 0.45, 0, 1.0, 0.5, 1.1),
    P('box', '#b8561e', 0, 0.65, -0.6, 1.3, 0.8, 0.1, -0.25, 0, 0)]), MAT.trainSteel));
  const barrel = new THREE.Mesh(merge([P('cyl', '#1a1a1a', 0.28, 0.5, -1.2, 0.1, 1.5, 0.1, PI / 2, 0, 0), P('cyl', '#1a1a1a', -0.28, 0.5, -1.2, 0.1, 1.5, 0.1, PI / 2, 0, 0),
    P('box', '#2a2a2a', 0.28, 0.4, -0.6, 0.18, 0.25, 0.5), P('box', '#2a2a2a', -0.28, 0.4, -0.6, 0.18, 0.25, 0.5)]), MAT.trainSteel);
  turret.add(barrel);
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.fire, color: 0xffd890, blending: THREE.AdditiveBlending, depthWrite: false }));
  flash.position.set(0, 0.5, -2.2); flash.scale.setScalar(2.0); flash.visible = false; turret.add(flash);
  for (const c of turret.children) if (c.isMesh) c.castShadow = true;

  return { group: g, bodyMat, wheels, smallWheels: [], rods: [], turret, barrel, flash, length: 12,
    chimney: new THREE.Vector3(0.4, 4.2, 2.6), hood: new THREE.Vector3(0, 3.5, 2.0), muzzle: new THREE.Vector3(0, 0.5, -2.0), diesel: true };
}

const CAR_BODIES = {
  cargo: () => {
    const p = [P('box', '#6b4a32', 0, 2.6, 0, 2.7, 2.6, 9.2), P('box', '#4a4440', 0, 4.0, 0, 2.9, 0.25, 9.4), P('box', '#3a2a20', 1.36, 2.4, 0, 0.05, 2.1, 2.2), P('box', '#3a2a20', -1.36, 2.4, 0, 0.05, 2.1, 2.2)];
    for (let z = -4; z <= 4; z += 1.6) if (Math.abs(z) > 1.3) { p.push(P('box', '#5a3a26', 1.37, 2.6, z, 0.06, 2.6, 0.16), P('box', '#5a3a26', -1.37, 2.6, z, 0.06, 2.6, 0.16)); }
    return p;
  },
  tanker: () => [P('cyl', '#2e3032', 0, 2.5, 0, 2.6, 8.6, 2.6, PI / 2, 0, 0), P('cyl', '#c86a20', 0, 2.5, 0, 2.66, 0.6, 2.66, PI / 2, 0, 0),
    P('cyl', '#3a3c3e', 0, 3.9, 0, 0.9, 0.5, 0.9), P('sph', '#2e3032', 0, 2.5, -4.3, 2.4, 2.4, 0.7), P('sph', '#2e3032', 0, 2.5, 4.3, 2.4, 2.4, 0.7),
    P('box', '#555', 0, 1.35, 0, 1.2, 0.4, 7)],
  armored: () => [P('box', '#4e5a3a', 0, 2.4, 0, 2.8, 2.2, 9), P('box', '#5a6644', 0.9, 3.8, 0, 1.3, 0.5, 8.6, 0, 0, -0.35), P('box', '#5a6644', -0.9, 3.8, 0, 1.3, 0.5, 8.6, 0, 0, 0.35),
    P('box', '#1a1e18', 1.41, 2.8, -2, 0.05, 0.25, 1.4), P('box', '#1a1e18', 1.41, 2.8, 2, 0.05, 0.25, 1.4), P('box', '#1a1e18', -1.41, 2.8, -2, 0.05, 0.25, 1.4), P('box', '#1a1e18', -1.41, 2.8, 2, 0.05, 0.25, 1.4),
    P('sph', '#4a5436', 0, 4.1, 1.5, 1.4, 1.0, 1.4), P('cyl', '#1a1a1a', 0, 4.2, 0.2, 0.15, 1.6, 0.15, PI / 2, 0, 0),
    P('box', '#9a8a60', 1.2, 1.5, 0, 0.5, 0.5, 8.6), P('box', '#9a8a60', -1.2, 1.5, 0, 0.5, 0.5, 8.6)],
};

export function buildCar(type) {
  const g = new THREE.Group();
  const mat = MAT.trainPaint(); mat.emissive = new THREE.Color(0, 0, 0);
  const body = new THREE.Mesh(merge([P('box', '#2b2b2b', 0, 1.0, 0, 2.4, 0.4, 9.6), P('box', '#1f1f1f', 0, 0.75, -3.3, 1.8, 0.3, 2.2), P('box', '#1f1f1f', 0, 0.75, 3.3, 1.8, 0.3, 2.2),
    P('box', '#3a3a3a', 0, 0.9, -5.1, 0.4, 0.3, 0.8), ...CAR_BODIES[type]()]), mat);
  body.castShadow = true; body.receiveShadow = true; g.add(body);
  const wheels = [];
  for (const z of [-4, -2.6, 2.6, 4]) for (const x of [-1.15, 1.15]) addWheel(g, WHEEL_SMALL, x, 0.45, z, wheels);
  return { group: g, mat, wheels, type, length: 10 };
}

// ---- Enemies ----
const ENEMY_GEO = {};
function enemyGeo(type) {
  if (ENEMY_GEO[type]) return ENEMY_GEO[type];
  let body, glow;
  if (type === 'raider') {
    const p = [P('box', '#6b4a2a', 0, 0.75, 0, 1.9, 0.6, 3.6), P('box', '#8a5a2a', 0, 1.15, 0.7, 1.7, 0.35, 1.8), P('box', '#3a3a3a', 0, 1.15, -1.2, 1.6, 0.3, 1.0),
      P('box', '#222', 0.75, 1.7, -0.3, 0.1, 1.1, 0.1), P('box', '#222', -0.75, 1.7, -0.3, 0.1, 1.1, 0.1), P('box', '#222', 0, 2.25, -0.3, 1.6, 0.1, 0.1),
      P('cone', '#aaa', 0.6, 0.8, -2.1, 0.25, 0.8, 0.25, -PI / 2, 0, 0), P('cone', '#aaa', -0.6, 0.8, -2.1, 0.25, 0.8, 0.25, -PI / 2, 0, 0),
      P('box', '#222', 0, 2.0, 0.3, 0.16, 0.16, 1.5), P('box', '#554433', 0, 1.8, 0.9, 0.55, 0.8, 0.45), P('sph', '#c9a080', 0, 2.35, 0.9, 0.42, 0.42, 0.42),
      P('box', '#c02a1a', 0.75, 2.9, 1.4, 0.03, 0.6, 0.9), P('cyl6', '#333', 0.75, 2.4, 1.85, 0.06, 1.6, 0.06)];
    for (const x of [-1, 1]) for (const z of [-1.2, 1.2]) p.push(P('wheel', '#1a1a1a', x, 0.5, z, 1.0, 0.45, 1.0, 0, 0, PI / 2));
    body = merge(p);
  } else if (type === 'truck') {
    const p = [P('box', '#3a3a34', 0, 1.1, 0, 2.4, 0.6, 6), P('box', '#6a5a3a', 0, 2.1, -1.9, 2.3, 1.5, 2), P('box', '#20262a', 0, 2.4, -2.91, 2, 0.6, 0.05),
      P('box', '#7a4a2a', 0, 1.8, 1.2, 2.4, 1.0, 3.4), P('box', '#6a3a1a', 0, 1.5, -3.1, 2.6, 1, 0.3, 0.4, 0, 0),
      P('cyl', '#2a2a2a', 0, 2.6, 1.2, 1.3, 0.5, 1.3), P('box', '#1a1a1a', 0, 2.9, 0.2, 0.22, 0.22, 2.2), P('box', '#b02a1a', 0, 2.5, 2.95, 2.4, 0.3, 0.05)];
    for (const x of [-1.2, 1.2]) for (const z of [-2, 0.6, 2]) p.push(P('wheel', '#1a1a1a', x, 0.6, z, 1.2, 0.5, 1.2, 0, 0, PI / 2));
    body = merge(p);
  } else {
    body = merge([P('ico', '#8a8d86', 0, 1.0, 0.2, 1.6, 1.1, 2.3), P('ico', '#9a9a90', 0, 1.25, -1.1, 1.1, 0.95, 1.1),
      P('box', '#5c5e58', 0.75, 0.45, -0.7, 0.25, 0.95, 0.25, 0.3, 0, 0.3), P('box', '#5c5e58', -0.75, 0.45, -0.7, 0.25, 0.95, 0.25, 0.3, 0, -0.3),
      P('box', '#5c5e58', 0.75, 0.45, 0.9, 0.25, 0.95, 0.25, -0.3, 0, 0.3), P('box', '#5c5e58', -0.75, 0.45, 0.9, 0.25, 0.95, 0.25, -0.3, 0, -0.3),
      P('cone', '#4a4a44', 0, 1.8, 0.3, 0.35, 0.9, 0.35), P('cone', '#4a4a44', 0, 1.7, 1.0, 0.3, 0.7, 0.3, 0.4, 0, 0),
      P('box', '#6a2a22', 0, 1.0, -1.65, 0.7, 0.2, 0.2)]);
    glow = merge([P('sph', '#ff2a1a', 0.28, 1.45, -1.6, 0.2, 0.2, 0.2), P('sph', '#ff2a1a', -0.28, 1.45, -1.6, 0.2, 0.2, 0.2)]);
  }
  return (ENEMY_GEO[type] = { body, glow });
}

const BAR_BG = new THREE.SpriteMaterial({ color: 0x111111, depthTest: false, transparent: true, opacity: 0.8 });
const BAR_FG = new THREE.SpriteMaterial({ color: 0xff4a30, depthTest: false });

export function buildEnemy(type) {
  const root = new THREE.Group();
  const pivot = new THREE.Group(); root.add(pivot);
  const geo = enemyGeo(type);
  const body = new THREE.Mesh(geo.body, type === 'crawler' ? MAT.crawler : MAT.enemyBody); body.castShadow = true; pivot.add(body);
  if (geo.glow) pivot.add(new THREE.Mesh(geo.glow, MAT.glow));
  const h = type === 'truck' ? 4.2 : 3.4;
  const bg = new THREE.Sprite(BAR_BG); bg.center.set(0, 0.5); bg.scale.set(3, 0.4, 1); bg.position.set(-1.5, h, 0); bg.renderOrder = 10;
  const fg = new THREE.Sprite(BAR_FG); fg.center.set(0, 0.5); fg.scale.set(2.9, 0.28, 1); fg.position.set(-1.45, h, 0); fg.renderOrder = 11;
  root.add(bg, fg);
  return { root, pivot, bg, fg };
}
