// Tâches longues (studio, lecture d'images) : création et suivi.
// Le travail lui-même est fait par la fonction d'arrière-plan « jobs-run ».
import { randomUUID } from "node:crypto";
import { handle, json, body, requireUser, HttpError, checkId } from "../lib/http.mjs";
import { aiEnabled, STUDIO } from "../lib/ai.mjs";
import { jobsStore } from "../lib/storage.mjs";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export default handle(async (req, context) => {
  const user = await requireUser();
  const store = jobsStore();

  if (req.method === "GET" && context.params.id) {
    const job = await store.get(`job/${checkId(context.params.id)}`, { type: "json" });
    if (!job || job.uid !== user.id) throw new HttpError(404, "Tâche introuvable");
    const { uid, ...pub } = job;
    return json(pub);
  }

  if (req.method === "POST" && !context.params.id) {
    if (!aiEnabled()) throw new HttpError(503, "L'IA n'est pas configurée : ajoutez GEMINI_API_KEY (gratuit).");
    const b = await body(req);
    const id = randomUUID();
    const job = { id, uid: user.id, type: b.type, status: "pending", createdAt: new Date().toISOString() };
    if (b.type === "studio") {
      if (!STUDIO[b.kind]) throw new HttpError(400, "Outil inconnu");
      if (!Array.isArray(b.docIds) || !b.docIds.length) throw new HttpError(400, "Sélectionnez au moins une source.");
      job.params = {
        kind: b.kind,
        docIds: b.docIds.slice(0, 50),
        focus: String(b.focus || "").slice(0, 1000),
        length: String(b.length || "moyen"),
      };
    } else if (b.type === "ocr") {
      const media = String(b.mediaType || "");
      const data = String(b.data || "");
      if (!IMAGE_TYPES.includes(media) && media !== "application/pdf") throw new HttpError(400, "Format d'image non pris en charge");
      if (!data || data.length > 5_500_000) throw new HttpError(413, "Image trop lourde");
      await store.set(`input/${id}`, JSON.stringify({ mediaType: media, data }));
    } else {
      throw new HttpError(400, "Type de tâche inconnu");
    }
    await store.setJSON(`job/${id}`, job);
    return json({ id });
  }
  throw new HttpError(405, "Méthode non autorisée");
});

export const config = { path: ["/api/jobs", "/api/jobs/:id"], method: ["GET", "POST"] };
