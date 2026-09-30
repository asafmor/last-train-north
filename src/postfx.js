import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Fog of war: reconstructs world position from depth and darkens everything outside an
// ellipse around the train that reaches further ahead (headlight) than behind or sideways.
class FogOfWarPass extends Pass {
  constructor(camera) {
    super();
    this.camera = camera;
    this.uniforms = {
      tDiffuse: { value: null }, tDepth: { value: null },
      projInv: { value: new THREE.Matrix4() }, viewInv: { value: new THREE.Matrix4() },
      center: { value: new THREE.Vector2() }, dir: { value: new THREE.Vector2(0, -1) },
      reach: { value: new THREE.Vector3(95, 38, 48) }, // ahead, behind, side (metres)
      fogCol: { value: new THREE.Color(0.1, 0.1, 0.1) }, strength: { value: 0.9 }, time: { value: 0 },
    };
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform sampler2D tDepth; uniform mat4 projInv; uniform mat4 viewInv;
        uniform vec2 center; uniform vec2 dir; uniform vec3 reach; uniform vec3 fogCol; uniform float strength; uniform float time;
        varying vec2 vUv;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
        void main() {
          vec4 col = texture2D(tDiffuse, vUv);
          // Kill NaN/Inf before bloom: one bad pixel otherwise smears into black blocks via the bloom mips.
          if (any(isnan(col)) || any(isinf(col))) col = vec4(0.0, 0.0, 0.0, 1.0);
          col.rgb = min(col.rgb, vec3(32.0));
          float depth = texture2D(tDepth, vUv).x;
          vec4 ndc = vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
          vec4 view = projInv * ndc; view /= view.w;
          vec3 world = (viewInv * view).xyz;
          if (depth >= 1.0) world = vec3(center.x, 0.0, center.y) + vec3(1e4);
          vec2 rel = world.xz - center;
          float fwd = dot(rel, dir), side = dot(rel, vec2(-dir.y, dir.x));
          float r = fwd > 0.0 ? reach.x : reach.y;
          float e = length(vec2(fwd / r, side / reach.z));
          // Drifting noise breaks up the edge so it reads as murk, not a circle.
          float n = noise(world.xz * 0.05 + time * 0.15) * 0.35 + noise(world.xz * 0.013 - time * 0.05) * 0.25;
          float k = smoothstep(0.5, 1.0, e + n - 0.3) * strength;
          float lum = dot(col.rgb, vec3(0.3, 0.59, 0.11));
          vec3 murk = mix(vec3(lum) * 0.3, fogCol, 0.35);
          vec3 outc = mix(col.rgb, murk, k);
          gl_FragColor = vec4(any(isnan(outc)) ? col.rgb : outc, 1.0);
        }`,
    }));
  }
  render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.tDepth.value = readBuffer.depthTexture;
    this.uniforms.projInv.value.copy(this.camera.projectionMatrixInverse);
    this.uniforms.viewInv.value.copy(this.camera.matrixWorld);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
}

export class PostFX {
  constructor(renderer, scene, camera) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    rt.depthTexture = new THREE.DepthTexture(size.x, size.y);
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    this.fow = new FogOfWarPass(camera); this.composer.addPass(this.fow);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.35, 0.5, 0.88);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }
  setSize(w, h) { this.composer.setSize(w, h); }
  // center/dir in world xz; reveal scales the reach (smaller in fog/snow).
  update(center, dir, reveal, fogColor, time) {
    const u = this.fow.uniforms;
    u.center.value.set(center.x, center.z); u.dir.value.set(dir.x, dir.z).normalize();
    u.reach.value.set(72 * reveal, 26 * reveal, 34 * reveal);
    u.fogCol.value.copy(fogColor).multiplyScalar(0.45); u.time.value = time;
  }
  render() { this.composer.render(); }
}
