# Kit mask for a Rocketbox avatar (shared UV template): R = shirt, G = trousers, B = cloth detail
# (fold shading, 0.5..1.5 mapped to 0..255). Built from the body texture inside the exported GLB so
# the mask lines up with exactly what the game loads.
import sys, json, struct, io
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

glb, out = sys.argv[1], sys.argv[2]
b = open(glb, 'rb').read()
jl = struct.unpack('<I', b[12:16])[0]
J = json.loads(b[20:20 + jl])
bin0 = 20 + jl + 8
mat = next(m for m in J['materials'] if 'body' in m['name'])
img_i = J['textures'][mat['pbrMetallicRoughness']['baseColorTexture']['index']]['source']
bv = J['bufferViews'][J['images'][img_i]['bufferView']]
im = Image.open(io.BytesIO(b[bin0 + bv.get('byteOffset', 0): bin0 + bv.get('byteOffset', 0) + bv['byteLength']])).convert('RGB')
a = np.asarray(im).astype(np.float32) / 255
H, W, _ = a.shape
yy, xx = np.mgrid[0:H, 0:W]
x = xx / W
y = yy / H
r, g, bl = a[..., 0], a[..., 1], a[..., 2]
lum = 0.299 * r + 0.587 * g + 0.114 * bl
bg = a.max(-1) < 0.03
skin = (r > g) & (g > bl) & (r - bl > 0.12) & (r > 0.38)
side = (x < 0.30) | (x > 0.70)
trousers = side & (y < 0.435) & ~bg
shirt = (((x > 0.31) & (x < 0.69) & (y < 0.88)) | (side & (y >= 0.435) & (y < 0.60) & ~skin)) & ~bg
shirt = ndimage.binary_opening(shirt, iterations=2)
def detail(mask):
    l = ndimage.median_filter(lum, size=7)  # keeps folds, drops print / logos
    med = np.median(l[mask]) if mask.any() else 0.3
    return np.clip(l / max(med, 1e-3), 0.7, 1.3)
d = np.where(shirt, detail(shirt), np.where(trousers, detail(trousers), 1.0))
m = np.zeros((H, W, 3), np.uint8)
m[..., 0] = shirt * 255
m[..., 1] = trousers * 255
m[..., 2] = np.clip((d - 0.5) * 255, 0, 255)
img = Image.fromarray(m)
img = Image.merge('RGB', [img.getchannel(0).filter(ImageFilter.GaussianBlur(1.5)), img.getchannel(1).filter(ImageFilter.GaussianBlur(1.5)), img.getchannel(2)])
img.resize((512, 512), Image.BILINEAR).save(out)
print('mask', out, 'shirt %.2f trousers %.2f' % (shirt.mean(), trousers.mean()))
