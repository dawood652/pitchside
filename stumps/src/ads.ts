// Billboard ad slots. Defaults ship in the build; on the live site, ads.json next to index.html
// (same shape) replaces them without rebuilding, so boards can be sold and swapped by editing one file.
export interface Ad {
  text: string; // big line
  sub?: string; // small line (website, offer)
  bg: string;
  fg: string;
  image?: string; // optional image URL (PNG/JPG, ideally 1024x256), drawn instead of the text
}

export const DEFAULT_ADS: Ad[] = [
  { text: 'YOUR BRAND HERE', sub: 'Advertise on this board', bg: '#0b3d91', fg: '#ffffff' },
  { text: 'GOLDEN WILLOW', sub: 'Bats for big hitters', bg: '#c1121f', fg: '#ffffff' },
  { text: 'SPIN COLA', sub: 'Turn it up', bg: '#2b9348', fg: '#ffffff' },
  { text: 'NORTH STAR AIR', sub: 'Fly further', bg: '#f77f00', fg: '#111111' },
  { text: 'BOUNDARY FM', sub: '24/7 cricket radio', bg: '#6a00f4', fg: '#ffffff' },
  { text: 'AD SPACE AVAILABLE', sub: 'Your logo · your link', bg: '#111111', fg: '#ffd166' },
];

export async function loadAds(): Promise<Ad[]> {
  try {
    const r = await fetch('ads.json', { cache: 'no-store' });
    if (r.ok) {
      const j = (await r.json()) as Ad[];
      if (Array.isArray(j) && j.length) return j;
    }
  } catch {
    /* offline or blocked: use the built-in boards */
  }
  return DEFAULT_ADS;
}

/** Draw one ad into a canvas region (images are loaded by the caller). */
export function drawAd(g: CanvasRenderingContext2D, ad: Ad, x: number, y: number, w: number, h: number, img?: HTMLImageElement): void {
  g.fillStyle = ad.bg;
  g.fillRect(x, y, w, h);
  if (img && img.complete && img.naturalWidth) {
    g.drawImage(img, x, y, w, h);
    return;
  }
  g.fillStyle = ad.fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const big = Math.floor(h * (ad.sub ? 0.46 : 0.6));
  g.font = `900 ${big}px system-ui, sans-serif`;
  let size = big;
  while (g.measureText(ad.text).width > w * 0.9 && size > 8) g.font = `900 ${--size}px system-ui, sans-serif`;
  g.fillText(ad.text, x + w / 2, y + h * (ad.sub ? 0.4 : 0.52));
  if (ad.sub) {
    g.globalAlpha = 0.85;
    g.font = `600 ${Math.floor(h * 0.2)}px system-ui, sans-serif`;
    g.fillText(ad.sub, x + w / 2, y + h * 0.78);
    g.globalAlpha = 1;
  }
}
