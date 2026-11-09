# Per-swing 3D joint tracks (field coords, batter-centred), classified by where the hands go.
import numpy as np, json
d = np.load('pose.npz'); W = d['world'].astype(float); I = d['img']; t = d['t']; V = d['vis']
F = np.stack([-W[..., 0], -W[..., 1], -W[..., 2]], -1)  # off side +x, up +y, toward bowler +z (right-hander, camera at bowler's end)
hands = (F[:, 15] + F[:, 16]) / 2
sp = np.nan_to_num(np.linalg.norm(np.diff(hands, axis=0), axis=1) * 30)
sp = np.convolve(sp, np.ones(3) / 3, 'same')
hx = np.nanmean(I[:, 23:25, 0], axis=1)
jump = np.r_[np.abs(np.diff(hx)) > 0.06, False]
A, B = 27, 21  # 0.9 s before, 0.7 s after the fastest hand moment
cands = []
for i in range(A + 1, len(t) - B - 1):
    if sp[i] < 2.5 or sp[i] != sp[i - 10:i + 11].max(): continue
    w = slice(i - A, i + B)
    if np.isnan(F[w][:, :, 0]).any() or jump[w].any(): continue
    if (V[w][:, [11, 12, 23, 24, 25, 26, 27, 28]] < 0.5).mean() > 0.15: continue
    cands.append(i)
# the moment of contact ~ when the hands are lowest and fastest in the downswing: use min hand height within +-4 frames of peak speed
clips = []
for i in cands:
    j = i - 4 + int(np.argmin(hands[i - 4:i + 5, 1]))
    if j - A < 0 or j + B >= len(t): continue
    seg = F[j - A:j + B].copy()
    pel = (seg[:, 23] + seg[:, 24]) / 2
    # hand travel after contact decides the shot family
    after = hands[j + 8] - hands[j]
    lift = hands[j + 10, 1] - hands[j, 1]
    speed = sp[j - 3:j + 3].max()
    clips.append(dict(at=float(t[j]), seg=seg, dx=float(after[0]), lift=float(lift), speed=float(speed)))
print(len(cands), 'candidates,', len(clips), 'clips')
def fam(c):
    if c['speed'] < 3.2: return 'defence'
    if c['lift'] > 0.35: return 'drive' if c['dx'] < 0.15 else 'cut-loft'
    return 'leg' if c['dx'] < -0.1 else 'off'
for c in clips: c['fam'] = fam(c)
from collections import Counter
print(Counter(c['fam'] for c in clips))
for c in clips[:60]: print(f"{c['at']:6.1f}s {c['fam']:9s} speed {c['speed']:.1f} lift {c['lift']:+.2f} dx {c['dx']:+.2f}")
np.save('clips.npy', np.array([c['seg'] for c in clips]))
json.dump([{k: v for k, v in c.items() if k != 'seg'} for c in clips], open('clips.json', 'w'))
