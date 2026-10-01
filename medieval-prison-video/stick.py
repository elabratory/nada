"""Hand-drawn stick-figure characters in the style of 'Hypothetically'-type explainer animation:
big white oval head, dark hair blob, tall coloured torso, long thin stick legs and two-segment stick arms,
wobbly outlines that 'boil' a little every few frames like real hand animation."""
import math, random, cairo
import cartoon as C
from cartoon import PAL, rgb, prop

INK = (0.13, 0.09, 0.07)
FACE = (0.98, 0.97, 0.95)

def _jit(seed, i, amp):
    r = random.Random(seed * 7919 + i * 104729)
    return (r.random() - 0.5) * 2 * amp, (r.random() - 0.5) * 2 * amp

def wpath(ctx, pts, boil, amp=1.6, closed=False):
    """Smooth wobbly path through pts (Catmull-Rom), jittered per boil frame."""
    P = [(x + _jit(boil, i, amp)[0], y + _jit(boil, i, amp)[1]) for i, (x, y) in enumerate(pts)]
    n = len(P)
    if closed: P = [P[-1]] + P + [P[0], P[1]]
    else: P = [P[0]] + P + [P[-1]]
    ctx.move_to(*P[1])
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        ctx.curve_to(*c1, *c2, *p2)
    if closed: ctx.close_path()

def stroke(ctx, w, col=INK):
    ctx.set_source_rgb(*col); ctx.set_line_width(w); ctx.set_line_cap(cairo.LINE_CAP_ROUND); ctx.set_line_join(cairo.LINE_JOIN_ROUND); ctx.stroke()

def fill_line(ctx, fill, w=5):
    ctx.set_source_rgb(*fill); ctx.fill_preserve(); stroke(ctx, w)

def ellipse_pts(cx, cy, rx, ry, n=14, rot=0.0):
    return [(cx + rx * math.cos(a) * math.cos(rot) - ry * math.sin(a) * math.sin(rot),
             cy + rx * math.cos(a) * math.sin(rot) + ry * math.sin(a) * math.cos(rot)) for a in [2 * math.pi * k / n for k in range(n)]]

def stick_line(ctx, pts, boil, w, col=INK, amp=1.4):
    ctx.new_path(); wpath(ctx, pts, boil, amp); stroke(ctx, w, col)

