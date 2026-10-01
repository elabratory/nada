"""2D cartoon drawing kit (cairo): simple round-headed characters, flat hand-drawn backgrounds, props, text.
Everything is vector-drawn per frame so characters can bob, blink, walk, talk and react."""
import math, random, cairo

W, H = 1920, 1080
INK = (0.17, 0.14, 0.12)
SKIN = (0.97, 0.95, 0.91)
LW = 5.0

def rgb(h):
    h = h.lstrip("#"); return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))

PAL = dict(brown=rgb("8a5a3c"), red=rgb("a8443a"), rust=rgb("b5562e"), green=rgb("5f7d4a"), blue=rgb("4a6a8c"),
           grey=rgb("7d7f80"), dgrey=rgb("4b4e52"), cream=rgb("efe3c8"), black=rgb("2b2622"), purple=rgb("6b4a7a"),
           scarlet=rgb("b8322a"), tan=rgb("c9a46b"), navy=rgb("2f4360"), mud=rgb("7a5c3e"), straw=rgb("d8b45a"),
           stone=rgb("8e8c86"), stone_d=rgb("6d6b66"), sky=rgb("a9cde3"), wood=rgb("8b5e3b"), wood_d=rgb("6a4429"),
           gold=rgb("e2b23c"), night=rgb("23314a"), white=rgb("f6f2ea"))

def fill_stroke(ctx, fill, lw=LW, stroke=INK):
    ctx.set_source_rgb(*fill); ctx.fill_preserve()
    ctx.set_source_rgb(*stroke); ctx.set_line_width(lw); ctx.stroke()

def rrect(ctx, x, y, w, h, r):
    r = min(r, w / 2, h / 2)
    ctx.new_sub_path()
    ctx.arc(x + w - r, y + r, r, -math.pi / 2, 0); ctx.arc(x + w - r, y + h - r, r, 0, math.pi / 2)
    ctx.arc(x + r, y + h - r, r, math.pi / 2, math.pi); ctx.arc(x + r, y + r, r, math.pi, 3 * math.pi / 2)
    ctx.close_path()

def line(ctx, pts, lw=LW, col=INK):
    ctx.move_to(*pts[0])
    for p in pts[1:]: ctx.line_to(*p)
    ctx.set_source_rgb(*col); ctx.set_line_width(lw); ctx.set_line_cap(cairo.LINE_CAP_ROUND); ctx.set_line_join(cairo.LINE_JOIN_ROUND); ctx.stroke()

def circle(ctx, x, y, r, fill, lw=LW):
    ctx.new_path(); ctx.arc(x, y, r, 0, 2 * math.pi); fill_stroke(ctx, fill, lw)

def wobble(seed, t, amp=1.0, f=1.0):
    return amp * math.sin(t * f * 2 * math.pi + seed * 1.7)

# ------------------------------------------------------------------ text
def text(ctx, s, x, y, size=90, col=INK, font="Anton", align="center", outline=None, angle=0.0):
    if outline and font == "Anton":      # reference-style caption: drop shadow behind the outline
        ctx.save(); ctx.translate(x + size * 0.05, y + size * 0.06); ctx.rotate(angle)
        ctx.select_font_face(font); ctx.set_font_size(size); e = ctx.text_extents(s)
        dx = {"center": -e.width / 2 - e.x_bearing, "left": 0, "right": -e.width}[align]
        ctx.move_to(dx, 0); ctx.text_path(s); ctx.set_source_rgba(0, 0, 0, 0.85); ctx.set_line_width(size * 0.16); ctx.set_line_join(cairo.LINE_JOIN_ROUND); ctx.stroke_preserve(); ctx.fill()
        ctx.restore()
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle)
    ctx.select_font_face(font, cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_NORMAL); ctx.set_font_size(size)
    ext = ctx.text_extents(s)
    dx = {"center": -ext.width / 2 - ext.x_bearing, "left": 0, "right": -ext.width}[align]
    ctx.move_to(dx, 0); ctx.text_path(s)
    if outline:
        ctx.set_source_rgb(*outline); ctx.set_line_width(size * 0.12); ctx.set_line_join(cairo.LINE_JOIN_ROUND); ctx.stroke_preserve()
    ctx.set_source_rgb(*col); ctx.fill()
    ctx.restore()

def arrow(ctx, x0, y0, x1, y1, col=INK, lw=7):
    mx, my = (x0 + x1) / 2 + (y1 - y0) * 0.25, (y0 + y1) / 2 - (x1 - x0) * 0.25
    ctx.move_to(x0, y0); ctx.curve_to(mx, my, mx, my, x1, y1)
    ctx.set_source_rgb(*col); ctx.set_line_width(lw); ctx.set_line_cap(cairo.LINE_CAP_ROUND); ctx.stroke()
    a = math.atan2(y1 - my, x1 - mx)
    for s in (-1, 1):
        line(ctx, [(x1, y1), (x1 - 34 * math.cos(a + s * 0.5), y1 - 34 * math.sin(a + s * 0.5))], lw, col)

# ------------------------------------------------------------------ characters
EXPR = {  # brows (left angle, right angle, height), mouth
    "neutral": ((0, 0, 0), "flat"), "angry": ((0.45, -0.45, 0), "frown"), "scared": ((-0.4, 0.4, 6), "wavy"),
    "shock": ((-0.25, 0.25, 14), "o"), "sad": ((-0.35, 0.35, 4), "frown"), "grin": ((0.25, -0.25, 0), "teeth"),
    "smug": ((0.15, -0.35, 0), "smirk"), "happy": ((0, 0, 6), "smile"), "sick": ((-0.3, 0.3, 2), "wavy"),
    "shout": ((0.45, -0.45, 0), "shout"), "grimace": ((-0.3, 0.3, 4), "grimace"), "determined": ((0.35, -0.35, -2), "flat"),
}

