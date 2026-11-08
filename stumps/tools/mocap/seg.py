import numpy as np
d = np.load('pose.npz'); W = d['world']; t = d['t']; I = d['img']
hands = (W[:, 15] + W[:, 16]) / 2
v = np.linalg.norm(np.diff(hands, axis=0), axis=1) * 30
v = np.nan_to_num(v)
k = np.ones(3) / 3; vs = np.convolve(v, k, 'same')
peaks = []
for i in range(5, len(vs) - 5):
    if vs[i] > 3.0 and vs[i] == vs[i-12:i+13].max():
        if not peaks or i - peaks[-1] > 45: peaks.append(i)
print(len(peaks), 'swings')
for p in peaks:
    seg = W[p-24:p+18]
    ok = np.mean(~np.isnan(seg[:, 0, 0]))
    # which wrist leads, hip x of image (left/right stance), feet spread
    print(f"{t[p]:6.1f}s v={vs[p]:4.1f} ok={ok:.2f} hipImgX={np.nanmean(I[p,23:25,0]):.2f} feetZ={W[p,31,2]-W[p,32,2]:+.2f} handsY={hands[p,1]:+.2f}")
np.save('peaks.npy', np.array(peaks))
