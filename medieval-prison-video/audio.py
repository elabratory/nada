"""Sound design + mix. Reads build/timeline.json (from render.py) and build/vo/<id>.wav.
Music and SFX are synthesised procedurally (no third-party samples); crowd murmur uses quiet TTS babble.
Writes build/mix.wav (48 kHz stereo, loudness-normalised for YouTube)."""
import json, os, math, subprocess, numpy as np
from scipy.signal import fftconvolve, butter, sosfilt
from scipy.ndimage import uniform_filter1d
from script_data import SEGMENTS

SR = 48000
rng = np.random.default_rng(3)

# ------------------------------------------------------------------ helpers
def t_(d): return np.arange(int(d * SR)) / SR
def bp(x, lo, hi, order=2): return sosfilt(butter(order, [lo, hi], "bandpass", fs=SR, output="sos"), x)
def lp(x, f, order=2): return sosfilt(butter(order, f, "lowpass", fs=SR, output="sos"), x)
def hp(x, f, order=2): return sosfilt(butter(order, f, "highpass", fs=SR, output="sos"), x)
def env(n, a, d):
    e = np.ones(n); na = max(1, int(a * SR)); e[:na] = np.linspace(0, 1, na)
    return e * np.exp(-np.arange(n) / (d * SR))
def norm(x, peak=0.9): return x / (np.abs(x).max() + 1e-9) * peak

def reverb_ir(dur, decay, bright=4000, seed=0):
    r = np.random.default_rng(seed); n = int(dur * SR)
    ir = r.standard_normal((n, 2)) * np.exp(-np.arange(n) / (decay * SR))[:, None]
    ir = np.stack([lp(ir[:, 0], bright), lp(ir[:, 1], bright)], 1)
    ir[:int(0.01 * SR)] *= np.linspace(0, 1, int(0.01 * SR))[:, None]
    return ir / np.sqrt((ir ** 2).sum(0))

IR_STONE = reverb_ir(2.5, 0.55, 3500, 1)     # stone corridor
IR_HALL = reverb_ir(4.0, 1.1, 2500, 2)       # big space for music / booms
IR_STREET = reverb_ir(0.8, 0.12, 6000, 3)
IR_VOICE = reverb_ir(0.6, 0.09, 5000, 4)      # small room so the narrator sits in the space

def verb(x, ir, wet=0.35):
    """mono or stereo in -> stereo out"""
    if x.ndim == 1: x = np.stack([x, x], 1)
    out = np.zeros((len(x) + len(ir) - 1, 2))
    for c in range(2): out[:, c] = fftconvolve(x[:, c], ir[:, c])
    dry = np.zeros_like(out); dry[:len(x)] = x
    return dry * (1 - wet) + out * wet

def pan(x, p):  # p -1..1
    return np.stack([x * math.sqrt((1 - p) / 2), x * math.sqrt((1 + p) / 2)], 1)

# ------------------------------------------------------------------ SFX
def metal_clink(f0=2500, spread=3.0, dec=0.06, n_part=7):
    d = t_(dec * 6); x = np.zeros_like(d)
    for k in range(n_part):
        f = f0 * (1 + rng.random() * spread)
        x += np.sin(2 * np.pi * f * d + rng.random() * 6) * rng.random() * np.exp(-d / (dec * (0.5 + rng.random())))
    x += rng.standard_normal(len(d)) * np.exp(-d / 0.003) * 0.4
    return x

def cluster(fn, dur, count, **kw):
    out = np.zeros(int(dur * SR) + SR)
    for _ in range(count):
        c = fn(**kw); i = int(rng.random() * dur * SR); out[i:i + len(c)] += c * (0.4 + 0.6 * rng.random())
    return out

