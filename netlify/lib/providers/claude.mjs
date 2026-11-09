// Fournisseur Claude (Anthropic) — optionnel, payant. Activé avec ANTHROPIC_API_KEY
// (et AI_PROVIDER=claude si une clé Gemini est aussi présente).
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
// Un refus des filtres de sécurité est rejoué automatiquement sur le modèle
// de repli recommandé par Anthropic (mettre CLAUDE_FALLBACKS=off pour couper).
const USE_FALLBACKS = process.env.CLAUDE_FALLBACKS !== "off";

let client = null;
export const configured = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

/** Paramètres communs : modèle, effort, et repli serveur en cas de refus. */
function baseParams(effort = "medium") {
  const p = { model: MODEL, output_config: { effort } };
  if (USE_FALLBACKS) {
    p.betas = ["server-side-fallback-2026-07-01"];
    p.fallbacks = "default";
  }
  return p;
}

/** Les documents en blocs « document » ; le dernier porte le point de cache. */
function documentBlocks(docs, { citations }) {
  return docs.map((d, i) => ({
    type: "document",
    source: { type: "text", media_type: "text/plain", data: d.text || "(document vide)" },
    title: d.title,
    citations: { enabled: citations },
    ...(i === docs.length - 1 ? { cache_control: { type: "ephemeral" } } : {}),
  }));
}

const textOf = (message) =>
  message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

function assertNotRefused(message) {
  if (message.stop_reason === "refusal") {
    const err = new Error("La demande a été refusée par les filtres de sécurité du modèle.");
    err.status = 422;
    throw err;
  }
}

export async function transcribe(mediaType, data, prompt) {
  const block =
    mediaType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
      : { type: "image", source: { type: "base64", media_type: mediaType, data } };
  const msg = await getClient()
    .beta.messages.stream({
      ...baseParams("low"),
      max_tokens: 64000,
      messages: [{ role: "user", content: [block, { type: "text", text: prompt }] }],
    })
    .finalMessage();
  assertNotRefused(msg);
  return textOf(msg);
}

/** Discussion streamée ; renvoie les blocs de texte avec leurs citations. */
export async function chat(docs, history, onText, system) {
  const messages = history.map((m, i) =>
    i === 0
      ? { role: "user", content: [...documentBlocks(docs, { citations: true }), { type: "text", text: m.content }] }
      : { role: m.role, content: m.content },
  );
  const stream = getClient().beta.messages.stream({
    ...baseParams("medium"),
    max_tokens: 32000,
    system: system + "\nCite les passages précis des documents qui appuient tes affirmations.",
    messages,
  });
  stream.on("text", (t) => onText(t));
  const msg = await stream.finalMessage();
  assertNotRefused(msg);
  return msg.content
    .filter((b) => b.type === "text")
    .map((b) => ({
      text: b.text,
      citations: (b.citations || [])
        .filter((c) => c.type === "char_location")
        .map((c) => ({
          doc: docs[c.document_index]?.id,
          title: c.document_title,
          start: c.start_char_index,
          end: c.end_char_index,
          quote: c.cited_text,
        })),
    }));
}

/** Génération ponctuelle (studio) ; `schema` optionnel → JSON. */
export async function generate({ docs, instruction, schema, effort = "medium", system }) {
  const params = {
    ...baseParams(effort),
    max_tokens: 64000,
    system,
    messages: [{ role: "user", content: [...documentBlocks(docs, { citations: false }), { type: "text", text: instruction }] }],
  };
  if (schema) params.output_config = { ...params.output_config, format: { type: "json_schema", schema } };
  const msg = await getClient().beta.messages.stream(params).finalMessage();
  assertNotRefused(msg);
  return textOf(msg);
}
