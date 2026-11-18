/* Résumés visuels : arbre de décision (« si… alors… ») et résumé en image (infographie).
 * Dessinés en SVG (net à toutes les tailles), téléchargeables en PNG et partageables.
 */
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const plain = (t) => window.MathText.textToUnicode(String(t ?? "")).trim();
  const SERIF = "Georgia, 'Times New Roman', serif";
  const SANS = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  const RED = "#B5473A";
  const palette = (name) => (window.Slides?.PALETTES || {})[name] || { d: "#12393A", d2: "#1F6B66", ac: "#C9962B", light: "#EEF3F2", ink: "#16302F" };

  let ICONS = {};
  const iconsReady = fetch("/vendor/icons.json").then((r) => r.json()).then((j) => (ICONS = j)).catch(() => {});
  /** Icône Lucide placée dans le SVG (trait de la couleur donnée). */
  function iconAt(name, x, y, size, color) {
    const svg = ICONS[name] || ICONS["sparkles"] || "";
    if (!svg) return "";
    return svg
      .replace("<svg", `<svg x="${x}" y="${y}" style="color:${color}"`)
      .replace(/width="24" height="24"/, `width="${size}" height="${size}"`);
  }

  // ------------------------------------------------------------ mesure du texte
  const cv = document.createElement("canvas").getContext("2d");
  function wrap(text, maxW, size, { weight = 400, family = SANS, italic = false } = {}) {
    cv.font = `${italic ? "italic " : ""}${weight} ${size}px ${family}`;
    const words = plain(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (cv.measureText(test).width <= maxW || !line) line = test;
      else (lines.push(line), (line = w));
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  }
  const textWidth = (t, size, weight = 400, family = SANS) => ((cv.font = `${weight} ${size}px ${family}`), cv.measureText(plain(t)).width);
  /** Lignes de texte SVG. */
  function lines(ls, x, y, size, lh, { color = "#000", weight = 400, family = SANS, anchor = "start", italic = false } = {}) {
    return `<text x="${x}" y="${y}" font-family="${esc(family)}" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}"${italic ? ' font-style="italic"' : ""}>${ls
      .map((l, i) => `<tspan x="${x}" dy="${i ? lh : 0}">${esc(l)}</tspan>`)
      .join("")}</text>`;
  }

  // ------------------------------------------------------------ arbre de décision
  function treeSVG(c, p) {
    const NW = 250, PAD = 16, GX = 34, GY = 74;
    const raw = (c.nodes || []).filter((n) => n && (n.text || "").trim());
    const byId = new Map(raw.map((n) => [String(n.id), { ...n, id: String(n.id), children: [] }]));
    let roots = [];
    for (const n of byId.values()) {
      const par = byId.get(String(n.parent || ""));
      if (par && par !== n) par.children.push(n);
      else roots.push(n);
    }
    // plusieurs racines : la question de départ devient la racine commune
    let root = roots[0];
    if (roots.length !== 1) root = { id: "_root", kind: "question", text: c.question || c.title || "Question", detail: "", edge: "", children: roots };
    const seen = new Set();
    // mesure de chaque nœud
    (function measure(n) {
      seen.add(n);
      const q = n.kind === "question";
      n.tl = wrap(n.text, NW - 2 * PAD, 16, { weight: q || n.kind === "resultat" ? 700 : 600 });
      n.dl = n.detail ? wrap(n.detail, NW - 2 * PAD, 13) : [];
      n.h = PAD + n.tl.length * 21 + (n.dl.length ? 8 + n.dl.length * 17 : 0) + PAD + (n.kind === "resultat" ? 6 : 0);
      n.children = n.children.filter((ch) => !seen.has(ch));
      n.children.forEach(measure);
      n.sw = n.children.length ? Math.max(NW, n.children.reduce((s, ch) => s + ch.sw, 0) + GX * (n.children.length - 1)) : NW;
    })(root);
    // hauteur par niveau
    const levelH = [];
    (function lv(n, d) {
      levelH[d] = Math.max(levelH[d] || 0, n.h);
      n.children.forEach((ch) => lv(ch, d + 1));
    })(root, 0);
    const M = 40;
    // en-tête : titre + question de départ
    const W = Math.max(root.sw + 2 * M, 720);
    const titleL = wrap(c.title || "Arbre de décision", W - 2 * M, 30, { family: SERIF });
    const qL = c.question ? wrap(c.question, W - 2 * M - 40, 17, { italic: true }) : [];
    let headH = 30 + titleL.length * 38 + (qL.length ? 22 + qL.length * 24 + 24 : 0) + 30;
    const levelY = [];
    levelH.reduce((y, h, d) => ((levelY[d] = y), y + h + GY), headH);
    (function place(n, left, d) {
      n.x = left + n.sw / 2;
      n.y = levelY[d];
      let cx = left + (n.sw - (n.children.reduce((s, ch) => s + ch.sw, 0) + GX * Math.max(n.children.length - 1, 0))) / 2;
      n.children.forEach((ch) => (place(ch, cx, d + 1), (cx += ch.sw + GX)));
    })(root, (W - root.sw) / 2, 0);
    const H = levelY[levelY.length - 1] + levelH[levelH.length - 1] + 70;

    let edges = "", boxes = "", labels = "";
    (function draw(n) {
      const x0 = n.x - NW / 2;
      const isQ = n.kind === "question", isR = n.kind === "resultat";
      const fill = isQ ? p.d : isR ? "#FFFFFF" : p.light;
      const tc = isQ ? "#FFFFFF" : p.ink;
      boxes += `<g><rect x="${x0}" y="${n.y}" width="${NW}" height="${n.h}" rx="12" fill="${fill}" ${isR ? `stroke="${p.ac}" stroke-width="2.5"` : isQ ? "" : `stroke="${p.d2}" stroke-opacity=".35"`}/>`;
      if (isR) boxes += `<rect x="${x0}" y="${n.y}" width="${NW}" height="6" rx="3" fill="${p.ac}"/>`;
      // pastille « ? » posée sur le coin de la case (ne chevauche jamais le texte)
      if (isQ) boxes += `<circle cx="${x0 + NW - 4}" cy="${n.y + 4}" r="11" fill="${p.ac}" stroke="#fff" stroke-width="2"/><text x="${x0 + NW - 4}" y="${n.y + 8.5}" font-family="${esc(SANS)}" font-size="13" font-weight="700" fill="#fff" text-anchor="middle">?</text>`;
      const ty = n.y + PAD + 15 + (isR ? 6 : 0);
      boxes += lines(n.tl, n.x, ty, 16, 21, { color: tc, weight: isQ || isR ? 700 : 600, anchor: "middle" });
      if (n.dl.length) boxes += lines(n.dl, n.x, ty + n.tl.length * 21 + 6, 13, 17, { color: isQ ? "#DCE6E5" : p.d2, anchor: "middle", italic: true });
      boxes += "</g>";
      for (const ch of n.children) {
        const y1 = n.y + n.h, y2 = ch.y, my = (y1 + y2) / 2;
        edges += `<path d="M${n.x},${y1} C${n.x},${my} ${ch.x},${my} ${ch.x},${y2}" fill="none" stroke="${p.d2}" stroke-width="2"/>`;
        edges += `<path d="M${ch.x - 6},${y2 - 9} L${ch.x},${y2} L${ch.x + 6},${y2 - 9}" fill="none" stroke="${p.d2}" stroke-width="2"/>`;
        if (ch.edge) {
          const lab = plain(ch.edge).slice(0, 40);
          const lw = textWidth(lab, 13, 700) + 18;
          const neg = /^non\b|^aucun|^pas\b/i.test(lab);
          labels += `<g><rect x="${ch.x - lw / 2}" y="${y2 - 40}" width="${lw}" height="22" rx="11" fill="${neg ? RED : p.ac}"/><text x="${ch.x}" y="${y2 - 24.5}" font-family="${esc(SANS)}" font-size="13" font-weight="700" fill="#fff" text-anchor="middle">${esc(lab)}</text></g>`;
        }
        draw(ch);
      }
    })(root);

    // en-tête et légende
    let head = lines(titleL, W / 2, 30 + 28, 30, 38, { color: p.d, family: SERIF, anchor: "middle" });
    if (qL.length) {
      const qy = 30 + titleL.length * 38 + 18, qh = qL.length * 24 + 22;
      const qw = Math.min(W - 2 * M, Math.max(...qL.map((l) => textWidth(l, 17))) + 60);
      head += `<rect x="${(W - qw) / 2}" y="${qy}" width="${qw}" height="${qh}" rx="10" fill="${p.light}"/>`;
      head += lines(qL, W / 2, qy + 28, 17, 24, { color: p.d, anchor: "middle", italic: true });
    }
    const leg = [["Question", p.d, p.d], ["Étape", p.light, p.d2], ["Conclusion", "#fff", p.ac]];
    let lx = M;
    const legend = leg
      .map(([t, f, s]) => {
        const g = `<rect x="${lx}" y="${H - 34}" width="16" height="16" rx="4" fill="${f}" stroke="${s}" stroke-width="2"/><text x="${lx + 22}" y="${H - 21}" font-family="${esc(SANS)}" font-size="13" fill="#5B6B6A">${t}</text>`;
        lx += 30 + textWidth(t, 13) + 18;
        return g;
      })
      .join("");
    return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#fff"/>${head}${edges}${boxes}${labels}${legend}<text x="${W - M}" y="${H - 21}" font-family="${esc(SANS)}" font-size="12" fill="#9AA6A5" text-anchor="end">Lumen</text></svg>`, W, H };
  }

  function treeSpeech(c) {
    const out = [];
    if (c.question) out.push(plain(c.question));
    const nodes = c.nodes || [];
    const kids = (id) => nodes.filter((n) => String(n.parent || "") === String(id));
    const roots = nodes.filter((n) => !nodes.some((m) => String(m.id) === String(n.parent || "")));
    const seen = new Set();
    const walk = (n) => {
      if (seen.has(n)) return;
      seen.add(n);
      out.push(`${n.edge ? `Si ${plain(n.edge)} : ` : ""}${plain(n.text)}${n.detail ? `. ${plain(n.detail)}` : ""}`);
      kids(n.id).forEach(walk);
    };
    roots.forEach(walk);
    return out;
  }

  // ------------------------------------------------------------ résumé en image
  function infographicSVG(c, p, sourceTitle) {
    const W = 1080, M = 60, G = 28;
    let y = 0, body = "";
    // en-tête sombre
    const titleL = wrap(c.title, W - 2 * M, 52, { family: SERIF });
    const subL = c.subtitle ? wrap(c.subtitle, W - 2 * M, 25) : [];
    const headH = M + 84 + 34 + titleL.length * 62 + (subL.length ? 14 + subL.length * 34 : 0) + 46;
    body += `<rect width="${W}" height="${headH}" fill="${p.d}"/>`;
    body += `<circle cx="${M + 42}" cy="${M + 42}" r="42" fill="${p.ac}"/>${iconAt(c.icon || "book-open", M + 20, M + 20, 44, "#ffffff")}`;
    body += `<text x="${W - M}" y="${M + 50}" font-family="${esc(SANS)}" font-size="16" font-weight="700" fill="${p.ac}" text-anchor="end" letter-spacing="3">RÉSUMÉ</text>`;
    body += lines(titleL, M, M + 84 + 34 + 46, 52, 62, { color: "#fff", family: SERIF });
    if (subL.length) body += lines(subL, M, M + 84 + 34 + titleL.length * 62 + 26, 25, 34, { color: p.ac });
    body += `<rect y="${headH}" width="${W}" height="8" fill="${p.ac}"/>`;
    y = headH + 8 + 44;

    // chiffres clés
    const figs = (c.figures || []).filter((f) => (f.value || "").trim()).slice(0, 4);
    if (figs.length) {
      const fw = (W - 2 * M - G * (figs.length - 1)) / figs.length;
      const labs = figs.map((f) => wrap(f.label, fw - 36, 19));
      const fh = 40 + 60 + 10 + Math.max(...labs.map((l) => l.length)) * 26 + 26;
      figs.forEach((f, i) => {
        const x = M + i * (fw + G);
        body += `<rect x="${x}" y="${y}" width="${fw}" height="${fh}" rx="16" fill="${p.light}"/>`;
        const vs = Math.min(56, (fw - 30) / Math.max(plain(f.value).length * 0.55, 1));
        body += `<text x="${x + fw / 2}" y="${y + 40 + 50}" font-family="${esc(SERIF)}" font-size="${vs.toFixed(0)}" fill="${p.ac}" text-anchor="middle">${esc(plain(f.value))}</text>`;
        body += lines(labs[i], x + fw / 2, y + 40 + 60 + 34, 19, 26, { color: p.ink, anchor: "middle" });
      });
      y += fh + 40;
    }

    // blocs (2 colonnes)
    const secs = (c.sections || []).filter((s) => (s.title || "").trim()).slice(0, 8);
    const cw = (W - 2 * M - G) / 2;
    const meas = secs.map((s) => {
      const tl = wrap(s.title, cw - 32 - 78, 25, { weight: 700 });
      const pts = (s.points || []).map((pt) => wrap(pt, cw - 32 - 30, 20));
      const h = 28 + Math.max(56, tl.length * 31) + 18 + pts.reduce((a, l) => a + l.length * 28 + 10, 0) + 22;
      return { s, tl, pts, h };
    });
    for (let i = 0; i < meas.length; i += 2) {
      const row = meas.slice(i, i + 2);
      const rh = Math.max(...row.map((r) => r.h));
      row.forEach((r, j) => {
        const x = M + j * (cw + G);
        body += `<rect x="${x}" y="${y}" width="${cw}" height="${rh}" rx="18" fill="#fff" stroke="${p.d2}" stroke-opacity=".18" stroke-width="2"/>`;
        body += `<rect x="${x}" y="${y + 24}" width="6" height="56" rx="3" fill="${p.ac}"/>`;
        body += `<circle cx="${x + 32 + 28}" cy="${y + 28 + 28}" r="28" fill="${p.ac}"/>${iconAt(r.s.icon || "lightbulb", x + 32 + 13, y + 28 + 13, 30, "#ffffff")}`;
        const ty = y + 28 + Math.max(0, (56 - r.tl.length * 31) / 2) + 24;
        body += lines(r.tl, x + 32 + 72, ty, 25, 31, { color: p.d, weight: 700 });
        let py = y + 28 + Math.max(56, r.tl.length * 31) + 18 + 22;
        r.pts.forEach((pl) => {
          body += `<circle cx="${x + 40}" cy="${py - 7}" r="5" fill="${p.ac}"/>`;
          body += lines(pl, x + 58, py, 20, 28, { color: p.ink });
          py += pl.length * 28 + 10;
        });
      });
      y += rh + G;
    }

    // à retenir
    if (c.takeaway) {
      const tk = wrap(c.takeaway, W - 2 * M - 80, 30, { family: SERIF, italic: true });
      const th = 40 + 26 + 18 + tk.length * 42 + 36;
      y += 12;
      body += `<rect x="${M}" y="${y}" width="${W - 2 * M}" height="${th}" rx="20" fill="${p.d}"/>`;
      body += `<rect x="${M}" y="${y}" width="12" height="${th}" rx="6" fill="${p.ac}"/>`;
      body += `<text x="${M + 46}" y="${y + 40 + 14}" font-family="${esc(SANS)}" font-size="17" font-weight="700" fill="${p.ac}" letter-spacing="3">À RETENIR</text>`;
      body += lines(tk, M + 46, y + 40 + 26 + 40, 30, 42, { color: "#fff", family: SERIF, italic: true });
      y += th;
    }
    y += 36;
    const src = wrap(sourceTitle || "", W - 2 * M - 160, 15);
    body += lines(src.slice(0, 2), M, y, 15, 20, { color: "#8A9796" });
    body += `<text x="${W - M}" y="${y}" font-family="${esc(SANS)}" font-size="15" font-weight="700" fill="${p.d}" text-anchor="end">Lumen</text>`;
    const H = y + 40;
    return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#F7F9F9"/>${body}</svg>`, W, H };
  }

  function infographicSpeech(c) {
    const out = [plain(c.title), plain(c.subtitle)];
    (c.figures || []).forEach((f) => out.push(`${plain(f.value)} : ${plain(f.label)}`));
    (c.sections || []).forEach((s) => out.push(plain(s.title), ...(s.points || []).map(plain)));
    if (c.takeaway) out.push(`À retenir : ${plain(c.takeaway)}`);
    return out.filter(Boolean);
  }

  // ------------------------------------------------------------ export PNG / partage
  async function toPNG(svg, W, H, scale = 2) {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    try {
      await new Promise((res, rej) => ((img.onload = res), (img.onerror = () => rej(new Error("Image impossible à créer"))), (img.src = url)));
      // limite de taille des navigateurs (surtout sur téléphone)
      const s = Math.min(scale, 8000 / W, 8000 / H);
      const c = document.createElement("canvas");
      c.width = Math.round(W * s);
      c.height = Math.round(H * s);
      const g = c.getContext("2d");
      g.fillStyle = "#fff";
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      return await new Promise((r) => c.toBlob(r, "image/png"));
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const fileName = (t) => (plain(t) || "resume").replace(/[\\/:*?"<>|]+/g, "").slice(0, 80);

  // ------------------------------------------------------------ affichage
  async function render(note, body, ctx) {
    await iconsReady;
    const c = note.content || {};
    const isTree = note.kind === "arbre";
    const p = palette(c.palette || "sarcelle");
    const { svg, W, H } = isTree ? treeSVG(c, p) : infographicSVG(c, p, (note.title || "").replace(/^[^—]*—\s*/, "Sources : "));
    // Sur téléphone, l'arbre s'ouvre en taille réelle (lisible) avec défilement.
    const small = isTree && innerWidth < 700;
    const canShare = !!(navigator.canShare && window.File && navigator.canShare({ files: [new File([""], "x.png", { type: "image/png" })] }));
    body.innerHTML = `<div class="visual">
      <div class="deck-tools">
        <button class="btn primary" data-v="png">⬇ Image PNG</button>
        ${canShare ? `<button class="btn" data-v="share">↗ Partager</button>` : ""}
        <button class="btn" data-v="listen">▶ Écouter</button>
        ${isTree ? `<button class="btn" data-v="fit">${small ? "⤡ Ajuster" : "⤢ Taille réelle"}</button>` : ""}
      </div>
      <div class="visual-box${isTree ? " tree" : ""}${small ? " natural" : ""}">${svg}</div>
      <p class="muted small">${isTree ? "Partez de la question en haut et suivez les branches selon votre situation. Faites défiler pour voir tout l'arbre." : "Image prête à partager ou à imprimer."}</p>
    </div>`;
    const box = $(".visual-box", body);
    body.onclick = async (e) => {
      const a = e.target.closest("[data-v]")?.dataset.v;
      if (!a) return;
      const btn = e.target.closest("button");
      if (a === "fit") {
        box.classList.toggle("natural");
        btn.textContent = box.classList.contains("natural") ? "⤡ Ajuster" : "⤢ Taille réelle";
      }
      if (a === "listen") {
        const items = [];
        for (const t of isTree ? treeSpeech(c) : infographicSpeech(c)) for (const s of window.NarratorUtil.sentences(t)) items.push({ text: s.text });
        ctx.speak(items, plain(c.title) || "Résumé", { kind: "note" });
      }
      if (a === "png" || a === "share") {
        const label = btn.textContent;
        btn.disabled = true;
        btn.textContent = "Création…";
        try {
          const blob = await toPNG(svg, W, H, 2);
          const name = fileName(c.title) + ".png";
          if (a === "share") {
            await navigator.share({ files: [new File([blob], name, { type: "image/png" })], title: plain(c.title) });
          } else {
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = name;
            document.body.append(link);
            link.click();
            setTimeout(() => (URL.revokeObjectURL(link.href), link.remove()), 1000);
            ctx.toast("Image téléchargée ✓", "ok");
          }
        } catch (err) {
          if (err?.name !== "AbortError") ctx.toast("Image impossible : " + err.message, "error");
        }
        btn.disabled = false;
        btn.textContent = label;
      }
    };
  }

  window.Visuals = { render, treeSVG, infographicSVG, toPNG, ready: () => iconsReady };
})();
