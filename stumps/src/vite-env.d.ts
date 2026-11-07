declare module '*.glb?inline' {
  const data: string;
  export default data;
}
declare module '*.glb?url' {
  const url: string;
  export default url;
}
declare module 'n8ao' {
  import type { Pass } from 'postprocessing';
  import type { Scene, Camera } from 'three';
  export class N8AOPostPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number);
    configuration: { aoRadius: number; distanceFalloff: number; intensity: number; halfRes: boolean; gammaCorrection: boolean; [k: string]: unknown };
    setQualityMode(mode: 'Performance' | 'Low' | 'Medium' | 'High' | 'Ultra'): void;
  }
}
