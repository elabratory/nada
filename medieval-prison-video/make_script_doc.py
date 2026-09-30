"""Writes SCRIPT.md: narration, shot list, on-screen text and sound cues, from script_data.py."""
import json, os, string
from script_data import SEGMENTS, PROMPTS, HERO, KEEPER, GUARD, OLD, CLERK
tl = json.load(open("build/timeline.json")) if os.path.exists("build/timeline.json") else None
def ts(t): return f"{int(t//60)}:{t%60:04.1f}"
L = ["# Why You Wouldn't Survive a Medieval Prison: script and shot list", "",
     "## Recurring characters (fixed prompt descriptions)", "",
     f"- **You (the prisoner):** {HERO}", f"- **The keeper:** {KEEPER}", f"- **The guard:** {GUARD}",
     f"- **Fellow prisoner:** {OLD}", f"- **Court official:** {CLERK}", "",
     "## Full narration", ""]
para = []
for s in SEGMENTS:
    if s.get("chapter"):
        L.append(" ".join(para)); L.append(""); para = []
        L.append(f"### Chapter {s['chapter'][0]}: {string.capwords(s['chapter'][1].lower())}"); L.append("")
    if s.get("title"):
        L.append(" ".join(para)); L.append(""); para = []; L.append("*[Title card]*"); L.append("")
    if s["id"] == "s87":
        L.append(" ".join(para)); L.append(""); para = []; L.append("### Final section"); L.append("")
    para.append(s["text"])
L.append(" ".join(para)); L.append("")
L += ["## Shot list", "", "| Time | Line | Shot | Camera | Transition | On-screen text | Sound |", "|---|---|---|---|---|---|---|"]
for s in SEGMENTS:
    t0 = ts(tl["segs"][s["id"]][0]) if tl else ""
    for i, (k, mv, w) in enumerate(s["shots"]):
        desc = k if k.startswith("card:") else k + ": " + PROMPTS[k][0][:90] + "…"
        trans = "dip to black" if i == 0 and (s.get("chapter") or s.get("title")) else "crossfade"
        txt = ""
        if i == 0:
            txt = " / ".join(x for x in [("CHAPTER %s: %s" % s["chapter"]) if s.get("chapter") else "", s.get("text_overlay", ""),
                                          "TITLE" if s.get("title") else ""] if x)
        snd = ", ".join(n for n, _ in s.get("sfx", [])) if i == 0 else ""
        L.append(f"| {t0 if i == 0 else ''} | {s['id'] if i == 0 else ''} | {desc} | {mv} | {trans} | {txt} | {snd} |")
open("SCRIPT.md", "w").write("\n".join(L))
print("words", sum(len(s["text"].split()) for s in SEGMENTS))
