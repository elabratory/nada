"""Cartoon scenes, one function per shot key: f(ctx, t, p) with t = seconds (for idle animation)
and p = 0..1 progress through the shot (for actions)."""
import math, random
from cartoon import *

# recurring cast (same look in every scene)
HERO = Char(body="brown", hair=rgb("4a3020"), beard=rgb("4a3020"), seed=1)
KEEPER = Char(body="rust", bald=True, beard=rgb("9a9a96"), size=1.12, body_w=1.3, seed=2)
GUARD = Char(body=rgb("8f9aa0"), hat="kettle", seed=3)
OLD = Char(body="dgrey", hat="hood", beard=PAL["white"], seed=4)
CLERK = Char(body="navy", hat="coif", seed=5)
WOMAN = Char(body="green", hat="scarf", seed=7)
CROWD = [Char(body=c, hat=h, hair=hr, beard=b, seed=10 + i) for i, (c, h, hr, b) in enumerate([
    ("blue", "hood", None, None), ("tan", None, rgb("6b4a2a"), None), ("purple", "cap", None, rgb("6b4a2a")),
    ("green", None, rgb("2b2622"), rgb("2b2622")), ("red", "scarf", None, None), ("cream", None, rgb("a07040"), None),
    ("brown", "hood", None, None), ("blue", None, rgb("2b2622"), rgb("5a4a3a"))])]

def ease(p): return p * p * (3 - 2 * p)
def seg(p, a, b): return min(1, max(0, (p - a) / (b - a)))

# ------------------------------------------------------------------ cold open
def city_wide(ctx, t, p):
    sky(ctx); clouds(ctx, t, 9)
    ctx.rectangle(-200, 640, W + 400, 140); fill_stroke(ctx, rgb("7fa7bd"))           # Thames
    for k in range(8): line(ctx, [(100 + k * 240 + (t * 20) % 240, 700), (160 + k * 240 + (t * 20) % 240, 700)], 4, PAL["white"])
    r = random.Random(4)
    x = -40
    while x < W:
        w = 70 + r.random() * 60; h = 90 + r.random() * 120
        ctx.rectangle(x, 640 - h, w, h); fill_stroke(ctx, r.choice([PAL["cream"], rgb("e6d3b0"), rgb("d9c49c")]), 3)
        ctx.new_path(); ctx.move_to(x - 6, 640 - h); ctx.line_to(x + w / 2, 640 - h - w * 0.5); ctx.line_to(x + w + 6, 640 - h); ctx.close_path()
        fill_stroke(ctx, r.choice([PAL["red"], PAL["brown"], PAL["rust"]]), 3)
        x += w + 4
    # Old St Paul's with its spire
    ctx.rectangle(820, 300, 300, 340); fill_stroke(ctx, PAL["stone"])
    ctx.rectangle(925, 170, 90, 140); fill_stroke(ctx, PAL["stone"])
    ctx.new_path(); ctx.move_to(925, 172); ctx.line_to(970, -40); ctx.line_to(1015, 172); ctx.close_path(); fill_stroke(ctx, PAL["dgrey"])
    for k in range(4): rrect(ctx, 845 + k * 70, 400, 30, 70, 14); fill_stroke(ctx, rgb("3d4a57"), 3)
    ctx.rectangle(-200, 780, W + 400, 400); fill_stroke(ctx, rgb("6f8f4f"))
    text(ctx, "London, 1322", W / 2, 920, 150, PAL["white"], outline=INK)

