"use client";

import { useEffect, useState } from "react";
import { STAGES, type ImportStatus, type Job } from "@/lib/types";
import { Button, Icon } from "./ui";

export function Uploading({ name, loaded, total }: { name: string; loaded: number; total: number }) {
  const pct = total ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
  const finishing = pct >= 100;
  return (
    <Shell>
      <p className="text-[13px] font-medium uppercase tracking-[0.12em] text-mute">{finishing ? "Checking video" : "Uploading"}</p>
      <p className="mt-3 truncate text-2xl font-semibold tracking-tight">{name}</p>
      <div className="mt-8 flex items-end justify-between">
        <span className="font-serif text-7xl italic leading-none">{pct}%</span>
        <span className="pb-1 text-sm text-mute">
          {(loaded / 1024 ** 2).toFixed(1)} / {(total / 1024 ** 2).toFixed(1)} MB
        </span>
      </div>
      <Bar pct={pct} pulse={finishing} />
    </Shell>
  );
}

export function Importing({ status, onCancel }: { status: ImportStatus; onCancel: () => void }) {
  const failed = status.state === "error";
  return (
    <Shell>
      <p className={`text-[13px] font-medium uppercase tracking-[0.12em] ${failed ? "text-ember" : "text-mute"}`}>{failed ? "Couldn't fetch the video" : "Fetching video"}</p>
      <p className="mt-3 break-all text-[15px] text-white/70">{status.url}</p>
      {failed ? (
        <>
          <p className="mt-5 whitespace-pre-wrap break-words rounded-2xl border border-line bg-ink p-4 text-[14px] leading-relaxed text-white/80">{status.error}</p>
          <Button className="mt-6" variant="outline" onClick={onCancel}>
            Back
          </Button>
        </>
      ) : (
        <>
          <div className="mt-8 flex items-end justify-between">
            <span className="font-serif text-7xl italic leading-none">{status.progress}%</span>
          </div>
          <Bar pct={status.progress} pulse />
          <p className="mt-4 min-h-6 text-[15px] text-white/75">{status.message}</p>
        </>
      )}
    </Shell>
  );
}

function elapsed(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

export default function Processing({ job, onBack, onRetry }: { job: Job; onBack: () => void; onRetry: () => void }) {
  const failed = job.stage === "error";
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <Shell wide>
      {failed ? (
        <>
          <p className="text-[13px] font-medium uppercase tracking-[0.12em] text-ember">Processing failed</p>
          <p className="mt-3 text-2xl font-semibold tracking-tight">We couldn&apos;t finish your clips.</p>
          <p className="mt-4 whitespace-pre-wrap break-words rounded-2xl border border-line bg-ink p-4 font-mono text-[13px] leading-relaxed text-white/75">{job.error}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={onRetry}>{Icon.refresh} Try again</Button>
            <Button variant="outline" onClick={onBack}>
              Change settings
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-[13px] font-medium uppercase tracking-[0.12em] text-mute">
            {job.options.mode === "ranking" ? "Building your ranking" : "Forging your clips"}
          </p>
          <div className="mt-6 flex items-end justify-between gap-4">
            <span className="font-serif text-7xl italic leading-none">{job.progress}%</span>
            {job.clips.length > 0 && <span className="pb-1 text-sm text-mute">{job.clips.length} clips</span>}
          </div>
          <Bar pct={job.progress} pulse />
          <p className="mt-4 min-h-6 text-[15px] text-white/75">{job.message}</p>
        </>
      )}

      <ol className="mt-8 space-y-0.5">
        {STAGES.map((s, i) => {
          const st = job.steps[s.key];
          const done = st?.status === "done";
          const active = st?.status === "active";
          const time = st?.startedAt ? elapsed((st.endedAt ?? Date.now()) - st.startedAt) : "";
          return (
            <li key={s.key} className={`flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors ${active ? "bg-white/[0.04]" : ""}`}>
              <span
                className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px] ${
                  done ? "border-ember bg-ember text-ink" : active ? "border-ember text-ember" : "border-line text-mute"
                }`}
              >
                {done ? Icon.check : active ? <span className="h-2 w-2 animate-pulse rounded-full bg-ember" /> : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-3">
                  <span className={done || active ? "text-white" : "text-mute"}>{s.label}</span>
                  {time && <span className="shrink-0 text-[12px] tabular-nums text-mute">{time}</span>}
                </span>
                {st?.detail && <span className="mt-0.5 block text-[13px] text-mute">{st.detail}</span>}
              </span>
            </li>
          );
        })}
      </ol>
      {!failed && <p className="mt-6 text-[13px] text-mute">Long videos can take a few minutes. You can leave this tab open — progress is saved.</p>}
    </Shell>
  );
}

function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main className={`mx-auto px-5 pb-20 pt-10 sm:pt-16 ${wide ? "max-w-2xl" : "max-w-xl"}`}>
      <div className="rounded-3xl border border-line bg-coal p-6 sm:p-9 animate-rise">{children}</div>
    </main>
  );
}

export function Bar({ pct, pulse }: { pct: number; pulse?: boolean }) {
  return (
    <div className="relative mt-5 h-2 overflow-hidden rounded-full bg-white/[0.07]">
      <div className="h-full rounded-full bg-ember transition-[width] duration-500 ease-out" style={{ width: `${Math.max(2, pct)}%` }} />
      {pulse && <div className="absolute inset-y-0 w-24 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent animate-scan" />}
    </div>
  );
}
