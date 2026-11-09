// Fonction d'arrière-plan (jusqu'à 15 min) : exécute une tâche créée par /api/jobs.
import { randomUUID } from "node:crypto";
import { studio, transcribe, STUDIO } from "../lib/ai.mjs";
import { humanError, isId } from "../lib/http.mjs";
import { jobsStore, loadDocs, saveNote } from "../lib/storage.mjs";

export default async (req) => {
  let id;
  try {
    ({ id } = await req.json());
  } catch {
    return;
  }
  if (!isId(id)) return;
  const store = jobsStore();
  const job = await store.get(`job/${id}`, { type: "json" });
  if (!job || job.status !== "pending") return; // déjà traitée (ou inconnue)
  job.status = "running";
  await store.setJSON(`job/${id}`, job);

  try {
    if (job.type === "studio") {
      const { kind, docIds, focus, length } = job.params;
      const docs = await loadDocs(job.uid, docIds);
      const result = await studio(docs, kind, { focus, length });
      const note = {
        id: randomUUID(),
        kind,
        title: `${STUDIO[kind].label} — ${docs.map((d) => d.title).join(", ").slice(0, 120)}`,
        ...result,
        docIds,
        createdAt: new Date().toISOString(),
      };
      if (kind !== "overview") await saveNote(job.uid, note);
      job.result = note;
    } else if (job.type === "ocr") {
      const input = await store.get(`input/${id}`, { type: "json" });
      job.result = { text: await transcribe(input) };
      await store.delete(`input/${id}`);
    }
    job.status = "done";
  } catch (e) {
    console.error(e);
    job.status = "error";
    job.error = humanError(e);
  }
  job.finishedAt = new Date().toISOString();
  await store.setJSON(`job/${id}`, job);
};

export const config = { path: "/api/jobs-run", background: true };
