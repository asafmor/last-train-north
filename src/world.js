import * as THREE from 'three';
import { TRACK_DEFS, CONTENT, STATION_PLATFORM } from './config.js';
import { TrackNetwork, buildTrackMeshes } from './track.js';
import { prefab } from './prefabs.js';
import { matFor } from './assets.js';
import { sat, fbm, smooth, biomeWeights, BIOMES, mulberry32, rrange, clamp, lerp, damp, soup, MAT, P, merge } from './util.js';

// Per-biome palette & lighting. Terrain textures: grass(forest), sand(desert), asphalt(ind), rock(rocky), snow.
const PAL = {
  forest: { g1: '#6f7d3a', g2: '#8a8a4c', dirt: '#8a7550', fog: '#bdb79a', sun: '#fff0d0', sunI: 2.7, hemiSky: '#dcdcc0', hemiGround: '#5a5230' },
  desert: { g1: '#c9a26a', g2: '#dbb67c', dirt: '#b08a5a', fog: '#e0c8a0', sun: '#fff0c8', sunI: 3.1, hemiSky: '#f0e0c0', hemiGround: '#8a6a40' },
  ind: { g1: '#6b675a', g2: '#7d7668', dirt: '#5a5044', fog: '#9d978a', sun: '#ffd8b0', sunI: 2.0, hemiSky: '#c8c0b0', hemiGround: '#4a4640' },
  rocky: { g1: '#8a7a6a', g2: '#9a8878', dirt: '#6e625a', fog: '#b4a898', sun: '#ffe8d8', sunI: 2.4, hemiSky: '#d8d0c8', hemiGround: '#5a5048' },
  snow: { g1: '#dfe5ea', g2: '#c4ced6', dirt: '#9aa2a6', fog: '#c2ccd8', sun: '#e4ecff', sunI: 1.7, hemiSky: '#dfe8f2', hemiGround: '#8a939a' },
};
for (const k in PAL) for (const f in PAL[k]) if (typeof PAL[k][f] === 'string') PAL[k][f] = new THREE.Color(PAL[k][f]);
const _c = new THREE.Color(), _c2 = new THREE.Color(), _v = new THREE.Vector3(), _w = {};
const LAKE = { x: 225, z: -3420, r: 62 };

function blend(key, z, out) {
  biomeWeights(z, _w); out.setRGB(0, 0, 0);
  for (const b of BIOMES) { const c = PAL[b][key]; out.r += c.r * _w[b]; out.g += c.g * _w[b]; out.b += c.b * _w[b]; }
  return out;
}
function blendN(key, z) { biomeWeights(z, _w); let v = 0; for (const b of BIOMES) v += PAL[b][key] * _w[b]; return v; }

export class World {
  constructor(scene) {
    this.scene = scene;
    this.network = new TrackNetwork(TRACK_DEFS);
    this.static = new THREE.Group(); scene.add(this.static);
    this.reserved = [];
    this.labels = []; // HTML world signs, drawn by ui.updateMarkers
    this.reserveContentSites();
    this.buildLights();
    this.buildTerrain();
    buildTrackMeshes(this.network, this.static);
    this.buildStations();
    this.buildJunctionMarkers();
    this.buildScenery();
    this.buildPoles();
    this.buildWeather();
  }

  // Keep scenery clear of every spot content may use this run.
  reserveContentSites() {
    for (const c of CONTENT) {
      if (c.off === undefined) continue;
      const seg = this.network.segs[c.seg], d = c.d < 0 ? seg.length + c.d : c.d;
      seg.pointAt(d, c.side * (c.off + 5), 0, _v);
      this.reserved.push([_v.x, _v.z, 18]);
    }
  }
  isReserved(x, z) { for (const [rx, rz, r] of this.reserved) if ((x - rx) ** 2 + (z - rz) ** 2 < r * r) return true; return false; }

