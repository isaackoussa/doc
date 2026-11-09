// Discussion avec les sources : réponse streamée, puis blocs finaux avec citations.
import { chat } from "../lib/ai.mjs";
import { handle, body, requireUser, humanError, HttpError } from "../lib/http.mjs";
import { aiEnabled } from "../lib/ai.mjs";
import { loadDocs } from "../lib/storage.mjs";

export default handle(async (req) => {
  const user = await requireUser();
  if (!aiEnabled()) throw new HttpError(503, "L'IA n'est pas configurée (ANTHROPIC_API_KEY).");
  const b = await body(req);
  const docs = await loadDocs(user.id, b.docIds);
  const history = (b.messages || [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-30);
  if (!history.length || history[0].role !== "user" || history.at(-1).role !== "user")
    throw new HttpError(400, "Conversation invalide");

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
      try {
        const blocks = await chat(docs, history, (t) => send({ type: "text", text: t }));
        send({ type: "done", blocks });
      } catch (e) {
        console.error(e);
        send({ type: "error", error: humanError(e) });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache" } });
});

export const config = { path: "/api/chat", method: "POST" };
