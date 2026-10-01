"""Thumbnail in the reference layout: stick-figure 'you' over a blurred painted background,
huge red 'YOU' with white outline + black shadow, and a curved red arrow pointing at him."""
import math, cairo
from PIL import Image, ImageFilter, ImageEnhance
import cartoon as C
from stick import Char
W, H = 1920, 1080
bg = Image.open("assets/bg_hd/bg_cell.png").convert("RGB").resize((W, H), Image.LANCZOS)
bg = ImageEnhance.Color(bg.filter(ImageFilter.GaussianBlur(9))).enhance(1.15)
bg = ImageEnhance.Brightness(bg).enhance(1.1)
bg.save("build/_thumb_bg.png")
surf = cairo.ImageSurface(cairo.FORMAT_RGB24, W, H); ctx = cairo.Context(surf)
ctx.set_source_surface(cairo.ImageSurface.create_from_png("build/_thumb_bg.png"), 0, 0); ctx.paint()
# prison bars in the foreground for instant 'prison' read
HERO = Char(body="brown", hair=C.rgb("4a3020"), beard=C.rgb("4a3020"), seed=1)
HERO.draw(ctx, 820, 1500, 0.35, "scared", arms=(235, -55), props=(None, None), sweat=True, tears=True, size=3.4)
def big_text(s, x, y, size):
    ctx.select_font_face("Anton"); ctx.set_font_size(size)
    e = ctx.text_extents(s); x0 = x - e.width / 2 - e.x_bearing
    for dx, dy, col, w in ((14, 16, (0, 0, 0), size * 0.22), (0, 0, (1, 1, 1), size * 0.16)):
        ctx.move_to(x0 + dx, y + dy); ctx.text_path(s); ctx.set_source_rgb(*col); ctx.set_line_width(w)
        ctx.set_line_join(cairo.LINE_JOIN_ROUND); ctx.stroke_preserve(); ctx.fill()
    ctx.move_to(x0, y); ctx.text_path(s); ctx.set_source_rgb(0.88, 0.07, 0.07); ctx.fill()
for x in (150, 470, 1780):   # bars in front, clear of his face
    C.line(ctx, [(x, -20), (x, H + 20)], 34, C.rgb("3b3b40")); C.line(ctx, [(x - 8, -20), (x - 8, H + 20)], 8, C.rgb("6a6a72"))
big_text("YOU", 1480, 330, 290)
# curved red arrow (white rim) from the text to his head
def arrow(col, w):
    ctx.new_path(); ctx.move_to(1470, 420); ctx.curve_to(1470, 560, 1330, 600, 1150, 560)
    ctx.set_source_rgb(*col); ctx.set_line_width(w); ctx.set_line_cap(cairo.LINE_CAP_ROUND); ctx.stroke()
    ctx.new_path(); ctx.move_to(1110, 552); ctx.line_to(1200, 505); ctx.line_to(1185, 612); ctx.close_path()
    ctx.set_source_rgb(*col); ctx.set_line_join(cairo.LINE_JOIN_ROUND); ctx.set_line_width(w * 0.5); ctx.stroke_preserve(); ctx.fill()
arrow((1, 1, 1), 44); arrow((0.88, 0.07, 0.07), 26)
surf.write_to_png("build/_thumb.png")
Image.open("build/_thumb.png").convert("RGB").resize((1280, 720), Image.LANCZOS).save("thumbnail.jpg", quality=92)
print("ok")
