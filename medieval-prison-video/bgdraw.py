"""Hand-drawn backgrounds (no AI): wobbly ink outlines, flat painted fills with simple shading,
light brush texture and soft focus, matching the stick-figure style. Each background is rendered once
to assets/bg_hd/<name>.png at 2320x1305 (pan/zoom headroom); animated bits (flames, clouds) are added live."""
import math, random, os, cairo
import numpy as np
from PIL import Image, ImageFilter
from stick import wpath, INK
from cartoon import rgb

BW, BH = 2320, 1305
R = random.Random(1)
_b = [0]
def nb():
    _b[0] += 1; return _b[0]

BG_INK = (0.24, 0.20, 0.18)
def stroke(ctx, w=5, col=None):
    col = BG_INK if col is None or col == INK else col
    ctx.set_source_rgb(*col); ctx.set_line_width(max(2.0, w * 0.6)); ctx.set_line_cap(1); ctx.set_line_join(1); ctx.stroke()

def subdiv(pts, step=70, closed=True):
    out = []; n = len(pts)
    for i in range(n if closed else n - 1):
        a, b = pts[i], pts[(i + 1) % n]
        d = math.hypot(b[0] - a[0], b[1] - a[1]); k = max(1, int(d / step))
        for j in range(k): out.append((a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k))
    if not closed: out.append(pts[-1])
    return out

def shape(ctx, pts, fill, w=5, amp=1.3, shade=0.18, step=70, line=True):
    shade = shade * 0.35
    P = subdiv(pts, step)
    ctx.new_path(); wpath(ctx, P, nb(), amp, closed=True)
    path = ctx.copy_path()
    ctx.set_source_rgb(*fill); ctx.fill_preserve()
    if shade:
        ys = [p[1] for p in pts]; y0, y1 = min(ys), max(ys)
        g = cairo.LinearGradient(0, y0, 0, y1); g.add_color_stop_rgba(0, 1, 1, 1, shade * 0.4); g.add_color_stop_rgba(1, 0, 0, 0, shade)
        ctx.set_source(g); ctx.fill_preserve()
    if line: stroke(ctx, w)
    else: ctx.new_path()
    return path

def rect(ctx, x, y, w, h, fill, lw=5, shade=0.18):
    return shape(ctx, [(x, y), (x + w, y), (x + w, y + h), (x, y + h)], fill, lw, shade=shade)

def ln(ctx, pts, w=5, col=None, amp=1.2):
    ctx.new_path(); wpath(ctx, subdiv(pts, 60, False), nb(), amp)
    if col is None: stroke(ctx, w)
    else: ctx.set_source_rgb(*col); ctx.set_line_width(w); ctx.set_line_cap(1); ctx.stroke()

def ellipse(ctx, cx, cy, rx, ry, fill, lw=5, shade=0.12, n=18):
    shade = shade * 0.35
    pts = [(cx + rx * math.cos(2 * math.pi * k / n), cy + ry * math.sin(2 * math.pi * k / n)) for k in range(n)]
    ctx.new_path(); wpath(ctx, pts, nb(), 1.2, closed=True)
    ctx.set_source_rgb(*fill); ctx.fill_preserve()
    if shade:
        g = cairo.LinearGradient(0, cy - ry, 0, cy + ry); g.add_color_stop_rgba(0, 1, 1, 1, shade * 0.4); g.add_color_stop_rgba(1, 0, 0, 0, shade)
        ctx.set_source(g); ctx.fill_preserve()
    if lw: stroke(ctx, lw)
    else: ctx.new_path()

def mix(a, b, t): return tuple(a[i] * (1 - t) + b[i] * t for i in range(3))

# ------------------------------------------------------------------ building blocks
def sky(ctx, top=rgb("8fc3e3"), bot=rgb("d9ecf5"), h=BH):
    g = cairo.LinearGradient(0, 0, 0, h); g.add_color_stop_rgb(0, *top); g.add_color_stop_rgb(1, *bot)
    ctx.set_source(g); ctx.rectangle(0, 0, BW, h); ctx.fill()

def cloud(ctx, x, y, s=1.0, col=rgb("fbfaf6")):
    pts = []
    for k in range(10):
        a = math.pi + math.pi * k / 9
        r = (70 + 30 * math.sin(k * 2.3)) * s
        pts.append((x + 150 * s * math.cos(a), y + 60 * s * math.sin(a) - (r - 70 * s) * 0.6))
    pts += [(x + 150 * s, y + 10 * s), (x - 150 * s, y + 10 * s)]
    shape(ctx, pts, col, 4, shade=0.06, step=40)

