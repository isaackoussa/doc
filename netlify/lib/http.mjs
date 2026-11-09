// Outils communs aux fonctions : réponses JSON, erreurs, utilisateur connecté.
import { getUser } from "@netlify/identity";
import Anthropic from "@anthropic-ai/sdk";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const json = (data, status = 200) => Response.json(data, { status });

/** Mode développement local (netlify dev) : Identity n'y fonctionne pas. */
export function devUser() {
  const email = process.env.LUMEN_DEV_USER;
  if (email && process.env.NETLIFY_DEV === "true") return { id: "dev-" + email.replace(/[^a-z0-9]/gi, "_"), email };
  return null;
}

/** L'utilisateur connecté (vérifié par Netlify Identity), sinon 401. */
export async function requireUser() {
  const user = (await getUser()) || devUser();
  if (!user?.id) throw new HttpError(401, "Connectez-vous pour continuer.");
  return { id: user.id, email: user.email };
}

export function humanError(e) {
  if (e instanceof Anthropic.APIError) {
    if (e.status === 401) return "Clé API Anthropic invalide (ANTHROPIC_API_KEY).";
    if (e.status === 429) return "Trop de requêtes : patientez quelques secondes puis réessayez.";
    if (e.status >= 500) return "Le service d'IA est momentanément indisponible. Réessayez.";
  }
  return e?.message || "Erreur inattendue";
}

/** Enveloppe un handler : transforme les erreurs en réponses JSON. */
export const handle = (fn) => async (req, context) => {
  try {
    return await fn(req, context);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : e?.status && e.status < 600 ? e.status : 500;
    if (status >= 500) console.error(e);
    return json({ error: humanError(e) }, status >= 500 && e instanceof Anthropic.APIError ? 502 : status);
  }
};

export async function body(req) {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "Requête invalide");
  }
}

export const isId = (id) => typeof id === "string" && /^[a-f0-9-]{36}$/.test(id);
export function checkId(id) {
  if (!isId(id)) throw new HttpError(400, "Identifiant invalide");
  return id;
}
