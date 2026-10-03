# The Most Disrespectful UFC Moments: how to build it

A 10:13 edit made only from three official UFC uploads. It uses on-screen text, with no voiceover. The cut points come from each video's transcript.

## 1. Put the three videos here

Save them in `content/disrespectful-ufc-moments/sources/` with **exactly** these names:

| Save as | Video |
|---------|-------|
| `sources/funniest.mp4` | [FUNNIEST UFC MOMENTS](https://youtu.be/b_q5tzmADAo) (20:39) |
| `sources/press.mp4` | [WILD Press Conference Moments!](https://youtu.be/QCkACl1hn5A) (45:10) |
| `sources/tuf.mp4` | [The Ultimate Fighter's Greatest Moments](https://youtu.be/HYbwHNZ5Zr0) (48:17) |

Use the full, untrimmed videos. The timestamps below assume that. Get the 1080p versions if you can.

Optional: add a no-copyright track as `music.mp3` (for example from the YouTube Audio Library). It plays quietly under the clips at 12% volume.

## 2. Build

```bash
npm install                                                      # first time only
npm run compilation -- content/disrespectful-ufc-moments          # final quality
npm run compilation -- content/disrespectful-ufc-moments --fast   # quick preview
```

Output: `content/disrespectful-ufc-moments/disrespectful-ufc-moments.mp4` (1920×1080).

## What's in it

| At | Moment | From |
|----|--------|------|
| 0:00 | Cold open: McGregor late to his own press conference | press 43:07 |
| 0:14 | **Round 1: Inside the Octagon** | |
| 0:17 | Holloway points at the commentators: "I'm the best boxer in the UFC" | funniest 1:56 |
| 0:53 | Garbrandt's death stare, then "Fight! Fight! Fight!" | funniest 14:26 |
| 1:36 | Adesanya stops Costa: "Too easy… you're mad" | funniest 16:58 |
| 2:17 | **Round 2: Press conference chaos** | |
| 2:20 | McGregor takes Aldo's belt, Dublin | press 14:20 |
| 3:13 | McGregor vs Diaz: bottles flying | press 40:00 |
| 3:49 | Khabib: "Send location… you'll do nothing" | press 26:27 |
| 4:34 | Kevin Lee brings up Chiesa's mom | press 37:39 |
| 5:04 | Topuria: "I walk like a king in your street" | press 7:21 |
| 5:38 | O'Malley vs Garbrandt | press 1:34 |
| 6:08 | Chael Sonnen: "replace him with a $9.99 app" | press 5:09 |
| 6:46 | Covington: "Nobody came here to see him" | press 8:52 |
| 7:12 | McGregor: "Who the f*** is that guy?" | press 41:24 |
| 7:29 | **Round 3: The Ultimate Fighter** | |
| 7:32 | McGregor to Faber: "Dress your age" | tuf 3:43 |
| 7:50 | McGregor vs Garbrandt: "Do something then" | tuf 14:53 |
| 8:28 | McGregor shoves Chandler | tuf 45:36 |
| 9:01 | **Final round: McGregor** | |
| 9:04 | "Sorry I'm late…" | press 42:52 |
| 9:32 | "I run New York City" | press 44:38 |
| 10:07 | End card | |

## Fine-tuning

I picked the cut points from the videos' captions, so a few might start or end a second off. To fix one, open `timeline.json`, find the clip by its `label`, and nudge `start` or `end` (as `"m:ss"`, decimals allowed, e.g. `"14:20.5"`). On-screen text uses `at`, in seconds from the clip's start. Rebuild with `--fast` to check.

**Left out on purpose:** these moments are in the press-conference video but rely on slurs, racial jabs, or mocking a parent. You can add them as clips if you want them:
- Strickland vs Du Plessis, the "your dad" exchange (press 13:00–13:55)
- Covington on Leon Edwards' father (press 22:24–23:08)
- Du Plessis vs Adesanya (press 28:29–30:05)
- The rest of Topuria vs Pimblett (press 8:04–8:53) and Strickland vs Adesanya (press 33:38–34:24)

**Copyright:** this is all UFC footage, so expect Content ID claims when you upload. Usually the UFC takes the ad revenue; sometimes the video gets blocked in some regions.
