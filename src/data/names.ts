// Fictional surname pool. Seeded so each team keeps the same squad.

const SURNAMES = [
  'Varela', 'Okonkwo', 'Lindqvist', 'Moreau', 'Castellan', 'Brandt', 'Ferreira', 'Kovač', 'Halloran', 'Duarte',
  'Nakamura', 'Ostrowski', 'Belkadi', 'Ruiz-Amat', 'Thorne', 'Vasquez', 'De Wilde', 'Achterberg', 'Mensah', 'Lucarelli',
  'Petrescu', 'Aldana', 'Szabo', 'Quint', 'Navarro', 'Holm', 'Diakité', 'Sørensen', 'Calder', 'Marchetti',
  'Iwobi-Lane', 'Rocha', 'Fenwick', 'Abara', 'Verhoeven', 'Kaminski', 'Sallow', 'Ortega', 'Benali', 'Eriksen-Vo',
  'Laurent', 'Pavlov', 'Adeyemi-Cole', 'Strand', 'Mirza', 'Galván', 'Hartley', 'Zeller', 'Okafor', 'Rinaldi',
  'Tavares', 'Brookes', 'Dumont', 'Kessler', 'Yildiz', 'Amari', 'Coutinho-Reis', 'Lowe', 'Ferrand', 'Bakri',
];

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function squadNames(teamId: string): string[] {
  let h = 0;
  for (const c of teamId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const rnd = seeded(h);
  const pool = [...SURNAMES];
  const out: string[] = [];
  for (let i = 0; i < 11; i++) {
    const idx = Math.floor(rnd() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}
