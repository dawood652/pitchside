import numpy as np
d = np.load('pose.npz'); W = d['world']; I = d['img']; t = d['t']
peaks = np.load('peaks.npy')
# camera cut detector: hip-centre image position or shoulder width jumps between frames
hx = np.nanmean(I[:, 23:25, 0], axis=1); sw = np.abs(I[:, 11, 0] - I[:, 12, 0])
jump = np.abs(np.diff(hx)) > 0.06
front_cam = (hx > 0.4) & (hx < 0.75)
good = []
for p in peaks:
    a, b = p - 27, p + 21  # 0.9 s before contact, 0.7 s after
    if a < 1 or b >= len(t): continue
    if np.isnan(W[a:b, :, 0]).any() or jump[a:b].any() or not front_cam[a:b].all(): continue
    hands = (W[:, 15] + W[:, 16]) / 2
    if hands[p, 1] < -0.25: continue  # hands above the chest at the peak = backlift or a pull, keep drives/defence only here
    good.append(p)
print('clean swings', len(good), [round(float(t[p]),1) for p in good])
# handedness at stance: which shoulder is nearer the camera (more negative z)
st = np.array([W[p - 27] for p in good])
print('L-R shoulder z (neg = left nearer camera):', float(np.mean(st[:, 11, 2] - st[:, 12, 2])), ' L-R shoulder x:', float(np.mean(st[:, 11, 0] - st[:, 12, 0])))
print('front ankle (left) z move from stance to contact:', [round(float(W[p, 27, 2] - W[p - 27, 27, 2]), 2) for p in good])
np.save('good.npy', np.array(good))
