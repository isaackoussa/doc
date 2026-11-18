// Plusieurs clés Gemini gratuites : quand l'une atteint sa limite, l'app passe
// immédiatement à la suivante.
//
//   GEMINI_API_KEYS = clé1,clé2,clé3   (virgules, espaces ou retours à la ligne)
//   GEMINI_API_KEY  = clé              (toujours acceptée, compte comme une clé de plus)
//
// Les clés épuisées sont mises de côté quelques minutes (mémorisé dans Netlify
// Blobs, partagé entre toutes les fonctions). Les valeurs des clés ne sont jamais
// renvoyées au navigateur ni écrites dans les journaux : on ne manipule qu'un
// identifiant court (empreinte SHA-256).
import { createHash } from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import { getStore } from "@netlify/blobs";

const split = (v) => (v || "").split(/[\s,;]+/).map((k) => k.trim()).filter(Boolean);
const keyId = (key) => createHash("sha256").update(key).digest("hex").slice(0, 10);

/** Toutes les clés « générales », sans doublon (GEMINI_API_KEY en premier). */
export function allKeys() {
  const keys = [...new Set([...split(process.env.GEMINI_API_KEY), ...split(process.env.GEMINI_API_KEYS)])];
  return keys.map((key) => ({ key, id: keyId(key) }));
}
export const count = () => allKeys().length;
export { keyId };

const clients = new Map();
export function clientFor(key) {
  if (!clients.has(key)) {
    // v1beta : alias « -latest », instructions système et JSON structuré.
    const httpOptions = { apiVersion: "v1beta" };
    if (process.env.GEMINI_BASE_URL) httpOptions.baseUrl = process.env.GEMINI_BASE_URL;
    clients.set(key, new GoogleGenAI({ apiKey: key, httpOptions }));
  }
  return clients.get(key);
}

// ---------------------------------------------------------------------------
// Clés momentanément épuisées
// ---------------------------------------------------------------------------
const store = () => getStore({ name: "app-config", consistency: "strong" });
let blocked = null; // { id: horodatage de fin }
let loadedAt = 0;

async function load() {
  if (blocked && Date.now() - loadedAt < 15_000) return blocked;
  try {
    blocked = (await store().get("keys-blocked", { type: "json" })) || {};
  } catch {
    blocked = blocked || {};
  }
  loadedAt = Date.now();
  return blocked;
}
async function save() {
  try {
    await store().setJSON("keys-blocked", blocked || {});
  } catch {}
}

/** Met une clé de côté pendant `ms` millisecondes. */
export async function block(id, ms) {
  await load();
  blocked[id] = Date.now() + ms;
  await save();
}
/** La clé a de nouveau répondu : on l'enlève de la liste des épuisées. */
export async function unblock(id) {
  if (!blocked?.[id]) return;
  delete blocked[id];
  await save();
}

let turn = 0;
/**
 * Clés dans l'ordre d'essai : les disponibles d'abord (en tournant, pour répartir
 * la charge entre les quotas), puis les épuisées (peut-être libérées entre-temps).
 */
export async function ordered() {
  const keys = allKeys();
  const b = await load();
  const now = Date.now();
  const free = keys.filter((k) => !(b[k.id] > now));
  const busy = keys.filter((k) => b[k.id] > now).sort((x, y) => b[x.id] - b[y.id]);
  const start = free.length ? turn++ % free.length : 0;
  return [...free.slice(start), ...free.slice(0, start), ...busy].map((k) => ({ ...k, blocked: b[k.id] > now }));
}
