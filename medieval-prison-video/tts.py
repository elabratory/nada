"""Narration: one continuous edge-tts take per chapter (natural flow between lines), then split into
per-segment clips at word boundaries so the edit can sync pictures and add dramatic pauses.
Writes build/vo/<id>.wav and build/vo/durations.json."""
import certifi, os, re, asyncio, json, subprocess, difflib
certifi.where = lambda: "/root/.ccr/ca-bundle.crt"   # agent proxy CA
import numpy as np, soundfile as sf
import edge_tts
from script_data import SEGMENTS

VOICE = os.environ.get("VOICE", "en-US-BrianMultilingualNeural")
RATE = os.environ.get("RATE", "-3%")
PITCH = os.environ.get("PITCH", "-4Hz")
OUT = "build/vo"
SR = 48000
# spoken-only respellings (on-screen text keeps the historical spelling)
SUBS = {"gaols": "jails", "gaol": "jail", "Gruffudd ap Llywelyn": "Griffith ap Hlewellin",
        "forte et dure": "fort ay dure", "atte Grene": "atta Green", "Southwark": "Suthuck"}
def spoken(t):
    for a, b in SUBS.items():
        t = t.replace(a, b)
    return t

def words(t):
    return re.findall(r"[a-z0-9']+", t.lower().replace("-", " "))

def blocks():
    cur = []
    for s in SEGMENTS:
        if (s.get("chapter") or s.get("title") or s["id"] == "s87") and cur:
            yield cur; cur = []
        if s["text"]:
            cur.append(s)
    if cur: yield cur

async def take(text, path):
    bounds = []
    for attempt in range(5):
        try:
            bounds = []
            com = edge_tts.Communicate(text, VOICE, rate=RATE, pitch=PITCH, boundary="WordBoundary",
                                       proxy=os.environ.get("HTTPS_PROXY"))
            with open(path, "wb") as fh:
                async for ch in com.stream():
                    if ch["type"] == "audio": fh.write(ch["data"])
                    elif ch["type"] == "WordBoundary":
                        bounds.append((ch["offset"] / 1e7, (ch["offset"] + ch["duration"]) / 1e7, ch["text"]))
            return bounds
        except Exception as e:
            print("retry", e); await asyncio.sleep(2 ** attempt)
    raise RuntimeError("tts failed")

async def main():
    os.makedirs(OUT, exist_ok=True)
    durs = {}
    for bi, blk in enumerate(blocks()):
        mp3 = f"{OUT}/block{bi}.mp3"
        text = " ".join(spoken(s["text"]) for s in blk)
        bounds = await take(text, mp3)
        audio = np.frombuffer(subprocess.check_output(["ffmpeg", "-loglevel", "error", "-i", mp3, "-f", "f32le",
                                                       "-ar", str(SR), "-ac", "1", "-"]), np.float32)
        # align boundary words to script words
        bw, bt = [], []
        for st, en, w in bounds:
            for x in words(w):
                bw.append(x); bt.append((st, en))
        sw, owner = [], []
        for k, s in enumerate(blk):
            for x in words(spoken(s["text"])):
                sw.append(x); owner.append(k)
        sm = difflib.SequenceMatcher(None, sw, bw, autojunk=False)
        first = [None] * len(blk); last = [None] * len(blk)
        for a, b, n in sm.get_matching_blocks():
            for j in range(n):
                k = owner[a + j]; st, en = bt[b + j]
                if first[k] is None: first[k] = st
                last[k] = en
        cuts = [0.0]
        for k in range(1, len(blk)):
            e_prev = last[k - 1] if last[k - 1] is not None else cuts[-1]
            s_next = first[k] if first[k] is not None else e_prev
            cuts.append((e_prev + s_next) / 2)
        cuts.append(len(audio) / SR)
        for k, s in enumerate(blk):
            a, b = int(cuts[k] * SR), int(cuts[k + 1] * SR)
            clip = audio[a:b].copy()
            f = min(len(clip), int(0.012 * SR))
            clip[:f] *= np.linspace(0, 1, f); clip[-f:] *= np.linspace(1, 0, f)
            sf.write(f"{OUT}/{s['id']}.wav", clip, SR)
            durs[s["id"]] = len(clip) / SR
        print(f"block {bi}: {len(blk)} lines, {len(audio)/SR:.1f}s, unmatched first={sum(x is None for x in first)}", flush=True)
    json.dump(durs, open(f"{OUT}/durations.json", "w"), indent=1)
    tot = sum(durs.values()) + sum(s.get("pause", 0) for s in SEGMENTS) + sum(s.get("hold", 0) for s in SEGMENTS)
    print(f"speech {sum(durs.values()):.1f}s  total est {tot:.1f}s = {tot/60:.2f} min")

asyncio.run(main())
