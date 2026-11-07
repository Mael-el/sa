import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { careConsents, doctors, users } from "@/db/schema";

/**
 * Permissions d'accès à un dossier médical.
 *
 * Un consentement n'est pas un interrupteur : le patient décide séparément de la
 * consultation, de la modification et de l'accès aux documents. Un médecin peut
 * donc consulter sans pouvoir modifier. Toute fonction qui touche à une donnée de
 * santé doit passer par ici, jamais par une vérification de rôle seule.
 *
 * Une demande en attente (« en attente ») ne donne aucun droit : elle attend la
 * décision du patient. Seul le statut « accordé » ouvre l'accès, et il faut en
 * plus que le consentement soit non révoqué et non expiré.
 */

export type ConsentPermissions = {
  view: boolean;
  modify: boolean;
  viewDocuments: boolean;
  /** Identifiant du consentement qui fonde l'accès, pour pouvoir le révoquer. */
  consentId: number | null;
  /** Motif lisible, utilisé pour expliquer un refus sans révéler le dossier. */
  reason: string;
};

const DENIED = (reason: string): ConsentPermissions => ({ view: false, modify: false, viewDocuments: false, consentId: null, reason });

/**
 * Permissions effectives du compte courant sur le dossier d'un patient.
 *
 * - patient : pleins droits sur son propre dossier ;
 * - médecin : uniquement les droits accordés nominativement, s'il est actif ;
 * - établissement : droits accordés à l'établissement de rattachement ;
 * - administration : aucune donnée clinique (cadre légal : elle ne soigne pas).
 */
export async function consentPermissions(
  current: typeof users.$inferSelect,
  patientId: number,
): Promise<ConsentPermissions> {
  if (current.role === "patient") {
    return current.id === patientId
      ? { view: true, modify: true, viewDocuments: true, consentId: null, reason: "Votre propre dossier." }
      : DENIED("Un patient n'accède qu'à son propre dossier.");
  }

  if (current.role === "admin") {
    // L'administration peut vérifier l'existence d'une identité et l'état des
    // autorisations, jamais lire une donnée clinique.
    return DENIED("L'administration ne consulte pas les données médicales.");
  }

  if (current.role === "doctor") {
    const [doctor] = await db.select({ id: doctors.id, status: doctors.status }).from(doctors)
      .where(eq(doctors.userId, current.id)).limit(1);
    if (!doctor) return DENIED("Aucun profil de médecin n'est associé à ce compte.");
    if (doctor.status !== "actif") return DENIED("Votre compte médecin n'est pas actif.");

    const [grant] = await db.select().from(careConsents).where(and(
      eq(careConsents.patientId, patientId),
      eq(careConsents.doctorId, doctor.id),
      eq(careConsents.status, "accordé"),
      isNull(careConsents.revokedAt),
      gt(careConsents.expiresAt, new Date()),
    )).limit(1);

    if (!grant) return DENIED("Ce patient ne vous a pas accordé d'accès à son dossier.");
    if (!grant.canView) return DENIED("Ce patient vous a accordé l'accès mais en a suspendu la consultation.");
    return {
      view: grant.canView,
      modify: grant.canModify,
      viewDocuments: grant.canViewDocuments,
      consentId: grant.id,
      reason: grant.canModify ? "Consultation et modification autorisées." : "Consultation seule : la modification n'est pas autorisée.",
    };
  }

  if (current.role === "hospital") {
    if (!current.hospitalId) return DENIED("Aucun établissement n'est rattaché à ce compte.");
    const [grant] = await db.select().from(careConsents).where(and(
      eq(careConsents.patientId, patientId),
      eq(careConsents.hospitalId, current.hospitalId),
      eq(careConsents.status, "accordé"),
      isNull(careConsents.revokedAt),
      gt(careConsents.expiresAt, new Date()),
    )).limit(1);

    if (!grant) return DENIED("Ce patient n'a pas accordé d'accès à votre établissement.");
    if (!grant.canView) return DENIED("Ce patient a suspendu la consultation de son dossier par votre établissement.");
    return {
      view: grant.canView,
      modify: grant.canModify,
      viewDocuments: grant.canViewDocuments,
      consentId: grant.id,
      reason: grant.canModify ? "Consultation et modification autorisées." : "Consultation seule : la modification n'est pas autorisée.",
    };
  }

  return DENIED("Rôle non autorisé.");
}

/** Compatibilité : l'ancien code n'a besoin que de la consultation. */
export async function hasCareConsent(current: typeof users.$inferSelect, patientId: number) {
  return (await consentPermissions(current, patientId)).view;
}

/** Exige la consultation, sinon lève une réponse 403 prête à renvoyer. */
export async function requireView(current: typeof users.$inferSelect, patientId: number) {
  const permissions = await consentPermissions(current, patientId);
  return permissions.view ? null : permissions;
}

/** Exige la modification, sinon renvoie les permissions pour expliquer le refus. */
export async function requireModify(current: typeof users.$inferSelect, patientId: number) {
  const permissions = await consentPermissions(current, patientId);
  return permissions.modify ? null : permissions;
}
