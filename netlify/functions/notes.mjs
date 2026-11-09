// Notes : résultats du studio et réponses enregistrées.
import { randomUUID } from "node:crypto";
import { handle, json, body, requireUser, HttpError } from "../lib/http.mjs";
import { listNotes, saveNote, deleteNote } from "../lib/storage.mjs";

export default handle(async (req, context) => {
  const user = await requireUser();
  const id = context.params.id;
  if (!id && req.method === "GET") return json(await listNotes(user.id));
  if (!id && req.method === "POST") {
    const b = await body(req);
    const note = {
      id: randomUUID(),
      kind: "note",
      title: String(b.title || "Note").slice(0, 200),
      format: "markdown",
      content: String(b.content || "").slice(0, 200_000),
      docIds: Array.isArray(b.docIds) ? b.docIds.slice(0, 50) : [],
      createdAt: new Date().toISOString(),
    };
    await saveNote(user.id, note);
    return json(note);
  }
  if (id && req.method === "DELETE") {
    await deleteNote(user.id, id);
    return json({ ok: true });
  }
  throw new HttpError(405, "Méthode non autorisée");
});

export const config = { path: ["/api/notes", "/api/notes/:id"] };