def sfx_chains(): return norm(verb(cluster(metal_clink, 1.4, 22, f0=1400, spread=2.5, dec=0.05), IR_STONE, 0.4), 0.5)
def sfx_keys(): return norm(verb(cluster(metal_clink, 1.2, 26, f0=3000, spread=2.0, dec=0.035), IR_STONE, 0.3), 0.35)
def sfx_coins(): return norm(verb(cluster(metal_clink, 0.9, 16, f0=4200, spread=1.5, dec=0.05), IR_STONE, 0.2), 0.35)
def sfx_clank():
    a, b = metal_clink(600, 2.5, 0.18, 9), metal_clink(1200, 2, 0.08) * 0.5
    x = a.copy(); x[:len(b)] += b
    th = np.sin(2 * np.pi * 90 * t_(0.3)) * env(int(0.3 * SR), 0.001, 0.05)
    x[:len(th)] += th
    return norm(verb(x, IR_STONE, 0.4), 0.6)
def sfx_lock():
    a = metal_clink(900, 1.5, 0.03); b = metal_clink(500, 1.5, 0.09, 9)
    x = np.zeros(int(0.9 * SR)); x[:len(a)] += a * 0.6; x[int(0.35 * SR):int(0.35 * SR) + len(b)] += b
    return norm(verb(x, IR_STONE, 0.35), 0.55)

def footstep(stone=True):
    n = int(0.25 * SR); x = rng.standard_normal(n) * env(n, 0.002, 0.025 if stone else 0.05)
    x = bp(x, 150, 2500) if stone else lp(x, 700)
    th = np.sin(2 * np.pi * (70 if stone else 55) * t_(0.25)) * env(n, 0.001, 0.03)
    return x + th * 0.6
def sfx_footsteps(stone=True, dur=4.0, step=0.58):
    out = np.zeros(int((dur + 1) * SR))
    for k in range(int(dur / step)):
        i = max(0, int((k * step + rng.normal(0, 0.02)) * SR)); f = footstep(stone)
        out[i:i + len(f)] += f * (0.8 + 0.3 * rng.random())
    return norm(verb(out, IR_STONE if stone else IR_STREET, 0.45 if stone else 0.2), 0.45)

def sfx_door_creak(dur=1.6):
    t = t_(dur); f = 95 + 60 * np.sin(np.pi * t / dur) + 15 * rng.standard_normal(len(t)).cumsum() / SR * 30
    ph = np.cumsum(f) / SR
    saw = 2 * (ph % 1) - 1
    stick = (np.sin(2 * np.pi * np.cumsum(9 + 6 * np.sin(t * 3)) / SR) > 0.2).astype(float)
    x = saw * lp(stick, 60)
    x = bp(x, 350, 500) * 1.2 + bp(x, 850, 1000) + bp(x, 1600, 1900) * 0.6
    x *= np.sin(np.pi * t / dur) ** 0.5
    return norm(verb(x, IR_STONE, 0.4), 0.4)
def sfx_door_slam():
    n = int(0.6 * SR); th = np.sin(2 * np.pi * 55 * t_(0.6)) * env(n, 0.001, 0.12)
    nz = lp(rng.standard_normal(n), 1200) * env(n, 0.001, 0.04)
    x = th + nz * 0.8 + np.r_[metal_clink(700, 2, 0.1), np.zeros(n)][:n] * 0.3
    return norm(verb(x, IR_HALL, 0.5), 0.8)

def sfx_boom():
    d = 5.0; t = t_(d); f = 55 * np.exp(-t * 0.5) + 28
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(t), 0.005, 1.4)
    x += lp(rng.standard_normal(len(t)), 300) * env(len(t), 0.002, 0.3) * 0.5
    return norm(verb(x, IR_HALL, 0.45), 0.9)

def sfx_bells():
    d = 7.0; t = t_(d); out = np.zeros(len(t))
    for k, st in enumerate([0.0, 2.2, 4.4]):
        i = int(st * SR); tt = t[:len(t) - i]
        b = sum(a * np.sin(2 * np.pi * 196 * r * tt) * np.exp(-tt / dd) for r, a, dd in
                [(0.5, .5, 3), (1, 1, 2.2), (1.19, .6, 1.6), (1.5, .4, 1.3), (2, .35, 1), (2.52, .2, .7), (3.01, .15, .5)])
        out[i:] += b * (1 - 0.2 * k)
    return norm(verb(lp(out, 2500), IR_HALL, 0.55), 0.3)

