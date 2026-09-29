# ClipForge AI

Turn long videos into viral short clips. Upload a video and let AI find the best moments.

**Upload → Transcribe → Find best moments → Create clips → Captions → Download**

## Quick start

Requirements: **Node.js 20+** (FFmpeg is bundled automatically via `ffmpeg-static`, so you don't need to install it).

```bash
npm install      # also downloads a static FFmpeg binary
npm run dev      # open http://localhost:3000
```

Then click **Add API keys** (top right) and paste your two keys. They're saved to `.env.local` on your computer.

For a production build: `npm run build && npm start`.

## API keys

The easiest way is the **Add API keys** button in the app. The app also asks for them the first time you click "Find Best Clips". Keys can only be saved from the machine running the app (localhost), and the app never sends them back to the browser.

You can also edit `.env.local` by hand (`cp .env.example .env.local`):

| Variable            | Used for                                                                                                 | Get it                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `OPENAI_API_KEY`    | Speech-to-text with word-level timestamps (Whisper, `whisper-1`)                                          | https://platform.openai.com/api-keys           |
| `ANTHROPIC_API_KEY` | Analysing the transcript to pick the best moments + locating the speaker in frame (Claude, `claude-opus-5-5`) | https://console.anthropic.com/settings/keys    |

Optional: `CLAUDE_MODEL` to override the model, `FFMPEG_PATH` to use your own FFmpeg (it must include libass).

If you edit `.env.local` by hand, restart `npm run dev`. `npm run check` verifies Node, FFmpeg/libass and the keys.

## How it works

1. **Upload**: the file is streamed straight to `storage/uploads/<id>/` (MP4, MOV and WebM, up to 4 GB) with live progress.
2. **Extract audio**: FFmpeg pulls a mono 16 kHz MP3 in 10-minute chunks, so any length stays under Whisper's 25 MB limit.
3. **Transcribe**: Whisper returns word timestamps. Punctuation is re-attached so the transcript can be split into sentences.
4. **Find best moments**: Claude reads the numbered sentences and returns clip ranges as *sentence indices*. Clips therefore always start and end on sentence boundaries. It scores each range for hooks, complete thoughts, emotion, humour and the chosen style. Ranges are then clamped to 15–60 s and overlapping picks are removed.
5. **Create clips**: FFmpeg cuts each range and converts it to 1080×1920:
   - *Follow speaker* (default): Claude looks at three frames and gives the speaker's horizontal position, and the 9:16 crop is centred on them. If nobody is visible, the clip falls back to full frame.
   - *Full frame*: the whole picture sits over a blurred copy of itself.
6. **Captions**: word-timed captions (1–3 words, current word highlighted) are generated as ASS subtitles and burned in with libass, using the bundled Montserrat font.
7. **Download**: each clip card has a preview, title, duration and a Download button. "Generate Again" reuses the cached transcript, so trying a different style or count is fast.

Everything is stored on disk under `storage/`, with no database. Delete that folder at any time to free space.

## Project layout

```
app/                 Next.js App Router (UI + API routes)
  api/upload         streaming upload
  api/jobs           start a job / poll job status
  api/media          serves videos with HTTP Range support + downloads
components/          Landing, Studio (options), Processing, Results
lib/
  transcribe.ts      audio extraction + Whisper
  analyze.ts         sentence building + Claude clip selection
  speaker.ts         Claude vision speaker locator
  captions.ts        ASS caption generation
  render.ts          FFmpeg cut / 9:16 reframe / burn-in
  jobs.ts            the pipeline, progress persisted to storage/jobs/<id>/job.json
assets/fonts/        caption font (SIL Open Font License)
```

## Troubleshooting

- **"Missing OPENAI_API_KEY / ANTHROPIC_API_KEY"**: create `.env.local` from `.env.example` and restart the dev server.
- **FFmpeg not found after install**: your network may have blocked the `ffmpeg-static` binary download. Re-run `npm install`, or install FFmpeg yourself and set `FFMPEG_PATH`.
- **A MOV preview won't play in the browser**: some MOV files (e.g. HEVC from iPhones) aren't supported by every browser. Processing still works, and the generated clips are always H.264 MP4.
