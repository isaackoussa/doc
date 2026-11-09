/* Extraction du texte dans le navigateur (PDF, Word, texte, HTML).
 * Les images et PDF scannés sont transcrits par l'IA via `ocr(mediaType, base64)`.
 */
(function () {
  /** Recolle les lignes coupées d'un PDF en vrais paragraphes. */
  function reflow(raw) {
    const text = raw.replace(/\r\n?/g, "\n").replace(/ /g, " ");
    const out = [];
    for (const block of text.split(/\n\s*\n/)) {
      const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
      if (!lines.length) continue;
      // Longueur d'une ligne « pleine » (largeur de la colonne).
      const sorted = lines.map((l) => l.length).sort((a, b) => a - b);
      const full = sorted[Math.floor(sorted.length * 0.9)] || 1;
      let para = "";
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!para) para = line;
        else if (para.endsWith("-") && /^[a-zà-ÿ]/.test(line)) para = para.slice(0, -1) + line;
        else para += " " + line;
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
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("script,style,noscript,nav,footer,header,aside").forEach((n) => n.remove());
    doc.querySelectorAll("p,div,h1,h2,h3,h4,h5,h6,li,tr,section,article,br,blockquote").forEach((n) => n.append("\n\n"));
    return (doc.body?.textContent || "").replace(/\n{3,}/g, "\n\n");
  }

  const ext = (name) => (/\.[^.]+$/.exec(name.toLowerCase()) || [""])[0];
  const IMAGE_EXT = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".heic", ".heif"];

  let pdfjsPromise = null;
  function pdfjs() {
    pdfjsPromise ||= import("/vendor/pdf.min.mjs").then((m) => {
      m.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";
      return m;
    });
    return pdfjsPromise;
  }
  let mammothPromise = null;
  function mammoth() {
    mammothPromise ||= new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "/vendor/mammoth.js";
      s.onload = () => resolve(window.mammoth);
      s.onerror = () => reject(new Error("Impossible de charger le lecteur Word"));
      document.head.append(s);
    });
    return mammothPromise;
  }

  const blobToBase64 = (blob) =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1]);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });

  /** Réduit une image (ou un canvas) en JPEG ≤ 2000 px pour l'envoyer à l'IA. */
  async function toJpeg(source, maxSide = 2000) {
    const bmp = source instanceof HTMLCanvasElement ? source : await createImageBitmap(source);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
    return blobToBase64(blob);
  }

  /** Exécute des tâches avec au plus `n` en parallèle, en gardant l'ordre. */
  async function pool(items, n, fn) {
    const results = new Array(items.length);
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(n, items.length) }, async () => {
        while (next < items.length) {
          const i = next++;
          results[i] = await fn(items[i], i);
        }
      }),
    );
    return results;
  }

  /**
   * @returns {Promise<{title, kind, pages, text}>}
   * opts.ocr(mediaType, base64) → texte ; opts.progress(msg)
   */
  async function extractFile(file, { ocr, progress = () => {} } = {}) {
    const name = file.name || "document";
    const title = name.replace(/\.[^.]+$/, "");
    const e = ext(name);

    if (e === ".pdf" || file.type === "application/pdf") {
      const lib = await pdfjs();
      const pdf = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      const pages = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        progress(`Lecture de la page ${i}/${pdf.numPages}…`);
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        let s = "";
        for (const it of content.items) {
          s += it.str;
          if (it.hasEOL) s += "\n";
          else if (it.str && !s.endsWith(" ")) s += " ";
        }
        pages.push(reflow(s));
      }
      const joined = pages.filter(Boolean).join("\n\n");
      if (joined.replace(/\s/g, "").length >= 40 * pdf.numPages) return { title, kind: "pdf", pages: pdf.numPages, text: joined };

      // PDF scanné : chaque page est photographiée puis lue par l'IA.
      if (!ocr) throw new Error("Ce PDF est scanné : l'IA est nécessaire pour le lire.");
      if (pdf.numPages > 60 && !confirm(`Ce PDF scanné fait ${pdf.numPages} pages : la lecture par l'IA peut prendre plusieurs minutes. Continuer ?`))
        throw new Error("Import annulé");
      let done = 0;
      const texts = await pool([...Array(pdf.numPages).keys()], 3, async (k) => {
        const page = await pdf.getPage(k + 1);
        const vp = page.getViewport({ scale: 1 });
        const scale = Math.min(2.5, 1800 / Math.max(vp.width, vp.height));
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext("2d"), viewport, canvas }).promise;
        const txt = await ocr("image/jpeg", await toJpeg(canvas));
        progress(`Lecture par l'IA : page ${++done}/${pdf.numPages}…`);
        return reflow(txt);
      });
      return { title, kind: "pdf (scanné)", pages: pdf.numPages, text: texts.filter(Boolean).join("\n\n") };
    }

    if (e === ".docx") {
      const m = await mammoth();
      const { value } = await m.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      return { title, kind: "word", pages: null, text: reflow(value) };
    }

    if (IMAGE_EXT.includes(e) || file.type.startsWith("image/")) {
      if (!ocr) throw new Error("La lecture des photos demande l'IA.");
      progress("Lecture de l'image par l'IA…");
      const text = await ocr("image/jpeg", await toJpeg(file));
      return { title, kind: "image", pages: null, text: reflow(text) };
    }

    if (e === ".html" || e === ".htm" || file.type === "text/html") {
      return { title, kind: "html", pages: null, text: reflow(htmlToText(await file.text())) };
    }

    if ([".txt", ".md", ".markdown", ".csv", ".json", ".rtf", ""].includes(e) || file.type.startsWith("text/")) {
      return { title, kind: e.slice(1) || "texte", pages: null, text: (await file.text()).replace(/\r\n?/g, "\n").trim() };
    }

    throw new Error(`Format non pris en charge (${e || file.type}). Formats acceptés : PDF, Word (.docx), texte, HTML, images.`);
  }

  window.Extract = { extractFile, reflow };
})();
