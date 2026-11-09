import subprocess, numpy as np
W, H = 96, 54
p = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', '/mnt/user-data/uploads/my_batting.mp4', '-vf', f'fps=10,scale={W}:{H}', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], stdout=subprocess.PIPE)
fr = []
while True:
    b = p.stdout.read(W * H)
    if len(b) < W * H: break
    fr.append(np.frombuffer(b, np.uint8).astype(np.float32))
fr = np.array(fr)
d = np.abs(np.diff(fr, axis=0)).mean(1)
cuts = [0] + [i + 1 for i in range(len(d)) if d[i] > 18 and d[i] > 3 * np.median(d[max(0, i - 10):i + 10])] + [len(fr)]
segs = [(cuts[i] / 10, cuts[i + 1] / 10) for i in range(len(cuts) - 1)]
np.save('frames10.npy', fr.reshape(-1, H, W).astype(np.uint8))
open('segs.txt', 'w').write('\n'.join(f'{a} {b}' for a, b in segs))
print(len(segs), 'segments'); print([(round(a, 1), round(b - a, 1)) for a, b in segs])
