// Fonction d'arrière-plan (jusqu'à 15 min) : exécute une tâche créée par /api/jobs.
import { randomUUID } from "node:crypto";
import { studio, transcribe, STUDIO } from "../lib/ai.mjs";
import { humanError, isId } from "../lib/http.mjs";
import { jobsStore, loadDocs, saveNote } from "../lib/storage.mjs";
import { notifyUser, READY } from "../lib/push.mjs";

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
  let finished = false;
  let progressWrite = Promise.resolve();
  job.status = "running";
  job.startedAt = job.updatedAt = new Date().toISOString();
  await store.setJSON(`job/${id}`, job);

  try {
    if (job.type === "studio") {
      const { kind, docIds, focus, length } = job.params;
      const docs = await loadDocs(job.uid, docIds);
      // Avancement (ex. « diapositive 4 / 10 ») enregistré au plus toutes les 2 s.
      const COUNTERS = { slides: /"layout"\s*:/g, podcast: /"speaker"\s*:/g, quiz: /"question"\s*:/g, flashcards: /"front"\s*:/g, mindmap: /"label"\s*:/g, arbre: /"kind"\s*:/g, infographie: /"points"\s*:/g };
      const TOTALS = { slides: { court: 6, moyen: 10, long: 15 }[length] || 10, podcast: { court: 12, moyen: 24, long: 40 }[length] || 24, quiz: 10 };
      let lastSave = 0;
      const onProgress = (text) => {
        const now = Date.now();
        if (finished || now - lastSave < 2000) return;
        lastSave = now;
        const re = COUNTERS[kind];
        job.progress = re ? { done: (text.match(re) || []).length, total: TOTALS[kind] || null } : { words: text.split(/\s+/).length };
        job.updatedAt = new Date(now).toISOString();
        const snapshot = { ...job };
        progressWrite = progressWrite.then(() => store.setJSON(`job/${id}`, snapshot)).catch(() => {}); // écritures dans l'ordre
      };
      const result = await studio(docs, kind, { focus, length, onProgress });
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
  // L'état final ne doit jamais être écrasé par un avancement encore en route.
  finished = true;
  await progressWrite;
  job.finishedAt = new Date().toISOString();
  delete job.progress;
  await store.setJSON(`job/${id}`, job);

  // Prévenir l'utilisateur (même app fermée) pour les créations du studio.
  if (job.type === "studio" && job.params.kind !== "overview") {
    const kind = job.params.kind;
    await notifyUser(
      job.uid,
      job.status === "done"
        ? { title: `✓ ${READY[kind] || "C'est prêt"}`, body: job.result.title, tag: job.id, url: `/?note=${job.result.id}` }
        : { title: `La création « ${STUDIO[kind]?.label || kind} » a échoué`, body: job.error || "Réessayez.", tag: job.id, url: "/" },
    );
  }
};

export const config = { path: "/api/jobs-run", background: true };