class Char:
    def __init__(self, body="brown", hat=None, hair=None, beard=None, size=1.0, seed=0, skin=SKIN, body_w=1.0, bald=False):
        self.body, self.hat, self.hair, self.beard, self.size, self.seed = body, hat, hair, beard, size, seed
        self.skin, self.body_w, self.bald = skin, body_w, bald

    def draw(self, ctx, x, y, t, expr="neutral", arms=(200, -20), props=(None, None), walk=0.0, face=1,
             look=(0, 0), shiver=0.0, talk=False, sweat=False, tears=False, eyes="dot", tilt=0.0, green=False, size=None):
        s = size or self.size
        bob = wobble(self.seed, t, 3 * s, 1.1) + (abs(math.sin(walk * math.pi)) * -10 * s if walk else 0)
        x += shiver * math.sin(t * 55) * 3 * s
        ctx.save(); ctx.translate(x, y + bob); ctx.rotate(tilt); ctx.scale(s, s)
        bw_top, bw_bot, bh = 92 * self.body_w, 128 * self.body_w, 150
        yb, yt = -26, -26 - bh
        # legs
        for k, side in enumerate((-1, 1)):
            sw = math.sin(walk * math.pi + k * math.pi) * 18 if walk else 0
            line(ctx, [(side * 26, yb - 4), (side * 28 + sw, -4)], 9)
            ctx.new_path(); ctx.save(); ctx.translate(side * 28 + sw + 8 * face, -2); ctx.scale(1.6, 1)
            ctx.arc(0, 0, 9, 0, 2 * math.pi); ctx.restore(); fill_stroke(ctx, PAL["black"], 3)
        # arms behind body if pointing back
        shoulders = [(-bw_top / 2 + 8, yt + 34), (bw_top / 2 - 8, yt + 34)]
        hands = []
        for i, (sx, sy) in enumerate(shoulders):
            ang = math.radians(arms[i] + 5 * math.sin(t * 1.4 + self.seed + i * 2.1))
            L = 82
            hx, hy = sx + L * math.cos(ang), sy + L * math.sin(ang)
            hands.append((sx, sy, hx, hy))
        # body
        ctx.new_path()
        ctx.move_to(-bw_top / 2, yt + 18)
        ctx.curve_to(-bw_top / 2, yt - 4, bw_top / 2, yt - 4, bw_top / 2, yt + 18)
        ctx.curve_to(bw_bot / 2 - 8, yb - 60, bw_bot / 2 + 4, yb - 20, bw_bot / 2, yb)
        ctx.curve_to(bw_bot / 4, yb + 8, -bw_bot / 4, yb + 8, -bw_bot / 2, yb)
        ctx.curve_to(-bw_bot / 2 - 4, yb - 20, -bw_bot / 2 + 8, yb - 60, -bw_bot / 2 + 0, yt + 18)
        ctx.close_path(); fill_stroke(ctx, PAL.get(self.body, self.body) if isinstance(self.body, str) else self.body)
        if self.body in ("brown", "tan", "cream", "rust"):   # rope belt + patches for poor folk
            line(ctx, [(-bw_bot / 2 + 10, yb - 56), (bw_bot / 2 - 10, yb - 56)], 6, PAL["tan"])
        # arms + hands + props
        for i, (sx, sy, hx, hy) in enumerate(hands):
            line(ctx, [(sx, sy), ((sx + hx) / 2, (sy + hy) / 2 + 6), (hx, hy)], 8)
            prop(ctx, props[i], hx, hy, t, self.seed + i)
            circle(ctx, hx, hy, 12, self.skin, 4)
        # head
        R = 64; hy0 = yt - R * 0.72
        hc = self.skin if not green else rgb("cfe0b0")
        circle(ctx, 0, hy0, R, hc)
        if self.hair and not self.bald:
            hc_ = PAL.get(self.hair, self.hair) if isinstance(self.hair, str) else self.hair
            ctx.new_path(); ctx.arc(0, hy0, R, math.pi * 1.12, math.pi * 1.88)
            ctx.curve_to(R * 0.55, hy0 - R * 0.62, R * 0.2, hy0 - R * 0.48, 0, hy0 - R * 0.6)
            ctx.curve_to(-R * 0.25, hy0 - R * 0.45, -R * 0.6, hy0 - R * 0.62, R * math.cos(math.pi * 1.12), hy0 + R * math.sin(math.pi * 1.12))
            ctx.close_path(); fill_stroke(ctx, hc_, 4)
            for k in range(3):  # messy tufts
                a = math.pi * (1.3 + 0.18 * k)
                line(ctx, [(R * math.cos(a), hy0 + R * math.sin(a)), (R * 1.18 * math.cos(a + 0.12), hy0 + R * 1.18 * math.sin(a + 0.12))], 5)
        if self.beard:
            bc_ = PAL.get(self.beard, self.beard) if isinstance(self.beard, str) else self.beard
            ctx.new_path(); ctx.arc(0, hy0, R, math.pi * 0.08, math.pi * 0.92)
            ctx.curve_to(-R * 0.8, hy0 + R * 0.45, -R * 0.55, hy0 + R * 0.62, -R * 0.35, hy0 + R * 0.66)
            ctx.curve_to(-R * 0.2, hy0 + R * 0.56, R * 0.2, hy0 + R * 0.56, R * 0.35, hy0 + R * 0.66)
            ctx.curve_to(R * 0.55, hy0 + R * 0.62, R * 0.8, hy0 + R * 0.45, R * math.cos(math.pi * 0.08), hy0 + R * math.sin(math.pi * 0.08))
            ctx.close_path(); fill_stroke(ctx, bc_, 4)
        hat(ctx, self.hat, 0, hy0, R)
        face_draw(ctx, 0, hy0, R, expr, t, self.seed, look, talk, eyes, beard=bool(self.beard))
        if sweat:
            ctx.new_path(); ctx.move_to(R * 0.95, hy0 - R * 0.4); ctx.curve_to(R * 1.15, hy0 - R * 0.1, R * 0.8, hy0, R * 0.95, hy0 - R * 0.4)
            fill_stroke(ctx, rgb("9fd0f0"), 3)
        if tears:
            for sx in (-1, 1):
                d = (t * 1.5 + sx * 0.3) % 1
                circle(ctx, sx * R * 0.32, hy0 + 8 + d * 40, 6, rgb("9fd0f0"), 2)
        ctx.restore()
        return x, y + bob

