import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import type { Quality, World } from './world';

/**
 * Render pipeline with three quality tiers.
 *
 * - high:   MSAA ×4, ground-truth ambient occlusion, bloom, planar floor
 *           reflections, 4K sun shadows, light shafts, colour grade.
 * - medium: MSAA ×2, bloom, 2K sun shadows, colour grade (no AO/reflections).
 * - low:    straight to screen with tone mapping only (older phones).
 *
 * WebXR sessions always render straight to the headset (post-processing is
 * not supported there).
 */

const GradeShader = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, uVignette: { value: 0.28 } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uVignette; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      // gentle S-curve and warm highlights
      vec3 s = c.rgb * c.rgb * (3.0 - 2.0 * c.rgb);
      c.rgb = mix(c.rgb, s, 0.22);
      c.rgb *= vec3(1.02, 1.0, 0.97);
      float d = length((vUv - 0.5) * vec2(1.1, 1.0));
      c.rgb *= 1.0 - uVignette * smoothstep(0.35, 0.85, d);
      gl_FragColor = c;
    }`,
};

export const PIXEL_RATIO: Record<Quality, number> = { high: 1.5, medium: 1.25, low: 1.5 };

export class Pipeline {
  quality: Quality = 'high';
  private composer: EffectComposer | null = null;
  private w = 1;
  private h = 1;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private world: World,
    private camera: THREE.PerspectiveCamera,
  ) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.88;
    renderer.shadowMap.type = THREE.PCFShadowMap;
  }

  setQuality(q: Quality) {
    const shadowsBefore = this.renderer.shadowMap.enabled;
    this.quality = q;
    this.renderer.shadowMap.enabled = q !== 'low';
    if (shadowsBefore !== this.renderer.shadowMap.enabled) {
      // Materials must recompile when shadow support is switched on/off.
      this.world.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (m) (Array.isArray(m) ? m : [m]).forEach((x) => (x.needsUpdate = true));
      });
    }
    this.world.setQuality(q);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, PIXEL_RATIO[q]));
    this.composer?.dispose();
    this.composer = null;
    if (q !== 'low') {
      const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: q === 'high' ? 4 : 2 });
      const composer = new EffectComposer(this.renderer, rt);
      composer.addPass(new RenderPass(this.world.scene, this.camera));
      if (q === 'high') {
        const ao = new GTAOPass(this.world.scene, this.camera, this.w, this.h);
        // AO must only see solid surfaces: hide glass, light shafts, glows and
        // helpers while it renders its depth/normal buffer.
        const internals = ao as unknown as { _overrideVisibility(): void; _visibilityCache: THREE.Object3D[] };
        const base = internals._overrideVisibility.bind(ao);
        internals._overrideVisibility = () => {
          base();
          this.world.scene.traverse((o) => {
            const m = (o as THREE.Mesh).material as THREE.Material | undefined;
            if (!o.visible || !m || Array.isArray(m)) return;
            if (m.transparent || !m.depthWrite || m.blending === THREE.AdditiveBlending) {
              o.visible = false;
              internals._visibilityCache.push(o);
            }
          });
        };
        ao.updateGtaoMaterial({ radius: 0.7, distanceExponent: 1.4, thickness: 1.2, scale: 1.0, samples: 12 });
        ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
        ao.blendIntensity = 0.85;
        composer.addPass(ao);
      }
      // High threshold: only light fittings, screens and sun patches glow.
      composer.addPass(new UnrealBloomPass(new THREE.Vector2(this.w, this.h), q === 'high' ? 0.32 : 0.24, 0.45, 2.4));
      composer.addPass(new OutputPass());
      composer.addPass(new ShaderPass(GradeShader));
      this.composer = composer;
    }
    this.setSize(this.w, this.h);
  }

  setSize(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.renderer.setSize(w, h, false);
    const pr = this.renderer.getPixelRatio();
    this.composer?.setPixelRatio(pr);
    this.composer?.setSize(w, h);
    this.world.setReflectionSize((w * pr) / 2, (h * pr) / 2);
  }

  render() {
    if (this.composer && !this.renderer.xr.isPresenting) this.composer.render();
    else this.renderer.render(this.world.scene, this.camera);
  }
}
