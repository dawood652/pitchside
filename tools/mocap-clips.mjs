// Which mocap clips go into the game, trimmed around their key moment (seconds in the source file).
// Source: Anderson Rohr, Mocap Pack 05 (Soccer), UE5 rig. "mirror" also bakes a left/right-flipped copy.
export const CLIPS = [
  { name: 'pass', key: 1.4, file: '08_Side_Foot_Kick_ue5.fbx', from: 0.75, to: 2.2, mirror: true }, // right foot, contact 1.40
  { name: 'shot', key: 2.6, file: '09_Power_Kick_ue5.fbx', from: 1.85, to: 3.5, mirror: true }, // left foot, contact 2.60
  { name: 'throwin', key: 6.6, file: '07_Throw_In_ue5.fbx', from: 5.6, to: 7.3 }, // release 6.60
  { name: 'save1', key: 5.2, file: '15_Goalkeeper_Save_01_ue5.fbx', from: 4.7, to: 6.8, mirror: true },
  { name: 'save2', key: 3.3, file: '16_Goalkeeper_Save_02_ue5.fbx', from: 2.9, to: 4.4, mirror: true },
  { name: 'save3', key: 6.8, file: '17_Goalkeeper_Save_03_ue5.fbx', from: 5.9, to: 8.0, mirror: true },
  { name: 'tackle', key: 4.77, file: '18_Defending_01_ue5.fbx', from: 4.3, to: 5.8, mirror: true }, // foot 4.77
  { name: 'cele1', key: 0.3, file: '12_Goal_Celebration_01_ue5.fbx', from: 0.3 },
  { name: 'cele2', key: 0.3, file: '13_Goal_Celebration_02_ue5.fbx', from: 0.3 },
  { name: 'cele3', key: 0.3, file: '14_Goal_Celebration_03_ue5.fbx', from: 0.3 },
];