def face_draw(ctx, cx, cy, R, expr, t, seed, look, talk, eyes, beard=False):
    (bl, br, bhgt), mouth = EXPR.get(expr, EXPR["neutral"])
    lx, ly = look
    blink = ((t + seed * 0.37) % 3.7) < 0.12
    ex = R * 0.33
    for side, ang in ((-1, bl), (1, br)):
        x = cx + side * ex + lx * 6; y = cy - R * 0.08 + ly * 4
        if eyes == "closed" or blink:
            line(ctx, [(x - 9, y), (x + 9, y)], 5)
        elif eyes == "wide" or expr == "shock":
            circle(ctx, x, y, 13, SKIN, 3.5); circle(ctx, x + lx * 3, y + ly * 3, 5, INK, 1)
        else:
            ctx.new_path(); ctx.arc(x, y, 7.5, 0, 2 * math.pi); ctx.set_source_rgb(*INK); ctx.fill()
        by = y - 24 - bhgt
        dx, dy = 15 * math.cos(ang * side * -1), 15 * math.sin(ang * side * -1) * side
        line(ctx, [(x - 15, by + (ang * 22 * side if side < 0 else -ang * 22)), (x + 15, by - (ang * 22 * side if side < 0 else -ang * 22))], 6)
    my = cy + R * (0.36 if beard else 0.42)
    open_ = talk and (math.sin(t * 22) > 0)
    if open_ and mouth in ("flat", "frown", "smile", "smirk", "wavy"):
        mouth = "talk"
    mc = INK
    if mouth == "flat": line(ctx, [(cx - 16, my), (cx + 16, my)], 5)
    elif mouth == "smile":
        ctx.new_path(); ctx.arc(cx, my - 12, 20, 0.25 * math.pi, 0.75 * math.pi); ctx.set_source_rgb(*mc); ctx.set_line_width(5); ctx.stroke()
    elif mouth == "frown":
        ctx.new_path(); ctx.arc(cx, my + 16, 18, 1.2 * math.pi, 1.8 * math.pi); ctx.set_source_rgb(*mc); ctx.set_line_width(5); ctx.stroke()
    elif mouth == "smirk": line(ctx, [(cx - 16, my + 2), (cx + 4, my + 2), (cx + 18, my - 8)], 5)
    elif mouth == "wavy": line(ctx, [(cx - 20, my), (cx - 10, my - 5), (cx, my), (cx + 10, my - 5), (cx + 20, my)], 4)
    elif mouth in ("o", "talk"):
        ctx.new_path(); ctx.save(); ctx.translate(cx, my); ctx.scale(1, 1.3 if mouth == "o" else 0.8)
        ctx.arc(0, 0, 11 if mouth == "o" else 12, 0, 2 * math.pi); ctx.restore(); fill_stroke(ctx, rgb("5a2a24"), 4)
    elif mouth in ("teeth", "grimace", "shout"):
        w, h = (34, 16) if mouth != "shout" else (30, 26)
        rrect(ctx, cx - w, my - h / 2, 2 * w, h, 6); fill_stroke(ctx, rgb("f2e6a0") if mouth != "shout" else rgb("5a2a24"), 4)
        if mouth != "shout":
            for k in range(1, 5): line(ctx, [(cx - w + k * w / 2.5, my - h / 2), (cx - w + k * w / 2.5, my + h / 2)], 2.5)
            line(ctx, [(cx - w, my), (cx + w, my)], 2.5)

def hat(ctx, kind, cx, cy, R):
    if not kind: return
    if kind == "hood":
        ctx.new_path(); ctx.arc(cx, cy, R * 1.14, math.pi * 0.85, math.pi * 2.15)
        ctx.curve_to(R * 0.9, cy + R * 0.9, R * 0.6, cy - R * 0.5, cx, cy - R * 0.62)
        ctx.curve_to(-R * 0.6, cy - R * 0.5, -R * 0.9, cy + R * 0.9, cx - R * 1.14 * math.cos(math.pi * 0.15), cy + R * 1.14 * math.sin(math.pi * 0.15))
        ctx.close_path(); fill_stroke(ctx, PAL["dgrey"], 4)
    elif kind in ("helmet", "kettle"):
        ctx.new_path(); ctx.arc(cx, cy - R * 0.25, R * 0.92, math.pi, 2 * math.pi); ctx.close_path(); fill_stroke(ctx, PAL["grey"], 4)
        rrect(ctx, cx - R * 1.35, cy - R * 0.32, R * 2.7, R * 0.24, 8); fill_stroke(ctx, PAL["grey"], 4)
    elif kind == "coif":
        ctx.new_path(); ctx.arc(cx, cy - R * 0.1, R * 1.0, math.pi * 1.0, math.pi * 2.0); ctx.close_path(); fill_stroke(ctx, PAL["black"], 4)
    elif kind == "white_coif":
        ctx.new_path(); ctx.arc(cx, cy - R * 0.1, R * 1.0, math.pi * 1.0, math.pi * 2.0); ctx.close_path(); fill_stroke(ctx, PAL["white"], 4)
    elif kind == "scarf":
        ctx.new_path(); ctx.arc(cx, cy, R * 1.12, math.pi * 0.8, math.pi * 2.2)
        ctx.line_to(cx + R * 0.7, cy + R * 0.2); ctx.curve_to(R * 0.5, cy - R * 0.75, -R * 0.5, cy - R * 0.75, -R * 0.7, cy + R * 0.2)
        ctx.close_path(); fill_stroke(ctx, rgb("7a8a6a"), 4)
    elif kind == "veil":
        ctx.new_path(); ctx.arc(cx, cy, R * 1.14, math.pi * 0.7, math.pi * 2.3)
        ctx.line_to(cx + R * 0.72, cy + R * 0.3); ctx.curve_to(R * 0.5, cy - R * 0.8, -R * 0.5, cy - R * 0.8, -R * 0.72, cy + R * 0.3)
        ctx.close_path(); fill_stroke(ctx, PAL["white"], 4)
    elif kind == "mitre":
        ctx.new_path(); ctx.move_to(cx - R * 0.7, cy - R * 0.6); ctx.line_to(cx, cy - R * 1.9); ctx.line_to(cx + R * 0.7, cy - R * 0.6); ctx.close_path()
        fill_stroke(ctx, PAL["white"], 4); line(ctx, [(cx, cy - R * 1.8), (cx, cy - R * 0.65)], 5, PAL["gold"])
    elif kind == "cap":
        ctx.new_path(); ctx.arc(cx, cy - R * 0.45, R * 0.8, math.pi, 2 * math.pi); ctx.close_path(); fill_stroke(ctx, PAL["red"], 4)
    elif kind == "executioner":
        ctx.new_path(); ctx.arc(cx, cy, R * 1.02, 0, 2 * math.pi); fill_stroke(ctx, PAL["black"], 4)
        for sx in (-1, 1):
            ctx.new_path(); ctx.save(); ctx.translate(cx + sx * R * 0.33, cy - R * 0.08); ctx.scale(1.4, 1); ctx.arc(0, 0, 11, 0, 2 * math.pi); ctx.restore()
            ctx.set_source_rgb(*SKIN); ctx.fill()

