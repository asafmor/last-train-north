import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MAT } from './util.js';

// Codex-generated textures/sprites (see tools/process_assets.py). Missing files fall back
// to neutral placeholders so the game still runs.
export const TEX = {};
const DETAIL = ['metal', 'wood', 'concrete', 'ground', 'gravel', 'rock', 'snow', 'sand', 'asphalt', 'paint', 'steel'];
const FILES = {
  smoke: 'assets/sprite_smoke.png', fire: 'assets/sprite_fire.png',
  icon_fuel: 'assets/icon_fuel.png', icon_parts: 'assets/icon_parts.png', icon_supplies: 'assets/icon_supplies.png', icon_ammo: 'assets/icon_ammo.png',
};
for (const k of DETAIL) FILES[k] = `assets/tex_${k}.jpg`;

function placeholder(sprite) {
  const d = sprite ? new Uint8Array([255, 255, 255, 255]) : new Uint8Array([128, 128, 128, 255]);
  const t = new THREE.DataTexture(d, 1, 1); t.needsUpdate = true; t.userData.missing = true;
  return t;
}

export async function loadAssets() {
  const loader = new THREE.TextureLoader();
  await Promise.all(Object.entries(FILES).map(([k, url]) => loader.loadAsync(url).then((t) => {
    if (DETAIL.includes(k)) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
    else t.colorSpace = THREE.SRGBColorSpace;
    TEX[k] = t;
  }).catch(() => { console.warn('Missing asset, using placeholder:', url); TEX[k] = placeholder(!DETAIL.includes(k)); })));
}

// Vertex-coloured material multiplied by a triplanar detail texture, with bump relief derived
// from the texture's luminance. `local` samples in object space so textures stick to moving
// models; otherwise world space (seamless across instanced scenery).
// Terrain mode blends grass/sand/asphalt/rock/snow by a per-vertex `biome` weight attribute.
export function detailMaterial(texKey, scale, strength, opts = {}) {
  const { local = false, pbr = null, bump = 0.6, terrain = false } = opts;
  const m = pbr
    ? new THREE.MeshStandardMaterial({ vertexColors: true, metalness: pbr.metalness, roughness: pbr.roughness, envMapIntensity: pbr.env ?? 0.8 })
    : new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tDetail = { value: TEX[texKey] };
    sh.uniforms.dScale = { value: scale };
    sh.uniforms.dStrength = { value: strength };
    sh.uniforms.dBump = { value: bump };
    if (terrain) for (const k of ['sand', 'asphalt', 'rock', 'snow']) sh.uniforms['t_' + k] = { value: TEX[k] };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vDPos;\nvarying vec3 vDNrm;${terrain ? '\nattribute vec4 biome;\nvarying vec4 vBiome;' : ''}`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vec4 dwp = vec4(transformed, 1.0);
        vec3 dn = objectNormal;
        ${local ? '' : `#ifdef USE_INSTANCING
          dwp = instanceMatrix * dwp; dn = mat3(instanceMatrix) * dn;
        #endif
        dwp = modelMatrix * dwp; dn = mat3(modelMatrix) * dn;`}
        vDPos = dwp.xyz; vDNrm = dn;${terrain ? ' vBiome = biome;' : ''}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tDetail; uniform float dScale; uniform float dStrength; uniform float dBump;
        ${terrain ? 'uniform sampler2D t_sand; uniform sampler2D t_asphalt; uniform sampler2D t_rock; uniform sampler2D t_snow; varying vec4 vBiome;' : ''}
        varying vec3 vDPos; varying vec3 vDNrm;
        vec3 tri(sampler2D t) {
          vec3 w = pow(abs(normalize(vDNrm)), vec3(4.0)); w /= (w.x + w.y + w.z);
          vec3 p = vDPos * dScale;
          return texture2D(t, p.zy).rgb * w.x + texture2D(t, p.xz).rgb * w.y + texture2D(t, p.xy).rgb * w.z;
        }
        vec3 detailSample() {
          vec3 d = tri(tDetail);
          ${terrain ? `float g = clamp(1.0 - vBiome.x - vBiome.y - vBiome.z - vBiome.w, 0.0, 1.0);
          d = d * g + tri(t_sand) * vBiome.x + tri(t_asphalt) * vBiome.y + tri(t_rock) * vBiome.z + tri(t_snow) * vBiome.w;` : ''}
          return d;
        }
        vec3 dPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection) {
          vec3 vSigmaX = normalize(dFdx(surf_pos)); vec3 vSigmaY = normalize(dFdy(surf_pos)); vec3 vN = surf_norm;
          vec3 R1 = cross(vSigmaY, vN); vec3 R2 = cross(vN, vSigmaX);
          float fDet = dot(vSigmaX, R1) * faceDirection;
          vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
          vec3 r = abs(fDet) * surf_norm - vGrad;
          float l = length(r);
          return (l > 1e-6 && l == l) ? r / l : surf_norm; // degenerate derivatives -> keep the base normal
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 dt = detailSample();
        float dH = dot(dt, vec3(0.333));
        diffuseColor.rgb *= mix(vec3(1.0), dt * 2.0, dStrength);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = dPerturb(-vViewPosition, normal, vec2(dFdx(dH), dFdy(dH)) * dBump, faceDirection);`);
    if (pbr) sh.fragmentShader = sh.fragmentShader.replace('#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\n        roughnessFactor = clamp(roughnessFactor * (1.4 - dH * 0.8), 0.05, 1.0);');
  };
  m.customProgramCacheKey = () => `detail-${texKey}-${local}-${!!pbr}-${terrain}`;
  return m;
}