def stone_wall(ctx, x0, y0, x1, y1, base=rgb("8a8780"), bh=110, mortar=True, seed=3, dark=0.0):
    r = random.Random(seed)
    ctx.rectangle(x0, y0, x1 - x0, y1 - y0); ctx.set_source_rgb(*mix(base, (0, 0, 0), 0.18)); ctx.fill()
    y = y0; row = 0
    while y < y1:
        x = x0 - (row % 2) * 70
        while x < x1:
            w = 190 + r.random() * 90
            c = mix(base, rgb("b9b4a8") if r.random() < 0.5 else rgb("6d6a64"), r.random() * 0.18)
            shape(ctx, [(x + 4, y + 4), (x + w - 4, y + 4), (x + w - 4, y + bh - 4), (x + 4, y + bh - 4)], c, 3.5, amp=1.6, shade=0.22, step=50)
            x += w
        y += bh; row += 1
    if dark:
        ctx.rectangle(x0, y0, x1 - x0, y1 - y0); ctx.set_source_rgba(0.03, 0.03, 0.06, dark); ctx.fill()

def straw_floor(ctx, y0, base=rgb("7d6a4e"), seed=5, y1=BH):
    r = random.Random(seed)
    shape(ctx, [(-20, y0), (BW + 20, y0), (BW + 20, y1 + 20), (-20, y1 + 20)], base, 5, shade=0.25)
    for k in range(90):
        x, y = r.random() * BW, y0 + 15 + r.random() * (y1 - y0)
        a = r.random() * 0.9 - 0.45; L = 26 + r.random() * 20
        ln(ctx, [(x, y), (x + L * math.cos(a), y + L * math.sin(a))], 4, rgb("d8b45a") if r.random() > 0.35 else rgb("b8963f"), amp=0.6)

def cobbles(ctx, y0, seed=7, base=rgb("9a8c78")):
    r = random.Random(seed)
    shape(ctx, [(-20, y0), (BW + 20, y0), (BW + 20, BH + 20), (-20, BH + 20)], base, 5, shade=0.2)
    for k in range(38):
        x, y = r.random() * BW, y0 + 30 + r.random() * (BH - y0 - 40)
        sc = 0.6 + (y - y0) / (BH - y0)
        ln(ctx, [(x, y), (x + 50 * sc, y + 2)], 4)

def grass(ctx, y0, base=rgb("7fa35a"), seed=9):
    r = random.Random(seed)
    shape(ctx, [(-20, y0), (BW * 0.3, y0 - 30), (BW * 0.7, y0 + 10), (BW + 20, y0 - 20), (BW + 20, BH + 20), (-20, BH + 20)], base, 5, shade=0.2, step=120)
    for k in range(160):
        x, y = r.random() * BW, y0 + 30 + r.random() * (BH - y0)
        ln(ctx, [(x, y), (x - 4, y - 18)], 3, mix(base, (0, 0, 0), 0.3), amp=0.5)

def window(ctx, x, y, w, h, glass=rgb("3e4d5c"), frame=rgb("6a4a30"), bars=True, light=False):
    rect(ctx, x - 8, y - 8, w + 16, h + 16, frame, 4, 0.1)
    rect(ctx, x, y, w, h, rgb("f6dc8a") if light else glass, 4, 0.25)
    if bars:
        ln(ctx, [(x + w / 2, y), (x + w / 2, y + h)], 5, frame); ln(ctx, [(x, y + h / 2), (x + w, y + h / 2)], 5, frame)

def timber_house(ctx, x, base_y, w, h, wall, roof, r):
    h1 = h * 0.42; over = 22; beam = rgb("4a3020")
    rect(ctx, x, base_y - h1, w, h1, wall, 5, 0.18)
    dw = w * 0.26; dx = x + w * (0.12 if r.random() < 0.5 else 0.6)
    shape(ctx, [(dx, base_y), (dx, base_y - h1 * 0.6), (dx + dw / 2, base_y - h1 * 0.8), (dx + dw, base_y - h1 * 0.6), (dx + dw, base_y)], rgb("7a5232"), 4, step=30)
    window(ctx, x + w * (0.62 if dx < x + w * 0.4 else 0.14), base_y - h1 * 0.75, w * 0.22, h1 * 0.34)
    uy0, uy1 = base_y - h, base_y - h1
    rect(ctx, x - over, uy0, w + 2 * over, uy1 - uy0, mix(wall, (1, 1, 1), 0.08), 5, 0.15)
    ln(ctx, [(x - over, uy1), (x + w + over, uy1)], 10, beam)
    n = 3
    for k in range(n + 1):
        px = x - over + k * (w + 2 * over) / n; ln(ctx, [(px, uy0), (px, uy1)], 7, beam)
    for k in range(n):
        ax = x - over + k * (w + 2 * over) / n; bx = ax + (w + 2 * over) / n
        if k == 1: window(ctx, ax + (bx - ax) * 0.2, uy0 + (uy1 - uy0) * 0.25, (bx - ax) * 0.6, (uy1 - uy0) * 0.45, light=r.random() < 0.2)
        else: ln(ctx, [(ax, uy1), (bx, uy0)], 6, beam)
    rx0, rx1, ry = x - over - 26, x + w + over + 26, uy0 - (w + 2 * over) * 0.6
    shape(ctx, [(rx0, uy0), ((rx0 + rx1) / 2, ry), (rx1, uy0)], roof, 5, shade=0.3, step=60)
    for k in range(1, 5):
        fy = uy0 - (uy0 - ry) * k / 5; half = (rx1 - rx0) / 2 * (1 - k / 5)
        ln(ctx, [((rx0 + rx1) / 2 - half + 10, fy), ((rx0 + rx1) / 2 + half - 10, fy)], 3, mix(roof, (0, 0, 0), 0.35), 0.8)

