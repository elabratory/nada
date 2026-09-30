"""Local fallback image generation with SANA-Sprint 1.6B on CPU.
Stage 1 encodes all prompts (text encoder only), stage 2 denoises + decodes (transformer + VAE).
Usage: python3 gen_local.py [keys...] [--seed-offset=N] [--force]"""
import os, sys, gc, time, torch
from diffusers import SanaSprintPipeline
from script_data import PROMPTS, STYLE
torch.set_num_threads(4)
REPO = "Efficient-Large-Model/Sana_Sprint_1.6B_1024px_diffusers"
args = [a for a in sys.argv[1:] if not a.startswith("--")]
off = int(next((a.split("=")[1] for a in sys.argv if a.startswith("--seed-offset=")), 0))
force = "--force" in sys.argv
keys = args or [k for k in PROMPTS if not os.path.exists(f"assets/raw/{k}.jpg")]
if not force:
    keys = [k for k in keys if not os.path.exists(f"assets/raw/{k}.jpg")] if not args else keys
print("to generate:", len(keys), flush=True)
if not keys: sys.exit()

pipe = SanaSprintPipeline.from_pretrained(REPO, torch_dtype=torch.bfloat16, transformer=None, vae=None)
embeds = {}
t = time.time()
with torch.no_grad():
    for k in keys:
        pe, pm = pipe.encode_prompt(PROMPTS[k][0] + STYLE, device="cpu")[:2]
        embeds[k] = (pe.float(), pm)
print(f"encoded {len(keys)} prompts in {time.time()-t:.0f}s", flush=True)
del pipe; gc.collect()

pipe = SanaSprintPipeline.from_pretrained(REPO, torch_dtype=torch.float32, text_encoder=None, tokenizer=None)
for k in keys:
    t = time.time()
    pe, pm = embeds[k]
    g = torch.Generator("cpu").manual_seed(PROMPTS[k][1] + off)
    with torch.no_grad():
        img = pipe(prompt_embeds=pe, prompt_attention_mask=pm, num_inference_steps=2, guidance_scale=4.5,
                   width=1024, height=576, generator=g).images[0]
    img.save(f"assets/raw/{k}.jpg", quality=95)
    print(f"local ok {k} {time.time()-t:.0f}s", flush=True)