def prop(ctx, kind, x, y, t, seed=0):
    if not kind: return
    if kind == "staff": line(ctx, [(x, y - 110), (x, y + 120)], 9, PAL["wood"])
    elif kind == "keys":
        sw = math.sin(t * 6 + seed) * 8
        ctx.new_path(); ctx.arc(x, y + 26, 16, 0, 2 * math.pi); ctx.set_source_rgb(*INK); ctx.set_line_width(5); ctx.stroke()
        for k in (-1, 0, 1):
            line(ctx, [(x + k * 10, y + 40), (x + k * 14 + sw, y + 82)], 5)
            line(ctx, [(x + k * 14 + sw, y + 82), (x + k * 14 + sw + 10, y + 82)], 5)
    elif kind == "bread":
        ctx.new_path(); ctx.save(); ctx.translate(x, y - 8); ctx.scale(1.8, 1); ctx.arc(0, 0, 18, 0, 2 * math.pi); ctx.restore(); fill_stroke(ctx, rgb("c98a45"), 4)
        for k in (-1, 0, 1): line(ctx, [(x + k * 12 - 4, y - 18), (x + k * 12 + 4, y + 0)], 3)
    elif kind == "coin":
        circle(ctx, x, y - 16, 14, PAL["gold"], 3.5)
    elif kind == "coins":
        for k in range(4): circle(ctx, x - 18 + k * 12, y - 14 - (k % 2) * 6, 11, rgb("c8ccd0"), 3)
    elif kind == "purse":
        ctx.new_path(); ctx.move_to(x - 22, y + 4); ctx.curve_to(x - 34, y + 60, x + 34, y + 60, x + 22, y + 4); ctx.close_path()
        fill_stroke(ctx, PAL["wood"], 4); line(ctx, [(x - 22, y + 6), (x + 22, y + 6)], 4, PAL["tan"])
    elif kind == "knife":
        line(ctx, [(x, y), (x + 40, y - 30)], 6, rgb("c8ccd0")); line(ctx, [(x - 6, y + 5), (x + 6, y - 5)], 8, PAL["wood"])
    elif kind == "scroll":
        rrect(ctx, x - 20, y - 50, 40, 90, 8); fill_stroke(ctx, PAL["cream"], 4)
        for k in range(4): line(ctx, [(x - 10, y - 32 + k * 18), (x + 10, y - 32 + k * 18)], 2.5)
    elif kind == "torch":
        line(ctx, [(x, y + 30), (x, y - 50)], 9, PAL["wood"]); flame(ctx, x, y - 58, 1.0, t, seed)
    elif kind == "cup":
        rrect(ctx, x - 16, y - 34, 32, 34, 6); fill_stroke(ctx, PAL["wood"], 4)
    elif kind == "candle":
        rrect(ctx, x - 9, y - 40, 18, 40, 3); fill_stroke(ctx, PAL["cream"], 3); flame(ctx, x, y - 46, 0.5, t, seed)
    elif kind == "chain":
        for k in range(6):
            ctx.new_path(); ctx.save(); ctx.translate(x + 4 * math.sin(t * 3 + k), y + 18 + k * 18); ctx.scale(0.7 if k % 2 else 1, 1)
            ctx.arc(0, 0, 9, 0, 2 * math.pi); ctx.restore(); ctx.set_source_rgb(*INK); ctx.set_line_width(4); ctx.stroke()
    elif kind == "quill": line(ctx, [(x, y), (x + 30, y - 50)], 5); line(ctx, [(x + 16, y - 26), (x + 36, y - 60)], 9, PAL["white"])
    elif kind == "rope": line(ctx, [(x, y), (x + 6, y + 120)], 7, PAL["tan"])
    elif kind == "jug":
        ctx.new_path(); ctx.move_to(x - 16, y - 50); ctx.curve_to(x - 40, y, x - 20, y + 20, x, y + 20); ctx.curve_to(x + 20, y + 20, x + 40, y, x + 16, y - 50); ctx.close_path()
        fill_stroke(ctx, rgb("b66a3c"), 4)
    elif kind == "point":
        pass

def flame(ctx, x, y, s, t, seed=0):
    f = 1 + 0.12 * math.sin(t * 17 + seed) + 0.08 * math.sin(t * 29 + seed * 2)
    for col, k in ((rgb("e8702a"), 1.0), (rgb("f6c445"), 0.6)):
        ctx.new_path(); ctx.move_to(x, y - 46 * s * f * k)
        ctx.curve_to(x + 22 * s * k, y - 14 * s * k, x + 18 * s * k, y + 10 * s * k, x, y + 10 * s * k)
        ctx.curve_to(x - 18 * s * k, y + 10 * s * k, x - 22 * s * k, y - 14 * s * k, x, y - 46 * s * f * k)
        ctx.close_path(); ctx.set_source_rgb(*col); ctx.fill_preserve()
        if k == 1.0: ctx.set_source_rgb(*INK); ctx.set_line_width(3); ctx.stroke()
        else: ctx.new_path()

def glow(ctx, x, y, r, col=(1, 0.8, 0.4), a=0.35):
    g = cairo.RadialGradient(x, y, 0, x, y, r)
    g.add_color_stop_rgba(0, *col, a); g.add_color_stop_rgba(1, *col, 0)
    ctx.set_source(g); ctx.arc(x, y, r, 0, 2 * math.pi); ctx.fill()

# ------------------------------------------------------------------ backgrounds
def sky(ctx, top=PAL["sky"], bottom=rgb("dbeaf2")):
    if SKIP['on']: return
    g = cairo.LinearGradient(0, 0, 0, H); g.add_color_stop_rgb(0, *top); g.add_color_stop_rgb(1, *bottom)
    ctx.set_source(g); ctx.rectangle(-200, -200, W + 400, H + 400); ctx.fill()

def clouds(ctx, t, seed=1):
    if SKIP['on']: return
    r = random.Random(seed)
    for k in range(5):
        x = (r.random() * W * 1.3 + t * 12 * (0.5 + r.random())) % (W + 400) - 200; y = 80 + r.random() * 220
        ctx.new_path()
        for dx, dy, rr in ((0, 0, 50), (55, -20, 60), (115, 0, 48), (60, 15, 50)):
            ctx.new_sub_path(); ctx.arc(x + dx, y + dy, rr, 0, 2 * math.pi)
        ctx.set_source_rgb(*PAL["white"]); ctx.fill()

def ground(ctx, y, col=PAL["mud"], puddles=True, seed=2):
    if SKIP['on']: return
    ctx.rectangle(-200, y, W + 400, H - y + 200); fill_stroke(ctx, col, 5)
    r = random.Random(seed)
    if puddles:
        for k in range(2):
            px, py = r.random() * W, y + 40 + r.random() * (H - y - 80)
            ctx.new_path(); ctx.save(); ctx.translate(px, py); ctx.scale(3.2, 1); ctx.arc(0, 0, 28 + r.random() * 20, 0, 2 * math.pi); ctx.restore()
            fill_stroke(ctx, rgb("8fa4ad"), 3)
    for k in range(30):
        px, py = r.random() * W, y + 20 + r.random() * (H - y)
        line(ctx, [(px, py), (px + 22, py + 2)], 3, rgb("5f4630"))