def stall(ctx, x, y, cloth):
    for px in (x, x + 300): ln(ctx, [(px, y), (px, y - 240)], 10, rgb("6a4a30"))
    shape(ctx, [(x - 30, y - 220), (x + 330, y - 220), (x + 300, y - 290), (x, y - 290)], cloth, 5, shade=0.25, step=50)
    for k in range(6): ln(ctx, [(x - 30 + k * 60, y - 220), (x - 30 + k * 60 + 30, y - 200)], 4, mix(cloth, (1, 1, 1), 0.4))
    rect(ctx, x - 10, y - 100, 320, 30, rgb("8b5e3b"), 4)
    for k in range(5): ellipse(ctx, x + 30 + k * 60, y - 112, 28, 16, rgb("c98a45"), 3.5)

def torch_bracket(ctx, x, y):
    rect(ctx, x - 14, y, 28, 80, rgb("6a4a30"), 4); ln(ctx, [(x - 30, y + 60), (x, y + 80), (x + 30, y + 60)], 6, rgb("3b3b40"))
    g = cairo.RadialGradient(x, y - 40, 0, x, y - 40, 420); g.add_color_stop_rgba(0, 1, 0.75, 0.35, 0.35); g.add_color_stop_rgba(1, 1, 0.75, 0.35, 0)
    ctx.set_source(g); ctx.arc(x, y - 40, 420, 0, 2 * math.pi); ctx.fill()

def gatehouse(ctx, cx, base, s=1.0, col=rgb("9c988e")):
    for side in (-1, 1):
        tx = cx + side * 300 * s
        rect(ctx, tx - 140 * s, base - 700 * s, 280 * s, 700 * s, col, 6, 0.25)
        for k in range(4): rect(ctx, tx - 140 * s + k * 74 * s, base - 770 * s, 50 * s, 74 * s, col, 5, 0.2)
        window(ctx, tx - 20 * s, base - 520 * s, 40 * s, 80 * s, rgb("23262b"), rgb("5a5850"), bars=False)
    rect(ctx, cx - 180 * s, base - 540 * s, 360 * s, 540 * s, mix(col, (0, 0, 0), 0.12), 6, 0.2)
    shape(ctx, [(cx - 110 * s, base), (cx - 110 * s, base - 250 * s), (cx, base - 350 * s), (cx + 110 * s, base - 250 * s), (cx + 110 * s, base)], rgb("1f2226"), 6, step=40)
    for k in range(-2, 3): ln(ctx, [(cx + k * 40 * s, base - 320 * s), (cx + k * 40 * s, base - 90 * s)], 7, rgb("4b4e52"))
    for k in range(3): ln(ctx, [(cx - 100 * s, base - 290 * s + k * 70 * s), (cx + 100 * s, base - 290 * s + k * 70 * s)], 7, rgb("4b4e52"))

def keep(ctx, cx, base, s=1.0, col=rgb("d6d0c2"), night=False):
    w, h = 460 * s, 520 * s
    rect(ctx, cx - w / 2, base - h, w, h, col, 6, 0.25)
    for k in range(4):
        tx = cx - w / 2 + k * w / 3
        rect(ctx, tx - 44 * s, base - h - 100 * s, 88 * s, 110 * s, col, 5, 0.2)
        shape(ctx, [(tx - 52 * s, base - h - 100 * s), (tx, base - h - 170 * s), (tx + 52 * s, base - h - 100 * s)], rgb("5b5e66"), 5)
    for rr in range(2):
        for k in range(3):
            window(ctx, cx - w / 3 + k * w / 3 - 18 * s, base - h + 100 * s + rr * 170 * s, 36 * s, 70 * s, rgb("f2c45a") if night else rgb("3e4d5c"), rgb("6a6458"), bars=False)

def river(ctx, y0, col=rgb("6aa1c4"), night=False):
    shape(ctx, [(-20, y0), (BW + 20, y0), (BW + 20, BH + 20), (-20, BH + 20)], col, 5, shade=0.3)
    r = random.Random(4)
    for k in range(40):
        x, y = r.random() * BW, y0 + 30 + r.random() * (BH - y0)
        ln(ctx, [(x, y), (x + 50, y)], 4, mix(col, (1, 1, 1), 0.35 if not night else 0.15), 0.6)

def moon_stars(ctx):
    r = random.Random(2)
    for k in range(90):
        x, y = r.random() * BW, r.random() * BH * 0.55
        ctx.new_path(); ctx.arc(x, y, 2 + r.random() * 2, 0, 6.3); ctx.set_source_rgba(1, 1, 0.9, 0.5 + r.random() * 0.5); ctx.fill()
    g = cairo.RadialGradient(1850, 200, 0, 1850, 200, 260); g.add_color_stop_rgba(0, 1, 1, 0.85, 0.35); g.add_color_stop_rgba(1, 1, 1, 0.85, 0)
    ctx.set_source(g); ctx.arc(1850, 200, 260, 0, 6.3); ctx.fill()
    ellipse(ctx, 1850, 200, 90, 90, rgb("f3efd2"), 4, 0.08)

