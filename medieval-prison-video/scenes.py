"""Cartoon scenes, one function per shot key: f(ctx, t, p) with t = seconds (for idle animation)
and p = 0..1 progress through the shot (for actions)."""
import math, random
from cartoon import *
from cartoon import rat as _rat

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
    birds(ctx, t, 5, 2)
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
    street(ctx, t, 760, seed=8, ext=1000); gatehouse(ctx, W + 900, 760, 1.0)
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

CUR = {"seg": ""}

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
    if CUR["seg"] == "s09": text(ctx, "THE WAIT", W / 2, 230, 170, PAL["scarlet"], outline=PAL["white"])
    else:
        rrect(ctx, 1450, 640, 40, 110 - 80 * p, 6); fill_stroke(ctx, PAL["cream"], 4); flame(ctx, 1470, 640 - 6, 0.8, t)

def title_corridor(ctx, t, p):
    cell(ctx, t, window=False, seed=21)
    ctx.set_source_rgba(0, 0, 0, 0.35); ctx.rectangle(0, 0, W, H); ctx.fill()
    HERO.draw(ctx, 1500, 1090, t, "scared", arms=(120, 60), props=("chain", "chain"), shiver=0.4, size=1.7)
    text(ctx, "Why You Wouldn't Survive", 760, 380, 120, PAL["white"], outline=INK)
    text(ctx, "a Medieval Prison", 760, 560, 170, PAL["scarlet"], outline=PAL["white"])
    arrow(ctx, 1180, 640, 1390, 760, PAL["white"])


# =================================================================== CHAPTER 1
def gaol_hall(ctx, t, p):
    cell(ctx, t, window=True, seed=30)
    table(ctx, 1500, 760, 360)
    KEEPER.draw(ctx, 1500, 1000, t, "smug", arms=(130, 50), props=(None, "coins"), size=1.3)
    for k, c in enumerate([CROWD[0], OLD, CROWD[3], CROWD[5]]):
        c.draw(ctx, 180 + k * 260, 1000 + (k % 2) * 40, t, ["sad", "sick", "angry", "sad"][k], arms=(120, 60), size=1.25)
    text(ctx, "the waiting room", 1500, 360, 70, PAL["white"], outline=INK, angle=-0.04)
    arrow(ctx, 1380, 400, 900, 640, PAL["white"])

def hands_chained(ctx, t, p):
    cell(ctx, t, window=False, seed=31, dim=0.25)
    sw = math.sin(t * 2.5) * 12
    for side in (-1, 1):
        hx = W / 2 + side * 210
        line(ctx, [(hx + side * 400, 1200), (hx, 600)], 70, PAL["brown"])
        circle(ctx, hx, 560, 80, SKIN, 6)
        rrect(ctx, hx - 95, 610, 190, 70, 18); fill_stroke(ctx, PAL["dgrey"], 6)
    for k in range(9):
        cx = W / 2 - 160 + k * 40; cy = 650 + 60 * math.sin(math.pi * k / 8) + sw * math.sin(math.pi * k / 8)
        ctx.new_path(); ctx.save(); ctx.translate(cx, cy); ctx.scale(1, 0.6 if k % 2 else 1); ctx.arc(0, 0, 20, 0, 6.3); ctx.restore()
        ctx.set_source_rgb(*INK); ctx.set_line_width(7); ctx.stroke()
    for i, (w_, a) in enumerate((("a trial?", 0.1), ("a payment?", 0.3), ("a pardon?", 0.5), ("or a rope.", 0.7))):
        if p > a: text(ctx, w_, 300 + i * 440, 220 + (i % 2) * 70, 80, PAL["scarlet"] if i == 3 else PAL["white"], outline=INK)

def noose(ctx, t, p):
    sky(ctx, rgb("b9c4cc"), rgb("e5e2da")); clouds(ctx, t, 5)
    ctx.new_path(); ctx.move_to(-200, 900); ctx.curve_to(500, 700, 1300, 700, 2200, 900); ctx.line_to(2200, 1300); ctx.line_to(-200, 1300); ctx.close_path(); fill_stroke(ctx, rgb("7d9a5a"))
    line(ctx, [(900, 760), (900, 260)], 26, PAL["wood"]); line(ctx, [(880, 280), (1250, 280)], 26, PAL["wood"]); line(ctx, [(900, 380), (1000, 280)], 16, PAL["wood"])
    a = 0.06 * math.sin(t * 1.5)
    ctx.save(); ctx.translate(1200, 290); ctx.rotate(a); line(ctx, [(0, 0), (0, 210)], 8, PAL["tan"])
    ctx.new_path(); ctx.arc(0, 250, 40, 0, 6.3); ctx.set_source_rgb(*PAL["tan"]); ctx.set_line_width(8); ctx.stroke(); ctx.restore()
    for k in range(3):
        bx, by = 500 + k * 120 + 30 * math.sin(t + k), 200 + 20 * math.sin(t * 2 + k)
        line(ctx, [(bx - 25, by - 10 * math.sin(t * 8 + k)), (bx, by), (bx + 25, by - 10 * math.sin(t * 8 + k))], 6)

def felons(ctx, t, p):
    cell(ctx, t, window=True, seed=32)
    for k, (c, e) in enumerate([(CROWD[3], "angry"), (CROWD[6], "smug"), (CROWD[7], "grin")]):
        c.draw(ctx, 300 + k * 330, 1040, t, e, arms=(120, 60), size=1.45)
    HERO.draw(ctx, 1500, 1060, t, "scared", arms=(130, 50), shiver=0.6, sweat=True, size=1.6)
    for k, (lbl, x) in enumerate((("accused thief", 300), ("accused robber", 630), ("accused... worse", 960))):
        if p > 0.15 + k * 0.15: text(ctx, lbl, x, 330 + (k % 2) * 60, 54, PAL["white"], outline=INK)
    if p > 0.6: text(ctx, "you", 1500, 360, 80, PAL["scarlet"], outline=PAL["white"]); arrow(ctx, 1500, 390, 1500, 560, PAL["scarlet"])

