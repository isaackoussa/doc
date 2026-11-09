/* Lumen — interface : sources, lecteur, discussion, studio, notes. */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const store = {
    get: (k, d) => {
      try {
        const v = localStorage.getItem("lumen." + k);
        return v == null ? d : JSON.parse(v);
      } catch {
        return d;
      }
    },
    set: (k, v) => {
      try {
        localStorage.setItem("lumen." + k, JSON.stringify(v));
      } catch {}
    },
  };
  const { sentences, detectLang, rankVoices } = window.NarratorUtil;
  const narrator = new window.Narrator();

  const state = {
    config: { ai: false, tts: [], voices: {}, studio: {} },
    docs: [],
    selected: new Set(),
    doc: null, // document ouvert dans le lecteur
    chat: [],
    cloud: { positions: {}, overview: {}, lastDoc: null }, // historique synchronisé avec le compte
    user: null,
    notes: [],
    playing: null, // { kind: "doc"|"note"|"podcast"|"chat", id }
    busyStudio: new Set(),
  };

  // ------------------------------------------------------------------ utils
  const Identity = window.NetlifyIdentity;
  /** fetch avec la session : si le jeton a expiré, on le rafraîchit une fois. */
  async function authFetch(path, init = {}) {
    let r = await fetch(path, init);
    if (r.status === 401 && Identity && !state.config.devUser) {
      try {
        if (await Identity.refreshSession()) r = await fetch(path, init);
      } catch {}
      if (r.status === 401) showAuth("login", "Votre session a expiré, reconnectez-vous.");
    }
    return r;
  }
  async function api(path, opts = {}) {
    const r = await authFetch(path, {
      ...opts,
      headers: opts.body ? { "Content-Type": "application/json" } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `Erreur ${r.status}`);
    return data;
  }
  window.lumenFetch = authFetch; // utilisé par narrator.js pour les voix premium

  // Sauvegarde de l'historique dans le compte (regroupée toutes les 2 s).
  let persistTimer = null;
  function snapshot() {
    return { chat: state.chat, selected: [...state.selected], ...state.cloud };
  }
  function persist() {
    if (!state.user) return;
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      persistTimer = null;
      api("/api/state", { method: "PUT", body: snapshot() }).catch((e) => console.warn("Sauvegarde impossible", e));
    }, 2000);
  }
  addEventListener("pagehide", () => {
    if (!persistTimer || !state.user) return;
    clearTimeout(persistTimer);
    fetch("/api/state", { method: "PUT", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify(snapshot()) });
  });

  /** Lance une tâche longue (studio, lecture d'image) et attend son résultat. */
  async function runJob(payload, { timeoutMin = 16 } = {}) {
    const { id } = await api("/api/jobs", { method: "POST", body: payload });
    const kick = await authFetch("/api/jobs-run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (!kick.ok && kick.status !== 202) throw new Error(`Impossible de lancer la tâche (${kick.status})`);
    const deadline = Date.now() + timeoutMin * 60_000;
    let wait = 1500;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, wait));
      wait = Math.min(wait * 1.3, 5000);
      const job = await api(`/api/jobs/${id}`);
      if (job.status === "done") return job.result;
      if (job.status === "error") throw new Error(job.error || "La tâche a échoué");
    }
    throw new Error("La tâche prend trop de temps. Réessayez plus tard.");
  }
  async function ocr(mediaType, data) {
    if (!state.config.ai) throw new Error("La lecture des photos et PDF scannés demande l'IA (ANTHROPIC_API_KEY).");
    return (await runJob({ type: "ocr", mediaType, data })).text;
  }
  function toast(msg, kind = "") {
    const t = document.createElement("div");
    t.className = "toast " + kind;
    t.textContent = msg;
    $("#toasts").append(t);
    setTimeout(() => t.classList.add("out"), 4200);
    setTimeout(() => t.remove(), 4700);
  }
  function md(text) {
    return DOMPurify.sanitize(marked.parse(text || "", { breaks: false, gfm: true }));
  }
  /** Texte lisible à voix haute à partir d'un Markdown. */
  function speechItemsFromHtml(html, role) {
    const div = document.createElement("div");
    div.innerHTML = html;
    div.querySelectorAll(".cite").forEach((c) => c.remove());
    const blocks = $$("h1,h2,h3,h4,p,li,blockquote,td", div).filter((el) => !el.querySelector("p,li"));
    const texts = (blocks.length ? blocks : [div]).map((b) => b.textContent.trim()).filter(Boolean);
    const items = [];
    for (const t of texts) for (const s of sentences(t)) items.push({ text: s.text, role });
    return items;
  }
  const fmtMinutes = (chars) => {
    const m = Math.max(1, Math.round(chars / 900));
    return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` : `${m} min`;
  };
  const selKey = () => [...state.selected].sort().join(",");
  const selectedDocs = () => state.docs.filter((d) => state.selected.has(d.id));

  // -------------------------------------------------------------- vues mobile
  function setView(v) {
    $(".app").dataset.view = v;
    $$(".mobile-nav button").forEach((b) => b.classList.toggle("active", b.dataset.view === v));
  }
  $$(".mobile-nav button").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));

  // ----------------------------------------------------------------- sources
  async function loadDocs() {
    state.docs = await api("/api/docs");
    for (const id of [...state.selected]) if (!state.docs.some((d) => d.id === id)) state.selected.delete(id);
    renderSources();
  }
  function renderSources() {
    const ul = $("#sourceList");
    ul.innerHTML = "";
    $("#emptySources").classList.toggle("hidden", state.docs.length > 0);
    for (const d of state.docs) {
      const li = document.createElement("li");
      li.className = "source" + (state.doc?.id === d.id ? " open" : "");
      li.innerHTML = `
        <input type="checkbox" ${state.selected.has(d.id) ? "checked" : ""} aria-label="Utiliser pour l'IA" title="Utiliser cette source pour la discussion et le studio" />
        <button class="source-main">
          <span class="source-icon">${esc(kindIcon(d.kind))}</span>
          <span class="source-text"><b>${esc(d.title)}</b><small>${esc(d.kind)} · ${fmtMinutes(d.chars)} d'écoute</small></span>
        </button>
        <button class="icon-btn source-menu" aria-label="Options" title="Renommer / supprimer">⋯</button>`;
      $("input", li).addEventListener("change", (e) => {
        e.target.checked ? state.selected.add(d.id) : state.selected.delete(d.id);
        onSelectionChange();
      });
      $(".source-main", li).addEventListener("click", () => {
        openDoc(d.id);
        setView("read");
      });
      $(".source-menu", li).addEventListener("click", (e) => sourceMenu(e.currentTarget, d));
      ul.append(li);
    }
    const n = state.selected.size;
    $("#selCount").textContent = state.docs.length ? `${n}/${state.docs.length} pour l'IA` : "";
    $("#selectAll").checked = n > 0 && n === state.docs.length;
    $("#selectAll").indeterminate = n > 0 && n < state.docs.length;
    updateScopes();
  }
  const kindIcon = (k = "") => (k.startsWith("pdf") ? "PDF" : k === "word" ? "DOC" : k.startsWith("image") ? "IMG" : k === "html" ? "WEB" : "TXT");

  function sourceMenu(anchor, d) {
    closeMenus();
    const m = document.createElement("div");
    m.className = "menu";
    m.innerHTML = `<button data-a="rename">Renommer</button><button data-a="delete" class="danger">Supprimer</button>`;
    const r = anchor.getBoundingClientRect();
    m.style.top = `${r.bottom + 4}px`;
    m.style.left = `${Math.min(r.left, innerWidth - 180)}px`;
    document.body.append(m);
    m.addEventListener("click", async (e) => {
      const a = e.target.dataset.a;
      closeMenus();
      if (a === "rename") {
        const t = prompt("Nouveau titre :", d.title);
        if (t && t.trim()) {
          await api(`/api/docs/${d.id}`, { method: "PATCH", body: { title: t } });
          if (state.doc?.id === d.id) $("#docTitle").textContent = t.trim();
          loadDocs();
        }
      } else if (a === "delete" && confirm(`Supprimer « ${d.title} » ?`)) {
        await api(`/api/docs/${d.id}`, { method: "DELETE" });
        state.selected.delete(d.id);
        if (state.doc?.id === d.id) closeDoc();
        await loadDocs();
        onSelectionChange();
      }
    });
    setTimeout(() => document.addEventListener("click", closeMenus, { once: true }), 0);
  }
  function closeMenus() {
    $$(".menu").forEach((m) => m.remove());
  }

  $("#selectAll").addEventListener("change", (e) => {
    state.selected = new Set(e.target.checked ? state.docs.map((d) => d.id) : []);
    onSelectionChange();
  });
  function onSelectionChange() {
    persist();
    renderSources();
    renderChatIntro();
  }
  function updateScopes() {
    const docs = selectedDocs();
    const txt = docs.length
      ? `Basé sur ${docs.length} source${docs.length > 1 ? "s" : ""} : ${docs.map((d) => d.title).join(", ")}`
      : "Cochez au moins une source (à gauche) pour utiliser l'IA.";
    $("#chatScope").textContent = docs.length ? `${docs.length} source${docs.length > 1 ? "s" : ""}` : "Aucune source cochée";
    $("#studioScope").textContent = txt;
  }

  // --------------------------------------------------------------- import
  async function uploadFiles(files) {
    files = [...files];
    if (!files.length) return;
    const added = [];
    for (const f of files) {
      const pending = toastLoading(`Lecture de « ${f.name} »…`);
      try {
        if (f.size > 100 * 1024 * 1024) throw new Error("fichier trop lourd (max 100 Mo)");
        const ex = await window.Extract.extractFile(f, { ocr, progress: (m) => pending.setText(`${f.name} — ${m}`) });
        if (!ex.text.trim()) throw new Error("aucun texte trouvé");
        if (ex.text.length > 4_000_000) throw new Error("document trop long (plus de 4 millions de caractères)");
        added.push(await api("/api/docs", { method: "POST", body: ex }));
      } catch (e) {
        toast(`${f.name} : ${e.message}`, "error");
      }
      pending.remove();
    }
    if (!added.length) return;
    added.forEach((d) => state.selected.add(d.id));
    persist();
    await loadDocs();
    renderChatIntro();
    toast(`Ajouté : ${added.map((d) => d.title).join(", ")}`, "ok");
    openDoc(added[0].id);
    setView("read");
  }
  function toastLoading(msg) {
    const t = document.createElement("div");
    t.className = "toast loading";
    t.innerHTML = `<span class="spin"></span><span></span>`;
    t.setText = (m) => (t.lastChild.textContent = m);
    t.setText(msg);
    $("#toasts").append(t);
    return t;
  }
  ["#fileInput", "#fileInput2"].forEach((s) =>
    $(s).addEventListener("change", (e) => {
      uploadFiles(e.target.files);
      e.target.value = "";
    }),
  );
  // glisser-déposer partout
  let dragDepth = 0;
  addEventListener("dragenter", (e) => {
    if (!e.dataTransfer?.types?.includes("Files")) return;
    dragDepth++;
    $("#dropOverlay").classList.remove("hidden");
  });
  addEventListener("dragleave", () => {
    if (--dragDepth <= 0) $("#dropOverlay").classList.add("hidden"), (dragDepth = 0);
  });
  addEventListener("dragover", (e) => e.preventDefault());
  addEventListener("drop", (e) => {
    e.preventDefault();
    dragDepth = 0;
    $("#dropOverlay").classList.add("hidden");
    if (e.dataTransfer?.files?.length) uploadFiles(e.dataTransfer.files);
  });
  // coller une image / un fichier directement (Ctrl+V)
  addEventListener("paste", (e) => {
    if (e.target.closest("input, textarea")) return;
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) uploadFiles(files);
  });

  $("#pasteBtn").addEventListener("click", () => {
    $("#pasteTitle").value = "";
    $("#pasteText").value = "";
    $("#pasteDlg").showModal();
  });
  $("#pasteDlg").addEventListener("close", async () => {
    if ($("#pasteDlg").returnValue !== "ok") return;
    const text = $("#pasteText").value.trim();
    if (!text) return;
    try {
      const d = await api("/api/docs", { method: "POST", body: { title: $("#pasteTitle").value, kind: "texte collé", text: window.Extract.reflow(text) } });
      state.selected.add(d.id);
      persist();
      await loadDocs();
      renderChatIntro();
      openDoc(d.id);
      setView("read");
    } catch (e) {
      toast(e.message, "error");
    }
  });

  // ---------------------------------------------------------------- lecteur
  let fontSize = store.get("fontSize", 19);
  const applyFont = () => document.documentElement.style.setProperty("--doc-size", fontSize + "px");
  applyFont();
  $("#fontUp").addEventListener("click", () => (fontSize = Math.min(30, fontSize + 1), applyFont(), store.set("fontSize", fontSize)));
  $("#fontDown").addEventListener("click", () => (fontSize = Math.max(14, fontSize - 1), applyFont(), store.set("fontSize", fontSize)));

  function closeDoc() {
    if (state.playing?.kind === "doc") narrator.stop();
    state.doc = null;
    $("#readerDoc").classList.add("hidden");
    $("#readerEmpty").classList.remove("hidden");
    renderSources();
  }

  async function openDoc(id, { highlight } = {}) {
    state.cloud.lastDoc = id;
    persist();
    if (state.doc?.id !== id) {
      let doc;
      try {
        doc = await api(`/api/docs/${id}`);
      } catch (e) {
        return toast(e.message, "error");
      }
      buildReader(doc);
    }
    renderSources();
    if (highlight) highlightRange(highlight.start, highlight.end);
  }

  function buildReader(doc) {
    const lang = detectLang(doc.text);
    const body = $("#docBody");
    body.innerHTML = "";
    body.lang = lang;
    const sents = []; // {text, start, end, el}
    const re = /\S[\s\S]*?(?=\n\s*\n|$)/g;
    let m;
    const frag = document.createDocumentFragment();
    while ((m = re.exec(doc.text))) {
      const para = m[0];
      const pStart = m.index;
      const isHeading = para.length < 90 && !/[.!?,;:]$/.test(para.trim()) && !para.includes("\n") && para.split(" ").length < 12;
      const p = document.createElement(isHeading ? "h3" : "p");
      for (const s of sentences(para, lang)) {
        const span = document.createElement("span");
        span.className = "s";
        span.textContent = s.text;
        span.dataset.i = sents.length;
        sents.push({ text: s.text.replace(/\s+/g, " "), start: pStart + s.index, end: pStart + s.index + s.text.length, el: span });
        p.append(span);
      }
      frag.append(p);
    }
    body.append(frag);
    state.doc = { ...doc, lang, sents };
    $("#docTitle").textContent = doc.title;
    $("#docMeta").textContent = `${doc.kind}${doc.pages ? ` · ${doc.pages} page${doc.pages > 1 ? "s" : ""}` : ""} · ${doc.text.length.toLocaleString("fr-FR")} caractères · ~${fmtMinutes(doc.text.length)} d'écoute`;
    $("#readerEmpty").classList.add("hidden");
    $("#readerDoc").classList.remove("hidden");
    body.scrollTop = 0;
    const pos = (state.cloud.positions[doc.id] || 0);
    markCurrent(pos, false);
    updateReadBtn();
    if (pos > 0 && sents[pos]) sents[pos].el.scrollIntoView({ block: "center" });
  }

  $("#docBody").addEventListener("click", (e) => {
    const s = e.target.closest(".s");
    if (!s || getSelection().toString()) return;
    playDoc(Number(s.dataset.i));
  });

  function playDoc(start) {
    const d = state.doc;
    if (!d) return;
    if (state.playing?.kind !== "doc" || state.playing.id !== d.id) {
      narrator.load(d.sents.map((s) => ({ text: s.text })), { title: d.title, lang: d.lang }, start ?? (state.cloud.positions[d.id] || 0));
      state.playing = { kind: "doc", id: d.id };
    } else if (start != null) {
      narrator.setIndex(start);
    }
    narrator.playFrom(start ?? narrator.index);
  }
  $("#readBtn").addEventListener("click", () => {
    if (state.playing?.kind === "doc" && state.playing.id === state.doc?.id && narrator.state !== "idle") narrator.toggle();
    else playDoc();
  });
  function updateReadBtn() {
    const active = state.playing?.kind === "doc" && state.playing.id === state.doc?.id;
    const playing = active && (narrator.state === "playing" || narrator.state === "loading");
    const pos = state.doc ? (state.cloud.positions[state.doc.id] || 0) : 0;
    $("#readBtn span").textContent = playing ? "Pause" : active || pos > 0 ? "Reprendre" : "Écouter";
  }

  let lastMarked = null;
  function markCurrent(i, scroll = true) {
    const d = state.doc;
    if (!d) return;
    lastMarked?.classList.remove("current");
    const s = d.sents[i];
    if (!s) return;
    s.el.classList.add("current");
    lastMarked = s.el;
    $("#docProgress").style.width = `${((i + 1) / d.sents.length) * 100}%`;
    if (scroll && narrator.settings.follow !== false) {
      const r = s.el.getBoundingClientRect();
      const box = $("#docBody").getBoundingClientRect();
      if (r.top < box.top + 60 || r.bottom > box.bottom - 80) s.el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }
  function highlightRange(start, end) {
    const d = state.doc;
    if (!d) return;
    $$(".s.cited", $("#docBody")).forEach((el) => el.classList.remove("cited"));
    const hits = d.sents.filter((s) => s.end > start && s.start < end);
    hits.forEach((s) => s.el.classList.add("cited"));
    if (hits[0]) hits[0].el.scrollIntoView({ block: "center", behavior: "smooth" });
    setTimeout(() => hits.forEach((s) => s.el.classList.remove("cited")), 6000);
  }

  // ----------------------------------------------------------- barre audio
  narrator.on("state", (st) => {
    const p = $("#player");
    p.classList.toggle("hidden", st === "idle" && !state.playing);
    p.dataset.state = st;
    updateReadBtn();
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = st === "playing" ? "playing" : "paused";
  });
  narrator.on("load", (meta) => {
    $("#player").classList.remove("hidden");
    $("#playerTitle").textContent = meta.title || "";
    $("#playerSub").textContent = "";
    $$(".turn.current").forEach((el) => el.classList.remove("current"));
  });
  narrator.on("item", (i) => {
    const n = narrator.items.length;
    $("#playerSub").textContent = `${i + 1} / ${n} · ${engineLabel()}`;
    if (state.playing?.kind === "doc" && state.doc?.id === state.playing.id) {
      markCurrent(i);
      (state.cloud.positions[state.playing.id] = i), persist();
    }
    if (state.playing?.kind === "podcast") {
      const t = narrator.items[i]?.turn;
      $$(".turn").forEach((el) => el.classList.toggle("current", Number(el.dataset.t) === t));
      const cur = $(".turn.current");
      if (cur && narrator.settings.follow !== false) cur.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  });
  narrator.on("end", () => {
    if (state.playing?.kind === "doc") (state.cloud.positions[state.playing.id] = 0), persist();
    $("#playerSub").textContent = "Terminé";
  });
  narrator.on("stop", () => {
    state.playing = null;
    $("#player").classList.add("hidden");
    $$(".turn.current").forEach((el) => el.classList.remove("current"));
    updateReadBtn();
  });
  narrator.on("error", (msg) => toast(msg, "error"));

  $("#pPlay").addEventListener("click", () => narrator.toggle());
  $("#pPrev").addEventListener("click", () => narrator.prev());
  $("#pNext").addEventListener("click", () => narrator.next());
  $("#pStop").addEventListener("click", () => narrator.stop());
  const RATES = [0.75, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2];
  $("#pRate").addEventListener("click", () => {
    const cur = narrator.settings.rate;
    const next = RATES.find((r) => r > cur + 0.001) ?? RATES[0];
    narrator.set({ rate: next });
  });
  $("#pVoice").addEventListener("click", openSettings);
  $("#playerTitle").addEventListener("click", () => {
    if (state.playing?.kind === "doc") openDoc(state.playing.id), setView("read");
  });
  addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea, select, [contenteditable]") || $("dialog[open]")) return;
    if (e.code === "Space" && (state.playing || state.doc)) {
      e.preventDefault();
      state.playing ? narrator.toggle() : playDoc();
    } else if (e.key === "ArrowRight" && state.playing) narrator.next();
    else if (e.key === "ArrowLeft" && state.playing) narrator.prev();
  });

  function engineLabel() {
    return { browser: "voix du navigateur", openai: "voix premium OpenAI", elevenlabs: "voix premium ElevenLabs" }[narrator.settings.engine];
  }

  // ---------------------------------------------------------------- réglages
  function openSettings() {
    fillSettings();
    $("#settingsDlg").showModal();
  }
  $("#settingsBtn").addEventListener("click", openSettings);
  function fillSettings() {
    const s = narrator.settings;
    const engines = [["browser", "Voix du navigateur (gratuit, hors-ligne)"]];
    if (state.config.tts.includes("elevenlabs")) engines.push(["elevenlabs", "ElevenLabs — voix premium très naturelles"]);
    if (state.config.tts.includes("openai")) engines.push(["openai", "OpenAI — voix premium naturelles"]);
    if (!engines.some(([k]) => k === s.engine)) s.engine = "browser";
    $("#engineSel").innerHTML = engines.map(([k, l]) => `<option value="${k}" ${k === s.engine ? "selected" : ""}>${l}</option>`).join("");
    $("#engineHint").textContent =
      engines.length > 1
        ? ""
        : "Pour des voix encore plus naturelles, ajoutez ELEVENLABS_API_KEY ou OPENAI_API_KEY dans .env. Astuce : dans Microsoft Edge, les voix « Natural » sont excellentes et gratuites.";

    const lang = state.doc?.lang || narrator.lang || "fr";
    if (s.engine === "browser") {
      const ranked = rankVoices(lang);
      const opts = (sel) =>
        `<option value="auto" ${sel === "auto" ? "selected" : ""}>Automatique (meilleure voix)</option>` +
        ranked.map((v) => `<option value="${esc(v.name)}" ${v.name === sel ? "selected" : ""}>${esc(v.name)} — ${esc(v.lang)}</option>`).join("");
      $("#voiceSel").innerHTML = opts(s.voice);
      $("#voiceA").innerHTML = opts(s.voiceA);
      $("#voiceB").innerHTML = opts(s.voiceB);
      narrator.lang = lang;
      const best = narrator.browserVoiceFor();
      $("#voiceHint").textContent = best ? `Voix automatique : ${best.name}` : "Aucune voix trouvée sur cet appareil.";
    } else {
      const list = state.config.voices[s.engine] || [];
      const pv = s.premiumVoice[s.engine] || {};
      const opts = (sel) => list.map((v) => `<option value="${esc(v.id)}" ${v.id === sel ? "selected" : ""}>${esc(v.name)}</option>`).join("");
      narrator.premiumVoices = state.config.voices;
      $("#voiceSel").innerHTML = opts(pv.main || narrator.premiumVoiceFor(null, state.config.voices));
      $("#voiceA").innerHTML = opts(narrator.premiumVoiceFor("A", state.config.voices));
      $("#voiceB").innerHTML = opts(narrator.premiumVoiceFor("B", state.config.voices));
      $("#voiceHint").textContent = "Voix générée par le serveur, multilingue.";
    }
    $("#rateRange").value = s.rate;
    $("#rateVal").textContent = fmtRate(s.rate);
    $("#followChk").checked = s.follow !== false;
  }
  const fmtRate = (r) => `${Math.round(r * 100) / 100}×`.replace(".", ",");
  $("#engineSel").addEventListener("change", (e) => {
    narrator.set({ engine: e.target.value });
    fillSettings();
  });
  function setPremium(key, val) {
    const e = narrator.settings.engine;
    const pv = { ...narrator.settings.premiumVoice };
    pv[e] = { ...(pv[e] || {}), [key]: val };
    narrator.set({ premiumVoice: pv });
  }
  $("#voiceSel").addEventListener("change", (e) => (narrator.settings.engine === "browser" ? narrator.set({ voice: e.target.value }) : setPremium("main", e.target.value)));
  $("#voiceA").addEventListener("change", (e) => (narrator.settings.engine === "browser" ? narrator.set({ voiceA: e.target.value }) : setPremium("A", e.target.value)));
  $("#voiceB").addEventListener("change", (e) => (narrator.settings.engine === "browser" ? narrator.set({ voiceB: e.target.value }) : setPremium("B", e.target.value)));
  $("#rateRange").addEventListener("input", (e) => ($("#rateVal").textContent = fmtRate(Number(e.target.value))));
  $("#rateRange").addEventListener("change", (e) => narrator.set({ rate: Number(e.target.value) }));
  $("#followChk").addEventListener("change", (e) => narrator.set({ follow: e.target.checked }));
  $("#testVoice").addEventListener("click", () => {
    const lang = state.doc?.lang || "fr";
    const sample = {
      fr: "Bonjour ! Je suis la voix qui va vous lire vos documents. Est-ce que ce ton vous convient ?",
      en: "Hello! I'm the voice that will read your documents to you. Does this sound good?",
    }[lang] || "Bonjour ! Je suis la voix qui va vous lire vos documents.";
    narrator.load([{ text: sample }], { title: "Test de la voix", lang });
    state.playing = { kind: "test" };
    narrator.playFrom(0);
  });
  narrator.on("settings", () => {
    $("#pRate").textContent = fmtRate(narrator.settings.rate);
  });
  narrator.on("voices", () => {
    if ($("#settingsDlg").open) fillSettings();
  });
  $("#pRate").textContent = fmtRate(narrator.settings.rate);

  // -------------------------------------------------------------- onglets
  $$(".tab").forEach((t) =>
    t.addEventListener("click", () => {
      $$(".tab").forEach((x) => x.classList.toggle("active", x === t));
      $$(".tab-page").forEach((p) => p.classList.toggle("hidden", p.dataset.page !== t.dataset.tab));
      $("#noteView").classList.add("hidden");
      if (t.dataset.tab === "notes") loadNotes();
    }),
  );
  const showTab = (name) => $(`.tab[data-tab="${name}"]`).click();

  // ------------------------------------------------------------- discussion
  async function renderChatIntro() {
    const box = $("#chatIntro");
    const docs = selectedDocs();
    if (!docs.length) {
      box.innerHTML = `<div class="intro-card muted">Cochez une ou plusieurs sources pour discuter avec elles. Lumen répond en citant les passages exacts&nbsp;; cliquez sur une citation pour la retrouver dans le texte.</div>`;
      return;
    }
    if (!state.config.ai) {
      box.innerHTML = "";
      return;
    }
    const key = selKey();
    const cache = state.cloud.overview;
    if (cache[key]) return drawOverview(cache[key]);
    box.innerHTML = `<div class="intro-card"><span class="spin"></span> Lecture des sources pour préparer une vue d'ensemble…</div>`;
    try {
      const note = await runJob({ type: "studio", kind: "overview", docIds: [...state.selected] });
      const c = state.cloud.overview;
      c[key] = note.content;
      const keys = Object.keys(c);
      if (keys.length > 20) delete c[keys[0]];
      persist();
      if (selKey() === key) drawOverview(note.content);
    } catch (e) {
      if (selKey() === key) box.innerHTML = `<div class="intro-card muted">${esc(e.message)}</div>`;
    }
  }
  function drawOverview(o) {
    const box = $("#chatIntro");
    box.innerHTML = `
      <div class="intro-card">
        <div class="eyebrow">Vue d'ensemble</div>
        <p>${esc(o.summary)}</p>
        <div class="topics">${(o.topics || []).map((t) => `<span class="topic">${esc(t)}</span>`).join("")}</div>
        <div class="intro-actions"><button class="link" id="listenOverview">▶ Écouter</button></div>
      </div>
      <div class="suggestions">${(o.questions || []).map((q) => `<button class="suggestion">${esc(q)}</button>`).join("")}</div>`;
    $$(".suggestion", box).forEach((b) => b.addEventListener("click", () => ask(b.textContent)));
    $$(".topic", box).forEach((b) => b.addEventListener("click", () => ask(`Explique-moi : ${b.textContent}`)));
    $("#listenOverview", box).addEventListener("click", () => speakItems(sentences(o.summary).map((s) => ({ text: s.text })), "Vue d'ensemble", { kind: "note" }));
  }

  function renderChat() {
    const box = $("#chatMessages");
    box.innerHTML = "";
    state.chat.forEach((m, i) => box.append(messageEl(m, i)));
    $("#chatIntro").classList.toggle("compact", state.chat.length > 0);
    scrollChat();
  }
  function messageEl(m, i) {
    const el = document.createElement("div");
    el.className = "msg " + m.role;
    if (m.role === "user") {
      el.innerHTML = `<div class="bubble">${esc(m.content)}</div>`;
      return el;
    }
    const { html, cites } = renderAnswer(m);
    el.innerHTML = `<div class="answer">${html}</div>
      ${m.error ? "" : `<div class="msg-actions">
        <button class="link" data-a="listen">▶ Écouter</button>
        <button class="link" data-a="copy">Copier</button>
        <button class="link" data-a="save">Enregistrer en note</button>
      </div>`}`;
    $$(".cite", el).forEach((b) => {
      const c = cites[Number(b.dataset.c) - 1];
      if (!c) return;
      b.title = `${c.title} — « ${c.quote.trim().slice(0, 240)} »`;
      b.addEventListener("click", () => {
        openDoc(c.doc, { highlight: c });
        setView("read");
      });
    });
    el.addEventListener("click", async (e) => {
      const a = e.target.dataset?.a;
      if (!a) return;
      if (a === "listen") speakItems(speechItemsFromHtml(html), "Réponse", { kind: "chat" });
      if (a === "copy") {
        await navigator.clipboard.writeText(m.content);
        toast("Copié", "ok");
      }
      if (a === "save") {
        const q = state.chat[i - 1]?.content || "Réponse";
        await api("/api/notes", { method: "POST", body: { title: q.slice(0, 120), content: m.content, docIds: [...state.selected] } });
        toast("Enregistré dans les notes", "ok");
        loadNotes();
      }
    });
    return el;
  }
  /** Markdown + puces de citation numérotées. */
  function renderAnswer(m) {
    if (!m.blocks) return { html: md(m.content), cites: [] };
    const cites = [];
    let text = "";
    for (const b of m.blocks) {
      text += b.text;
      const marks = [];
      for (const c of b.citations || []) {
        let n = cites.findIndex((x) => x.doc === c.doc && x.start === c.start && x.end === c.end) + 1;
        if (!n) n = cites.push(c);
        if (!marks.includes(n)) marks.push(n);
      }
      if (marks.length) text = text.replace(/\s*$/, (ws) => marks.map((n) => `⟦${n}⟧`).join("") + ws);
    }
    const html = md(text).replace(/⟦(\d+)⟧/g, (_, n) => `<button class="cite" data-c="${n}">${n}</button>`);
    return { html, cites };
  }
  function scrollChat() {
    const s = $("#chatScroll");
    s.scrollTop = s.scrollHeight;
  }

  async function ask(question) {
    question = question.trim();
    if (!question) return;
    if (!state.config.ai) return toast("Configurez ANTHROPIC_API_KEY pour activer la discussion.", "error");
    if (!state.selected.size) return toast("Cochez au moins une source.", "error");
    showTab("chat");
    setView("assist");
    state.chat.push({ role: "user", content: question });
    const answer = { role: "assistant", content: "" };
    state.chat.push(answer);
    renderChat();
    const el = $("#chatMessages").lastElementChild;
    const ans = $(".answer", el);
    ans.innerHTML = `<span class="typing"><i></i><i></i><i></i></span>`;
    $("#chatSend").disabled = true;
    try {
      const r = await authFetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docIds: [...state.selected],
          messages: state.chat.slice(0, -1).filter((m) => !m.error).map(({ role, content }) => ({ role, content })),
        }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Erreur ${r.status}`);
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let k;
        while ((k = buf.indexOf("\n\n")) >= 0) {
          const line = buf.slice(0, k).replace(/^data: /, "");
          buf = buf.slice(k + 2);
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.type === "text") {
            answer.content += ev.text;
            ans.innerHTML = md(answer.content);
            scrollChat();
          } else if (ev.type === "done") {
            answer.blocks = ev.blocks;
            answer.content = ev.blocks.map((b) => b.text).join("");
          } else if (ev.type === "error") throw new Error(ev.error);
        }
      }
    } catch (e) {
      answer.content = `⚠️ ${e.message}`;
      answer.error = true;
    }
    $("#chatSend").disabled = false;
    state.chat = state.chat.slice(-100);
    persist();
    el.replaceWith(messageEl(answer, state.chat.length - 1));
    scrollChat();
  }
  $("#chatForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = $("#chatInput").value;
    $("#chatInput").value = "";
    autoGrow();
    ask(q);
  });
  const autoGrow = () => {
    const t = $("#chatInput");
    t.style.height = "auto";
    t.style.height = Math.min(t.scrollHeight, 160) + "px";
  };
  $("#chatInput").addEventListener("input", autoGrow);
  $("#chatInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      $("#chatForm").requestSubmit();
    }
  });
  $("#chatClear").addEventListener("click", () => {
    state.chat = [];
    persist();
    renderChat();
  });

  // Sélectionner du texte dans le lecteur → « Expliquer ce passage »
  const selBtn = document.createElement("button");
  selBtn.className = "sel-pop hidden";
  selBtn.textContent = "Expliquer ce passage";
  document.body.append(selBtn);
  document.addEventListener("selectionchange", () => {
    const sel = getSelection();
    const txt = sel.toString().trim();
    if (!txt || txt.length < 8 || !sel.rangeCount || !$("#docBody").contains(sel.anchorNode)) return selBtn.classList.add("hidden");
    const r = sel.getRangeAt(0).getBoundingClientRect();
    selBtn.style.top = `${Math.max(8, r.top - 44)}px`;
    selBtn.style.left = `${Math.min(innerWidth - 200, Math.max(8, r.left + r.width / 2 - 90))}px`;
    selBtn.classList.remove("hidden");
  });
  selBtn.addEventListener("mousedown", (e) => e.preventDefault());
  selBtn.addEventListener("click", () => {
    const txt = getSelection().toString().trim();
    selBtn.classList.add("hidden");
    if (state.doc && !state.selected.has(state.doc.id)) {
      state.selected.add(state.doc.id);
      onSelectionChange();
    }
    ask(`Explique-moi ce passage de « ${state.doc?.title} » simplement, avec le contexte nécessaire :\n\n« ${txt.slice(0, 2000)} »`);
  });

  // ---------------------------------------------------------------- studio
  $$("[data-studio]").forEach((b) => b.addEventListener("click", () => runStudio(b.dataset.studio)));
  async function runStudio(kind) {
    if (!state.config.ai) return toast("Configurez ANTHROPIC_API_KEY pour activer le studio.", "error");
    if (!state.selected.size) return toast("Cochez au moins une source.", "error");
    const label = state.config.studio[kind]?.label || kind;
    const job = document.createElement("div");
    job.className = "job";
    job.innerHTML = `<span class="spin"></span> ${esc(label)} en préparation… <small class="muted">(peut prendre une minute)</small>`;
    $("#studioStatus").prepend(job);
    const btns = $$(`[data-studio="${kind}"]`);
    btns.forEach((b) => (b.disabled = true));
    try {
      const note = await runJob({ type: "studio", kind, docIds: [...state.selected], focus: $("#studioFocus").value, length: $("#podcastLength").value });
      job.remove();
      state.notes.unshift(note);
      updateNotesCount();
      openNote(note);
      if (kind === "podcast") playPodcast(note);
    } catch (e) {
      job.className = "job error";
      job.textContent = `${label} : ${e.message}`;
      setTimeout(() => job.remove(), 8000);
    } finally {
      btns.forEach((b) => (b.disabled = false));
    }
  }

  // ----------------------------------------------------------------- notes
  async function loadNotes() {
    try {
      state.notes = await api("/api/notes");
    } catch {
      return;
    }
    updateNotesCount();
    const ul = $("#noteList");
    ul.innerHTML = "";
    $("#emptyNotes").classList.toggle("hidden", state.notes.length > 0);
    for (const n of state.notes) {
      const li = document.createElement("li");
      li.innerHTML = `<button class="note-item"><span class="note-kind">${esc(state.config.studio[n.kind]?.label || "Note")}</span><b>${esc(n.title)}</b><small class="muted">${new Date(n.createdAt).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}</small></button>`;
      $("button", li).addEventListener("click", () => openNote(n));
      ul.append(li);
    }
  }
  function updateNotesCount() {
    $("#notesCount").textContent = state.notes.length || "";
  }

  let currentNote = null;
  function openNote(note) {
    currentNote = note;
    setView("assist");
    $("#noteView").classList.remove("hidden");
    $("#noteTitle").textContent = state.config.studio[note.kind]?.label || note.title;
    const body = $("#noteBody");
    body.innerHTML = "";
    body.scrollTop = 0;
    const r = { quiz: renderQuiz, flashcards: renderCards, mindmap: renderMindmap, podcast: renderPodcast }[note.kind];
    if (r && note.format === "json") r(note.content, body);
    else body.innerHTML = `<div class="prose">${md(note.content)}</div>`;
    $("#noteListen").classList.toggle("hidden", note.kind === "quiz" || note.kind === "flashcards");
  }
  $("#noteBack").addEventListener("click", () => $("#noteView").classList.add("hidden"));
  $("#noteDelete").addEventListener("click", async () => {
    if (!currentNote || !confirm("Supprimer cette note ?")) return;
    await api(`/api/notes/${currentNote.id}`, { method: "DELETE" });
    $("#noteView").classList.add("hidden");
    loadNotes();
  });
  $("#noteListen").addEventListener("click", () => {
    const n = currentNote;
    if (!n) return;
    if (n.kind === "podcast") return playPodcast(n);
    if (n.kind === "mindmap") {
      const c = n.content;
      const items = [{ text: c.central + "." }];
      c.branches.forEach((b) => {
        items.push({ text: b.label + "." });
        b.children.forEach((ch) => items.push({ text: [ch.label, ...ch.details].join(". ") + "." }));
      });
      return speakItems(items, "Carte mentale", { kind: "note" });
    }
    speakItems(speechItemsFromHtml($("#noteBody").innerHTML), $("#noteTitle").textContent, { kind: "note" });
  });

  function speakItems(items, title, playing) {
    if (!items.length) return;
    narrator.load(items, { title });
    state.playing = playing;
    narrator.playFrom(0);
  }

  // --- quiz
  function renderQuiz(q, body) {
    let answered = 0, good = 0;
    body.innerHTML = `<div class="quiz"><h4>${esc(q.title)}</h4><div class="score muted small" id="quizScore">0 / ${q.questions.length}</div></div>`;
    const wrap = $(".quiz", body);
    q.questions.forEach((item, qi) => {
      const card = document.createElement("div");
      card.className = "q";
      card.innerHTML = `<p class="q-text"><span class="q-num">${qi + 1}</span>${esc(item.question)}</p>
        <div class="opts">${item.options.map((o, oi) => `<button class="opt" data-oi="${oi}"><span>${"ABCD"[oi] || oi + 1}</span>${esc(o)}</button>`).join("")}</div>
        <div class="expl hidden"></div>`;
      card.addEventListener("click", (e) => {
        const b = e.target.closest(".opt");
        if (!b || card.classList.contains("done")) return;
        card.classList.add("done");
        const oi = Number(b.dataset.oi);
        const ok = oi === item.answer_index;
        answered++;
        if (ok) good++;
        $$(".opt", card).forEach((x) => {
          const k = Number(x.dataset.oi);
          if (k === item.answer_index) x.classList.add("right");
          else if (k === oi) x.classList.add("wrong");
        });
        const ex = $(".expl", card);
        ex.innerHTML = `<b>${ok ? "Bonne réponse !" : "Pas tout à fait."}</b> ${esc(item.explanation)}`;
        ex.classList.remove("hidden");
        $("#quizScore", body).textContent = `${good} / ${answered} bonnes réponses${answered === q.questions.length ? ` — ${Math.round((good / answered) * 100)} %` : ""}`;
      });
      wrap.append(card);
    });
    const again = document.createElement("button");
    again.className = "btn";
    again.textContent = "Recommencer";
    again.addEventListener("click", () => renderQuiz(q, body));
    wrap.append(again);
  }

  // --- fiches
  function renderCards(c, body) {
    let cards = [...c.cards];
    let i = 0;
    body.innerHTML = `<div class="cards">
      <div class="card-stage"><button class="flash" aria-live="polite"><div class="face front"></div><div class="face back"></div></button></div>
      <div class="card-nav"><button class="icon-btn" data-a="prev" aria-label="Précédente">‹</button><span class="muted small" data-a="pos"></span><button class="icon-btn" data-a="next" aria-label="Suivante">›</button></div>
      <div class="row center"><button class="btn" data-a="shuffle">Mélanger</button><button class="btn" data-a="say">▶ Écouter</button></div>
      <p class="muted small center">Touchez la fiche pour la retourner. Flèches ← → pour naviguer.</p></div>`;
    const flash = $(".flash", body);
    const draw = () => {
      flash.classList.remove("flipped");
      $(".front", flash).textContent = cards[i].front;
      $(".back", flash).textContent = cards[i].back;
      $('[data-a="pos"]', body).textContent = `${i + 1} / ${cards.length}`;
    };
    flash.addEventListener("click", () => flash.classList.toggle("flipped"));
    body.addEventListener("click", (e) => {
      const a = e.target.dataset?.a;
      if (a === "prev") (i = (i - 1 + cards.length) % cards.length), draw();
      if (a === "next") (i = (i + 1) % cards.length), draw();
      if (a === "shuffle") (cards = cards.sort(() => Math.random() - 0.5)), (i = 0), draw();
      if (a === "say") speakItems([{ text: cards[i].front }, { text: cards[i].back }], "Fiche", { kind: "note" });
    });
    const onKey = (e) => {
      if (!body.contains(flash)) return removeEventListener("keydown", onKey);
      if (e.target.closest("input,textarea")) return;
      if (e.key === "ArrowRight") (i = (i + 1) % cards.length), draw();
      if (e.key === "ArrowLeft") (i = (i - 1 + cards.length) % cards.length), draw();
    };
    addEventListener("keydown", onKey);
    draw();
  }

  // --- carte mentale
  function renderMindmap(m, body) {
    const colors = ["#c2410c", "#0f766e", "#7c3aed", "#b45309", "#2563eb", "#be185d", "#4d7c0f"];
    body.innerHTML = `<div class="mindmap"><div class="mm-root">${esc(m.central)}</div><div class="mm-branches">${m.branches
      .map(
        (b, bi) => `<details class="mm-branch" open style="--c:${colors[bi % colors.length]}">
          <summary>${esc(b.label)}</summary>
          <ul>${b.children
            .map(
              (ch) => `<li><button class="mm-leaf" title="Demander une explication">${esc(ch.label)}</button>${ch.details.length ? `<ul class="mm-details">${ch.details.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>` : ""}</li>`,
            )
            .join("")}</ul></details>`,
      )
      .join("")}</div><p class="muted small">Touchez une idée pour en discuter.</p></div>`;
    $$(".mm-leaf", body).forEach((b) =>
      b.addEventListener("click", () => {
        const branch = b.closest(".mm-branch").querySelector("summary").textContent;
        $("#noteView").classList.add("hidden");
        ask(`Dans le thème « ${branch} », explique-moi : ${b.textContent}`);
      }),
    );
  }

  // --- podcast
  function podcastItems(p) {
    const items = [];
    p.turns.forEach((t, ti) => {
      for (const s of sentences(t.text)) items.push({ text: s.text, role: t.speaker, turn: ti });
    });
    return items;
  }
  function renderPodcast(p, body) {
    const premium = narrator.settings.engine !== "browser";
    body.innerHTML = `<div class="podcast">
      <div class="pod-head">
        <div class="pod-art"><span>A</span><span>B</span></div>
        <div><h4>${esc(p.title)}</h4><p class="muted small">Avec Léa et Hugo · ${p.turns.length} répliques</p></div>
      </div>
      <div class="row"><button class="btn primary" data-a="play">▶ Écouter le podcast</button>
      ${premium ? `<button class="btn" data-a="mp3">Télécharger MP3</button>` : `<span class="muted small">Astuce : avec une voix premium, vous pourrez télécharger le MP3.</span>`}</div>
      <div class="transcript">${p.turns
        .map((t, ti) => `<div class="turn ${t.speaker === "A" ? "a" : "b"}" data-t="${ti}"><span class="who">${t.speaker === "A" ? "Léa" : "Hugo"}</span><p>${esc(t.text)}</p></div>`)
        .join("")}</div></div>`;
    body.addEventListener("click", async (e) => {
      const turn = e.target.closest(".turn");
      if (turn) return playPodcast(currentNote, Number(turn.dataset.t));
      const a = e.target.dataset?.a;
      if (a === "play") playPodcast(currentNote);
      if (a === "mp3") {
        const btn = e.target;
        btn.disabled = true;
        try {
          if (!(state.playing?.kind === "podcast" && state.playing.id === currentNote.id)) {
            narrator.load(podcastItems(p), { title: p.title });
            state.playing = { kind: "podcast", id: currentNote.id };
          }
          narrator.premiumVoices = state.config.voices;
          const blob = await narrator.exportMp3((f) => (btn.textContent = `Préparation… ${Math.round(f * 100)} %`));
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = (p.title || "podcast").replace(/[\\/:*?"<>|]+/g, "") + ".mp3";
          a.click();
        } catch (err) {
          toast(err.message, "error");
        }
        btn.disabled = false;
        btn.textContent = "Télécharger MP3";
      }
    });
  }
  function playPodcast(note, fromTurn = 0) {
    const items = podcastItems(note.content);
    const start = Math.max(0, items.findIndex((it) => it.turn === fromTurn));
    narrator.load(items, { title: note.content.title });
    state.playing = { kind: "podcast", id: note.id };
    narrator.playFrom(start);
  }

  // ------------------------------------------------------------- compte
  const authEl = $("#auth");
  let authMode = "login";
  function showAuth(mode = "login", msg = "") {
    authMode = mode;
    authEl.dataset.mode = mode;
    authEl.classList.remove("hidden");
    $("#authMsg").textContent = msg;
    $("#authMsg").className = "auth-msg" + (msg ? "" : " hidden");
    const titles = { login: "Connexion", signup: "Créer un compte", forgot: "Mot de passe oublié", reset: "Nouveau mot de passe" };
    $("#authTitle").textContent = titles[mode];
    $("#authSubmit").textContent = { login: "Se connecter", signup: "Créer mon compte", forgot: "Recevoir un lien", reset: "Enregistrer" }[mode];
    $("#authEmailRow").classList.toggle("hidden", mode === "reset");
    $("#authPassRow").classList.toggle("hidden", mode === "forgot");
    $("#authPass").autocomplete = mode === "login" ? "current-password" : "new-password";
    $$(".auth-switch [data-mode]").forEach((b) => b.classList.toggle("hidden", b.dataset.mode === mode || (mode === "reset" && b.dataset.mode !== "login")));
    setTimeout(() => (mode === "reset" ? $("#authPass") : $("#authEmail")).focus(), 50);
  }
  function hideAuth() {
    authEl.classList.add("hidden");
  }
  $$(".auth-switch [data-mode]").forEach((b) => b.addEventListener("click", () => showAuth(b.dataset.mode)));
  function authErrorText(e) {
    const m = String(e?.message || e);
    if (/invalid_grant|invalid login|no user found|password/i.test(m) && authMode === "login") return "E-mail ou mot de passe incorrect.";
    if (/not confirmed/i.test(m)) return "Confirmez d'abord votre adresse e-mail (lien reçu par mail).";
    if (/already registered|already exists/i.test(m)) return "Un compte existe déjà avec cet e-mail. Connectez-vous.";
    if (/at least|too short|weak/i.test(m)) return "Mot de passe trop court (6 caractères minimum).";
    if (/identity.*(not|disabled|enabled)|404|MissingIdentity/i.test(m) || e?.name === "MissingIdentityError")
      return "La connexion n'est pas encore activée sur ce site : activez Netlify Identity dans le tableau de bord Netlify.";
    return m;
  }
  $("#authForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#authEmail").value.trim();
    const pass = $("#authPass").value;
    const btn = $("#authSubmit");
    btn.disabled = true;
    const say = (msg, ok) => {
      $("#authMsg").textContent = msg;
      $("#authMsg").className = "auth-msg" + (ok ? " ok" : "");
    };
    try {
      if (authMode === "login") {
        await Identity.login(email, pass);
        location.reload();
      } else if (authMode === "signup") {
        const u = await Identity.signup(email, pass);
        if (u?.confirmedAt) location.reload();
        else say(`Presque fini ! Un e-mail de confirmation a été envoyé à ${email}. Cliquez sur le lien, puis revenez vous connecter.`, true);
      } else if (authMode === "forgot") {
        await Identity.requestPasswordRecovery(email);
        say(`Si un compte existe pour ${email}, un lien pour changer le mot de passe vient d'être envoyé.`, true);
      } else if (authMode === "reset") {
        await Identity.updateUser({ password: pass });
        location.reload();
      }
    } catch (err) {
      say(authErrorText(err));
    }
    btn.disabled = false;
  });
  $("#logoutBtn").addEventListener("click", async () => {
    if (persistTimer) {
      clearTimeout(persistTimer);
      await api("/api/state", { method: "PUT", body: snapshot() }).catch(() => {});
    }
    narrator.stop();
    try {
      await Identity.logout();
    } catch {}
    location.reload();
  });

  // ------------------------------------------------------------- démarrage
  (async () => {
    try {
      state.config = await (await fetch("/api/config")).json();
    } catch (e) {
      toast("Serveur injoignable : " + e.message, "error");
    }
    narrator.premiumVoices = state.config.voices || {};
    if (narrator.settings.engine !== "browser" && !(state.config.tts || []).includes(narrator.settings.engine)) narrator.set({ engine: "browser" });
    // Première visite : si une voix premium est disponible, on la propose par défaut.
    if (!store.get("voiceChosen", false) && state.config.tts?.length) {
      narrator.set({ engine: state.config.tts[0] });
      store.set("voiceChosen", true);
    }
    $("#aiOff").classList.toggle("hidden", !!state.config.ai);

    // Liens reçus par e-mail (confirmation, mot de passe oublié…).
    let user = null;
    if (state.config.devUser) user = { email: state.config.devUser };
    else if (Identity) {
      try {
        const cb = await Identity.handleAuthCallback();
        if (cb) history.replaceState(null, "", location.pathname);
        if (cb?.type === "recovery") return showAuth("reset", "Choisissez un nouveau mot de passe.");
        if (cb?.type === "confirmation") toast("Adresse e-mail confirmée, bienvenue !", "ok");
      } catch (e) {
        toast("Lien invalide ou expiré : " + authErrorText(e), "error");
      }
      user = await Identity.getUser();
    }
    if (!user) return showAuth("login");

    let saved;
    try {
      saved = await api("/api/state");
    } catch (e) {
      if (!authEl.classList.contains("hidden")) return;
      toast(e.message, "error");
      saved = {};
    }
    state.user = { email: saved.email || user.email };
    $("#userEmail").textContent = state.user.email || "";
    $("#account").classList.remove("hidden");
    state.chat = saved.chat || [];
    state.selected = new Set(saved.selected || []);
    state.cloud = { positions: saved.positions || {}, overview: saved.overview || {}, lastDoc: saved.lastDoc || null };
    hideAuth();
    if (Identity && !state.config.devUser) setInterval(() => Identity.refreshSession().catch(() => {}), 20 * 60_000);

    await loadDocs();
    renderChat();
    renderChatIntro();
    loadNotes();
    const last = state.cloud.lastDoc;
    if (last && state.docs.some((d) => d.id === last)) openDoc(last);
    setView("read");
  })();
})();
