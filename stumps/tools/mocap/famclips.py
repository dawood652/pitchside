# Median 3D joint tracks per shot family, aligned at contact, in batter-local field coords.
import json, numpy as np
d = np.load('pose.npz'); W = d['world'].astype(float)
F = np.stack([-W[..., 0], -W[..., 1], -W[..., 2]], -1)
sw = json.load(open('swings.json'))
A, B = 27, 21
J = {'head': 0, 'shL': 11, 'shR': 12, 'elL': 13, 'elR': 14, 'haL': 15, 'haR': 16, 'hipL': 23, 'hipR': 24, 'knL': 25, 'knR': 26, 'ftL': 27, 'ftR': 28, 'heelL': 29, 'heelR': 30, 'toeL': 31, 'toeR': 32}
out = {'dt': 1 / 30, 't0': -A / 30, 'joints': list(J)}
for fam in ('drive', 'off', 'leg'):
    segs = []
    for s in sw:
        if s['fam'] != fam: continue
        j = int(round(s['at'] * 30))
        seg = F[j - A:j + B][:, list(J.values())].copy()
        # batter-local: origin on the ground under the stance hips (first frame), feet on y = 0
        base = (seg[0, 7] + seg[0, 8]) / 2
        ground = np.min(seg[0, 11:13, 1])
        seg -= np.array([base[0], ground, base[2]])
        segs.append(seg)
    segs = np.array(segs)
    med = np.median(segs, axis=0)
    # light temporal smoothing (3-frame)
    med = np.concatenate([med[:1], (med[:-2] + med[1:-1] + med[2:]) / 3, med[-1:]])
    spread = np.median(np.std(segs, axis=0))
    out[fam] = np.round(med, 3).tolist()
    print(fam, len(segs), 'swings, median joint spread %.3f m' % spread,
          '| front foot travel z %.2f x %.2f' % tuple(med[A, 11, [2, 0]] - med[0, 11, [2, 0]]),
          '| hip drop %.2f' % (med[0, 7, 1] - med[A, 7, 1]),
          '| hands at contact y %.2f, +0.4s y %.2f' % ((med[A, 5, 1] + med[A, 6, 1]) / 2, (med[A + 12, 5, 1] + med[A + 12, 6, 1]) / 2))
json.dump(out, open('famclips.json', 'w'))
