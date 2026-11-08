import sys, subprocess, numpy as np, cv2
d = np.load('pose.npz'); I = d['img']
T0 = float(sys.argv[1]); out = sys.argv[2]
E = [(11,12),(11,13),(13,15),(12,14),(14,16),(11,23),(12,24),(23,24),(23,25),(25,27),(24,26),(26,28),(27,31),(28,32),(0,11),(0,12)]
tiles = []
for k in range(8):
    t = T0 - 0.6 + k * 0.15
    fi = int(round(t * 30))
    img = subprocess.run(['ffmpeg','-v','error','-ss',f'{t:.3f}','-i',sys.argv[3],'-frames:v','1','-vf','crop=800:860:560:0','-f','rawvideo','-pix_fmt','bgr24','-'],capture_output=True).stdout
    f = np.frombuffer(img, np.uint8).reshape(860, 800, 3).copy()
    p = I[fi]
    if not np.isnan(p[0,0]):
        P = (p * [800, 860]).astype(int)
        for a, b in E: cv2.line(f, tuple(P[a]), tuple(P[b]), (0,255,255) if a % 2 else (255,0,255), 4)
    cv2.putText(f, f'{t:.2f}', (20, 50), 0, 1.5, (255,255,255), 3)
    tiles.append(cv2.resize(f, (300, 322)))
cv2.imwrite(out, np.vstack([np.hstack(tiles[:4]), np.hstack(tiles[4:])]))
