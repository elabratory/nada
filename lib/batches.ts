import path from "node:path";
import { getImport, startImport } from "./importer";
import { createJob, getJob, getVideo, requestCompilation } from "./jobs";
import { STORAGE_ROOT, isValidId, newId, readJson, writeJson } from "./storage";
import type { JobOptions } from "./types";

export interface BatchItem {
  url: string;
  videoId?: string;
  jobId?: string;
  error?: string;
}

export interface Batch {
  id: string;
  options: Omit<JobOptions, "videoId">;
  items: BatchItem[];
  createdAt: number;
}

const BATCH_DIR = path.join(STORAGE_ROOT, "batches");
const file = (id: string) => {
  if (!isValidId(id)) throw new Error("Invalid batch id");
  return path.join(BATCH_DIR, `${id}.json`);
};

export async function getBatch(id: string): Promise<Batch | null> {
  return readJson<Batch>(file(id));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Processes several links one after another: import → full pipeline → (ranking mode) the
 * countdown video. One at a time so each video gets the whole machine.
 */
export async function createBatch(urls: URL[], options: Omit<JobOptions, "videoId">): Promise<Batch> {
  const batch: Batch = { id: newId(), options, items: urls.map((u) => ({ url: u.toString() })), createdAt: Date.now() };
  await writeJson(file(batch.id), batch);
  void runBatch(batch, urls).catch((err) => console.error("[clipforge] batch failed:", err));
  return batch;
}

async function runBatch(batch: Batch, urls: URL[]) {
  const save = () => writeJson(file(batch.id), batch);
  for (let i = 0; i < batch.items.length; i++) {
    const item = batch.items[i];
    try {
      const imp = await startImport(urls[i]);
      item.videoId = imp.id;
      await save();
      // Wait for the download.
      for (;;) {
        await sleep(1000);
        if (await getVideo(imp.id)) break;
        const st = await getImport(imp.id);
        if (!st) throw new Error("The import disappeared.");
        if (st.state === "error") throw new Error(st.error || "Import failed.");
      }
      const job = await createJob({ ...batch.options, videoId: imp.id });
      item.jobId = job.id;
      await save();
      for (;;) {
        await sleep(2000);
        const j = await getJob(job.id);
        if (!j) throw new Error("The job disappeared.");
        if (j.stage === "error") throw new Error(j.error || "Processing failed.");
        if (j.stage === "done") break;
      }
      if (batch.options.mode === "ranking") {
        await requestCompilation(job.id);
        for (;;) {
          await sleep(2000);
          const j = await getJob(job.id);
          if (!j || j.compilation.state === "error") throw new Error(j?.compilation.error || "The ranking video failed to render.");
          if (j.compilation.state === "done") break;
        }
      }
    } catch (err) {
      item.error = err instanceof Error ? err.message : String(err);
      await save();
    }
  }
}
