"""Crop the watermark, upscale x4 with Real-ESRGAN (realesr-general-x4v3), grade lightly, estimate depth.
Writes assets/img/<key>.jpg (2880x1620) and assets/img/<key>_depth.png."""
import os, sys, glob, numpy as np, torch, torch.nn as nn, torch.nn.functional as F
from PIL import Image, ImageFilter
torch.set_num_threads(4)

class SRVGGNetCompact(nn.Module):
    def __init__(self, num_in_ch=3, num_out_ch=3, num_feat=64, num_conv=32, upscale=4):
        super().__init__()
        self.upscale = upscale
        self.body = nn.ModuleList([nn.Conv2d(num_in_ch, num_feat, 3, 1, 1), nn.PReLU(num_parameters=num_feat)])
        for _ in range(num_conv):
            self.body.append(nn.Conv2d(num_feat, num_feat, 3, 1, 1)); self.body.append(nn.PReLU(num_parameters=num_feat))
        self.body.append(nn.Conv2d(num_feat, num_out_ch * upscale * upscale, 3, 1, 1))
        self.upsampler = nn.PixelShuffle(upscale)
    def forward(self, x):
        out = x
        for m in self.body: out = m(out)
        out = self.upsampler(out)
        return out + F.interpolate(x, scale_factor=self.upscale, mode="nearest")

_sr = None
USE_ESRGAN = False
def sr_model():
    global _sr
    if _sr is None:
        _sr = SRVGGNetCompact()
        sd = torch.load("models/realesr-general-x4v3.pth", map_location="cpu")
        _sr.load_state_dict(sd.get("params", sd)); _sr.eval()
    return _sr

def upscale(img):
    x = torch.from_numpy(np.asarray(img, dtype=np.float32) / 255.).permute(2, 0, 1)[None]
    with torch.no_grad():
        # tile vertically to bound memory
        H = x.shape[2]; outs = []; tile = 200; pad = 10
        for y0 in range(0, H, tile):
            a, b = max(0, y0 - pad), min(H, y0 + tile + pad)
            o = sr_model()(x[:, :, a:b])
            outs.append(o[:, :, (y0 - a) * 4:(y0 - a) * 4 + (min(H, y0 + tile) - y0) * 4])
        y = torch.cat(outs, 2).clamp(0, 1)
    return Image.fromarray((y[0].permute(1, 2, 0).numpy() * 255).round().astype(np.uint8))

_depth = None
def depth_map(img):
    global _depth
    if _depth is None:
        from transformers import pipeline
        _depth = pipeline("depth-estimation", model="depth-anything/Depth-Anything-V2-Small-hf", device="cpu")
    d = np.asarray(_depth(img.resize((768, 432)))["depth"], dtype=np.float32)
    d = (d - d.min()) / (d.max() - d.min() + 1e-6)    # 1 = near
    return Image.fromarray((d * 255).astype(np.uint8)).resize((960, 540), Image.BICUBIC).filter(ImageFilter.GaussianBlur(3))

def process(src, key, force=False):
    out = f"assets/img/{key}.jpg"
    if os.path.exists(out) and not force:
        return
    im = Image.open(src).convert("RGB")
    a = np.asarray(im).astype(np.float32).mean(axis=2)
    # auto-crop letterbox bars (rows/cols that are near-black)
    rows = np.where(a.mean(axis=1) > 12)[0]; cols = np.where(a.mean(axis=0) > 12)[0]
    if len(rows) and len(cols):
        im = im.crop((cols[0], rows[0], cols[-1] + 1, rows[-1] + 1))
    w, h = im.size
    if "pollinations" in src or key.startswith("pv_"):   # online images carry a watermark bottom-right
        h = int(h * 0.94)
    # centre-crop to 16:9
    if w / h > 16 / 9:
        cw = int(h * 16 / 9); im = im.crop(((w - cw) // 2, 0, (w - cw) // 2 + cw, h))
    else:
        ch = int(w * 9 / 16); im = im.crop((0, (h - ch) // 2, w, (h - ch) // 2 + ch))
    if USE_ESRGAN:
        big = upscale(im).resize((2880, 1620), Image.LANCZOS)
    else:
        big = im.resize((2880, 1620), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=2.2, percent=70, threshold=2))
    big.save(out, quality=93)
    depth_map(big).save(f"assets/img/{key}_depth.png")
    print("prepped", key, flush=True)

if __name__ == "__main__":
    os.makedirs("assets/img", exist_ok=True)
    force = "--force" in sys.argv
    keys = [a for a in sys.argv[1:] if not a.startswith("--")]
    srcs = [f"assets/raw/{k}.jpg" for k in keys] if keys else sorted(glob.glob("assets/raw/*.jpg"))
    for s in srcs:
        k = os.path.splitext(os.path.basename(s))[0]
        if k.startswith("archival_"): continue
        process(s, k, force)
