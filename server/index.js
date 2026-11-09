// Lumen — lecteur de documents à voix haute + studio de compréhension.
import express from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractFile, reflow } from "./extract.js";
import { aiEnabled, chat, studio, STUDIO, MODEL } from "./ai.js";
import { listVoices, synthesize, ttsProviders } from "./tts.js";
import Anthropic from "@anthropic-ai/sdk";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const DATA = process.env.DATA_DIR || path.join(root, "data");
const DOCS_DIR = path.join(DATA, "docs");
const NOTES_DIR = path.join(DATA, "notes");
await fs.mkdir(DOCS_DIR, { recursive: true });
await fs.mkdir(NOTES_DIR, { recursive: true });

const app = express();
app.use(express.json({ limit: "20mb" }));
app.use(express.static(path.join(root, "public")));
app.use("/vendor/marked.js", express.static(path.join(root, "node_modules/marked/lib/marked.umd.js")));
app.use("/vendor/purify.js", express.static(path.join(root, "node_modules/dompurify/dist/purify.min.js")));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// --- petit stockage en fichiers JSON -------------------------------------
const safeId = (id) => {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw Object.assign(new Error("Identifiant invalide"), { status: 400 });
  return id;
};
async function readJson(dir, id) {
  try {
    return JSON.parse(await fs.readFile(path.join(dir, `${safeId(id)}.json`), "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") throw Object.assign(new Error("Introuvable"), { status: 404 });
    throw e;
  }
}
const writeJson = (dir, obj) => fs.writeFile(path.join(dir, `${obj.id}.json`), JSON.stringify(obj));
async function listJson(dir) {
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
  const items = await Promise.all(files.map(async (f) => JSON.parse(await fs.readFile(path.join(dir, f), "utf8"))));
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
async function loadDocs(ids) {
  if (!Array.isArray(ids) || !ids.length)
    throw Object.assign(new Error("Sélectionnez au moins une source."), { status: 400 });
  return Promise.all(ids.map((id) => readJson(DOCS_DIR, id)));
}
const docSummary = ({ text, ...d }) => ({ ...d, chars: text.length, preview: text.slice(0, 220) });

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// --- configuration --------------------------------------------------------
app.get(
  "/api/config",
  wrap(async (_req, res) => {
    res.json({
      ai: aiEnabled(),
      model: MODEL,
      tts: ttsProviders(),
      voices: await listVoices(),
      studio: Object.fromEntries(Object.entries(STUDIO).map(([k, v]) => [k, { label: v.label, lengths: v.lengths ? Object.keys(v.lengths) : null }])),
    });
  }),
);

// --- documents ------------------------------------------------------------
app.get("/api/docs", wrap(async (_req, res) => res.json((await listJson(DOCS_DIR)).map(docSummary))));
app.get("/api/docs/:id", wrap(async (req, res) => res.json(await readJson(DOCS_DIR, req.params.id))));

app.post(
  "/api/docs",
  upload.array("files", 20),
  wrap(async (req, res) => {
    const results = [];
    for (const file of req.files || []) {
      // multer décode les noms en latin1 : on les remet en UTF-8 (accents).
      const name = Buffer.from(file.originalname, "latin1").toString("utf8");
      try {
        const { text, kind, pages } = await extractFile({ ...file, originalname: name });
        if (!text.trim()) throw new Error("Aucun texte trouvé dans ce fichier.");
        const doc = {
          id: randomUUID(),
          title: name.replace(/\.[^.]+$/, ""),
          kind,
          pages: pages ?? null,
          createdAt: new Date().toISOString(),
          text,
        };
        await writeJson(DOCS_DIR, doc);
        results.push({ ok: true, doc: docSummary(doc) });
      } catch (e) {
        console.error(name, e);
        results.push({ ok: false, name, error: e.message });
      }
    }
    res.json(results);
  }),
);

app.post(
  "/api/docs/text",
  wrap(async (req, res) => {
    const text = reflow(String(req.body.text || ""));
    if (!text) throw Object.assign(new Error("Texte vide"), { status: 400 });
    const doc = {
      id: randomUUID(),
      title: String(req.body.title || "").trim() || text.slice(0, 50) + "…",
      kind: "texte collé",
      pages: null,
      createdAt: new Date().toISOString(),
      text,
    };
    await writeJson(DOCS_DIR, doc);
    res.json(docSummary(doc));
  }),
);

app.patch(
  "/api/docs/:id",
  wrap(async (req, res) => {
    const doc = await readJson(DOCS_DIR, req.params.id);
    if (typeof req.body.title === "string" && req.body.title.trim()) doc.title = req.body.title.trim();
    await writeJson(DOCS_DIR, doc);
    res.json(docSummary(doc));
  }),
);

app.delete(
  "/api/docs/:id",
  wrap(async (req, res) => {
    await fs.rm(path.join(DOCS_DIR, `${safeId(req.params.id)}.json`), { force: true });
    res.json({ ok: true });
  }),
);

// --- notes (résultats du studio enregistrés) --------------------------------
app.get("/api/notes", wrap(async (_req, res) => res.json(await listJson(NOTES_DIR))));
app.delete(
  "/api/notes/:id",
  wrap(async (req, res) => {
    await fs.rm(path.join(NOTES_DIR, `${safeId(req.params.id)}.json`), { force: true });
    res.json({ ok: true });
  }),
);
app.post(
  "/api/notes",
  wrap(async (req, res) => {
    const note = {
      id: randomUUID(),
      kind: "note",
      title: String(req.body.title || "Note").slice(0, 200),
      format: "markdown",
      content: String(req.body.content || ""),
      docIds: Array.isArray(req.body.docIds) ? req.body.docIds : [],
      createdAt: new Date().toISOString(),
    };
    await writeJson(NOTES_DIR, note);
    res.json(note);
  }),
);

// --- IA ---------------------------------------------------------------------
function requireAI() {
  if (!aiEnabled())
    throw Object.assign(new Error("L'IA n'est pas configurée : ajoutez ANTHROPIC_API_KEY dans le fichier .env puis relancez."), { status: 503 });
}

app.post(
  "/api/chat",
  wrap(async (req, res) => {
    requireAI();
    const docs = await loadDocs(req.body.docIds);
    const history = (req.body.messages || [])
      .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
      .slice(-30);
    if (!history.length || history[0].role !== "user" || history.at(-1).role !== "user")
      throw Object.assign(new Error("Conversation invalide"), { status: 400 });

    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
    try {
      const blocks = await chat(docs, history, (t) => send({ type: "text", text: t }));
      send({ type: "done", blocks });
    } catch (e) {
      console.error(e);
      send({ type: "error", error: e instanceof Anthropic.APIError ? humanError(e) : e.message });
    }
    res.end();
  }),
);

app.post(
  "/api/studio",
  wrap(async (req, res) => {
    requireAI();
    const { kind, docIds, focus, length, language } = req.body;
    const docs = await loadDocs(docIds);
    const result = await studio(docs, kind, { focus, length, language });
    const note = {
      id: randomUUID(),
      kind,
      title: `${STUDIO[kind].label} — ${docs.map((d) => d.title).join(", ").slice(0, 120)}`,
      ...result,
      docIds,
      createdAt: new Date().toISOString(),
    };
    if (kind !== "overview") await writeJson(NOTES_DIR, note);
    res.json(note);
  }),
);

// --- voix premium ----------------------------------------------------------
app.post(
  "/api/tts",
  wrap(async (req, res) => {
    const audio = await synthesize(req.body);
    res.set("Content-Type", "audio/mpeg").set("Cache-Control", "private, max-age=86400").send(audio);
  }),
);

function humanError(e) {
  if (e?.status === 401) return "Clé API invalide (ANTHROPIC_API_KEY).";
  if (e?.status === 429) return "Trop de requêtes : patientez quelques secondes puis réessayez.";
  if (e?.status >= 500) return "Le service d'IA est momentanément indisponible. Réessayez.";
  return e?.message || "Erreur inattendue";
}

app.use((err, _req, res, _next) => {
  if (!err.status || err.status >= 500) console.error(err);
  const status = err.status && err.status < 600 ? err.status : 500;
  res.status(status).json({ error: status >= 500 || err instanceof Anthropic.APIError ? humanError(err) : err.message });
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`\n  Lumen est prêt → http://localhost:${PORT}`);
  console.log(`  IA (Claude) : ${aiEnabled() ? `activée (${MODEL})` : "désactivée — ajoutez ANTHROPIC_API_KEY"}`);
  console.log(`  Voix premium : ${ttsProviders().join(", ") || "aucune (voix du navigateur utilisées)"}\n`);
});
