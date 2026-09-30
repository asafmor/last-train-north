import * as THREE from 'three';
import { DEG, clamp, lerp, biomeWeights, soup, MAT, P, merge } from './util.js';

const STEP = 1; // sample spacing in metres

// A piece of track between junctions, sampled at ~1 m for constant-time lookups.
export class TrackSegment {
  constructor(id, def) {
    this.id = id; this.def = def; this.name = def.name; this.kind = def.kind;
    this.nextIds = def.next; this.next = [];
    this.junction = def.junction || null;
    const path = new THREE.CurvePath();
    const w = def.wps;
    for (let i = 0; i < w.length - 1; i++) {
      const [x0, z0, h0] = w[i], [x1, z1, h1] = w[i + 1];
      const L = Math.hypot(x1 - x0, z1 - z0) / 3, a0 = h0 * DEG, a1 = h1 * DEG;
      const c = new THREE.CubicBezierCurve3(
        new THREE.Vector3(x0, 0, z0),
        new THREE.Vector3(x0 + Math.sin(a0) * L, 0, z0 - Math.cos(a0) * L),
        new THREE.Vector3(x1 - Math.sin(a1) * L, 0, z1 + Math.cos(a1) * L),
        new THREE.Vector3(x1, 0, z1));
      c.arcLengthDivisions = 400;
      path.add(c);
    }
    this.length = path.getLength();
    const n = Math.max(2, Math.round(this.length / STEP));
    const pts = path.getSpacedPoints(n);
    this.step = this.length / n; this.n = n + 1;
    this.px = new Float32Array(this.n); this.pz = new Float32Array(this.n); this.ph = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) { this.px[i] = pts[i].x; this.pz[i] = pts[i].z; }
    for (let i = 0; i < this.n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(this.n - 1, i + 1);
      this.ph[i] = Math.atan2(this.px[b] - this.px[a], -(this.pz[b] - this.pz[a]));
    }
  }

  // Writes {x, z, h} at distance d; extrapolates straight beyond the ends.
  sample(d, out) {
    if (d < 0 || d > this.length) {
      const i = d < 0 ? 0 : this.n - 1, e = d < 0 ? d : d - this.length, h = this.ph[i];
      out.x = this.px[i] + Math.sin(h) * e; out.z = this.pz[i] - Math.cos(h) * e; out.h = h;
      return out;
    }
    const f = d / this.step, i = Math.min(Math.floor(f), this.n - 2), t = f - i;
    out.x = lerp(this.px[i], this.px[i + 1], t);
    out.z = lerp(this.pz[i], this.pz[i + 1], t);
    out.h = lerp(this.ph[i], this.ph[i + 1], t);
    return out;
  }

  // World point at distance d with lateral offset (positive = right of travel).
  pointAt(d, lateral, y, v) {
    const s = this.sample(d, _s);
    return v.set(s.x + Math.cos(s.h) * lateral, y, s.z + Math.sin(s.h) * lateral);
  }
  headingAt(d) { return this.sample(d, _s).h; }
}
const _s = { x: 0, z: 0, h: 0 };

export class TrackNetwork {
  constructor(defs) {
    this.segs = {};
    for (const id in defs) this.segs[id] = new TrackSegment(id, defs[id]);
    for (const id in this.segs) { const s = this.segs[id]; s.next = s.nextIds.map((n) => this.segs[n]); }
    this.buildDistanceField();
  }

  // Coarse grid of distance-to-nearest-track, used for terrain flattening and scenery placement.
  buildDistanceField() {
    const c = 4; this.dc = c; this.dx0 = -420; this.dz0 = 180;
    this.dcols = Math.ceil(840 / c) + 1; this.drows = Math.ceil(4420 / c) + 1;
    const f = this.df = new Float32Array(this.dcols * this.drows).fill(60);
    const R = 60, rc = Math.ceil(R / c);
    for (const id in this.segs) {
      const s = this.segs[id];
      for (let i = 0; i < s.n; i += 2) {
        const x = s.px[i], z = s.pz[i];
        const ci = Math.round((x - this.dx0) / c), ri = Math.round((this.dz0 - z) / c);
        for (let r = ri - rc; r <= ri + rc; r++) {
          if (r < 0 || r >= this.drows) continue;
          const wz = this.dz0 - r * c;
          for (let q = ci - rc; q <= ci + rc; q++) {
            if (q < 0 || q >= this.dcols) continue;
            const d = Math.hypot(this.dx0 + q * c - x, wz - z), k = r * this.dcols + q;
            if (d < f[k]) f[k] = d;
          }
        }
      }
    }
  }
  distAt(x, z) {
    const fx = clamp((x - this.dx0) / this.dc, 0, this.dcols - 1.001), fz = clamp((this.dz0 - z) / this.dc, 0, this.drows - 1.001);
    const q = Math.floor(fx), r = Math.floor(fz), tx = fx - q, tz = fz - r, C = this.dcols, f = this.df;
    const a = f[r * C + q], b = f[r * C + q + 1], c = f[(r + 1) * C + q], d = f[(r + 1) * C + q + 1];
    return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
  }
}

