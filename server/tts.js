// Voix premium : OpenAI (gpt-4o-mini-tts) ou ElevenLabs, si une clé est configurée.
// Sans clé, l'application utilise les voix du navigateur (gratuites, hors-ligne).

const OPENAI_VOICES = [
  { id: "coral", name: "Coral (chaleureuse)" },
  { id: "nova", name: "Nova (claire)" },
  { id: "shimmer", name: "Shimmer (douce)" },
  { id: "sage", name: "Sage (posée)" },
  { id: "ballad", name: "Ballad (expressive)" },
  { id: "alloy", name: "Alloy (neutre)" },
  { id: "ash", name: "Ash (grave)" },
  { id: "onyx", name: "Onyx (profonde)" },
  { id: "echo", name: "Echo (masculine)" },
  { id: "fable", name: "Fable (narrative)" },
  { id: "verse", name: "Verse (dynamique)" },
];

export function ttsProviders() {
  const list = [];
  if (process.env.ELEVENLABS_API_KEY) list.push("elevenlabs");
  if (process.env.OPENAI_API_KEY) list.push("openai");
  return list;
}

let elevenVoicesCache = null;
async function elevenVoices() {
  if (elevenVoicesCache) return elevenVoicesCache;
  const r = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY },
  });
  if (!r.ok) throw new Error(`ElevenLabs : ${r.status}`);
  const data = await r.json();
  elevenVoicesCache = (data.voices || []).map((v) => ({
    id: v.voice_id,
    name: `${v.name}${v.labels?.gender ? ` (${v.labels.gender === "female" ? "F" : v.labels.gender === "male" ? "H" : v.labels.gender})` : ""}`,
  }));
  return elevenVoicesCache;
}

export async function listVoices() {
  const out = {};
  if (process.env.ELEVENLABS_API_KEY) {
    try {
      out.elevenlabs = await elevenVoices();
    } catch (e) {
      out.elevenlabs = [];
      console.warn(e.message);
    }
  }
  if (process.env.OPENAI_API_KEY) out.openai = OPENAI_VOICES;
  return out;
}

/** Renvoie un Buffer MP3. */
export async function synthesize({ provider, voice, text, style }) {
  text = String(text || "").slice(0, 4000);
  if (!text.trim()) throw Object.assign(new Error("Texte vide"), { status: 400 });

  if (provider === "elevenlabs" && process.env.ELEVENLABS_API_KEY) {
    const voices = await elevenVoices();
    const voiceId = voice || voices[0]?.id;
    const r = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          model_id: process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2",
          voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.2 },
        }),
      },
    );
    if (!r.ok) throw Object.assign(new Error(`ElevenLabs : ${r.status} ${await r.text()}`), { status: 502 });
    return Buffer.from(await r.arrayBuffer());
  }

  if (provider === "openai" && process.env.OPENAI_API_KEY) {
    const r = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
        voice: voice || "coral",
        input: text,
        response_format: "mp3",
        instructions:
          style ||
          "Lis ce texte de façon naturelle, claire et chaleureuse, comme un bon narrateur de livre audio. Respecte la ponctuation et la langue du texte.",
      }),
    });
    if (!r.ok) throw Object.assign(new Error(`OpenAI : ${r.status} ${await r.text()}`), { status: 502 });
    return Buffer.from(await r.arrayBuffer());
  }

  throw Object.assign(new Error("Aucune voix premium configurée."), { status: 400 });
}
