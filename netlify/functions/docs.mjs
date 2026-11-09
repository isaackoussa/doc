// Documents de l'utilisateur : liste, lecture, ajout (texte déjà extrait), renommage, suppression.
import { randomUUID } from "node:crypto";
import { handle, json, body, requireUser, HttpError } from "../lib/http.mjs";
import { listDocs, getDoc, saveDoc, deleteDoc, docSummary } from "../lib/storage.mjs";

export default handle(async (req, context) => {
  const user = await requireUser();
  const id = context.params.id;

  if (!id && req.method === "GET") return json(await listDocs(user.id));

  if (!id && req.method === "POST") {
    const b = await body(req);
    const text = String(b.text || "").trim();
    if (!text) throw new HttpError(400, "Aucun texte trouvé dans ce document.");
    const doc = {
      id: randomUUID(),
      title: String(b.title || "").trim().slice(0, 200) || text.slice(0, 50) + "…",
      kind: String(b.kind || "texte").slice(0, 40),
      pages: Number.isFinite(b.pages) ? b.pages : null,
      createdAt: new Date().toISOString(),
      text,
    };
    await saveDoc(user.id, doc);
    return json(docSummary(doc));
  }

  if (id && req.method === "GET") return json(await getDoc(user.id, id));

  if (id && req.method === "PATCH") {
    const b = await body(req);
    const doc = await getDoc(user.id, id);
    if (typeof b.title === "string" && b.title.trim()) doc.title = b.title.trim().slice(0, 200);
    await saveDoc(user.id, doc);
    return json(docSummary(doc));
  }

  if (id && req.method === "DELETE") {
    await deleteDoc(user.id, id);
    return json({ ok: true });
  }
  throw new HttpError(405, "Méthode non autorisée");
});

export const config = { path: ["/api/docs", "/api/docs/:id"] };
