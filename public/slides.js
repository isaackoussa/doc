/* Présentations au style professionnel / éditorial (inspiré des exposés universitaires
 * et supports de conseil) : fond blanc, titres à empattements, couleur sombre + or,
 * icônes au trait, frises, étapes, panneaux de chiffres, tableaux, encadrés.
 * Affichage (16:9, tailles en cqw), édition, plein écran, répétition à voix haute,
 * export PowerPoint (même mise en page, modifiable) et PDF.
 */
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const mt = (t) => window.MathText.renderInline(t);
  const plain = (t) => window.MathText.textToUnicode(t);

  // ---------------------------------------------------------------- palettes
  const PALETTES = {
    sarcelle: { name: "Sarcelle et or", d: "#12393A", d2: "#1F6B66", ac: "#C9962B", light: "#EEF3F2", ink: "#16302F" },
    marine: { name: "Bleu nuit et or", d: "#14213D", d2: "#2B4A7A", ac: "#C9A227", light: "#EEF1F6", ink: "#14213D" },
    bordeaux: { name: "Bordeaux et or", d: "#4A1621", d2: "#7A2E3B", ac: "#C9962B", light: "#F5EEEF", ink: "#3A1219" },
    foret: { name: "Forêt et or", d: "#1E3A2B", d2: "#3B6B4F", ac: "#B8963E", light: "#EEF3EF", ink: "#1E3A2B" },
    ardoise: { name: "Ardoise et orange", d: "#263238", d2: "#455A64", ac: "#E07A2E", light: "#EEF1F2", ink: "#1F2A30" },
    prune: { name: "Prune et or", d: "#3A1F45", d2: "#6A3F7A", ac: "#D4A24C", light: "#F3EEF5", ink: "#2E1838" },
  };
  const RED = "#B5473A";
  const OLD = { aurore: "prune", ocean: "marine", corail: "sarcelle", foret: "foret", minuit: "ardoise", papier: "bordeaux", lumen: "sarcelle", nuit: "marine", sobre: "marine" };
  const LAYOUTS = {
    plan: "Plan / problématique", cartes: "Cartes", liste_chiffres: "Liste + panneau de chiffres", frise: "Frise chronologique",
    etapes: "Étapes", deux_colonnes: "Deux colonnes", tableau: "Tableau / cas pratique", chiffres: "Chiffres clés", puces: "Liste simple",
    formule: "Formule", citation: "Citation", section: "Titre de partie", conclusion: "Conclusion",
  };
  const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];

  // ---------------------------------------------------------------- icônes
  let ICONS = {};
  let iconsReady = fetch("/vendor/icons.json")
    .then((r) => r.json())
    .then((j) => (ICONS = j))
    .catch(() => {});
  const iconSVG = (name) => ICONS[name] || ICONS["sparkles"] || "";
  const ico = (name, extra = "") => `<span class="ico ${extra}">${iconSVG(name)}</span>`;

  const total = (deck) => deck.slides.length + 1;
  const pal = (deck) => PALETTES[deck.palette] || PALETTES.sarcelle;
  const vars = (p) => `--d:${p.d};--d2:${p.d2};--ac:${p.ac};--lt:${p.light};--ink:${p.ink};--red:${RED}`;

  // ---------------------------------------------------------------- normalisation
  const strArr = (a) => (Array.isArray(a) ? a.map((x) => String(x ?? "")).filter((x) => x.trim()) : []);
  function normalize(c) {
    const deck = JSON.parse(JSON.stringify(c || {}));
    deck.title ||= "Présentation";
    deck.subtitle ||= "";
    deck.context ||= "";
    deck.icon ||= "book-open";
    deck.palette = PALETTES[deck.palette] ? deck.palette : OLD[deck.theme] || "sarcelle";
    deck.slides = (deck.slides || []).map((s) => {
      // anciens formats (puces / cartes à emoji…)
      const items = Array.isArray(s.items) ? s.items : [];
      const out = {
        layout: LAYOUTS[s.layout] ? s.layout : s.layout === "comparaison" ? "deux_colonnes" : "puces",
        title: s.title || "",
        icon: ICONS[s.icon] || /^[a-z0-9-]+$/.test(s.icon || "") ? s.icon || "" : "",
        kicker: s.kicker || "",
        lead: s.lead || "",
        items: items.map((x) => ({ icon: /^[a-z0-9-]+$/.test(x.icon || "") ? x.icon : "", label: x.label || "", title: x.title || "", text: x.text || "", highlight: !!x.highlight })),
        columns: Array.isArray(s.columns) ? s.columns.map((c) => ({ icon: c.icon || "", title: c.title || "", points: strArr(c.points) })) : [],
        figures: Array.isArray(s.figures) ? s.figures.map((f) => ({ value: f.value || "", label: f.label || "" })) : [],
        table: { headers: strArr(s.table?.headers), rows: Array.isArray(s.table?.rows) ? s.table.rows.map((r) => (Array.isArray(r) ? r.map((x) => String(x ?? "")) : [])) : [] },
        alert: { title: s.alert?.title || "", text: s.alert?.text || "" },
        formula: s.formula || "",
        notes: s.notes || "",
      };
      // ancien format : puces → éléments ; comparaison (items) → colonnes
      if (Array.isArray(s.bullets) && s.bullets.length && !out.items.length) out.items = s.bullets.map((b) => ({ icon: "", label: "", title: "", text: b, highlight: false }));
      if (s.layout === "comparaison" && !out.columns.length) out.columns = items.slice(0, 2).map((x) => ({ icon: "", title: x.title, points: String(x.text || "").split(/\s*;\s*/).filter(Boolean) }));
      if (s.layout === "citation" && !out.lead && Array.isArray(s.bullets)) out.lead = s.bullets.join(" ");
      return out;
    });
    return deck;
  }

  // ---------------------------------------------------------------- rendu HTML
  function slideHTML(deck, i, { anim = false } = {}) {
    const p = pal(deck);
    const n = total(deck);
    const foot = (dark) => `<div class="ft${dark ? " on-dark" : ""}"><span>${esc(deck.context || deck.title)}</span><span>${i + 1}</span></div>`;
    const box = (cls, inner, dark = false) =>
      `<div class="pslide ${cls}${dark ? " dark" : ""}${anim ? " anim" : ""}" style="${vars(p)}"><div class="ps">${inner}</div>${i ? foot(dark) : ""}</div>`;
    let k = 0;
    const a = () => `style="--i:${k++}"`;

    if (i === 0)
      return box(
        "l-title",
        `${ico(deck.icon, "big")}<div class="t-main"><h1 ${a()}>${mt(deck.title)}</h1>${deck.subtitle ? `<p class="t-sub" ${a()}>${mt(deck.subtitle)}</p>` : ""}</div>${deck.context ? `<p class="t-ctx" ${a()}>${esc(deck.context)}</p>` : ""}`,
        true,
      );

    const s = deck.slides[i - 1];
    const H = `<h2 class="st" ${a()}>${mt(s.title)}</h2>`;
    const items = s.items.filter((x) => (x.title || x.text || x.label).trim());
    const lead = s.lead ? `<p class="lead" ${a()}>${mt(s.lead)}</p>` : "";
    const alertBox = (al) =>
      al.title || al.text ? `<div class="alert" ${a()}>${ico("triangle-alert", "red")}<div><b>${mt(al.title)}</b><span>${mt(al.text)}</span></div></div>` : "";

    switch (s.layout) {
      case "section":
        return box("l-section", `<span class="kick" ${a()}>${mt(s.kicker || "")}</span><h2 class="sec-t" ${a()}>${mt(s.title)}</h2>${s.lead ? `<p class="sec-l" ${a()}>${mt(s.lead)}</p>` : ""}`, true);

      case "conclusion":
        return box(
          "l-concl",
          `<span class="kick" ${a()}>${mt(s.kicker || "Conclusion")}</span><h2 class="c-t" ${a()}>${mt(s.title)}</h2>
          <div class="c-cols">${s.columns.slice(0, 3).map((c) => `<div class="c-col" ${a()}><div class="c-h">${ico(c.icon || "circle-check")}<b>${mt(c.title)}</b></div><ul>${c.points.map((x) => `<li>${mt(x)}</li>`).join("")}</ul></div>`).join("")}</div>
          ${s.lead ? `<p class="c-lead" ${a()}>${mt(s.lead)}</p>` : ""}`,
          true,
        );

      case "plan":
        return box(
          "l-plan",
          `${H}<div class="callout" ${a()}>${ico("circle-help")}<div><b>${mt(s.kicker || "Problématique")}</b><i>${mt(s.lead)}</i></div></div>
          ${items.length ? `<p class="mini" ${a()}>Notre démarche en ${items.length} parties</p>` : ""}
          <div class="grid g${Math.min(items.length, 4)}">${items.map((x, j) => `<div class="card" ${a()}><span class="ico num">${esc(x.label || ROMAN[j])}</span><b>${mt(x.title)}</b><span>${mt(x.text)}</span></div>`).join("")}</div>`,
        );

      case "cartes": {
        const g = items.length === 4 ? 2 : Math.min(items.length, 3);
        return box("l-cartes", `${H}<div class="grid g${g}">${items.map((x) => `<div class="card row" ${a()}><div class="c-h">${ico(x.icon || "lightbulb")}<b>${mt(x.title)}</b></div><span>${mt(x.text)}</span></div>`).join("")}</div>${lead}`);
      }

      case "liste_chiffres":
        return box(
          "l-lc",
          `${H}<div class="lc"><div class="lc-list">${items.map((x) => `<div class="li" ${a()}>${ico(x.icon || "info")}<div><b>${mt(x.title)}</b><span>${mt(x.text)}</span></div></div>`).join("")}</div>
          <div class="panel" ${a()}><span class="p-k">${mt(s.kicker)}</span>${s.figures.map((f) => `<div class="fig"><span class="v">${mt(f.value)}</span><span class="l">${mt(f.label)}</span></div>`).join("")}${s.lead ? `<p class="p-note">${mt(s.lead)}</p>` : ""}</div></div>`,
        );

      case "frise":
        return box(
          "l-frise",
          `${H}<div class="tl n${Math.min(items.length, 7)}">${items.map((x) => `<div class="tl-i${x.highlight ? " hl" : ""}" ${a()}><b class="tl-d">${mt(x.label || x.title)}</b><span class="tl-dot"></span><div class="tl-t">${x.title && x.label ? `<b>${mt(x.title)}</b> ` : ""}${mt(x.text)}</div></div>`).join("")}</div>${lead}`,
        );

      case "etapes":
        return box(
          "l-etapes",
          `${H}<div class="steps n${Math.min(items.length, 5)}">${items.map((x, j) => `${j ? `<span class="arrow" ${a()}>▶</span>` : ""}<div class="step${j % 2 ? " alt" : ""}${x.highlight ? " hl" : ""}" ${a()}><span class="s-l">${mt(x.label || "Étape " + (j + 1))}</span><b>${mt(x.title)}</b><span>${mt(x.text)}</span></div>`).join("")}</div>
          ${s.columns.length ? `<div class="grid g${Math.min(s.columns.length, 3)} below">${s.columns.map((c) => `<div class="card row" ${a()}><div class="c-h">${ico(c.icon || "info")}<b>${mt(c.title)}</b></div><span>${c.points.map(mt).join(" ; ")}</span></div>`).join("")}</div>` : ""}${lead}`,
        );

      case "deux_colonnes":
        return box(
          "l-2col",
          `${H}<div class="grid g2">${s.columns.slice(0, 2).map((c) => `<div class="card col" ${a()}><div class="c-h">${ico(c.icon || "user")}<b>${mt(c.title)}</b></div><ul>${c.points.map((x) => `<li>${mt(x)}</li>`).join("")}</ul></div>`).join("")}</div>${alertBox(s.alert)}${lead}`,
        );

      case "tableau": {
        const t = s.table;
        const side = items.length > 0;
        const tbl = `<table class="tb" ${a()}><thead><tr>${t.headers.map((h, j) => `<th class="${j === t.headers.length - 1 && t.headers.length > 2 ? "gold" : ""}">${mt(h)}</th>`).join("")}</tr></thead><tbody>${t.rows.map((r, ri) => `<tr class="${ri === t.rows.length - 1 && /total|ttc|résultat|somme/i.test(r[0] || "") ? "tot" : ""}">${r.map((c, j) => `<td${j && /^[\d\s.,%+−-]+(fcfa|€|\$|%)?$/i.test(c.trim()) ? ' class="num"' : ""}>${mt(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
        if (!side) return box("l-table", `${H}${s.kicker ? `<p class="mini" ${a()}>${mt(s.kicker)}</p>` : ""}${tbl}${lead}`);
        return box(
          "l-case",
          `${H}${s.kicker ? `<p class="mini it" ${a()}>${mt(s.kicker)}</p>` : ""}<div class="case">${tbl}<div class="vtl">${items.map((x) => `<div class="v-i${x.highlight ? " hl" : ""}" ${a()}><span class="v-dot"></span><div><b>${mt(x.label)}</b> ${mt(x.text)}</div></div>`).join("")}${s.alert.title || s.alert.text ? `<div class="res" ${a()}><b>${mt(s.alert.title)}</b><span>${mt(s.alert.text)}</span></div>` : ""}</div></div>${lead}`,
        );
      }

      case "chiffres":
        return box(
          "l-chif",
          `${H}<div class="grid g${Math.min(items.length, 4)}">${items.map((x) => `<div class="card stat" ${a()}><div class="c-h">${ico(x.icon || "chart-column")}<b>${mt(x.title)}</b></div><span>${mt(x.text)}</span><span class="big">${mt(x.label)}</span></div>`).join("")}</div>${lead}`,
        );

      case "formule":
        return box(
          "l-form",
          `${H}<div class="eq" ${a()}>${mt(`$$${s.formula}$$`)}</div><div class="lc-list one">${items.map((x) => `<div class="li" ${a()}>${ico(x.icon || "info")}<div>${x.title ? `<b>${mt(x.title)}</b>` : ""}<span>${mt(x.text)}</span></div></div>`).join("")}</div>${lead}`,
        );

      case "citation":
        return box("l-quote", `${H}<blockquote ${a()}><span class="q">“</span>${mt(s.lead)}</blockquote>${s.kicker ? `<p class="q-src" ${a()}>— ${mt(s.kicker)}</p>` : ""}`);
    }
    // liste simple (et repli)
    return box(
      "l-puces",
      `${H}<div class="lc-list one">${items.map((x) => `<div class="li" ${a()}>${x.icon ? ico(x.icon) : `<span class="dot"></span>`}<div>${x.title ? `<b>${mt(x.title)}</b>` : ""}<span>${mt(x.text)}</span></div></div>`).join("")}</div>${lead}`,
    );
  }

  // ---------------------------------------------------------------- visionneuse
  let current = null;

  async function render(note, body, ctx) {
    await iconsReady;
    const deck = normalize(note.content);
    current = { deck, i: 0, body, ctx, note, editing: false };
    body.innerHTML = `<div class="deck">
      <div class="deck-tools">
        <button class="btn primary" data-a="present" title="Projeter en plein écran">▶ Présenter</button>
        <button class="btn" data-a="rehearse" title="Écouter les notes de l'orateur">🎧 Répéter</button>
        <button class="btn" data-a="pptx" title="Télécharger un PowerPoint modifiable">⬇ PowerPoint</button>
        <button class="btn" data-a="pdf" title="Imprimer ou enregistrer en PDF">⬇ PDF</button>
      </div>
      <div class="theme-pick">${Object.entries(PALETTES)
        .map(([key, t]) => `<button class="sw${key === deck.palette ? " on" : ""}" data-pal="${key}" title="${esc(t.name)}" style="background:${t.d}"><span style="background:${t.ac}"></span></button>`)
        .join("")}<span class="muted small" data-a="palName"></span></div>
      <div class="deck-stage" data-a="stage"></div>
      <div class="deck-nav">
        <button class="icon-btn" data-a="prev" aria-label="Précédente">‹</button>
        <span class="muted small" data-a="pos"></span>
        <button class="icon-btn" data-a="next" aria-label="Suivante">›</button>
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
    $('[data-a="palName"]', body).textContent = pal(deck).name;
    body.querySelectorAll(".sw").forEach((b) => b.classList.toggle("on", b.dataset.pal === deck.palette));
    $('[data-a="list"]', body).innerHTML = Array.from({ length: total(deck) }, (_, k) => `<button class="thumb${k === c.i ? " on" : ""}" data-go="${k}" aria-label="Diapositive ${k + 1}">${slideHTML(deck, k)}</button>`).join("");
    $(".thumb.on", body)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    const side = $('[data-a="side"]', body);
    if (c.editing) side.innerHTML = editorHTML();
    else {
      const notes = c.i === 0 ? "" : deck.slides[c.i - 1].notes;
      side.innerHTML = notes
        ? `<div class="deck-notes"><div class="eyebrow">Notes de l'orateur</div><p>${mt(notes)}</p></div>`
        : c.i === 0
          ? `<div class="deck-notes muted small">Diapositive de titre. Choisissez les couleurs ci-dessus, ou ✎ Modifier pour changer le titre.</div>`
          : "";
    }
    $('[data-a="edit"]', body).textContent = c.editing ? "Fermer l'édition" : "✎ Modifier";
    presenterDraw();
  }

  // ---------------------------------------------------------------- édition
  const ICON_LIST = () => `<datalist id="iconNames">${Object.keys(ICONS).map((n) => `<option value="${n}">`).join("")}</datalist>`;
  function editorHTML() {
    const { deck, i } = current;
    if (i === 0)
      return `<form class="deck-edit" data-form="title">${ICON_LIST()}
        <label class="field"><span>Titre</span><input name="title" value="${esc(deck.title)}" /></label>
        <label class="field"><span>Sous-titre</span><input name="subtitle" value="${esc(deck.subtitle)}" /></label>
        <div class="field two"><label><span>Pied de page</span><input name="context" value="${esc(deck.context)}" /></label>
        <label class="icon-field"><span>Icône</span><input name="icon" list="iconNames" value="${esc(deck.icon)}" /></label></div>
        <div class="row"><button class="btn primary" type="submit">Enregistrer</button><button class="btn" type="button" data-a="add">+ Diapositive après</button></div>
      </form>`;
    const s = deck.slides[i - 1];
    const items = s.items.map((x) => [x.icon, x.label, x.title, x.text, x.highlight ? "!" : ""].join(" | ").replace(/( \| )+$/, "")).join("\n");
    const cols = s.columns.map((c) => [`${c.icon} | ${c.title}`, ...c.points.map((p) => "- " + p)].join("\n")).join("\n\n");
    const figs = s.figures.map((f) => `${f.value} | ${f.label}`).join("\n");
    const tbl = [s.table.headers, ...s.table.rows].filter((r) => r.length).map((r) => r.join(" | ")).join("\n");
    return `<form class="deck-edit" data-form="slide">${ICON_LIST()}
      <div class="field two"><label><span>Titre</span><input name="title" value="${esc(s.title)}" /></label>
      <label class="icon-field"><span>Icône</span><input name="icon" list="iconNames" value="${esc(s.icon)}" /></label></div>
      <label class="field"><span>Mise en page</span><select name="layout">${Object.entries(LAYOUTS).map(([key, v]) => `<option value="${key}" ${key === s.layout ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      <div class="field two"><label><span>Petit titre (problématique, panneau, partie…)</span><input name="kicker" value="${esc(s.kicker)}" /></label></div>
      <label class="field"><span>Phrase clé (problématique, légende, conclusion)</span><textarea name="lead" rows="2">${esc(s.lead)}</textarea></label>
      <label class="field"><span>Éléments — un par ligne : icône | étiquette | titre | texte | ! (mis en avant)</span><textarea name="items" rows="4">${esc(items)}</textarea></label>
      <label class="field"><span>Colonnes — « icône | titre » puis des lignes « - point », colonnes séparées par une ligne vide</span><textarea name="columns" rows="4">${esc(cols)}</textarea></label>
      <label class="field"><span>Chiffres du panneau — valeur | légende</span><textarea name="figures" rows="2">${esc(figs)}</textarea></label>
      <label class="field"><span>Tableau — 1re ligne = en-têtes, cellules séparées par |</span><textarea name="table" rows="3">${esc(tbl)}</textarea></label>
      <div class="field two"><label><span>Encadré : titre</span><input name="alertTitle" value="${esc(s.alert.title)}" /></label><label><span>Encadré : texte</span><input name="alertText" value="${esc(s.alert.text)}" /></label></div>
      <label class="field"><span>Formule (LaTeX)</span><input name="formula" value="${esc(s.formula)}" /></label>
      <label class="field"><span>Notes de l'orateur</span><textarea name="notes" rows="3">${esc(s.notes)}</textarea></label>
      <p class="muted small">Icônes : noms proposés dans la liste (ex. scale, shield-check, calendar). Formules : entre $…$.</p>
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
    const d = current.deck;
    if (f.dataset.form === "title") {
      d.title = v("title").trim() || "Présentation";
      d.subtitle = v("subtitle").trim();
      d.context = v("context").trim();
      d.icon = v("icon").trim() || d.icon;
      return;
    }
    const s = d.slides[current.i - 1];
    s.title = v("title").trim();
    s.icon = v("icon").trim();
    s.layout = v("layout");
    s.kicker = v("kicker").trim();
    s.lead = v("lead").trim();
    s.items = v("items").split("\n").map((l) => l.split("|").map((x) => x.trim())).filter((p) => p.some(Boolean)).map((p) => {
      const hl = p[p.length - 1] === "!";
      if (hl) p.pop();
      while (p.length < 4) p.splice(p.length - 1, 0, "");
      return { icon: p[0], label: p[1], title: p[2], text: p.slice(3).join(" | "), highlight: hl };
    });
    s.columns = v("columns").split(/\n\s*\n/).map((b) => b.split("\n").map((x) => x.trim()).filter(Boolean)).filter((b) => b.length).map((b) => {
      const [h, ...pts] = b;
      const [icon, ...t] = h.includes("|") ? h.split("|").map((x) => x.trim()) : ["", h];
      return { icon, title: t.join(" | "), points: pts.map((x) => x.replace(/^[-•]\s*/, "")) };
    });
    s.figures = v("figures").split("\n").map((l) => l.split("|").map((x) => x.trim())).filter((p) => p[0]).map((p) => ({ value: p[0], label: p.slice(1).join(" | ") }));
    const rows = v("table").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => l.split("|").map((x) => x.trim()));
    s.table = { headers: rows[0] || [], rows: rows.slice(1) };
    s.alert = { title: v("alertTitle").trim(), text: v("alertText").trim() };
    s.formula = v("formula").trim();
    s.notes = v("notes").trim();
  }

  async function save() {
    try {
      const note = await current.ctx.save(current.deck);
      if (note) current.note.content = note.content;
    } catch (e) {
      current.ctx.toast("Enregistrement impossible : " + e.message, "error");
    }
  }
  const go = (delta) => ((current.i += delta), draw(true));

  function onClick(e) {
    const c = current;
    if (!c) return;
    const sw = e.target.closest("[data-pal]");
    if (sw) return ((c.deck.palette = sw.dataset.pal), draw(true), save());
    const g = e.target.closest("[data-go]");
    if (g) return ((c.i = Number(g.dataset.go)), draw(true));
    const btn = e.target.closest("[data-a]");
    if (!btn || ["stage", "list", "palName"].includes(btn.dataset.a)) {
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
        c.deck.slides.splice(c.i, 0, normalize({ slides: [{ layout: "puces", title: "Nouvelle diapositive", icon: "lightbulb" }] }).slides[0]);
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
    presenter.innerHTML = `<div class="pr-stage"></div><div class="pr-progress"><div></div></div>
      <div class="pr-bar"><button data-p="prev" aria-label="Précédente">‹</button><span data-p="pos"></span><button data-p="next" aria-label="Suivante">›</button>
      <button data-p="notes">Notes</button><button data-p="close" aria-label="Quitter">✕</button></div><div class="pr-notes hidden"></div>`;
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
  document.addEventListener("fullscreenchange", () => !document.fullscreenElement && presenter && closePresenter());
  addEventListener("keydown", (e) => {
    if (!presenter || !current) return;
    if (["ArrowRight", "PageDown", " ", "Enter"].includes(e.key)) (go(1), e.preventDefault());
    else if (["ArrowLeft", "PageUp", "Backspace"].includes(e.key)) (go(-1), e.preventDefault());
    else if (e.key === "Escape") closePresenter();
  });

  // ---------------------------------------------------------------- répétition
  function slideText(sl) {
    return [
      sl.title, sl.kicker, sl.lead,
      ...sl.items.map((x) => [x.label, x.title, x.text].filter(Boolean).join(" : ")),
      ...sl.columns.map((c) => [c.title, ...c.points].join(". ")),
      ...sl.figures.map((f) => `${f.value} : ${f.label}`),
    ].filter(Boolean).join(". ");
  }
  function rehearse() {
    const { deck } = current;
    const items = [];
    for (const s of window.NarratorUtil.sentences(`${deck.title}. ${deck.subtitle}`)) items.push({ text: s.text, slide: 0 });
    deck.slides.forEach((sl, k) => {
      for (const s of window.NarratorUtil.sentences(sl.notes || slideText(sl))) items.push({ text: s.text, slide: k + 1 });
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
  const hx = (c) => c.replace("#", "").toUpperCase();

  /** Icône au trait → image PNG (couleur donnée), pour PowerPoint. */
  const pngCache = new Map();
  function iconPNG(name, color) {
    const key = name + color;
    if (!pngCache.has(key))
      pngCache.set(
        key,
        new Promise((resolve) => {
          const svg = iconSVG(name).replace(/stroke="currentColor"/, `stroke="${color}"`).replace(/width="24" height="24"/, 'width="96" height="96"');
          const img = new Image();
          img.onload = () => {
            const cv = document.createElement("canvas");
            cv.width = cv.height = 96;
            cv.getContext("2d").drawImage(img, 0, 0, 96, 96);
            resolve(cv.toDataURL("image/png").replace(/^data:/, ""));
          };
          img.onerror = () => resolve(null);
          img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
        }),
      );
    return pngCache.get(key);
  }

  async function exportPptx(btn) {
    const { deck } = current;
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Création…";
    try {
      await iconsReady;
      const Pptx = await loadPptx();
      const P = pal(deck);
      const D = hx(P.d), D2 = hx(P.d2), AC = hx(P.ac), LT = hx(P.light), INK = hx(P.ink), R = hx(RED), MU = "5B6B6A", WHITE = "FFFFFF";
      const SERIF = "Georgia", SANS = "Calibri";
      // icônes nécessaires, préparées d'avance
      const names = new Set(["circle-help", "triangle-alert", "circle-check", "info", "lightbulb", "user", "chart-column", deck.icon]);
      deck.slides.forEach((s) => [s.icon, ...s.items.map((x) => x.icon), ...s.columns.map((c) => c.icon)].forEach((n) => n && names.add(n)));
      const PNG = {};
      await Promise.all([...names].filter((n) => ICONS[n]).map(async (n) => (PNG[n] = await iconPNG(n, "#FFFFFF"))));

      const pptx = new Pptx();
      pptx.layout = "LAYOUT_WIDE";
      pptx.title = plain(deck.title);
      const W = 13.333, H = 7.5, M = 0.6;
      // Réduction automatique seulement pour les textes longs (sinon le texte reste à sa taille).
      const T = (s, text, o) => {
        const t = plain(text);
        const opt = { fontFace: SANS, color: INK, margin: 0, valign: "top", ...o };
        if (opt.fit === "shrink" && t.length < (opt.longAt || 110)) delete opt.fit;
        delete opt.longAt;
        return s.addText(t, opt);
      };
      const icon = (s, name, x, y, d = 0.5, fill = AC) => {
        s.addShape(pptx.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color: fill }, line: { color: fill, width: 0 } });
        const png = PNG[name] || PNG.info;
        if (png) s.addImage({ data: png, x: x + d * 0.24, y: y + d * 0.24, w: d * 0.52, h: d * 0.52 });
      };
      const numBadge = (s, text, x, y, d = 0.5) => {
        s.addShape(pptx.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color: AC }, line: { color: AC, width: 0 } });
        T(s, text, { x, y, w: d, h: d, fontSize: 14, bold: true, color: WHITE, align: "center", valign: "middle", fontFace: SERIF });
      };
      const card = (s, x, y, w, h, fill = LT) => s.addShape(pptx.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.06, fill: { color: fill }, line: { color: fill, width: 0 } });
      const title = (s, t) => T(s, t, { x: M, y: 0.32, w: W - 2 * M, h: 0.75, fontSize: 26, color: D, fontFace: SERIF, align: "center", valign: "middle", fit: "shrink" });
      const footer = (s, k, dark) => {
        T(s, deck.context || deck.title, { x: M, y: H - 0.42, w: 8, h: 0.25, fontSize: 8, color: dark ? "C9D6D4" : MU });
        T(s, String(k + 1), { x: W - M - 1, y: H - 0.42, w: 1, h: 0.25, fontSize: 8, color: dark ? "C9D6D4" : MU, align: "right" });
      };
      const leadText = (s, t, y) => t && T(s, t, { x: M, y, w: W - 2 * M, h: 0.4, fontSize: 13, italic: true, color: D2 });
      const alertBox = (s, al, x, y, w, h = 0.75) => {
        if (!al.title && !al.text) return;
        s.addShape(pptx.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.06, fill: { color: D }, line: { color: D, width: 0 } });
        icon(s, "triangle-alert", x + 0.2, y + (h - 0.5) / 2, 0.5, R);
        s.addText([{ text: plain(al.title), options: { bold: true, color: AC, breakLine: true } }, { text: plain(al.text), options: { color: WHITE } }], { x: x + 0.85, y: y + 0.08, w: w - 1.05, h: h - 0.16, fontSize: 13, fontFace: SANS, valign: "middle", margin: 0 });
      };
      const bulletList = (s, pts, o) => s.addText(pts.map((p) => ({ text: plain(p), options: { bullet: { indent: 14 }, breakLine: true } })), { fontFace: SANS, color: INK, fontSize: 14, valign: "top", paraSpaceAfter: 8, margin: 0, ...(pts.join("").length > 260 ? { fit: "shrink" } : {}), ...o });

      // ---- titre
      const s0 = pptx.addSlide();
      s0.background = { color: D };
      icon(s0, deck.icon, M, 0.55, 0.85, AC);
      T(s0, deck.title, { x: M, y: 2.5, w: W - 2 * M, h: 1.3, fontSize: 40, color: WHITE, fontFace: SERIF, valign: "middle", fit: "shrink" });
      if (deck.subtitle) T(s0, deck.subtitle, { x: M, y: 3.85, w: W - 2 * M, h: 0.6, fontSize: 18, color: AC });
      if (deck.context) T(s0, deck.context, { x: M, y: H - 1.0, w: 8, h: 0.35, fontSize: 11, color: "DCE6E5" });

      deck.slides.forEach((sl, idx) => {
        const k = idx + 1;
        const s = pptx.addSlide();
        const items = sl.items.filter((x) => (x.title || x.text || x.label).trim());
        const L = sl.layout;
        const dark = L === "section" || L === "conclusion";
        s.background = { color: dark ? D : WHITE };

        if (L === "section") {
          T(s, sl.kicker, { x: M, y: 2.3, w: 8, h: 0.4, fontSize: 14, bold: true, color: AC, charSpacing: 2 });
          T(s, sl.title, { x: M, y: 2.8, w: W - 2 * M, h: 1.3, fontSize: 38, color: WHITE, fontFace: SERIF, valign: "middle", fit: "shrink" });
          if (sl.lead) T(s, sl.lead, { x: M, y: 4.2, w: W - 2 * M, h: 0.6, fontSize: 16, italic: true, color: AC });
        } else if (L === "conclusion") {
          T(s, (sl.kicker || "Conclusion").toUpperCase(), { x: M, y: 0.6, w: 6, h: 0.3, fontSize: 11, bold: true, color: AC, charSpacing: 2 });
          T(s, sl.title, { x: M, y: 0.95, w: W - 2 * M, h: 0.8, fontSize: 30, color: WHITE, fontFace: SERIF, fit: "shrink" });
          const cols = sl.columns.slice(0, 3), gap = 0.3, w = (W - 2 * M - gap * (cols.length - 1)) / Math.max(cols.length, 1);
          cols.forEach((c, j) => {
            const x = M + j * (w + gap);
            card(s, x, 2.2, w, 3.0, D2);
            icon(s, c.icon || "circle-check", x + 0.3, 2.45, 0.55);
            T(s, c.title, { x: x + 1.0, y: 2.45, w: w - 1.2, h: 0.55, fontSize: 17, bold: true, color: WHITE, valign: "middle" });
            bulletList(s, c.points, { x: x + 0.35, y: 3.2, w: w - 0.6, h: 1.85, color: WHITE, fontSize: 15 });
          });
          if (sl.lead) T(s, sl.lead, { x: M, y: 5.55, w: W - 2 * M, h: 0.8, fontSize: 15, italic: true, color: AC });
        } else {
          title(s, sl.title);
          const top = 1.35, bottom = H - 0.75;
          if (L === "plan") {
            s.addShape(pptx.ShapeType.roundRect, { x: M, y: top, w: W - 2 * M, h: 1.15, rectRadius: 0.06, fill: { color: D }, line: { color: D, width: 0 } });
            icon(s, "circle-help", M + 0.3, top + 0.3, 0.55);
            s.addText([{ text: plain(sl.kicker || "Problématique"), options: { bold: true, color: AC, breakLine: true, fontSize: 12 } }, { text: plain(sl.lead), options: { italic: true, color: WHITE, fontSize: 14 } }], { x: M + 1.1, y: top + 0.12, w: W - 2 * M - 1.4, h: 0.92, fontFace: SANS, valign: "middle", margin: 0, fit: "shrink" });
            if (items.length) T(s, `Notre démarche en ${items.length} parties`, { x: M, y: top + 1.35, w: 6, h: 0.3, fontSize: 12, bold: true, color: D2 });
            const n = Math.max(items.length, 1), gap = 0.25, w = (W - 2 * M - gap * (n - 1)) / n, y = top + 1.8, h = Math.min(bottom - y - 0.1, 2.7);
            items.forEach((x, j) => {
              const cx = M + j * (w + gap);
              card(s, cx, y, w, h);
              numBadge(s, x.label || ROMAN[j], cx + 0.25, y + 0.3, 0.55);
              T(s, x.title, { x: cx + 0.25, y: y + 1.0, w: w - 0.5, h: 0.7, fontSize: 16, bold: true, color: D });
              T(s, x.text, { x: cx + 0.25, y: y + 1.7, w: w - 0.5, h: h - 1.85, fontSize: 14, color: INK, fit: "shrink" });
            });
          } else if (L === "cartes" || L === "chiffres") {
            const n = items.length, cols = L === "cartes" && n === 4 ? 2 : Math.min(n, L === "chiffres" ? 4 : 3) || 1, rows = Math.ceil(n / cols), gap = 0.25;
            const w = (W - 2 * M - gap * (cols - 1)) / cols, avail = bottom - top - (sl.lead ? 0.5 : 0), h = (avail - gap * (rows - 1)) / rows;
            items.forEach((x, j) => {
              const cx = M + (j % cols) * (w + gap), cy = top + Math.floor(j / cols) * (h + gap);
              card(s, cx, cy, w, h);
              icon(s, x.icon || "lightbulb", cx + 0.25, cy + 0.25, 0.5);
              T(s, x.title, { x: cx + 0.9, y: cy + 0.25, w: w - 1.1, h: 0.5, fontSize: 16, bold: true, color: D, valign: "middle", fit: "shrink", longAt: 40 });
              T(s, x.text, { x: cx + 0.25, y: cy + 0.9, w: w - 0.5, h: h - (L === "chiffres" ? 1.9 : 1.05), fontSize: 14, color: INK, fit: "shrink" });
              if (L === "chiffres") T(s, x.label, { x: cx + 0.25, y: cy + h - 0.95, w: w - 0.5, h: 0.75, fontSize: 32, color: AC, fontFace: SERIF, valign: "bottom" });
            });
            leadText(s, sl.lead, bottom - 0.4);
          } else if (L === "liste_chiffres") {
            const lw = 7.2, n = Math.max(items.length, 1), rh = (bottom - top) / n;
            items.forEach((x, j) => {
              const y = top + j * rh;
              icon(s, x.icon || "info", M, y + 0.05, 0.48);
              s.addText([{ text: plain(x.title), options: { bold: true, color: D, breakLine: true } }, { text: plain(x.text), options: { color: INK } }], { x: M + 0.65, y, w: lw - 0.7, h: rh - 0.1, fontSize: 14, fontFace: SANS, valign: "top", margin: 0 });
            });
            const px = M + lw + 0.3, pw = W - M - px;
            s.addShape(pptx.ShapeType.roundRect, { x: px, y: top, w: pw, h: bottom - top, rectRadius: 0.05, fill: { color: D }, line: { color: D, width: 0 } });
            T(s, (sl.kicker || "").toUpperCase(), { x: px + 0.3, y: top + 0.25, w: pw - 0.6, h: 0.5, fontSize: 12, bold: true, color: AC });
            const fh = (bottom - top - 1.3) / Math.max(sl.figures.length, 1);
            sl.figures.forEach((f, j) => {
              const y = top + 0.85 + j * fh;
              T(s, f.value, { x: px + 0.3, y, w: pw - 0.6, h: 0.6, fontSize: 30, color: WHITE, fontFace: SERIF });
              T(s, f.label, { x: px + 0.3, y: y + 0.6, w: pw - 0.6, h: 0.35, fontSize: 12, color: AC });
            });
            if (sl.lead) T(s, sl.lead, { x: px + 0.3, y: bottom - 0.55, w: pw - 0.6, h: 0.45, fontSize: 9, italic: true, color: "DCE6E5", fit: "shrink" });
          } else if (L === "frise") {
            const n = Math.max(items.length, 1), seg = (W - 2 * M) / n, yl = top + 1.05;
            s.addShape(pptx.ShapeType.line, { x: M + seg / 2, y: yl, w: seg * (n - 1), h: 0, line: { color: D, width: 2 } });
            items.forEach((x, j) => {
              const cx = M + j * seg + seg / 2, col = x.highlight ? AC : D;
              T(s, x.label || x.title, { x: cx - seg / 2 + 0.05, y: top + 0.3, w: seg - 0.1, h: 0.45, fontSize: 17, bold: true, color: col, fontFace: SERIF, align: "center", valign: "middle", fit: "shrink" });
              s.addShape(pptx.ShapeType.ellipse, { x: cx - 0.13, y: yl - 0.13, w: 0.26, h: 0.26, fill: { color: col }, line: { color: WHITE, width: 2 } });
              card(s, cx - seg / 2 + 0.07, yl + 0.4, seg - 0.14, 2.1);
              T(s, `${x.title && x.label ? x.title + " — " : ""}${x.text}`, { x: cx - seg / 2 + 0.2, y: yl + 0.52, w: seg - 0.4, h: 1.85, fontSize: 13, color: INK, fit: "shrink" });
            });
            leadText(s, sl.lead, yl + 2.75);
          } else if (L === "etapes") {
            const n = Math.max(items.length, 1), ag = 0.35, w = (W - 2 * M - ag * (n - 1)) / n, h = sl.columns.length ? 2.3 : 3.6;
            items.forEach((x, j) => {
              const cx = M + j * (w + ag), fill = x.highlight ? R : j % 2 ? D2 : D;
              card(s, cx, top, w, h, fill);
              T(s, (x.label || `Étape ${j + 1}`).toUpperCase(), { x: cx + 0.2, y: top + 0.2, w: w - 0.4, h: 0.3, fontSize: 10, bold: true, color: AC });
              T(s, x.title, { x: cx + 0.2, y: top + 0.5, w: w - 0.4, h: 0.6, fontSize: 16, bold: true, color: WHITE, fit: "shrink", longAt: 40 });
              T(s, x.text, { x: cx + 0.2, y: top + 1.15, w: w - 0.4, h: h - 1.3, fontSize: 13, color: "E6EFEE", fit: "shrink" });
              if (j) s.addShape(pptx.ShapeType.rightArrow, { x: cx - ag + 0.06, y: top + h / 2 - 0.13, w: ag - 0.12, h: 0.26, fill: { color: AC }, line: { color: AC, width: 0 } });
            });
            const cols = sl.columns.slice(0, 3);
            if (cols.length) {
              const gap = 0.25, cw = (W - 2 * M - gap * (cols.length - 1)) / cols.length, y = top + h + 0.3, ch = bottom - y - (sl.lead ? 0.45 : 0);
              cols.forEach((c, j) => {
                const cx = M + j * (cw + gap);
                card(s, cx, y, cw, ch);
                icon(s, c.icon || "info", cx + 0.25, y + 0.2, 0.45);
                T(s, c.title, { x: cx + 0.85, y: y + 0.2, w: cw - 1.05, h: 0.45, fontSize: 15, bold: true, color: D, valign: "middle" });
                T(s, c.points.join(" ; "), { x: cx + 0.25, y: y + 0.75, w: cw - 0.5, h: ch - 0.85, fontSize: 13, color: INK, fit: "shrink" });
              });
            }
            leadText(s, sl.lead, bottom - 0.4);
          } else if (L === "deux_colonnes") {
            const hasAlert = sl.alert.title || sl.alert.text, gap = 0.3, w = (W - 2 * M - gap) / 2, h = bottom - top - (hasAlert ? 1.05 : 0);
            sl.columns.slice(0, 2).forEach((c, j) => {
              const cx = M + j * (w + gap);
              card(s, cx, top, w, h);
              icon(s, c.icon || "user", cx + 0.3, top + 0.3, 0.55);
              T(s, c.title, { x: cx + 1.0, y: top + 0.3, w: w - 1.2, h: 0.55, fontSize: 17, bold: true, color: D, valign: "middle" });
              bulletList(s, c.points, { x: cx + 0.35, y: top + 1.05, w: w - 0.6, h: h - 1.2 });
            });
            if (hasAlert) alertBox(s, sl.alert, M, bottom - 0.85, W - 2 * M, 0.85);
          } else if (L === "tableau") {
            const t = sl.table, side = items.length > 0, tw = side ? 7.4 : W - 2 * M;
            let y = top;
            if (sl.kicker) (T(s, sl.kicker, { x: M, y, w: tw, h: 0.35, fontSize: 11, italic: true, color: D2 }), (y += 0.45));
            const rows = [
              t.headers.map((h, j) => ({ text: plain(h), options: { bold: true, color: WHITE, fill: { color: j === t.headers.length - 1 && t.headers.length > 2 ? AC : D } } })),
              ...t.rows.map((r, ri) => {
                const tot = ri === t.rows.length - 1 && /total|ttc|résultat|somme/i.test(r[0] || "");
                return r.map((c, j) => ({
                  text: plain(c),
                  options: {
                    fill: { color: tot ? AC : ri % 2 ? WHITE : LT },
                    color: tot ? WHITE : j === 0 ? D : INK,
                    bold: tot || j === 0,
                    align: j && /^[\d\s.,%+−-]+(fcfa|€|\$|%)?$/i.test(c.trim()) ? "right" : "left",
                  },
                }));
              }),
            ].filter((r) => r.length);
            if (rows.length) s.addTable(rows, { x: M, y, w: tw, fontSize: t.rows.length > 7 ? 11 : 12, fontFace: SANS, color: INK, border: { type: "solid", pt: 0.5, color: "D7E0DF" }, rowH: t.rows.length > 7 ? 0.38 : 0.45, valign: "middle", margin: 0.07, autoPage: false });
            if (side) {
              const vx = M + tw + 0.4, vw = W - M - vx, hasRes = sl.alert.title || sl.alert.text, step = (bottom - top - (hasRes ? 1.0 : 0)) / Math.max(items.length, 1);
              s.addShape(pptx.ShapeType.line, { x: vx + 0.1, y: top + 0.15, w: 0, h: step * (items.length - 1), line: { color: D, width: 1.5 } });
              items.forEach((x, j) => {
                const yy = top + j * step, col = x.highlight ? R : D;
                s.addShape(pptx.ShapeType.ellipse, { x: vx, y: yy + 0.05, w: 0.2, h: 0.2, fill: { color: col }, line: { color: WHITE, width: 1.5 } });
                s.addText([{ text: plain(x.label) + "  ", options: { bold: true, color: col } }, { text: plain(x.text), options: { color: INK } }], { x: vx + 0.35, y: yy, w: vw - 0.35, h: step - 0.05, fontSize: 12, fontFace: SANS, valign: "top", margin: 0 });
              });
              if (hasRes) {
                s.addShape(pptx.ShapeType.roundRect, { x: vx, y: bottom - 0.9, w: vw, h: 0.85, rectRadius: 0.05, fill: { color: R }, line: { color: R, width: 0 } });
                s.addText([{ text: plain(sl.alert.title) + "  ", options: { bold: true, fontSize: 20, fontFace: SERIF } }, { text: plain(sl.alert.text), options: { fontSize: 10 } }], { x: vx + 0.2, y: bottom - 0.85, w: vw - 0.4, h: 0.75, color: WHITE, valign: "middle", margin: 0, fit: "shrink" });
              }
            }
            leadText(s, sl.lead, bottom - 0.4);
          } else if (L === "formule") {
            card(s, M + 1, top, W - 2 * M - 2, 1.6);
            T(s, window.MathText.toUnicode(sl.formula), { x: M + 1.2, y: top + 0.1, w: W - 2 * M - 2.4, h: 1.4, fontSize: 30, color: D, fontFace: "Cambria Math", align: "center", valign: "middle", fit: "shrink" });
            items.forEach((x, j) => {
              const y = top + 1.95 + j * 0.85;
              icon(s, x.icon || "info", M + 1, y, 0.45);
              s.addText([...(x.title ? [{ text: plain(x.title) + " ", options: { bold: true, color: D } }] : []), { text: plain(x.text), options: { color: INK } }], { x: M + 1.6, y, w: W - 2 * M - 2.6, h: 0.75, fontSize: 15, fontFace: SANS, valign: "middle", margin: 0 });
            });
            leadText(s, sl.lead, bottom - 0.4);
          } else if (L === "citation") {
            T(s, "“", { x: M + 0.5, y: top, w: 1.2, h: 1.2, fontSize: 90, color: AC, fontFace: SERIF });
            T(s, sl.lead, { x: M + 1.5, y: top + 0.6, w: W - 2 * M - 3, h: 2.8, fontSize: 24, italic: true, color: D, fontFace: SERIF, valign: "middle", fit: "shrink" });
            if (sl.kicker) T(s, "— " + sl.kicker, { x: M + 1.5, y: top + 3.6, w: W - 2 * M - 3, h: 0.4, fontSize: 13, color: AC });
          } else {
            const n = Math.max(items.length, 1), rh = Math.min((bottom - top - (sl.lead ? 0.5 : 0)) / n, 1.0);
            items.forEach((x, j) => {
              const y = top + 0.1 + j * rh;
              if (x.icon) icon(s, x.icon, M + 0.5, y, 0.45);
              else s.addShape(pptx.ShapeType.ellipse, { x: M + 0.65, y: y + 0.15, w: 0.14, h: 0.14, fill: { color: AC }, line: { color: AC, width: 0 } });
              s.addText([...(x.title ? [{ text: plain(x.title) + " ", options: { bold: true, color: D } }] : []), { text: plain(x.text), options: { color: INK } }], { x: M + 1.15, y, w: W - 2 * M - 1.6, h: rh - 0.1, fontSize: 17, fontFace: SANS, valign: "top", margin: 0 });
            });
            leadText(s, sl.lead, bottom - 0.4);
          }
        }
        footer(s, k, dark);
        if (sl.notes) s.addNotes(plain(sl.notes));
      });

      const blob = await pptx.write({ outputType: "blob" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = fileName(deck.title) + ".pptx";
      document.body.append(link);
      link.click();
      setTimeout(() => (URL.revokeObjectURL(link.href), link.remove()), 1000);
      current.ctx.toast("PowerPoint téléchargé ✓", "ok");
    } catch (e) {
      console.error(e);
      current.ctx.toast("Export PowerPoint impossible : " + e.message, "error");
    }
    btn.disabled = false;
    btn.textContent = label;
  }

  // ---------------------------------------------------------------- export PDF
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

  window.Slides = { render, onNarratorItem, slideHTML, normalize, PALETTES, ready: () => iconsReady };
})();
