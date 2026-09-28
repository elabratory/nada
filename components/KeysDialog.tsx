"use client";

import { useState } from "react";
import { Button } from "./ui";

export type KeyStatus = { OPENAI_API_KEY: boolean; ANTHROPIC_API_KEY: boolean };

const FIELDS = [
  {
    name: "OPENAI_API_KEY",
    label: "OpenAI key",
    hint: "Used to transcribe speech",
    placeholder: "sk-proj-…",
    href: "https://platform.openai.com/api-keys",
  },
  {
    name: "ANTHROPIC_API_KEY",
    label: "Anthropic key",
    hint: "Used to find the best moments",
    placeholder: "sk-ant-…",
    href: "https://console.anthropic.com/settings/keys",
  },
] as const;

export default function KeysDialog({
  status,
  onClose,
  onSaved,
}: {
  status: KeyStatus;
  onClose: () => void;
  onSaved: (s: KeyStatus) => void;
}) {
  const [values, setValues] = useState({ OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const missingAfterSave = FIELDS.some((f) => !status[f.name] && !values[f.name].trim());

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "Could not save keys.");
      onSaved(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save keys.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm animate-fade"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="w-full max-w-md rounded-3xl border border-line bg-coal p-6 sm:p-8 animate-rise"
      >
        <h2 className="text-2xl font-semibold tracking-tight">Connect your AI keys</h2>
        <p className="mt-2 text-[15px] text-mute">
          Paste them once. They&apos;re saved on this computer only (in{" "}
          <code className="text-white/70">.env.local</code>
          ).
        </p>

        <div className="mt-6 space-y-5">
          {FIELDS.map((f) => (
            <label key={f.name} className="block">
              <span className="flex items-center justify-between text-[14px] font-medium">
                <span>
                  {f.label} <span className="font-normal text-mute">· {f.hint}</span>
                </span>
                {status[f.name] && <span className="text-[12px] text-emerald-400">Connected ✓</span>}
              </span>
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={values[f.name]}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                placeholder={status[f.name] ? "Leave blank to keep the saved key" : f.placeholder}
                className="mt-2 h-12 w-full rounded-xl border border-line bg-ink px-4 font-mono text-[14px] outline-none transition-colors placeholder:font-sans placeholder:text-white/30 focus:border-ember"
              />
              <a
                href={f.href}
                target="_blank"
                rel="noreferrer"
                className="mt-1.5 inline-block text-[13px] text-ember hover:underline"
              >
                Get a key →
              </a>
            </label>
          ))}
        </div>

        {error && <p className="mt-4 text-[14px] text-ember-soft">{error}</p>}

        <div className="mt-7 flex gap-3">
          <Button type="submit" className="flex-1" disabled={saving || missingAfterSave}>
            {saving ? "Saving…" : "Save keys"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
