// IA dédiée aux présentations : elle n'utilise pas le même quota que le reste de l'app.
//
// Chez Google, le quota gratuit est compté PAR MODÈLE et PAR PROJET (clé). Les
// présentations passent donc par leur propre chaîne « clé × modèle » :
//   1. la clé GEMINI_SLIDES_API_KEY (facultative, idéalement d'un autre compte/projet Google),
//   2. puis la clé principale GEMINI_API_KEY,
// et, pour chaque clé, plusieurs modèles (chacun a son propre quota). Quand un quota
// est épuisé (429), on passe immédiatement au suivant au lieu d'attendre, et on s'en
// souvient quelques minutes pour ne pas le réessayer inutilement.
import { GoogleGenAI, ApiError } from "@google/genai";
import { getStore } from "@netlify/blobs";

const DEFAULT_MODELS = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-flash-lite-latest", "gemini-2.5-flash-lite", "gemini-2.0-flash"];

const clients = new Map();
function client(key) {
  if (!clients.has(key)) {
    const httpOptions = { apiVersion: "v1beta" };
    if (process.env.GEMINI_BASE_URL) httpOptions.baseUrl = process.env.GEMINI_BASE_URL;
    clients.set(key, new GoogleGenAI({ apiKey: key, httpOptions }));
  }
  return clients.get(key);
}

/** Les « seaux » de quota disponibles, dans l'ordre d'essai. */
export function buckets() {
  const dedicated = process.env.GEMINI_SLIDES_API_KEY;
  const keys = [...new Set([dedicated, process.env.GEMINI_API_KEY].filter(Boolean))];
  const models = (process.env.SLIDES_MODELS || "").split(",").map((m) => m.trim()).filter(Boolean);
  const list = models.length ? models : DEFAULT_MODELS;
  return keys.flatMap((key) =>
    list.map((model) => ({ key, model, id: `${key.slice(-6)}:${model}`, dedicated: key === dedicated })),
  );
}
export const configured = () => buckets().length > 0;
export const info = () => ({ dedicatedKey: Boolean(process.env.GEMINI_SLIDES_API_KEY), buckets: buckets().length });

// Seaux momentanément épuisés (mémorisés entre deux tâches).
const store = () => getStore({ name: "app-config", consistency: "strong" });
async function loadBlocked() {
  try {
    return (await store().get("slides-blocked", { type: "json" })) || {};
  } catch {
    return {};
  }
}
async function saveBlocked(b) {
  try {
    await store().setJSON("slides-blocked", b);
  } catch {}
}

let noThinking = false;

/**
 * Génère la présentation (JSON) en essayant les seaux un par un.
 * Renvoie { text, model }.
 */
export async function generate({ docs, instruction, schema, system, onProgress }) {
  const sources = docs.map((d, i) => `<document id="D${i + 1}" titre="${d.title.replace(/"/g, "'")}">\n${d.text}\n</document>`).join("\n\n");
  const contents = [{ role: "user", parts: [{ text: `Voici les documents :\n\n${sources}` }, { text: instruction }] }];
  const blocked = await loadBlocked();
  const now = Date.now();
  const all = buckets();
  // Les seaux bloqués récemment passent en dernier (ils peuvent avoir été libérés).
  const order = [...all.filter((b) => !(blocked[b.id] > now)), ...all.filter((b) => blocked[b.id] > now)];
  let lastErr = null;
  let quotaHits = 0;

  for (const b of order) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const config = { systemInstruction: system, responseMimeType: "application/json", responseJsonSchema: schema };
      if (!noThinking && attempt === 0) config.thinkingConfig = { thinkingBudget: 1024 };
      let full = "";
      try {
        onProgress?.("");
        const stream = await client(b.key).models.generateContentStream({ model: b.model, contents, config });
        let last = null;
        for await (const chunk of stream) {
          last = chunk;
          if (chunk.text) {
            full += chunk.text;
            onProgress?.(full);
          }
        }
        if (!full) throw Object.assign(new Error("Réponse vide (filtrée par Gemini)."), { status: 422 });
        if (last?.candidates?.[0]?.finishReason === "MAX_TOKENS") throw Object.assign(new Error("Réponse coupée"), { status: 413 });
        if (blocked[b.id]) (delete blocked[b.id], saveBlocked(blocked));
        return { text: full, model: b.model };
      } catch (e) {
        lastErr = e;
        const status = e instanceof ApiError ? e.status : e.status;
        // Le modèle ne connaît pas le réglage de réflexion : on réessaie sans.
        if (status === 400 && /thinking/i.test(e.message) && attempt === 0) {
          noThinking = true;
          continue;
        }
        if (status === 429) {
          quotaHits++;
          blocked[b.id] = Date.now() + 3 * 60_000; // quota épuisé : on l'évite 3 minutes
        } else if (status === 404) {
          blocked[b.id] = Date.now() + 24 * 3600_000; // modèle inexistant pour cette clé
        } else if (status === 403 || (status === 400 && /api key/i.test(e.message))) {
          blocked[b.id] = Date.now() + 10 * 60_000; // clé refusée
        } else if (!(status >= 500 || status === 413 || status === 422)) {
          throw e; // vraie erreur de requête : inutile d'essayer ailleurs
        }
        break; // seau suivant
      }
    }
  }
  await saveBlocked(blocked);
  if (quotaHits)
    throw Object.assign(
      new Error(
        "Toutes les IA gratuites disponibles pour les présentations ont atteint leur limite. Réessayez dans quelques minutes, ou ajoutez une clé GEMINI_SLIDES_API_KEY d'un autre compte Google pour doubler le quota.",
      ),
      { status: 429 },
    );
  throw lastErr || new Error("Aucune IA disponible pour les présentations.");
}
