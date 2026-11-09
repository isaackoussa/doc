// Configuration publique : IA et voix disponibles, outils du studio.
import { aiEnabled, MODEL, STUDIO } from "../lib/ai.mjs";
import { listVoices, ttsProviders } from "../lib/tts.mjs";
import { handle, json, devUser } from "../lib/http.mjs";

export default handle(async () =>
  json({
    ai: aiEnabled(),
    model: MODEL,
    tts: ttsProviders(),
    voices: await listVoices(),
    devUser: devUser()?.email || null,
    studio: Object.fromEntries(Object.entries(STUDIO).map(([k, v]) => [k, { label: v.label }])),
  }),
);

export const config = { path: "/api/config", method: "GET" };