def table(ctx, x, y, w, col=rgb("8b5e3b")):
    rect(ctx, x - w / 2, y, w, 40, col, 5, 0.2)
    for lx in (x - w / 2 + 40, x + w / 2 - 40): ln(ctx, [(lx, y + 40), (lx, y + 220)], 16, mix(col, (0, 0, 0), 0.25))

def banner(ctx, x, y, col):
    shape(ctx, [(x, y), (x + 130, y), (x + 130, y + 260), (x + 65, y + 210), (x, y + 260)], col, 5, shade=0.25, step=40)
    ellipse(ctx, x + 65, y + 100, 30, 30, rgb("e2b23c"), 4)

def arch_window(ctx, x, y, w, h, glass=rgb("cfe3ee")):
    shape(ctx, [(x, y + h), (x, y + w / 2), (x + w / 2, y), (x + w, y + w / 2), (x + w, y + h)], glass, 5, shade=0.15, step=30)
    ln(ctx, [(x + w / 2, y + 10), (x + w / 2, y + h)], 6); ln(ctx, [(x, y + h * 0.55), (x + w, y + h * 0.55)], 6)

def cottage(ctx, x, base, w, h):
    rect(ctx, x, base - h, w, h, rgb("efe3c8"), 5, 0.18)
    shape(ctx, [(x - 40, base - h + 10), (x + w / 2, base - h - w * 0.55), (x + w + 40, base - h + 10)], rgb("c9a46b"), 5, shade=0.3)
    for k in range(6): ln(ctx, [(x - 20 + k * (w + 40) / 6, base - h + 5), (x + w / 2, base - h - w * 0.5)], 2.5, rgb("9d7c48"), 0.8)
    rect(ctx, x + w * 0.4, base - h * 0.55, w * 0.22, h * 0.55, rgb("7a5232"), 4)
    window(ctx, x + w * 0.1, base - h * 0.75, w * 0.2, h * 0.25)

def tree(ctx, x, base, s=1.0):
    ln(ctx, [(x, base), (x - 6, base - 160 * s)], 26 * s, rgb("6a4a30"))
    for dx, dy, rr in ((0, -230, 110), (-80, -180, 80), (80, -180, 85), (0, -300, 80)):
        ellipse(ctx, x + dx * s, base + dy * s, rr * s, rr * 0.85 * s, rgb("5f8f4a"), 4, 0.25)

# ------------------------------------------------------------------ scenes
def bg_street(ctx):
    sky(ctx)
    for (x, y, s) in ((300, 170, 1.0), (1100, 120, 1.3), (1900, 200, 0.9)): cloud(ctx, x, y, s)
    r = random.Random(11)
    # far row (paler) then near row
    x = -60
    while x < BW + 60:
        w = 200 + r.random() * 70; h = 300 + r.random() * 120
        timber_house(ctx, x, 760, w, h, mix(rgb("efe3c8"), rgb("cfdde6"), 0.45), mix(rgb("a8443a"), rgb("cfdde6"), 0.45), r); x += w + 60
    ctx.set_source_rgba(0.85, 0.92, 0.96, 0.35); ctx.rectangle(0, 0, BW, 770); ctx.fill()
    x = -80
    while x < BW + 80:
        w = 280 + r.random() * 90; h = 520 + r.random() * 200
        timber_house(ctx, x, 880, w, h, r.choice([rgb("efe3c8"), rgb("f1dcb0"), rgb("e9d6c0")]), r.choice([rgb("a8443a"), rgb("8a5a3c"), rgb("6d5a4a"), rgb("b5562e")]), r)
        x += w + 70
    cobbles(ctx, 880)
    stall(ctx, 160, 1010, rgb("b8322a")); stall(ctx, 1840, 1010, rgb("4a6a8c"))

def bg_city(ctx):
    sky(ctx)
    for (x, y, s) in ((400, 160, 1.1), (1500, 110, 1.4)): cloud(ctx, x, y, s)
    r = random.Random(12); x = -40
    while x < BW:
        w = 80 + r.random() * 70; h = 120 + r.random() * 150
        rect(ctx, x, 760 - h, w, h, r.choice([rgb("efe3c8"), rgb("e6d3b0"), rgb("d9c49c")]), 4, 0.2)
        shape(ctx, [(x - 6, 760 - h), (x + w / 2, 760 - h - w * 0.5), (x + w + 6, 760 - h)], r.choice([rgb("a8443a"), rgb("8a5a3c"), rgb("b5562e")]), 4)
        x += w + 4
    rect(ctx, 1000, 380, 340, 380, rgb("9c988e"), 6); rect(ctx, 1120, 220, 100, 170, rgb("9c988e"), 5)
    shape(ctx, [(1120, 222), (1170, -40), (1220, 222)], rgb("5b5e66"), 5)
    for k in range(4): arch_window(ctx, 1030 + k * 80, 500, 40, 100, rgb("3e4d5c"))
    river(ctx, 760)
    shape(ctx, [(200, 800), (2100, 800), (2100, 860), (200, 860)], rgb("b9b4a8"), 5)
    for k in range(9): shape(ctx, [(240 + k * 210, 860), (240 + k * 210, 820), (330 + k * 210, 790), (420 + k * 210, 820), (420 + k * 210, 860)], rgb("6aa1c4"), 4, step=30)