def house(ctx, x, y_base, w, h, roof=PAL["red"], wall=PAL["cream"], seed=0, t=0.0, sign=False):
    if SKIP['on']: return
    r = random.Random(seed)
    h1 = h * 0.45                     # ground floor
    over = 18                         # jettied upper storey overhang
    beam = PAL["wood_d"]
    # ground floor
    ctx.rectangle(x, y_base - h1, w, h1); fill_stroke(ctx, wall)
    door_w = w * 0.26
    dx = x + w * (0.12 if r.random() < 0.5 else 0.62)
    ctx.new_path(); ctx.move_to(dx, y_base); ctx.line_to(dx, y_base - h1 * 0.62); ctx.arc(dx + door_w / 2, y_base - h1 * 0.62, door_w / 2, math.pi, 0)
    ctx.line_to(dx + door_w, y_base); ctx.close_path(); fill_stroke(ctx, PAL["wood"])
    line(ctx, [(dx + door_w / 2, y_base - h1 * 0.62 - door_w / 2 + 6), (dx + door_w / 2, y_base)], 3, beam)
    wx = x + w * (0.62 if dx < x + w * 0.4 else 0.14)
    rrect(ctx, wx, y_base - h1 * 0.75, w * 0.22, h1 * 0.36, 4); fill_stroke(ctx, rgb("3d4a57"))
    line(ctx, [(wx + w * 0.11, y_base - h1 * 0.75), (wx + w * 0.11, y_base - h1 * 0.39)], 3, beam)
    # upper storey (wider) with timber framing
    uy0, uy1 = y_base - h, y_base - h1
    ctx.rectangle(x - over, uy0, w + 2 * over, uy1 - uy0); fill_stroke(ctx, wall)
    line(ctx, [(x - over, uy1), (x + w + over, uy1)], 9, beam)
    n = 3
    for k in range(n + 1):
        px = x - over + k * (w + 2 * over) / n
        line(ctx, [(px, uy0), (px, uy1)], 6, beam)
    for k in range(n):
        ax = x - over + k * (w + 2 * over) / n; bx = ax + (w + 2 * over) / n
        if (k + int(seed * 10)) % 2: line(ctx, [(ax, uy1), (bx, uy0 + (uy1 - uy0) * 0.45)], 5, beam)
        else:
            wxx = ax + (bx - ax) * 0.22
            rrect(ctx, wxx, uy0 + (uy1 - uy0) * 0.25, (bx - ax) * 0.56, (uy1 - uy0) * 0.42, 4); fill_stroke(ctx, rgb("3d4a57"))
            # shutters gently swinging
            sw = 0.5 + 0.08 * math.sin(t * 1.3 + seed * 7)
            for side in (0, 1):
                sx0 = wxx if side == 0 else wxx + (bx - ax) * 0.56
                ctx.new_path(); ctx.move_to(sx0, uy0 + (uy1 - uy0) * 0.25)
                ctx.line_to(sx0 + (-1 if side == 0 else 1) * (bx - ax) * 0.2 * sw, uy0 + (uy1 - uy0) * 0.27)
                ctx.line_to(sx0 + (-1 if side == 0 else 1) * (bx - ax) * 0.2 * sw, uy0 + (uy1 - uy0) * 0.65)
                ctx.line_to(sx0, uy0 + (uy1 - uy0) * 0.67); ctx.close_path(); fill_stroke(ctx, PAL["green"] if seed > 0.5 else PAL["wood"], 3)
    # steep gable roof with tile rows
    rx0, rx1, ry = x - over - 22, x + w + over + 22, uy0 - (w + 2 * over) * 0.62
    ctx.new_path(); ctx.move_to(rx0, uy0); ctx.line_to((rx0 + rx1) / 2, ry); ctx.line_to(rx1, uy0); ctx.close_path(); fill_stroke(ctx, roof)
    for k in range(1, 5):
        fy = uy0 - (uy0 - ry) * k / 5; half = (rx1 - rx0) / 2 * (1 - k / 5)
        line(ctx, [((rx0 + rx1) / 2 - half + 6, fy), ((rx0 + rx1) / 2 + half - 6, fy)], 3, tuple(c * 0.75 for c in roof))
    # swinging shop sign
    if sign:
        bx = x + w + over; by = uy1 + 6
        line(ctx, [(bx, by), (bx + 70, by)], 6, PAL["dgrey"])
        a = 0.12 * math.sin(t * 2.2 + seed * 5)
        ctx.save(); ctx.translate(bx + 55, by); ctx.rotate(a)
        line(ctx, [(-18, 0), (-18, 24)], 3); line(ctx, [(18, 0), (18, 24)], 3)
        rrect(ctx, -34, 24, 68, 52, 8); fill_stroke(ctx, PAL["gold"] if seed > 0.4 else PAL["cream"], 4)
        circle(ctx, 0, 50, 12, PAL["red"] if seed > 0.6 else PAL["wood"], 3)
        ctx.restore()

def birds(ctx, t, n=4, seed=1):
    r = random.Random(seed)
    for k in range(n):
        sp = 60 + r.random() * 60
        x = (r.random() * W + t * sp) % (W + 300) - 150; y = 120 + r.random() * 200 + 12 * math.sin(t * 2 + k)
        f = 14 * math.sin(t * 9 + k * 2)
        line(ctx, [(x - 22, y - f), (x, y), (x + 22, y - f)], 4)