def sfx_wind(dur=10.0):
    n = int(dur * SR); x = rng.standard_normal(n)
    g = lp(rng.standard_normal(n), 0.4); g = (g - g.min()) / (g.max() - g.min())
    y = bp(x, 250, 900) * (0.4 + g) + bp(x, 900, 2200) * g * 0.3
    return norm(pan(y, 0.2) + pan(bp(x[::-1], 300, 800), -0.3) * 0.5, 0.25)

def sfx_drip():
    out = np.zeros(int(6 * SR))
    for st in [0.2, 1.9, 3.1, 4.9]:
        d = t_(0.08); f = 900 + 1400 * d / 0.08
        c = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-d / 0.02)
        i = int(st * SR); out[i:i + len(c)] += c
    return norm(verb(out, IR_STONE, 0.6), 0.3)

def sfx_squeak():
    out = np.zeros(int(1.2 * SR))
    for st in [0.0, 0.18, 0.5]:
        d = t_(0.07); f = 3800 + 900 * np.sin(np.pi * d / 0.07)
        c = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * d / 0.07)
        i = int(st * SR); out[i:i + len(c)] += c
    return norm(verb(out, IR_STONE, 0.3), 0.2)

def sfx_hammer():
    out = np.zeros(int(6 * SR))
    for k in range(9):
        c = metal_clink(1800, 1.5, 0.05); f = footstep(True) * 0.5; m = min(len(c), len(f)); c[:m] += f[:m]
        i = max(0, int((k * 0.62 + rng.normal(0, 0.03)) * SR)); out[i:i + len(c)] += c
    return norm(verb(out, IR_STREET, 0.3), 0.3)

def sfx_hooves(dur=6.0):
    out = np.zeros(int((dur + 1) * SR)); t = 0.0
    while t < dur:
        for off in (0, 0.11, 0.31, 0.42):
            f = footstep(True); i = int((t + off) * SR); out[i:i + len(f)] += f * 0.7
        t += 0.75
    return norm(verb(out, IR_STREET, 0.25) * np.linspace(0.3, 1, len(out) + len(IR_STREET) - 1)[:, None], 0.4)

def sfx_water(dur=6.0):
    n = int(dur * SR); x = lp(rng.standard_normal(n), 500)
    m = (np.sin(2 * np.pi * 0.7 * t_(dur)) * 0.5 + 0.5) ** 3
    return norm(pan(x * m, -0.2), 0.25)

def sfx_fire(dur):
    n = int(dur * SR); roar = lp(rng.standard_normal(n), 400) * 0.3
    pops = np.zeros(n)
    for _ in range(int(dur * 6)):
        i = int(rng.random() * (n - 2000)); c = hp(rng.standard_normal(600), 1500) * env(600, 0.0005, 0.004)
        pops[i:i + 600] += c * rng.random()
    return roar + pops

# ------------------------------------------------------------------ babble / crowd (quiet TTS voices)
BABBLE_LINES = [
    "Fresh bread, fresh bread, a penny the loaf. Come, good wife, look here.",
    "I told him twice, the cart goes round by the conduit, not through Cheap.",
    "Mind the gutter there. The rain has left it full to the brim this week.",
    "Have you seen my brother? He went down to the river at first light.",
    "Eels, fresh eels. Cloth from Flanders, good wool, fair price.",
    "They say the justices come after Michaelmas. Or so the keeper tells it.",
    "Lord have mercy upon us. Christ have mercy upon us.",
    "Give us a crust, for the love of God. Just a crust.",
]
VOICES = ["en-GB-RyanNeural", "en-GB-SoniaNeural", "en-GB-ThomasNeural", "en-GB-LibbyNeural",
          "en-IE-ConnorNeural", "en-GB-MaisieNeural", "en-US-GuyNeural", "en-IE-EmilyNeural"]

