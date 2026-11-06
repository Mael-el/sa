import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth";
import { DashboardApp } from "@/components/dashboard-app";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mon espace — SANTÉ+", description: "Votre espace santé personnel SANTÉ+." };

export default async function SpacePage() {
  /**
   * Pas de redirection serveur ici.
   *
   * Le cookie de session peut être absent alors que la session est valide : dans
   * une iframe d'origine différente (prévisualisation Arena), le navigateur refuse
   * les cookies tiers. Un redirect serveur renverrait alors vers /connexion une
   * personne pourtant authentifiée — c'est la boucle de connexion constatée.
   *
   * Le shell décide donc côté client : il tente /api/bootstrap en joignant le
   * jeton qu'il détient (en-tête x-sante-session). Si la réponse est 401, il affiche
   * lui-même l'écran de connexion. Si une session existe réellement, la page rend
   * l'espace normalement, sans requête supplémentaire.
   *
   * La protection des données reste entière : /api/bootstrap et /api/actions ne
   * renvoient jamais la moindre donnée sans session valide (401 vérifié par
   * scripts/security-smoke.mjs).
   */
  const user = await getSessionUser();
  return <DashboardApp initialAuthenticated={Boolean(user)} />;
}
