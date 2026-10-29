// Renders one Player: skinned model + animator.

import * as THREE from 'three';
import { Player } from '../entities/player';
import { createPlayerModel, KitLook, PlayerAsset, PlayerModel } from './playerModel';
import { AnimContext, PlayerAnimator } from '../animation/animator';
import { TeamDef } from '../data/teams';

const SKINS = ['#f1c9a5', '#e0ac69', '#c68642', '#8d5524', '#5c3a21', '#ffdbac', '#d4a07a', '#a86b4c'];
const HAIRS = ['#1b1b1b', '#3b2412', '#6b4423', '#c9a45c', '#2b2b2b', '#151515', '#8a5a2b'];
const BOOTS = ['#111111', '#f2f2f2', '#e63946', '#1d70f5', '#f4d35e', '#ff6b1a', '#39d98a'];

export function kitFor(p: Player, t: TeamDef): KitLook {
  const r = (n: number) => ((p.id * 7919 + n * 104729 + t.id.charCodeAt(0) * 31) % 1000) / 1000;
  const keeper = p.role === 'GK';
  return {
    primary: keeper ? t.gkColor : t.primary,
    secondary: keeper ? '#1a1a1a' : t.secondary,
    shorts: keeper ? t.gkColor : t.shorts,
    socks: keeper ? t.gkColor : t.socks,
    boots: BOOTS[Math.floor(r(1) * BOOTS.length)],
    skin: SKINS[Math.floor(r(2) * SKINS.length)],
    hair: HAIRS[Math.floor(r(3) * HAIRS.length)],
    pattern: keeper ? 'plain' : t.pattern,
    numberColor: keeper ? '#111111' : t.numberColor,
    number: p.number,
    name: p.name,
    keeper,
    hairStyle: Math.floor(r(4) * 3),
  };
}

export class PlayerView {
  private model: PlayerModel;
  private anim: PlayerAnimator;

  constructor(public player: Player, asset: PlayerAsset, kit: KitLook) {
    this.model = createPlayerModel(asset, kit);
    this.anim = new PlayerAnimator(this.model, asset.clips);
  }

  get object(): THREE.Group {
    return this.model.root;
  }

  update(dt: number, holdingOverhead: boolean, ctx: AnimContext, at?: { x: number; z: number; facing: number }): void {
    this.anim.update(dt, this.player, holdingOverhead, ctx, at);
  }
}

/** Ring + arrow over the human-controlled player. */
export function createMarker(): THREE.Group {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.72, 32),
    new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.9, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  g.add(ring);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 3), new THREE.MeshBasicMaterial({ color: 0xffe14d }));
  tip.rotation.x = Math.PI;
  tip.position.y = 2.35;
  g.add(tip);
  const dir = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 3), new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.9 }));
  dir.rotation.x = Math.PI / 2;
  dir.position.set(0, 0.04, 0.95);
  g.add(dir);
  return g;
}
