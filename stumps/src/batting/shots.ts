// Shot selection: the batter picks the stroke a real player would for where you tapped
// (direction + loft) and the length of the ball. Angles in radians, + = off side (right-hander).
//
// Coaching rules used:
// - Full balls (yorker / half-volley / full) are played off the FRONT foot: drives (straight, cover,
//   on), the flick off the pads, the glance.
// - Short balls (short / bouncer) are played off the BACK foot: pull, hook, cut, back-foot punch,
//   upper cut.
// - Good length: front-foot drives and defence in the V; back-foot cut / punch square of the wicket.
// - Vertical-bat shots go straight and through the V; horizontal-bat shots (pull, hook, cut) go
//   square. Lofted versions open the bat face upward and finish high.

export type Length = 'yorker' | 'full' | 'good' | 'short' | 'bouncer';
export type Footwork = 'front' | 'back';
export type Plane = 'vertical' | 'horizontal' | 'angled';

export interface Shot {
  name: string;
  foot: Footwork;
  plane: Plane;
  aim: number; // field angle the face is pointed at
  loft: number; // face elevation (radians): + lifts the ball
  backlift: number; // arc angle of the backlift (negative)
  follow: number; // arc angle of the follow-through (positive)
  speed: number; // 0..1: how hard the swing is
  restitution: number; // bounce off the sweet spot
  contactZ: number; // how far down the pitch (from the stumps) the ball is met
  contactSide: number; // where the ball is met relative to the body line (+ = away from the body)
}

const deg = (d: number) => (d * Math.PI) / 180;

export function chooseShot(aim: number, tapDist: number, lofted: boolean, length: Length): Shot {
  const a = Math.atan2(Math.sin(aim), Math.cos(aim));
  const A = Math.abs(a);
  const off = a > 0;
  const full = length === 'yorker' || length === 'full';
  const short = length === 'short' || length === 'bouncer';
  const base = (name: string, foot: Footwork, plane: Plane, extra: Partial<Shot> = {}): Shot => ({
    name,
    foot,
    plane,
    aim: a,
    loft: lofted ? deg(30) : deg(-6),
    backlift: plane === 'vertical' ? -2.15 : -1.75,
    follow: lofted ? 2.7 : plane === 'vertical' ? 2.0 : 2.3,
    speed: lofted ? 1 : 0.85,
    restitution: 0.46,
    contactZ: foot === 'front' ? 1.95 : 1.05,
    contactSide: 0.35,
    ...extra,
  });
  // tapping right in front of the batter = defend
  if (tapDist < 9) {
    const s = base(short ? 'Back-foot defence' : 'Forward defence', short ? 'back' : 'front', 'vertical', { loft: deg(-12), backlift: -0.7, follow: 0.25, speed: 0.15, restitution: 0.18 });
    return s;
  }
  const L = (n: string) => (lofted ? `Lofted ${n.toLowerCase()}` : n);
  if (A < deg(12)) return short ? base('Back-foot punch', 'back', 'vertical') : base(L('Straight drive'), 'front', 'vertical', { contactSide: 0.15 });
  if (off) {
    if (A < deg(55)) return short ? base('Back-foot drive', 'back', 'vertical', { contactSide: 0.45 }) : base(L('Cover drive'), 'front', 'vertical', { contactSide: 0.5 });
    if (A < deg(110)) return full ? base(L('Square drive'), 'front', 'angled', { contactSide: 0.6 }) : base(lofted ? 'Upper cut' : 'Square cut', 'back', 'horizontal', { contactSide: 0.7, loft: lofted ? deg(35) : deg(-4) });
    return short ? base(lofted ? 'Upper cut' : 'Late cut', 'back', 'horizontal', { contactSide: 0.65, contactZ: 0.8, follow: 1.4, loft: lofted ? deg(40) : deg(0) }) : base('Late cut', 'back', 'angled', { contactSide: 0.6, contactZ: 0.85, follow: 1.2, speed: 0.6 });
  }
  if (A < deg(55)) return short ? base(lofted ? 'Pull for six' : 'Pull', 'back', 'horizontal', { contactSide: 0.25, contactZ: 1.2 }) : base(L('On drive'), 'front', 'vertical', { contactSide: 0.1 });
  if (A < deg(110)) return short ? base(lofted ? 'Pull for six' : 'Pull', 'back', 'horizontal', { contactSide: 0.15, contactZ: 1.15 }) : base(lofted ? 'Lofted flick' : 'Flick off the pads', 'front', 'angled', { contactSide: -0.05, speed: 0.75 });
  return short ? base('Hook', 'back', 'horizontal', { contactSide: 0.05, contactZ: 1.0, loft: deg(28) }) : base('Leg glance', 'front', 'angled', { contactSide: -0.1, follow: 1.0, speed: 0.45, restitution: 0.35 });
}
