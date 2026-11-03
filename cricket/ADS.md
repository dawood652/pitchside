# Selling the billboards

The ground has two kinds of ad space:
- **LED ring** at the boundary rope (scrolls through all ads), and
- **8 big billboards** on top of the stands (one ad each, cycling through the list).

Ads live in `ads.json` next to the game's `index.html` (on GitHub Pages: `docs/cricket/ads.json`).
Edit that file and push — no rebuild needed. Each entry:

```json
{ "text": "ACME COFFEE", "sub": "acme.com · 20% off", "bg": "#0b3d91", "fg": "#ffffff", "image": "ads/acme.png" }
```

- `image` is optional: a PNG/JPG (best 1024×256) placed in `docs/cricket/ads/`. When set it is drawn instead of the text.
- Order matters: billboard *n* shows entry *n mod count*; the LED ring cycles all of them.
