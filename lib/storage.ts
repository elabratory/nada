import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const STORAGE_ROOT = path.join(process.cwd(), "storage");
export const UPLOADS_DIR = path.join(STORAGE_ROOT, "uploads");
export const JOBS_DIR = path.join(STORAGE_ROOT, "jobs");
export const FONTS_DIR = path.join(process.cwd(), "public", "fonts");

const ID_RE = /^[a-z0-9]{8,40}$/;

export function newId(): string {
  return crypto.randomBytes(9).toString("hex");
}

export function isValidId(id: string): boolean {
  return ID_RE.test(id);
}

export function uploadDir(videoId: string): string {
  if (!isValidId(videoId)) throw new Error("Invalid video id");
  return path.join(UPLOADS_DIR, videoId);
}

export function jobDir(jobId: string): string {
  if (!isValidId(jobId)) throw new Error("Invalid job id");
  return path.join(JOBS_DIR, jobId);
}

export function mediaUrl(...parts: string[]): string {
  return "/api/media/" + parts.map(encodeURIComponent).join("/");
}

export async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

/** Atomic write so pollers never read a half-written file. */
export async function writeJson(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, file);
}