def bg_newgate(ctx):
    sky(ctx)
    for (x, y, s) in ((300, 150, 1.0), (1950, 180, 1.1)): cloud(ctx, x, y, s)
    shape(ctx, [(-20, 900), (BW + 20, 900), (BW + 20, BH + 20), (-20, BH + 20)], rgb("8b6a4a"), 5, shade=0.25)
    r = random.Random(3)
    for k in range(10): ellipse(ctx, r.random() * BW, 960 + r.random() * 300, 70 + r.random() * 60, 18, rgb("8fa4ad"), 3, 0.1)
    rect(ctx, -20, 520, BW + 40, 380, rgb("9c988e"), 6, 0.25)
    for k in range(32): rect(ctx, k * 76, 470, 50, 56, rgb("9c988e"), 4, 0.2)
    gatehouse(ctx, BW / 2, 900, 1.05)

def bg_cell(ctx):
    stone_wall(ctx, -20, -20, BW + 20, 940, rgb("7e7b74"), seed=6)
    wx, wy = 1240, 220
    window(ctx, wx, wy, 220, 170, rgb("dfeef6"), rgb("4b4e52"), bars=False)
    for k in range(1, 4): ln(ctx, [(wx + k * 55, wy), (wx + k * 55, wy + 170)], 10, rgb("3b3b40"))
    ctx.new_path(); ctx.move_to(wx, wy + 170); ctx.line_to(wx + 220, wy + 170); ctx.line_to(wx + 40, 1305); ctx.line_to(wx - 420, 1305); ctx.close_path()
    ctx.set_source_rgba(1, 1, 0.9, 0.12); ctx.fill()
    straw_floor(ctx, 940)
    torch_bracket(ctx, 420, 420)
    ln(ctx, [(1900, 520), (1905, 700), (1890, 760)], 8, rgb("4b4e52")); ellipse(ctx, 1890, 520, 26, 26, rgb("4b4e52"), 6, 0)

def bg_dungeon(ctx):
    stone_wall(ctx, -20, -20, BW + 20, 940, rgb("6b6862"), seed=14, dark=0.15)
    for x in (380, 760, 1560, 1940):
        for k in range(8):
            ellipse(ctx, x + 6 * math.sin(k), 40 + k * 44, 12 if k % 2 else 18, 22, (0, 0, 0), 0, 0) if False else None
            ctx.new_path(); ctx.save(); ctx.translate(x + 4 * math.sin(k), 40 + k * 44); ctx.scale(0.65 if k % 2 else 1, 1); ctx.arc(0, 0, 16, 0, 6.3); ctx.restore()
            ctx.set_source_rgb(*rgb("3b3b40")); ctx.set_line_width(7); ctx.stroke()
    straw_floor(ctx, 940, rgb("5d5040"), seed=15)
    torch_bracket(ctx, 1160, 380)
    rect(ctx, 1450, 760, 620, 70, rgb("7a5232"), 5); ellipse(ctx, 1450, 790, 60, 60, rgb("5a3c24"), 5); ellipse(ctx, 2070, 790, 60, 60, rgb("5a3c24"), 5)
    for x in (1490, 2030): ln(ctx, [(x, 830), (x, 1000)], 16, rgb("5a3c24"))

def bg_door(ctx):
    stone_wall(ctx, -20, -20, BW + 20, BH + 20, rgb("8a8780"), seed=12)
    shape(ctx, [(760, BH + 20), (760, 520), (1160, 200), (1560, 520), (1560, BH + 20)], rgb("1d1f23"), 6, step=40)
    shape(ctx, [(790, BH + 20), (790, 530), (1160, 240), (1530, 530), (1530, BH + 20)], rgb("8b5e3b"), 6, step=40)
    for k in range(1, 6): ln(ctx, [(790 + k * 123, 300), (790 + k * 123, BH)], 4, rgb("5a3c24"))
    for y in (640, 1040): rect(ctx, 780, y, 760, 40, rgb("4b4e52"), 5)
    rect(ctx, 1080, 420, 160, 120, rgb("1d1f23"), 5)
    for k in range(1, 4): ln(ctx, [(1080 + k * 40, 420), (1080 + k * 40, 540)], 8, rgb("4b4e52"))

