import json, subprocess, numpy as np
from PIL import Image, ImageDraw
d = np.load('pose.npz'); I = d['img']
E = [(11,12),(11,13),(13,15),(12,14),(14,16),(11,23),(12,24),(23,24),(23,25),(25,27),(24,26),(26,28),(27,31),(28,32)]
sw = json.load(open('swings.json'))
tiles = []
for k in sw:
    row = []
    for dt in (-0.5, -0.2, 0.0, 0.2, 0.45):
        t = k['at'] + dt; fi = int(round(t * 30))
        raw = subprocess.run(['ffmpeg','-v','error','-ss',f'{t:.3f}','-i','/mnt/user-data/uploads/my_batting.mp4','-frames:v','1','-vf','crop=800:860:560:0,scale=160:172','-f','rawvideo','-pix_fmt','rgb24','-'],capture_output=True).stdout
        im = Image.frombytes('RGB', (160, 172), raw); dr = ImageDraw.Draw(im)
        p = I[fi]
        if not np.isnan(p[0,0]):
            P = p * [160, 172]
            for a, b in E: dr.line([tuple(P[a]), tuple(P[b])], fill=(255,255,0) if a % 2 else (255,0,255), width=2)
        if dt == -0.5: dr.text((3, 3), f"{k['at']:.0f}s {k['fam']}", fill=(255,255,255))
        row.append(im)
    tiles.append(row)
n = len(tiles); cols = 2
out = Image.new('RGB', (160 * 5 * cols, 172 * ((n + cols - 1) // cols)))
for i, row in enumerate(tiles):
    for j, im in enumerate(row): out.paste(im, ((i % cols) * 800 + j * 160, (i // cols) * 172))
out.save('swings.jpg', quality=80)
print(out.size)
