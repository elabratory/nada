"""YouTube thumbnail (1280x720) from the ElevenLabs hero close-up."""
from PIL import Image, ImageDraw, ImageFont, ImageEnhance, ImageFilter
import numpy as np
W, H = 1280, 720
im = Image.open("assets/el/hero_shock.png").convert("RGB")
im = im.transpose(Image.FLIP_LEFT_RIGHT)
im = im.crop((560, 0, 560 + 1300, int(1300 * 9 / 16))).resize((W, H), Image.LANCZOS)
im = ImageEnhance.Contrast(im).enhance(1.25); im = ImageEnhance.Color(im).enhance(1.15)
a = np.asarray(im, np.float32) / 255
x = np.linspace(0, 1, W)[None, :, None]
dark = np.clip((x - 0.45) / 0.2, 0, 1) * 0.75            # darken right side for text
y, xx = np.mgrid[0:H, 0:W]
vig = 1 - 0.45 * np.clip(np.hypot((xx - W * 0.28) / W, (y - H * 0.4) / H) - 0.25, 0, 1) * 1.6
a = a * (1 - dark) * vig[..., None]
im = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))
dr = ImageDraw.Draw(im)
def big(txt, xy, size, fill, stroke=10):
    f = ImageFont.truetype("assets/fonts/Anton.ttf", size)
    dr.text(xy, txt, font=f, fill=fill, stroke_width=stroke, stroke_fill=(0, 0, 0))
big("WOULD YOU", (700, 110), 128, (255, 255, 255))
big("SURVIVE?", (700, 255), 168, (255, 214, 0), 12)
# red banner
f = ImageFont.truetype("assets/fonts/Anton.ttf", 64)
tw = dr.textlength("MEDIEVAL PRISON", font=f)
dr.rectangle((700, 480, 700 + tw + 40, 570), fill=(196, 28, 28))
dr.text((720, 484), "MEDIEVAL PRISON", font=f, fill=(255, 255, 255))
# arrow to the face
dr.line([(690, 430), (590, 360)], fill=(255, 40, 40), width=16)
dr.polygon([(566, 342), (618, 352), (590, 396)], fill=(255, 40, 40))
im.save("thumbnail.jpg", quality=92)
print("ok")