def babble_clip():
    path = "build/sfx/babble.wav"
    if not os.path.exists(path):
        import certifi, asyncio
        certifi.where = lambda: "/root/.ccr/ca-bundle.crt"
        import edge_tts
        async def go():
            for i, (v, l) in enumerate(zip(VOICES, BABBLE_LINES)):
                f = f"build/sfx/bab{i}.mp3"
                if not os.path.exists(f):
                    await edge_tts.Communicate(l, v, rate="+10%", proxy=os.environ.get("HTTPS_PROXY")).save(f)
        asyncio.run(go())
        mix = np.zeros(int(14 * SR))
        for i in range(len(VOICES)):
            raw = subprocess.check_output(["ffmpeg", "-loglevel", "error", "-i", f"build/sfx/bab{i}.mp3", "-f", "f32le",
                                           "-ar", str(SR), "-ac", "1", "-"])
            v = np.frombuffer(raw, np.float32).astype(np.float64)
            for rep in range(3):
                st = int(rng.random() * (len(mix) - len(v))); mix[st:st + len(v)] += v * (0.5 + rng.random() * 0.5)
        mix = lp(mix, 1800)                           # muffle: unintelligible, distant
        import soundfile as sf
        sf.write(path, norm(mix, 0.5), SR)
    import soundfile as sf
    x, _ = sf.read(path)
    return x

def loop_to(x, n):
    if len(x) >= n: return x[:n]
    reps = int(np.ceil(n / len(x))); return np.tile(x, (reps,) + (1,) * (x.ndim - 1))[:n]

# ------------------------------------------------------------------ music
def pad_voice(freq, dur, bright=0.3, vib=0.004, seed=0):
    """bowed-string-like tone: detuned saws, slow swell, vibrato, lowpassed."""
    r = np.random.default_rng(seed); t = t_(dur); x = np.zeros(len(t))
    for det in (-0.004, 0.0, 0.005):
        f = freq * (1 + det) * (1 + vib * np.sin(2 * np.pi * (4.8 + r.random()) * t + r.random() * 6))
        ph = np.cumsum(f) / SR; x += 2 * (ph % 1) - 1
    x = lp(x, 250 + bright * 1800)
    swell = np.minimum(1, t / 3) * np.minimum(1, (dur - t) / 3).clip(0)
    return x * swell

