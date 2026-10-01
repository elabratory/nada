"""Split ElevenLabs chapter takes (build/el/blockN.mp3) into per-line clips using local word timestamps
(faster-whisper) aligned to the script. Writes build/vo/<id>.wav and build/vo/durations.json."""
import json, os, re, sys, subprocess, difflib
import numpy as np, soundfile as sf
from faster_whisper import WhisperModel
SR = 48000
blocks = json.load(open("build/el_blocks.json"))
from script_data import SEGMENTS
seg_text = {s["id"]: s["text"] for s in SEGMENTS}
SUBS = {"gaols": "jails", "gaol": "jail", "Gruffudd ap Llywelyn": "Griffith ap Llewellyn", "forte et dure": "fort ay dure",
        "atte Grene": "atta Green", "Southwark": "Suthuck"}
def spoken(t):
    for a, b in SUBS.items(): t = t.replace(a, b)
    return t
NUM = {"1322": "thirteen twenty two"}
def words(t): return re.findall(r"[a-z0-9']+", t.lower().replace("-", " "))

model = WhisperModel("small.en", device="cpu", compute_type="int8")
durs = json.load(open("build/vo/durations.json")) if os.path.exists("build/vo/durations.json") else {}
todo = [int(a) for a in sys.argv[1:]] or [b["block"] for b in blocks]
for b in blocks:
    if b["block"] not in todo: continue
    mp3 = f"build/el/block{b['block']}.mp3"
    audio = np.frombuffer(subprocess.check_output(["ffmpeg", "-loglevel", "error", "-i", mp3, "-f", "f32le", "-ar", str(SR), "-ac", "1", "-"]), np.float32)
    segs, _ = model.transcribe(mp3, word_timestamps=True, language="en", beam_size=1)
    bw, bt = [], []
    for sgm in segs:
        for w in sgm.words:
            for x in words(w.word):
                bw.append(x); bt.append((w.start, w.end))
    sw, owner = [], []
    for k, sid in enumerate(b["ids"]):
        for x in words(spoken(seg_text[sid])):
            sw.append(x); owner.append(k)
    sm = difflib.SequenceMatcher(None, sw, bw, autojunk=False)
    n = len(b["ids"]); first = [None] * n; last = [None] * n
    for a, c, m in sm.get_matching_blocks():
        for j in range(m):
            k = owner[a + j]; st, en = bt[c + j]
            if first[k] is None: first[k] = st
            last[k] = en
    cuts = [0.0]
    for k in range(1, n):
        e_prev = last[k - 1] if last[k - 1] is not None else cuts[-1]
        s_next = first[k] if first[k] is not None else e_prev
        cuts.append(min(s_next - 0.04, (e_prev + s_next) / 2) if s_next > e_prev else e_prev)
    cuts.append(len(audio) / SR)
    for k, sid in enumerate(b["ids"]):
        a0, a1 = int(cuts[k] * SR), int(cuts[k + 1] * SR)
        clip = audio[a0:a1].copy(); f = min(len(clip), int(0.015 * SR))
        clip[:f] *= np.linspace(0, 1, f); clip[-f:] *= np.linspace(1, 0, f)
        sf.write(f"build/vo/{sid}.wav", clip, SR); durs[sid] = len(clip) / SR
    print(f"block {b['block']}: {len(audio)/SR:.1f}s matched words {sum(m for _,_,m in sm.get_matching_blocks())}/{len(sw)} missing-first {sum(x is None for x in first)}", flush=True)
json.dump(durs, open("build/vo/durations.json", "w"), indent=1)
