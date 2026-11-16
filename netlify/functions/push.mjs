// Abonnement aux notifications (une entrée par appareil) et notification de test.
import { handle, json, body, requireUser, HttpError } from "../lib/http.mjs";
import { vapidKeys, addSub, removeSub, notifyUser, listSubs } from "../lib/push.mjs";

export default handle(async (req, context) => {
  const action = context.params.action;
  if (action === "key" && req.method === "GET") return json({ publicKey: (await vapidKeys()).publicKey });

  const user = await requireUser();
  if (action === "status" && req.method === "POST") {
    const b = await body(req);
    const subs = await listSubs(user.id);
    return json({ subscribed: subs.some((s) => s.endpoint === b.endpoint), devices: subs.length });
  }
  if (action === "subscribe" && req.method === "POST") {
    const devices = await addSub(user.id, (await body(req)).subscription);
    return json({ ok: true, devices });
  }
  if (action === "unsubscribe" && req.method === "POST") {
    await removeSub(user.id, String((await body(req)).endpoint || ""));
    return json({ ok: true });
  }
  if (action === "test" && req.method === "POST") {
    const sent = await notifyUser(user.id, {
      title: "Lumen",
      body: "Les notifications fonctionnent : vous serez prévenu(e) quand une tâche sera terminée.",
      tag: "lumen-test",
      url: "/",
    });
    return json({ sent });
  }
  throw new HttpError(404, "Action inconnue");
});

export const config = { path: "/api/push/:action" };