def music_bed(total, sections):
    """sections: list of (t0, t1, mood). Moods: 'tension', 'dark', 'pulse', 'finale', 'none'."""
    n = int((total + 6) * SR); out = np.zeros((n, 2))
    # D dorian chord cycle (Hz): Dm, Bb, C, Am
    chords = {"dark": [[73.4, 110, 146.8, 174.6], [58.3, 116.5, 146.8, 174.6], [65.4, 98, 130.8, 164.8], [55, 110, 130.8, 164.8]],
              "tension": [[73.4, 110, 155.6], [73.4, 103.8, 146.8], [69.3, 110, 146.8], [73.4, 110, 155.6]],
              "finale": [[73.4, 110, 146.8, 220], [58.3, 116.5, 174.6, 233], [87.3, 130.8, 174.6, 220], [73.4, 110, 146.8, 220]]}
    for (t0, t1, mood) in sections:
        if mood in ("none",): continue
        cyc = chords.get(mood if mood != "pulse" else "tension")
        chord_len = 8.0 if mood != "pulse" else 6.0
        tt = t0; k = 0
        while tt < t1:
            d = min(chord_len + 3, t1 - tt + 3)
            layer = sum(pad_voice(f, d, 0.25 if mood != "finale" else 0.45, seed=int(tt * 10) + j) * (0.5 if j == 0 else 0.28)
                        for j, f in enumerate(cyc[k % len(cyc)]))
            i = int(tt * SR); seg = pan(layer, (k % 2 - 0.5) * 0.3)
            out[i:i + len(seg)] += seg[:n - i]
            tt += chord_len; k += 1
        if mood == "pulse":      # low drum heartbeat + muted string ostinato for the escape chapter
            beat = 60 / 76; tt = t0
            while tt < t1:
                dn = int(0.8 * SR); dt = t_(0.8)
                drum = np.sin(2 * np.pi * np.cumsum(90 * np.exp(-dt * 18) + 45) / SR) * env(dn, 0.002, 0.18)
                drum += lp(rng.standard_normal(dn), 200) * env(dn, 0.001, 0.03) * 0.5
                i = int(tt * SR); out[i:i + dn] += pan(drum, 0) [:n - i] * 0.9
                for sub, f in ((0.5, 146.8), (0.75, 174.6)):
                    pl = pad_voice(f, 0.3, 0.6, 0.0) * env(int(0.3 * SR), 0.005, 0.07)
                    j = int((tt + beat * sub) * SR); out[j:j + len(pl)] += pan(pl, 0.3)[:n - j] * 0.35
                tt += beat
        if mood == "finale":     # distant high bell tones
            for tt in np.arange(t0 + 2, t1, 9.0):
                d = t_(4); b = sum(a * np.sin(2 * np.pi * 587 * r * d) * np.exp(-d / dd) for r, a, dd in [(1, 1, 1.5), (2.01, .3, .8), (2.76, .2, .5)])
                i = int(tt * SR); out[i:i + len(b)] += pan(b, -0.4)[:n - i] * 0.12
    out = verb(out, IR_HALL, 0.4)[:n]
    return norm(out, 0.5)

# ------------------------------------------------------------------ mix
EXTERIOR = {"city_wide", "market", "purse_cut", "pointing", "hero_shock", "seized", "march", "newgate_ext", "newgate_door",
            "noose", "debtor", "ludgate", "family_grate", "baker", "transfer", "rebuild", "york_castle", "town_gate", "tower",
            "stocks", "justices", "castle_banners", "sanctuary", "breakout"}

