/* Présentations : affichage des diapositives, modification, projection plein écran,
 * répétition à voix haute (notes de l'orateur) et export PowerPoint / PDF.
 *
 * Contenu d'une présentation (note.kind === "slides") :
 * { title, subtitle, theme?, slides: [{ title, layout, bullets[], formula, notes }] }
 * La diapositive de titre (index 0) est construite à partir de title / subtitle.
 */
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const mt = (t) => window.MathText.renderInline(t);
  const plain = (t) => window.MathText.textToUnicode(t);

  const THEMES = {
    lumen: { name: "Lumen (crème et orange)", bg: "FBF7F0", text: "22201C", accent: "C2410C", muted: "7A7266", title: "22201C" },
    nuit: { name: "Nuit (sombre)", bg: "16213E", text: "EEF2F7", accent: "F59E0B", muted: "A7B1C2", title: "FFFFFF" },
    sobre: { name: "Sobre (blanc et bleu)", bg: "FFFFFF", text: "1F2937", accent: "2563EB", muted: "6B7280", title: "0F172A" },
    foret: { name: "Forêt (vert)", bg: "F3F7F2", text: "1C2B22", accent: "15803D", muted: "5B6B60", title: "14532D" },
  };
  const LAYOUTS = { puces: "Puces", section: "Titre de partie", formule: "Formule", citation: "Citation / définition" };

  const total = (deck) => deck.slides.length + 1;
  const isDense = (s) => s.bullets.join(" ").length > 320 || s.bullets.length > 6;

  /** HTML d'une diapositive (même rendu à l'écran, en plein écran et en PDF). */
  function slideHTML(deck, i) {
    const t = THEMES[deck.theme] ? deck.theme : "lumen";
    if (i === 0) {
      return `<div class="slide th-${t} sl-title"><div class="sl-in">
        <div class="sl-bar"></div><h1>${mt(deck.title)}</h1>${deck.subtitle ? `<p class="sl-sub">${mt(deck.subtitle)}</p>` : ""}</div></div>`;
    }
    const s = deck.slides[i - 1];
    const bullets = (s.bullets || []).filter((b) => b.trim());
    const list = bullets.length ? `<ul>${bullets.map((b) => `<li>${mt(b)}</li>`).join("")}</ul>` : "";
    const num = `<span class="sl-num">${i + 1}</span>`;
    if (s.layout === "section")
      return `<div class="slide th-${t} sl-section"><div class="sl-in"><div class="sl-bar"></div><h2>${mt(s.title)}</h2>${bullets[0] ? `<p class="sl-sub">${mt(bullets[0])}</p>` : ""}</div>${num}</div>`;
    if (s.layout === "citation")
      return `<div class="slide th-${t} sl-quote"><div class="sl-in"><h3>${mt(s.title)}</h3><blockquote>${mt(bullets.join(" "))}</blockquote></div>${num}</div>`;
    if (s.layout === "formule" && s.formula?.trim())
      return `<div class="slide th-${t} sl-formula${isDense(s) ? " dense" : ""}"><div class="sl-in"><h2>${mt(s.title)}</h2>
        <div class="sl-eq">${mt(`$$${s.formula}$$`)}</div>${list}</div>${num}</div>`;
    return `<div class="slide th-${t} sl-bullets${isDense(s) ? " dense" : ""}"><div class="sl-in"><h2>${mt(s.title)}</h2>${list}</div>${num}</div>`;
  }

  // ---------------------------------------------------------------- visionneuse
  let current = null; // { deck, i, body, ctx, note }

  function render(note, body, ctx) {
    const deck = normalize(note.content);
    current = { deck, i: 0, body, ctx, note, editing: false };
    body.innerHTML = `<div class="deck">
      <div class="deck-tools">
        <button class="btn primary" data-a="present" title="Projeter en plein écran">▶ Présenter</button>
        <button class="btn" data-a="rehearse" title="Écouter les notes de l'orateur, diapositive par diapositive">🎧 Répéter</button>
        <button class="btn" data-a="pptx" title="Télécharger un fichier PowerPoint modifiable">PowerPoint</button>
        <button class="btn" data-a="pdf" title="Imprimer ou enregistrer en PDF (formules exactes)">PDF</button>
        <select data-a="theme" aria-label="Thème">${Object.entries(THEMES)
          .map(([k, v]) => `<option value="${k}" ${k === deck.theme ? "selected" : ""}>${v.name}</option>`)
          .join("")}</select>
      </div>
      <div class="deck-stage" data-a="stage"></div>
      <div class="deck-nav">
        <button class="icon-btn" data-a="prev" aria-label="Diapositive précédente">‹</button>
        <span class="muted small" data-a="pos"></span>
        <button class="icon-btn" data-a="next" aria-label="Diapositive suivante">›</button>
        <button class="btn small-btn" data-a="edit">✎ Modifier</button>
      </div>
      <div class="deck-side" data-a="side"></div>
      <details class="deck-list" open><summary>Toutes les diapositives</summary><ol data-a="list"></ol></details>
    </div>`;
    body.onclick = onClick;
    $('[data-a="theme"]', body).onchange = (e) => {
      deck.theme = e.target.value;
      draw();
      save();
    };
    draw();
  }

  function normalize(c) {
    const deck = JSON.parse(JSON.stringify(c || {}));
    deck.title ||= "Présentation";
    deck.subtitle ||= "";
    deck.theme ||= "lumen";
    deck.slides = (deck.slides || []).map((s) => ({
      title: s.title || "",
      layout: LAYOUTS[s.layout] ? s.layout : "puces",
      bullets: Array.isArray(s.bullets) ? s.bullets : [],
      formula: s.formula || "",
      notes: s.notes || "",
    }));
    return deck;
  }

  function draw() {
    const c = current;
    if (!c) return;
    const { deck, body } = c;
    c.i = Math.max(0, Math.min(c.i, total(deck) - 1));
    $('[data-a="stage"]', body).innerHTML = slideHTML(deck, c.i);
    $('[data-a="pos"]', body).textContent = `${c.i + 1} / ${total(deck)}`;
    $('[data-a="list"]', body).innerHTML = [deck.title, ...deck.slides.map((s) => s.title)]
      .map((t, k) => `<li class="${k === c.i ? "on" : ""}"><button data-go="${k}">${mt(t)}</button></li>`)
      .join("");
    const side = $('[data-a="side"]', body);
    if (c.editing) side.innerHTML = editorHTML();
    else {
      const notes = c.i === 0 ? "" : deck.slides[c.i - 1].notes;
      side.innerHTML = notes
        ? `<div class="deck-notes"><div class="eyebrow">Notes de l'orateur</div><p>${mt(notes)}</p></div>`
        : c.i === 0
          ? `<div class="deck-notes muted small">Diapositive de titre. Utilisez ✎ Modifier pour changer le titre ou le sous-titre.</div>`
          : "";
    }
    $('[data-a="edit"]', body).textContent = c.editing ? "Fermer l'édition" : "✎ Modifier";
    presenterDraw();
  }

  function editorHTML() {
    const { deck, i } = current;
    if (i === 0)
      return `<form class="deck-edit" data-form="title">
        <label class="field"><span>Titre</span><input name="title" value="${esc(deck.title)}" /></label>
        <label class="field"><span>Sous-titre</span><input name="subtitle" value="${esc(deck.subtitle)}" /></label>
        <div class="row"><button class="btn primary" type="submit">Enregistrer</button><button class="btn" type="button" data-a="add">+ Diapositive après</button></div>
      </form>`;
    const s = deck.slides[i - 1];
    return `<form class="deck-edit" data-form="slide">
      <label class="field"><span>Titre</span><input name="title" value="${esc(s.title)}" /></label>
      <label class="field"><span>Mise en page</span><select name="layout">${Object.entries(LAYOUTS)
        .map(([k, v]) => `<option value="${k}" ${k === s.layout ? "selected" : ""}>${v}</option>`)
        .join("")}</select></label>
      <label class="field"><span>Puces (une par ligne)</span><textarea name="bullets" rows="5">${esc(s.bullets.join("\n"))}</textarea></label>
      <label class="field"><span>Formule (LaTeX, pour la mise en page « Formule »)</span><input name="formula" value="${esc(s.formula)}" placeholder="ex. \\Delta = b^2 - 4ac" /></label>
      <label class="field"><span>Notes de l'orateur</span><textarea name="notes" rows="4">${esc(s.notes)}</textarea></label>
      <p class="muted small">Formules dans les puces ou les notes : écrivez-les entre $…$, par exemple $x^2 + 1$.</p>
      <div class="row">
        <button class="btn primary" type="submit">Enregistrer</button>
        <button class="btn" type="button" data-a="add">+ Diapositive après</button>
        <button class="btn" type="button" data-a="up" ${i <= 1 ? "disabled" : ""}>↑</button>
        <button class="btn" type="button" data-a="down" ${i >= deck.slides.length ? "disabled" : ""}>↓</button>
        <button class="btn danger-btn" type="button" data-a="del">Supprimer</button>
      </div>
    </form>`;
  }

  function readForm() {
    const f = $(".deck-edit", current.body);
    if (!f) return;
    const v = (n) => f.elements[n]?.value ?? "";
    if (f.dataset.form === "title") {
      current.deck.title = v("title").trim() || "Présentation";
      current.deck.subtitle = v("subtitle").trim();
    } else {
      const s = current.deck.slides[current.i - 1];
      s.title = v("title").trim();
      s.layout = v("layout");
      s.bullets = v("bullets").split("\n").map((x) => x.trim()).filter(Boolean);
      s.formula = v("formula").trim();
      s.notes = v("notes").trim();
    }
  }

  let saving = null;
  async function save() {
    const c = current;
    try {
      saving = c.ctx.save(c.deck);
      const note = await saving;
      if (note) c.note.content = note.content;
    } catch (e) {
      c.ctx.toast("Enregistrement impossible : " + e.message, "error");
    }
  }

  async function onClick(e) {
    const c = current;
    if (!c) return;
    const go = e.target.closest("[data-go]");
    if (go) return ((c.i = Number(go.dataset.go)), draw());
    const btn = e.target.closest("[data-a]");
    if (!btn) {
      // toucher la diapositive : moitié gauche = précédente, moitié droite = suivante
      const stage = e.target.closest(".deck-stage");
      if (stage && !c.editing) {
        const r = stage.getBoundingClientRect();
        c.i += e.clientX - r.left > r.width / 2 ? 1 : -1;
        draw();
      }
      return;
    }
    const a = btn.dataset.a;
    if (a === "prev") (c.i--, draw());
    if (a === "next") (c.i++, draw());
    if (a === "edit") ((c.editing = !c.editing), draw());
    if (a === "present") present();
    if (a === "rehearse") rehearse();
    if (a === "pptx") exportPptx(btn);
    if (a === "pdf") exportPdf();
    if (["add", "up", "down", "del"].includes(a)) {
      readForm();
      const k = c.i - 1; // index dans slides
      if (a === "add") {
        c.deck.slides.splice(c.i, 0, { title: "Nouvelle diapositive", layout: "puces", bullets: [], formula: "", notes: "" });
        c.i++;
      }
      if (a === "up" && k > 0) ([c.deck.slides[k - 1], c.deck.slides[k]] = [c.deck.slides[k], c.deck.slides[k - 1]], c.i--);
      if (a === "down" && k < c.deck.slides.length - 1) ([c.deck.slides[k + 1], c.deck.slides[k]] = [c.deck.slides[k], c.deck.slides[k + 1]], c.i++);
      if (a === "del" && k >= 0 && confirm("Supprimer cette diapositive ?")) c.deck.slides.splice(k, 1);
      draw();
      save();
    }
  }
  document.addEventListener("submit", (e) => {
    if (!e.target.matches?.(".deck-edit")) return;
    e.preventDefault();
    readForm();
    draw();
    save().then(() => current?.ctx.toast("Diapositive enregistrée", "ok"));
  });

  // ---------------------------------------------------------------- plein écran
  let presenter = null;
  function present() {
    presenter = document.createElement("div");
    presenter.className = "presenter";
    presenter.innerHTML = `<div class="pr-stage"></div>
      <div class="pr-bar"><button data-p="prev" aria-label="Précédente">‹</button><span data-p="pos"></span>
      <button data-p="next" aria-label="Suivante">›</button><button data-p="notes" title="Afficher les notes">Notes</button><button data-p="close" aria-label="Quitter">✕</button></div>
      <div class="pr-notes hidden"></div>`;
    document.body.append(presenter);
    presenter.addEventListener("click", (e) => {
      const p = e.target.closest("[data-p]")?.dataset.p;
      if (p === "close") return closePresenter();
      if (p === "notes") return presenter.querySelector(".pr-notes").classList.toggle("hidden");
      if (p === "prev") current.i--;
      else if (p === "next") current.i++;
      else if (e.target.closest(".pr-stage")) current.i += e.clientX > innerWidth / 2 ? 1 : -1;
      else return;
      draw();
    });
    presenter.requestFullscreen?.().catch(() => {});
    draw();
  }
  function presenterDraw() {
    if (!presenter || !current) return;
    const { deck, i } = current;
    presenter.querySelector(".pr-stage").innerHTML = slideHTML(deck, i);
    presenter.querySelector('[data-p="pos"]').textContent = `${i + 1} / ${total(deck)}`;
    presenter.querySelector(".pr-notes").innerHTML = i ? mt(deck.slides[i - 1].notes) : "";
  }
  function closePresenter() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    presenter?.remove();
    presenter = null;
  }
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && presenter) closePresenter();
  });
  addEventListener("keydown", (e) => {
    if (!presenter || !current) return;
    if (["ArrowRight", "PageDown", " ", "Enter"].includes(e.key)) (current.i++, draw(), e.preventDefault());
    else if (["ArrowLeft", "PageUp", "Backspace"].includes(e.key)) (current.i--, draw(), e.preventDefault());
    else if (e.key === "Escape") closePresenter();
  });

  // ---------------------------------------------------------------- répétition
  function rehearse() {
    const { deck } = current;
    const items = [];
    for (const s of window.NarratorUtil.sentences(`${deck.title}. ${deck.subtitle}`)) items.push({ text: s.text, slide: 0 });
    deck.slides.forEach((sl, k) => {
      const txt = sl.notes || [sl.title, ...sl.bullets].join(". ");
      for (const s of window.NarratorUtil.sentences(txt)) items.push({ text: s.text, slide: k + 1 });
    });
    current.ctx.speak(items, `Répétition — ${plain(deck.title)}`);
  }
  /** Appelé par l'app à chaque phrase lue : la diapositive suit la voix. */
  function onNarratorItem(item) {
    if (!current || item?.slide == null || item.slide === current.i) return;
    current.i = item.slide;
    draw();
  }

  // ---------------------------------------------------------------- export PowerPoint
  let pptxLib = null;
  const loadPptx = () =>
    (pptxLib ||= new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "/vendor/pptxgen.bundle.js";
      s.onload = () => resolve(window.PptxGenJS);
      s.onerror = () => reject(new Error("Impossible de charger le module PowerPoint"));
      document.head.append(s);
    }));
  const fileName = (t) => (plain(t) || "presentation").replace(/[\\/:*?"<>|]+/g, "").slice(0, 80);

  async function exportPptx(btn) {
    const { deck } = current;
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Création…";
    try {
      const Pptx = await loadPptx();
      const T = THEMES[deck.theme] || THEMES.lumen;
      const pptx = new Pptx();
      pptx.layout = "LAYOUT_WIDE"; // 13,33 × 7,5 pouces (16:9)
      pptx.title = plain(deck.title);
      const font = "Calibri";
      const W = 13.333;
      const bar = (s, y) => s.addShape(pptx.ShapeType.rect, { x: 0.7, y, w: 1.2, h: 0.09, fill: { color: T.accent }, line: { color: T.accent } });
      const number = (s, k) => s.addText(String(k + 1), { x: W - 1.2, y: 6.85, w: 0.6, h: 0.4, fontSize: 12, color: T.muted, align: "right", fontFace: font });

      // diapositive de titre
      const t0 = pptx.addSlide();
      t0.background = { color: T.bg };
      bar(t0, 2.55);
      t0.addText(plain(deck.title), { x: 0.7, y: 2.75, w: W - 1.4, h: 1.5, fontSize: 40, bold: true, color: T.title, fontFace: font, valign: "top", fit: "shrink" });
      if (deck.subtitle) t0.addText(plain(deck.subtitle), { x: 0.7, y: 4.3, w: W - 1.4, h: 0.9, fontSize: 22, color: T.muted, fontFace: font, valign: "top" });

      deck.slides.forEach((sl, k) => {
        const s = pptx.addSlide();
        s.background = { color: T.bg };
        const bullets = sl.bullets.filter((b) => b.trim());
        const dense = isDense(sl);
        if (sl.layout === "section") {
          bar(s, 2.8);
          s.addText(plain(sl.title), { x: 0.7, y: 3.0, w: W - 1.4, h: 1.3, fontSize: 38, bold: true, color: T.title, fontFace: font, valign: "top", fit: "shrink" });
          if (bullets[0]) s.addText(plain(bullets[0]), { x: 0.7, y: 4.35, w: W - 1.4, h: 1, fontSize: 20, color: T.muted, fontFace: font, valign: "top" });
        } else if (sl.layout === "citation") {
          s.addText(plain(sl.title), { x: 0.9, y: 0.6, w: W - 1.8, h: 0.8, fontSize: 22, bold: true, color: T.accent, fontFace: font });
          s.addText(`« ${plain(bullets.join(" "))} »`, { x: 1.3, y: 1.8, w: W - 2.6, h: 4.2, fontSize: 30, italic: true, color: T.text, fontFace: "Georgia", valign: "middle", align: "center", fit: "shrink" });
        } else {
          s.addText(plain(sl.title), { x: 0.7, y: 0.45, w: W - 1.4, h: 0.95, fontSize: 30, bold: true, color: T.title, fontFace: font, valign: "middle", fit: "shrink" });
          bar(s, 1.45);
          let y = 1.75;
          if (sl.layout === "formule" && sl.formula.trim()) {
            s.addText(window.MathText.toUnicode(sl.formula), { x: 0.9, y, w: W - 1.8, h: 1.5, fontSize: 30, color: T.text, fontFace: "Cambria Math", align: "center", valign: "middle", fit: "shrink" });
            y += 1.75;
          }
          if (bullets.length)
            s.addText(
              bullets.map((b) => ({ text: plain(b), options: { bullet: { indent: 18 }, breakLine: true } })),
              { x: 0.8, y, w: W - 1.6, h: 7.0 - y, fontSize: dense ? 18 : 22, color: T.text, fontFace: font, valign: "top", paraSpaceAfter: 10, fit: "shrink" },
            );
        }
        number(s, k + 1);
        if (sl.notes) s.addNotes(plain(sl.notes));
      });
      const blob = await pptx.write({ outputType: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fileName(deck.title) + ".pptx";
      document.body.append(a);
      a.click();
      setTimeout(() => (URL.revokeObjectURL(a.href), a.remove()), 1000);
      current.ctx.toast("PowerPoint téléchargé. Les formules y sont en texte simple ; le PDF garde l'écriture exacte.", "ok");
    } catch (e) {
      current.ctx.toast("Export PowerPoint impossible : " + e.message, "error");
    }
    btn.disabled = false;
    btn.textContent = label;
  }

  // ---------------------------------------------------------------- export PDF (impression)
  function exportPdf() {
    const { deck } = current;
    const box = document.createElement("div");
    box.id = "printDeck";
    box.innerHTML = Array.from({ length: total(deck) }, (_, k) => `<div class="print-page">${slideHTML(deck, k)}</div>`).join("");
    document.body.append(box);
    document.documentElement.classList.add("printing-deck");
    const prevTitle = document.title;
    document.title = fileName(deck.title);
    const done = () => {
      document.documentElement.classList.remove("printing-deck");
      box.remove();
      document.title = prevTitle;
      removeEventListener("afterprint", done);
    };
    addEventListener("afterprint", done);
    setTimeout(() => window.print(), 300); // laisse le temps aux polices des formules
    current.ctx.toast("Choisissez « Enregistrer en PDF » comme imprimante.", "ok");
  }

  window.Slides = { render, onNarratorItem, slideHTML, THEMES };
})();