def bg_corridor(ctx):
    ctx.set_source_rgb(*rgb("2b2826")); ctx.rectangle(0, 0, BW, BH); ctx.fill()
    vx, vy = BW / 2, BH * 0.46
    for k in range(9):
        f = k / 9; sc = 0.12 + 0.88 * (1 - f) ** 1.8
        w, h = BW * 1.1 * sc, BH * 1.2 * sc
        g = 0.30 + 0.38 * (1 - f)
        shape(ctx, [(vx - w / 2, vy - h / 2), (vx + w / 2, vy - h / 2), (vx + w / 2, vy + h / 2), (vx - w / 2, vy + h / 2)], (g * 0.95, g * 0.92, g * 0.88), 4, shade=0.3)
        if k % 3 == 1:
            for side in (-1, 1): torch_bracket(ctx, vx + side * w * 0.4, vy - h * 0.18)
    rect(ctx, vx - 50, vy - 80, 100, 160, rgb("6a4a30"), 4)
    for cx_, cy_ in ((-1, -1), (1, -1), (-1, 1), (1, 1)): ln(ctx, [(vx, vy), (vx + cx_ * BW * 0.7, vy + cy_ * BH * 0.65)], 5)

def bg_court(ctx):
    rect(ctx, -20, -20, BW + 40, 1000, rgb("a87b50"), 5, 0.3)
    for k in range(13): ln(ctx, [(k * 190, -20), (k * 190, 980)], 8, rgb("6a4429"))
    for wx in (300, 1060, 1820): arch_window(ctx, wx, 120, 200, 420)
    shape(ctx, [(-20, 980), (BW + 20, 980), (BW + 20, BH + 20), (-20, BH + 20)], rgb("9a6b43"), 5, shade=0.25)
    for k in range(6): ln(ctx, [(-20, 1010 + k * 50), (BW + 20, 1010 + k * 50)], 3, rgb("6a4429"))
    rect(ctx, 560, 720, 1200, 260, rgb("6a4429"), 6, 0.25); rect(ctx, 540, 700, 1240, 40, rgb("8b5e3b"), 5)
    banner(ctx, 1095, 160, rgb("b8322a"))

def bg_hall(ctx):
    stone_wall(ctx, -20, -20, BW + 20, 960, rgb("a29a8a"), seed=17)
    for x, c in ((300, rgb("b8322a")), (900, rgb("2f4360")), (1500, rgb("b8322a")), (2000, rgb("2f4360"))): banner(ctx, x, 120, c)
    shape(ctx, [(-20, 960), (BW + 20, 960), (BW + 20, BH + 20), (-20, BH + 20)], rgb("9a6b43"), 5, shade=0.25)
    for x in (600, 1700): torch_bracket(ctx, x, 380)
    table(ctx, BW / 2, 980, 1800)
    for k in range(5):
        x = 500 + k * 330
        shape(ctx, [(x - 18, 980), (x - 22, 930), (x + 22, 930), (x + 18, 980)], rgb("b66a3c"), 4)
        ellipse(ctx, x + 120, 968, 40, 16, rgb("c98a45"), 3)

def bg_kitchen(ctx):
    stone_wall(ctx, -20, -20, BW + 20, 960, rgb("8e8577"), seed=18, dark=0.1)
    shape(ctx, [(1300, 960), (1300, 480), (1600, 330), (1900, 480), (1900, 960)], rgb("1d1f23"), 6, step=40)
    g = cairo.RadialGradient(1600, 860, 0, 1600, 860, 520); g.add_color_stop_rgba(0, 1, 0.6, 0.2, 0.55); g.add_color_stop_rgba(1, 1, 0.6, 0.2, 0)
    ctx.set_source(g); ctx.arc(1600, 860, 520, 0, 6.3); ctx.fill()
    shape(ctx, [(-20, 960), (BW + 20, 960), (BW + 20, BH + 20), (-20, BH + 20)], rgb("7a5a3e"), 5, shade=0.25)
    for k in range(5): ellipse(ctx, 300 + k * 160, 300, 50, 50, rgb("8a8580"), 4)
    table(ctx, 700, 960, 700)

def bg_tower_night(ctx):
    sky(ctx, rgb("1f2c46"), rgb("3c5178")); moon_stars(ctx)
    river(ctx, 1020, rgb("2b3e5a"), night=True)
    keep(ctx, BW / 2, 1030, 1.15, rgb("a9b0c2"), night=True)
    for x in (BW / 2 - 330, BW / 2 + 330): torch_bracket(ctx, x, 520)

def bg_river_night(ctx):
    sky(ctx, rgb("1f2c46"), rgb("3c5178")); moon_stars(ctx)
    keep(ctx, 500, 760, 0.7, rgb("7d8496"), night=True)
    rect(ctx, -20, 700, 1100, 80, rgb("7d8496"), 5)
    river(ctx, 780, rgb("2b3e5a"), night=True)

def bg_tower_day(ctx):
    sky(ctx)
    for (x, y, s) in ((300, 150, 1.0), (1900, 120, 1.2)): cloud(ctx, x, y, s)
    river(ctx, 980)
    rect(ctx, 240, 880, 1840, 110, rgb("c9c3b4"), 6)
    keep(ctx, BW / 2, 900, 1.15)