  buildLights() {
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.1);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = true;
    const s = this.sun.shadow; s.mapSize.set(2048, 2048);
    Object.assign(s.camera, { left: -75, right: 75, top: 75, bottom: -75, near: 1, far: 260 });
    s.bias = -0.0005; s.normalBias = 0.04;
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.scene.fog = new THREE.Fog(0xbdb79a, 110, 330);
    this.scene.background = new THREE.Color(0xbdb79a);
  }

  heightRaw(x, z) {
    const d = this.network.distAt(x, z);
    const w = biomeWeights(z, _w);
    // Desert: long low dunes. Rocky: tall broken ridges. Snow: mountains. Forest/ind: gentle.
    const dunes = Math.sin(x * 0.035 + z * 0.012 + fbm(x * 0.01, z * 0.01) * 4) * 2.2;
    const ridge = Math.pow(Math.abs(fbm(x * 0.009 + 5, z * 0.009) * 2 - 1), 0.6) * 22;
    let h = (fbm(x * 0.012, z * 0.012) - 0.45) * (6 - w.desert * 3) + w.desert * dunes
      + (Math.pow(fbm(x * 0.004 + 10, z * 0.004), 2) * (16 + w.snow * 34 + w.rocky * 20) + w.rocky * ridge) * smooth(35, 150, d);
    h *= smooth(7, 38, d);
    const ld = Math.hypot(x - LAKE.x, z - LAKE.z);
    if (ld < LAKE.r + 30) h = lerp(-1.2, h, smooth(LAKE.r - 10, LAKE.r + 30, ld));
    return h - 0.15;
  }

  buildTerrain() {
    const cell = 10, x0 = -400, z0 = 160, cols = 81, rows = 433;
    Object.assign(this, { hcell: cell, hx0: x0, hz0: z0, hcols: cols, hrows: rows });
    const H = this.heights = new Float32Array(cols * rows);
    for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) H[r * cols + q] = this.heightRaw(x0 + q * cell, z0 - r * cell);
    const pos = [], col = [], bio = [];
    for (let r = 0; r < rows - 1; r++) {
      for (let q = 0; q < cols - 1; q++) {
        const xa = x0 + q * cell, za = z0 - r * cell, xb = xa + cell, zb = za - cell;
        const ha = H[r * cols + q], hb = H[r * cols + q + 1], hc = H[(r + 1) * cols + q], hd = H[(r + 1) * cols + q + 1];
        for (const tri of [[[xa, ha, za], [xb, hb, za], [xa, hc, zb]], [[xb, hb, za], [xb, hd, zb], [xa, hc, zb]]]) {
          const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, cz = (tri[0][2] + tri[1][2] + tri[2][2]) / 3, cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
          this.groundColor(cx, cy, cz, _c);
          const w = biomeWeights(cz, _w), steep = sat((cy - 7) / 8);
          // Texture weights: sand, asphalt, rock, snow (remainder = grass). High ground turns to rock.
          const bw = [w.desert, w.ind * 0.8, Math.max(w.rocky * 0.85, steep * (1 - w.snow) * 0.8), w.snow];
          for (const v of tri) { pos.push(v[0], v[1], v[2]); col.push(_c.r, _c.g, _c.b); bio.push(...bw); }
        }
      }
    }
    const tg = soup(pos, col); tg.setAttribute('biome', new THREE.Float32BufferAttribute(bio, 4));
    const mesh = new THREE.Mesh(tg, MAT.terrain);
    mesh.receiveShadow = true;
    this.static.add(mesh);
    const ice = new THREE.Mesh(new THREE.CircleGeometry(LAKE.r, 28), new THREE.MeshLambertMaterial({ color: 0xb8d4e4 }));
    ice.rotation.x = -Math.PI / 2; ice.position.set(LAKE.x, -0.55, LAKE.z); ice.receiveShadow = true;
    this.static.add(ice);
  }

  groundColor(x, y, z, out) {
    const n = fbm(x * 0.03, z * 0.03);
    blend('g1', z, out).lerp(blend('g2', z, _c2), n);
    const d = this.network.distAt(x, z);
    if (d < 9) out.lerp(blend('dirt', z, _c2), 0.6 * (1 - d / 9));
    const w = biomeWeights(z, _w);
    if (y > 7 && w.snow < 0.5) out.lerp(_c2.set('#8d8278'), sat((y - 7) / 8) * 0.6);
    out.multiplyScalar(0.92 + ((Math.sin(x * 12.9898 + z * 78.233) * 43758.5) % 1 + 1) % 1 * 0.12);
    return out;
  }

  heightAt(x, z) {
    const fx = clamp((x - this.hx0) / this.hcell, 0, this.hcols - 1.001), fz = clamp((this.hz0 - z) / this.hcell, 0, this.hrows - 1.001);
    const q = Math.floor(fx), r = Math.floor(fz), tx = fx - q, tz = fz - r, C = this.hcols, H = this.heights;
    return lerp(lerp(H[r * C + q], H[r * C + q + 1], tx), lerp(H[(r + 1) * C + q], H[(r + 1) * C + q + 1], tx), tz);
  }

  addStatic(geoName, x, z, ry = 0, s = 1, shadow = true) {
    const m = new THREE.Mesh(prefab(geoName), matFor(geoName));
    m.position.set(x, Math.max(-0.15, this.heightAt(x, z)), z); m.rotation.y = ry; m.scale.setScalar(s);
    m.castShadow = shadow; m.receiveShadow = true; this.static.add(m);
    this.reserved.push([x, z, 14 * s]);
    return m;
  }

  // Place a prefab relative to a track point: lateral>0 = right of travel.
  addAlong(seg, d, lateral, geoName, rotOffset = 0, s = 1) {
    const S = this.network.segs[seg];
    S.pointAt(d, lateral, 0, _v);
    return this.addStatic(geoName, _v.x, _v.z, -S.headingAt(d) + rotOffset, s);
  }

  buildStations() {
    const N = this.network.segs;
    // Southern depot at the start.
    for (let d = 42; d <= 92; d += 1) this.addAlong('S1', d, -3.9, 'platform', 0, 1).castShadow = false;
    this.addAlong('S1', 66, -12, 'depot', Math.PI);
    this.labels.push({ pos: N.S1.pointAt(66, -12, 9, new THREE.Vector3()), title: 'South Depot', sub: 'Milepost 0 · abandoned', kind: 'station' });
    this.addAlong('S1', 2, 0, 'bufferstop', Math.PI);

    // Northern Evacuation Station.
    const n2 = N.N2, L = n2.length, p0 = L - STATION_PLATFORM;
    for (let d = p0; d <= L - 3; d += 1) this.addAlong('N2', d, -3.9, 'platform').castShadow = false;
    for (let d = p0 + 10; d <= L - 10; d += 10) this.addAlong('N2', d, -4.5, 'canopy', Math.PI);
    this.addAlong('N2', L - 60, -20, 'evacStation', -Math.PI / 2);
    this.addAlong('N2', L - 1.2, 0, 'bufferstop');
    for (let d = p0 - 20; d < L; d += 22) this.addAlong('N2', d, 14, 'tent', Math.PI / 2);
    this.addAlong('N2', L - 20, 26, 'radiotower');
    for (let d = p0; d < L; d += 4.1) this.addAlong('N2', d, 30, 'fence', Math.PI / 2);
    // Waiting evacuation train on a parallel siding.
    const evac = [];
    for (let i = 0; i < 4; i++) { n2.pointAt(L - 20 - i * 11, 7, 0, _v); evac.push([_v.x, _v.z]); }
    for (const [x, z] of evac) this.addStatic('stub', x, z, -n2.headingAt(L - 30), 1).castShadow = false;
    const evCar = merge([P('box', '#3a5a6a', 0, 2.5, 0, 2.7, 2.8, 9.4), P('box', '#e8e0d0', 0, 3.2, 0, 2.75, 0.3, 9.45), P('box', '#2a2a2a', 0, 1.0, 0, 2.2, 0.5, 9.4)]);
    for (const [x, z] of evac) { const m = new THREE.Mesh(evCar, MAT.metal); m.position.set(x, 0, z); m.rotation.y = -n2.headingAt(L - 30); m.castShadow = true; this.static.add(m); }
    this.labels.push({ pos: n2.pointAt(L - 60, -20, 17, new THREE.Vector3()), title: 'Evacuation Station', sub: 'The last train out', kind: 'evac', far: true });
    // Green beacon visible from far away.
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 140, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x7dff8a, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    n2.pointAt(L - 60, -20, 70, beam.position); this.static.add(beam);
    this.stationPos = n2.pointAt(L - 60, 0, 0, new THREE.Vector3());
    this.floodlights = [];
  }

  // Green chevrons on the selected branch, red X on the other.
  buildJunctionMarkers() {
    const sh = new THREE.Shape();
    sh.moveTo(-1.1, -0.4); sh.lineTo(0, 0.7); sh.lineTo(1.1, -0.4); sh.lineTo(0.6, -0.4); sh.lineTo(0, 0.2); sh.lineTo(-0.6, -0.4);
    const chevGeo = new THREE.ShapeGeometry(sh); chevGeo.rotateX(-Math.PI / 2);
    const green = new THREE.MeshBasicMaterial({ color: 0x6dff7a, transparent: true, opacity: 0.9, depthWrite: false, fog: false });
    const red = new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.9, depthWrite: false, fog: false });
    const xGeo = merge([P('box', '#ffffff', 0, 0, 0, 3, 0.1, 0.5, 0, Math.PI / 4, 0), P('box', '#ffffff', 0, 0, 0, 3, 0.1, 0.5, 0, -Math.PI / 4, 0)]);
    this.junctionMarkers = {};
    for (const id in this.network.segs) {
      const seg = this.network.segs[id];
      if (seg.next.length < 2) continue;
      const m = { chev: [], x: [] };
      seg.next.forEach((br, i) => {
        const cg = new THREE.Group();
        for (const d of [9, 16, 23, 30]) {
          const c = new THREE.Mesh(chevGeo, green); br.pointAt(d, 0, 0.62, c.position); c.rotation.y = -br.headingAt(d); c.scale.setScalar(1.3); cg.add(c);
        }
        const xm = new THREE.Mesh(xGeo, red); br.pointAt(12, 0, 0.62, xm.position); xm.rotation.y = -br.headingAt(12);
        cg.visible = false; xm.visible = false;
        this.static.add(cg, xm); m.chev.push(cg); m.x.push(xm);
        this.labels.push({ pos: br.pointAt(34, (i === 0 ? -1 : 1) * 9, 4, new THREE.Vector3()), title: seg.junction[i].title,
          sub: { danger: 'Dangerous route', safe: 'Safer route', spur: 'Dead-end spur', main: 'Mainline' }[br.kind], kind: br.kind, arrow: i === 0 ? '◀' : '▶' });
      });
      this.addAlong(id, seg.length - 6, 3.2, 'signal');
      this.junctionMarkers[id] = m;
    }
  }
  updateJunctionMarkers(segId, choice) {
    for (const id in this.junctionMarkers) {
      const m = this.junctionMarkers[id], active = id === segId;
      for (let i = 0; i < m.chev.length; i++) { m.chev[i].visible = active && i === choice; m.x[i].visible = active && i !== choice; }
    }
  }

  buildScenery() {
    const rng = mulberry32(1337);
    const CHUNK = 500, batches = {};
    const add = (name, x, z, ry, s, tint) => {
      const k = Math.floor((160 - z) / CHUNK);
      const b = (batches[name] ||= {})[k] ||= [];
      b.push([x, this.heightAt(x, z), z, ry, s, tint]);
    };
    const tryPlace = (name, x, z, minD, s = 1, tint = null) => {
      if (this.network.distAt(x, z) < minD || this.isReserved(x, z)) return false;
      if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 4) return false;
      add(name, x, z, rng() * Math.PI * 2, s, tint); return true;
    };
    const T = { dry: new THREE.Color(1.15, 0.95, 0.7), pale: new THREE.Color(1.5, 1.5, 1.45), red: new THREE.Color(1.25, 0.95, 0.75), sand: new THREE.Color(1.3, 1.1, 0.85) };
    // Per-biome scatter tables: [prefab, weight, min track distance, scale min, scale max, tint, clumped]
    const TABLE = {
      forest: [['pine', 30, 9, 0.8, 1.5, null, true], ['bush', 12, 5, 0.6, 1.3], ['grass', 45, 3.2, 0.8, 1.6], ['rock', 6, 6, 0.5, 1.6], ['deadtree', 3, 7, 0.8, 1.3]],
      desert: [['cactus', 8, 6, 0.7, 1.5], ['drybush', 18, 4, 0.7, 1.5], ['grass', 12, 3.2, 0.8, 1.4, T.dry], ['rock', 8, 6, 0.6, 2, T.red],
        ['bones', 2, 5, 0.9, 1.2], ['dune', 4, 26, 0.7, 1.6], ['mesa', 0.5, 80, 0.8, 1.5], ['deadtree', 2, 7, 0.7, 1.1, T.sand]],
      ind: [['deadtree', 10, 7, 0.8, 1.4], ['grass', 25, 3.2, 0.8, 1.5, T.dry], ['rock', 8, 6, 0.5, 1.4], ['drybush', 10, 4, 0.6, 1.2],
        ['tires', 2, 6, 1, 1.3], ['concrete', 3, 8, 0.8, 1.2], ['pipes', 0.8, 22, 0.8, 1.2]],
      rocky: [['boulders', 10, 10, 0.6, 1.5], ['spire', 2.5, 35, 0.7, 1.6], ['rock', 25, 6, 0.8, 2.4, T.red], ['pine', 6, 9, 0.7, 1.2, null, true],
        ['drybush', 8, 4, 0.7, 1.3], ['grass', 15, 3.2, 0.8, 1.4, T.dry]],
      snow: [['snowpine', 22, 9, 0.8, 1.5, null, true], ['snowrock', 15, 6, 0.6, 2.4], ['snowdrift', 20, 5, 0.7, 1.6], ['deadtree', 6, 7, 0.8, 1.3], ['grass', 5, 3.2, 0.8, 1.3, T.pale]],
    };
    for (const b in TABLE) TABLE[b].total = TABLE[b].reduce((a, e) => a + e[1], 0);
    const bw = {};
    for (let i = 0; i < 40000; i++) {
      const z = rrange(rng, 150, -4150), x = rrange(rng, -260, 300);
      biomeWeights(z, bw);
      let r = rng(), biome = 'snow';
      for (const b of BIOMES) { if (r < bw[b]) { biome = b; break; } r -= bw[b]; }
      const tab = TABLE[biome];
      let q = rng() * tab.total, e = tab[0];
      for (const it of tab) { if (q < it[1]) { e = it; break; } q -= it[1]; }
      const [name, , minD, s0, s1, tint, clumped] = e;
      if (clumped && fbm(x * 0.008 + 3, z * 0.008) < 0.47 && rng() > 0.15) continue;
      tryPlace(name, x, z, minD, rrange(rng, s0, s1), tint || null);
    }

    // Settlements and industry clusters near the line so the journey passes through them.
    const cluster = (cx, cz, n, names, spread, minD = 18) => {
      for (let i = 0, tries = 0; i < n && tries < n * 30; tries++) {
        const x = cx + rrange(rng, -spread, spread), z = cz + rrange(rng, -spread, spread);
        const name = names[Math.floor(rng() * names.length)];
        if (this.network.distAt(x, z) < minD || this.isReserved(x, z)) continue;
        add(name, x, z, Math.round(rng() * 4) * Math.PI / 2 + rrange(rng, -0.15, 0.15), rrange(rng, 0.85, 1.15),
          name === 'container' ? new THREE.Color().setHSL(rng(), 0.45, 0.4) : null);
        this.reserved.push([x, z, 9]); i++;
      }
    };
    cluster(-55, -200, 7, ['house', 'house', 'ruin', 'barn', 'carwreck'], 35);                 // farm village
    cluster(-170, -520, 4, ['house', 'barn', 'ruin'], 35);
    cluster(90, -860, 7, ['adobe', 'adobe', 'carwreck', 'bones', 'pumpjack'], 45);             // desert town
    cluster(-170, -980, 6, ['pumpjack', 'pumpjack', 'adobe', 'tires'], 45);                   // oil field
    cluster(60, -1300, 6, ['adobe', 'carwreck', 'pumpjack', 'crates'], 40);
    cluster(-60, -1650, 10, ['warehouse', 'tank', 'container', 'silo', 'crates'], 45, 20);     // industrial belt
    cluster(100, -1700, 10, ['container', 'container', 'tank', 'crates', 'concrete'], 40, 12);
    cluster(-150, -2150, 9, ['factory', 'warehouse', 'silo', 'container'], 55, 22);
    cluster(-40, -2330, 6, ['factory', 'tank', 'pipes', 'container'], 35, 20);
    cluster(80, -2200, 5, ['ruin', 'silo', 'container', 'tank'], 50, 20);
    cluster(40, -2900, 6, ['watchtower', 'ruin', 'tires', 'boulders', 'radiotower'], 45, 20); // canyon mining camp
    cluster(-90, -2700, 4, ['spire', 'spire', 'boulders'], 50, 30);
    cluster(-70, -3350, 5, ['ruin', 'watchtower', 'concrete', 'sandbags'], 35, 18);           // frozen outposts
    cluster(200, -3300, 4, ['cabin', 'cabin', 'ruin'], 35, 16);
    cluster(-40, -3800, 5, ['ruin', 'watchtower', 'concrete', 'tires'], 35, 18);
    for (let z = -1500; z > -2400; z -= 70) add('pylon', -205 + Math.sin(z * 0.01) * 6, z, 0, 1, null); // power line across the belt

    const noShadow = new Set(['grass', 'snowdrift', 'bush', 'drybush', 'dune', 'bones']);
    const dummy = new THREE.Object3D(), white = new THREE.Color(1, 1, 1);
    for (const name in batches) {
      for (const k in batches[name]) {
        const list = batches[name][k];
        const im = new THREE.InstancedMesh(prefab(name), matFor(name), list.length);
        list.forEach(([x, y, z, ry, s, tint], i) => {
          dummy.position.set(x, y, z); dummy.rotation.set(0, ry, 0); dummy.scale.setScalar(s); dummy.updateMatrix();
          im.setMatrixAt(i, dummy.matrix); im.setColorAt(i, tint || white);
        });
        im.castShadow = !noShadow.has(name); im.receiveShadow = true;
        im.computeBoundingSphere();
        this.static.add(im);
      }
    }
  }

  // Telegraph poles with sagging wires along the mainline segments.
  buildPoles() {
    const pts = [], dummy = new THREE.Object3D(), mats = [];
    for (const id of ['S1', 'S2', 'I1', 'N1', 'N2', 'A', 'D', 'F']) {
      const seg = this.network.segs[id]; let prev = null;
      for (let d = 20; d < seg.length - 10; d += 42) {
        seg.pointAt(d, 7.5, 0, _v);
        if (this.isReserved(_v.x, _v.z)) { prev = null; continue; }
        dummy.position.copy(_v); dummy.rotation.set(0, -seg.headingAt(d), 0); dummy.scale.setScalar(1); dummy.updateMatrix();
        mats.push(dummy.matrix.clone());
        const h = seg.headingAt(d), cur = [];
        for (const off of [-0.9, 0.9]) cur.push(new THREE.Vector3(_v.x + Math.cos(h) * off, 7.6, _v.z + Math.sin(h) * off));
        if (prev) for (let w = 0; w < 2; w++) {
          const a = prev[w], b = cur[w];
          for (let s = 0; s < 4; s++) {
            const t0 = s / 4, t1 = (s + 1) / 4, sag = (t) => 4 * t * (1 - t) * 1.2;
            pts.push(lerp(a.x, b.x, t0), 7.6 - sag(t0), lerp(a.z, b.z, t0), lerp(a.x, b.x, t1), 7.6 - sag(t1), lerp(a.z, b.z, t1));
          }
        }
        prev = cur;
      }
    }
    const im = new THREE.InstancedMesh(prefab('pole'), matFor('pole'), mats.length);
    mats.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = true; im.computeBoundingSphere();
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.static.add(im, new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x2a2622 })));
  }

  // Snow in the north, ash in the industrial belt.
  buildWeather() {
    const N = 1400, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { pos[i * 3] = Math.random() * 160 - 80; pos[i * 3 + 1] = Math.random() * 40; pos[i * 3 + 2] = Math.random() * 160 - 80; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.flakeMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.35, transparent: true, opacity: 0, depthWrite: false });
    this.flakes = new THREE.Points(g, this.flakeMat); this.flakes.frustumCulled = false;
    this.scene.add(this.flakes);
    this.flakeBase = pos.slice();
  }

  // Per-frame atmosphere: palette by position, shadow camera follows the focus.
  update(dt, focus, time) {
    const z = focus.z;
    blend('fog', z, this.scene.fog.color); this.scene.background.copy(this.scene.fog.color);
    const w = biomeWeights(z, _w), north = w.snow, ind = w.ind, dust = w.desert + w.rocky * 0.4;
    this.scene.fog.near = lerp(150, 95, north); this.scene.fog.far = lerp(440, 310, north);
    blend('sun', z, this.sun.color); this.sun.intensity = blendN('sunI', z);
    blend('hemiSky', z, this.hemi.color); blend('hemiGround', z, this.hemi.groundColor);
    this.sun.position.set(focus.x + 45, 90, focus.z + 30); this.sun.target.position.copy(focus);

    // Snow in the north, ash over the industry, blowing dust in the desert and canyons.
    this.flakeMat.opacity = north * 0.85 + ind * 0.35 + dust * 0.5;
    this.flakeMat.color.setRGB(0.45 * ind + 1 * north + 0.85 * dust, 0.43 * ind + 1 * north + 0.7 * dust, 0.4 * ind + 1 * north + 0.5 * dust);
    this.flakes.visible = this.flakeMat.opacity > 0.02;
    if (this.flakes.visible) {
      const p = this.flakes.geometry.attributes.position.array, B = this.flakeBase;
      const fall = (lerp(1.5, 4, north) - dust * 1.2) * time, drift = time * (1.2 + dust * 14);
      for (let i = 0; i < p.length; i += 3) {
        p[i] = ((B[i] + drift - focus.x) % 160 + 240) % 160 - 80 + focus.x;
        p[i + 1] = ((B[i + 1] - fall) % 40 + 40) % 40;
        p[i + 2] = ((B[i + 2] - focus.z) % 160 + 240) % 160 - 80 + focus.z;
      }
      this.flakes.geometry.attributes.position.needsUpdate = true;
    }
  }
}
export { LAKE };