const PREFAB_TEX = {
  rock: 'rock', snowrock: 'rock', rockfall: 'rock', spire: 'rock', mesa: 'rock', boulders: 'rock',
  house: 'wood', barn: 'wood', cabin: 'wood', fence: 'wood', pole: 'wood', watchtower: 'wood', crates: 'wood', farmstead: 'wood',
  cabinSite: 'wood', ranger: 'wood', stash: 'wood', signalbox: 'wood', cache: 'wood', fallentree: 'wood', barricade: 'wood', tent: 'wood',
  ruin: 'concrete', warehouse: 'concrete', factory: 'concrete', concrete: 'concrete', platform: 'concrete', depot: 'wood', evacStation: 'concrete',
  canopy: 'metal', sandbags: 'concrete', warehouseSite: 'concrete', factorySite: 'concrete', shed: 'metal', outpost: 'concrete',
  tank: 'metal', container: 'metal', carwreck: 'metal', carwrecks: 'metal', fueldepot: 'metal', wreckedtrain: 'metal', helicopter: 'metal',
  radiotower: 'metal', tires: 'metal', bufferstop: 'metal', signal: 'metal', stub: 'gravel', debris: 'metal', damagedtrack: 'gravel',
  pumpjack: 'metal', pylon: 'metal', adobe: 'sand', cactus: 'wood', bones: 'concrete', pipes: 'metal', silo: 'metal',
};
const SCALE = { metal: 0.35, wood: 0.4, concrete: 0.18, rock: 0.25, gravel: 0.5, sand: 0.2 };

// Called once textures are loaded. Moving models (train, enemies) get object-space PBR materials.
export function initMaterials(renderer, scene) {
  for (const k of ['metal', 'wood', 'concrete', 'rock', 'gravel', 'sand']) MAT[k] = detailMaterial(k, SCALE[k], 0.85, { bump: k === 'rock' ? 1.2 : 0.6 });
  MAT.terrain = detailMaterial('ground', 0.1, 0.85, { terrain: true, bump: 0.5 });
  MAT.rail = detailMaterial('steel', 0.6, 0.6, { pbr: { metalness: 0.85, roughness: 0.35, env: 1.2 }, bump: 0.3 });
  MAT.sleeper = detailMaterial('wood', 0.5, 0.9, { bump: 1.0 });
  MAT.ballast = detailMaterial('gravel', 0.7, 0.9, { bump: 1.6 });
  MAT.trainPaint = () => detailMaterial('paint', 0.28, 0.9, { local: true, pbr: { metalness: 0.35, roughness: 0.55 }, bump: 0.8 });
  MAT.trainSteel = detailMaterial('steel', 0.5, 0.7, { local: true, pbr: { metalness: 0.85, roughness: 0.4, env: 1.1 }, bump: 0.5 });
  MAT.enemyBody = detailMaterial('steel', 0.45, 0.8, { local: true, pbr: { metalness: 0.55, roughness: 0.55 }, bump: 0.8 });
  MAT.crawler = detailMaterial('rock', 0.6, 0.6, { local: true, pbr: { metalness: 0.0, roughness: 0.8 }, bump: 1.5 });
  MAT.salvaged = detailMaterial('concrete', SCALE.concrete, 0.7); MAT.salvaged.color.setRGB(0.55, 0.52, 0.5);
  // Neutral studio reflections so metal reads as metal.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
}
export function matFor(prefabName) { return MAT[PREFAB_TEX[prefabName]] || MAT.vc; }