def market(ctx, t, p):
    street(ctx, t, 760, seed=3)
    for k, x in enumerate((230, 1500)):
        line(ctx, [(x, 760), (x, 520)], 10, PAL["wood"]); line(ctx, [(x + 300, 760), (x + 300, 520)], 10, PAL["wood"])
        ctx.new_path(); ctx.move_to(x - 30, 540); ctx.line_to(x + 330, 540); ctx.line_to(x + 300, 470); ctx.line_to(x, 470); ctx.close_path()
        fill_stroke(ctx, PAL["red"] if k == 0 else PAL["blue"])
        ctx.rectangle(x, 640, 300, 30); fill_stroke(ctx, PAL["wood"])
        for j in range(5): prop(ctx, "bread", x + 40 + j * 55, 640, t)
    for k, c in enumerate(CROWD[:6]):
        x = (200 + k * 290 + (t * 40 * (1 if k % 2 else -1))) % (W + 200) - 100
        c.draw(ctx, x, 940 + (k % 2) * 40, t, "neutral", walk=t * 1.8 + k, arms=(110, 70), talk=(k == 2), size=1.15)
    HERO.draw(ctx, 980, 1060, t, "neutral", arms=(100, 80), props=(None, "purse"), size=1.6)

def purse_cut(ctx, t, p):
    street(ctx, t, 760, seed=3)
    ctx.save(); ctx.translate(W / 2, H * 0.05); ctx.scale(2.6, 2.6); ctx.translate(-W / 2, 0)
    HERO.draw(ctx, W / 2 - 60, 470, t, "neutral", arms=(110, 75))
    drop = seg(p, 0.45, 0.8)
    prop(ctx, "purse", W / 2 - 40 + 50, 300 + drop * 240, t)
    hx = W / 2 + 160 - seg(p, 0.1, 0.4) * 90
    line(ctx, [(hx + 200, 280), (hx, 300)], 10); circle(ctx, hx, 300, 14, SKIN, 4); prop(ctx, "knife", hx - 10, 296, t)
    ctx.restore()
    if 0.42 < p < 0.75: text(ctx, "snip!", 1450, 300, 130, PAL["scarlet"], outline=PAL["white"], angle=-0.12)

def pointing(ctx, t, p):
    street(ctx, t, 760, seed=5)
    for k, c in enumerate(CROWD[2:7]):
        c.draw(ctx, 900 + k * 230, 960 + (k % 2) * 30, t, "shock" if p > 0.3 else "neutral", look=(-1, 0), arms=(120, 60), size=1.2)
    WOMAN.draw(ctx, 470, 1080, t, "shout", arms=(110, -8), talk=True, size=1.9)
    if p > 0.25: text(ctx, "THIEF!", 980, 330, 160, PAL["scarlet"], outline=PAL["white"], angle=-0.08)

def hero_shock(ctx, t, p):
    street(ctx, t, 760, seed=5)
    ctx.set_source_rgba(1, 1, 1, 0.25); ctx.rectangle(0, 0, W, H); ctx.fill()
    HERO.draw(ctx, W / 2, 1380, t, "shock", arms=(150, 30), sweat=True, shiver=0.6, size=2.7)
    if p > 0.2: text(ctx, "Me?!", 1380, 330, 150, INK, outline=PAL["white"], angle=0.1)

def seized(ctx, t, p):
    street(ctx, t, 760, seed=7)
    for k, c in enumerate(CROWD[:4]): c.draw(ctx, 140 + k * 170, 880, t, "smug" if k % 2 else "neutral", look=(1, 0), arms=(110, 70), size=0.9)
    GUARD.draw(ctx, 1330, 1080, t, "angry", arms=(180 + 10 * math.sin(t * 3), -10), props=(None, "staff"), size=1.9)
    HERO.draw(ctx, 900, 1080, t, "scared", arms=(150, 10), shiver=0.8, sweat=True, size=1.9)

def march(ctx, t, p):
    ctx.save(); ctx.translate(-p * 700, 0)
    street(ctx, t, 760, seed=8); gatehouse(ctx, W + 900, 760, 1.0)
    ctx.restore()
    GUARD.draw(ctx, 1150, 1070, t, "angry", walk=t * 2.2, props=(None, "staff"), size=1.7)
    HERO.draw(ctx, 760, 1070, t, "sad", walk=t * 2.2, arms=(100, 80), size=1.7)

