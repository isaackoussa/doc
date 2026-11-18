// Fournisseur Google Gemini — offre gratuite (clé sur aistudio.google.com).
// Gemini n'a pas de citations natives : on numérote les passages des documents
// ([D1-P3]…), on demande au modèle de citer ces numéros, puis on les convertit
// en citations cliquables (mêmes données que pour Claude).
import { GoogleGenAI, ApiError } from "@google/genai";
import { getStore } from "@netlify/blobs";
import * as Keys from "../keys.mjs";

// « gemini-flash-latest » suit automatiquement le dernier modèle Flash. S'il
// n'existe pas pour la clé utilisée, on choisit tout seul le meilleur modèle
// Flash disponible (voir pickModel).
export const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
let resolvedModel = null;
const currentModel = () => resolvedModel || MODEL;

// Le modèle trouvé automatiquement est mémorisé (Netlify Blobs) : les tâches
// suivantes ne refont pas la recherche (gain de plusieurs secondes par tâche).
let cacheLoaded = false;
const cacheStore = () => getStore({ name: "app-config", consistency: "strong" });
async function loadCachedModel() {
  if (cacheLoaded) return;
  cacheLoaded = true;
  try {
    const c = await cacheStore().get("gemini-model", { type: "json" });
    if (c?.configured === MODEL && c.resolved) resolvedModel = c.resolved;
  } catch {}
}
async function saveCachedModel(resolved) {
  try {
    await cacheStore().setJSON("gemini-model", { configured: MODEL, resolved, at: new Date().toISOString() });
  } catch {}
}

// Réflexion plafonnée selon la tâche : beaucoup plus rapide, qualité suffisante.
const THINKING = { low: 0, medium: 1024, high: 4096 };
let thinkingUnsupported = false;
export const configured = () => Keys.count() > 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isKeyError = (e) => e.status === 403 || (e.status === 400 && /api.?key/i.test(e.message));
const isDaily = (e) => /per.?day|daily|PerDay/i.test(e.message || "");

function friendly(e, quotaKeys = 0) {
  if (!(e instanceof ApiError)) return e;
  const n = Keys.count();
  const msg =
    e.status === 404
      ? `Modèle Gemini introuvable (${currentModel()}). Vérifiez GEMINI_MODEL.`
      : e.status === 429
        ? n > 1
          ? `Les ${n} clés Gemini ont toutes atteint leur limite gratuite : patientez une minute (ou jusqu'à demain si c'est la limite du jour), ou ajoutez une clé d'un autre compte Google dans GEMINI_API_KEYS.`
          : "Limite gratuite de Gemini atteinte : patientez une minute (ou jusqu'à demain si c'est la limite du jour) puis réessayez. Astuce : ajoutez d'autres clés dans GEMINI_API_KEYS pour que l'app change toute seule."
        : e.status === 400 && /api.?key/i.test(e.message)
          ? n > 1 ? "Aucune de vos clés Gemini n'est valide." : "Clé GEMINI_API_KEY invalide."
          : e.status === 403
            ? n > 1 ? "Toutes vos clés Gemini sont refusées (vérifiez-les sur aistudio.google.com)." : "Clé GEMINI_API_KEY refusée (vérifiez qu'elle est active sur aistudio.google.com)."
            : e.status >= 500
              ? "Gemini est momentanément indisponible. Réessayez."
              : `Erreur Gemini : ${e.message}`;
  return Object.assign(new Error(msg), { status: e.status === 429 ? 429 : e.status === 404 ? 404 : e.status >= 500 ? 502 : 400 });
}

/** Le meilleur modèle « Flash » texte disponible pour cette clé (le plus récent, stable de préférence). */
async function pickModel(client) {
  const found = [];
  const pager = await client.models.list({ config: { pageSize: 200 } });
  for await (const m of pager) {
    const name = (m.name || "").replace(/^models\//, "");
    if (!/flash/i.test(name) || /lite|image|tts|audio|live|embed|vision|exp|thinking|8b/i.test(name)) continue;
    if (m.supportedActions && !m.supportedActions.includes("generateContent")) continue;
    const version = parseFloat((/gemini-(\d+(?:\.\d+)?)/.exec(name) || [])[1] || "0");
    found.push({ name, version, preview: /preview/i.test(name), latest: /latest/i.test(name) });
  }
  found.sort((a, b) => b.latest - a.latest || a.preview - b.preview || b.version - a.version || a.name.length - b.name.length);
  return found[0]?.name || null;
}

/** Un appel avec une clé ; si le modèle n'existe pas, en choisit un autre automatiquement (une fois). */
async function withKey(k, fn) {
  const client = Keys.clientFor(k.key);
  try {
    return await fn(currentModel(), client);
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 404) throw e;
    let pick = null;
    try {
      pick = await pickModel(client);
    } catch {}
    if (!pick || pick === currentModel()) throw e;
    console.warn(`Modèle Gemini ${currentModel()} introuvable, utilisation de ${pick}`);
    resolvedModel = pick;
    await saveCachedModel(pick);
    return fn(currentModel(), client);
  }
}

