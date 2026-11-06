"use client";

/**
 * Session côté client.
 *
 * Le serveur pose normalement un cookie httpOnly. Mais lorsque l'application est
 * affichée dans une iframe d'origine différente — la prévisualisation Arena — le
 * navigateur refuse ce cookie tiers, même en SameSite=None. La connexion réussit
 * alors que la requête suivante repart sans session : l'utilisateur est renvoyé
 * sur /connexion et boucle indéfiniment.
 *
 * Solution : la route d'authentification renvoie aussi le jeton dans le corps de
 * la réponse. On le conserve ici et on l'envoie dans l'en-tête `x-sante-session`
 * que le serveur accepte en priorité. Le cookie reste utilisé quand il fonctionne,
 * donc rien ne change hors iframe.
 *
 * Ce stockage n'aggrave pas l'exposition : le cookie est httpOnly, mais ce jeton
 * est aléatoire, haché en base, révocable et expire avec la session. On le garde
 * en mémoire et dans sessionStorage (effacé à la fermeture de l'onglet).
 */

const STORAGE_KEY = "sante_session_token";
export const SESSION_HEADER = "x-sante-session";

let memoryToken: string | null = null;

export function getSessionToken(): string | null {
  if (memoryToken) return memoryToken;
  if (typeof window === "undefined") return null;
  try {
    memoryToken = window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    memoryToken = null;
  }
  return memoryToken;
}

export function setSessionToken(token: string | null) {
  memoryToken = token;
  if (typeof window === "undefined") return;
  try {
    if (token) window.sessionStorage.setItem(STORAGE_KEY, token);
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* sessionStorage indisponible (navigation privée stricte) : le jeton reste en mémoire. */
  }
}

/** En-têtes à joindre à chaque requête API. */
export function sessionHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getSessionToken();
  return { ...(extra || {}), ...(token ? { [SESSION_HEADER]: token } : {}) };
}