def street(ctx, t, ground_y=760, seed=3, ext=0):
    if SKIP['on']: return
    if bg_image(ctx, 'bg_street', t, zoom=1.04 + (0.35 if ext else 0), pan=-1 if ext else 0):
        birds(ctx, t, 3, seed)
        return
    sky(ctx)
    if ext: ctx.save(); ctx.translate(W, 0); sky(ctx); ctx.restore()
    clouds(ctx, t, seed); birds(ctx, t, 4, seed)
    # far skyline: church tower + roofs, pale
    ctx.save(); ctx.push_group()
    r0 = random.Random(seed + 50); x = -100
    while x < W + 100 + ext:
        w = 120 + r0.random() * 80; h = 160 + r0.random() * 140
        ctx.rectangle(x, ground_y - 120 - h, w, h + 120); ctx.set_source_rgb(*rgb("c4d3dc")); ctx.fill()
        ctx.new_path(); ctx.move_to(x - 8, ground_y - 120 - h); ctx.line_to(x + w / 2, ground_y - 120 - h - w * 0.5); ctx.line_to(x + w + 8, ground_y - 120 - h); ctx.close_path(); ctx.fill()
        x += w + 6
    ctx.rectangle(1300, ground_y - 700, 120, 600); ctx.fill()
    ctx.new_path(); ctx.move_to(1290, ground_y - 700); ctx.line_to(1360, ground_y - 900); ctx.line_to(1430, ground_y - 700); ctx.close_path(); ctx.fill()
    ctx.pop_group_to_source(); ctx.paint(); ctx.restore()
    r = random.Random(seed); x = -60
    roofs = [PAL["red"], PAL["brown"], rgb("6d5a4a"), PAL["rust"], rgb("8a3a2e")]
    walls = [PAL["cream"], rgb("f1dcb0"), rgb("e9d6c0"), rgb("f3e6cf")]
    i = 0
    while x < W + 60 + ext:
        w = 210 + r.random() * 80; h = 330 + r.random() * 170
        house(ctx, x, ground_y, w, h, roof=r.choice(roofs), wall=r.choice(walls), seed=r.random(), t=t, sign=(i % 3 == 1))
        x += w + 44; i += 1
    ground(ctx, ground_y, seed=seed)
    if ext: ctx.save(); ctx.translate(W, 0); ground(ctx, ground_y, seed=seed + 1); ctx.restore()
    # cobbled lane
    rr = random.Random(seed + 9)
    for k in range(60):
        cx, cy = rr.random() * W, ground_y + 30 + rr.random() * (H - ground_y)
        ctx.new_path(); ctx.save(); ctx.translate(cx, cy); ctx.scale(1.6, 1); ctx.arc(0, 0, 12 + rr.random() * 8, 0, 6.3); ctx.restore()
        ctx.set_source_rgba(0.35, 0.27, 0.2, 0.45); ctx.fill()

def stone_wall(ctx, x0, y0, x1, y1, base=PAL["stone"], dark=False, seed=4):
    if SKIP['on']: return
    ctx.rectangle(x0, y0, x1 - x0, y1 - y0); ctx.set_source_rgb(*base); ctx.fill()
    r = random.Random(seed); bh = 70; row = 0; y = y0
    while y < y1:
        off = (row % 2) * 70; x = x0 - off
        while x < x1:
            bw = 130 + r.random() * 40
            shade = 0.88 + r.random() * 0.18
            rrect(ctx, x + 3, y + 3, bw - 6, bh - 6, 8)
            ctx.set_source_rgb(*(min(1, c * shade) for c in base)); ctx.fill_preserve()
            ctx.set_source_rgb(*INK); ctx.set_line_width(3); ctx.stroke()
            x += bw
        y += bh; row += 1

def straw_floor(ctx, y, seed=5):
    if SKIP['on']: return
    ctx.rectangle(-200, y, W + 400, H - y + 200); fill_stroke(ctx, rgb("7d6a4e"), 5)
    r = random.Random(seed)
    for k in range(160):
        px, py = r.random() * (W + 200) - 100, y + 10 + r.random() * (H - y)
        a = r.random() * 0.8 - 0.4
        line(ctx, [(px, py), (px + 34 * math.cos(a), py + 34 * math.sin(a))], 4, PAL["straw"] if r.random() > 0.3 else rgb("b8963f"))

def cell(ctx, t, window=True, torch=True, floor_y=800, dim=0.0, seed=6, bars=False):
    if SKIP['on']:
        if dim: ctx.set_source_rgba(0.04, 0.04, 0.08, dim); ctx.rectangle(-200, -200, W + 400, H + 400); ctx.fill()
        return
    if bg_image(ctx, 'bg_cell', t, zoom=1.04 + (seed % 5) * 0.04, pan=((seed % 3) - 1) * 0.6, dim=dim):
        return
    stone_wall(ctx, -200, -200, W + 200, floor_y, PAL["stone_d"], seed=seed)
    if window:
        wx, wy = 1560, 330
        rrect(ctx, wx, wy, 170, 130, 10); fill_stroke(ctx, rgb("cfe3ee"))
        for k in range(1, 4): line(ctx, [(wx + k * 42, wy), (wx + k * 42, wy + 130)], 8)
        ctx.new_path(); ctx.move_to(wx, wy + 130); ctx.line_to(wx + 170, wy + 130); ctx.line_to(wx + 40, floor_y + 120); ctx.line_to(wx - 260, floor_y + 120); ctx.close_path()
        ctx.set_source_rgba(1, 1, 0.9, 0.13); ctx.fill()
    straw_floor(ctx, floor_y, seed)
    if torch:
        tx, ty = 330, 400
        glow(ctx, tx, ty - 80, 420, a=0.32)
        rrect(ctx, tx - 22, ty - 10, 44, 110, 8); fill_stroke(ctx, PAL["wood"]); flame(ctx, tx, ty - 22, 2.2, t, seed)
    if bars:
        for k in range(12):
            bx = 80 + k * 160
            line(ctx, [(bx, -100), (bx, H + 100)], 16, PAL["dgrey"])
    if dim:
        ctx.set_source_rgba(0.05, 0.05, 0.1, dim); ctx.rectangle(-200, -200, W + 400, H + 400); ctx.fill()

def gatehouse(ctx, cx, base_y, s=1.0, t=0):
    if SKIP['on']: return
    for side in (-1, 1):
        tx = cx + side * 260 * s
        rrect(ctx, tx - 120 * s, base_y - 620 * s, 240 * s, 620 * s, 6); fill_stroke(ctx, PAL["stone"])
        for k in range(4):
            rrect(ctx, tx - 120 * s + k * 62 * s, base_y - 680 * s, 44 * s, 64 * s, 4); fill_stroke(ctx, PAL["stone"])
        rrect(ctx, tx - 18 * s, base_y - 470 * s, 36 * s, 70 * s, 8); fill_stroke(ctx, rgb("2c3036"))
    ctx.rectangle(cx - 160 * s, base_y - 480 * s, 320 * s, 480 * s); fill_stroke(ctx, PAL["stone_d"])
    ctx.new_path(); ctx.move_to(cx - 100 * s, base_y); ctx.line_to(cx - 100 * s, base_y - 220 * s)
    ctx.arc(cx, base_y - 220 * s, 100 * s, math.pi, 0); ctx.line_to(cx + 100 * s, base_y); ctx.close_path(); fill_stroke(ctx, rgb("23262b"))
    for k in range(-2, 3): line(ctx, [(cx + k * 38 * s, base_y - 300 * s), (cx + k * 38 * s, base_y - 90 * s)], 6, PAL["dgrey"])
    for k in range(3): line(ctx, [(cx - 90 * s, base_y - 270 * s + k * 70 * s), (cx + 90 * s, base_y - 270 * s + k * 70 * s)], 6, PAL["dgrey"])