// ---------- Track rendering ----------
const BALLAST = [[-2.7, -0.1], [-1.8, 0.26], [1.8, 0.26], [2.7, -0.1]];
const railProfile = (o) => [[o - 0.08, 0.34], [o - 0.08, 0.5], [o + 0.08, 0.5], [o + 0.08, 0.34]];
const BALLAST_COL = { forest: '#766b5b', desert: '#9a8466', ind: '#6b675f', rocky: '#7d7670', snow: '#b4babd' };
for (const k in BALLAST_COL) BALLAST_COL[k] = new THREE.Color(BALLAST_COL[k]);
const _bw = {};
const cRail = new THREE.Color('#9a9894'), cRailSide = new THREE.Color('#6e5140');
const _col = new THREE.Color();

function ribbon(seg, profile, colorFn, stride, pos, col) {
  for (let i = 0; i < seg.n - 1; i += stride) {
    const j = Math.min(i + stride, seg.n - 1);
    for (let k = 0; k < profile.length - 1; k++) {
      const quad = [[i, k], [j, k], [j, k + 1], [i, k + 1]].map(([s, p]) => {
        const h = seg.ph[s], [lx, y] = profile[p];
        return [seg.px[s] + Math.cos(h) * lx, y, seg.pz[s] + Math.sin(h) * lx];
      });
      const c = colorFn(seg.pz[i], k);
      for (const idx of [0, 2, 1, 0, 3, 2]) { pos.push(...quad[idx]); col.push(c.r, c.g, c.b); }
    }
  }
}

export function buildTrackMeshes(network, group) {
  const bp = [], bc = [], rp = [], rc = [];
  const ballastColor = (z) => {
    biomeWeights(z, _bw); _col.setRGB(0, 0, 0);
    for (const k in BALLAST_COL) { _col.r += BALLAST_COL[k].r * _bw[k]; _col.g += BALLAST_COL[k].g * _bw[k]; _col.b += BALLAST_COL[k].b * _bw[k]; }
    return _col;
  };
  const railColor = (z, k) => (k === 1 ? cRail : cRailSide);
  const dummy = new THREE.Object3D();
  for (const id in network.segs) {
    const seg = network.segs[id];
    ribbon(seg, BALLAST, ballastColor, 2, bp, bc);
    ribbon(seg, railProfile(-0.75), railColor, 2, rp, rc);
    ribbon(seg, railProfile(0.75), railColor, 2, rp, rc);
    // Sleepers: instanced per segment so frustum culling works.
    const count = Math.floor(seg.length / 1.1);
    const im = new THREE.InstancedMesh(SLEEPER_GEO(), MAT.sleeper, count);
    for (let i = 0; i < count; i++) {
      const s = seg.sample(i * 1.1 + 0.5, _s);
      dummy.position.set(s.x, 0.3, s.z); dummy.rotation.set(0, -s.h, 0); dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
      im.setColorAt(i, _col.setScalar(0.75 + ((i * 7919) % 13) / 40));
    }
    im.receiveShadow = true;
    im.computeBoundingSphere();
    group.add(im);
  }
  const ballast = new THREE.Mesh(soup(bp, bc), MAT.ballast); ballast.receiveShadow = true;
  const rails = new THREE.Mesh(soup(rp, rc), MAT.rail); rails.castShadow = true;
  group.add(ballast, rails);
}
let sleeperGeo = null;
const SLEEPER_GEO = () => sleeperGeo || (sleeperGeo = merge([P('box', '#7a5c44', 0, 0, 0, 2.7, 0.14, 0.34)]));
