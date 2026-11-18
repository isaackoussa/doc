// Configuration publique : IA et voix disponibles, outils du studio.
import { aiEnabled, provider, modelName, STUDIO } from "../lib/ai.mjs";
import { listVoices, ttsProviders } from "../lib/tts.mjs";
import { info as slidesInfo } from "../lib/slides-ai.mjs";
import { handle, json, devUser } from "../lib/http.mjs";
import { count as geminiKeys } from "../lib/keys.mjs";

export default handle(async () =>
  json({
    ai: aiEnabled(),
    provider: provider(),
    model: modelName(),
    tts: ttsProviders(),
    voices: await listVoices(),
    devUser: devUser()?.email || null,
    geminiKeys: geminiKeys(), // nombre de clés seulement, jamais leurs valeurs
    slidesAI: slidesInfo(),
    studio: Object.fromEntries(Object.entries(STUDIO).map(([k, v]) => [k, { label: v.label }])),
  }),
);

export const config = { path: "/api/config", method: "GET" };
