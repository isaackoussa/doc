// Voix naturelles gratuites (Piper) calculées dans le navigateur.
// Les modèles (≈ 30 à 60 Mo par voix) sont téléchargés une seule fois depuis
// Hugging Face puis gardés dans le stockage du navigateur (OPFS).
import { TtsSession, stored } from "@mintplex-labs/piper-tts-web";

const WASM_PATHS = {
  onnxWasm: "/vendor/ort/",
  piperData: "https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize.data",
  piperWasm: "https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize.wasm",
};

const sessions = new Map(); // voiceId → Promise<TtsSession>
let queue = Promise.resolve();

function sessionFor(voiceId, onProgress) {
  if (!sessions.has(voiceId)) {
    // La bibliothèque réutilise sinon la première session (et donc la première voix).
    TtsSession._instance = null;
    const p = TtsSession.create({ voiceId, wasmPaths: WASM_PATHS, progress: onProgress });
    TtsSession._instance = null;
    p.catch(() => sessions.delete(voiceId));
    sessions.set(voiceId, p);
  }
  return sessions.get(voiceId);
}

/** Synthèse d'un texte → Blob WAV. Les demandes passent une par une. */
export function synth(voiceId, text, onProgress) {
  const run = queue.then(async () => (await sessionFor(voiceId, onProgress)).predict(text));
  queue = run.catch(() => {});
  return run;
}

/** Voix déjà téléchargées sur cet appareil. */
export async function downloaded() {
  try {
    return await stored();
  } catch {
    return [];
  }
}

export const supported = () => typeof WebAssembly === "object" && !!navigator.storage?.getDirectory;
