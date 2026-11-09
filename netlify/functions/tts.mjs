// Voix premium (ElevenLabs / OpenAI) — réservé aux utilisateurs connectés.
import { synthesize } from "../lib/tts.mjs";
import { handle, body, requireUser } from "../lib/http.mjs";

export default handle(async (req) => {
  await requireUser();
  const audio = await synthesize(await body(req));
  return new Response(audio, { headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=86400" } });
});

export const config = { path: "/api/tts", method: "POST" };
