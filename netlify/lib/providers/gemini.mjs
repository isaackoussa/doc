// Fournisseur Google Gemini — offre gratuite (clé sur aistudio.google.com).
// Gemini n'a pas de citations natives : on numérote les passages des documents
// ([D1-P3]…), on demande au modèle de citer ces numéros, puis on les convertit
// en citations cliquables (mêmes données que pour Claude).
import { GoogleGenAI, ApiError } from "@google/genai";

// « gemini-flash-latest » suit automatiquement le dernier modèle Flash. S'il
// n'existe pas pour la clé utilisée, on choisit tout seul le meilleur modèle
// Flash disponible (voir pickModel).
export const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
let resolvedModel = null;
const currentModel = () => resolvedModel || MODEL;
export const configured = () => Boolean(process.env.GEMINI_API_KEY);

let client = null;
function getClient() {
  if (!client) {
    // v1beta : version de l'API où sont disponibles les alias « -latest »,
    // les instructions système et les réponses JSON structurées.
    const opts = { apiKey: process.env.GEMINI_API_KEY, httpOptions: { apiVersion: "v1beta" } };
    if (process.env.GEMINI_BASE_URL) opts.httpOptions.baseUrl = process.env.GEMINI_BASE_URL;
    client = new GoogleGenAI(opts);
  }
  return client;
}

/** Réessaie quand le quota gratuit par minute est momentanément atteint. */
async function withRetry(fn, delays = [4000, 12000, 30000]) {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const retryable = e instanceof ApiError && (e.status === 429 || e.status === 500 || e.status === 503);
      if (!retryable || i >= delays.length) throw friendly(e);
      await new Promise((r) => setTimeout(r, delays[i]));
    }
  }
}
function friendly(e) {
  if (!(e instanceof ApiError)) return e;
  const msg =
    e.status === 404
      ? `Modèle Gemini introuvable (${currentModel()}). Vérifiez GEMINI_MODEL.`
      : e.status === 429
      ? "Limite gratuite de Gemini atteinte : patientez une minute (ou jusqu'à demain si c'est la limite du jour) puis réessayez."
      : e.status === 400 && /api key/i.test(e.message)
        ? "Clé GEMINI_API_KEY invalide."
        : e.status === 403
          ? "Clé GEMINI_API_KEY refusée (vérifiez qu'elle est active sur aistudio.google.com)."
          : e.status >= 500
            ? "Gemini est momentanément indisponible. Réessayez."
            : `Erreur Gemini : ${e.message}`;
  return Object.assign(new Error(msg), { status: e.status === 429 ? 429 : e.status === 404 ? 404 : e.status >= 500 ? 502 : 400 });
}

/** Le meilleur modèle « Flash » texte disponible pour cette clé (le plus récent, stable de préférence). */
async function pickModel() {
  const found = [];
  const pager = await getClient().models.list({ config: { pageSize: 200 } });
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

/** Appelle Gemini ; si le modèle n'existe pas, en choisit un autre automatiquement (une fois). */
async function call(fn, delays) {
  try {
    return await withRetry(() => fn(currentModel()), delays);
  } catch (e) {
    if (e.status !== 404 || resolvedModel) throw e;
    let pick = null;
    try {
      pick = await pickModel();
    } catch {}
    if (!pick || pick === currentModel()) throw e;
    console.warn(`Modèle Gemini ${currentModel()} introuvable, utilisation de ${pick}`);
    resolvedModel = pick;
    return withRetry(() => fn(currentModel()), delays);
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
    async (model) => {
      // Une coupure en pleine réponse ne se rejoue pas (le texte est déjà affiché).
      if (full) throw Object.assign(new Error("La réponse a été interrompue. Réessayez."), { status: 502 });
      const stream = await getClient().models.generateContentStream({
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

export async function generate({ docs, instruction, schema, system }) {
  const sources = docs.map((d, i) => `<document id="D${i + 1}" titre="${d.title.replace(/"/g, "'")}">\n${d.text}\n</document>`).join("\n\n");
  const config = { systemInstruction: system };
  if (schema) {
    config.responseMimeType = "application/json";
    config.responseJsonSchema = schema;
  }
  const res = await call((model) =>
    getClient().models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: `Voici les documents :\n\n${sources}` }, { text: instruction }] }],
      config,
    }),
  );
  assertNotBlocked(res);
  return res.text || "";
}

export async function transcribe(mediaType, data, prompt) {
  const res = await call((model) =>
    getClient().models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ inlineData: { mimeType: mediaType, data } }, { text: prompt }] }],
    }),
  );
  assertNotBlocked(res);
  return res.text || "";
}