def vignette(ctx, a=0.35):
    g = cairo.RadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95)
    g.add_color_stop_rgba(0, 0, 0, 0, 0); g.add_color_stop_rgba(1, 0, 0, 0, a)
    ctx.set_source(g); ctx.rectangle(-200, -200, W + 400, H + 400); ctx.fill()

def big_x(ctx, x, y, s, p):
    """animated red cross-out, p 0..1"""
    for k, (a, b) in enumerate((((-1, -1), (1, 1)), ((1, -1), (-1, 1)))):
        q = min(1, max(0, p * 2 - k))
        if q <= 0: continue
        x0, y0 = x + a[0] * s, y + a[1] * s
        line(ctx, [(x0, y0), (x0 + (b[0] - a[0]) * s * q, y0 + (b[1] - a[1]) * s * q)], 22, PAL["scarlet"])

# ------------------------------------------------------------------ extra kit for the full film
def bubble(ctx, x, y, s, size=56, tail=(-60, 80)):
    ctx.select_font_face("Itim"); ctx.set_font_size(size)
    lines_ = s.split("\n"); w = max(ctx.text_extents(l).width for l in lines_) + 60; h = len(lines_) * size * 1.15 + 40
    rrect(ctx, x - w / 2, y - h / 2, w, h, 30); fill_stroke(ctx, PAL["white"], 5)
    ctx.new_path(); ctx.move_to(x - 20, y + h / 2 - 3); ctx.line_to(x + tail[0], y + h / 2 + tail[1]); ctx.line_to(x + 25, y + h / 2 - 3)
    ctx.set_source_rgb(*PAL["white"]); ctx.fill_preserve(); ctx.set_source_rgb(*INK); ctx.set_line_width(5); ctx.stroke()
    ctx.rectangle(x - 22, y + h / 2 - 8, 46, 10); ctx.set_source_rgb(*PAL["white"]); ctx.fill()
    for i, l in enumerate(lines_):
        text(ctx, l, x, y - h / 2 + 20 + size * 0.95 + i * size * 1.15, size, INK, font="Itim")

def night_sky(ctx, t):
    if SKIP['on']: return
    sky(ctx, PAL["night"], rgb("41557a"))
    r = random.Random(3)
    for k in range(70):
        x, y = r.random() * W, r.random() * H * 0.6
        a = 0.5 + 0.5 * math.sin(t * 2 + k)
        ctx.new_path(); ctx.arc(x, y, 2.5, 0, 6.3); ctx.set_source_rgba(1, 1, 0.9, a); ctx.fill()
    glow(ctx, 1600, 180, 220, (1, 1, 0.85), 0.25); circle(ctx, 1600, 180, 70, rgb("f3efd2"))

def castle_keep(ctx, cx, base, s=1.0, col=None, night=False, turrets=4):
    if SKIP['on']: return
    col = col or (rgb("c9c3b4") if not night else rgb("6d7488"))
    w, h = 420 * s, 460 * s
    ctx.rectangle(cx - w / 2, base - h, w, h); fill_stroke(ctx, col)
    for k in range(turrets):
        tx = cx - w / 2 + k * (w / (turrets - 1)) if turrets > 1 else cx
        ctx.rectangle(tx - 40 * s, base - h - 90 * s, 80 * s, 90 * s); fill_stroke(ctx, col)
        ctx.new_path(); ctx.move_to(tx - 46 * s, base - h - 90 * s); ctx.line_to(tx, base - h - 150 * s); ctx.line_to(tx + 46 * s, base - h - 90 * s); ctx.close_path(); fill_stroke(ctx, PAL["dgrey"])
    for r_ in range(2):
        for k in range(3):
            rrect(ctx, cx - w / 3 + k * w / 3 - 16 * s, base - h + 90 * s + r_ * 150 * s, 32 * s, 60 * s, 14 * s)
            fill_stroke(ctx, rgb("f6c445") if night else rgb("3d4a57"), 3)

def horse(ctx, x, y, t, s=1.0, col=None, walk=0.0):
    col = col or PAL["wood"]
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s)
    for k, lx in enumerate((-90, -55, 60, 95)):
        sw = math.sin(walk * math.pi + k * 1.6) * 16 if walk else 0
        line(ctx, [(lx, -110), (lx + sw, -5)], 14, col); line(ctx, [(lx + sw - 6, -4), (lx + sw + 10, -4)], 12, INK)
    ctx.new_path(); ctx.save(); ctx.translate(0, -150); ctx.scale(1.9, 1); ctx.arc(0, 0, 70, 0, 6.3); ctx.restore(); fill_stroke(ctx, col)
    ctx.new_path(); ctx.move_to(100, -170); ctx.line_to(150, -270); ctx.line_to(205, -250); ctx.line_to(150, -150); ctx.close_path(); fill_stroke(ctx, col)
    ctx.new_path(); ctx.save(); ctx.translate(195, -255); ctx.scale(1.4, 1); ctx.arc(0, 0, 32, 0, 6.3); ctx.restore(); fill_stroke(ctx, col)
    circle(ctx, 192, -265, 5, INK, 1); line(ctx, [(-130, -170), (-170, -100 + 6 * math.sin(t * 4))], 10, INK)
    ctx.restore()

def rat(ctx, x, y, s, t):
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s)
    line(ctx, [(-60, 0), (-110, 10 + 8 * math.sin(t * 5)), (-150, -10)], 5, rgb("c99a8a"))
    ctx.new_path(); ctx.save(); ctx.scale(1.6, 1); ctx.arc(0, -25, 32, 0, 6.3); ctx.restore(); fill_stroke(ctx, rgb("8a8580"))
    ctx.new_path(); ctx.move_to(40, -45); ctx.line_to(95, -18 + 3 * math.sin(t * 12)); ctx.line_to(40, -8); ctx.close_path(); fill_stroke(ctx, rgb("8a8580"))
    circle(ctx, 35, -55, 14, rgb("c99a8a"), 3); circle(ctx, 65, -32, 5, INK, 1); circle(ctx, 95, -18 + 3 * math.sin(t * 12), 5, rgb("c99a8a"), 2)
    for k in (-1, 1): line(ctx, [(92, -18), (120, -18 + k * 12)], 2)
    ctx.restore()

