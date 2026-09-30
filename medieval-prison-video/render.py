"""Renderer: timeline from script_data + narration durations -> 1920x1080 24fps video (no audio).

Each shot is a still with depth map; camera moves are done as 2.5D (zoom/pan + depth parallax),
with colour grade, torch flicker, grain, vignette, dust, transitions and typography on top.
Usage: python3 render.py [--preview] [--from S --to S] [--workers N] [--out file.mp4]
"""
import os, sys, json, math, subprocess, functools, argparse
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from script_data import SEGMENTS

W, H, FPS = 1920, 1080, 24
FONT = "assets/fonts/"
GAP = 0.0            # clips already carry their natural trailing breath
XFADE = 0.55         # default crossfade between shots
CH_FADE = 0.9        # dip-to-black at chapter starts

# ------------------------------------------------------------------ timeline
def build_timeline(durs):
    """Returns list of shots: dict(key, move, t0, t1, seg, fade_in, kind) and segment starts."""
    shots, seg_times, t = [], {}, 0.6          # small lead-in from black
    for seg in SEGMENTS:
        vo = durs.get(seg["id"], 0.0)
        dur = seg.get("hold", 0) + vo + max(0.0, seg.get("pause", GAP) - 0.15)
        if seg.get("chapter"):
            t += 0.5                            # breathing room before a chapter
        seg_times[seg["id"]] = (t, t + dur, vo)
        tot_w = sum(w for _, _, w in seg["shots"])
        tt = t
        for i, (key, move, w) in enumerate(seg["shots"]):
            d = dur * w / tot_w
            fade = "black" if (i == 0 and seg.get("chapter")) or seg.get("title") else "cross"
            shots.append(dict(key=key, move=move, t0=tt, t1=tt + d, seg=seg, fade=fade))
            tt += d
        t += dur
    total = t + 1.2
    # extend each shot so it overlaps the next one (crossfade happens over the overlap)
    for a, b in zip(shots, shots[1:]):
        a["t1x"] = a["t1"] + (XFADE / 2 if b["fade"] == "cross" else 0)
        b["t0x"] = b["t0"] - (XFADE / 2 if b["fade"] == "cross" else 0)
    shots[0]["t0x"] = shots[0]["t0"] - 0.6
    shots[-1]["t1x"] = total
    return shots, seg_times, total

# ------------------------------------------------------------------ assets
@functools.lru_cache(maxsize=12)
def load_still(key):
    if key.startswith("card:"):
        path = f"build/cards/{key[5:]}.jpg"
        depth = None
    else:
        path = f"assets/img/{key}.jpg"
        dp = f"assets/img/{key}_depth.png"
        depth = cv2.imread(dp, cv2.IMREAD_GRAYSCALE) if os.path.exists(dp) else None
    img = cv2.imread(path)[:, :, ::-1].astype(np.float32) / 255.0
    img = grade(img, interior=not key.startswith("card:"))
    if depth is None:
        depth = np.full((540, 960), 128, np.uint8)
    depth = cv2.resize(depth, (img.shape[1], img.shape[0]), interpolation=cv2.INTER_LINEAR).astype(np.float32) / 255.0
    return img, depth

def grade(img, interior=True):
    """Unify the look across generated stills: gentle S-curve, slight desaturation, warm mids/cool shadows."""
    if not interior:
        return img
    lum = img @ np.array([0.299, 0.587, 0.114], np.float32)
    img = lum[..., None] + (img - lum[..., None]) * 0.82          # desaturate 18%
    img = np.clip(img, 0, 1)
    img = img * img * (3 - 2 * img) * 0.35 + img * 0.65            # soft S-curve
    shadow = (1 - lum)[..., None] ** 2
    img = img + shadow * np.array([-0.012, 0.0, 0.018], np.float32)     # cool shadows
    img = img + (lum[..., None] ** 2) * np.array([0.03, 0.012, -0.02], np.float32)  # warm highlights
    return np.clip(img, 0, 1)

# ------------------------------------------------------------------ camera
def ease(p):
    return p * p * (3 - 2 * p)

