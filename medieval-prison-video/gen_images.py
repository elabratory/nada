"""Fetch stills from Pollinations (anonymous 'sana' model). Usage: python3 gen_images.py [key ...] [--seed-offset N]"""
import sys, os, time, urllib.parse, subprocess
from script_data import PROMPTS, STYLE
RAW = "assets/raw"
os.makedirs(RAW, exist_ok=True)
args = [a for a in sys.argv[1:] if not a.startswith("--")]
off = int(next((a.split("=")[1] for a in sys.argv if a.startswith("--seed-offset=")), 0))
keys = args or list(PROMPTS)
for k in keys:
    out = f"{RAW}/{k}.jpg"
    if os.path.exists(out) and not args:
        continue
    prompt, seed = PROMPTS[k]
    url = ("https://image.pollinations.ai/prompt/" + urllib.parse.quote(prompt + STYLE) +
           f"?width=1344&height=768&seed={seed + off}&nologo=true&model=sana")
    for attempt in range(12):
        r = subprocess.run(["curl", "-sS", "--max-time", "180", "-o", out + ".tmp", "-w", "%{http_code}", url],
                           capture_output=True, text=True)
        code = r.stdout.strip()
        if code == "200" and os.path.getsize(out + ".tmp") > 10000:
            os.replace(out + ".tmp", out); print("ok", k, flush=True); break
        wait = min(60, 5 * (attempt + 1)); print("retry", k, code, f"wait {wait}s", flush=True); time.sleep(wait)
    else:
        print("FAILED", k, flush=True)
    time.sleep(3)
