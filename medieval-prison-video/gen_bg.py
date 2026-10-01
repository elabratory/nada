"""Illustrated cartoon BACKGROUNDS (no characters) with SANA-Sprint locally; stick figures are drawn on top."""
import os, sys, gc, torch
from diffusers import SanaSprintPipeline
torch.set_num_threads(4)
REPO = "Efficient-Large-Model/Sana_Sprint_1.6B_1024px_diffusers"
STYLE = (", 2D cartoon background illustration for an animated YouTube explainer, flat vibrant colours, clean bold dark outlines, "
         "simple shading, wide shot, empty scene with no people and no characters")
BG = {
    "bg_city":   ("medieval London skyline in 1320 seen from across the river Thames, timber houses, old St Paul's cathedral with tall spire, blue sky with clouds", 701),
    "bg_street": ("empty medieval London market street, timber-framed houses with overhanging upper floors, market stalls with bread and cloth, muddy cobbled road, daytime", 702),
    "bg_newgate":("huge medieval stone city gatehouse prison with two round towers and a dark arched gate, muddy road in front, daytime, blue sky", 703),
    "bg_cell":   ("inside an empty medieval stone prison cell, grey stone block walls, straw on the floor, a small barred window with a beam of light, a burning torch on the wall", 704),
    "bg_dungeon":("empty dark medieval dungeon room with stone walls, chains hanging on the wall, a wooden torture rack, torchlight", 705),
    "bg_door":   ("close-up of a heavy iron-studded wooden prison door set in a stone archway, small barred grille window, stone wall around it", 706),
    "bg_court":  ("empty medieval English courtroom inside a stone hall, raised wooden judges bench, wooden benches, tall arched windows with daylight", 707),
    "bg_hall":   ("empty medieval great hall with a long wooden feast table, candles, banners on stone walls, torchlight", 708),
    "bg_kitchen":("empty medieval castle kitchen at night, huge stone hearth with glowing fire, pots and pans, wooden table", 709),
    "bg_tower_night": ("square white stone castle keep with four turrets at night, full moon, stars, torches on the walls, river below", 710),
    "bg_river_night": ("dark river at night beneath tall castle walls, moonlight reflections on the water, misty", 711),
    "bg_tower_day": ("square pale stone castle keep with four corner turrets beside a wide river, blue sky, daytime", 712),
    "bg_castle_hill": ("medieval castle keep on top of a tall grassy mound above a small town and river, blue sky", 713),
    "bg_church": ("front of a small medieval stone parish church with a wooden door, graveyard, morning light", 714),
    "bg_village": ("medieval english village green with thatched cottages and a well, sunny day", 715),
    "bg_corridor": ("long narrow stone prison corridor with torches on the walls, vaulted ceiling, smoke", 716),
    "bg_gallows": ("grassy hill with a wooden gallows against a grey cloudy sky, crows flying", 717),
    "bg_room_rich": ("comfortable medieval private chamber with a curtained bed, a wooden table with food and a candle, tapestry on stone wall", 718),
    "bg_desk":   ("medieval scribe's wooden desk with parchment, quill, ink and candle in a stone room", 719),
    "bg_sunset_castle": ("romantic fairytale medieval castle with colourful banners on a green hill at golden sunset", 720),
    "bg_pit":    ("looking down into a deep round stone dungeon pit with an iron grate, dark at the bottom", 721),
    "bg_town_gate": ("medieval english town street with a stone gatehouse arch over the road, timber houses on both sides, daytime", 722),
    "bg_guard_room": ("medieval prison keeper's room with a rough wooden table, iron keys on hooks, stone walls, candle light", 723),
}
keys = [a for a in sys.argv[1:]] or [k for k in BG if not os.path.exists(f'assets/bg/{k}.png')]
os.makedirs("assets/bg", exist_ok=True)
pipe = SanaSprintPipeline.from_pretrained(REPO, torch_dtype=torch.bfloat16, transformer=None, vae=None)
emb = {}
with torch.no_grad():
    for k in keys:
        pe, pm = pipe.encode_prompt(BG[k][0] + STYLE, device="cpu")[:2]; emb[k] = (pe.float(), pm)
del pipe; gc.collect()
pipe = SanaSprintPipeline.from_pretrained(REPO, torch_dtype=torch.float32, text_encoder=None, tokenizer=None)
for k in keys:
    with torch.no_grad():
        img = pipe(prompt_embeds=emb[k][0], prompt_attention_mask=emb[k][1], num_inference_steps=2, guidance_scale=4.5,
                   width=1344, height=768, generator=torch.Generator("cpu").manual_seed(BG[k][1])).images[0]
    img.save(f"assets/bg/{k}.png"); print("ok", k, flush=True)
