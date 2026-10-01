"""Render the cartoon version: same timeline/narration as render.py, visuals drawn by scenes.py.
Usage: python3 cartoon_render.py [--start S --end S] [--workers N] [--out file.mp4]"""
import os, sys, json, math, argparse, subprocess
import numpy as np, cairo
import render                       # reuse timeline builder
from cartoon import W, H, text, PAL, INK, rgb, rrect, fill_stroke
import scenes
from script_data import SEGMENTS
FPS = 24
# illustrated background behind each scene (scenes using street()/cell() pick theirs up automatically)
BGMAP = {
    "gaol_hall": "bg_guard_room", "noose": "bg_gallows", "rich_prisoner": "bg_room_rich", "ludgate": "bg_town_gate",
    "pushed_in": "bg_door", "pov_corridor": "bg_corridor", "look_back": "bg_corridor", "keeper_back": "bg_corridor",
    "keeper_ledger": "bg_guard_room", "will_scribe": "bg_desk", "rebuild": "bg_newgate", "dungeon_pit": "bg_pit",
    "york_castle": "bg_castle_hill", "town_gate": "bg_town_gate", "tower": "bg_tower_day", "stocks": "bg_village",
    "keys_hook": "bg_guard_room", "tower_night": "bg_tower_night", "feast": "bg_hall", "rope_wall": "bg_tower_night",
    "sheet_rope": "bg_tower_night", "kitchen": "bg_kitchen", "boat": "bg_river_night", "sanctuary": "bg_church",
    "wall_ring": "bg_cell", "court_empty": "bg_court", "clerk": "bg_court", "court_wide": "bg_court", "jury": "bg_court",
    "castle_banners": "bg_sunset_castle", "straw": "bg_cell", "chains_floor": "bg_cell", "empty_bowl": "bg_cell",
    "rat": "bg_cell", "empty_purse": "bg_cell", "open_ring": "bg_cell",
}
# bottom-left labels, only where the scene itself does not already show the same words
LABELS = {"s49": "London, 1419", "s55": "York Castle", "s57": "The Tower of London", "s84": "Nottingham, 1357", "s64": "Tower of London"}

def placeholder(ctx, t, p, key):
    ctx.set_source_rgb(*PAL["cream"]); ctx.paint()
    text(ctx, key, W / 2, H / 2, 90, INK)