def mix():
    tl = json.load(open("build/timeline.json")); total = tl["total"]; n = int((total + 1) * SR)
    os.makedirs("build/sfx", exist_ok=True)
    vo = np.zeros(n); amb = np.zeros((n, 2)); fx = np.zeros((n, 2))
    segs = {s["id"]: s for s in SEGMENTS}
    for sid, (t0, t1, d) in tl["segs"].items():
        p = f"build/vo/{sid}.wav"
        if d > 0 and os.path.exists(p):
            v = np.frombuffer(subprocess.check_output(["ffmpeg", "-loglevel", "error", "-i", p, "-f", "f32le", "-ar", str(SR), "-ac", "1", "-"]), np.float32)
            i = int(t0 * SR); vo[i:i + len(v)] += v[:n - i]
    # ambience beds follow the shots (street vs prison), with crossfades
    street = verb(loop_to(babble_clip(), n), IR_STREET, 0.3)[:n] * 0.5 + pan(loop_to(sfx_wind(12), n)[:, 0], 0) * 0.15
    prison = (pan(lp(rng.standard_normal(n), 120), 0) * 0.08 + pan(sfx_fire(total + 1), 0.4)[:n] * 0.10
              )
    ext_mask = np.zeros(n); card_mask = np.zeros(n)
    for s in tl["shots"]:
        i0, i1 = int(max(0, s["t0"]) * SR), int(s["t1"] * SR)
        if s["key"] in EXTERIOR: ext_mask[i0:i1] = 1
        if s["key"].startswith("card:"): card_mask[i0:i1] = 1
    ext_mask = uniform_filter1d(ext_mask, int(0.6 * SR)); card_mask = uniform_filter1d(card_mask, int(0.6 * SR))
    amb = (street * ext_mask[:, None] + prison * (1 - ext_mask[:, None])) * (1 - 0.7 * card_mask[:, None])
    # periodic prison details: distant chains + drips, only in interior stretches
    for tt in np.arange(20, total, 17.0):
        i = int(tt * SR)
        if ext_mask[i] < 0.5:
            c = (sfx_chains() if (int(tt) // 17) % 2 else sfx_drip()) * 0.05
            fx[i:i + len(c)] += c[:n - i]
    # cued SFX
    SFX = {"chains": sfx_chains, "keys": sfx_keys, "coins": sfx_coins, "clank": sfx_clank, "lock": sfx_lock,
           "footsteps_stone": lambda: sfx_footsteps(True, 4.5), "footsteps_mud": lambda: sfx_footsteps(False, 5.0, 0.6),
           "door_creak": sfx_door_creak, "door_slam": sfx_door_slam, "boom": sfx_boom, "bells": sfx_bells,
           "wind": lambda: sfx_wind(7), "drip": sfx_drip, "squeak": sfx_squeak, "hammer": sfx_hammer,
           "hooves": lambda: sfx_hooves(6), "water": lambda: sfx_water(6), "night": lambda: sfx_wind(8) * 0.6,
           "crowd": lambda: verb(babble_clip()[:6 * SR], IR_STREET, 0.3) * 0.2, "murmur": lambda: verb(lp(babble_clip()[:7 * SR], 900), IR_STONE, 0.6) * 0.15,
           "shout": lambda: sfx_shout()}
    for sid, (t0, t1, d) in tl["segs"].items():
        for name, off in segs[sid].get("sfx", []):
            c = SFX[name](); c = c if c.ndim == 2 else pan(c, 0)
            i = int((t0 + off) * SR); fx[i:i + len(c)] += c[:n - i]
    # music sections by segment id ranges
    def st(sid): return tl["segs"][sid][0]
    sections = [(0.0, st("title"), "tension"), (st("title"), st("s62"), "dark"), (st("s62"), st("s73"), "pulse"),
                (st("s73"), st("s87"), "dark"), (st("s87"), total, "finale")]
    music = music_bed(total, sections)[:n]
    # sidechain duck under narration
    vo_env = uniform_filter1d(np.abs(vo), int(0.25 * SR))
    duck = 1 - 0.65 * np.clip(vo_env / 0.03, 0, 1)
    music *= duck[:, None]; amb *= (0.55 + 0.45 * duck)[:, None]
    vo = hp(vo, 70)
    vo_st = verb(vo, IR_VOICE, 0.10)[:n] * math.sqrt(2)
    master = vo_st * 1.0 + music * 0.40 + amb * 0.10 + fx * 0.35
    fade = np.minimum(1, np.arange(n) / SR / 0.5) * np.clip((total + 0.5 - np.arange(n) / SR) / 1.5, 0, 1)
    master *= fade[:, None]
    import soundfile as sf
    sf.write("build/mix_raw.wav", norm(master, 0.95), SR)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", "build/mix_raw.wav", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11",
                    "-ar", str(SR), "build/mix.wav"], check=True)
    print("mix done", total)

def sfx_shout():
    p = "build/sfx/shout.mp3"
    if not os.path.exists(p):
        import certifi, asyncio
        certifi.where = lambda: "/root/.ccr/ca-bundle.crt"
        import edge_tts
        asyncio.run(edge_tts.Communicate("Thief! Stop! Thief!", "en-GB-SoniaNeural", rate="+25%", pitch="+30Hz",
                                         volume="+50%", proxy=os.environ.get("HTTPS_PROXY")).save(p))
    v = np.frombuffer(subprocess.check_output(["ffmpeg", "-loglevel", "error", "-i", p, "-f", "f32le", "-ar", str(SR), "-ac", "1", "-"]), np.float32)
    v = np.tanh(hp(v.astype(np.float64), 300) * 3)       # a little strain / distance
    return verb(v, IR_STREET, 0.4) * 0.35

if __name__ == "__main__":
    mix()
