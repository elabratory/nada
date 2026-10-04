# UFC 332: Top 5 Finishes, ranked

Two videos come from the same six timestamps:

- **Short** (`ufc-332-top-5-short.mp4`, 58 s, 1080×1920): the "Ranking …" style. A coloured title sits in the black top bar, the clip fills the middle, and a 1–5 list down the left fills in as each finish lands. It goes #5 to #1, each with a slow-mo replay. Settings are in `short.json`.
- **Long** (`ufc-332-top-5-finishes.mp4`, 3:40, 1920×1080): a countdown with title cards, an honourable mention, and on-screen quotes. Settings are in `timeline.json`.

There's no voiceover in either.

## The ranking (and why)

UFC 332 (Salt Lake City, 3 Oct 2026) set records with 11 knockouts, nine of them in round 1. The UFC skipped Fight of the Night and gave four $100K Performance bonuses: Pinas, Walker, Rodriguez and Kopylov. The ranking follows what media and fans said afterwards:

| Rank | Finish | What people said |
|------|--------|------------------|
| #1 | **Damian Pinas** KO (uppercut) of Andrey Pulyaev, R1 1:15 | The most talked-about finish. Called "the highlight of the night" and "one of the cleanest one-punch knockouts of the year." Joe Rogan said Pinas "might be the scariest guy in the division." |
| #2 | **Johnny Walker** KO (clinch knee) of Mick Parkin, R1 3:35 | His heavyweight debut, described as "absurd" and "absolutely violent." Bonus. |
| #3 | **Imanol Rodriguez** TKO (body kick) of Alden Coria, R1 3:11 | "Gut-wrenching." Coria's scream was audible on the broadcast. Bonus. |
| #4 | **Payton Talbott** TKO of Deiveson Figueiredo, R1 2:09 | Co-main event. Named the night's "biggest winner" for beating his second former champion in as many fights. |
| #5 | **Roman Kopylov** TKO of Ateba Gautier, R1 3:12 | Ended the hyped prospect's unbeaten UFC run. Bonus. |
| HM | **Anthony Wint** TKO of Lucas Armand, R1 0:23 | Fastest finish of the night. It went viral, with 30K+ views in 30 minutes. |

Sources: [UFC.com main card](https://www.ufc.com/news/ufc-332-silva-vs-wang-results), [UFC.com prelims](https://www.ufc.com/news/ufc-332-silva-vs-wang-prelims-results), [Bleacher Report](https://bleacherreport.com/articles/25505975-real-winners-and-losers-ufc-332), [Yahoo on the bonuses](https://sports.yahoo.com/articles/ufc-332-packed-finishes-champion-030338030.html), [LowKick on the reaction to Pinas](https://www.lowkickmma.com/damian-pinas-andrey-pulyaev-ufc-332-uppercut-ko/), [Yahoo on Walker](https://sports.yahoo.com/mma/article/ufc-332-results-johnny-walker-destroys-mick-parkin-with-absurd-knee-ko-in-heavyweight-debut-220542963.html), [Yahoo on Rodriguez](https://sports.yahoo.com/articles/ufc-332-video-imanol-rodriguez-001040239.html), [MMAmania winners and losers](https://www.mmamania.com/ufc-332-fight-card-start-time-live-stream-silva-vs-cong/476769/ufc-332-results-biggest-winners-loser-for-silva-vs-wang-last-night).

## 1. Add the video

Download [Catch EVERY Finish From UFC 332 (Fox Sports Australia)](https://youtu.be/nYeTcY-sJZg) and save it as:

```
content/ufc-332-top-5-finishes/sources/ufc332.mp4
```

## 2. Fill in six timestamps

Open `timeline.json`. At the top there's a `marks` list. Watch the video and replace each `null` with the time in **the video you downloaded** when that moment happens:

| Mark | Set it to the moment… |
|------|------------------------|
| `wint` | the opening bell of Wint vs Armand |
| `kopylov` | Kopylov's straight left lands |
| `talbott` | Talbott's right hand drops Figueiredo |
| `rodriguez` | Rodriguez's front kick lands to the body |
| `walker` | Walker's clinch knee lands |
| `pinas` | Pinas' uppercut lands |

Example: `"pinas": "4:37"` (decimals work too, e.g. `"4:37.5"`).

Each mark drives two clips: the live finish (from about 12 seconds before) and the slow-motion replay of that exact strike. If a replay looks off, nudge the mark by half a second.

**If the video only shows the replay of a finish:** use the replay's timestamp. It still works.

## 3. Build

```bash
npm run short -- content/ufc-332-top-5-finishes                 # the vertical Short
npm run compilation -- content/ufc-332-top-5-finishes           # the long 16:9 version
```

Add `--fast` to either command for a quick check. Any mark you haven't filled in shows as a red slide telling you which one to set.

### Tweaking the Short (`short.json`)

| Field | What it does |
|-------|--------------|
| `title` | The two-line title, as `[text, colour]` pairs (white, yellow, blue, red). `["\n"]` starts the second line. |
| `label` | The text that fills that rank's slot, e.g. `"Shadow realm"` |
| `start` / `end` | The live clip, relative to the mark, e.g. `"pinas-5"` to `"pinas+3"` |
| `reveal` | When the label pops into its slot (defaults to the moment of impact) |
| `replay` | The slow-mo replay window and `speed` (0.5 = half speed) |
| `cropX` | If a fighter is cut off at the side, slide the crop: `0` = left, `0.5` = centre, `1` = right |

Optional: drop a no-copyright track in as `music.mp3`.