def bg_castle_hill(ctx):
    sky(ctx)
    for (x, y, s) in ((300, 160, 1.0), (1800, 120, 1.3)): cloud(ctx, x, y, s)
    grass(ctx, 1000)
    shape(ctx, [(700, 1010), (900, 760), (1160, 690), (1420, 760), (1620, 1010)], rgb("8fae66"), 5, shade=0.2, step=60)
    keep(ctx, 1160, 720, 0.6)
    r = random.Random(13)
    for k, x in enumerate((60, 330, 1700, 1980)): timber_house(ctx, x, 1150, 220, 300, rgb("efe3c8"), rgb("a8443a"), r)

def bg_church(ctx):
    sky(ctx, rgb("f2d6a8"), rgb("fbeed6")); cloud(ctx, 400, 160, 1.0, rgb("fff8ec"))
    grass(ctx, 980)
    rect(ctx, 760, 380, 800, 620, rgb("b9b4a8"), 6)
    shape(ctx, [(720, 390), (1160, 140), (1600, 390)], rgb("6d5a4a"), 6)
    ln(ctx, [(1160, 140), (1160, 20)], 10); ln(ctx, [(1120, 60), (1200, 60)], 10)
    shape(ctx, [(1060, 1000), (1060, 760), (1160, 680), (1260, 760), (1260, 1000)], rgb("7a5232"), 5, step=30)
    for x in (860, 1380): arch_window(ctx, x, 520, 90, 200, rgb("3e4d5c"))
    for k in range(6): rect(ctx, 200 + k * 90 + (1300 if k > 2 else 0), 1040, 50, 80, rgb("9c988e"), 4)
    tree(ctx, 2050, 1000, 1.2)

def bg_village(ctx):
    sky(ctx)
    for (x, y, s) in ((300, 140, 1.0), (1500, 110, 1.2)): cloud(ctx, x, y, s)
    grass(ctx, 900)
    for x in (80, 760, 1500): cottage(ctx, x, 900, 420, 280)
    tree(ctx, 1300, 920, 1.0); tree(ctx, 2200, 900, 1.1)
    ellipse(ctx, 1160, 1080, 90, 30, rgb("9c988e"), 5); rect(ctx, 1070, 1000, 180, 80, rgb("9c988e"), 5)

def bg_gallows(ctx):
    sky(ctx, rgb("9aa6b0"), rgb("dcdcd6"))
    for (x, y, s) in ((400, 180, 1.2), (1300, 130, 1.5), (2000, 200, 1.0)): cloud(ctx, x, y, s, rgb("e6e6e0"))
    shape(ctx, [(-20, 1000), (BW * 0.4, 820), (BW * 0.7, 860), (BW + 20, 960), (BW + 20, BH + 20), (-20, BH + 20)], rgb("7d9a5a"), 5, shade=0.25, step=100)
    ln(ctx, [(1100, 860), (1100, 320)], 30, rgb("6a4a30")); ln(ctx, [(1080, 340), (1500, 340)], 30, rgb("6a4a30")); ln(ctx, [(1100, 460), (1220, 340)], 18, rgb("6a4a30"))
    ln(ctx, [(1440, 350), (1440, 560)], 8, rgb("c9a46b")); ellipse(ctx, 1440, 600, 40, 44, (0, 0, 0), 0, 0) if False else None
    ctx.new_path(); ctx.arc(1440, 600, 40, 0, 6.3); ctx.set_source_rgb(*rgb("c9a46b")); ctx.set_line_width(8); ctx.stroke()

def bg_room_rich(ctx):
    stone_wall(ctx, -20, -20, BW + 20, 960, rgb("a29a8a"), seed=19)
    rect(ctx, 820, 120, 640, 460, rgb("7a2f6a"), 5, 0.2)
    for k in range(5): ln(ctx, [(860 + k * 140, 140), (860 + k * 140, 560)], 4, rgb("e2b23c"))
    shape(ctx, [(-20, 960), (BW + 20, 960), (BW + 20, BH + 20), (-20, BH + 20)], rgb("9a6b43"), 5, shade=0.25)
    rect(ctx, 80, 640, 700, 340, rgb("6a4429"), 6); rect(ctx, 110, 600, 640, 140, rgb("b8322a"), 5); ellipse(ctx, 220, 620, 70, 34, rgb("f6f2ea"), 4)
    for x in (80, 760): ln(ctx, [(x, 980), (x, 300)], 16, rgb("6a4429"))
    ln(ctx, [(60, 300), (800, 300)], 16, rgb("6a4429"))
    table(ctx, 1800, 860, 600)
    rect(ctx, 1640, 800, 24, 60, rgb("efe3c8"), 3)

def bg_desk(ctx):
    stone_wall(ctx, -20, -20, BW + 20, 960, rgb("a29a8a"), seed=20)
    shape(ctx, [(-20, 960), (BW + 20, 960), (BW + 20, BH + 20), (-20, BH + 20)], rgb("9a6b43"), 5, shade=0.25)
    table(ctx, 1200, 900, 1300)
    arch_window(ctx, 1800, 220, 200, 360, rgb("cfe3ee"))
    for k in range(4): rect(ctx, 200 + k * 60, 420, 50, 200, [rgb("7a2f6a"), rgb("2f4360"), rgb("6a4429"), rgb("b8322a")][k], 4)

