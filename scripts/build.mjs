// Prépare public/vendor : bibliothèques utilisées par l'interface (sans CDN).
import { build } from "esbuild";
import { copyFile, mkdir, readdir } from "node:fs/promises";

const out = "public/vendor";
await mkdir(out, { recursive: true });
const copies = {
  "node_modules/marked/lib/marked.umd.js": "marked.js",
  "node_modules/dompurify/dist/purify.min.js": "purify.js",
  "node_modules/pdfjs-dist/build/pdf.min.mjs": "pdf.min.mjs",
  "node_modules/pdfjs-dist/build/pdf.worker.min.mjs": "pdf.worker.min.mjs",
  "node_modules/mammoth/mammoth.browser.min.js": "mammoth.js",
};
for (const [from, to] of Object.entries(copies)) await copyFile(from, `${out}/${to}`);
await build({
  entryPoints: ["src/identity.js"],
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  outfile: `${out}/identity.js`,
});
// Voix Piper : bibliothèque regroupée + moteur ONNX (fichiers WebAssembly) hébergés avec le site.
await build({
  entryPoints: ["src/piper.js"],
  bundle: true,
  minify: true,
  format: "esm",
  target: "es2020",
  outfile: `${out}/piper.js`,
  external: ["fs", "path", "crypto", "worker_threads", "url", "module"], // branches Node.js jamais exécutées dans le navigateur
  logLevel: "warning",
});
await mkdir(`${out}/ort`, { recursive: true });
const ortDist = "node_modules/onnxruntime-web/dist";
for (const f of await readdir(ortDist)) {
  if (/^ort-wasm-simd-threaded\.(mjs|wasm)$/.test(f)) await copyFile(`${ortDist}/${f}`, `${out}/ort/${f}`);
}
console.log("public/vendor prêt");