def bucket(ctx, x, y, s=1.0, water=rgb("7a6040")):
    ctx.new_path(); ctx.move_to(x - 70 * s, y - 120 * s); ctx.line_to(x + 70 * s, y - 120 * s); ctx.line_to(x + 55 * s, y); ctx.line_to(x - 55 * s, y); ctx.close_path(); fill_stroke(ctx, PAL["wood"])
    for k in (-1, 1): line(ctx, [(x - 66 * s, y - 120 * s + (40 if k > 0 else 0) * s + 20 * s), (x + 66 * s, y - 120 * s + (40 if k > 0 else 0) * s + 20 * s)], 6, PAL["dgrey"])
    ctx.new_path(); ctx.save(); ctx.translate(x, y - 120 * s); ctx.scale(1, 0.25); ctx.arc(0, 0, 70 * s, 0, 6.3); ctx.restore(); fill_stroke(ctx, water, 4)

def table(ctx, x, y, w, col=None):
    if SKIP['on'] and SKIP.get('no_table'): return
    rrect(ctx, x - w / 2, y, w, 34, 8); fill_stroke(ctx, col or PAL["wood"])
    for lx in (x - w / 2 + 30, x + w / 2 - 30): line(ctx, [(lx, y + 34), (lx, y + 200)], 14, PAL["wood_d"])

def wood_floor(ctx, y):
    if SKIP['on']: return
    ctx.rectangle(-200, y, W + 400, H - y + 200); fill_stroke(ctx, rgb("9a6b43"))
    for k in range(6): line(ctx, [(-200, y + 30 + k * 50), (W + 200, y + 30 + k * 50)], 3, PAL["wood_d"])

def court_bg(ctx, t):
    if SKIP['on']: return
    ctx.rectangle(-200, -200, W + 400, 1000); ctx.set_source_rgb(*rgb("a87b50")); ctx.fill()
    for k in range(-1, 12):
        ctx.rectangle(k * 190, -200, 8, 1000); ctx.set_source_rgb(*PAL["wood_d"]); ctx.fill()
    for wx in (300, 960, 1620):
        ctx.new_path(); ctx.move_to(wx - 80, 520); ctx.line_to(wx - 80, 230); ctx.arc(wx, 230, 80, math.pi, 0); ctx.line_to(wx + 80, 520); ctx.close_path()
        fill_stroke(ctx, rgb("cfe3ee")); line(ctx, [(wx, 160), (wx, 520)], 6); line(ctx, [(wx - 80, 360), (wx + 80, 360)], 6)
    wood_floor(ctx, 800)

def bench(ctx, x, y, w):
    if SKIP['on']: return
    rrect(ctx, x - w / 2, y - 120, w, 120, 10); fill_stroke(ctx, PAL["wood_d"])
    rrect(ctx, x - w / 2 - 10, y - 135, w + 20, 24, 8); fill_stroke(ctx, PAL["wood"])

def scroll_card(ctx, t, p, header, quote, source, quoted=True):
    """A cartoon parchment held up on a dark stone wall, text written on."""
    stone_wall(ctx, -200, -200, W + 200, H + 200, PAL["stone_d"], seed=40)
    ctx.set_source_rgba(0, 0, 0, 0.35); ctx.paint()
    x0, y0, w, h = 260, 120, 1400, 840
    rrect(ctx, x0, y0, w, h, 26); fill_stroke(ctx, rgb("f1e2bd"), 6)
    for yy in (y0, y0 + h):
        rrect(ctx, x0 - 40, yy - 30, w + 80, 60, 30); fill_stroke(ctx, rgb("e2cb95"), 6)
    text(ctx, header, W / 2, y0 + 130, 74, PAL["scarlet"])
    ctx.select_font_face("Itim"); size = 66 if len(quote) < 120 else 56; ctx.set_font_size(size)
    words = (("“" + quote + "”") if quoted else quote).split(); lines_, cur = [], ""
    for wd in words:
        tt = (cur + " " + wd).strip()
        if ctx.text_extents(tt).width > w - 220 and cur: lines_.append(cur); cur = wd
        else: cur = tt
    lines_.append(cur)
    yy = y0 + 250 + max(0, (4 - len(lines_))) * size * 0.5
    shown = int(len(lines_) * min(1, p * 2.2 + 0.25) + 0.999)
    for i, l in enumerate(lines_[:shown]):
        text(ctx, l, W / 2, yy + i * size * 1.25, size, INK, font="Itim")
    ctx.select_font_face("Itim"); ctx.set_font_size(36)
    srcl, cur = [], ""
    for wd in ("— " + source).split():
        tt = (cur + " " + wd).strip()
        if ctx.text_extents(tt).width > w - 300 and cur: srcl.append(cur); cur = wd
        else: cur = tt
    srcl.append(cur)
    for i, l in enumerate(srcl):
        text(ctx, l, W / 2, y0 + h - 70 - (len(srcl) - 1 - i) * 44, 36, rgb("7a5a3a"), font="Itim")

# ------------------------------------------------------------------ illustrated backgrounds (AI-drawn, no people)
_BG = {}
def bg_image(ctx, name, t=0.0, zoom=1.04, pan=0.0, dim=0.0):
    """Paint assets/bg/<name>.png to cover the frame. pan in [-1, 1] slides horizontally. Returns False if missing."""
    import os
    path = f"assets/bg/{name}.png"
    if name not in _BG:
        if not os.path.exists(path):
            _BG[name] = None
        else:
            from PIL import Image
            from PIL import ImageFilter, ImageEnhance
            im = Image.open(path).convert("RGB").resize((W + 400, int((W + 400) * 9 / 16)), Image.LANCZOS)
            im = ImageEnhance.Color(im.filter(ImageFilter.GaussianBlur(1.6))).enhance(0.9)
            tmp = f"build/_bg_{name}.png"; im.save(tmp)
            _BG[name] = cairo.ImageSurface.create_from_png(tmp)
    surf = _BG[name]
    if surf is None: return False
    sw, sh = surf.get_width(), surf.get_height()
    sc = max(W / sw, H / sh) * zoom
    ox = (W - sw * sc) / 2 + pan * (sw * sc - W) / 2
    oy = (H - sh * sc) / 2
    ctx.save(); ctx.translate(ox, oy); ctx.scale(sc, sc); ctx.set_source_surface(surf, 0, 0); ctx.paint(); ctx.restore()
    if dim:
        ctx.set_source_rgba(0.04, 0.04, 0.08, dim); ctx.rectangle(-200, -200, W + 400, H + 400); ctx.fill()
    return True


# when an illustrated background is painted behind a scene, coded scenery helpers become no-ops
SKIP = {"on": False}
def SK(): return SKIP["on"]