/**
 * Appelle Gemini en passant d'une clé à l'autre : limite atteinte (429), clé refusée
 * ou serveur indisponible → clé suivante tout de suite. Si toutes échouent, on
 * attend un peu (`delays`) et on refait un tour.
 */
async function call(fn, delays = [4000, 12000, 30000]) {
  await loadCachedModel();
  const list = await Keys.ordered();
  if (!list.length) throw Object.assign(new Error("Aucune clé Gemini configurée (GEMINI_API_KEY ou GEMINI_API_KEYS)."), { status: 500 });
  let lastErr = null;
  for (let round = 0; ; round++) {
    let quota = 0;
    let daily = 0;
    let transient = 0;
    let quotaErr = null;
    for (const k of list) {
      try {
        const res = await withKey(k, fn);
        if (k.blocked || round) Keys.unblock(k.id);
        return res;
      } catch (e) {
        if (!(e instanceof ApiError)) throw e;
        lastErr = e;
        if (e.status === 429) {
          quota++;
          quotaErr = e;
          if (isDaily(e)) daily++;
          // Limite du jour : on l'oublie 1 h ; limite par minute : 2 min.
          if (list.length > 1) await Keys.block(k.id, isDaily(e) ? 3600_000 : 120_000);
          continue;
        }
        if (isKeyError(e)) {
          if (list.length > 1) console.warn(`Clé Gemini …${k.id} refusée (${e.status}), clé suivante.`);
          await Keys.block(k.id, 30 * 60_000);
          continue;
        }
        if (e.status === 500 || e.status === 503) {
          transient++;
          continue;
        }
        throw friendly(e);
      }
    }
    const err = quotaErr || lastErr; // « limite atteinte » prime sur « clé invalide »
    // Plus aucun espoir à court terme (clés invalides et/ou limites du JOUR) : on n'attend pas.
    if (!transient && quota === daily) throw friendly(err);
    if (round >= delays.length) throw friendly(err);
    await sleep(delays[round]);
  }
}

/** Ajoute le plafond de réflexion ; si le modèle le refuse, on réessaie sans. */
async function withThinking(effort, run) {
  const budget = THINKING[effort];
  if (budget === undefined || thinkingUnsupported) return run({});
  try {
    return await run({ thinkingConfig: { thinkingBudget: budget } });
  } catch (e) {
    if (e.status === 400 && /thinking/i.test(e.message)) {
      thinkingUnsupported = true;
      return run({});
    }
    throw e;
  }
}

function assertNotBlocked(res) {
  const reason = res?.promptFeedback?.blockReason || res?.candidates?.[0]?.finishReason;
  if (["SAFETY", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "OTHER"].includes(reason) && !res?.text) {
    throw Object.assign(new Error("La demande a été bloquée par les filtres de sécurité de Gemini."), { status: 422 });
  }
}

// ---------------------------------------------------------------------------
// Passages numérotés pour les citations
// ---------------------------------------------------------------------------
function passages(docs) {
  const map = new Map(); // "D1-P3" → {doc, title, start, end}
  const parts = docs.map((d, di) => {
    const lines = [];
    const re = /\S[\s\S]*?(?=\n\s*\n|$)/g;
    let m, n = 0;
    const push = (start, end) => {
      const id = `D${di + 1}-P${++n}`;
      map.set(id, { doc: d.id, title: d.title, start, end, quote: d.text.slice(start, Math.min(end, start + 300)) });
      lines.push(`[${id}] ${d.text.slice(start, end).replace(/\s+/g, " ")}`);
    };
    while ((m = re.exec(d.text))) {
      let start = m.index;
      const end = m.index + m[0].length;
      // Paragraphe très long : découpé aux fins de phrase (~800 caractères).
      while (end - start > 1200) {
        const window = d.text.slice(start + 600, start + 1100);
        const cut = window.search(/[.!?…]\s/);
        const at = cut >= 0 ? start + 600 + cut + 1 : start + 1000;
        push(start, at);
        start = at;
        while (/\s/.test(d.text[start])) start++;
      }
      push(start, end);
    }
    return `<document id="D${di + 1}" titre="${d.title.replace(/"/g, "'")}">\n${lines.join("\n")}\n</document>`;
  });
  return { text: parts.join("\n\n"), map };
}

