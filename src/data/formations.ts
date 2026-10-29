// Formation positions for a team attacking +x, in metres. x: -52.5 (own goal) .. 0 (halfway).

export type Role = 'GK' | 'DEF' | 'MID' | 'FWD';

export interface Slot {
  role: Role;
  x: number;
  z: number;
  number: number;
}

export const FORMATION_433: Slot[] = [
  { role: 'GK', x: -50.5, z: 0, number: 1 },
  { role: 'DEF', x: -36, z: 22, number: 2 },
  { role: 'DEF', x: -38, z: 7.5, number: 4 },
  { role: 'DEF', x: -38, z: -7.5, number: 5 },
  { role: 'DEF', x: -36, z: -22, number: 3 },
  { role: 'MID', x: -24, z: 12, number: 8 },
  { role: 'MID', x: -27, z: 0, number: 6 },
  { role: 'MID', x: -24, z: -12, number: 10 },
  { role: 'FWD', x: -11, z: 20, number: 7 },
  { role: 'FWD', x: -9, z: 0, number: 9 },
  { role: 'FWD', x: -11, z: -20, number: 11 },
];

/** Kick-off positions: everyone in own half, two forwards at the ball for the kicking side. */
export function kickoffPosition(slot: Slot, kicking: boolean): { x: number; z: number } {
  if (kicking && slot.number === 9) return { x: -0.6, z: 0.2 };
  if (kicking && slot.number === 10) return { x: -1.2, z: -6 };
  const x = Math.min(slot.x * 0.85, -1.5);
  if (!kicking && slot.role === 'FWD') return { x: Math.min(x, -10), z: slot.z };
  return { x, z: slot.z };
}
