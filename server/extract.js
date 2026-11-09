// Extraction du texte des documents envoyés (PDF, Word, texte, HTML, images).
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import { transcribeWithClaude, aiEnabled } from "./ai.js";

const IMAGE_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function ext(name) {
  const m = /\.[^.]+$/.exec(name.toLowerCase());
  return m ? m[0] : "";
}

/**
 * Recolle les lignes coupées d'un PDF en vrais paragraphes, pour que la
 * lecture à voix haute soit fluide (pas de pause à chaque fin de ligne).
 */
export function reflow(raw) {
  const text = raw.replace(/\r\n?/g, "\n").replace(/ /g, " ");
  const blocks = text.split(/\n\s*\n/);
  const out = [];
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    // Longueur d'une ligne « pleine » (largeur de la colonne).
    const sorted = lines.map((l) => l.length).sort((a, b) => a - b);
    const full = sorted[Math.floor(sorted.length * 0.9)] || 1;
    let para = "";
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!para) {
        para = line;
      } else if (para.endsWith("-") && /^[a-zà-ÿ]/.test(line)) {
        para = para.slice(0, -1) + line; // mot coupé en fin de ligne
      } else {
        para += " " + line;
      }
      const next = lines[i + 1];
      const endsSentence = /[.!?:»"”)]$/.test(line);
      const shortLine = line.length < full * 0.85;
      const nextUpper = next && /^[A-ZÀ-ÖØ-Þ0-9«"“(]/.test(next);
      const looksLikeHeading = line.length < full * 0.6 && !/[,;]$/.test(line) && !endsSentence && nextUpper;
      const looksLikeListItem = next && /^([-•*–]|\d+[.)])\s/.test(next);
      if (next && ((endsSentence && shortLine && nextUpper) || looksLikeHeading || looksLikeListItem)) {
        out.push(para);
        para = "";
      }
    }
    if (para) out.push(para);
  }
  return out.join("\n\n").replace(/[ \t]+/g, " ").trim();
}

function htmlToText(html) {
  return html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article|br)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** Retourne { text, kind, pages? } pour un fichier reçu par multer. */
export async function extractFile(file) {
  const name = file.originalname || "document";
  const e = ext(name);
  const buf = file.buffer;

  if (e === ".pdf" || file.mimetype === "application/pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    const pages = text.map((p) => reflow(p));
    const joined = pages.filter(Boolean).join("\n\n");
    // PDF scanné (presque pas de texte) : on demande à Claude de le lire.
    if (joined.replace(/\s/g, "").length < 40 * Math.max(1, totalPages)) {
      if (!aiEnabled()) {
        throw new Error(
          "Ce PDF semble scanné (pas de texte). Configurez ANTHROPIC_API_KEY pour activer la lecture par IA (OCR).",
        );
      }
      const ocr = await transcribeWithClaude({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") },
      });
      return { text: reflow(ocr), kind: "pdf (OCR)", pages: totalPages };
    }
    return { text: joined, kind: "pdf", pages: totalPages };
  }

  if (e === ".docx") {
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return { text: reflow(value), kind: "word" };
  }

  if (IMAGE_TYPES[e] || file.mimetype?.startsWith("image/")) {
    if (!aiEnabled()) {
      throw new Error(
        "La lecture des photos/images demande l'IA : configurez ANTHROPIC_API_KEY.",
      );
    }
    const media_type = IMAGE_TYPES[e] || file.mimetype;
    const ocr = await transcribeWithClaude({
      type: "image",
      source: { type: "base64", media_type, data: buf.toString("base64") },
    });
    return { text: reflow(ocr), kind: "image (OCR)" };
  }

  if (e === ".html" || e === ".htm") {
    return { text: reflow(htmlToText(buf.toString("utf8"))), kind: "html" };
  }

  if ([".txt", ".md", ".markdown", ".csv", ".json", ".rtf", ""].includes(e) || file.mimetype?.startsWith("text/")) {
    return { text: buf.toString("utf8").replace(/\r\n?/g, "\n").trim(), kind: e.slice(1) || "texte" };
  }

  throw new Error(`Format non pris en charge : ${e || file.mimetype}. Formats acceptés : PDF, DOCX, TXT, MD, HTML, images.`);
}