MOVES = {
    #        zoom0 zoom1  dx0   dx1   dy0   dy1  parallax(lat) parallax(zoom)
    "push":   (1.06, 1.20, 0, 0, 0, 0, 0.0, 0.04),
    "pull":   (1.20, 1.06, 0, 0, 0, 0, 0.0, -0.04),
    "dolly":  (1.05, 1.17, 0, 0, 0.01, -0.01, 0.0, 0.09),
    "pan_l":  (1.14, 1.14, 0.05, -0.05, 0, 0, 0.022, 0.0),
    "pan_r":  (1.14, 1.14, -0.05, 0.05, 0, 0, -0.022, 0.0),
    "tilt_u": (1.15, 1.15, 0, 0, 0.055, -0.055, 0.0, 0.02),
    "tilt_d": (1.15, 1.15, 0, 0, -0.055, 0.055, 0.0, 0.02),
    "orbit_l": (1.12, 1.16, -0.03, 0.03, 0, 0, 0.045, 0.02),
    "orbit_r": (1.12, 1.16, 0.03, -0.03, 0, 0, -0.045, 0.02),
    "drift":  (1.10, 1.15, -0.015, 0.015, 0.01, -0.01, 0.012, 0.02),
    "none":   (1.0, 1.02, 0, 0, 0, 0, 0, 0),
    "map":    (1.0, 1.0, 0, 0, 0, 0, 0, 0),
}

_grid = None
def grid():
    global _grid
    if _grid is None:
        u, v = np.meshgrid(np.arange(W, dtype=np.float32), np.arange(H, dtype=np.float32))
        _grid = ((u - W / 2) / W, (v - H / 2) / H)   # normalised -0.5..0.5
    return _grid

def camera_frame(key, move, p):
    img, depth = load_still(key)
    sh, sw = img.shape[:2]
    z0, z1, dx0, dx1, dy0, dy1, plat, pzoom = MOVES.get(move, MOVES["drift"])
    e = ease(p)
    z = z0 + (z1 - z0) * e
    cx = 0.5 + dx0 + (dx1 - dx0) * e
    cy = 0.5 + dy0 + (dy1 - dy0) * e
    gu, gv = grid()
    # base mapping (normalised source coords)
    xs = cx + gu / z
    ys = cy + gv / z
    mx, my = xs * sw, ys * sh
    if plat or pzoom:
        d = cv2.remap(depth, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT) - 0.5
        lat = plat * (e - 0.5)                  # lateral parallax: near moves opposite to far
        zp = pzoom * e                          # zoom parallax: near grows faster
        mx = mx - (d * lat) * sw - (d * zp * gu / z) * sw
        my = my - (d * zp * gv / z) * sh
    return cv2.remap(img, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)