def newgate_ext(ctx, t, p):
    sky(ctx); clouds(ctx, t, 2); ground(ctx, 800, seed=4)
    gatehouse(ctx, W / 2, 800, 1.05, t)
    GUARD.size = 0.55; HERO.size = 0.55
    xo = 760 + p * 160
    HERO.draw(ctx, xo, 960, t, "sad", walk=t * 2.2); GUARD.draw(ctx, xo + 80, 960, t, "angry", walk=t * 2.2, props=(None, "staff"))
    GUARD.size = 1.0; HERO.size = 1.0
    text(ctx, "NEWGATE", 1530, 260, 120, PAL["white"], outline=INK, angle=-0.05)
    arrow(ctx, 1450, 300, 1250, 420, PAL["white"])

def newgate_door(ctx, t, p):
    stone_wall(ctx, -200, -200, W + 200, H + 200, PAL["stone"], seed=12)
    ctx.new_path(); ctx.move_to(660, 1080); ctx.line_to(660, 420); ctx.arc(960, 420, 300, math.pi, 0); ctx.line_to(1260, 1080); ctx.close_path()
    fill_stroke(ctx, rgb("1d1f23"))
    open_ = seg(p, 0.3, 0.9) * 0.0
    ctx.new_path(); ctx.move_to(680, 1080); ctx.line_to(680, 430); ctx.arc(960, 430, 280, math.pi, 0); ctx.line_to(1240, 1080); ctx.close_path()
    fill_stroke(ctx, PAL["wood"])
    for k in range(1, 6): line(ctx, [(680 + k * 93, 200), (680 + k * 93, 1080)], 4, PAL["wood_d"])
    for y in (520, 860): rrect(ctx, 670, y, 580, 34, 6); fill_stroke(ctx, PAL["dgrey"])
    rrect(ctx, 890, 520 - 180, 140, 110, 8); fill_stroke(ctx, rgb("1d1f23"))
    for k in range(1, 4): line(ctx, [(890 + k * 35, 340), (890 + k * 35, 450)], 7, PAL["dgrey"])
    # pair of eyes peeking from the grille
    if p > 0.4: face_draw(ctx, 960, 400, 45, "angry", t, 3, (0, 0), False, "dot")

def door_shut(ctx, t, p):
    ctx.set_source_rgb(0.04, 0.04, 0.05); ctx.rectangle(-200, -200, W + 400, H + 400); ctx.fill()
    a = max(0, 1 - p * 3)
    ctx.set_source_rgba(1, 0.95, 0.8, 0.5 * a); ctx.rectangle(950, 0, 22, H); ctx.fill()
    if p > 0.25:
        for sx in (-1, 1):
            blink = ((t * 1.0) % 2.4) < 0.12
            if blink: line(ctx, [(W / 2 + sx * 70 - 22, H / 2), (W / 2 + sx * 70 + 22, H / 2)], 6, PAL["white"])
            else:
                circle(ctx, W / 2 + sx * 70, H / 2, 30, PAL["white"], 2); ctx.new_path(); ctx.arc(W / 2 + sx * 70 + 6 * math.sin(t), H / 2, 10, 0, 6.3)
                ctx.set_source_rgb(0, 0, 0); ctx.fill()
    if p < 0.25: text(ctx, "SLAM", W / 2, H / 2 + 40, 200, PAL["white"], outline=INK, angle=-0.1)

def torture_dark(ctx, t, p):
    cell(ctx, t, window=False, floor_y=820, seed=14)
    rrect(ctx, 1150, 600, 520, 60, 10); fill_stroke(ctx, PAL["wood"])
    for x in (1180, 1610): line(ctx, [(x, 660), (x, 830)], 14, PAL["wood_d"])
    for x in (1170, 1650): circle(ctx, x, 630, 50, PAL["wood_d"])
    T = Char(body="black", hat="executioner", size=1.1, body_w=1.2, seed=20)
    T.draw(ctx, 760, 1090, t, "grin", arms=(140, -30), props=(None, "chain"), size=1.9)
    if p > 0.45: big_x(ctx, 900, 640, 330, seg(p, 0.45, 0.75))
    if p > 0.6: text(ctx, "not the real problem", 900, 200, 90, PAL["white"], outline=INK)

