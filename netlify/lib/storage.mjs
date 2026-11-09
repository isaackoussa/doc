// Stockage par utilisateur dans Netlify Blobs. Toutes les clés commencent par
// l'identifiant de l'utilisateur : un compte ne peut jamais lire ceux des autres.
import { getStore } from "@netlify/blobs";
import { HttpError, checkId } from "./http.mjs";

const store = (name) => getStore({ name, consistency: "strong" });
export const docsStore = () => store("docs"); // texte complet
export const docMetaStore = () => store("doc-meta"); // résumé pour la liste
export const notesStore = () => store("notes");
export const stateStore = () => store("user-state"); // historique, positions…
export const jobsStore = () => store("jobs");

const key = (uid, id) => `${uid}/${checkId(id)}`;

async function listUser(st, uid) {
  const { blobs } = await st.list({ prefix: `${uid}/` });
  const items = await Promise.all(blobs.map((b) => st.get(b.key, { type: "json" })));
  return items.filter(Boolean).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export const docSummary = ({ text, ...d }) => ({ ...d, chars: text.length, preview: text.slice(0, 220) });

export async function listDocs(uid) {
  return listUser(docMetaStore(), uid);
}
export async function getDoc(uid, id) {
  const doc = await docsStore().get(key(uid, id), { type: "json" });
  if (!doc) throw new HttpError(404, "Document introuvable");
  return doc;
}
export async function saveDoc(uid, doc) {
  await docsStore().setJSON(key(uid, doc.id), doc);
  await docMetaStore().setJSON(key(uid, doc.id), docSummary(doc));
}
export async function deleteDoc(uid, id) {
  await docsStore().delete(key(uid, id));
  await docMetaStore().delete(key(uid, id));
}
export async function loadDocs(uid, ids) {
  if (!Array.isArray(ids) || !ids.length) throw new HttpError(400, "Sélectionnez au moins une source.");
  return Promise.all(ids.slice(0, 50).map((id) => getDoc(uid, id)));
}

export const listNotes = (uid) => listUser(notesStore(), uid);
export const saveNote = (uid, note) => notesStore().setJSON(key(uid, note.id), note);
export const deleteNote = (uid, id) => notesStore().delete(key(uid, id));

export async function getState(uid) {
  return (await stateStore().get(uid, { type: "json" })) || {};
}
export const saveState = (uid, s) => stateStore().setJSON(uid, s);