class Char:
    """Same constructor/draw signature as the earlier cartoon characters, so every scene keeps working."""
    def __init__(self, body="brown", hat=None, hair=None, beard=None, size=1.0, seed=0, skin=None, body_w=1.0, bald=False):
        self.body, self.hat, self.hair, self.beard, self.size, self.seed = body, hat, hair, beard, size, seed
        self.body_w, self.bald = body_w, bald

    def col(self, c):
        return PAL.get(c, c) if isinstance(c, str) else c

    def draw(self, ctx, x, y, t, expr="neutral", arms=(200, -20), props=(None, None), walk=0.0, face=1,
             look=(0, 0), shiver=0.0, talk=False, sweat=False, tears=False, eyes="dot", tilt=0.0, green=False, size=None):
        s = (size or self.size) * 1.25
        boil = int(t * 8) + self.seed * 13            # outline re-draw every 1/8 s
        bob = 3 * math.sin(t * 2.2 + self.seed) + (abs(math.sin(walk * math.pi)) * -9 if walk else 0)
        x += shiver * math.sin(t * 55) * 3 * s
        ctx.save(); ctx.translate(x, y + bob * s); ctx.rotate(tilt); ctx.scale(s, s)
        # ---- proportions (feet at y=0) : legs 100, torso 100, head ~95
        hip_y, sh_y = -100, -192
        tw = 66 * self.body_w
        # legs (long sticks with a slight knee)
        for k, side in enumerate((-1, 1)):
            sw = math.sin(walk * math.pi + k * math.pi) * 26 if walk else 0
            knee = (side * 12 + sw * 0.6 + 4, -52)
            foot = (side * 14 + sw, -2)
            stick_line(ctx, [(side * 14, hip_y + 6), knee, foot], boil + k, 7)
            stick_line(ctx, [foot, (foot[0] + 14 * face, foot[1] + 1)], boil + k + 9, 7)
        # arms (behind torso if hanging behind? keep in front for readability) - computed now, drawn after torso
        arm_pts = []
        for i, side in enumerate((-1, 1)):
            a = math.radians(arms[i] + 5 * math.sin(t * 1.4 + self.seed + i * 2.1))
            shx, shy = side * (tw / 2 - 6), sh_y + 18
            ex, ey = shx + 46 * math.cos(a), shy + 46 * math.sin(a)
            bend = math.radians(18 * (1 if side > 0 else -1))
            hx, hy = ex + 44 * math.cos(a + bend), ey + 44 * math.sin(a + bend)
            arm_pts.append(((shx, shy), (ex, ey), (hx, hy)))
        # torso: tall rounded slab (hoodie-like)
        body = self.col(self.body)
        ctx.new_path()
        wpath(ctx, [(-tw / 2 + 6, sh_y), (0, sh_y - 6), (tw / 2 - 6, sh_y), (tw / 2 + 2, sh_y + 30), (tw / 2 + 4, hip_y + 4),
                    (0, hip_y + 10), (-tw / 2 - 4, hip_y + 4), (-tw / 2 - 2, sh_y + 30)], boil + 3, 1.8, closed=True)
        fill_line(ctx, body, 5)
        if self.body in ("brown", "tan", "cream", "rust"):
            stick_line(ctx, [(-tw / 2 + 2, hip_y - 14), (0, hip_y - 11), (tw / 2 - 2, hip_y - 14)], boil + 4, 5, PAL["tan"])
            stick_line(ctx, [(-8, sh_y + 30), (-14, sh_y + 52)], boil + 5, 3, tuple(c * 0.75 for c in body))   # a tear/patch line
        # arms + props
        for i, (shp, el, hd) in enumerate(arm_pts):
            stick_line(ctx, [shp, el, hd], boil + 20 + i, 7)
            prop(ctx, props[i], hd[0], hd[1], t, self.seed + i)
            ctx.new_path(); ctx.arc(hd[0], hd[1], 6, 0, 2 * math.pi); ctx.set_source_rgb(*INK); ctx.fill()
        # head: big white oval
        hx0, hy0, RX, RY = 2 * face, sh_y - 44, 44, 48
        ctx.new_path(); wpath(ctx, ellipse_pts(hx0, hy0, RX, RY, 14), boil + 7, 1.5, closed=True)
        fill_line(ctx, rgb("dfeccd") if green else FACE, 5)
        # hair blob (dark), unless bald or covered
        if self.hair and not self.bald and self.hat not in ("hood", "veil", "scarf", "executioner"):
            hc = self.col(self.hair)
            ctx.new_path()
            wpath(ctx, [(hx0 - RX * 0.95, hy0 - RY * 0.30), (hx0 - RX * 0.8, hy0 - RY * 0.78), (hx0 - RX * 0.3, hy0 - RY * 1.06),
                        (hx0 + RX * 0.35, hy0 - RY * 1.06), (hx0 + RX * 0.85, hy0 - RY * 0.75), (hx0 + RX * 0.92, hy0 - RY * 0.45),
                        (hx0 + RX * 0.45, hy0 - RY * 0.62), (hx0, hy0 - RY * 0.70), (hx0 - RX * 0.5, hy0 - RY * 0.62)], boil + 8, 1.4, closed=True)
            fill_line(ctx, hc, 4)
            for k in range(3):   # messy tufts
                tx = hx0 - RX * 0.5 + k * RX * 0.45
                stick_line(ctx, [(tx, hy0 - RY * 0.95), (tx - 10 + k * 8, hy0 - RY * 1.25)], boil + 30 + k, 5, hc)
        if self.beard:
            bc = self.col(self.beard)
            ctx.new_path()
            wpath(ctx, [(hx0 - RX * 0.82, hy0 + RY * 0.38), (hx0 - RX * 0.6, hy0 + RY * 0.82), (hx0, hy0 + RY * 1.04), (hx0 + RX * 0.6, hy0 + RY * 0.82),
                        (hx0 + RX * 0.82, hy0 + RY * 0.38), (hx0 + RX * 0.42, hy0 + RY * 0.66), (hx0, hy0 + RY * 0.74), (hx0 - RX * 0.42, hy0 + RY * 0.66)],
                  boil + 9, 1.2, closed=True)
            fill_line(ctx, bc, 4)
        C.hat(ctx, self.hat, hx0, hy0, RX * 1.02)
        face_draw(ctx, hx0, hy0, RX, RY, expr, t, self.seed, look, talk, eyes, boil, beard=bool(self.beard), face=face)
        if sweat:
            dy = (t * 0.8) % 1 * 18
            ctx.new_path(); ctx.move_to(hx0 + RX * 0.85, hy0 - RY * 0.45 + dy)
            ctx.curve_to(hx0 + RX * 1.1, hy0 - RY * 0.1 + dy, hx0 + RX * 0.62, hy0 + dy, hx0 + RX * 0.85, hy0 - RY * 0.45 + dy)
            ctx.set_source_rgb(*rgb("8fd0f5")); ctx.fill_preserve(); stroke(ctx, 3)
        if tears:
            for sx in (-1, 1):
                d = (t * 1.4 + sx * 0.3) % 1
                ctx.new_path(); ctx.arc(hx0 + sx * RX * 0.36, hy0 + 6 + d * 34, 5, 0, 6.3); ctx.set_source_rgb(*rgb("8fd0f5")); ctx.fill()
        ctx.restore()

