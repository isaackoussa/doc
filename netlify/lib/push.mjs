// Notifications « push » : prévenir l'utilisateur quand une tâche est terminée,
// même si l'app est fermée. Les clés VAPID sont créées automatiquement au premier
// usage et gardées dans Netlify Blobs : rien à configurer.
import * as webpush from "web-push";
import { getStore } from "@netlify/blobs";

const configStore = () => getStore({ name: "app-config", consistency: "strong" });
const subsStore = () => getStore({ name: "push-subscriptions", consistency: "strong" });

let keysPromise = null;
export function vapidKeys() {
  keysPromise ||= (async () => {
    const store = configStore();
    let keys = await store.get("vapid", { type: "json" });
    if (!keys) {
      const fresh = webpush.generateVAPIDKeys();
      const { modified } = await store.setJSON("vapid", fresh, { onlyIfNew: true });
      keys = modified ? fresh : await store.get("vapid", { type: "json" });
    }
    return keys;
  })();
  keysPromise.catch(() => (keysPromise = null));
  return keysPromise;
}

const validSub = (s) =>
  s && typeof s.endpoint === "string" && /^https:\/\//.test(s.endpoint) && s.keys && typeof s.keys.p256dh === "string" && typeof s.keys.auth === "string";

export async function listSubs(uid) {
  return (await subsStore().get(uid, { type: "json" })) || [];
}
export async function addSub(uid, sub) {
  if (!validSub(sub)) throw Object.assign(new Error("Abonnement invalide"), { status: 400 });
  const subs = (await listSubs(uid)).filter((s) => s.endpoint !== sub.endpoint);
  subs.push({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, addedAt: new Date().toISOString() });
  await subsStore().setJSON(uid, subs.slice(-10)); // 10 appareils maximum
  return subs.length;
}
export async function removeSub(uid, endpoint) {
  const subs = (await listSubs(uid)).filter((s) => s.endpoint !== endpoint);
  await subsStore().setJSON(uid, subs);
}

/** Envoie une notification à tous les appareils de l'utilisateur. Ne lève jamais d'erreur. */
export async function notifyUser(uid, payload) {
  try {
    const subs = await listSubs(uid);
    if (!subs.length) return 0;
    const keys = await vapidKeys();
    const subject = /^https:\/\//.test(process.env.URL || "") ? process.env.URL : "mailto:notifications@lumen.invalid";
    webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey);
    const dead = [];
    let sent = 0;
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(s, JSON.stringify(payload), { TTL: 60 * 60 * 24, urgency: "high" });
          sent++;
        } catch (e) {
          // 404 / 410 : l'appareil s'est désabonné (ou l'app a été désinstallée)
          if (e?.statusCode === 404 || e?.statusCode === 410) dead.push(s.endpoint);
          else console.warn("Notification non envoyée :", e?.statusCode, e?.body || e?.message);
        }
      }),
    );
    if (dead.length) await subsStore().setJSON(uid, subs.filter((s) => !dead.includes(s.endpoint)));
    return sent;
  } catch (e) {
    console.warn("Notifications indisponibles :", e?.message);
    return 0;
  }
}

/** Texte de la notification pour un résultat du studio. */
export const READY = {
  summary: "Votre résumé est prêt",
  keypoints: "Vos points clés sont prêts",
  explain: "Votre explication est prête",
  studyguide: "Votre guide d'étude est prêt",
  faq: "Votre FAQ est prête",
  glossary: "Votre glossaire est prêt",
  timeline: "Votre chronologie est prête",
  quiz: "Votre quiz est prêt",
  flashcards: "Vos fiches sont prêtes",
  mindmap: "Votre carte mentale est prête",
  podcast: "Votre podcast est prêt",
  slides: "Votre présentation est prête",
};