def draw_frame(ctx, t, shots, seg_times):
    active = [s for s in shots if s["t0"] <= t < s["t1"]] or [shots[-1] if t >= shots[-1]["t1"] else shots[0]]
    s = active[0]
    p = min(1, max(0, (t - s["t0"]) / (s["t1"] - s["t0"])))
    key = s["key"]
    move = s.get("move", "")
    el = t - s["t0"]                       # seconds into the shot
    ctx.save()
    if move == "punch":                    # quick zoom-in punch, then slow push
        q = min(1, el / 0.35); z = 1.18 - 0.16 * (1 - (1 - q) ** 3) + 0.03 * p
    elif move == "track":
        z = 1.0
    else:
        z = 1.0 + 0.05 * p
    sx = sy = 0.0
    if move in ("shake", "slam") and el < 0.7:
        amp = 26 * (1 - el / 0.7)
        sx, sy = amp * math.sin(el * 61), amp * math.cos(el * 47)
    tilt = 0.0
    if move in ("punch", "shake"):      # dutch angle like the reference
        tilt = math.radians(4.5) * (1 if (int(s["t0"] * 10) % 2) else -1)
    ctx.translate(W / 2 + sx, H / 2 + sy); ctx.rotate(tilt); ctx.scale(z * (1.06 if tilt else 1), z * (1.06 if tilt else 1)); ctx.translate(-W / 2, -H / 2)
    def paint_scene():
        scenes.CUR["seg"] = s["seg"]["id"]
        fn = scenes.SCENES.get(key.replace("card:", "card_"))
        import cartoon
        bg = BGMAP.get(key)
        if bg and cartoon.bg_image(ctx, bg, t, zoom=1.04 + 0.05 * p + (0.25 if key == "sheet_rope" else 0)):
            cartoon.SKIP["on"] = True
            try:
                if fn: fn(ctx, t, p)
            finally:
                cartoon.SKIP["on"] = False
        elif fn: fn(ctx, t, p)
        else: placeholder(ctx, t, p, key)
    if move == "whip" and el < 0.22:       # whip-pan: smeared copies sliding in
        q = el / 0.22
        ctx.push_group(); paint_scene(); pat = ctx.pop_group()
        for k in range(6):
            off = (1 - q) * 420 * (1 - k / 6)
            ctx.save(); ctx.translate(off, 0); ctx.set_source(pat); ctx.paint_with_alpha(0.35 if k else 1.0); ctx.restore()
    else:
        paint_scene()
    ctx.restore()
    if move == "slam" and el < 0.25:       # white flash on impact
        ctx.set_source_rgba(1, 1, 1, 0.85 * (1 - el / 0.25)); ctx.paint()
    # chapter title cards + selected labels
    for seg in SEGMENTS:
        st = seg_times.get(seg["id"])
        if not st: continue
        t0, t1, _ = st
        if seg.get("chapter") and t0 <= t <= t0 + 2.6:
            a = min(1, (t - t0) / 0.25, (t0 + 2.6 - t) / 0.35)
            pop = 0.85 + 0.15 * min(1, (t - t0) / 0.3)
            ctx.set_source_rgba(0.08, 0.06, 0.05, 0.6 * a); ctx.paint()
            ctx.push_group()
            ctx.translate(W / 2, H / 2); ctx.scale(pop, pop); ctx.translate(-W / 2, -H / 2)
            rrect(ctx, W / 2 - 560, H / 2 - 190, 1120, 380, 40); fill_stroke(ctx, PAL["white"], 8)
            text(ctx, "Chapter " + seg["chapter"][0], W / 2, H / 2 - 60, 80, PAL["scarlet"])
            title = " ".join(w[:1] + w[1:].lower() for w in seg["chapter"][1].split())
            text(ctx, title, W / 2, H / 2 + 100, 120, INK)
            ctx.pop_group_to_source(); ctx.paint_with_alpha(a)
        lbl = LABELS.get(seg["id"])
        if lbl and t0 + 0.3 <= t <= min(t1, t0 + 4.5):
            a = min(1, (t - t0 - 0.3) / 0.3, (min(t1, t0 + 4.5) - t) / 0.3)
            ctx.push_group(); text(ctx, lbl, 120, H - 80, 72, PAL["white"], align="left", outline=INK)
            ctx.pop_group_to_source(); ctx.paint_with_alpha(a)
    # fade in/out of whole film
    total = shots[-1]["t1x"]
    a = min(1, t / 0.6, max(0, (total - t) / 1.0))
    if a < 1:
        ctx.set_source_rgba(0, 0, 0, 1 - a); ctx.paint()

def render_range(args):
    f0, f1, out, shots, seg_times = args
    surf = cairo.ImageSurface(cairo.FORMAT_RGB24, W, H)
    ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "bgr0", "-s", f"{W}x{H}",
                           "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", out],
                          stdin=subprocess.PIPE)
    for i in range(f0, f1):
        ctx = cairo.Context(surf); ctx.set_source_rgb(0, 0, 0); ctx.paint()
        draw_frame(ctx, i / FPS, shots, seg_times)
        surf.flush(); ff.stdin.write(bytes(surf.get_data()))
    ff.stdin.close(); ff.wait()
    return out

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", type=float, default=0); ap.add_argument("--end", type=float, default=None)
    ap.add_argument("--workers", type=int, default=4); ap.add_argument("--out", default="build/cartoon.mp4")
    a = ap.parse_args()
    durs = json.load(open("build/vo/durations.json"))
    shots, seg_times, total = render.build_timeline(durs)
    end = min(a.end or total, total); F0, F1 = int(a.start * FPS), int(end * FPS)
    n = a.workers; step = math.ceil((F1 - F0) / n)
    jobs = [(F0 + k * step, min(F1, F0 + (k + 1) * step), f"build/cpart{k}.mp4", shots, seg_times) for k in range(n) if F0 + k * step < F1]
    from multiprocessing import Pool
    with Pool(len(jobs)) as pool: parts = pool.map(render_range, jobs)
    with open("build/cparts.txt", "w") as fh: fh.writelines(f"file '{os.path.basename(p)}'\n" for p in parts)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", "build/cparts.txt", "-c", "copy", a.out], check=True)
    print("wrote", a.out)