EX = {  # brow tilt (inner up negative = worried), brow height, mouth
    "neutral": (0.0, 0, "flat"), "angry": (0.5, -2, "frown"), "scared": (-0.45, 6, "teeth_wavy"), "shock": (-0.3, 12, "o"),
    "sad": (-0.4, 4, "frown"), "grin": (0.3, 0, "teeth"), "smug": (0.2, 0, "smirk"), "happy": (0.0, 6, "smile"),
    "sick": (-0.35, 2, "wavy"), "shout": (0.5, -2, "shout"), "grimace": (-0.35, 4, "teeth"), "determined": (0.4, -3, "flat"),
}

def face_draw(ctx, cx, cy, RX, RY, expr, t, seed, look, talk, eyes, boil, beard=False, face=1):
    tilt, bh, mouth = EX.get(expr, EX["neutral"])
    lx, ly = look
    blink = ((t + seed * 0.37) % 3.9) < 0.11
    ex = RX * 0.36
    for side in (-1, 1):
        x = cx + side * ex + lx * 5 + face * 3; y = cy - RY * 0.06 + ly * 4
        if eyes == "closed" or blink:
            stick_line(ctx, [(x - 8, y), (x + 8, y + 1)], boil + side, 4)
        elif expr == "shock" or eyes == "wide":
            ctx.new_path(); ctx.arc(x, y, 11, 0, 6.3); ctx.set_source_rgb(*FACE); ctx.fill_preserve(); stroke(ctx, 3.5)
            ctx.new_path(); ctx.arc(x + lx * 3, y + ly * 3, 4, 0, 6.3); ctx.set_source_rgb(*INK); ctx.fill()
        else:
            ctx.new_path(); ctx.save(); ctx.translate(x, y); ctx.scale(0.75, 1.15); ctx.arc(0, 0, 6.5, 0, 6.3); ctx.restore()
            ctx.set_source_rgb(*INK); ctx.fill()
        # thick eyebrow: inner end raised for worried (tilt<0), lowered for angry (tilt>0)
        by = y - 20 - bh
        inner = (x - side * 12, by + tilt * 14); outer = (x + side * 12, by - tilt * 6)
        stick_line(ctx, [outer, inner], boil + 40 + side, 7)
    my = cy + RY * (0.38 if beard else 0.46)
    if talk and math.sin(t * 22) > 0 and mouth in ("flat", "frown", "smile", "smirk", "wavy"):
        mouth = "talk"
    if mouth == "flat": stick_line(ctx, [(cx - 14, my), (cx + 14, my)], boil + 50, 5)
    elif mouth == "smile": stick_line(ctx, [(cx - 18, my - 6), (cx, my + 6), (cx + 18, my - 6)], boil + 50, 5)
    elif mouth == "frown": stick_line(ctx, [(cx - 16, my + 6), (cx, my - 4), (cx + 16, my + 6)], boil + 50, 5)
    elif mouth == "smirk": stick_line(ctx, [(cx - 16, my + 3), (cx + 4, my + 3), (cx + 18, my - 8)], boil + 50, 5)
    elif mouth == "wavy": stick_line(ctx, [(cx - 18, my), (cx - 9, my - 5), (cx, my), (cx + 9, my - 5), (cx + 18, my)], boil + 50, 4)
    elif mouth in ("o", "talk"):
        ctx.new_path(); ctx.save(); ctx.translate(cx, my); ctx.scale(1, 1.3 if mouth == "o" else 0.75)
        ctx.arc(0, 0, 10, 0, 6.3); ctx.restore(); ctx.set_source_rgb(*rgb("5a2420")); ctx.fill_preserve(); stroke(ctx, 4)
    elif mouth in ("teeth", "teeth_wavy", "shout"):
        w, h = (30, 14) if mouth != "shout" else (26, 24)
        ctx.new_path(); wpath(ctx, [(cx - w, my - h / 2), (cx + w, my - h / 2), (cx + w - 3, my + h / 2), (cx - w + 3, my + h / 2)], boil + 51, 1.0, closed=True)
        fill_line(ctx, rgb("fff8e6") if mouth != "shout" else rgb("5a2420"), 4)
        if mouth != "shout":
            stick_line(ctx, [(cx - w + 2, my), (cx + w - 2, my)], boil + 52, 2.5)
            for k in range(1, 4): stick_line(ctx, [(cx - w + k * w / 2, my - h / 2), (cx - w + k * w / 2, my + h / 2)], boil + 53 + k, 2.2)