# ------------------------------------------------------------------ overlays
rng = np.random.default_rng(7)
GRAIN = [(rng.standard_normal((H // 2, W // 2)).astype(np.float32)) for _ in range(6)]
_vig = None
def vignette():
    global _vig
    if _vig is None:
        gu, gv = grid()
        r = np.sqrt((gu * 1.0) ** 2 + (gv * 0.9) ** 2)
        _vig = np.clip(1 - 0.55 * np.clip(r - 0.25, 0, None) ** 1.6 * 2.2, 0.35, 1)[..., None].astype(np.float32)
    return _vig

def flicker(t, seed):
    return 1 + 0.035 * math.sin(t * 9.1 + seed) * math.sin(t * 3.7 + seed * 2) + 0.015 * math.sin(t * 23 + seed)

DUST = rng.random((140, 5)).astype(np.float32)   # x, y, size, speed, phase
def dust_layer(frame, t, strength):
    """Soft motes drifting through the light."""
    lay = np.zeros((H // 2, W // 2), np.float32)
    for x, y, s, sp, ph in DUST:
        px = int(((x + 0.01 * math.sin(t * 0.4 + ph * 6)) % 1) * (W // 2))
        py = int(((y + t * 0.012 * (0.4 + sp)) % 1) * (H // 2))
        cv2.circle(lay, (px, py), 1 + int(s * 2), 0.5 + 0.5 * math.sin(t + ph * 9), -1)
    lay = cv2.GaussianBlur(lay, (0, 0), 1.5)
    lay = cv2.resize(lay, (W, H))[..., None]
    lum = frame.mean(axis=2, keepdims=True)
    return frame + lay * strength * (0.25 + lum) * np.array([1.0, 0.9, 0.75], np.float32)

@functools.lru_cache(maxsize=64)
def text_layer(kind, a, b=""):
    """RGBA float overlay for titles/labels."""
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    if kind == "chapter":           # a = numeral, b = title
        f1 = ImageFont.truetype(FONT + "Cinzel.ttf", 34); f1.set_variation_by_axes([500])
        f2 = ImageFont.truetype(FONT + "Cinzel.ttf", 84); f2.set_variation_by_axes([700])
        x, y = 120, H - 250
        dr.text((x + 2, y + 2), "CHAPTER " + a, font=f1, fill=(0, 0, 0, 160))
        dr.text((x, y), "CHAPTER " + a, font=f1, fill=(214, 186, 132, 255))
        dr.line((x, y + 52, x + 90, y + 52), fill=(214, 186, 132, 230), width=2)
        dr.text((x + 3, y + 73), b, font=f2, fill=(0, 0, 0, 170))
        dr.text((x, y + 70), b, font=f2, fill=(245, 238, 225, 255))
    elif kind == "label":           # small location / fact label, lower left
        f = ImageFont.truetype(FONT + "Inter.ttf", 30); f.set_variation_by_axes([14, 600])
        txt = " ".join(a)            # letter-spaced
        x, y = 120, H - 150
        tw = dr.textlength(txt, font=f)
        dr.rectangle((x - 22, y - 16, x + tw + 22, y + 50), fill=(0, 0, 0, 110))
        dr.line((x - 22, y - 16, x - 22, y + 50), fill=(214, 186, 132, 255), width=4)
        dr.text((x, y), txt, font=f, fill=(240, 234, 222, 255))
    elif kind == "title":
        f = ImageFont.truetype(FONT + "Cinzel.ttf", 64); f.set_variation_by_axes([600])
        f2 = ImageFont.truetype(FONT + "Cinzel.ttf", 118); f2.set_variation_by_axes([800])
        l1, l2 = "WHY YOU WOULDN'T SURVIVE", "A MEDIEVAL PRISON"
        for txt, fnt, y in ((l1, f, H / 2 - 120), (l2, f2, H / 2 - 30)):
            tw = dr.textlength(txt, font=fnt)
            dr.text(((W - tw) / 2 + 4, y + 4), txt, font=fnt, fill=(0, 0, 0, 190))
            dr.text(((W - tw) / 2, y), txt, font=fnt, fill=(240, 228, 205, 255))
        dr.line((W / 2 - 160, H / 2 + 125, W / 2 + 160, H / 2 + 125), fill=(190, 150, 90, 255), width=3)
    im = im.filter(ImageFilter.GaussianBlur(0.4))
    return np.asarray(im, dtype=np.float32) / 255.0

def over(frame, layer, alpha):
    a = layer[..., 3:4] * alpha
    return frame * (1 - a) + layer[..., :3] * a

def window(t, t0, t1, fin=0.5, fout=0.5):
    if t < t0 or t > t1: return 0.0
    return min(1.0, (t - t0) / fin, (t1 - t) / fout)

# ------------------------------------------------------------------ frame
DARK_KEYS = ("card:",)
def shot_frame(s, t):
    dur = s["t1x"] - s["t0x"]
    p = (t - s["t0x"]) / dur
    if s["move"] == "map":
        from cards import map_frame
        return map_frame(min(1, max(0, p)))
    f = camera_frame(s["key"], s["move"], min(1, max(0, p)))
    if not s["key"].startswith("card:"):
        f = f * flicker(t, hash(s["key"]) % 97)
        if s["key"] in DUSTY:
            f = dust_layer(f, t, 0.10)
    return f

DUSTY = {"slit_window", "empty_corner", "hero_waiting", "hero_back_light", "door_shut", "court_empty",
         "title_corridor", "bread_water", "pov_corridor", "hero_window", "open_ring", "dungeon_pit"}

def render_frame(t, shots, seg_times, total):
    active = [s for s in shots if s["t0x"] <= t < s["t1x"]]
    frame = np.zeros((H, W, 3), np.float32)
    for s in active:
        f = shot_frame(s, t)
        if s["fade"] == "black":
            a = min(1, max(0, (t - s["t0"]) / (CH_FADE / 2)))       # fade up from black
        else:
            a = min(1, max(0, (t - s["t0x"]) / XFADE))
        # fade to black before a chapter/title start
        nxt = [n for n in shots if n["t0"] >= s["t1"] - 1e-6][:1]
        if nxt and nxt[0]["fade"] == "black":
            a *= min(1, max(0, (s["t1"] - t) / (CH_FADE / 2)))
        frame = frame * (1 - a) + f * a
    # global fades
    frame *= min(1, t / 0.8, max(0, (total - t) / 1.0))
    frame *= vignette()
    # typography
    for seg in SEGMENTS:
        st = seg_times.get(seg["id"])
        if not st: continue
        t0, t1, vo = st
        if seg.get("chapter") and t0 <= t <= t0 + 3.6:
            frame = over(frame, text_layer("chapter", *seg["chapter"]), window(t, t0 + 0.3, t0 + 3.6, 0.6, 0.7))
        if seg.get("text_overlay") and t0 <= t <= t1:
            frame = over(frame, text_layer("label", seg["text_overlay"]), window(t, t0 + 0.4, min(t1, t0 + 4.5), 0.5, 0.5))
        if seg.get("title") and t0 <= t <= t1:
            frame = over(frame, text_layer("title", "t"), window(t, t0 + 0.6, t1 - 0.2, 0.9, 0.6))
    # grain (animated, stronger in shadows)
    g = cv2.resize(GRAIN[int(t * FPS) % len(GRAIN)], (W, H), interpolation=cv2.INTER_NEAREST)[..., None]
    frame = frame + g * 0.022 * (1.2 - frame)
    return (np.clip(frame, 0, 1) * 255 + 0.5).astype(np.uint8)

# ------------------------------------------------------------------ main
def render_range(args):
    f0, f1, out, shots, seg_times, total = args
    ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
                           "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium",
                           "-crf", "18", "-pix_fmt", "yuv420p", out], stdin=subprocess.PIPE)
    for i in range(f0, f1):
        ff.stdin.write(render_frame(i / FPS, shots, seg_times, total).tobytes())
        if (i - f0) % 240 == 0:
            print(f"{out}: {i - f0}/{f1 - f0}", flush=True)
    ff.stdin.close(); ff.wait()
    return out

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", type=float, default=0); ap.add_argument("--end", type=float, default=None)
    ap.add_argument("--workers", type=int, default=4); ap.add_argument("--timeline-only", action="store_true"); ap.add_argument("--out", default="build/video.mp4")
    a = ap.parse_args()
    durs = json.load(open("build/vo/durations.json"))
    shots, seg_times, total = build_timeline(durs)
    json.dump(dict(total=total, segs=seg_times, shots=[{k: v for k, v in s.items() if k != "seg"} | {"seg": s["seg"]["id"]} for s in shots]),
              open("build/timeline.json", "w"), indent=1)
    if a.timeline_only:
        print("timeline", total); sys.exit()
    end = min(a.end or total, total)
    F0, F1 = int(a.start * FPS), int(end * FPS)
    n = a.workers; step = math.ceil((F1 - F0) / n)
    jobs = [(F0 + k * step, min(F1, F0 + (k + 1) * step), f"build/part{k}.mp4", shots, seg_times, total)
            for k in range(n) if F0 + k * step < F1]
    from multiprocessing import Pool
    with Pool(len(jobs)) as pool:
        parts = pool.map(render_range, jobs)
    with open("build/parts.txt", "w") as fh:
        fh.writelines(f"file '{os.path.basename(p)}'\n" for p in parts)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", "build/parts.txt",
                    "-c", "copy", a.out], check=True)
    print("wrote", a.out, f"{(F1 - F0) / FPS:.1f}s")