def pennies(ctx, t, p):
    ctx.set_source_rgb(*rgb("9a6b43")); ctx.paint()
    for k in range(8): line(ctx, [(-100, 80 + k * 140), (W + 100, 60 + k * 140)], 4, PAL["wood_d"])
    shown = int(min(12, p * 30))
    for k in range(shown):
        cx, cy = 560 + (k % 6) * 160, 380 + (k // 6) * 170
        circle(ctx, cx, cy, 64, rgb("c8ccd0"), 6); circle(ctx, cx, cy, 44, rgb("dde0e3"), 3)
        line(ctx, [(cx - 18, cy), (cx + 18, cy)], 4); line(ctx, [(cx, cy - 18), (cx, cy + 18)], 4)
    if p > 0.45: text(ctx, "12 pence = 1 shilling", W / 2, 840, 90, PAL["white"], outline=INK)
    if p > 0.7: text(ctx, "steal more than this... you could hang", W / 2, 960, 64, PAL["scarlet"], outline=PAL["white"])

def debtor(ctx, t, p):
    street(ctx, t, 760, seed=33)
    M = Char(body="purple", hat="cap", beard=rgb("6b4a2a"), body_w=1.35, seed=40)
    M.draw(ctx, 520, 1070, t, "angry", arms=(110, -20), props=(None, "scroll"), size=1.8, talk=True)
    CROWD[1].draw(ctx, 1150, 1070, t, "sad", arms=(100, 80), tears=True, size=1.7)
    GUARD.draw(ctx, 1520, 1070, t, "neutral", arms=(190, -20), props=(None, "staff"), size=1.7)
    if p > 0.3: bubble(ctx, 560, 230, "Pay up...\nor prison!", 60, tail=(40, 90))
    text(ctx, "IOU", 760, 560, 54, INK, angle=-0.2)

def bread_water(ctx, t, p):
    cell(ctx, t, window=True, torch=False, floor_y=760, seed=34)
    rrect(ctx, 520, 640, 880, 70, 12); fill_stroke(ctx, PAL["stone"])
    ctx.save(); ctx.translate(820, 640); ctx.scale(4, 4); prop(ctx, "bread", 0, 0, t); ctx.restore()
    ctx.save(); ctx.translate(1160, 640); ctx.scale(3.2, 3.2); prop(ctx, "cup", 0, 0, t); ctx.restore()
    if p > 0.35: text(ctx, "the safety net", 960, 330, 110, PAL["white"], outline=INK); arrow(ctx, 760, 380, 860, 540, PAL["white"])

def rich_purse(ctx, t, p):
    sky(ctx, rgb("f3d98a"), rgb("fbefc8"))
    for k in range(14):
        a = k / 14 * 2 * math.pi + t * 0.2
        line(ctx, [(W / 2, H / 2), (W / 2 + 1400 * math.cos(a), H / 2 + 1400 * math.sin(a))], 60, rgb("f6e2a2"))
    M = Char(body="purple", hat="cap", beard=rgb("6b4a2a"), body_w=1.4, seed=41)
    M.draw(ctx, W / 2, 1130, t, "smug", arms=(130, -40), props=(None, "purse"), size=2.2)
    for k in range(5):
        y = (t * 300 + k * 220) % 1200 - 100
        circle(ctx, 300 + k * 330, y, 30, PAL["gold"], 4)
    text(ctx, "Do you have money?", W / 2, 170, 110, PAL["scarlet"], outline=PAL["white"])

def rich_prisoner(ctx, t, p):
    stone_wall(ctx, -200, -200, W + 200, 820, rgb("a29a8a"), seed=35); wood_floor(ctx, 820)
    rrect(ctx, 120, 560, 620, 260, 20); fill_stroke(ctx, PAL["wood"]); rrect(ctx, 150, 520, 560, 110, 30); fill_stroke(ctx, PAL["scarlet"])
    circle(ctx, 230, 540, 50, PAL["white"])
    table(ctx, 1400, 720, 520)
    for k in range(3): prop(ctx, "bread", 1260 + k * 120, 720, t)
    prop(ctx, "jug", 1580, 720, t); prop(ctx, "candle", 1200, 720, t)
    M = Char(body="purple", hat="cap", beard=rgb("6b4a2a"), body_w=1.4, seed=41)
    M.draw(ctx, 960, 1060, t, "happy", arms=(140, -30), props=(None, "cup"), size=1.7)
    text(ctx, "\"reputable\"", 960, 260, 100, PAL["gold"], outline=INK)

def ludgate(ctx, t, p):
    sky(ctx); clouds(ctx, t, 7); birds(ctx, t, 3, 4); ground(ctx, 800, seed=8)
    gatehouse(ctx, W / 2, 800, 0.85, t)
    M = Char(body="purple", hat="cap", body_w=1.3, seed=42)
    M.draw(ctx, 700 + p * 200, 1000, t, "happy", walk=t * 2, size=1.0)
    CROWD[4].draw(ctx, 1500, 1000, t, "sad", arms=(100, 80), size=1.0)
    rrect(ctx, 1220, 540, 520, 150, 12); fill_stroke(ctx, PAL["cream"])
    text(ctx, "LUDGATE", 1480, 600, 60, PAL["scarlet"]); text(ctx, "reputable persons only", 1480, 665, 40, INK)
    line(ctx, [(1480, 690), (1480, 800)], 12, PAL["wood"])

def pushed_in(ctx, t, p):
    stone_wall(ctx, -200, -200, W + 200, H + 200, PAL["stone"], seed=36)
    ctx.new_path(); ctx.move_to(500, 1080); ctx.line_to(500, 450); ctx.arc(760, 450, 260, math.pi, 0); ctx.line_to(1020, 1080); ctx.close_path(); fill_stroke(ctx, rgb("16181b"))
    shove = seg(p, 0.15, 0.55)
    HERO.draw(ctx, 820 - shove * 170, 1080, t, "shock", arms=(200, -40), tilt=-0.25 * shove, size=1.8)
    KEEPER.draw(ctx, 1350 - shove * 120, 1080, t, "grin", arms=(185, 170), size=1.9)
    if p > 0.5: text(ctx, "Newgate it is!", 1450, 260, 90, PAL["white"], outline=INK)

# =================================================================== CHAPTER 2
def corridor(ctx, t, depth_shift=0.0, door_light=False, light_size=1.0):
    ctx.set_source_rgb(*rgb("3b3a3a")); ctx.paint()
    vx, vy = W / 2, H * 0.47
    rings = sorted(((k + depth_shift) % 10 / 10, k) for k in range(10))
    for f, k in rings:
        sc = 0.12 + 0.88 * (1 - f) ** 1.8
        w, h = W * 1.2 * sc, H * 1.25 * sc
        rrect(ctx, vx - w / 2, vy - h / 2, w, h, 40 * sc)
        g = 0.32 + 0.35 * (1 - f)
        ctx.set_source_rgb(g * 0.95, g * 0.92, g * 0.88); ctx.fill_preserve(); ctx.set_source_rgb(*INK); ctx.set_line_width(4); ctx.stroke()
        if k % 3 == 1:
            for side in (-1, 1):
                tx = vx + side * w * 0.42; ty = vy - h * 0.1
                glow(ctx, tx, ty, 160 * sc + 20, a=0.25); flame(ctx, tx, ty, 0.9 * sc + 0.1, t, k)
    for cx_, cy_ in ((-W * 0.6, -H * 0.62), (W * 0.6, -H * 0.62), (-W * 0.6, H * 0.62), (W * 0.6, H * 0.62)):
        line(ctx, [(vx, vy), (vx + cx_ * 1.2, vy + cy_ * 1.2)], 5, INK)
    for k in range(1, 7):   # stone joints on the side walls
        for side in (-1, 1):
            a = 0.08 + k * 0.12
            line(ctx, [(vx + side * W * 0.6 * a * 1.2, vy - H * 0.62 * a * 1.2), (vx + side * W * 0.6 * a * 1.2, vy + H * 0.62 * a * 1.2)], 3, rgb("2b2622"))
    if door_light:
        s_ = 60 * light_size
        rrect(ctx, vx - s_, vy - s_ * 1.4, 2 * s_, 2.8 * s_, 10); ctx.set_source_rgb(*rgb("e9eef0")); ctx.fill()
    ctx.rectangle(-200, vy + H * 0.25, W + 400, H); ctx.set_source_rgba(0.25, 0.22, 0.2, 0.6); ctx.fill()

def pov_corridor(ctx, t, p):
    corridor(ctx, t, depth_shift=p * 2.5)
    KEEPER.draw(ctx, W / 2, 900, t, "neutral", walk=t * 2, props=(None, "torch"), size=0.9)

def look_back(ctx, t, p):
    corridor(ctx, t, door_light=True, light_size=1.4 - p * 1.2)
    GUARD.draw(ctx, W / 2, 680, t, "angry", size=0.45)
    if p > 0.3: text(ctx, "goodbye, daylight", W / 2, 230, 90, PAL["white"], outline=INK)

def keeper_back(ctx, t, p):
    corridor(ctx, t, depth_shift=p)
    KEEPER.draw(ctx, 600 + p * 700, 1080, t, "neutral", walk=t * 2, arms=(110, 70), props=(None, "keys"), size=1.7)
    if p > 0.4: text(ctx, "jingle jingle", 1500, 300, 80, PAL["gold"], outline=INK, angle=0.08)

def smoke_cell(ctx, t, p):
    cell(ctx, t, window=True, seed=37)
    for k, c in enumerate([CROWD[2], OLD, CROWD[5]]):
        c.draw(ctx, 380 + k * 560, 1060, t, ["sick", "grimace", "sad"][k], arms=(150, 30), size=1.5)
    for k in range(9):
        x = (k * 260 + t * 40) % (W + 300) - 150; y = 300 + (k % 3) * 120 + 20 * math.sin(t + k)
        ctx.new_path()
        for dx, dy, rr in ((0, 0, 70), (60, -25, 80), (120, 0, 60)): ctx.new_sub_path(); ctx.arc(x + dx, y + dy, rr, 0, 6.3)
        ctx.set_source_rgba(0.75, 0.75, 0.75, 0.35); ctx.fill()
    if (t % 2.2) < 1.0: text(ctx, "*cough*", 960, 520, 70, PAL["white"], outline=INK)

def latrine(ctx, t, p):
    cell(ctx, t, window=False, seed=38)
    bucket(ctx, 600, 960, 2.0, rgb("6a5a2e"))
    for k in range(4):
        x0 = 520 + k * 50
        pts = [(x0 + 18 * math.sin(t * 3 + j + k), 690 - j * 40) for j in range(8)]
        line(ctx, pts, 6, rgb("8fb35a"))
    for k in range(3):
        a = t * 4 + k * 2
        circle(ctx, 600 + 140 * math.cos(a), 640 + 50 * math.sin(a * 1.4), 8, INK, 1)
    HERO.draw(ctx, 1330, 1080, t, "grimace", arms=(250, 290), size=1.9, green=True)
    text(ctx, "shared by everyone", 1300, 230, 90, PAL["white"], outline=INK)

def slit_window(ctx, t, p):
    cell(ctx, t, window=False, torch=False, seed=39, dim=0.15)
    wx, wy = 1100, 180
    rrect(ctx, wx, wy, 90, 150, 8); fill_stroke(ctx, rgb("cfe3ee"))
    for k in (1, 2): line(ctx, [(wx + k * 30, wy), (wx + k * 30, wy + 150)], 7)
    ctx.new_path(); ctx.move_to(wx, wy + 150); ctx.line_to(wx + 90, wy + 150); ctx.line_to(wx - 120, 1080); ctx.line_to(wx - 420, 1080); ctx.close_path(); ctx.set_source_rgba(1, 1, 0.9, 0.18); ctx.fill()
    HERO.draw(ctx, 620, 1080, t, "sad", look=(1, -1), arms=(110, 70), size=1.8)
    text(ctx, "tiny window", 1450, 260, 80, PAL["white"], outline=INK); arrow(ctx, 1380, 290, 1210, 260, PAL["white"])
    if p > 0.5: text(ctx, "= almost no air", 1450, 380, 64, PAL["scarlet"], outline=PAL["white"])

def straw(ctx, t, p):
    straw_floor(ctx, -200, seed=40)
    ctx.new_path(); ctx.save(); ctx.translate(960, 620); ctx.scale(3, 1); ctx.arc(0, 0, 120, 0, 6.3); ctx.restore(); fill_stroke(ctx, rgb("b0a46a"), 4)
    for k in range(5):
        a = t * 1.2 + k
        circle(ctx, 960 + 260 * math.cos(a), 600 + 50 * math.sin(a), 6, INK, 1)
    text(ctx, "damp", 700, 260, 110, PAL["white"], outline=INK)
    if p > 0.55: text(ctx, "...and not only with water", 1150, 400, 74, PAL["scarlet"], outline=PAL["white"])

def dark_figures(ctx, t, p):
    cell(ctx, t, window=False, seed=41, dim=0.3)
    OLD.draw(ctx, 380, 1050, t, "sad", arms=(250, 290), eyes="closed", size=1.5)
    CROWD[0].draw(ctx, 960, 1050, t, "sick", arms=(150, 30), size=1.5, green=True)
    CROWD[6].draw(ctx, 1520, 1050, t, "scared", arms=(110, 70), props=("chain", "chain"), size=1.5)
    if (t % 2) < 1: text(ctx, "*cough*", 960, 470, 64, PAL["white"], outline=INK)
    text(ctx, "pray...", 380, 470, 60, PAL["white"], outline=INK)
    text(ctx, "clink", 1520, 500 + 10 * math.sin(t * 6), 64, PAL["white"], outline=INK)

def chains_floor(ctx, t, p):
    straw_floor(ctx, -200, seed=42)
    for k in range(18):
        cx = 100 + k * 100; cy = 600 + 50 * math.sin(k * 0.5 + t * 1.5) * math.sin(t * 0.7)
        ctx.new_path(); ctx.save(); ctx.translate(cx, cy); ctx.scale(1, 0.55 if k % 2 else 1); ctx.arc(0, 0, 46, 0, 6.3); ctx.restore()
        ctx.set_source_rgb(*PAL["dgrey"]); ctx.set_line_width(20); ctx.stroke_preserve(); ctx.set_source_rgb(*INK); ctx.set_line_width(4); ctx.stroke()

def ankle_iron(ctx, t, p):
    straw_floor(ctx, -200, seed=43)
    line(ctx, [(700, -100), (760, 640)], 120, PAL["brown"])
    ctx.new_path(); ctx.save(); ctx.translate(820, 700); ctx.scale(2.2, 1); ctx.arc(0, 0, 70, 0, 6.3); ctx.restore(); fill_stroke(ctx, SKIN, 6)
    clamp = seg(p, 0.25, 0.45)
    rrect(ctx, 650, 520 - (1 - clamp) * 200, 220, 70, 20); fill_stroke(ctx, PAL["dgrey"], 6)
    for k in range(8):
        ctx.new_path(); ctx.save(); ctx.translate(900 + k * 80, 560 + 20 * math.sin(k + t)); ctx.scale(1, 0.6 if k % 2 else 1); ctx.arc(0, 0, 26, 0, 6.3); ctx.restore()
        ctx.set_source_rgb(*INK); ctx.set_line_width(9); ctx.stroke()
    if clamp >= 1 and p < 0.75: text(ctx, "CLANK!", 1250, 330, 160, PAL["scarlet"], outline=PAL["white"], angle=-0.1)

def keeper_grin(ctx, t, p):
    cell(ctx, t, window=False, seed=44)
    KEEPER.draw(ctx, 820, 1250, t, "grin", arms=(150, -20), props=(None, "coin"), size=2.6)
    if p > 0.25: bubble(ctx, 1420, 330, "Lighter irons?\nCertainly...", 66, tail=(-160, 110))
    if p > 0.6: text(ctx, "...for a fee", 1420, 640, 90, PAL["gold"], outline=INK)

def hero_sits(ctx, t, p):
    cell(ctx, t, window=True, seed=45)
    HERO.draw(ctx, 860, 1080, t, "sad", arms=(110, 70), props=("chain", None), size=1.9)
    if p > 0.3: text(ctx, "Welcome to the", 1450, 360, 74, PAL["white"], outline=INK); text(ctx, "economy of prison", 1450, 460, 84, PAL["gold"], outline=INK)

# =================================================================== CHAPTER 3
def empty_bowl(ctx, t, p):
    straw_floor(ctx, -200, seed=46)
    ctx.new_path(); ctx.arc(960, 520, 300, 0, math.pi); ctx.close_path(); fill_stroke(ctx, PAL["wood"], 8)
    ctx.new_path(); ctx.save(); ctx.translate(960, 520); ctx.scale(1, 0.22); ctx.arc(0, 0, 300, 0, 6.3); ctx.restore(); fill_stroke(ctx, rgb("4a3020"), 8)
    if p > 0.3: text(ctx, "free meals?", 960, 200, 110, PAL["white"], outline=INK)
    if p > 0.6: text(ctx, "nope.", 960, 950, 120, PAL["scarlet"], outline=PAL["white"])

def keeper_ledger(ctx, t, p):
    cell(ctx, t, window=False, seed=47)
    table(ctx, 760, 820, 560)
    for k in range(5): circle(ctx, 620 + k * 60, 805, 22, rgb("c8ccd0"), 3)
    KEEPER.draw(ctx, 760, 900, t, "smug", arms=(150, 30), size=1.6)
    rrect(ctx, 1200, 180, 560, 640, 14); fill_stroke(ctx, rgb("f1e2bd"))
    text(ctx, "FEES", 1480, 270, 80, PAL["scarlet"])
    for k, item in enumerate(["coming in", "a bed", "lighter chains", "...even leaving"]):
        if p > 0.15 + k * 0.17:
            text(ctx, "- " + item, 1260, 380 + k * 100, 58, INK, align="left")

def bed_room(ctx, t, p):
    cell(ctx, t, window=True, seed=48)
    rrect(ctx, 300, 760, 700, 120, 14); fill_stroke(ctx, PAL["wood"]); rrect(ctx, 320, 700, 660, 80, 30); fill_stroke(ctx, PAL["straw"])
    rrect(ctx, 760, 520, 260, 130, 10); fill_stroke(ctx, PAL["cream"]); text(ctx, "BED", 890, 580, 50, PAL["scarlet"]); text(ctx, "pay first", 890, 630, 36, INK)
    line(ctx, [(890, 650), (890, 720)], 8, PAL["wood"])
    HERO.draw(ctx, 1450, 1080, t, "sad", look=(-1, 0), arms=(100, 80), size=1.8)

def old_book(ctx, t, p):
    ctx.set_source_rgb(*rgb("e9dcc0")); ctx.paint()
    rrect(ctx, 560, 160, 800, 760, 20); fill_stroke(ctx, rgb("6b2e2a"), 8)
    rrect(ctx, 600, 200, 720, 680, 14); fill_stroke(ctx, rgb("7a3a32"), 4)
    text(ctx, "Imprisonment in", 960, 420, 70, PAL["gold"]); text(ctx, "Medieval England", 960, 510, 76, PAL["gold"])
    text(ctx, "R. B. Pugh, 1968", 960, 700, 54, PAL["cream"])
    if p > 0.45:
        bubble(ctx, 1620, 300, "the fees WERE\nthe system", 54, tail=(-120, 90))

def hero_palm(ctx, t, p):
    cell(ctx, t, window=False, seed=49)
    HERO.draw(ctx, 820, 1250, t, "sad", look=(1, 1), arms=(150, -30), size=2.5)
    mx = 1180 + 220 * seg(p, 0.3, 1) + 20 * math.sin(t * 6); my = 560 - 260 * seg(p, 0.3, 1)
    if p > 0.3:
        for side in (-1, 1):
            ctx.new_path(); ctx.save(); ctx.translate(mx + side * 22, my); ctx.scale(1, 0.6 + 0.4 * abs(math.sin(t * 14))); ctx.arc(0, 0, 22, 0, 6.3); ctx.restore(); fill_stroke(ctx, rgb("c9b89a"), 3)
    text(ctx, "your money", 1450, 900, 70, PAL["white"], outline=INK)

def family_grate(ctx, t, p):
    sky(ctx); street(ctx, t, 900, seed=50)
    stone_wall(ctx, 980, -200, W + 200, H + 200, PAL["stone_d"], seed=51)
    rrect(ctx, 960, 380, 220, 300, 10); fill_stroke(ctx, rgb("1d1f23"))
    for k in range(1, 5): line(ctx, [(960 + k * 44, 380), (960 + k * 44, 680)], 9, PAL["dgrey"])
    WOMAN.draw(ctx, 640, 1080, t, "sad", arms=(110, -10), props=(None, "bread"), size=1.8)
    HERO.draw(ctx, 1500, 1080, t, "happy", arms=(195, 70), size=1.8)
    text(ctx, "if they can spare it", 560, 230, 74, PAL["white"], outline=INK)

def will_scribe(ctx, t, p):
    stone_wall(ctx, -200, -200, W + 200, 820, rgb("a29a8a"), seed=52); wood_floor(ctx, 820)
    table(ctx, 960, 760, 760)
    rrect(ctx, 760, 620, 420, 150, 10); fill_stroke(ctx, rgb("f1e2bd"))
    text(ctx, "for the prisoners", 970, 690, 40, INK); text(ctx, "of Newgate...", 970, 740, 40, INK)
    CLERK.draw(ctx, 560, 1000, t, "neutral", arms=(150, -5), props=(None, "quill"), size=1.6)
    prop(ctx, "candle", 1300, 760, t)
    text(ctx, "charity", 1500, 300, 110, PAL["gold"], outline=INK)

def baker(ctx, t, p):
    street(ctx, t, 760, seed=53)
    table(ctx, 960, 760, 900)
    for k in range(6): prop(ctx, "bread", 600 + k * 130, 760, t)
    line(ctx, [(1350, 760), (1350, 520)], 8); line(ctx, [(1230, 520 + 20 * math.sin(t * 2)), (1470, 520 - 20 * math.sin(t * 2))], 8)
    B = Char(body="cream", hat="cap", beard=rgb("6b4a2a"), seed=43)
    B.draw(ctx, 420, 1080, t, "scared", arms=(110, 70), sweat=True, shiver=0.5, size=1.7)
    CLERK.draw(ctx, 1600, 1080, t, "angry", arms=(200, -60), size=1.7)
    if p > 0.35: text(ctx, "SHORT WEIGHT!", 1000, 300, 120, PAL["scarlet"], outline=PAL["white"])
    text(ctx, "1316", 200, 160, 90, PAL["white"], outline=INK)

def bread_basket(ctx, t, p):
    cell(ctx, t, window=True, seed=54)
    GUARD.draw(ctx, 500 + p * 300, 1080, t, "neutral", walk=t * 2, arms=(60, 120), size=1.7)
    rrect(ctx, 560 + p * 300, 760, 260, 130, 30); fill_stroke(ctx, PAL["tan"])
    for k in range(4): prop(ctx, "bread", 600 + p * 300 + k * 60, 770, t)
    for k, c in enumerate([CROWD[0], OLD, CROWD[4]]):
        c.draw(ctx, 1250 + k * 230, 1060, t, "happy", arms=(200, -20), size=1.3)
    if p > 0.4: text(ctx, "dinner!", 1480, 360, 110, PAL["white"], outline=INK)

def grab_bread(ctx, t, p):
    cell(ctx, t, window=False, seed=55)
    tug = 25 * math.sin(t * 5)
    CROWD[3].draw(ctx, 600 + tug, 1080, t, "grimace", arms=(200, -10), size=1.9)
    CROWD[6].draw(ctx, 1320 + tug, 1080, t, "angry", arms=(200, -10), size=1.9)
    ctx.save(); ctx.translate(960 + tug, 640); ctx.scale(3, 3); prop(ctx, "bread", 0, 0, t); ctx.restore()
    text(ctx, "someone got caught cheating", W / 2, 220, 74, PAL["white"], outline=INK)

def hero_hungry(ctx, t, p):
    cell(ctx, t, window=False, seed=56)
    HERO.draw(ctx, W / 2, 1300, t, "sad", arms=(200, -20), size=2.8)
    if p > 0.3: text(ctx, "grrrowl", 1500, 600 + 6 * math.sin(t * 20), 110, PAL["white"], outline=INK, angle=0.1)

def empty_corner(ctx, t, p):
    cell(ctx, t, window=True, torch=False, seed=57, dim=0.1)
    ctx.new_path(); ctx.arc(1100, 900, 90, 0, math.pi); ctx.close_path(); fill_stroke(ctx, PAL["wood"])
    if p > 0.4: text(ctx, "no violence. no crime.", W / 2, 300, 80, PAL["white"], outline=INK)

# =================================================================== CHAPTER 4
def crowd_overhead(ctx, t, p):
    cell(ctx, t, window=True, seed=58)
    cast = (CROWD + [OLD, HERO, WOMAN]) * 2
    for k, c in enumerate(cast):
        row = k // 8; col = k % 8
        c.draw(ctx, 120 + col * 240 + (row % 2) * 110, 760 + row * 120, t, ["sad", "sick", "angry", "grimace"][(k * 7) % 4], arms=(120, 60), size=0.9)
    if p > 0.3: text(ctx, "+ more people", W / 2, 230, 110, PAL["scarlet"], outline=PAL["white"])

def water_bucket(ctx, t, p):
    cell(ctx, t, window=False, seed=59)
    bucket(ctx, W / 2, 1000, 3.2, rgb("6f5a35"))
    for k in range(4):
        y = 620 - ((t * 60 + k * 40) % 120)
        circle(ctx, W / 2 - 100 + k * 60, y, 10, rgb("8f7a50"), 2)
    if p > 0.3: text(ctx, "drinking water?", W / 2, 230, 110, PAL["white"], outline=INK)

def rat(ctx, t, p):
    straw_floor(ctx, -200, seed=60)
    _rat(ctx, 760 + 40 * math.sin(t * 1.5), 760, 3.0, t)
    for k in range(7):
        jx = 1200 + k * 90; jy = 700 - abs(math.sin(t * 6 + k)) * 140
        circle(ctx, jx, jy, 7, INK, 1)
    for k, w_ in enumerate(["Lice.", "Fleas.", "Rats."]):
        if p > k * 0.25: text(ctx, w_, 420 + k * 540, 250, 120, PAL["white"], outline=INK)

def coroner(ctx, t, p):
    cell(ctx, t, window=False, seed=61, dim=0.1)
    ctx.new_path(); ctx.move_to(500, 960); ctx.curve_to(600, 820, 1300, 820, 1420, 960); ctx.close_path(); fill_stroke(ctx, PAL["cream"])
    CLERK.draw(ctx, 380, 1060, t, "sad", arms=(150, -5), props=(None, "scroll"), size=1.5)
    CORONER = Char(body="navy", hat="coif", beard=rgb("9a9a96"), seed=44)
    CORONER.draw(ctx, 1600, 1060, t, "neutral", arms=(120, 60), props=(None, "candle"), size=1.5)
    text(ctx, "the coroner", 1600, 360, 70, PAL["white"], outline=INK)

def fellow_help(ctx, t, p):
    cell(ctx, t, window=True, seed=62)
    CROWD[1].draw(ctx, 820, 900, t, "sick", eyes="closed", tilt=-math.pi / 2, size=1.3, green=True, sweat=True)
    OLD.draw(ctx, 1350, 1070, t, "sad", arms=(200, 120), props=("cup", None), size=1.7)
    if p > 0.4: text(ctx, "gaol fever?", 900, 300, 100, PAL["white"], outline=INK)

def transfer(ctx, t, p):
    ctx.save(); ctx.translate(-p * 300, 0); street(ctx, t, 760, seed=63, ext=600); ctx.restore()
    for k, c in enumerate([CROWD[5], CROWD[2], OLD, CROWD[7]]):
        c.draw(ctx, 300 + k * 300 + p * 200, 1050, t, "sad", walk=t * 2 + k, props=(None, "chain"), size=1.2)
    GUARD.draw(ctx, 1550 + p * 200, 1050, t, "angry", walk=t * 2, props=(None, "staff"), size=1.3)
    rrect(ctx, 140, 160, 760, 120, 14); fill_stroke(ctx, PAL["cream"])
    text(ctx, "Ludgate  →  Newgate", 520, 245, 70, INK)

def candle_out(ctx, t, p):
    ctx.set_source_rgb(0.05, 0.05, 0.06); ctx.paint()
    rrect(ctx, 920, 600, 80, 220, 10); fill_stroke(ctx, PAL["cream"])
    for k in range(10):
        y = 590 - k * 40 - (t * 30) % 40
        ctx.new_path(); ctx.arc(960 + 20 * math.sin(t * 2 + k * 0.7), y, 10 + k * 2, 0, 6.3)
        ctx.set_source_rgba(0.8, 0.8, 0.8, max(0, 0.5 - k * 0.05)); ctx.fill()

def rebuild(ctx, t, p):
    sky(ctx); clouds(ctx, t, 8); ground(ctx, 820, seed=10)
    gatehouse(ctx, W / 2, 820, 0.95, t)
    for k in range(4):
        line(ctx, [(560 + k * 270, 820), (560 + k * 270, 250)], 10, PAL["wood"])
    for y in (330, 520, 700): line(ctx, [(540, y), (1400, y)], 10, PAL["wood"])
    for k, x in enumerate((700, 1200)):
        M = Char(body="tan", hat="cap", seed=50 + k)
        M.draw(ctx, x, 700 if k else 520, t, "happy", arms=(200 + 40 * math.sin(t * 8 + k), -10), props=(None, "staff"), size=0.7)
    text(ctx, "paid for by Dick Whittington", W / 2, 960, 74, PAL["white"], outline=INK)
    # his legendary cat
    cx = 1620; circle(ctx, cx, 990, 40, rgb("e09040")); circle(ctx, cx + 40, 950, 28, rgb("e09040"))
    for s_ in (-1, 1): ctx.new_path(); ctx.move_to(cx + 40 + s_ * 18, 930); ctx.line_to(cx + 40 + s_ * 26, 905); ctx.line_to(cx + 40 + s_ * 6, 925); ctx.close_path(); fill_stroke(ctx, rgb("e09040"), 3)
    line(ctx, [(cx - 40, 990), (cx - 80, 960 + 10 * math.sin(t * 4))], 8, rgb("e09040"))
    text(ctx, "(yes, that one)", cx, 870, 44, PAL["white"], outline=INK)

# =================================================================== CHAPTER 5
def dungeon_pit(ctx, t, p):
    ctx.set_source_rgb(*PAL["stone"]); ctx.paint()
    for k in range(12, 0, -1):
        g = 0.12 + k * 0.04
        ctx.new_path(); ctx.arc(960, 540, k * 40, 0, 6.3); ctx.set_source_rgb(g, g, g * 1.05); ctx.fill_preserve(); ctx.set_source_rgb(*INK); ctx.set_line_width(3); ctx.stroke()
    HERO.draw(ctx, 960, 580, t, "sad", look=(0, -1), size=0.25)
    if p > 0.3: text(ctx, "sometimes...", 960, 180, 100, PAL["white"], outline=INK)
    if p > 0.65: text(ctx, "usually NOT", 960, 960, 110, PAL["scarlet"], outline=PAL["white"])

def lock_key(ctx, t, p):
    ctx.set_source_rgb(*PAL["wood"]); ctx.paint()
    for k in range(8): line(ctx, [(k * 250, -50), (k * 250, H + 50)], 6, PAL["wood_d"])
    rrect(ctx, 660, 300, 600, 480, 40); fill_stroke(ctx, PAL["dgrey"], 8)
    circle(ctx, 960, 470, 60, rgb("1d1f23")); rrect(ctx, 935, 480, 50, 120, 12); fill_stroke(ctx, rgb("1d1f23"))
    a = seg(p, 0.3, 0.7) * math.pi / 2
    ctx.save(); ctx.translate(960, 520); ctx.rotate(a)
    line(ctx, [(0, 0), (520, 0)], 30, PAL["gold"]); ctx.new_path(); ctx.arc(600, 0, 80, 0, 6.3); ctx.set_source_rgb(*PAL["gold"]); ctx.set_line_width(30); ctx.stroke()
    ctx.restore()
    if p > 0.7: text(ctx, "click.", 1450, 900, 120, PAL["white"], outline=INK)

def york_castle(ctx, t, p):
    sky(ctx); clouds(ctx, t, 11); birds(ctx, t, 3, 7)
    ctx.new_path(); ctx.move_to(-200, 1100); ctx.curve_to(400, 860, 1500, 860, 2200, 1100); ctx.close_path(); fill_stroke(ctx, rgb("7d9a5a"))
    ctx.new_path(); ctx.move_to(560, 860); ctx.curve_to(760, 560, 1160, 560, 1360, 860); ctx.close_path(); fill_stroke(ctx, rgb("8fae66"))
    castle_keep(ctx, 960, 650, 0.6, turrets=4)
    for k in range(4): house(ctx, 60 + k * 250 + (900 if k > 1 else 0), 1000, 180, 260, seed=k * 0.21, t=t)

def town_gate(ctx, t, p):
    street(ctx, t, 820, seed=64)
    gatehouse(ctx, W / 2, 820, 0.7, t)
    CROWD[0].draw(ctx, 960, 470, t, "sad", size=0.45)
    if p > 0.3: text(ctx, "town gatehouse = town prison", W / 2, 960, 74, PAL["white"], outline=INK)

def tower(ctx, t, p):
    sky(ctx); clouds(ctx, t, 12); birds(ctx, t, 4, 9)
    ctx.rectangle(-200, 820, W + 400, 400); fill_stroke(ctx, rgb("7fa7bd"))
    for k in range(8): line(ctx, [(80 + k * 250 + (t * 25) % 250, 900), (150 + k * 250 + (t * 25) % 250, 900)], 4, PAL["white"])
    ctx.rectangle(200, 700, 1520, 130); fill_stroke(ctx, rgb("c9c3b4"))
    castle_keep(ctx, 960, 720, 0.95)

def stocks(ctx, t, p):
    sky(ctx); clouds(ctx, t, 13); ground(ctx, 780, col=rgb("7d9a5a"), puddles=False, seed=14)
    for k in range(3): house(ctx, -40 + k * 700, 780, 240, 300, roof=rgb("c9a46b"), seed=k * 0.3, t=t)
    CROWD[2].draw(ctx, 960, 1000, t, "sad", arms=(120, 60), size=1.6)
    rrect(ctx, 700, 900, 520, 90, 10); fill_stroke(ctx, PAL["wood"])
    for x in (720, 1200): line(ctx, [(x, 990), (x, 1080)], 18, PAL["wood_d"])
    for x in (880, 1040): circle(ctx, x, 945, 26, PAL["black"])
    for k, x in enumerate((300, 1600)):
        CROWD[4 + k].draw(ctx, x, 1060, t, "grin", arms=(200, -30), size=1.3)
    if p > 0.4: bubble(ctx, 960, 230, "I only asked\nfor a raise!", 60, tail=(0, 90))

def keys_hook(ctx, t, p):
    stone_wall(ctx, -200, -200, W + 200, H + 200, PAL["stone"], seed=65)
    line(ctx, [(960, 260), (960, 330)], 16, PAL["dgrey"])
    ctx.save(); ctx.translate(960, 340); ctx.rotate(0.15 * math.sin(t * 2.4)); ctx.scale(4, 4); prop(ctx, "keys", 0, 0, t); ctx.restore()
    text(ctx, "different places, different rules", W / 2, 960, 74, PAL["white"], outline=INK)

# =================================================================== CHAPTER 6
def hero_eyes(ctx, t, p):
    cell(ctx, t, window=False, seed=66)
    HERO.draw(ctx, W / 2, 1450, t, "determined", look=(1, -1), size=3.2)
    if p > 0.35:
        circle(ctx, 1450, 260, 70, rgb("f6e27a")); line(ctx, [(1420, 330), (1480, 330)], 10); line(ctx, [(1425, 355), (1475, 355)], 10)
        for k in range(8):
            a = k / 8 * 2 * math.pi; line(ctx, [(1450 + 95 * math.cos(a), 260 + 95 * math.sin(a)), (1450 + 130 * math.cos(a), 260 + 130 * math.sin(a))], 6, rgb("f6c445"))
    text(ctx, "ESCAPE", 420, 300, 140, PAL["scarlet"], outline=PAL["white"])

def tower_night(ctx, t, p):
    night_sky(ctx, t)
    ctx.rectangle(-200, 860, W + 400, 300); fill_stroke(ctx, rgb("2b3e5a"))
    castle_keep(ctx, 960, 870, 0.95, night=True)
    for x in (560, 1360): flame(ctx, x, 380, 0.8, t)

def feast(ctx, t, p):
    stone_wall(ctx, -200, -200, W + 200, 820, rgb("a29a8a"), seed=67); wood_floor(ctx, 820)
    BISHOP = Char(body=rgb("7a2f6a"), hat="mitre", body_w=1.25, seed=60)
    BISHOP.draw(ctx, 960, 1000, t, "grin", arms=(250, 300), props=(None, "cup"), size=1.6)
    table(ctx, 960, 820, 1500)
    for k in range(4): prop(ctx, "jug", 500 + k * 300, 820, t)
    for k, x in enumerate((360, 1560)):
        G = Char(body=rgb("8f9aa0"), hat="kettle", seed=61 + k)
        G.draw(ctx, x, 1000, t, "happy", eyes="closed", arms=(260, 290), props=(None, "cup"), tilt=0.12 * math.sin(t * 1.5 + k), size=1.5)
        text(ctx, "hic!", x + 120, 420 + 10 * math.sin(t * 3 + k), 64, PAL["white"], outline=INK)
    text(ctx, "1101", 180, 140, 80, PAL["white"], outline=INK)

def wine_jug(ctx, t, p):
    ctx.set_source_rgb(*rgb("9a6b43")); ctx.paint()
    ctx.save(); ctx.translate(960, 700); ctx.scale(6, 6); prop(ctx, "jug", 0, 0, t); ctx.restore()
    pk = seg(p, 0.2, 0.6)
    line(ctx, [(960, 400 - pk * 120), (1000, 260 - pk * 160), (1080, 200 - pk * 140)], 22, PAL["tan"])
    if p > 0.5: text(ctx, "smuggled rope!", 1400, 300, 90, PAL["white"], outline=INK); arrow(ctx, 1300, 330, 1120, 260, PAL["white"])

def rope_wall(ctx, t, p):
    night_sky(ctx, t)
    ctx.rectangle(600, -200, 700, H + 400); fill_stroke(ctx, rgb("6d7488"))
    rrect(ctx, 880, 120, 140, 200, 60); fill_stroke(ctx, rgb("f6c445"))
    line(ctx, [(950, 300), (955, 1100)], 10, PAL["tan"])
    BISHOP = Char(body=rgb("7a2f6a"), hat="mitre", body_w=1.25, seed=60)
    BISHOP.draw(ctx, 950, 420 + p * 520, t, "grin", arms=(280, 260), size=0.9)

def sheet_rope(ctx, t, p):
    night_sky(ctx, t)
    ctx.rectangle(500, -200, 900, H + 400); fill_stroke(ctx, rgb("6d7488"))
    rrect(ctx, 840, 120, 220, 240, 80); fill_stroke(ctx, rgb("f6c445"))
    for k in range(9):
        y = 330 + k * 85; x = 950 + 12 * math.sin(t * 2 + k * 0.6)
        rrect(ctx, x - 26, y, 52, 80, 10); fill_stroke(ctx, [PAL["white"], rgb("d8c9a8"), PAL["scarlet"]][k % 3], 4)
        line(ctx, [(x - 30, y + 80), (x + 30, y + 80)], 8)
    G = Char(body="green", hair=rgb("4a3020"), beard=rgb("4a3020"), body_w=1.55, seed=62)
    G.draw(ctx, 950, 460 + p * 260, t, "grimace", arms=(280, 260), size=1.0, sweat=True)
    text(ctx, "1244", 200, 150, 80, PAL["white"], outline=INK)
    if p > 0.5: text(ctx, "sheets, hangings, tablecloths...", 960, 1000, 64, PAL["white"], outline=INK)

def kitchen(ctx, t, p):
    stone_wall(ctx, -200, -200, W + 200, 820, rgb("8e8577"), seed=68); wood_floor(ctx, 820)
    ctx.new_path(); ctx.move_to(1250, 820); ctx.line_to(1250, 450); ctx.arc(1500, 450, 250, math.pi, 0); ctx.line_to(1750, 820); ctx.close_path(); fill_stroke(ctx, rgb("1d1f23"))
    glow(ctx, 1500, 720, 300, a=0.4); flame(ctx, 1500, 760, 2.0, t)
    COOK = Char(body="cream", hat="cap", body_w=1.3, seed=63)
    COOK.draw(ctx, 1100, 1040, t, "neutral", eyes="closed", tilt=0.3, size=1.3)
    text(ctx, "zzz", 1180, 600 - (t * 30) % 60, 70, PAL["white"], outline=INK)
    for k in range(2):
        S = Char(body="black", hat="hood", seed=64 + k)
        S.draw(ctx, 200 + p * 500 + k * 220, 1040, t, "determined", walk=t * 1.2, size=1.3)
    text(ctx, "1323", 180, 140, 80, PAL["white"], outline=INK)
    text(ctx, "shhh...", 450 + p * 500, 400, 70, PAL["white"], outline=INK)

def boat(ctx, t, p):
    night_sky(ctx, t)
    castle_keep(ctx, 500, 620, 0.6, night=True)
    ctx.rectangle(-200, 620, W + 400, 600); fill_stroke(ctx, rgb("2b3e5a"))
    for k in range(10): line(ctx, [(60 + k * 200 + (t * 30) % 200, 700 + (k % 3) * 120), (130 + k * 200 + (t * 30) % 200, 700 + (k % 3) * 120)], 4, rgb("6d88aa"))
    bx = 800 + p * 600; by = 860 + 8 * math.sin(t * 2)
    ctx.new_path(); ctx.move_to(bx - 200, by); ctx.line_to(bx + 200, by); ctx.line_to(bx + 150, by + 70); ctx.line_to(bx - 150, by + 70); ctx.close_path(); fill_stroke(ctx, PAL["wood"])
    MORT = Char(body="black", hat="hood", seed=65)
    MORT.draw(ctx, bx, by + 10, t, "happy", arms=(160 + 30 * math.sin(t * 3), 20 + 30 * math.sin(t * 3)), size=0.9)
    if p > 0.5: text(ctx, "4 years later: he helps overthrow the king", W / 2, 1010, 56, PAL["white"], outline=INK)

def breakout(ctx, t, p):
    street(ctx, t, 760, seed=69)
    for k, c in enumerate([CROWD[3], CROWD[6], CROWD[7], CROWD[1]]):
        c.draw(ctx, 200 + k * 280 + p * 600, 1060, t, "shock" if k % 2 else "grin", walk=t * 3.5 + k, arms=(140, 40), props=(None, "chain"), size=1.3)
    text(ctx, "NEWGATE, 1325", 1550, 200, 80, PAL["white"], outline=INK)
    text(ctx, "RUN!", 1500, 380, 150, PAL["scarlet"], outline=PAL["white"], angle=-0.1)

def sanctuary(ctx, t, p):
    sky(ctx); clouds(ctx, t, 15); ground(ctx, 860, seed=16)
    ctx.rectangle(560, 260, 800, 600); fill_stroke(ctx, PAL["stone"])
    ctx.new_path(); ctx.move_to(520, 270); ctx.line_to(960, 40); ctx.line_to(1400, 270); ctx.close_path(); fill_stroke(ctx, PAL["dgrey"])
    line(ctx, [(960, 40), (960, -80)], 10); line(ctx, [(920, -40), (1000, -40)], 10)
    ctx.new_path(); ctx.move_to(860, 860); ctx.line_to(860, 620); ctx.arc(960, 620, 100, math.pi, 0); ctx.line_to(1060, 860); ctx.close_path(); fill_stroke(ctx, PAL["wood"])
    PRIEST = Char(body="black", hat=None, bald=True, seed=66)
    PRIEST.draw(ctx, 960, 900, t, "neutral", arms=(120, 60), size=0.9)
    for k, c in enumerate([CROWD[3], CROWD[6], CROWD[7]]):
        c.draw(ctx, 560 + k * 400, 1080, t, "happy", arms=(250, 290), size=1.3)
    text(ctx, "SANCTUARY!", 960, 1000, 100, PAL["gold"], outline=INK)

def hero_window(ctx, t, p):
    cell(ctx, t, window=True, seed=70)
    HERO.draw(ctx, 860, 1080, t, "sad", look=(1, -1), arms=(110, 70), size=1.9)
    rrect(ctx, 1160, 600, 600, 300, 14); fill_stroke(ctx, PAL["cream"])
    text(ctx, "Famous escapers had:", 1460, 670, 50, INK)
    for k, item in enumerate(["friends", "money", "help inside"]):
        if p > 0.2 + k * 0.2: text(ctx, "✓ " + item, 1460, 740 + k * 55, 50, PAL["green"])

def wall_ring(ctx, t, p):
    stone_wall(ctx, -200, -200, W + 200, 820, PAL["stone"], seed=71); straw_floor(ctx, 820)
    circle(ctx, 360, 520, 60, PAL["dgrey"], 6); ctx.new_path(); ctx.arc(360, 520, 30, 0, 6.3); ctx.set_source_rgb(*PAL["stone"]); ctx.fill()
    tug = 18 * abs(math.sin(t * 3))
    pts = [(360 + k * 70, 560 + 40 * math.sin(k / 7 * math.pi) * (1 - tug / 40)) for k in range(12)]
    line(ctx, pts, 12, PAL["dgrey"])
    HERO.draw(ctx, 1300 + tug, 1080, t, "grimace", arms=(190, 170), sweat=True, size=1.9)
    text(ctx, "stone wall + iron ring", 1300, 230, 80, PAL["white"], outline=INK)

def keeper_keys(ctx, t, p):
    cell(ctx, t, window=False, seed=72)
    KEEPER.draw(ctx, 820, 1250, t, "smug", arms=(150, -70), props=(None, "keys"), size=2.5)
    if p > 0.35: text(ctx, "he gets fined", 1450, 380, 80, PAL["white"], outline=INK); text(ctx, "if you escape", 1450, 480, 80, PAL["white"], outline=INK)

# =================================================================== CHAPTER 7
def hero_waiting(ctx, t, p):
    cell(ctx, t, window=True, torch=False, seed=73)
    HERO.draw(ctx, 760, 1080, t, "neutral", arms=(110, 70), size=1.9)
    n = int(3 + p * 20)
    for k in range(n):
        gx = 1150 + (k % 5) * 28 + (k // 5) * 160
        if k % 5 == 4: line(ctx, [(gx - 120, 560), (gx, 500)], 6, PAL["white"])
        else: line(ctx, [(gx, 490), (gx, 570)], 6, PAL["white"])
    if CUR["seg"] == "s73" and p > 0.4: bubble(ctx, 1000, 260, "the trial will be soon...\nright?", 56, tail=(-120, 100))

def justices(ctx, t, p):
    ctx.save(); ctx.translate(-p * 250, 0); street(ctx, t, 760, seed=74, ext=600); ctx.restore()
    for k, x in enumerate((620, 1250)):
        horse(ctx, x, 1060, t, 1.0, PAL["wood"] if k else rgb("5a4030"), walk=t * 2)
        J = Char(body="scarlet", hat="white_coif", beard=PAL["white"] if k else None, seed=70 + k)
        J.draw(ctx, x + 10, 900, t, "neutral", arms=(80, 100), size=0.95)
    text(ctx, "the king's justices", 960, 200, 90, PAL["white"], outline=INK)

def court_empty(ctx, t, p):
    court_bg(ctx, t); bench(ctx, 960, 760, 900)
    tx = -200 + ((t * 260) % (W + 400)); a = t * 4
    ctx.save(); ctx.translate(tx, 940); ctx.rotate(a)
    for k in range(6): ctx.new_path(); ctx.arc(0, 0, 30 + k * 10, k, k + 3); ctx.set_source_rgb(*rgb("a08050")); ctx.set_line_width(5); ctx.stroke()
    ctx.restore()
    text(ctx, "adjourned.", 960, 230, 120, PAL["scarlet"], outline=PAL["white"])

def clerk(ctx, t, p):
    court_bg(ctx, t)
    CLERK.draw(ctx, 820, 1080, t, "neutral", arms=(250, 300), size=2.0, talk=True)
    for k, w_ in enumerate(["accuser didn't show", "witness missing", "come back later"]):
        if p > 0.15 + k * 0.25: text(ctx, w_, 1450, 380 + k * 120, 64, PAL["white"], outline=INK)

def approver(ctx, t, p):
    cell(ctx, t, window=False, seed=75)
    CROWD[6].draw(ctx, 560, 1080, t, "smug", arms=(200, -60), size=1.8, talk=True)
    CLERK.draw(ctx, 1300, 1080, t, "neutral", arms=(150, 20), props=(None, "quill"), size=1.8)
    L = 200 + p * 650
    rrect(ctx, 1450, 400, 220, L, 10); fill_stroke(ctx, PAL["cream"])
    for k in range(int(L / 40)): line(ctx, [(1480, 440 + k * 40), (1640, 440 + k * 40)], 4)
    text(ctx, "approver", 560, 330, 80, PAL["white"], outline=INK)

def court_wide(ctx, t, p):
    court_bg(ctx, t); bench(ctx, 960, 700, 900)
    for k, x in enumerate((760, 960, 1160)):
        J = Char(body="scarlet", hat="white_coif", seed=72 + k)
        J.draw(ctx, x, 620, t, "neutral", size=0.75)
    HERO.draw(ctx, 960, 1080, t, "scared", arms=(110, 70), props=("chain", "chain"), shiver=0.4, size=1.2)
    for k, c in enumerate(CROWD[:4]):
        c.draw(ctx, 200 + k * 170 + (900 if k > 1 else 0), 1080, t, "neutral", look=(0, -1), size=1.0)

def jury(ctx, t, p):
    court_bg(ctx, t)
    for row in range(2):
        for k in range(6):
            c = CROWD[(k + row * 3) % len(CROWD)]
            c.draw(ctx, 330 + k * 250 + row * 60, 820 + row * 230, t, ["neutral", "smug", "sad"][(k + row) % 3], size=0.95)
        rrect(ctx, 150, 810 + row * 230, 1620, 40, 8); fill_stroke(ctx, PAL["wood"])
    text(ctx, "12 jurors", 960, 200, 100, PAL["white"], outline=INK)
    if p > 0.5: text(ctx, "...but only if you agree", 960, 330, 74, PAL["scarlet"], outline=PAL["white"])

def mute_cell(ctx, t, p):
    cell(ctx, t, window=False, seed=76, dim=0.45)
    HERO.draw(ctx, 960, 1080, t, "neutral", arms=(110, 70), size=1.8)
    ctx.save(); ctx.translate(560, 980); ctx.scale(2, 2); prop(ctx, "bread", 0, 0, t); ctx.restore()
    ctx.save(); ctx.translate(1360, 1000); ctx.scale(2, 2); prop(ctx, "cup", 0, 0, t); ctx.restore()
    text(ctx, "prison forte et dure", 960, 230, 100, PAL["scarlet"], outline=PAL["white"])

def cecily(ctx, t, p):
    cell(ctx, t, window=True, torch=False, seed=77, dim=0.2)
    C = Char(body=rgb("8a8f96"), hat="veil", seed=80)
    C.draw(ctx, 860, 1080, t, "sad", eyes="closed", arms=(260, 280), size=1.8)
    prop(ctx, "candle", 1260, 1000, t)
    day = 1 + int(39 * seg(p, 0.1, 0.9))
    rrect(ctx, 1300, 230, 420, 200, 16); fill_stroke(ctx, PAL["cream"])
    text(ctx, f"Day {day}", 1510, 340, 100, PAL["scarlet"])
    text(ctx, "no food, no drink (reportedly)", 1510, 410, 34, INK)

def hero_back_light(ctx, t, p):
    cell(ctx, t, window=True, torch=False, seed=78)
    HERO.draw(ctx, 1150, 1080, t, "neutral", look=(1, -1), arms=(110, 70), size=1.9)
    if p > 0.3: text(ctx, "Would YOU survive?", 600, 300, 110, PAL["white"], outline=INK)

def empty_purse(ctx, t, p):
    straw_floor(ctx, -200, seed=79)
    ctx.new_path(); ctx.move_to(700, 500); ctx.curve_to(600, 900, 1320, 900, 1220, 500); ctx.close_path(); fill_stroke(ctx, PAL["wood"], 8)
    mx, my = 960 + 30 * math.sin(t * 5), 420 - 200 * p
    for side in (-1, 1):
        ctx.new_path(); ctx.save(); ctx.translate(mx + side * 24, my); ctx.scale(1, 0.6 + 0.4 * abs(math.sin(t * 14))); ctx.arc(0, 0, 24, 0, 6.3); ctx.restore(); fill_stroke(ctx, rgb("c9b89a"), 3)
    text(ctx, "no money", 960, 980, 100, PAL["white"], outline=INK)

def open_ring(ctx, t, p):
    straw_floor(ctx, -200, seed=80)
    ctx.new_path(); ctx.arc(960, 560, 180, 0.3, 2 * math.pi - 0.6); ctx.set_source_rgb(*PAL["dgrey"]); ctx.set_line_width(46); ctx.stroke()
    if p > 0.3: text(ctx, "never convicted", 960, 230, 110, PAL["white"], outline=INK)

def castle_banners(ctx, t, p):
    sky(ctx, rgb("f2c48a"), rgb("fbe6c4")); clouds(ctx, t, 17)
    ctx.new_path(); ctx.move_to(-200, 1100); ctx.curve_to(400, 760, 1500, 760, 2200, 1100); ctx.close_path(); fill_stroke(ctx, rgb("8fae66"))
    castle_keep(ctx, 960, 780, 0.8)
    for k, x in enumerate((640, 960, 1280)):
        line(ctx, [(x, 230), (x, 60)], 8)
        wv = [(x, 70), (x + 60, 80 + 14 * math.sin(t * 4 + k)), (x + 120, 70 + 10 * math.sin(t * 4 + k + 1)), (x + 120, 130), (x + 60, 140 + 14 * math.sin(t * 4 + k)), (x, 130)]
        ctx.new_path(); ctx.move_to(*wv[0])
        for q in wv[1:]: ctx.line_to(*q)
        ctx.close_path(); fill_stroke(ctx, [PAL["scarlet"], PAL["blue"], PAL["gold"]][k], 4)
    for k in range(3):
        hx = 300 + k * 260 + p * 200
        horse(ctx, hx, 1070, t, 0.6, walk=t * 2)
        Char(body=[PAL["scarlet"], PAL["blue"], PAL["gold"]][k], hat="kettle", seed=90 + k).draw(ctx, hx + 5, 975, t, "happy", arms=(80, 100), size=0.45)
    text(ctx, "how we picture it", 1500, 1000, 70, PAL["white"], outline=INK)

def door_ajar(ctx, t, p):
    ctx.set_source_rgb(0.06, 0.06, 0.07); ctx.paint()
    z = 1.3 - 0.4 * p
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2)
    ctx.rectangle(560, 140, 800, 860); ctx.clip()
    cell(ctx, t, window=False, seed=81, dim=0.35)
    HERO.draw(ctx, 960, 980, t, "sad", arms=(110, 70), size=1.0)
    ctx.restore()
    ctx.rectangle(-200, -200, W + 400, H + 400); ctx.set_source_rgba(0, 0, 0, 0.6 * p); ctx.fill()

# =================================================================== cards / map / end
import cairo as _cairo
from cards import PLACES, THAMES, WALL, proj

CARDS = {
    "bracton": ("A RULE FROM ROMAN LAW", "Prison is for confining people, not for punishing them.", "Roman maxim (Digest 48.19.8.9), repeated in the 13th-century English treatise 'Bracton'", True),
    "acton": ("THE LAW ON DEBTORS", "...the Creditor shall find him bread and water, to the end that he die not in prison for default of sustenance.", "Statute of Acton Burnell, 1283", True),
    "bread1316": ("CONFISCATED BREAD, 1316", "...it was adjudged that her bread should be forfeited, and given to the prisoners in Neugate.", "City of London Letter-Book D (trans. H. T. Riley, 1868)", True),
    "grene": ("CORONER'S ROLL, MAY 1322", "...died of starvation in the said prison and of no felony.", "Inquest on Thomas atte Grene, Newgate. City of London Coroners' Rolls (ed. R. R. Sharpe, 1913)", True),
    "rightful": ("CORONER'S ROLL", "...died in the prison of Neugate his rightful death... The corpse viewed, on which no hurt appeared.", "City of London Coroners' Rolls, 1300-1378 (ed. R. R. Sharpe, 1913)", True),
    "fetid": ("CITY OF LONDON, 1419", "...by reason of the fetid and corrupt atmosphere that is in the hateful gaol of Neugate, many persons... are now dead, who might have been living...", "Ordinance re-establishing Ludgate, 2 Nov 1419. Letter-Book I (trans. H. T. Riley, 1868)", True),
    "labourers": ("AFTER THE BLACK DEATH", "Every town must make stocks, to punish labourers who break the new wage laws.", "Summary of the Statute of Labourers, 1351", False),
    "statute1330": ("GAOL DELIVERY, 1330", "...deliver the Gaols at least three times a year, and more often if need be.", "Statute of 4 Edward III", True),
    "magna": ("MAGNA CARTA, 1215", "To no one will we sell, to no one deny or delay right or justice.", "Clause 40 (British Library translation)", True),
    "ratelere": ("CORONER'S ROLL, JULY 1322", "John le Ratelere, who had been attached for cutting off the purse of John de Pelham, died in the prison of Neugate... no hurt appeared.", "City of London Coroners' Rolls (ed. R. R. Sharpe, 1913)", True),
    "pardon": ("BY THE KING, 1357", "Cecily, wife of John de Rygeway, pardoned by Edward III after remaining mute and fasting in Nottingham gaol for forty days.", "Summary of the royal pardon, Calendar of Patent Rolls", False),
}

def _card(name):
    def f(ctx, t, p):
        h, q, src, quoted = CARDS[name]
        scroll_card(ctx, t, p, h, q, src, quoted)
        HERO.draw(ctx, 1760, 1120, t, "shock" if name in ("grene", "ratelere", "fetid") else "neutral", look=(-1, -1), size=1.1)
    return f
for _n in CARDS: globals()["card_" + _n] = _card(_n)

def card_roll_pages(ctx, t, p):
    ctx.set_source_rgb(*rgb("2b2622")); ctx.paint()
    for k in range(6):
        x = 80 + k * 300; y = 120 + (k % 2) * 60 - ((t * 40 + k * 80) % 120)
        ctx.save(); ctx.translate(x + 120, y + 420); ctx.rotate((k - 2.5) * 0.04); ctx.translate(-x - 120, -y - 420)
        rrect(ctx, x, y, 260, 880, 14); fill_stroke(ctx, rgb("f1e2bd"))
        for j in range(9):
            text(ctx, "rightful death", x + 130, y + 90 + j * 90, 34, INK)
        ctx.restore()
    text(ctx, "page after page", W / 2, H - 90, 100, PAL["white"], outline=INK)

_paris_img = None
def card_paris(ctx, t, p):
    global _paris_img
    if _paris_img is None: _paris_img = _cairo.ImageSurface.create_from_png("build/paris.png")
    stone_wall(ctx, -200, -200, W + 200, H + 200, PAL["stone_d"], seed=40); ctx.set_source_rgba(0, 0, 0, 0.35); ctx.paint()
    iw, ih = _paris_img.get_width(), _paris_img.get_height(); sc = 860 / ih
    x0, y0 = 360, 110
    rrect(ctx, x0 - 30, y0 - 30, iw * sc + 60, ih * sc + 60, 16); fill_stroke(ctx, PAL["wood"], 6)
    ctx.save(); ctx.translate(x0, y0); ctx.scale(sc, sc); ctx.set_source_surface(_paris_img, 0, 0); ctx.paint(); ctx.restore()
    text(ctx, "drawn by Matthew Paris", 1320, 380, 70, PAL["white"], outline=INK)
    text(ctx, "in the 1200s!", 1320, 470, 70, PAL["white"], outline=INK)
    arrow(ctx, 1080, 520, 780, 640, PAL["scarlet"])
    text(ctx, "Parker Library MS 16, Corpus Christi College, Cambridge", 1320, 980, 34, PAL["white"])
    if p > 0.2: text(ctx, "SNAP", 1350, 760, 130, PAL["scarlet"], outline=PAL["white"], angle=-0.1)

def card_map(ctx, t, p):
    ctx.set_source_rgb(*rgb("f1e2bd")); ctx.paint()
    pts = [proj(*q, W, H) for q in THAMES]
    ctx.move_to(*pts[0])
    for q in pts[1:]: ctx.line_to(*q)
    ctx.set_source_rgb(*INK); ctx.set_line_width(84); ctx.set_line_join(1); ctx.stroke()
    ctx.move_to(*pts[0])
    for q in pts[1:]: ctx.line_to(*q)
    ctx.set_source_rgb(*rgb("8fc0dc")); ctx.set_line_width(72); ctx.stroke()
    wall = [proj(*q, W, H) for q in WALL]; line(ctx, wall, 10, PAL["wood_d"])
    text(ctx, "THE CITY", *proj(-0.090, 51.5150, W, H), 80, rgb("b8a07a"))
    text(ctx, "Southwark", *proj(-0.0905, 51.4990, W, H), 60, rgb("b8a07a"))
    text(ctx, "London's prisons", 40, 90, 80, PAL["scarlet"], align="left")
    for i, (name, lon, lat, side) in enumerate(PLACES):
        a = seg(p, 0.05 + i * 0.1, 0.15 + i * 0.1)
        if a <= 0: continue
        x, y = proj(lon, lat, W, H)
        circle(ctx, x, y, 12 + 10 * (1 - a) + 3 * math.sin(t * 4 + i), PAL["scarlet"], 4)
        label = name.title().replace("'S", "'s")
        text(ctx, label, x + (30 if side == "r" else -30), y + 16, 52, INK, align="left" if side == "r" else "right")

def card_five_words(ctx, t, p):
    ctx.set_source_rgb(*rgb("2b2622")); ctx.paint()
    words = [("Poverty", PAL["gold"]), ("Hunger", PAL["white"]), ("Disease", rgb("9fd08a")), ("Crowds", PAL["white"]), ("Uncertainty", PAL["scarlet"])]
    for k, (w_, col) in enumerate(words):
        a = seg(p, k * 0.17, k * 0.17 + 0.08)
        if a > 0: text(ctx, w_, W / 2, 260 + k * 165, 120 * (0.7 + 0.3 * a), col, outline=INK)

def card_end(ctx, t, p):
    cell(ctx, t, window=True, seed=90)
    ctx.set_source_rgba(0, 0, 0, 0.4); ctx.paint()
    text(ctx, "Why You Wouldn't Survive", 760, 330, 100, PAL["white"], outline=INK)
    text(ctx, "a Medieval Prison", 760, 470, 130, PAL["scarlet"], outline=PAL["white"])
    pulse = 1 + 0.05 * math.sin(t * 5)
    ctx.save(); ctx.translate(760, 700); ctx.scale(pulse, pulse)
    rrect(ctx, -260, -70, 520, 140, 40); fill_stroke(ctx, PAL["scarlet"], 6); text(ctx, "SUBSCRIBE", 0, 28, 80, PAL["white"])
    ctx.restore()
    HERO.draw(ctx, 1500, 1080, t, "happy", arms=(110, -60 + 25 * math.sin(t * 6)), size=1.8)

SCENES = {k: v for k, v in globals().items() if callable(v) and getattr(v, "__module__", None) == __name__ and not k.startswith("_") and k not in ("ease", "seg")}
