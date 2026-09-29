"use client";

import type { ReactNode } from "react";
import { DEFAULT_OVERLAY, SUBTITLE_PRESETS } from "@/lib/defaults";
import type { OverlayStyle, SubtitleStyle, Weight } from "@/lib/types";

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-medium uppercase tracking-[0.1em] text-mute">{label}</span>
        {hint && <span className="text-[12px] tabular-nums text-white/50">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl bg-ink p-1">
      {options.map(([v, label]) => (
        <button
          key={String(v)}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={`min-h-8 flex-1 rounded-lg px-2 text-[13px] font-semibold transition-colors ${
            value === v ? "bg-white text-ink" : "text-white/60 hover:bg-white/5 hover:text-white"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-[14px]">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${checked ? "bg-ember" : "bg-white/15"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${checked ? "left-[18px]" : "left-0.5"}`} />
      </button>
    </label>
  );
}

function Color({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-[13px] text-white/75">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-10 cursor-pointer rounded-md border border-line bg-transparent" aria-label={label} />
      {label}
    </label>
  );
}

function Slider({ value, min, max, step = 1, onChange, label }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; label: string }) {
  return <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} aria-label={label} className="w-full" />;
}

const WEIGHTS: [Weight, string][] = [
  [500, "Medium"],
  [700, "Bold"],
  [800, "Extra"],
  [900, "Black"],
];