def bread_crust(ctx, t, p):
    cell(ctx, t, window=True, torch=False, floor_y=700, seed=15)
    ctx.save(); ctx.translate(W / 2, 860); ctx.scale(7, 7); prop(ctx, "bread", 0, 0, t); ctx.restore()
    for k in range(3):
        a = t * 3 + k * 2.1
        fx, fy = W / 2 + 260 * math.cos(a), 690 + 70 * math.sin(a * 1.3)
        circle(ctx, fx, fy, 9, INK, 1); line(ctx, [(fx - 12, fy - 10), (fx, fy)], 3, rgb("cfd8dc")); line(ctx, [(fx + 12, fy - 10), (fx, fy)], 3, rgb("cfd8dc"))
    text(ctx, "HUNGER", W / 2, 260, 170, PAL["scarlet"], outline=PAL["white"])

def fever(ctx, t, p):
    cell(ctx, t, window=True, seed=16)
    OLD.draw(ctx, W / 2, 1100, t, "sick", arms=(130, 50), sweat=True, shiver=0.5, green=True, size=2.1)
    text(ctx, "FEVER", W / 2, 230, 170, PAL["scarlet"], outline=PAL["white"])

def crowded(ctx, t, p):
    cell(ctx, t, window=True, seed=17)
    r = random.Random(3)
    cast = CROWD + [OLD, HERO] + CROWD[:4]
    for k, c in enumerate(cast):
        x = 130 + (k % 7) * 270 + (k // 7) * 120; y = 900 + (k // 7) * 150
        c.draw(ctx, x, y + 60, t, r.choice(["sad", "angry", "sick", "grimace"]), arms=(120, 60), size=1.15)
    text(ctx, "THE CROWD", W / 2, 230, 160, PAL["scarlet"], outline=PAL["white"])

def coins_palm(ctx, t, p):
    cell(ctx, t, window=False, seed=18)
    KEEPER.draw(ctx, W / 2, 1100, t, "smug", arms=(140, -10), props=(None, "coins"), size=2.0)
    text(ctx, "THE BILL", W / 2, 230, 160, PAL["scarlet"], outline=PAL["white"])

def candle_low(ctx, t, p):
    cell(ctx, t, window=True, torch=False, seed=19)
    n = int(4 + p * 22)
    for k in range(n):
        gx = 1000 + (k % 5) * 26 + (k // 5) * 150
        if k % 5 == 4: line(ctx, [(gx - 110, 470), (gx, 400)], 6, PAL["white"])
        else: line(ctx, [(gx, 400), (gx, 475)], 6, PAL["white"])
    HERO.draw(ctx, 650, 1090, t, "sad", arms=(110, 70), eyes="dot", size=1.8)
    for k in range(3):   # cobweb
        ctx.new_path(); ctx.arc(0, 0, 80 + k * 50, 0, math.pi / 2); ctx.set_source_rgba(1, 1, 1, 0.5); ctx.set_line_width(2); ctx.stroke()
    text(ctx, "THE WAIT", W / 2, 230, 170, PAL["scarlet"], outline=PAL["white"])

def title_corridor(ctx, t, p):
    cell(ctx, t, window=False, seed=21)
    ctx.set_source_rgba(0, 0, 0, 0.35); ctx.rectangle(0, 0, W, H); ctx.fill()
    HERO.draw(ctx, 1500, 1090, t, "scared", arms=(120, 60), props=("chain", "chain"), shiver=0.4, size=1.7)
    text(ctx, "Why You Wouldn't Survive", 760, 380, 120, PAL["white"], outline=INK)
    text(ctx, "a Medieval Prison", 760, 560, 170, PAL["scarlet"], outline=PAL["white"])
    arrow(ctx, 1180, 640, 1390, 760, PAL["white"])

SCENES = {k: v for k, v in globals().items() if callable(v) and getattr(v, "__module__", None) == __name__ and k not in ("ease", "seg")}