def bg_sunset_castle(ctx):
    sky(ctx, rgb("f2a86a"), rgb("fbe0b4"))
    g = cairo.RadialGradient(1700, 650, 0, 1700, 650, 600); g.add_color_stop_rgba(0, 1, 0.95, 0.7, 0.8); g.add_color_stop_rgba(1, 1, 0.9, 0.7, 0)
    ctx.set_source(g); ctx.arc(1700, 650, 600, 0, 6.3); ctx.fill()
    for (x, y, s) in ((400, 160, 1.0), (1300, 120, 1.2)): cloud(ctx, x, y, s, rgb("fde7cf"))
    grass(ctx, 960, rgb("8fae66"))
    keep(ctx, BW / 2, 980, 0.95)
    for k, (x, c) in enumerate(((BW / 2 - 300, rgb("b8322a")), (BW / 2, rgb("4a6a8c")), (BW / 2 + 300, rgb("e2b23c")))):
        ln(ctx, [(x, 420), (x, 250)], 8); shape(ctx, [(x, 260), (x + 120, 275), (x + 120, 330), (x, 320)], c, 4)

def bg_pit(ctx):
    ctx.set_source_rgb(*rgb("8a8780")); ctx.rectangle(0, 0, BW, BH); ctx.fill()
    for k in range(14, 0, -1):
        g = 0.12 + k * 0.035
        ellipse(ctx, BW / 2, BH / 2, k * 48, k * 48, (g, g, g * 1.05), 3, 0.1, 24)
    for k in range(-3, 4): ln(ctx, [(BW / 2 + k * 90, BH / 2 - 420), (BW / 2 + k * 90, BH / 2 + 420)], 10, rgb("3b3b40"))

def bg_town_gate(ctx):
    sky(ctx)
    for (x, y, s) in ((400, 150, 1.0), (1800, 120, 1.2)): cloud(ctx, x, y, s)
    r = random.Random(21)
    for x in (-60, 260, 1720, 2040): timber_house(ctx, x, 900, 300, 600, r.choice([rgb("efe3c8"), rgb("f1dcb0")]), r.choice([rgb("a8443a"), rgb("8a5a3c")]), r)
    rect(ctx, 640, 260, 1040, 640, rgb("9c988e"), 6)
    for k in range(9): rect(ctx, 640 + k * 118, 210, 70, 60, rgb("9c988e"), 4)
    shape(ctx, [(980, 900), (980, 560), (1160, 420), (1340, 560), (1340, 900)], rgb("cfe3ee"), 6, step=40)
    window(ctx, 1110, 300, 100, 90, rgb("23262b"), rgb("5a5850"))
    cobbles(ctx, 900)

def bg_guard_room(ctx):
    stone_wall(ctx, -20, -20, BW + 20, 960, rgb("8a8780"), seed=23)
    shape(ctx, [(-20, 960), (BW + 20, 960), (BW + 20, BH + 20), (-20, BH + 20)], rgb("7a5a3e"), 5, shade=0.25)
    for k in range(4):
        x = 1500 + k * 150; ln(ctx, [(x, 300), (x, 330)], 10, rgb("3b3b40"))
        ctx.new_path(); ctx.arc(x, 360, 26, 0, 6.3); ctx.set_source_rgb(*rgb("3b3b40")); ctx.set_line_width(7); ctx.stroke()
        ln(ctx, [(x, 386), (x, 470)], 7, rgb("3b3b40")); ln(ctx, [(x, 470), (x + 18, 470)], 7, rgb("3b3b40"))
    torch_bracket(ctx, 600, 400)
    table(ctx, 1000, 900, 900)
    rect(ctx, 820, 860, 24, 40, rgb("efe3c8"), 3)

BACKGROUNDS = {k: v for k, v in globals().items() if k.startswith("bg_") and callable(v)}

def finish(path_png):
    """painted look: light brush/paper grain + soft focus."""
    im = Image.open(path_png).convert("RGB")
    a = np.asarray(im, np.float32) / 255
    rng = np.random.default_rng(3)
    small = rng.random((BH // 6, BW // 6)).astype(np.float32)
    grain = np.asarray(Image.fromarray((small * 255).astype(np.uint8)).resize((BW, BH), Image.BICUBIC), np.float32) / 255
    fine = rng.random((BH, BW)).astype(np.float32)
    a = a * (0.975 + 0.035 * grain[..., None])
    lum = a.mean(axis=2, keepdims=True); a = lum + (a - lum) * 1.05
    im = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
    im.save(path_png)

if __name__ == "__main__":
    import sys
    os.makedirs("assets/bg_hd", exist_ok=True)
    names = sys.argv[1:] or list(BACKGROUNDS)
    for n in names:
        _b[0] = sum(map(ord, n)) * 100
        surf = cairo.ImageSurface(cairo.FORMAT_RGB24, BW, BH); ctx = cairo.Context(surf)
        ctx.set_source_rgb(1, 1, 1); ctx.paint()
        BACKGROUNDS[n](ctx)
        p = f"assets/bg_hd/{n}.png"; surf.write_to_png(p); finish(p); print("drew", n, flush=True)
