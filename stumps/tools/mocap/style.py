import numpy as np, json
d = np.load('pose.npz'); W = d['world'].astype(float); good = np.load('good.npy')
# mediapipe world: x image-right, y down, z away from camera; hip-centred, metres.
# field (right-hander, camera at the bowler's end): off side = image left -> x_f = -x; y_f = -y; z_f = -z (toward bowler)
F = np.stack([-W[..., 0], -W[..., 1], -W[..., 2]], -1)
R = np.arange(-27, 22)  # -0.9 s .. +0.7 s at 30 Hz
def curve(fn):
    c = np.array([[fn(F[p + r]) for r in R] for p in good])
    return np.median(c, 0), np.percentile(c, 75, 0) - np.percentile(c, 25, 0)
ank = lambda f: (f[27] + f[28]) / 2
legLen = np.median([np.linalg.norm(F[p - 27, 23] - F[p - 27, 25]) + np.linalg.norm(F[p - 27, 25] - F[p - 27, 27]) for p in good])
feats = {
  'pelvisH': lambda f: ((f[23] + f[24]) / 2 - ank(f))[1] / legLen,             # crouch: hip height over ankles / leg length
  'handsH': lambda f: ((f[15] + f[16]) / 2 - (f[23] + f[24]) / 2)[1],           # hands above hip (m)
  'handsX': lambda f: ((f[15] + f[16]) / 2 - (f[23] + f[24]) / 2)[0],           # hands toward off side
  'leanX': lambda f: ((f[11] + f[12]) / 2 - (f[23] + f[24]) / 2)[0],            # shoulders over hips: lean to off side
  'headX': lambda f: (f[0] - (f[27] + f[28]) / 2)[0],                            # head over the feet (off side +)
  'feetW': lambda f: abs(f[27][0] - f[28][0]),                                   # feet spread across
  'shOpen': lambda f: float(np.degrees(np.arctan2(f[11][0] - f[12][0], f[11][2] - f[12][2]))),  # 0 = side-on (L shoulder to bowler), +ve = chest opening to bowler
  'kneeL': lambda f: float(np.degrees(np.pi - np.arccos(np.clip(np.dot(f[23]-f[25], f[27]-f[25]) / np.linalg.norm(f[23]-f[25]) / np.linalg.norm(f[27]-f[25]), -1, 1)))),
  'kneeR': lambda f: float(np.degrees(np.pi - np.arccos(np.clip(np.dot(f[24]-f[26], f[28]-f[26]) / np.linalg.norm(f[24]-f[26]) / np.linalg.norm(f[28]-f[26]), -1, 1)))),
}
out = {'dt': 1 / 30, 't0': -0.9, 'swings': len(good), 'legLen': legLen}
for k, fn in feats.items():
    m, iqr = curve(fn)
    out[k] = [round(float(x), 3) for x in m]
    print(f"{k:8s} stance={m[0]:7.3f} -0.3s={m[18]:7.3f} contact={m[27]:7.3f} +0.4s={m[39]:7.3f}  spread={np.median(iqr):.3f}")
json.dump(out, open('style.json', 'w'))