export function OverlayPanel({ value, onChange }: { value: OverlayStyle; onChange: (patch: Partial<OverlayStyle>) => void }) {
  const centered = value.x === 50 && value.y === 50;
  return (
    <div className="grid gap-5">
      <Toggle label="Show title overlay" checked={value.enabled} onChange={(enabled) => onChange({ enabled })} />
      <div className={`grid gap-5 ${value.enabled ? "" : "pointer-events-none opacity-40"}`}>
        <div className="grid grid-cols-2 gap-3">
          <Toggle label="Rank number" checked={value.showRank} onChange={(showRank) => onChange({ showRank })} />
          <Toggle label="Title" checked={value.showTitle} onChange={(showTitle) => onChange({ showTitle })} />
        </div>
        <Field label="Position" hint={centered ? "Centred" : `${Math.round(value.x)}% · ${Math.round(value.y)}%`}>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-ink p-1">
            {[
              [50, 22, "Top"],
              [50, 50, "Center"],
              [50, 75, "Bottom"],
            ].map(([x, y, label]) => (
              <button
                key={label}
                type="button"
                onClick={() => onChange({ x: x as number, y: y as number })}
                className={`h-8 rounded-lg text-[13px] font-semibold ${value.x === x && value.y === y ? "bg-white text-ink" : "text-white/60 hover:text-white"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 text-[12px] text-mute">
            <span>Horizontal</span>
            <Slider label="Horizontal position" value={value.x} min={0} max={100} onChange={(x) => onChange({ x })} />
            <span>Vertical</span>
            <Slider label="Vertical position" value={value.y} min={0} max={100} onChange={(y) => onChange({ y })} />
          </div>
          {!centered && (
            <button type="button" onClick={() => onChange({ x: DEFAULT_OVERLAY.x, y: DEFAULT_OVERLAY.y })} className="justify-self-start text-[13px] text-ember hover:underline">
              Reset to centre
            </button>
          )}
        </Field>
        <Field label="Font size" hint={`${value.fontSize}px`}>
          <Slider label="Font size" value={value.fontSize} min={32} max={120} onChange={(fontSize) => onChange({ fontSize })} />
        </Field>
        <Field label="Font weight">
          <Segmented value={value.fontWeight} options={WEIGHTS} onChange={(fontWeight) => onChange({ fontWeight })} />
        </Field>
        <Toggle label="ALL CAPS" checked={value.uppercase} onChange={(uppercase) => onChange({ uppercase })} />
        <div className="flex flex-wrap gap-4">
          <Color label="Text" value={value.color} onChange={(color) => onChange({ color })} />
          <Color label="Rank" value={value.rankColor} onChange={(rankColor) => onChange({ rankColor })} />
        </div>
        <Field label="Background">
          <Segmented
            value={value.background}
            options={[
              ["none", "None"],
              ["box", "Box"],
              ["band", "Band"],
            ]}
            onChange={(background) => onChange({ background })}
          />
        </Field>
        {value.background !== "none" && (
          <div className="grid gap-3">
            <Color label="Background colour" value={value.bgColor} onChange={(bgColor) => onChange({ bgColor })} />
            <Field label="Opacity" hint={`${value.bgOpacity}%`}>
              <Slider label="Background opacity" value={value.bgOpacity} min={0} max={100} onChange={(bgOpacity) => onChange({ bgOpacity })} />
            </Field>
          </div>
        )}
        <Field label="Shadow / outline">
          <Segmented
            value={value.effect}
            options={[
              ["none", "None"],
              ["shadow", "Shadow"],
              ["outline", "Outline"],
              ["both", "Both"],
            ]}
            onChange={(effect) => onChange({ effect })}
          />
        </Field>
        <Field label="Animation">
          <Segmented
            value={value.animation}
            options={[
              ["none", "None"],
              ["fade", "Fade"],
              ["pop", "Pop"],
              ["slide", "Slide"],
            ]}
            onChange={(animation) => onChange({ animation })}
          />
        </Field>
        <Field label="On screen">
          <Segmented
            value={value.timing}
            options={[
              ["full", "Whole clip"],
              ["intro", "First 3 s"],
              ["dock", "Intro → top"],
            ]}
            onChange={(timing) => onChange({ timing })}
          />
        </Field>
      </div>
    </div>
  );
}

export function SubtitlePanel({ value, onChange }: { value: SubtitleStyle; onChange: (patch: Partial<SubtitleStyle>) => void }) {
  return (
    <div className="grid gap-5">
      <Toggle label="Show subtitles" checked={value.enabled} onChange={(enabled) => onChange({ enabled })} />
      <div className={`grid gap-5 ${value.enabled ? "" : "pointer-events-none opacity-40"}`}>
        <Field label="Style">
          <Segmented
            value={value.preset}
            options={[
              ["bold", "Bold pop"],
              ["clean", "Clean"],
              ["boxed", "Boxed"],
              ["karaoke", "Karaoke"],
            ]}
            onChange={(preset) => onChange({ preset, ...SUBTITLE_PRESETS[preset] })}
          />
        </Field>
        <Field label="Position">
          <Segmented
            value={value.position}
            options={[
              ["top", "Top"],
              ["center", "Center"],
              ["lower", "Lower third"],
              ["bottom", "Bottom"],
            ]}
            onChange={(position) => onChange({ position })}
          />
        </Field>
        <Field label="Size" hint={`${value.fontSize}px`}>
          <Slider label="Subtitle size" value={value.fontSize} min={36} max={100} onChange={(fontSize) => onChange({ fontSize })} />
        </Field>
        <Field label="Words per phrase" hint={String(value.maxWords)}>
          <Slider label="Words per phrase" value={value.maxWords} min={1} max={6} onChange={(maxWords) => onChange({ maxWords })} />
        </Field>
        <Field label="Font weight">
          <Segmented value={value.fontWeight} options={WEIGHTS} onChange={(fontWeight) => onChange({ fontWeight })} />
        </Field>
        <div className="grid gap-3">
          <Toggle label="ALL CAPS" checked={value.uppercase} onChange={(uppercase) => onChange({ uppercase })} />
          <Toggle label="Highlight the spoken word" checked={value.highlightActive} onChange={(highlightActive) => onChange({ highlightActive })} />
          <Toggle label="Highlight important words" checked={value.highlightEmphasis} onChange={(highlightEmphasis) => onChange({ highlightEmphasis })} />
        </div>
        <div className="flex flex-wrap gap-4">
          <Color label="Text" value={value.color} onChange={(color) => onChange({ color })} />
          <Color label="Spoken" value={value.activeColor} onChange={(activeColor) => onChange({ activeColor })} />
          <Color label="Important" value={value.emphasisColor} onChange={(emphasisColor) => onChange({ emphasisColor })} />
        </div>
        <Field label="Background">
          <Segmented
            value={value.background}
            options={[
              ["none", "None"],
              ["box", "Box"],
            ]}
            onChange={(background) => onChange({ background })}
          />
        </Field>
        <Field label="Shadow / outline">
          <Segmented
            value={value.effect}
            options={[
              ["none", "None"],
              ["shadow", "Shadow"],
              ["outline", "Outline"],
              ["both", "Both"],
            ]}
            onChange={(effect) => onChange({ effect })}
          />
        </Field>
      </div>
    </div>
  );
}
