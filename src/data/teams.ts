// Fictional teams. Colours echo famous kits; names, crests and players are invented.

export type KitPattern = 'plain' | 'stripes' | 'hoops' | 'sash' | 'halves';

export interface TeamDef {
  id: string;
  name: string;
  short: string;
  primary: string;
  secondary: string;
  shorts: string;
  socks: string;
  pattern: KitPattern;
  numberColor: string;
  gkColor: string;
  rating: number; // 60..90
}

export const TEAMS: TeamDef[] = [
  { id: 'rbl', name: 'Royal Blanca CF', short: 'RBL', primary: '#f4f4f0', secondary: '#c9a227', shorts: '#f4f4f0', socks: '#f4f4f0', pattern: 'plain', numberColor: '#1b2a4a', gkColor: '#2fbf71', rating: 88 },
  { id: 'cat', name: 'Catalonia Grana', short: 'CAT', primary: '#9b1b3a', secondary: '#123a8c', shorts: '#123a8c', socks: '#123a8c', pattern: 'stripes', numberColor: '#f2c14e', gkColor: '#f2e14b', rating: 87 },
  { id: 'mer', name: 'Merseyside Reds', short: 'MER', primary: '#c8102e', secondary: '#ffffff', shorts: '#c8102e', socks: '#c8102e', pattern: 'plain', numberColor: '#ffffff', gkColor: '#1f1f1f', rating: 87 },
  { id: 'msk', name: 'Manchester Sky', short: 'MSK', primary: '#6cabdd', secondary: '#ffffff', shorts: '#ffffff', socks: '#1c2c5b', pattern: 'plain', numberColor: '#1c2c5b', gkColor: '#e86a1f', rating: 89 },
  { id: 'bav', name: 'Bavaria Rot', short: 'BAV', primary: '#dc052d', secondary: '#ffffff', shorts: '#ffffff', socks: '#dc052d', pattern: 'plain', numberColor: '#ffffff', gkColor: '#2a2a2a', rating: 86 },
  { id: 'tor', name: 'Torino Zebras', short: 'TOR', primary: '#f5f5f5', secondary: '#111111', shorts: '#111111', socks: '#111111', pattern: 'stripes', numberColor: '#c9a227', gkColor: '#e0d33a', rating: 83 },
  { id: 'par', name: 'Parisian Navy', short: 'PAR', primary: '#0b1e4f', secondary: '#d50032', shorts: '#0b1e4f', socks: '#0b1e4f', pattern: 'halves', numberColor: '#ffffff', gkColor: '#7fd1ae', rating: 85 },
  { id: 'mil', name: 'Milano Nerazzurri', short: 'MIL', primary: '#0a4ea2', secondary: '#111111', shorts: '#111111', socks: '#111111', pattern: 'stripes', numberColor: '#ffffff', gkColor: '#ff8a1f', rating: 84 },
];

export function teamById(id: string): TeamDef {
  return TEAMS.find((t) => t.id === id) ?? TEAMS[0];
}

/** Pick an away kit if the two primaries are too similar. */
export function colourDistance(a: string, b: string): number {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const dr = ((pa >> 16) & 255) - ((pb >> 16) & 255);
  const dg = ((pa >> 8) & 255) - ((pb >> 8) & 255);
  const db = (pa & 255) - (pb & 255);
  return Math.sqrt(dr * dr + dg * dg + db * db);
}
