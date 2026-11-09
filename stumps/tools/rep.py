import json, sys, numpy as np
R = json.load(open(sys.argv[1]))
print('proportions (Rocketbox batter):', R[0]['props'])
keys = [k for k in R[0] if k.startswith('e_')]
print('joint error vs engine skeleton (m): median / max')
for k in keys:
    a = np.array([r[k] for r in R]); print(f'  {k[2:]:6s} {np.median(a):.3f} / {a.max():.3f}  (worst at bt {R[int(a.argmax())]["bt"]})')
for s in 'LR':
    y = np.array([r['footY' + s] for r in R]); print(f'foot {s}: min height {y.min():+.3f} m (below 0 = in the ground) frames below -0.01: {(y < -0.01).sum()}')
    A = np.array([r['ank' + s] for r in R]); sl = np.linalg.norm(np.diff(A[:, [0, 2]], axis=0), axis=1); low = (A[1:, 1] < 0.13) & (A[:-1, 1] < 0.13)
    print(f'   planted-foot slide per frame: median {np.median(sl[low]) if low.any() else 0:.3f} max {sl[low].max() if low.any() else 0:.3f} m')
    ka = np.array([r['kneeAng' + s] for r in R]); kf = np.array([r['kneeFwd' + s] for r in R])
    print(f'   knee angle min {ka.min()} max {ka.max()} | knee behind the leg line (reverse bend) frames: {(kf < -0.02).sum()}')
for s in 'LR':
    ea = np.array([r['elbAng' + s] for r in R]); print(f'elbow {s}: angle min {ea.min()} max {ea.max()}')
print('pelvis y range', min(r['pelvisY'] for r in R), max(r['pelvisY'] for r in R), '| head y range', min(r['headY'] for r in R), max(r['headY'] for r in R))
