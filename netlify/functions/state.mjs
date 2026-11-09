// Historique de l'utilisateur : discussion, sources cochées, positions de lecture.
import { handle, json, body, requireUser, HttpError } from "../lib/http.mjs";
import { getState, saveState } from "../lib/storage.mjs";

const MAX_BYTES = 2_000_000;

export default handle(async (req) => {
  const user = await requireUser();
  if (req.method === "GET") return json({ email: user.email, ...(await getState(user.id)) });
  if (req.method === "PUT") {
    const b = await body(req);
    const s = {
      chat: Array.isArray(b.chat) ? b.chat.slice(-100) : [],
      selected: Array.isArray(b.selected) ? b.selected.slice(0, 200) : [],
      positions: b.positions && typeof b.positions === "object" ? b.positions : {},
      overview: b.overview && typeof b.overview === "object" ? b.overview : {},
      lastDoc: typeof b.lastDoc === "string" ? b.lastDoc : null,
      updatedAt: new Date().toISOString(),
    };
    if (JSON.stringify(s).length > MAX_BYTES) throw new HttpError(413, "Historique trop volumineux");
    await saveState(user.id, s);
    return json({ ok: true });
  }
  throw new HttpError(405, "Méthode non autorisée");
});

export const config = { path: "/api/state", method: ["GET", "PUT"] };
