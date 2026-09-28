import { promises as fs } from "node:fs";
import path from "node:path";

export const KEY_NAMES = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"] as const;
export type KeyName = (typeof KEY_NAMES)[number];

const ENV_FILE = path.join(process.cwd(), ".env.local");

export function keyStatus(): Record<KeyName, boolean> {
  return {
    OPENAI_API_KEY: Boolean(process.env.OPENAI_API_KEY?.trim()),
    ANTHROPIC_API_KEY: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
  };
}

/**
 * Saves keys into .env.local (creating it if needed, keeping any other lines) and applies
 * them to the running server immediately, so no restart is needed.
 */
export async function saveKeys(keys: Partial<Record<KeyName, string>>): Promise<void> {
  let lines: string[] = [];
  try {
    lines = (await fs.readFile(ENV_FILE, "utf8")).split(/\r?\n/);
  } catch {
    lines = ["# ClipForge AI keys (saved from the app). Never commit this file."];
  }
  for (const name of KEY_NAMES) {
    const value = keys[name];
    if (!value) continue;
    const line = `${name}=${value}`;
    const i = lines.findIndex((l) => new RegExp(`^\\s*#?\\s*${name}\\s*=`).test(l));
    if (i >= 0) lines[i] = line;
    else lines.push(line);
    process.env[name] = value;
  }
  const text = lines.join("\n").replace(/\n*$/, "\n");
  await fs.writeFile(ENV_FILE, text, { mode: 0o600 });
}