const MARKER = /\[\s*(D\d+-P\d+(?:\s*[,;]\s*D\d+-P\d+)*)\s*\]/g;

/** Découpe la réponse aux marqueurs et produit des blocs {text, citations}. */
function toBlocks(text, map) {
  const blocks = [];
  let last = 0;
  for (const m of text.matchAll(MARKER)) {
    const citations = m[1]
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter((id) => map.has(id))
      .map((id) => {
        const p = map.get(id);
        return { doc: p.doc, title: p.title, start: p.start, end: p.end, quote: p.quote };
      });
    blocks.push({ text: text.slice(last, m.index).replace(/[ \t]+$/, ""), citations });
    last = m.index + m[0].length;
  }
  blocks.push({ text: text.slice(last), citations: [] });
  return blocks.filter((b) => b.text || b.citations.length);
}

const CITE_RULES = `
Les documents sont découpés en passages numérotés, par exemple [D1-P3] = document 1, passage 3.
Après chaque phrase qui s'appuie sur les documents, ajoute la ou les références exactes entre crochets, par exemple « … est produit dans les chloroplastes [D1-P3]. » ou [D1-P3, D2-P7].
N'invente jamais de référence et n'écris pas les références ailleurs qu'à la fin des phrases concernées.`;

export async function chat(docs, history, onText, system) {
  const { text: sources, map } = passages(docs);
  const contents = history.map((m, i) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: i === 0 ? [{ text: `Voici les documents :\n\n${sources}` }, { text: m.content }] : [{ text: m.content }],
  }));
  let full = "";
  await call(
    async (model, client) => {
      // Une coupure en pleine réponse ne se rejoue pas (le texte est déjà affiché).
      if (full) throw Object.assign(new Error("La réponse a été interrompue. Réessayez."), { status: 502 });
      const stream = await client.models.generateContentStream({
        model,
        contents,
        config: { systemInstruction: system + CITE_RULES },
      });
      for await (const chunk of stream) {
        const t = chunk.text;
        if (t) {
          full += t;
          onText(t);
        }
        assertNotBlocked(chunk);
      }
    },
    [3000, 8000],
  );
  return toBlocks(full, map);
}

/** Génération (studio) en continu : onProgress(texte reçu jusqu'ici) permet d'afficher l'avancement. */
export async function generate({ docs, instruction, schema, system, effort = "medium", onProgress }) {
  const sources = docs.map((d, i) => `<document id="D${i + 1}" titre="${d.title.replace(/"/g, "'")}">\n${d.text}\n</document>`).join("\n\n");
  const base = { systemInstruction: system };
  if (schema) {
    base.responseMimeType = "application/json";
    base.responseJsonSchema = schema;
  }
  return withThinking(effort, (extra) => {
    let full = "";
    let last = null;
    return call(async (model, client) => {
      if (full) throw Object.assign(new Error("La génération a été interrompue. Réessayez."), { status: 502 });
      const stream = await client.models.generateContentStream({
        model,
        contents: [{ role: "user", parts: [{ text: `Voici les documents :\n\n${sources}` }, { text: instruction }] }],
        config: { ...base, ...extra },
      });
      for await (const chunk of stream) {
        last = chunk;
        const t = chunk.text;
        if (t) {
          full += t;
          onProgress?.(full);
        }
      }
      if (!full) assertNotBlocked(last);
      if (last?.candidates?.[0]?.finishReason === "MAX_TOKENS")
        throw Object.assign(new Error("La réponse était trop longue et a été coupée. Choisissez une version plus courte."), { status: 502 });
      return full;
    });
  });
}

export async function transcribe(mediaType, data, prompt) {
  const res = await withThinking("low", (extra) =>
    call((model, client) =>
      client.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ inlineData: { mimeType: mediaType, data } }, { text: prompt }] }],
        config: { ...extra },
      }),
    ),
  );
  assertNotBlocked(res);
  return res.text || "";
}
