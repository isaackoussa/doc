/* Présentations : diapositives soignées (thèmes, icônes, mises en page variées,
 * animations), modification, projection plein écran, répétition à voix haute et
 * export PowerPoint (même design, modifiable) / PDF (formules exactes).
 *
 * Contenu : { title, subtitle, theme, slides: [{ layout, title, icon, bullets[], items[{icon,title,text}], formula, notes }] }
 * La diapositive de titre (index 0) est construite à partir de title / subtitle.
 */
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const mt = (t) => window.MathText.renderInline(t);
  const plain = (t) => window.MathText.textToUnicode(t);

  // ------------------------------------------------------------------ thèmes
  // css : variables utilisées à l'écran ; pptx : couleurs du fichier PowerPoint.
  const THEMES = {
    aurore: {
      name: "Aurore — violet et rose", dark: true,
      grad: ["#1e1b4b", "#5b21b6", "#be185d"], blobs: ["#f472b6", "#818cf8"],
      fg: "#ffffff", mu: "#e9d5ff", ac: "#fbbf24", ac2: "#f9a8d4", card: "rgba(255,255,255,.10)", cardLine: "rgba(255,255,255,.22)",
      titleFont: "Calibri", bodyFont: "Calibri",
    },
    ocean: {
      name: "Océan — bleu profond", dark: true,
      grad: ["#071a33", "#0b3b5c", "#0e7490"], blobs: ["#22d3ee", "#3b82f6"],
      fg: "#f0f9ff", mu: "#bae6fd", ac: "#22d3ee", ac2: "#a7f3d0", card: "rgba(255,255,255,.08)", cardLine: "rgba(125,211,252,.30)",
      titleFont: "Calibri", bodyFont: "Calibri",
    },
    corail: {
      name: "Corail — chaleureux", dark: false,
      grad: ["#fff7ed", "#ffedd5", "#fde2e4"], blobs: ["#fb923c", "#f472b6"],
      fg: "#2a1a12", mu: "#7c5a45", ac: "#ea580c", ac2: "#e11d48", card: "rgba(255,255,255,.80)", cardLine: "rgba(234,88,12,.20)",
      titleFont: "Calibri", bodyFont: "Calibri",
    },
    foret: {
      name: "Forêt — vert et or", dark: true,
      grad: ["#052e16", "#14532d", "#166534"], blobs: ["#facc15", "#4ade80"],
      fg: "#f7fee7", mu: "#d9f99d", ac: "#facc15", ac2: "#86efac", card: "rgba(255,255,255,.08)", cardLine: "rgba(250,204,21,.28)",
      titleFont: "Calibri", bodyFont: "Calibri",
    },
    minuit: {
      name: "Minuit — noir et néon", dark: true,
      grad: ["#030712", "#0b1120", "#111827"], blobs: ["#a3e635", "#22d3ee"],
      fg: "#f9fafb", mu: "#9ca3af", ac: "#a3e635", ac2: "#22d3ee", card: "rgba(255,255,255,.05)", cardLine: "rgba(163,230,53,.30)",
      titleFont: "Calibri", bodyFont: "Calibri",
    },
    papier: {
      name: "Papier — éditorial", dark: false,
      grad: ["#fbf8f1", "#f5efe2", "#efe6d2"], blobs: ["#b91c1c", "#d97706"],
      fg: "#1c1917", mu: "#6b5e4f", ac: "#b91c1c", ac2: "#92400e", card: "rgba(255,255,255,.70)", cardLine: "rgba(28,25,23,.14)",
      titleFont: "Georgia", bodyFont: "Calibri",
    },
  };
  const OLD_THEMES = { lumen: "corail", nuit: "ocean", sobre: "papier" };
  const LAYOUTS = {
    puces: "Puces", cartes: "Cartes (2 à 4 idées)", chiffres: "Chiffres clés", etapes: "Étapes / chronologie",
    comparaison: "Comparaison (2 colonnes)", formule: "Formule", citation: "Citation / définition", section: "Titre de partie",
  };
  const ITEM_LAYOUTS = new Set(["cartes", "chiffres", "etapes", "comparaison"]);
  const ICONS = { puces: "💡", cartes: "🧩", chiffres: "📊", etapes: "🧭", comparaison: "⚖️", formule: "🧮", citation: "💬", section: "✨" };

  const total = (deck) => deck.slides.length + 1;
  const themeOf = (deck) => THEMES[deck.theme] || THEMES.corail;
  const themeVars = (t) =>
    `--g1:${t.grad[0]};--g2:${t.grad[1]};--g3:${t.grad[2]};--b1:${t.blobs[0]};--b2:${t.blobs[1]};--fg:${t.fg};--mu:${t.mu};--ac:${t.ac};--ac2:${t.ac2};--card:${t.card};--cardl:${t.cardLine};--tf:${t.titleFont === "Georgia" ? "Georgia, 'Times New Roman', serif" : "var(--sans)"}`;
  const sectionNumber = (deck, i) => deck.slides.slice(0, i).filter((s) => s.layout === "section").length;

  // -------------------------------------------------------------- rendu HTML
  function slideHTML(deck, i, { anim = false } = {}) {
    const t = themeOf(deck);
    const cls = `slide${t.dark ? " dark" : ""}${anim ? " anim" : ""}`;
    const wrap = (layout, inner, n = true) =>
      `<div class="${cls} l-${layout}" style="${themeVars(t)}"><div class="sl-bg"></div><div class="sl">${inner}</div>${n ? `<span class="sl-pg">${i + 1} / ${total(deck)}</span>` : ""}</div>`;
    let k = 0; // ordre d'apparition (animations)
    const a = () => `style="--i:${k++}"`;

    if (i === 0)
      return wrap(
        "title",
        `<div class="sl-hero"><span class="kicker" ${a()}>Présentation</span><h1 ${a()}>${mt(deck.title)}</h1>${deck.subtitle ? `<p class="sub" ${a()}>${mt(deck.subtitle)}</p>` : ""}<div class="hero-line" ${a()}></div></div>`,
        false,
      );

    const s = deck.slides[i - 1];
    const icon = esc(s.icon || ICONS[s.layout] || "✨");
    const head = `<header ${a()}><span class="ic">${icon}</span><h2>${mt(s.title)}</h2></header>`;
    const bullets = s.bullets.filter((b) => b.trim());
    const items = s.items.filter((x) => (x.title || x.text || "").trim());

    switch (s.layout) {
      case "section": {
        const n = String(sectionNumber(deck, i)).padStart(2, "0");
        return wrap("section", `<div class="sec"><span class="big-num" ${a()}>${n}</span><div><span class="ic xl" ${a()}>${icon}</span><h2 ${a()}>${mt(s.title)}</h2>${bullets[0] ? `<p class="sub" ${a()}>${mt(bullets[0])}</p>` : ""}</div></div>`);
      }
      case "citation":
        return wrap("citation", `<div class="quote"><span class="qmark" ${a()}>“</span><blockquote ${a()}>${mt(bullets.join(" "))}</blockquote><span class="chip" ${a()}>${icon} ${mt(s.title)}</span></div>`);
      case "cartes":
        if (items.length)
          return wrap("cartes", `${head}<div class="cards n${Math.min(items.length, 4)}">${items.slice(0, 4).map((x) => `<div class="card" ${a()}><span class="ic">${esc(x.icon || "✦")}</span><h4>${mt(x.title)}</h4><p>${mt(x.text)}</p></div>`).join("")}</div>`);
        break;
      case "chiffres":
        if (items.length)
          return wrap("chiffres", `${head}<div class="stats n${Math.min(items.length, 4)}">${items.slice(0, 4).map((x) => `<div class="stat" ${a()}><span class="ic sm">${esc(x.icon || "")}</span><span class="val">${mt(x.title)}</span><span class="lab">${mt(x.text)}</span></div>`).join("")}</div>`);
        break;
      case "etapes":
        if (items.length)
          return wrap("etapes", `${head}<div class="steps n${Math.min(items.length, 5)}">${items.slice(0, 5).map((x, j) => `<div class="step" ${a()}><span class="num">${x.icon ? esc(x.icon) : j + 1}</span><h4>${mt(x.title)}</h4><p>${mt(x.text)}</p></div>`).join("")}</div>`);
        break;
      case "comparaison":
        if (items.length >= 2) {
          const col = (x) => `<div class="col" ${a()}><h4><span class="ic sm">${esc(x.icon || "")}</span>${mt(x.title)}</h4><ul>${x.text.split(/\s*;\s*|\n/).filter(Boolean).map((p) => `<li>${mt(p)}</li>`).join("")}</ul></div>`;
          return wrap("comparaison", `${head}<div class="cmp">${col(items[0])}<span class="vs" ${a()}>VS</span>${col(items[1])}</div>`);
        }
        break;
      case "formule":
        if (s.formula.trim())
          return wrap("formule", `${head}<div class="eq" ${a()}>${mt(`$$${s.formula}$$`)}</div>${bullets.length ? `<ul class="pts small">${bullets.map((b) => `<li ${a()}><span class="dot"></span><span>${mt(b)}</span></li>`).join("")}</ul>` : ""}`);
        break;
    }
    // puces (et repli si une mise en page n'a pas son contenu)
    const lines = bullets.length ? bullets : items.map((x) => [x.title, x.text].filter(Boolean).join(" : "));
    const dense = lines.join(" ").length > 300 || lines.length > 5;
    return wrap("puces", `${head}<ul class="pts${dense ? " dense" : ""}">${lines.map((b) => `<li ${a()}><span class="dot"></span><span>${mt(b)}</span></li>`).join("")}</ul>`);
  }

  // ---------------------------------------------------------------- visionneuse
  let current = null; // { deck, i, body, ctx, note, editing }

  function normalize(c) {
    const deck = JSON.parse(JSON.stringify(c || {}));
    deck.title ||= "Présentation";
    deck.subtitle ||= "";
    deck.theme = THEMES[deck.theme] ? deck.theme : OLD_THEMES[deck.theme] || "corail";
    deck.slides = (deck.slides || []).map((s) => ({
      layout: LAYOUTS[s.layout] ? s.layout : "puces",
      title: s.title || "",
      icon: s.icon || "",
      bullets: Array.isArray(s.bullets) ? s.bullets : [],
      items: Array.isArray(s.items) ? s.items.map((x) => ({ icon: x.icon || "", title: x.title || "", text: x.text || "" })) : [],
      formula: s.formula || "",
      notes: s.notes || "",
    }));
    return deck;
  }

  function render(note, body, ctx) {
    const deck = normalize(note.content);
    current = { deck, i: 0, body, ctx, note, editing: false };
    body.innerHTML = `<div class="deck">
      <div class="deck-tools">
        <button class="btn primary" data-a="present" title="Projeter en plein écran">▶ Présenter</button>
        <button class="btn" data-a="rehearse" title="Écouter les notes de l'orateur, diapositive par diapositive">🎧 Répéter</button>
        <button class="btn" data-a="pptx" title="Télécharger un fichier PowerPoint modifiable">⬇ PowerPoint</button>
        <button class="btn" data-a="pdf" title="Imprimer ou enregistrer en PDF (formules exactes)">⬇ PDF</button>
      </div>
      <div class="theme-pick" data-a="themes">${Object.entries(THEMES)
        .map(([k, t]) => `<button class="sw${k === deck.theme ? " on" : ""}" data-theme="${k}" title="${esc(t.name)}" style="background:linear-gradient(135deg,${t.grad[0]},${t.grad[1]} 55%,${t.grad[2]});--ac:${t.ac}"><span></span></button>`)
        .join("")}<span class="muted small" data-a="themeName"></span></div>
      <div class="deck-stage" data-a="stage"></div>
      <div class="deck-nav">
        <button class="icon-btn" data-a="prev" aria-label="Diapositive précédente">‹</button>
        <span class="muted small" data-a="pos"></span>
        <button class="icon-btn" data-a="next" aria-label="Diapositive suivante">›</button>
        <button class="btn small-btn" data-a="edit">✎ Modifier</button>
      </div>
      <div class="deck-side" data-a="side"></div>
      <div class="deck-thumbs" data-a="list"></div>
    </div>`;
    body.onclick = onClick;
    draw(true);
  }

  function draw(anim = false) {
    const c = current;
    if (!c) return;
    const { deck, body } = c;
    c.i = Math.max(0, Math.min(c.i, total(deck) - 1));
    $('[data-a="stage"]', body).innerHTML = slideHTML(deck, c.i, { anim });
    $('[data-a="pos"]', body).textContent = `${c.i + 1} / ${total(deck)}`;
    $('[data-a="themeName"]', body).textContent = themeOf(deck).name;
    body.querySelectorAll(".sw").forEach((b) => b.classList.toggle("on", b.dataset.theme === deck.theme));
    // miniatures
    $('[data-a="list"]', body).innerHTML = Array.from({ length: total(deck) }, (_, k) => `<button class="thumb${k === c.i ? " on" : ""}" data-go="${k}" aria-label="Diapositive ${k + 1}">${slideHTML(deck, k)}</button>`).join("");
    $(".thumb.on", body)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    const side = $('[data-a="side"]', body);
    if (c.editing) side.innerHTML = editorHTML();
    else {
      const notes = c.i === 0 ? "" : deck.slides[c.i - 1].notes;
      side.innerHTML = notes
        ? `<div class="deck-notes"><div class="eyebrow">Notes de l'orateur</div><p>${mt(notes)}</p></div>`
        : c.i === 0
          ? `<div class="deck-notes muted small">Diapositive de titre. Choisissez un thème ci-dessus, ou ✎ Modifier pour changer le titre.</div>`
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
    const itemsTxt = s.items.map((x) => [x.icon, x.title, x.text].join(" | ")).join("\n");
    return `<form class="deck-edit" data-form="slide">
      <div class="field two"><label><span>Titre</span><input name="title" value="${esc(s.title)}" /></label>
      <label class="icon-field"><span>Icône</span><input name="icon" value="${esc(s.icon)}" maxlength="4" placeholder="💡" /></label></div>
      <label class="field"><span>Mise en page</span><select name="layout">${Object.entries(LAYOUTS)
        .map(([k, v]) => `<option value="${k}" ${k === s.layout ? "selected" : ""}>${v}</option>`)
        .join("")}</select></label>
      <label class="field" data-show="items"><span>Éléments — un par ligne : icône | titre | texte</span><textarea name="items" rows="4" placeholder="📈 | 78 % | des élèves ont progressé">${esc(itemsTxt)}</textarea>
        <small class="muted">Comparaison : 2 lignes, les points séparés par « ; ». Chiffres : le titre est la valeur (ex. 78 %).</small></label>
      <label class="field" data-show="bullets"><span>Puces (une par ligne)</span><textarea name="bullets" rows="4">${esc(s.bullets.join("\n"))}</textarea></label>
      <label class="field" data-show="formula"><span>Formule (LaTeX)</span><input name="formula" value="${esc(s.formula)}" placeholder="ex. \\Delta = b^2 - 4ac" /></label>
      <label class="field"><span>Notes de l'orateur</span><textarea name="notes" rows="3">${esc(s.notes)}</textarea></label>
      <p class="muted small">Formules dans les textes : entre $…$, par exemple $x^2 + 1$.</p>
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
      return;
    }
    const s = current.deck.slides[current.i - 1];
    s.title = v("title").trim();
    s.icon = v("icon").trim();
    s.layout = v("layout");
    s.bullets = v("bullets").split("\n").map((x) => x.trim()).filter(Boolean);
    s.items = v("items")
      .split("\n")
      .map((l) => l.split("|").map((x) => x.trim()))
      .filter((p) => p.some(Boolean))
      .map((p) => (p.length >= 3 ? { icon: p[0], title: p[1], text: p.slice(2).join(" | ") } : p.length === 2 ? { icon: "", title: p[0], text: p[1] } : { icon: "", title: p[0], text: "" }));
    s.formula = v("formula").trim();
    s.notes = v("notes").trim();
  }

  async function save() {
    const c = current;
    try {
      const note = await c.ctx.save(c.deck);
      if (note) c.note.content = note.content;
    } catch (e) {
      c.ctx.toast("Enregistrement impossible : " + e.message, "error");
    }
  }

  function go(delta) {
    current.i += delta;
    draw(true);
  }

  async function onClick(e) {
    const c = current;
    if (!c) return;
    const sw = e.target.closest("[data-theme]");
    if (sw) {
      c.deck.theme = sw.dataset.theme;
      draw(true);
      save();
      return;
    }
    const goEl = e.target.closest("[data-go]");
    if (goEl) return ((c.i = Number(goEl.dataset.go)), draw(true));
    const btn = e.target.closest("[data-a]");
    if (!btn || btn.dataset.a === "stage" || btn.dataset.a === "list" || btn.dataset.a === "themes") {
      const stage = e.target.closest(".deck-stage");
      if (stage && !c.editing) {
        const r = stage.getBoundingClientRect();
        go(e.clientX - r.left > r.width / 2 ? 1 : -1);
      }
      return;
    }
    const a = btn.dataset.a;
    if (a === "prev") go(-1);
    if (a === "next") go(1);
    if (a === "edit") ((c.editing = !c.editing), draw());
    if (a === "present") present();
    if (a === "rehearse") rehearse();
    if (a === "pptx") exportPptx(btn);
    if (a === "pdf") exportPdf();
    if (["add", "up", "down", "del"].includes(a)) {
      readForm();
      const k = c.i - 1;
      if (a === "add") {
        c.deck.slides.splice(c.i, 0, { layout: "puces", title: "Nouvelle diapositive", icon: "✨", bullets: [], items: [], formula: "", notes: "" });
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
    draw(true);
    save().then(() => current?.ctx.toast("Diapositive enregistrée", "ok"));
  });

  // ---------------------------------------------------------------- plein écran
  let presenter = null;
  function present() {
    presenter = document.createElement("div");
    presenter.className = "presenter";
    presenter.innerHTML = `<div class="pr-stage"></div>
      <div class="pr-progress"><div></div></div>
      <div class="pr-bar"><button data-p="prev" aria-label="Précédente">‹</button><span data-p="pos"></span>
      <button data-p="next" aria-label="Suivante">›</button><button data-p="notes" title="Afficher les notes">Notes</button><button data-p="close" aria-label="Quitter">✕</button></div>
      <div class="pr-notes hidden"></div>`;
    document.body.append(presenter);
    presenter.addEventListener("click", (e) => {
      const p = e.target.closest("[data-p]")?.dataset.p;
      if (p === "close") return closePresenter();
      if (p === "notes") return presenter.querySelector(".pr-notes").classList.toggle("hidden");
      if (p === "prev") go(-1);
      else if (p === "next") go(1);
      else if (e.target.closest(".pr-stage")) go(e.clientX > innerWidth / 2 ? 1 : -1);
    });
    presenter.requestFullscreen?.().catch(() => {});
    draw(true);
  }
  function presenterDraw() {
    if (!presenter || !current) return;
    const { deck, i } = current;
    presenter.querySelector(".pr-stage").innerHTML = slideHTML(deck, i, { anim: true });
    presenter.querySelector('[data-p="pos"]').textContent = `${i + 1} / ${total(deck)}`;
    presenter.querySelector(".pr-progress div").style.width = `${((i + 1) / total(deck)) * 100}%`;
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
    if (["ArrowRight", "PageDown", " ", "Enter"].includes(e.key)) (go(1), e.preventDefault());
    else if (["ArrowLeft", "PageUp", "Backspace"].includes(e.key)) (go(-1), e.preventDefault());
    else if (e.key === "Escape") closePresenter();
  });

  // ---------------------------------------------------------------- répétition
  function rehearse() {
    const { deck } = current;
    const items = [];
    for (const s of window.NarratorUtil.sentences(`${deck.title}. ${deck.subtitle}`)) items.push({ text: s.text, slide: 0 });
    deck.slides.forEach((sl, k) => {
      const txt = sl.notes || [sl.title, ...sl.bullets, ...sl.items.map((x) => `${x.title} : ${x.text}`)].join(". ");
      for (const s of window.NarratorUtil.sentences(txt)) items.push({ text: s.text, slide: k + 1 });
    });
    current.ctx.speak(items, `Répétition — ${plain(deck.title)}`);
  }
  function onNarratorItem(item) {
    if (!current || item?.slide == null || item.slide === current.i) return;
    current.i = item.slide;
    draw(true);
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
  const hex = (c) => c.replace("#", "").toUpperCase();

  /** Fond du thème (dégradé + halos lumineux) dessiné en image pour PowerPoint. */
  function backgroundPNG(t, variant = 0) {
    const W = 1280, H = 720;
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const g = cv.getContext("2d");
    const lin = g.createLinearGradient(0, 0, W, H);
    lin.addColorStop(0, t.grad[0]);
    lin.addColorStop(0.55, t.grad[1]);
    lin.addColorStop(1, t.grad[2]);
    g.fillStyle = lin;
    g.fillRect(0, 0, W, H);
    const blob = (x, y, r, color, alpha) => {
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      const c = color.replace("#", "");
      const [R, G, B] = [0, 2, 4].map((k) => parseInt(c.slice(k, k + 2), 16));
      rg.addColorStop(0, `rgba(${R},${G},${B},${alpha})`);
      rg.addColorStop(1, `rgba(${R},${G},${B},0)`);
      g.fillStyle = rg;
      g.fillRect(0, 0, W, H);
    };
    const a = t.dark ? 0.45 : 0.28;
    if (variant === 0) (blob(W * 0.85, H * 0.15, 500, t.blobs[0], a), blob(W * 0.1, H * 0.95, 450, t.blobs[1], a * 0.8));
    else (blob(W * 0.95, H * 0.9, 420, t.blobs[0], a * 0.7), blob(W * 0.05, H * 0.05, 340, t.blobs[1], a * 0.55));
    return cv.toDataURL("image/jpeg", 0.9).replace(/^data:/, "");
  }

  async function exportPptx(btn) {
    const { deck } = current;
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Création…";
    try {
      const Pptx = await loadPptx();
      const T = themeOf(deck);
      const pptx = new Pptx();
      pptx.layout = "LAYOUT_WIDE"; // 13,33 × 7,5 pouces (16:9)
      pptx.title = plain(deck.title);
      const W = 13.333, H = 7.5;
      const FG = hex(T.fg), MU = hex(T.mu), AC = hex(T.ac), AC2 = hex(T.ac2);
      const TF = T.titleFont, BF = T.bodyFont;
      // Le fond n'est stocké qu'une fois (masques) : fichier léger.
      pptx.defineSlideMaster({ title: "LUMEN_TITRE", background: { data: backgroundPNG(T, 0) } });
      pptx.defineSlideMaster({ title: "LUMEN_CONTENU", background: { data: backgroundPNG(T, 1) } });
      const cardFill = { color: T.dark ? "FFFFFF" : "FFFFFF", transparency: T.dark ? 90 : 25 };
      const cardLine = { color: AC, transparency: 70, width: 1 };
      const shadow = { type: "outer", blur: 8, offset: 2, angle: 90, opacity: T.dark ? 0.35 : 0.12, color: "000000" };
      const pageNo = (s, k) => s.addText(`${k + 1} / ${total(deck)}`, { x: W - 1.6, y: H - 0.55, w: 1.2, h: 0.35, fontSize: 11, color: MU, align: "right", fontFace: BF });
      const header = (s, sl) => {
        s.addShape(pptx.ShapeType.ellipse, { x: 0.6, y: 0.5, w: 0.85, h: 0.85, fill: { color: AC, transparency: 80 }, line: { color: AC, transparency: 50, width: 1 } });
        s.addText(sl.icon || ICONS[sl.layout] || "✨", { x: 0.6, y: 0.5, w: 0.85, h: 0.85, fontSize: 24, align: "center", valign: "middle" });
        s.addText(plain(sl.title), { x: 1.65, y: 0.45, w: W - 2.3, h: 0.95, fontSize: 30, bold: true, color: FG, fontFace: TF, valign: "middle", fit: "shrink" });
        s.addShape(pptx.ShapeType.rect, { x: 1.68, y: 1.38, w: 1.1, h: 0.07, fill: { color: AC }, line: { color: AC, width: 0 } });
      };
      const bulletsBox = (s, lines, y, size = 26) => {
        const long = lines.join(" ").length > 260 || lines.length > 5;
        s.addText(
          lines.map((b) => ({ text: plain(b), options: { bullet: { characterCode: "25CF", indent: 24 }, breakLine: true } })),
          { x: 1.0, y, w: W - 2.0, h: H - y - 0.8, fontSize: long ? Math.min(size, 20) : size, color: FG, fontFace: BF, valign: "middle", paraSpaceAfter: 16, ...(long ? { fit: "shrink" } : {}) },
        );
      };

      // diapositive de titre
      const t0 = pptx.addSlide({ masterName: "LUMEN_TITRE" });
      t0.addText("PRÉSENTATION", { x: 0.9, y: 2.0, w: 6, h: 0.4, fontSize: 13, bold: true, color: AC, charSpacing: 6, fontFace: BF });
      t0.addText(plain(deck.title), { x: 0.9, y: 2.45, w: W - 1.8, h: 1.9, fontSize: 48, bold: true, color: FG, fontFace: TF, valign: "top", fit: "shrink" });
      if (deck.subtitle) t0.addText(plain(deck.subtitle), { x: 0.9, y: 4.45, w: W - 2.4, h: 0.9, fontSize: 22, color: MU, fontFace: BF, valign: "top" });
      t0.addShape(pptx.ShapeType.rect, { x: 0.92, y: 5.5, w: 2.2, h: 0.09, fill: { color: AC }, line: { color: AC, width: 0 } });
      t0.addShape(pptx.ShapeType.rect, { x: 3.2, y: 5.5, w: 0.9, h: 0.09, fill: { color: AC2 }, line: { color: AC2, width: 0 } });

      deck.slides.forEach((sl, k) => {
        const s = pptx.addSlide({ masterName: sl.layout === "section" ? "LUMEN_TITRE" : "LUMEN_CONTENU" });
        const bullets = sl.bullets.filter((b) => b.trim());
        const items = sl.items.filter((x) => (x.title || x.text || "").trim());
        const L = sl.layout;

        if (L === "section") {
          const n = String(sectionNumber(deck, k + 1)).padStart(2, "0");
          s.addText(n, { x: 0.7, y: 1.2, w: 4.2, h: 3.6, fontSize: 160, bold: true, color: AC, transparency: 35, fontFace: TF });
          s.addText(sl.icon || "✨", { x: 5.0, y: 2.0, w: 1, h: 0.9, fontSize: 40 });
          s.addText(plain(sl.title), { x: 5.0, y: 2.9, w: W - 5.8, h: 1.5, fontSize: 40, bold: true, color: FG, fontFace: TF, valign: "top", fit: "shrink" });
          if (bullets[0]) s.addText(plain(bullets[0]), { x: 5.0, y: 4.45, w: W - 5.8, h: 1.0, fontSize: 20, color: MU, fontFace: BF, valign: "top" });
        } else if (L === "citation") {
          s.addText("“", { x: 0.8, y: 0.4, w: 2, h: 2, fontSize: 160, color: AC, fontFace: "Georgia", transparency: 20 });
          s.addText(plain(bullets.join(" ")), { x: 1.6, y: 1.7, w: W - 3.2, h: 3.6, fontSize: 32, italic: true, color: FG, fontFace: "Georgia", valign: "middle", fit: "shrink" });
          s.addShape(pptx.ShapeType.roundRect, { x: 1.6, y: 5.6, w: 5.2, h: 0.7, rectRadius: 0.5, fill: { color: AC, transparency: 80 }, line: { color: AC, transparency: 40, width: 1 } });
          s.addText(`${sl.icon || "💬"}  ${plain(sl.title)}`, { x: 1.6, y: 5.6, w: 5.2, h: 0.7, fontSize: 16, bold: true, color: FG, align: "center", valign: "middle", fontFace: BF });
        } else if (L === "cartes" && items.length) {
          header(s, sl);
          const n = Math.min(items.length, 4), gap = 0.35, x0 = 0.8, w = (W - 1.6 - gap * (n - 1)) / n, h = 3.9, y = 1.75 + (H - 1.75 - 0.6 - h) / 2;
          items.slice(0, 4).forEach((it, j) => {
            const x = x0 + j * (w + gap);
            s.addShape(pptx.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.12, fill: cardFill, line: cardLine, shadow });
            s.addShape(pptx.ShapeType.rect, { x: x + 0.35, y: y + 0.3, w: 0.6, h: 0.06, fill: { color: j % 2 ? AC2 : AC }, line: { width: 0, color: AC } });
            s.addText(it.icon || "✦", { x: x + 0.3, y: y + 0.5, w: 1.1, h: 0.9, fontSize: 34 });
            s.addText(plain(it.title), { x: x + 0.3, y: y + 1.45, w: w - 0.6, h: 0.8, fontSize: n > 3 ? 20 : 24, bold: true, color: FG, fontFace: TF, valign: "top" });
            s.addText(plain(it.text), { x: x + 0.3, y: y + 2.25, w: w - 0.6, h: h - 2.45, fontSize: n > 3 ? 15 : 18, color: MU, fontFace: BF, valign: "top", fit: "shrink" });
          });
        } else if (L === "chiffres" && items.length) {
          header(s, sl);
          const n = Math.min(items.length, 4), gap = 0.35, x0 = 0.8, w = (W - 1.6 - gap * (n - 1)) / n, h = 3.7, y = 1.75 + (H - 1.75 - 0.6 - h) / 2;
          items.slice(0, 4).forEach((it, j) => {
            const x = x0 + j * (w + gap);
            s.addShape(pptx.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.12, fill: cardFill, line: cardLine, shadow });
            if (it.icon) s.addText(it.icon, { x: x + 0.3, y: y + 0.3, w: 0.9, h: 0.7, fontSize: 24 });
            s.addText(plain(it.title), { x: x + 0.2, y: y + 0.95, w: w - 0.4, h: 1.5, fontSize: n > 3 ? 40 : 50, bold: true, color: j % 2 ? AC2 : AC, fontFace: TF, align: "center", valign: "middle", fit: "shrink" });
            s.addText(plain(it.text), { x: x + 0.3, y: y + 2.45, w: w - 0.6, h: 1.1, fontSize: 18, color: FG, fontFace: BF, align: "center", valign: "top", fit: "shrink" });
          });
        } else if (L === "etapes" && items.length) {
          header(s, sl);
          const n = Math.min(items.length, 5), x0 = 0.9, span = W - 1.8, step = span / n, yc = 3.0;
          s.addShape(pptx.ShapeType.line, { x: x0 + step / 2, y: yc, w: span - step, h: 0, line: { color: AC, width: 2, transparency: 40, dashType: "dash" } });
          items.slice(0, 5).forEach((it, j) => {
            const cx = x0 + step * j + step / 2;
            s.addShape(pptx.ShapeType.ellipse, { x: cx - 0.5, y: yc - 0.5, w: 1.0, h: 1.0, fill: { color: j % 2 ? AC2 : AC }, line: { color: "FFFFFF", width: 2, transparency: 30 }, shadow });
            s.addText(it.icon || String(j + 1), { x: cx - 0.5, y: yc - 0.5, w: 1.0, h: 1.0, fontSize: it.icon ? 22 : 24, bold: true, color: T.dark ? "111111" : "FFFFFF", align: "center", valign: "middle", fontFace: BF });
            s.addText(plain(it.title), { x: cx - step / 2 + 0.15, y: yc + 0.65, w: step - 0.3, h: 0.6, fontSize: n > 4 ? 17 : 20, bold: true, color: FG, fontFace: TF, align: "center", valign: "middle" });
            s.addShape(pptx.ShapeType.roundRect, { x: cx - step / 2 + 0.12, y: yc + 1.35, w: step - 0.24, h: 1.9, rectRadius: 0.1, fill: cardFill, line: cardLine });
            s.addText(plain(it.text), { x: cx - step / 2 + 0.25, y: yc + 1.45, w: step - 0.5, h: 1.7, fontSize: n > 4 ? 14 : 16, color: MU, fontFace: BF, align: "center", valign: "middle", fit: "shrink" });
          });
        } else if (L === "comparaison" && items.length >= 2) {
          header(s, sl);
          const w = (W - 2.6) / 2, h = 4.0, y = 1.75 + (H - 1.75 - 0.6 - h) / 2;
          items.slice(0, 2).forEach((it, j) => {
            const x = 0.8 + j * (w + 1.0);
            const col = j ? AC2 : AC;
            s.addShape(pptx.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.1, fill: cardFill, line: { color: col, transparency: 40, width: 1.5 }, shadow });
            s.addText(`${it.icon ? it.icon + "  " : ""}${plain(it.title)}`, { x: x + 0.3, y: y + 0.25, w: w - 0.6, h: 0.8, fontSize: 26, bold: true, color: col, fontFace: TF, valign: "middle" });
            const pts = it.text.split(/\s*;\s*|\n/).filter(Boolean);
            s.addText(
              pts.map((p) => ({ text: plain(p), options: { bullet: { characterCode: "25CF", indent: 18 }, breakLine: true } })),
              { x: x + 0.3, y: y + 1.15, w: w - 0.6, h: h - 1.4, fontSize: 20, color: FG, fontFace: BF, valign: "top", paraSpaceAfter: 12, fit: "shrink" },
            );
          });
          s.addShape(pptx.ShapeType.ellipse, { x: W / 2 - 0.45, y: y + h / 2 - 0.45, w: 0.9, h: 0.9, fill: { color: AC }, line: { color: "FFFFFF", width: 2 }, shadow });
          s.addText("VS", { x: W / 2 - 0.45, y: y + h / 2 - 0.45, w: 0.9, h: 0.9, fontSize: 16, bold: true, color: T.dark ? "111111" : "FFFFFF", align: "center", valign: "middle", fontFace: BF });
        } else if (L === "formule" && sl.formula.trim()) {
          header(s, sl);
          s.addShape(pptx.ShapeType.roundRect, { x: 1.4, y: 1.9, w: W - 2.8, h: 2.1, rectRadius: 0.12, fill: cardFill, line: cardLine, shadow });
          s.addText(window.MathText.toUnicode(sl.formula), { x: 1.6, y: 1.95, w: W - 3.2, h: 2.0, fontSize: 36, color: FG, fontFace: "Cambria Math", align: "center", valign: "middle", fit: "shrink" });
          if (bullets.length) bulletsBox(s, bullets, 4.25, 22);
        } else {
          header(s, sl);
          const lines = bullets.length ? bullets : items.map((x) => [x.title, x.text].filter(Boolean).join(" : "));
          bulletsBox(s, lines, 1.75);
        }
        pageNo(s, k + 1);
        if (sl.notes) s.addNotes(plain(sl.notes));
      });

      const blob = await pptx.write({ outputType: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fileName(deck.title) + ".pptx";
      document.body.append(a);
      a.click();
      setTimeout(() => (URL.revokeObjectURL(a.href), a.remove()), 1000);
      current.ctx.toast("PowerPoint téléchargé ✓ (les formules y sont en texte ; le PDF garde l'écriture exacte)", "ok");
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
    setTimeout(() => window.print(), 300);
    current.ctx.toast("Choisissez « Enregistrer en PDF » comme imprimante.", "ok");
  }

  window.Slides = { render, onNarratorItem, slideHTML, THEMES, normalize };
})();
