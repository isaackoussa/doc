/* Notifications : prévenir quand une tâche est terminée (même app fermée).
 * - Notifications « push » envoyées par le serveur à la fin des tâches du studio.
 * - Notifications locales pour ce qui se passe dans la page (import de documents).
 */
(function () {
  const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = () => navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;

  let regPromise = null;
  function register() {
    if (!("serviceWorker" in navigator)) return Promise.resolve(null);
    regPromise ||= navigator.serviceWorker.register("/sw.js").catch((e) => {
      console.warn("Service worker non enregistré :", e);
      return null;
    });
    return regPromise;
  }

  function keyToBytes(base64) {
    const pad = "=".repeat((4 - (base64.length % 4)) % 4);
    const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  }

  async function currentSub() {
    const reg = await register();
    return reg ? reg.pushManager.getSubscription() : null;
  }

  /**
   * « unsupported » | « ios-install » (iPhone : ajouter d'abord à l'écran d'accueil)
   * | « denied » | « on » | « off »
   */
  async function status(fetchFn = fetch) {
    if (!supported()) return isIOS() && !standalone() ? "ios-install" : "unsupported";
    if (Notification.permission === "denied") return "denied";
    const sub = await currentSub();
    if (!sub || Notification.permission !== "granted") return "off";
    try {
      const r = await fetchFn("/api/push/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      const j = await r.json();
      if (!j.subscribed) {
        // abonnement local oublié par le serveur : on le renvoie
        await fetchFn("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON() }) });
      }
    } catch {}
    return "on";
  }

  /** À appeler depuis un clic (le navigateur l'exige pour demander l'autorisation). */
  async function enable(fetchFn = fetch) {
    if (!supported()) throw new Error(isIOS() && !standalone() ? "Sur iPhone, ajoutez d'abord Lumen à l'écran d'accueil." : "Ce navigateur ne gère pas les notifications.");
    const perm = await Notification.requestPermission();
    if (perm !== "granted") throw new Error("Notifications refusées. Vous pouvez les autoriser dans les réglages du navigateur.");
    const reg = await register();
    if (!reg) throw new Error("Impossible d'activer les notifications sur ce navigateur.");
    await navigator.serviceWorker.ready;
    const { publicKey } = await (await fetchFn("/api/push/key")).json();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) });
    const r = await fetchFn("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Abonnement impossible");
    return "on";
  }

  async function disable(fetchFn = fetch) {
    const sub = await currentSub();
    if (sub) {
      await fetchFn("/api/push/unsubscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    }
    return "off";
  }

  async function test(fetchFn = fetch) {
    const r = await fetchFn("/api/push/test", { method: "POST" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "Test impossible");
    return j.sent || 0;
  }

  /** Notification locale (si autorisée), pour ce qui se termine dans la page. */
  async function local({ title, body = "", tag = "lumen", url = "/" }) {
    if (!("Notification" in window) || Notification.permission !== "granted") return false;
    const reg = await register();
    if (!reg) return false;
    await reg.showNotification(title, { body, tag, icon: "/icons/icon-192.png", badge: "/icons/badge-96.png", data: { url } });
    return true;
  }

  // Titre de l'onglet : « ✓ Prêt » tant que l'utilisateur n'est pas revenu sur la page.
  const baseTitle = document.title;
  function flagTitle(msg) {
    if (!document.hidden) return;
    document.title = `✓ ${msg} — Lumen`;
  }
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) document.title = baseTitle;
  });

  window.Notify = { supported, isIOS, standalone, register, status, enable, disable, test, local, flagTitle };
})();
