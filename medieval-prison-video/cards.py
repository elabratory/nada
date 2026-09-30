"""Procedural document cards (parchment quotes with sources), the London prisons map, and end screen.
Writes build/cards/<name>.jpg at 2880x1620 (the renderer treats them like stills)."""
import os, math, numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont, ImageFilter

CW, CH = 2880, 1620
F = "assets/fonts/"
INK = (52, 34, 20)
RED = (128, 30, 22)

def fnt(name, size, axes=None):
    f = ImageFont.truetype(F + name, size)
    if axes: f.set_variation_by_axes(axes)
    return f

def noise(shape, scale, seed):
    r = np.random.default_rng(seed)
    small = r.random((max(2, shape[0] // scale), max(2, shape[1] // scale))).astype(np.float32)
    return cv2.resize(small, (shape[1], shape[0]), interpolation=cv2.INTER_CUBIC)

def parchment(seed=1, w=CW, h=CH):
    n = (noise((h, w), 400, seed) * 0.5 + noise((h, w), 90, seed + 1) * 0.3 + noise((h, w), 12, seed + 2) * 0.2)
    base = np.array([222, 200, 158], np.float32) / 255
    dark = np.array([150, 112, 68], np.float32) / 255
    img = base[None, None] * (1 - n[..., None] * 0.35) + dark * n[..., None] * 0.12
    # darker, burnt edges
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    ex = np.minimum(x, w - x) / w; ey = np.minimum(y, h - y) / h
    edge = np.clip(1 - np.minimum(ex * 7, ey * 5) - noise((h, w), 60, seed + 3) * 0.25, 0, 1)
    img = img * (1 - edge[..., None] ** 2 * 0.55)
    # fibres
    fib = noise((h, w), 3, seed + 4)
    img = img * (0.96 + fib[..., None] * 0.05)
    return Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8))

def dark_surround(card):
    """Place the parchment sheet on a dark desk so camera moves stay inside it."""
    bg = np.zeros((CH, CW, 3), np.float32)
    bg += np.array([24, 18, 13], np.float32) / 255 * (0.7 + 0.3 * noise((CH, CW), 200, 9)[..., None])
    im = Image.fromarray((bg * 255).astype(np.uint8))
    sw, sh = card.size
    shadow = Image.new("L", (CW, CH), 0)
    ImageDraw.Draw(shadow).rectangle(((CW - sw) // 2 + 30, (CH - sh) // 2 + 40, (CW + sw) // 2 + 30, (CH + sh) // 2 + 40), fill=200)
    shadow = shadow.filter(ImageFilter.GaussianBlur(40))
    im.paste((5, 3, 2), (0, 0), shadow)
    im.paste(card, ((CW - sw) // 2, (CH - sh) // 2))
    # candle glow from upper left
    y, x = np.mgrid[0:CH, 0:CW].astype(np.float32)
    glow = np.exp(-(((x - CW * 0.2) / (CW * 0.7)) ** 2 + ((y - CH * 0.15) / (CH * 0.9)) ** 2))
    a = np.asarray(im, np.float32) / 255 * (0.55 + 0.6 * glow[..., None]) * np.array([1.05, 0.98, 0.88])
    return Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))

def wrap(dr, text, font, maxw):
    words, lines, cur = text.split(), [], ""
    for w_ in words:
        t = (cur + " " + w_).strip()
        if dr.textlength(t, font=font) > maxw and cur:
            lines.append(cur); cur = w_
        else:
            cur = t
    lines.append(cur)
    return lines

def quote_card(name, quote, source, header=None, latin=None, seed=1, size=110, quoted=True):
    sw, sh = 2300, 1300
    card = parchment(seed, sw, sh)
    dr = ImageDraw.Draw(card)
    fh = fnt("Cinzel.ttf", 54, [700]); fl = fnt("IMFellItalic.ttf", 60)
    fq = fnt("IMFell.ttf", size); fs = fnt("IMFellItalic.ttf", 50)
    lh = int(size * 1.28)
    qlines = wrap(dr, ("\u201c" + quote + "\u201d") if quoted else quote, fq, sw - 380)
    llines = wrap(dr, latin, fl, sw - 400) if latin else []
    slines = wrap(dr, "\u2014 " + source, fs, sw - 500)
    total = (110 if header else 0) + (len(llines) * 78 + 40 if latin else 0) + lh * len(qlines) + 50 + 64 * len(slines)
    y = (sh - total) / 2 - 20
    def centre(txt, font, yy, col):
        tw = dr.textlength(txt, font=font); dr.text(((sw - tw) / 2, yy), txt, font=font, fill=col)
    if header:
        centre(header, fh, y, RED)
        dr.line((sw / 2 - 180, y + 85, sw / 2 + 180, y + 85), fill=RED, width=3)
        y += 110
    for ln in llines:
        centre(ln, fl, y, (95, 70, 45)); y += 78
    if latin: y += 40
    for ln in qlines:
        centre(ln, fq, y, INK); y += lh
    y += 50
    for ln in slines:
        centre(ln, fs, y, (90, 62, 38)); y += 64
    card = card.filter(ImageFilter.GaussianBlur(0.6))
    dark_surround(card).save(f"build/cards/{name}.jpg", quality=93)

def roll_pages():
    """Several overlapping coroner's roll strips with repeated formula."""
    im = Image.new("RGB", (CW, CH), (20, 15, 11))
    phrases = ["...died in the prison of Neugate his rightful death...",
               "...the corpse viewed, on which no hurt appeared...",
               "...died in the said prison his rightful death and of no felony...",
               "...died in the prison of Neugate in his penitence..."]
    f = fnt("IMFellItalic.ttf", 58)
    for i in range(6):
        strip = parchment(20 + i, 900, 1500)
        d = ImageDraw.Draw(strip)
        y = 90
        for k in range(15):
            d.text((70, y), phrases[(i + k) % 4][:26] if k % 3 else phrases[(i + k) % 4][3:30], font=f, fill=INK)
            y += 92
        strip = strip.rotate((i - 2.5) * 2.2, expand=True, fillcolor=(20, 15, 11))
        im.paste(strip, (int(-150 + i * 520), int(40 + (i % 2) * 60)))
    dark = np.asarray(im, np.float32) / 255
    y, x = np.mgrid[0:CH, 0:CW].astype(np.float32)
    glow = np.exp(-(((x - CW * 0.45) / (CW * 0.6)) ** 2 + ((y - CH * 0.4) / (CH * 0.8)) ** 2))
    Image.fromarray((np.clip(dark * (0.5 + 0.6 * glow[..., None]), 0, 1) * 255).astype(np.uint8)).save("build/cards/roll_pages.jpg", quality=92)

def paris_card():
    """Matthew Paris drawing mounted on parchment with caption."""
    card = parchment(31, 2300, 1400)
    art = Image.open("assets/raw/archival_matthew_paris_gruffydd.jpg").convert("RGB")
    ah = 1080; aw = int(art.width * ah / art.height)
    art = art.resize((aw, ah), Image.LANCZOS)
    card.paste(art, ((2300 - aw) // 2 - 420, 150))
    dr = ImageDraw.Draw(card)
    x = (2300 + aw) // 2 - 300
    fh = fnt("Cinzel.ttf", 56, [700]); fb = fnt("IMFell.ttf", 64); fs = fnt("IMFellItalic.ttf", 46)
    dr.text((x, 380), "GRUFFUDD'S FALL", font=fh, fill=RED)
    dr.line((x, 460, x + 300, 460), fill=RED, width=3)
    for i, ln in enumerate(["Tower of London, 1244.", "Drawn by the monk", "Matthew Paris in his", "Chronica Majora."]):
        dr.text((x, 510 + i * 84), ln, font=fb, fill=INK)
    dr.text((x, 900), "Cambridge, Corpus Christi College,", font=fs, fill=(90, 62, 38))
    dr.text((x, 960), "Parker Library MS 16", font=fs, fill=(90, 62, 38))
    dark_surround(card).save("build/cards/paris.jpg", quality=93)

# ---------------------------------------------------------------- London map
# schematic positions (lon, lat) of 14th-century landmarks
PLACES = [("NEWGATE", -0.1010, 51.5165, "r"), ("LUDGATE", -0.1028, 51.5139, "l"), ("THE FLEET", -0.1062, 51.5122, "l"),
          ("THE TOWER", -0.0762, 51.5081, "r"), ("MARSHALSEA", -0.0926, 51.5022, "r"), ("KING'S BENCH", -0.0950, 51.5003, "l"),
          ("THE CLINK", -0.0921, 51.5066, "l")]
THAMES = [(-0.125, 51.5098), (-0.113, 51.5102), (-0.104, 51.5098), (-0.096, 51.5087), (-0.088, 51.5079),
          (-0.080, 51.5070), (-0.072, 51.5062), (-0.060, 51.5058)]
WALL = [(-0.0765, 51.5095), (-0.0772, 51.5134), (-0.0800, 51.5168), (-0.0890, 51.5186), (-0.0950, 51.5181),
        (-0.0975, 51.5176), (-0.1010, 51.5155), (-0.1028, 51.5139), (-0.1035, 51.5112)]

def proj(lon, lat, w, h):
    x = (lon + 0.126) / (0.126 - 0.058) * w
    y = (51.5205 - lat) / (51.5205 - 51.4975) * h
    return x, y

_map_base = None
def map_base():
    global _map_base
    if _map_base is None:
        w, h = 1920, 1080
        im = parchment(41, w, h)
        dr = ImageDraw.Draw(im)
        pts = [proj(*p, w, h) for p in THAMES]
        for off, col, wd in ((0, (120, 140, 150), 70), (0, (150, 168, 172), 52)):
            dr.line(pts, fill=col, width=wd, joint="curve")
        wall = [proj(*p, w, h) for p in WALL]
        dr.line(wall, fill=(110, 80, 50), width=7, joint="curve")
        bx = proj(-0.0868, 51.5082, w, h)
        dr.line((bx[0] - 8, bx[1] - 55, bx[0] + 8, bx[1] + 55), fill=(90, 62, 38), width=12)   # London Bridge
        f = fnt("Cinzel.ttf", 30, [600]); fi = fnt("IMFellItalic.ttf", 38); fT = fnt("Cinzel.ttf", 64, [700])
        dr.text((proj(-0.121, 51.5086, w, h)[0], proj(0, 51.5086, w, h)[1]), "River Thames", font=fi, fill=(70, 90, 100))
        dr.text((proj(-0.093, 51.5150, w, h)[0], proj(0, 51.5150, w, h)[1]), "THE CITY", font=fT, fill=(110, 80, 50, 120))
        dr.text((proj(-0.089, 51.4995, w, h)[0], proj(0, 51.4995, w, h)[1]), "SOUTHWARK", font=f, fill=(110, 80, 50))
        dr.text((bx[0] + 20, bx[1] + 30), "London Bridge", font=fi, fill=(90, 62, 38))
        dr.text((60, 40), "LONDON'S PRISONS", font=fT, fill=RED)
        dr.text((62, 120), "schematic, not to scale", font=fi, fill=(90, 62, 38))
        _map_base = np.asarray(im.filter(ImageFilter.GaussianBlur(0.5)), np.float32) / 255
    return _map_base

def map_frame(p):
    """Animated map: markers appear in sequence; slow push. Returns 1920x1080 float RGB."""
    w, h = 1920, 1080
    im = Image.fromarray((map_base() * 255).astype(np.uint8))
    dr = ImageDraw.Draw(im)
    f = fnt("Cinzel.ttf", 34, [700])
    for i, (name, lon, lat, side) in enumerate(PLACES):
        a = np.clip((p - 0.05 - i * 0.1) / 0.08, 0, 1)
        if a <= 0: continue
        x, y = proj(lon, lat, w, h)
        r = 10 + 10 * (1 - a)
        col = tuple(int(c * a + 222 * (1 - a)) for c in RED)
        dr.ellipse((x - r, y - r, x + r, y + r), fill=col, outline=(60, 20, 15))
        tw = dr.textlength(name, font=f)
        tx = x + 24 if side == "r" else x - 24 - tw
        tc = tuple(int(c * a + 222 * (1 - a)) for c in INK)
        dr.text((tx, y - 20), name, font=f, fill=tc)
    arr = np.asarray(im, np.float32) / 255
    z = 1.0 + 0.06 * p
    M = cv2.getRotationMatrix2D((w * 0.47, h * 0.5), 0, z)
    arr = cv2.warpAffine(arr, M, (w, h), borderMode=cv2.BORDER_REFLECT)
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    glow = np.exp(-(((x - w * 0.4) / (w * 0.8)) ** 2 + ((y - h * 0.35) / (h * 0.9)) ** 2))
    return np.clip(arr * (0.55 + 0.5 * glow[..., None]), 0, 1)

def five_words():
    im = Image.new("RGB", (CW, CH), (8, 6, 5))
    dr = ImageDraw.Draw(im)
    words = ["POVERTY", "HUNGER", "DISEASE", "CROWDS", "UNCERTAINTY"]
    f = fnt("Cinzel.ttf", 120, [700])
    y = 380
    for wd in words:
        tw = dr.textlength(wd, font=f)
        dr.text(((CW - tw) / 2, y), wd, font=f, fill=(226, 212, 186)); y += 180
    im.save("build/cards/five_words.jpg", quality=93)

def end_card():
    im = Image.new("RGB", (CW, CH), (8, 6, 5))
    dr = ImageDraw.Draw(im)
    f1 = fnt("Cinzel.ttf", 96, [700]); f2 = fnt("IMFellItalic.ttf", 64); f3 = fnt("Inter.ttf", 50, [14, 600])
    for txt, fo, y, col in (("WHY YOU WOULDN'T SURVIVE", f1, 560, (226, 212, 186)),
                            ("a medieval prison", f2, 700, (200, 160, 100)),
                            ("S U B S C R I B E", f3, 960, (240, 234, 222))):
        tw = dr.textlength(txt, font=fo); dr.text(((CW - tw) / 2, y), txt, font=fo, fill=col)
    dr.line((CW / 2 - 220, 900, CW / 2 + 220, 900), fill=(190, 150, 90), width=4)
    im.save("build/cards/end.jpg", quality=93)

def five_words_frame_mask():
    pass

if __name__ == "__main__":
    os.makedirs("build/cards", exist_ok=True)
    quote_card("bracton", "Prison is for confining people, not for punishing them.",
               "Roman legal maxim (Ulpian, Digest 48.19.8.9), repeated in the 13th-century English treatise known as Bracton",
               latin="carcer ad continendos homines, non ad puniendos haberi debet", seed=2, size=104)
    quote_card("acton", "...the Creditor shall find him bread and water, to the end that he die not in prison for default of sustenance.",
               "Statute of Acton Burnell, 1283", header="THE LAW ON DEBTORS", seed=3, size=96)
    quote_card("bread1316", "...it was adjudged that her bread should be forfeited, and given to the prisoners in Neugate.",
               "City of London Letter-Book D, 1316 (trans. H. T. Riley, 1868)", header="CONFISCATED BREAD", seed=4, size=100)
    quote_card("grene", "...died of starvation in the said prison and of no felony.",
               "Inquest on Thomas atte Grene, Newgate, May 1322. City of London Coroners' Rolls (ed. R. R. Sharpe, 1913)",
               header="CORONER'S ROLL", seed=5, size=120)
    quote_card("rightful", "...died in the prison of Neugate his rightful death... The corpse viewed, on which no hurt appeared.",
               "City of London Coroners' Rolls, 1300–1378 (ed. R. R. Sharpe, 1913)", header="CORONER'S ROLL", seed=6, size=104)
    quote_card("fetid", "...by reason of the fetid and corrupt atmosphere that is in the hateful gaol of Neugate, many persons... are now dead, who might have been living...",
               "Ordinance re-establishing Ludgate, 2 November 1419. Letter-Book I (trans. H. T. Riley, 1868)",
               header="CITY OF LONDON, 1419", seed=7, size=92)
    quote_card("labourers", "Every town must make stocks, to punish labourers who break the new wage laws.",
               "Summary of the Statute of Labourers, 1351", header="AFTER THE BLACK DEATH", seed=8, size=110, quoted=False)
    quote_card("statute1330", "...deliver the Gaols at least three times a year, and more often if need be.",
               "Statute of 4 Edward III, 1330", header="GAOL DELIVERY", seed=9, size=110)
    quote_card("magna", "To no one will we sell, to no one deny or delay right or justice.",
               "Magna Carta, clause 40, 1215 (British Library translation)", header="MAGNA CARTA", seed=10, size=112)
    quote_card("ratelere", "John le Ratelere, who had been attached for cutting off the purse of John de Pelham, died in the prison of Neugate... The corpse viewed, on which no hurt appeared.",
               "City of London Coroners' Rolls, July 1322 (ed. R. R. Sharpe, 1913)", header="CORONER'S ROLL", seed=11, size=92)
    quote_card("pardon", "Cecily, wife of John de Rygeway, pardoned by Edward III after remaining mute and fasting in Nottingham gaol for forty days.",
               "Summary of the royal pardon, 25 April 1357, Calendar of Patent Rolls", header="BY THE KING", seed=12, size=96, quoted=False)
    roll_pages(); paris_card(); five_words(); end_card()
    Image.fromarray((map_frame(1.0) * 255).astype(np.uint8)).save("build/cards/map_preview.jpg")
    print("cards done")
