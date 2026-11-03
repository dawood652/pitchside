// Ground contact: after all animation layers, move the whole body up or down so the lowest foot sits
// on the grass. Blends of clips recorded at different heights, retargeted GRF clips and procedural
// offsets otherwise leave feet floating or sinking. Sinking is always fixed; floating is only pulled
// down a little (so jumps, slides and dives keep their airborne frames).

import * as THREE from 'three';

const FEET = ['foot_l', 'foot_r', 'ball_l', 'ball_r'];
const _p = new THREE.Vector3();

export class FootPlanter {
  private bones: THREE.Object3D[];
  private rest = 0; // lowest foot bone height when standing in the bind pose
  private offset = 0;

  constructor(root: THREE.Object3D, bones: Map<string, THREE.Object3D>) {
    this.bones = FEET.map((n) => bones.get(n)).filter((b): b is THREE.Object3D => !!b);
    root.updateMatrixWorld(true);
    const base = root.getWorldPosition(new THREE.Vector3()).y;
    this.rest = Math.min(...this.bones.map((b) => b.getWorldPosition(_p).y - base));
    if (!Number.isFinite(this.rest)) this.rest = 0;
  }

  /**
   * Returns the vertical offset to add to the model. floatFix: share of a small float to remove
   * (1 in locomotion, ~0 in airborne one-shots).
   */
  solve(dt: number, root: THREE.Object3D, groundY: number, floatFix: number): number {
    if (!this.bones.length) return 0;
    root.updateMatrixWorld(true);
    let low = 1e9;
    for (const b of this.bones) low = Math.min(low, b.getWorldPosition(_p).y);
    const err = low - groundY - this.rest; // foot height before correction (model not yet offset)
    let want = 0;
    if (err < 0) want = -err;
    else if (err < 0.08) want = -err * floatFix;
    // quick when lifting out of the ground, gentler when lowering
    const rate = want > this.offset ? 30 : 12;
    this.offset += (want - this.offset) * (1 - Math.exp(-dt * rate));
    return this.offset;
  }
}
