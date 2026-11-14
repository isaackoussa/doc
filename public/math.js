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

  function tex(src, display) {
    if (!window.katex) return esc(display ? `$$${src}$$` : `$${src}$`);
    try {
      return katex.renderToString(src, { displayMode: display, throwOnError: false, strict: "ignore", trust: false, output: "htmlAndMathml" });
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
    mid: "divise", vert: "", "|": "norme", "%": "pour cent", "{": "", "}": "", ",": " ", ";": " ", ":": " ", "!": "", quad: " ", qquad: " ",
  };
  const SKIP = new Set(["left", "right", "big", "Big", "bigg", "Bigg", "displaystyle", "textstyle", "limits", "nolimits", "middle"]);
  const KEEP_ARG = new Set(["text", "mathrm", "mathbf", "mathit", "mathsf", "mathtt", "textbf", "textit", "operatorname", "boldsymbol", "mathcal", "mathbb", "mathfrak", "mbox"]);
  const SETS = { R: "R", N: "N", Z: "Z", Q: "Q", C: "C" };
  const OPS = { "+": "plus", "-": "moins", "=": "égal", "<": "inférieur à", ">": "supérieur à", "/": "sur", "*": "fois", "'": "prime", "!": "factorielle", "|": "", "&": "", "~": " " };

  function speakTex(s) {
    let i = 0;
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
        if (name === "overline" || name === "bar") return `${group()} barre`;
        if (name === "hat") return `${group()} chapeau`;
        if (name === "dot") return `${group()} point`;
        if (name === "binom") return `${group()} parmi ${group()}`;
        if (name === "mathbb") {
          const x = group();
          return SETS[x.trim()] || x;
        }
        if (KEEP_ARG.has(name)) return group();
        if (name === "begin" || name === "end") return (group(), "");
        if (name === "\\") return ", ";
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
      if (c === "(" || c === "[") return "parenthèse";
      if (c === ")" || c === "]") return "";
      return OPS[c] ?? c;
    }
    function item() {
      let base = atom();
      for (;;) {
        ws();
        if (s[i] === "^") {
          i++;
          const e = group().trim();
          base +=
            e === "2" ? " au carré" : e === "3" ? " au cube" : e === "prime" || e === "'" ? " prime" : e === "moins 1" ? " puissance moins 1" : ` puissance ${e}`;
        } else if (s[i] === "_") {
          i++;
          base += ` indice ${group().trim()}`;
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

  window.MathText = { renderInline, renderMarkdown, toSpeech, speakTex, speakRendered, hasMath, MATH_RE };
})();
