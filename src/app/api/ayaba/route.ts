import { findTopics, findPublicTopics, fallbackAnswer, looksPersonal, topicsFor, topicsForPublic, type AyabaRole } from "@/lib/ayaba-knowledge";
import { getSessionUser } from "@/lib/auth";
import { withinRateLimit } from "@/lib/security";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";

export const dynamic = "force-dynamic";

/**
 * AYABA — assistante de la plateforme.
 *
 * Répond exclusivement à partir de la base de connaissances versionnée dans le
 * dépôt : aucune génération libre, donc aucune information inventée sur des
 * sujets sensibles comme le consentement ou la sécurité.
 *
 * Aucune question n'est stockée ni transmise à un tiers. On journalise
 * seulement qu'une question a été posée, et si une réponse a été trouvée, sans
 * en conserver le texte : une question de santé peut révéler une pathologie.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  const body = await request.json().catch(() => ({}));
  const question = String(body.question || "").trim().slice(0, 500);

  // Sans session, AYABA reste disponible sur le fonctionnement de la plateforme :
  // un visiteur doit pouvoir se renseigner avant de créer un compte. Les sujets
  // qui touchent au dossier personnel ne sont ni listés ni répondus.
  if (!user) {
    if (!(await withinRateLimit(request, "ayaba-public", 60, 3600))) {
      return Response.json({ error: "Beaucoup de questions en peu de temps. Réessayez dans un moment." }, { status: 429 });
    }
    if (!question) {
      return Response.json({
        greeting: "Bonjour, je suis AYABA, l'assistante de SANTÉ+. Je présente la plateforme et son fonctionnement. Pour une question sur votre dossier, connectez-vous ou créez votre compte.",
        topics: topicsForPublic(),
        visitor: true,
      }, { headers: { "Cache-Control": "private, no-store" } });
    }
    if (looksPersonal(question)) {
      return Response.json({
        answer: "Cette question porte sur un dossier personnel : connectez-vous pour que je puisse y répondre, ou créez votre compte si vous n'en avez pas encore. Sans compte, je reste disponible sur le fonctionnement général de la plateforme.",
        matched: null,
        related: topicsForPublic().filter((topic) => ["compte-creation", "connexion-probleme", "donnees-securite"].includes(topic.id)),
        suggestions: [],
        found: false,
        visitor: true,
        needsLogin: true,
      }, { headers: { "Cache-Control": "private, no-store" } });
    }

    const publicMatches = findPublicTopics(question, 3);
    const publicBest = publicMatches[0];
    return Response.json({
      answer: publicBest
        ? publicBest.answer
        : "Je ne réponds sans compte qu'aux questions sur le fonctionnement de la plateforme. Créez votre compte pour que je puisse vous accompagner sur votre dossier, vos rendez-vous et vos droits.",
      matched: publicBest ? { id: publicBest.id, title: publicBest.title } : null,
      related: publicMatches.slice(1).map((topic) => ({ id: topic.id, title: topic.title })),
      suggestions: topicsForPublic().slice(0, 6),
      found: Boolean(publicBest),
      visitor: true,
    }, { headers: { "Cache-Control": "private, no-store" } });
  }

  if (!(await withinRateLimit(request, "ayaba", 120, 3600, String(user.id)))) {
    return Response.json({ error: "Beaucoup de questions en peu de temps. Réessayez dans un moment." }, { status: 429 });
  }

  const role = (["patient", "doctor", "hospital", "admin"].includes(user.role) ? user.role : "patient") as AyabaRole;

  // Écran d'accueil : la liste des sujets disponibles pour ce rôle.
  if (!question) {
    return Response.json({ greeting: greetingFor(role, user.fullName), topics: topicsFor(role) }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const matches = findTopics(question, role, 3);
  const best = matches[0];

  await db.insert(auditLogs).values({
    userId: user.id,
    action: "Question à AYABA",
    resource: "Assistante de plateforme",
    // Ni la question ni la réponse : seule l'existence d'une correspondance.
    details: best ? `Sujet reconnu : ${best.id}` : "Aucune correspondance",
  });

  if (!best) {
    return Response.json({
      answer: fallbackAnswer(role),
      matched: null,
      related: [],
      suggestions: topicsFor(role).slice(0, 6),
      found: false,
    }, { headers: { "Cache-Control": "private, no-store" } });
  }

  return Response.json({
    answer: best.answer,
    matched: { id: best.id, title: best.title },
    // Sujets proches proposés en boutons : on évite de relancer une recherche
    // à l'aveugle quand la réponse ne couvre pas tout.
    related: (best.related || []).map((id) => topicsFor(role).find((topic) => topic.id === id)).filter(Boolean),
    otherSuggestions: matches.slice(1).map((topic) => ({ id: topic.id, title: topic.title })),
    found: true,
  }, { headers: { "Cache-Control": "private, no-store" } });
}

function greetingFor(role: AyabaRole, fullName: string) {
  const firstName = fullName.replace(/^(Dr\.?|Mme|M\.)\s*/i, "").split(" ")[0];
  const base = `Bonjour ${firstName}, je suis AYABA, l'assistante de SANTÉ+.`;
  const scope: Record<AyabaRole, string> = {
    patient: " Je réponds à vos questions sur votre compte, votre NPI, vos rendez-vous, votre dossier et vos droits — et je vous oriente vers le bon écran.",
    doctor: " Je réponds à vos questions sur la recherche de patients, les consentements et la tenue des dossiers.",
    hospital: " Je réponds à vos questions sur les patients, les consentements, les services et les stocks de votre établissement.",
    admin: " Je réponds à vos questions sur les comptes, les établissements, les demandes d'accès, l'audit et la plateforme.",
  };
  return base + scope[role] + " Je ne pose pas de diagnostic médical.";
}
