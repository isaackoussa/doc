/* Narrator : moteur de lecture à voix haute.
 * - « browser » : voix du système (gratuites, hors-ligne). On choisit
 *   automatiquement la plus naturelle disponible (voix « Natural/Neural »
 *   d'Edge, Google, voix « Premium/Améliorée » d'Apple…).
 * - « openai » / « elevenlabs » : voix premium générées par le serveur.
 * La file de lecture est une liste de phrases ; chaque phrase peut porter un
 * rôle (A/B) pour le podcast à deux voix.
 */
(function () {
  const synth = window.speechSynthesis;

  // ---------- choix des voix du navigateur ----------
  function browserVoices() {
    return synth ? synth.getVoices() : [];
  }
  function voiceQuality(v) {
    const n = v.name;
    let q = 0;
    if (/natural|neural|online/i.test(n)) q += 60; // Edge / Windows neural
    if (/premium|enhanced|améliorée|siri/i.test(n)) q += 50; // Apple
    if (/google/i.test(n)) q += 35;
    if (/wavenet|studio|journey/i.test(n)) q += 55;
    if (!v.localService) q += 5;
    if (/compact|espeak|robot/i.test(n)) q -= 40;
    return q;
  }
  function langMatch(v, lang) {
    const l = (v.lang || "").toLowerCase().replace("_", "-");
    if (!lang) return 0;
    if (l === lang.toLowerCase()) return 120;
    if (l.startsWith(lang.slice(0, 2).toLowerCase())) return 100;
    return 0;
  }
  function rankVoices(lang) {
    return browserVoices()
      .map((v) => ({ v, s: langMatch(v, lang) + voiceQuality(v) }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.v);
  }
  function isLikelyMale(v) {
    return /\b(thomas|henri|paul|daniel|hugo|nicolas|claude|guillaume|antoine|jean|rémi|remi|male|homme|guy|ryan|eric|davis|andrew|brian|christopher|roger|george|fred|aaron|reed|male)\b/i.test(v.name);
  }

  /** Langue dominante d'un texte (simple : fr / en / es / de / it). */
  function detectLang(text) {
    const t = " " + text.slice(0, 6000).toLowerCase() + " ";
    const count = (words) => words.reduce((s, w) => s + (t.split(` ${w} `).length - 1), 0);
    const scores = {
      fr: count(["le", "la", "les", "des", "est", "et", "une", "dans", "que", "pour", "pas", "du"]),
      en: count(["the", "and", "is", "of", "to", "in", "that", "it", "for", "with", "are", "this"]),
      es: count(["el", "los", "las", "y", "es", "una", "por", "con", "para", "del", "que", "se"]),
      de: count(["der", "die", "und", "das", "ist", "nicht", "mit", "ein", "eine", "zu", "auf", "den"]),
      it: count(["il", "di", "che", "è", "per", "una", "con", "non", "sono", "della", "gli", "del"]),
    };
    const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    return best[1] > 3 ? best[0] : (navigator.language || "fr").slice(0, 2);
  }

  // ---------- découpage en phrases ----------
  const segmenterCache = {};
  function sentences(text, lang = "fr") {
    const out = [];
    if (window.Intl && Intl.Segmenter) {
      const seg = (segmenterCache[lang] ||= new Intl.Segmenter(lang, { granularity: "sentence" }));
      for (const s of seg.segment(text)) out.push({ text: s.segment, index: s.index });
    } else {
      const re = /[^.!?…]+[.!?…]+["»”)]*\s*|[^.!?…]+$/g;
      let m;
      while ((m = re.exec(text))) out.push({ text: m[0], index: m.index });
    }
    // Les phrases très longues sont recoupées (sinon certaines voix coupent).
    const final = [];
    for (const s of out) {
      if (!s.text.trim()) continue;
      if (s.text.length <= 260) {
        final.push(s);
        continue;
      }
      const parts = s.text.split(/(?<=[,;:])\s+/);
      let buf = "", start = s.index, pos = s.index;
      for (const p of parts) {
        const idx = text.indexOf(p, pos);
        if (buf && buf.length + p.length > 220) {
          final.push({ text: buf, index: start });
          buf = "";
          start = idx;
        }
        buf += (buf ? " " : "") + p;
        pos = idx + p.length;
      }
      if (buf) final.push({ text: buf, index: start });
    }
    return final;
  }

  // ---------- Narrator ----------
  class Narrator {
    constructor() {
      this.settings = Object.assign(
        { engine: "browser", voice: "auto", voiceA: "auto", voiceB: "auto", rate: 1, premiumVoice: {} },
        JSON.parse(localStorage.getItem("lumen.voice") || "{}"),
      );
      this.items = [];
      this.index = 0;
      this.state = "idle"; // idle | loading | playing | paused
      this.gen = 0;
      this.audio = new Audio();
      this.audio.preservesPitch = true;
      this.audioCache = new Map();
      this.listeners = {};
      this.lang = "fr";
      if (synth) synth.onvoiceschanged = () => this.emit("voices");
      this.setupMediaSession();
    }
    on(ev, fn) {
      (this.listeners[ev] ||= []).push(fn);
    }
    emit(ev, ...a) {
      (this.listeners[ev] || []).forEach((f) => f(...a));
    }
    save() {
      localStorage.setItem("lumen.voice", JSON.stringify(this.settings));
    }
    set(patch) {
      Object.assign(this.settings, patch);
      this.save();
      if (this.audio) this.audio.playbackRate = this.settings.rate;
      // Un changement de voix/moteur s'applique dès la phrase en cours.
      if (("engine" in patch || "voice" in patch || "voiceA" in patch || "voiceB" in patch || "premiumVoice" in patch) && this.state === "playing") {
        this.playFrom(this.index);
      } else if ("rate" in patch && this.state === "playing" && this.settings.engine === "browser") {
        this.playFrom(this.index);
      }
      this.emit("settings");
    }

    // ----- voix -----
    browserVoiceFor(role) {
      const ranked = rankVoices(this.lang);
      const pick = (name) => ranked.find((v) => v.name === name);
      if (!role) return (this.settings.voice !== "auto" && pick(this.settings.voice)) || ranked[0] || null;
      const key = role === "A" ? "voiceA" : "voiceB";
      if (this.settings[key] !== "auto" && pick(this.settings[key])) return pick(this.settings[key]);
      const sameLang = ranked.filter((v) => langMatch(v, this.lang) > 0);
      const pool = sameLang.length ? sameLang : ranked;
      if (role === "A") return pool.find((v) => !isLikelyMale(v)) || pool[0] || null;
      const a = this.browserVoiceFor("A");
      return pool.find((v) => isLikelyMale(v) && v !== a) || pool.find((v) => v !== a) || pool[0] || null;
    }
    premiumVoiceFor(role, voices) {
      const engine = this.settings.engine;
      const pv = this.settings.premiumVoice[engine] || {};
      const list = voices[engine] || [];
      const main = pv.main || list[0]?.id;
      if (!role) return main;
      if (role === "A") return pv.A || (engine === "openai" ? "coral" : list.find((v) => /\(F\)/.test(v.name))?.id || main);
      return pv.B || (engine === "openai" ? "ash" : list.find((v) => /\(H\)/.test(v.name))?.id || list[1]?.id || main);
    }

    // ----- file de lecture -----
    /** items: [{text, role?}] ; meta: {title, sub} */
    load(items, meta = {}, startIndex = 0) {
      this.stop(false);
      this.items = items;
      this.meta = meta;
      this.index = Math.max(0, Math.min(startIndex, items.length - 1));
      this.lang = meta.lang || detectLang(items.slice(0, 80).map((i) => i.text).join(" "));
      this.emit("load", meta);
      this.updateMediaSession();
    }
    play() {
      if (!this.items.length) return;
      if (this.state === "paused" && this.settings.engine !== "browser" && this.audio.src) {
        this.state = "playing";
        this.emit("state", this.state);
        this.audio.play().catch(() => this.playFrom(this.index));
        return;
      }
      this.playFrom(this.index);
    }
    pause() {
      if (this.state !== "playing" && this.state !== "loading") return;
      this.gen++;
      if (synth) synth.cancel();
      this.audio.pause();
      this.state = "paused";
      this.emit("state", this.state);
    }
    toggle() {
      this.state === "playing" || this.state === "loading" ? this.pause() : this.play();
    }
    stop(emit = true) {
      this.gen++;
      if (synth) synth.cancel();
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.state = "idle";
      if (emit) this.emit("state", this.state);
      if (emit) this.emit("stop");
    }
    next() {
      this.seek(this.index + 1);
    }
    prev() {
      this.seek(this.index - 1);
    }
    seek(i) {
      if (i < 0 || i >= this.items.length) return;
      const wasPlaying = this.state === "playing" || this.state === "loading";
      this.index = i;
      this.emit("item", i);
      if (wasPlaying) this.playFrom(i);
    }
    setIndex(i) {
      this.index = i;
      this.emit("item", i);
    }
    playFrom(i) {
      this.gen++;
      if (synth) synth.cancel();
      this.audio.pause();
      this.index = i;
      this.emit("item", i);
      if (this.settings.engine === "browser") this.runBrowser(this.gen);
      else this.runPremium(this.gen);
    }
    finish() {
      this.state = "idle";
      this.emit("state", this.state);
      this.emit("end");
    }

    // ----- moteur navigateur -----
    runBrowser(gen) {
      if (!synth) {
        this.emit("error", "Ce navigateur ne propose pas de synthèse vocale.");
        return;
      }
      const item = this.items[this.index];
      if (!item) return this.finish();
      this.state = "playing";
      this.emit("state", this.state);
      const u = new SpeechSynthesisUtterance(item.text);
      const v = this.browserVoiceFor(item.role);
      if (v) {
        u.voice = v;
        u.lang = v.lang;
      } else u.lang = this.lang;
      u.rate = this.settings.rate;
      // S'il n'y a qu'une voix, on varie la hauteur pour distinguer Léa / Hugo.
      if (item.role && this.browserVoiceFor("A") === this.browserVoiceFor("B")) u.pitch = item.role === "A" ? 1.15 : 0.85;
      u.onend = () => {
        if (gen !== this.gen) return;
        if (this.index + 1 >= this.items.length) return this.finish();
        this.index++;
        this.emit("item", this.index);
        this.runBrowser(gen);
      };
      u.onerror = (e) => {
        if (gen !== this.gen || e.error === "interrupted" || e.error === "canceled") return;
        this.emit("error", "La voix du navigateur a rencontré une erreur (" + e.error + ").");
        this.state = "paused";
        this.emit("state", this.state);
      };
      synth.speak(u);
    }

    // ----- moteur premium (audio généré par le serveur) -----
    chunkFrom(i, small = false) {
      // Regroupe des phrases consécutives (même voix) en un morceau audio.
      // Le premier morceau est court pour que la lecture démarre vite.
      const limit = small ? 320 : 900;
      const role = this.items[i]?.role;
      let j = i, len = 0;
      while (j < this.items.length && this.items[j].role === role && (j === i || len + this.items[j].text.length <= limit)) {
        len += this.items[j].text.length;
        j++;
        if (/\n$/.test(this.items[j - 1].text)) break;
      }
      const parts = this.items.slice(i, j);
      return { start: i, end: j, role, parts, text: parts.map((p) => p.text.trim()).join(" ") };
    }
    fetchAudio(chunk) {
      const voice = this.premiumVoiceFor(chunk.role, this.premiumVoices || {});
      const key = this.settings.engine + "|" + voice + "|" + chunk.text;
      if (!this.audioCache.has(key)) {
        const p = (window.lumenFetch || fetch)("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider: this.settings.engine, voice, text: chunk.text }),
        }).then(async (r) => {
          if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Erreur de synthèse vocale");
          return URL.createObjectURL(await r.blob());
        });
        p.catch(() => this.audioCache.delete(key));
        this.audioCache.set(key, p);
        if (this.audioCache.size > 60) {
          const oldest = this.audioCache.keys().next().value;
          this.audioCache.get(oldest).then((u) => URL.revokeObjectURL(u)).catch(() => {});
          this.audioCache.delete(oldest);
        }
      }
      return this.audioCache.get(key);
    }
    async runPremium(gen) {
      if (this.index >= this.items.length) return this.finish();
      const chunk = this.chunkFrom(this.index, this.state !== "playing");
      this.state = "loading";
      this.emit("state", this.state);
      let url;
      try {
        url = await this.fetchAudio(chunk);
      } catch (e) {
        if (gen !== this.gen) return;
        this.emit("error", e.message + " — passage aux voix du navigateur.");
        this.settings.engine = "browser";
        this.save();
        this.emit("settings");
        return this.runBrowser(gen);
      }
      if (gen !== this.gen) return;
      // Pré-chargement des deux morceaux suivants pour éviter les blancs.
      let n = chunk.end;
      for (let k = 0; k < 2 && n < this.items.length; k++) {
        const c = this.chunkFrom(n);
        this.fetchAudio(c).catch(() => {});
        n = c.end;
      }
      const a = this.audio;
      a.src = url;
      a.playbackRate = this.settings.rate;
      // Position approximative de la phrase en cours, au prorata des caractères.
      const bounds = [];
      let acc = 0;
      for (const p of chunk.parts) {
        bounds.push(acc);
        acc += p.text.trim().length + 1;
      }
      a.ontimeupdate = () => {
        if (gen !== this.gen || !a.duration) return;
        const pos = (a.currentTime / a.duration) * acc;
        let k = 0;
        while (k + 1 < bounds.length && bounds[k + 1] <= pos) k++;
        if (chunk.start + k !== this.index) {
          this.index = chunk.start + k;
          this.emit("item", this.index);
        }
      };
      a.onended = () => {
        if (gen !== this.gen) return;
        this.index = chunk.end;
        if (this.index >= this.items.length) return this.finish();
        this.emit("item", this.index);
        this.runPremium(gen);
      };
      try {
        await a.play();
        if (gen !== this.gen) return;
        this.state = "playing";
        this.emit("state", this.state);
      } catch (e) {
        if (gen !== this.gen) return;
        this.state = "paused";
        this.emit("state", this.state);
      }
    }

    /** Assemble tout l'audio premium en un seul MP3 (pour le podcast). */
    async exportMp3(onProgress) {
      const blobs = [];
      let i = 0;
      while (i < this.items.length) {
        const c = this.chunkFrom(i);
        const url = await this.fetchAudio(c);
        blobs.push(await (await fetch(url)).blob());
        i = c.end;
        onProgress?.(i / this.items.length);
      }
      return new Blob(blobs, { type: "audio/mpeg" });
    }

    // ----- contrôles système (écran verrouillé, casque…) -----
    setupMediaSession() {
      if (!("mediaSession" in navigator)) return;
      const ms = navigator.mediaSession;
      ms.setActionHandler("play", () => this.play());
      ms.setActionHandler("pause", () => this.pause());
      ms.setActionHandler("nexttrack", () => this.next());
      ms.setActionHandler("previoustrack", () => this.prev());
    }
    updateMediaSession() {
      if (!("mediaSession" in navigator) || !window.MediaMetadata) return;
      navigator.mediaSession.metadata = new MediaMetadata({ title: this.meta?.title || "Lumen", artist: "Lumen" });
    }
  }

  window.Narrator = Narrator;
  window.NarratorUtil = { sentences, detectLang, rankVoices, voiceQuality, browserVoices };
})();
