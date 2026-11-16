/* Formules mathématiques : affichage (KaTeX) et lecture à voix haute en mots.
 * Délimiteurs reconnus : $…$, $$…$$, \(…\), \[…\].
 */
(function () {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // $$…$$ | \[…\] | \(…\) | $…$ (pas de « $5 et $10 » : pas d'espace après le $ ouvrant ni avant le $ fermant)
  const MATH_RE = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|(?<![\\$\w])\$(?!\s)((?:\\\$|[^$\n])+?)(?<!\s)\$(?![\w$])/g;
  const hasMath = (t) => /\$|\\\(|\\\[/.test(t) && new RegExp(MATH_RE.source).test(t);

  function forEachMath(text, onText, onMath) {
    let last = 0;
    for (const m of text.matchAll(MATH_RE)) {
      if (m.index > last) onText(text.slice(last, m.index));
      const display = m[1] != null || m[2] != null;
      onMath((m[1] ?? m[2] ?? m[3] ?? m[4]).trim(), display, m[0]);
      last = m.index + m[0].length;
    }
    if (last < text.length) onText(text.slice(last));
  }

  // Commandes LaTeX absentes de KaTeX mais courantes en actuariat.
  const MACROS = {
    "\\prescript": "{}^{#1}_{#2}{#3}", // \prescript{}{t}{p}_x → ₜpₓ
    "\\sideset": "{}#1{#3}#2", // \sideset{_t}{_x}p
    "\\actsymb": "{}#1{#2}", // forme simplifiée
    "\\Var": "\\operatorname{Var}",
    "\\Cov": "\\operatorname{Cov}",
    "\\E": "\\mathbb{E}",
  };
  function tex(src, display) {
    if (!window.katex) return esc(display ? `$$${src}$$` : `$${src}$`);
    try {
      return katex.renderToString(src, {
        displayMode: display,
        throwOnError: false,
        strict: "ignore",
        trust: false,
        output: "htmlAndMathml",
        macros: { ...MACROS },
      });
    } catch {
      return `<code>${esc(src)}</code>`;
    }
  }

  /** Texte brut (non HTML) → HTML échappé, formules rendues. */
  function renderInline(text) {
    let out = "";
    forEachMath(String(text ?? ""), (t) => (out += esc(t)), (src, display) => (out += tex(src, display)));
    return out;
  }

  /** Markdown → HTML nettoyé, formules rendues (protégées de Markdown). */
  function renderMarkdown(md) {
    const code = [];
    const maths = [];
    // 1. le code n'est jamais interprété comme des formules
    let src = String(md || "").replace(/```[\s\S]*?(```|$)|`[^`\n]+`/g, (m) => `\u0000C${code.push(m) - 1}\u0000`);
    // 2. les formules sont mises de côté pour que Markdown ne les abîme pas (_ * \)
    src = src.replace(MATH_RE, (m, a, b, c, d) => {
      const display = a != null || b != null;
      const n = maths.push({ src: (a ?? b ?? c ?? d).trim(), display }) - 1;
      return display ? `KATEXBLOCK${n}KATEX` : `KATEXINLINE${n}KATEX`;
    });
    src = src.replace(/\u0000C(\d+)\u0000/g, (_, n) => code[n]);
    let html = DOMPurify.sanitize(marked.parse(src, { gfm: true }));
    // 3. on remet les formules rendues par KaTeX (sortie sûre, trust:false)
    html = html
      .replace(/<p>\s*KATEXBLOCK(\d+)KATEX\s*<\/p>/g, (_, n) => tex(maths[n].src, true))
      .replace(/KATEX(?:BLOCK|INLINE)(\d+)KATEX/g, (_, n) => tex(maths[n].src, maths[n].display));
    return html;
  }

  // ------------------------------------------------------------------
  // Lecture à voix haute : LaTeX → français parlé
  // ------------------------------------------------------------------
  const WORDS = {
    alpha: "alpha", beta: "bêta", gamma: "gamma", delta: "delta", epsilon: "epsilon", varepsilon: "epsilon", zeta: "zêta",
    eta: "êta", theta: "thêta", vartheta: "thêta", iota: "iota", kappa: "kappa", lambda: "lambda", mu: "mu", nu: "nu", xi: "ksi",
    pi: "pi", rho: "rhô", sigma: "sigma", tau: "tau", phi: "phi", varphi: "phi", chi: "khi", psi: "psi", omega: "oméga",
    Gamma: "gamma majuscule", Delta: "delta majuscule", Theta: "thêta majuscule", Lambda: "lambda majuscule", Pi: "pi majuscule",
    Sigma: "sigma majuscule", Phi: "phi majuscule", Psi: "psi majuscule", Omega: "oméga majuscule",
    times: "fois", cdot: "fois", div: "divisé par", pm: "plus ou moins", mp: "moins ou plus",
    leq: "inférieur ou égal à", le: "inférieur ou égal à", leqslant: "inférieur ou égal à", geq: "supérieur ou égal à", ge: "supérieur ou égal à",
    geqslant: "supérieur ou égal à", neq: "différent de", ne: "différent de", approx: "environ égal à", simeq: "environ égal à",
    sim: "équivalent à", equiv: "équivalent à", propto: "proportionnel à", ll: "très inférieur à", gg: "très supérieur à",
    infty: "l'infini", to: "tend vers", rightarrow: "tend vers", longrightarrow: "tend vers", mapsto: "associe",
    Rightarrow: "implique", implies: "implique", Leftarrow: "est impliqué par", Leftrightarrow: "équivaut à", iff: "équivaut à",
    in: "appartient à", notin: "n'appartient pas à", subset: "inclus dans", subseteq: "inclus dans", supset: "contient",
    cup: "union", cap: "inter", emptyset: "ensemble vide", varnothing: "ensemble vide", forall: "pour tout", exists: "il existe",
    neg: "non", land: "et", lor: "ou", wedge: "et", vee: "ou", partial: "d rond", nabla: "nabla", perp: "perpendiculaire à",
    parallel: "parallèle à", angle: "angle", degree: "degrés", circ: "rond", ldots: "etc.", cdots: "etc.", dots: "etc.",
    prime: "prime", ln: "logarithme népérien de", log: "logarithme de", exp: "exponentielle de", sin: "sinus de", cos: "cosinus de",
    tan: "tangente de", arcsin: "arc sinus de", arccos: "arc cosinus de", arctan: "arc tangente de", sinh: "sinus hyperbolique de",
    cosh: "cosinus hyperbolique de", max: "maximum de", min: "minimum de", det: "déterminant de", gcd: "PGCD de",
    mid: "divise", vert: "", Pr: "probabilité", P: "probabilité", Var: "variance", Cov: "covariance", E: "espérance",
    angln: "n", ddagger: "", dagger: "", "|": "norme", "%": "pour cent", "{": "", "}": "", ",": " ", ";": " ", ":": " ", "!": "", quad: " ", qquad: " ",
  };
  const SKIP = new Set(["left", "right", "big", "Big", "bigg", "Bigg", "displaystyle", "textstyle", "limits", "nolimits", "middle"]);
  const KEEP_ARG = new Set(["text", "mathrm", "mathbf", "mathit", "mathsf", "mathtt", "textbf", "textit", "operatorname", "boldsymbol", "mathcal", "mathbb", "mathfrak", "mbox"]);
  const SETS = { R: "R", N: "N", Z: "Z", Q: "Q", C: "C" };
  const OPS = { "+": "plus", "-": "moins", "=": "égal", "<": "inférieur à", ">": "supérieur à", "/": "sur", "*": "fois", "'": "prime", "!": "factorielle", "|": "", "&": "", "~": " " };
  const ENV_LABEL = { pmatrix: "matrice :", bmatrix: "matrice :", matrix: "matrice :", vmatrix: "déterminant :", cases: "", array: "tableau :" };
  const FUNCY = new Set(["psi", "phi", "varphi", "Phi", "Psi", "Gamma", "Pr", "P", "E", "Var", "Cov", "pi"]);
  const OPERATOR_NAMES = { var: "variance", cov: "covariance", corr: "corrélation", argmax: "argument du maximum", argmin: "argument du minimum" };

  function speakTex(s) {
    let i = 0;
    const env = []; // environnements ouverts (matrice, cas…)
    let subDepth = 0; // > 0 : on lit un indice (« m| » = différé)
    const ws = () => {
      while (i < s.length && /\s/.test(s[i])) i++;
    };
    function command() {
      i++; // backslash
      let name = "";
      if (/[a-zA-Z]/.test(s[i])) while (i < s.length && /[a-zA-Z]/.test(s[i])) name += s[i++];
      else name = s[i++] || "";
      return name;
    }
    /** Si une parenthèse ouvrante suit (éventuellement après \left), la consomme : « … de ». */
    function eatParen() {
      const m = /^(?:\s|\\[!,;:])*(?:\\left\s*)?[([]/.exec(s.slice(i));
      if (!m) return "";
      i += m[0].length;
      return " de";
    }
    function rawGroup() {
      ws();
      if (s[i] !== "{") return "";
      let depth = 0, out = "";
      for (; i < s.length; i++) {
        if (s[i] === "{" && depth++ === 0) continue;
        if (s[i] === "}" && --depth === 0) {
          i++;
          break;
        }
        out += s[i];
      }
      return out.trim();
    }
    function group() {
      ws();
      if (s[i] === "{") {
        i++;
        const out = seq("}");
        i++;
        return out;
      }
      return atom();
    }
    function bounds() {
      // _{a}^{b} ou ^{b}_{a} après somme / intégrale / limite
      let lo = "", hi = "";
      for (let k = 0; k < 2; k++) {
        ws();
        if (s[i] === "_") (i++, (lo = group()));
        else if (s[i] === "^") (i++, (hi = group()));
      }
      return { lo, hi };
    }
    function atom() {
      ws();
      const c = s[i];
      if (c == null) return "";
      if (c === "\\") {
        const name = command();
        if (SKIP.has(name)) return "";
        if (name === "frac" || name === "dfrac" || name === "tfrac") {
          const a = group(), b = group();
          return /\s/.test(a.trim()) || /\s/.test(b.trim()) ? `fraction : ${a}, sur ${b},` : `${a} sur ${b}`;
        }
        if (name === "sqrt") {
          ws();
          let n = "";
          if (s[i] === "[") {
            const j = s.indexOf("]", i);
            n = speakTex(s.slice(i + 1, j));
            i = j + 1;
          }
          const x = group();
          return n === "3" ? `racine cubique de ${x}` : n ? `racine ${n}-ième de ${x}` : `racine carrée de ${x}`;
        }
        if (name === "sum" || name === "prod") {
          const { lo, hi } = bounds();
          const w = name === "sum" ? "somme" : "produit";
          return lo || hi ? `${w} pour ${lo.replace(" égal ", " allant de ")}${hi ? ` à ${hi}` : ""} de` : `${w} de`;
        }
        if (name === "int" || name === "iint" || name === "oint") {
          const { lo, hi } = bounds();
          return lo || hi ? `intégrale de ${lo} à ${hi} de` : "intégrale de";
        }
        if (name === "lim") {
          const { lo } = bounds();
          return lo ? `limite quand ${lo} de` : "limite de";
        }
        if (name === "vec" || name === "overrightarrow") return `vecteur ${group()}`;
        if (name === "overline") {
          // \overline{n}| : durée n (angle actuariel) — on lit simplement « n »
          const x = group();
          ws();
          if (s[i] === "|") return (i++, x);
          return `${x} barre`;
        }
        if (name === "angl") return group();
        if (name === "bar") return `${group()} barre`;
        if (name === "ddot") return `${group()} double point`;
        if (name === "tilde") return `${group()} tilde`;
        if (name === "prescript") {
          const sup = group(), sub = group(), base = group();
          return `${sub ? sub + " " : ""}${base}${sup ? " exposant " + sup : ""}`;
        }
        if (name === "sideset") {
          const clean = (x) => speakTex(x.replace(/[_^]/g, " "));
          const left = clean(rawGroup()), right = clean(rawGroup()), base = group();
          return `${left} ${base} ${right}`;
        }
        if (name === "operatorname") {
          const x = rawGroup().replace(/\s/g, "");
          const word = OPERATOR_NAMES[x.toLowerCase()];
          return word ? `${word}${eatParen() || " de"}` : speakTex(x);
        }
        if (name === "mathbb" && /^\s*\{?\s*E\s*\}?/.test(s.slice(i))) {
          group();
          return `espérance de${eatParen() && ""}`;
        }
        if (name === "hat") return `${group()} chapeau`;
        if (name === "dot") return `${group()} point`;
        if (name === "binom") return `${group()} parmi ${group()}`;
        if (name === "mathbb") {
          const x = group();
          return SETS[x.trim()] || x;
        }
        if (KEEP_ARG.has(name)) return group();
        if (name === "begin") {
          const e = rawGroup().replace("*", "");
          env.push(e);
          if (e === "array") rawGroup(); // spécification des colonnes
          return ENV_LABEL[e] ?? "";
        }
        if (name === "end") return (rawGroup(), env.pop(), "");
        if (name === "\\") return ", ";
        if (FUNCY.has(name)) return `${WORDS[name] ?? name}${eatParen()}`;
        // exp(…), ln(…), sin(…) : le mot contient déjà « de », la parenthèse est muette
        if (/ de$/.test(WORDS[name] || "")) return (eatParen(), WORDS[name]);
        return WORDS[name] ?? name;
      }
      if (c === "{") return group();
      if (/\d/.test(c)) {
        let n = "";
        while (i < s.length && /[\d.,]/.test(s[i])) n += s[i++];
        return n.replace(/[.,]$/, "").replace(".", ",");
      }
      i++;
      if (/[a-zA-ZÀ-ÿ]/.test(c)) {
        // f(x) → « f de x »
        if (/[fghuvwPQRF]/.test(c) && s[i] === "(") return (i++, `${c} de`);
        return c;
      }
      if (c === "(") return "parenthèse";
      if (c === "[" || c === ")" || c === "]") return "";
      if (c === "&") {
        const e = env[env.length - 1];
        return e === "cases" ? "si" : /matrix|array/.test(e || "") ? "," : "";
      }
      if (c === "|" && subDepth > 0) return "différé"; // ₘ|qₓ
      if (c === ":" && subDepth > 0) return ""; // x:n
      return OPS[c] ?? c;
    }
    function item() {
      const start = i;
      let base = atom();
      // {}_t p_x : indice placé à gauche (notation actuarielle) → « t p x »
      const leftIndex = !base.trim() && s.slice(start, i).replace(/\s/g, "") === "{}";
      for (;;) {
        ws();
        if (s[i] === "^") {
          i++;
          const e = group().trim();
          if (leftIndex && !base.trim()) base = `${e} `;
          else if (/^parenthèse /.test(e)) base += ` exposant ${e.replace(/^parenthèse /, "")}`; // i^{(m)}
          else if (/^[A-Z]$/.test(base.trim()) && /^[12]$/.test(e)) base += ` exposant ${e}`; // A^1_{x:n}
          else
            base +=
              e === "2" ? " au carré" : e === "3" ? " au cube" : e === "prime" || e === "'" ? " prime" : e === "moins 1" ? " puissance moins 1" : ` puissance ${e}`;
        } else if (s[i] === "_") {
          i++;
          subDepth++;
          const sub = group().trim();
          subDepth--;
          if (leftIndex && !base.trim()) base = `${sub} `;
          else base += ` indice ${sub}`;
        } else break;
      }
      return base;
    }
    function seq(end) {
      const parts = [];
      let guard = 0;
      while (i < s.length && s[i] !== end && guard++ < 5000) {
        const a = item();
        if (a && a.trim()) parts.push(a.trim());
      }
      return parts.join(" ");
    }
    return seq(undefined).replace(/\s+/g, " ").replace(/\s+([,.])/g, "$1").trim();
  }

  const UNICODE = [
    [/√\s*/g, " racine carrée de "], [/∛\s*/g, " racine cubique de "], [/∑/g, " somme "], [/∏/g, " produit "], [/∫/g, " intégrale "],
    [/∞/g, " l'infini "], [/≤|⩽/g, " inférieur ou égal à "], [/≥|⩾/g, " supérieur ou égal à "], [/≠/g, " différent de "], [/≈/g, " environ égal à "],
    [/×/g, " fois "], [/÷/g, " divisé par "], [/±/g, " plus ou moins "], [/→/g, " tend vers "], [/⇒/g, " implique "], [/⇔/g, " équivaut à "],
    [/∈/g, " appartient à "], [/∉/g, " n'appartient pas à "], [/⊂|⊆/g, " inclus dans "], [/∪/g, " union "], [/∩/g, " inter "], [/∀/g, " pour tout "],
    [/∃/g, " il existe "], [/∅/g, " ensemble vide "], [/∂/g, " d rond "], [/Δ/g, " delta "], [/π/g, " pi "], [/θ/g, " thêta "], [/α/g, " alpha "],
    [/β/g, " bêta "], [/λ/g, " lambda "], [/μ/g, " mu "], [/σ/g, " sigma "], [/ω/g, " oméga "], [/²/g, " au carré"], [/³/g, " au cube"],
    [/\s=\s/g, " égal "], [/−/g, " moins "], [/ℝ/g, " R "], [/ℕ/g, " N "], [/ℤ/g, " Z "], [/ℚ/g, " Q "], [/ℂ/g, " C "],
  ];

  /** Phrase à lire : formules converties en mots. */
  function toSpeech(text) {
    let out = "";
    forEachMath(String(text ?? ""), (t) => (out += t), (src) => (out += ` ${speakTex(src)} `));
    for (const [re, w] of UNICODE) out = out.replace(re, w);
    return out.replace(/[ \t]{2,}/g, " ").replace(/,\s*([.;:!?])/g, "$1").replace(/\s+([,.;:!?])/g, "$1").trim();
  }

  /** Remplace les formules rendues (KaTeX) d'un fragment HTML par leur lecture en mots. */
  function speakRendered(root) {
    root.querySelectorAll(".katex-display, .katex").forEach((k) => {
      if (!k.isConnected) return;
      const src = k.querySelector('annotation[encoding="application/x-tex"]')?.textContent || "";
      k.replaceWith(document.createTextNode(` ${speakTex(src)} `));
    });
  }

  // ------------------------------------------------------------------
  // LaTeX → texte Unicode (pour PowerPoint, qui ne comprend pas le LaTeX)
  // ------------------------------------------------------------------
  const SUP = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹", "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾",
    a: "ᵃ", b: "ᵇ", c: "ᶜ", d: "ᵈ", e: "ᵉ", f: "ᶠ", g: "ᵍ", h: "ʰ", i: "ⁱ", j: "ʲ", k: "ᵏ", l: "ˡ", m: "ᵐ", n: "ⁿ", o: "ᵒ", p: "ᵖ", r: "ʳ", s: "ˢ",
    t: "ᵗ", u: "ᵘ", v: "ᵛ", w: "ʷ", x: "ˣ", y: "ʸ", z: "ᶻ", "*": "*", "′": "′", " ": "" };
  const SUB = { 0: "₀", 1: "₁", 2: "₂", 3: "₃", 4: "₄", 5: "₅", 6: "₆", 7: "₇", 8: "₈", 9: "₉", "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎",
    a: "ₐ", e: "ₑ", h: "ₕ", i: "ᵢ", j: "ⱼ", k: "ₖ", l: "ₗ", m: "ₘ", n: "ₙ", o: "ₒ", p: "ₚ", r: "ᵣ", s: "ₛ", t: "ₜ", u: "ᵤ", v: "ᵥ", x: "ₓ", " ": "", ",": "," };
  const UNI = {
    alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", vartheta: "ϑ", iota: "ι",
    kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ", phi: "φ", varphi: "φ", chi: "χ", psi: "ψ",
    omega: "ω", Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
    times: "×", cdot: "·", div: "÷", pm: "±", mp: "∓", leq: "≤", le: "≤", leqslant: "≤", geq: "≥", ge: "≥", geqslant: "≥", neq: "≠", ne: "≠",
    approx: "≈", simeq: "≃", sim: "∼", equiv: "≡", propto: "∝", ll: "≪", gg: "≫", infty: "∞", to: "→", rightarrow: "→", longrightarrow: "⟶",
    mapsto: "↦", Rightarrow: "⇒", implies: "⇒", Leftarrow: "⇐", Leftrightarrow: "⇔", iff: "⇔", in: "∈", notin: "∉", subset: "⊂", subseteq: "⊆",
    supset: "⊃", cup: "∪", cap: "∩", emptyset: "∅", varnothing: "∅", forall: "∀", exists: "∃", neg: "¬", land: "∧", lor: "∨", wedge: "∧",
    vee: "∨", partial: "∂", nabla: "∇", perp: "⊥", parallel: "∥", angle: "∠", circ: "∘", ldots: "…", cdots: "⋯", dots: "…", prime: "′",
    sum: "Σ", prod: "Π", int: "∫", iint: "∬", oint: "∮", lim: "lim", ln: "ln", log: "log", exp: "exp", sin: "sin", cos: "cos", tan: "tan",
    max: "max", min: "min", det: "det", Pr: "Pr", mid: "∣", vert: "|", quad: "  ", qquad: "    ", ",": " ", ";": " ", ":": " ", "!": "",
    "{": "{", "}": "}", "%": "%", "&": "&", _: "_", angln: "n⌉", degree: "°", Var: "Var", Cov: "Cov", E: "𝔼",
  };
  const BB = { R: "ℝ", N: "ℕ", Z: "ℤ", Q: "ℚ", C: "ℂ", E: "𝔼", P: "ℙ" };
  const ACCENT = { ddot: "̈", dot: "̇", bar: "̄", hat: "̂", tilde: "̃", vec: "⃗", check: "̌" };
  const script = (txt, map, mark) => {
    const t = txt.trim();
    if ([...t].every((ch) => map[ch] !== undefined)) return [...t].map((ch) => map[ch]).join("");
    return `${mark}(${t})`;
  };
  function toUnicode(src) {
    let s = String(src || "");
    const arg = "\\{((?:[^{}]|\\{[^{}]*\\})*)\\}"; // un niveau d'accolades imbriquées
    const R = (re) => new RegExp(re, "g");
    for (let k = 0; k < 6; k++) {
      const before = s;
      s = s
        .replace(R(`\\\\(?:operatorname|text|mathrm|mathbf|mathit|mathsf|textbf|textit|mbox|boldsymbol|mathcal)\\s*${arg}`), "$1")
        .replace(R(`\\\\mathbb\\s*\\{?\\s*([A-Z])\\s*\\}?`), (_, L) => BB[L] || L)
        .replace(R(`\\\\overline\\s*${arg}\\s*\\|`), "$1⌉")
        .replace(R(`\\\\angl\\s*${arg}`), "$1⌉")
        .replace(R(`\\\\(ddot|dot|bar|hat|tilde|vec|check)\\s*(?:${arg}|([A-Za-z]))`), (_, a, g, l) => (g ?? l) + ACCENT[a])
        .replace(R(`\\\\overline\\s*${arg}`), (_, g) => [...g].map((ch) => ch + "̅").join(""))
        .replace(R(`\\\\[dt]?frac\\s*${arg}\\s*${arg}`), (_, a, b) => {
          // une seule « unité » (lettre, nombre, commande, avec indices/exposants) → pas de parenthèses
          const unit = /^(?:[\p{L}\d]|\\[a-zA-Z]+|\d+(?:[.,]\d+)?)(?:\s*[_^]\s*(?:\{[^{}]*\}|\w))*$/u;
          const wrap = (x) => (unit.test(x.trim()) ? x.trim() : `(${x.trim()})`);
          return `${wrap(a)}/${wrap(b)}`;
        })
        .replace(R(`\\\\binom\\s*${arg}\\s*${arg}`), "C($1, $2)")
        .replace(R(`\\\\sqrt\\s*\\[([^\\]]+)\\]\\s*${arg}`), (_, n, x) => `${script(n, SUP, "^")}√(${x})`)
        .replace(R(`\\\\sqrt\\s*${arg}`), (_, x) => (/^(?:[\p{L}\d]|\\[a-zA-Z]+)$/u.test(x.trim()) ? `√${x.trim()}` : `√(${x})`))
        .replace(R(`\\\\prescript\\s*${arg}\\s*${arg}\\s*${arg}`), (_, sup, sub, base) => `${sup ? script(sup, SUP, "^") : ""}${script(sub, SUB, "_")}${base}`);
      if (s === before) break;
    }
    s = s
      .replace(/\\(begin|end)\s*\{[^}]*\}(\{[^}]*\})?/g, "")
      .replace(/\\\\/g, " ; ")
      .replace(/&/g, " ")
      .replace(/\\(left|right|big|Big|bigg|Bigg|displaystyle|textstyle|limits|nolimits)\b\s*/g, "")
      .replace(/\{\}\s*_\s*(?:\{([^{}]*)\}|(\w))/g, (_, g, l) => script(g ?? l, SUB, "_")) // {}_t p_x → ₜpₓ
      .replace(/\^\s*(?:\{([^{}]*)\}|(\\?\w+|.))/g, (_, g, l) => script((g ?? l).replace(/\\prime/g, "′"), SUP, "^"))
      .replace(/_\s*(?:\{([^{}]*)\}|(\w|.))/g, (_, g, l) => script(g ?? l, SUB, "_"))
      .replace(/\\([a-zA-Z]+|.)/g, (m, name) => UNI[name] ?? name)
      .replace(/[{}]/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    return s;
  }
  /** Texte avec $…$ → texte simple où les formules sont en Unicode. */
  const textToUnicode = (text) => {
    let out = "";
    forEachMath(String(text ?? ""), (t) => (out += t), (src) => (out += toUnicode(src)));
    return out;
  };

  window.MathText = { renderInline, renderMarkdown, toSpeech, speakTex, speakRendered, hasMath, MATH_RE, toUnicode, textToUnicode };
})();
