// Post-processing: ambient occlusion (N8AO), bloom, tone mapping, colour grade, vignette, SMAA.
// Quality: 2 = everything, 1 = no AO, 0 = plain render with ACES tone mapping.

import * as THREE from 'three';
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  BloomEffect,
  SMAAEffect,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
  BrightnessContrastEffect,
  HueSaturationEffect,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';

export class Post {
  private composer: EffectComposer;
  private ao: N8AOPostPass;
  private bloom: BloomEffect;
  quality = 2;

  constructor(private renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
    this.composer.addPass(new RenderPass(scene, camera));
    const w = renderer.domElement.width;
    const h = renderer.domElement.height;
    this.ao = new N8AOPostPass(scene, camera, w, h);
    this.ao.configuration.aoRadius = 1.6;
    this.ao.configuration.distanceFalloff = 0.6;
    this.ao.configuration.intensity = 2.2;
    this.ao.configuration.halfRes = true;
    this.ao.configuration.gammaCorrection = false;
    this.ao.setQualityMode('Medium');
    this.composer.addPass(this.ao);
    this.bloom = new BloomEffect({ intensity: 0.55, luminanceThreshold: 0.82, luminanceSmoothing: 0.2, mipmapBlur: true, radius: 0.7 });
    const grade = new HueSaturationEffect({ saturation: 0.12 });
    const contrast = new BrightnessContrastEffect({ contrast: 0.1 });
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    const vignette = new VignetteEffect({ offset: 0.32, darkness: 0.42 });
    const smaa = new SMAAEffect();
    this.composer.addPass(new EffectPass(camera, this.bloom, tone, grade, contrast, vignette, smaa));
    renderer.toneMapping = THREE.NoToneMapping;
  }

  setNight(night: boolean): void {
    this.bloom.intensity = night ? 1.25 : 0.55;
    this.bloom.luminanceMaterial.threshold = night ? 0.7 : 0.82;
  }

  setQuality(q: number): void {
    this.quality = q;
    this.ao.enabled = q >= 2;
    this.renderer.toneMapping = q === 0 ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  }

  setSize(w: number, h: number): void {
    this.composer.setSize(w, h);
  }

  render(scene: THREE.Scene, camera: THREE.Camera, dt: number): void {
    if (this.quality === 0) this.renderer.render(scene, camera);
    else this.composer.render(dt);
  }
}
