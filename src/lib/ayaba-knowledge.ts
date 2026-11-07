/**
 * Base de connaissances d'AYABA — assistante de la plateforme SANTÉ+.
 *
 * AYABA répond aux questions sur l'application : comptes, NPI, rendez-vous,
 * dossiers, consentements, annuaire, paiements, sécurité, droits. Elle ne
 * pratique pas la médecine : pour des symptômes, elle oriente vers l'assistant
 * de santé et les secours.
 *
 * Chaque réponse est tirée du comportement réel de l'application, pas d'un
 * texte marketing. Quand une information n'existe pas, AYABA le dit : mieux
 * vaut une réponse honnête sur une limite qu'une réponse inventée.
 *
 * Le nom « AYABA » vient du vodun AYABA, gardienne du foyer et de la mémoire
 * dans la tradition du sud du Bénin : une figure de confiance et de discrétion.
 */

export type AyabaTopic = {
  id: string;
  title: string;
  /** Mots-clés normalisés, sans accents, en minuscules. */
  keywords: string[];
  /** Formulations courantes qui doivent mener ici sans ambiguïté. */
  phrases?: string[];
  answer: string;
  /** Sujets liés, proposés en boutons pour continuer la conversation. */
  related?: string[];
};

export type AyabaRole = "patient" | "doctor" | "hospital" | "admin";

/** Sujets communs à tous les rôles. */
const COMMON: AyabaTopic[] = [
  {
    id: "presentation",
    title: "Qui êtes-vous ?",
    keywords: ["qui", "es", "tu", "ayaba", "assistant", "presentation", "aide", "peux", "faire"],
    answer:
      "Je suis AYABA, l'assistante de la plateforme SANTÉ+ Bénin. Je réponds à vos questions sur l'application : votre compte, votre NPI, vos rendez-vous, votre dossier, vos autorisations d'accès et vos droits. Je ne pose pas de diagnostic médical — pour des symptômes, l'assistant de santé de votre espace est fait pour cela, et en cas d'urgence appelez le 112.",
    related: ["npi", "compte-creation", "donnees-securite"],
  },
  {
    id: "npi",
    title: "Mon NPI",
    keywords: ["npi", "numero", "identifiant", "identification", "personnel", "sante", "carte"],
    answer:
      "Votre NPI (Numéro Personnel d'Identification) est créé automatiquement à l'inscription, au format **SP-AAAA-XXXXXX** (par exemple SP-2026-988994). Il identifie votre profil de santé et figure sur votre espace et sur vos documents. Attention : un NPI **n'ouvre aucun dossier par lui-même**. Un professionnel qui connaît votre NPI doit encore obtenir votre accord pour consulter votre dossier.",
    related: ["consentement", "donnees-securite"],
  },
  {
    id: "compte-creation",
    title: "Créer un compte",
    keywords: ["creer", "compte", "inscription", "inscrire", "enregistrer", "nouveau", "ouvrir"],
    answer:
      "Deux possibilités. En tant que patient, vous pouvez vous inscrire vous-même depuis la page « Inscription » : nom, email, téléphone et un mot de passe de 12 caractères minimum. Les comptes **médecin** et **établissement** ne s'ouvrent que par l'administration, après vérification de vos habilitations professionnelles.",
    related: ["mot-de-passe", "connexion-probleme"],
  },
  {
    id: "mot-de-passe",
    title: "Mot de passe oublié",
    keywords: ["mot", "passe", "oublie", "perdu", "reinitialiser", "reset", "changer", "modifier"],
    phrases: ["mot de passe oublie", "j ai oublie mon mot de passe"],
    answer:
      "Sur la page de connexion, cliquez sur « Mot de passe oublié » et saisissez votre email. Vous recevez un code à usage unique valable **30 minutes** — il révoquera vos autres sessions actives. Si aucun email ne vous arrive (le service n'est peut-être pas encore configuré), l'administration reçoit une notification et vous remet le code après vérification de votre identité. Pour changer votre mot de passe en étant connecté : « Paramètres & Sécurité ».",
    related: ["connexion-probleme", "donnees-securite"],
  },
  {
    id: "connexion-probleme",
    title: "Je n'arrive pas à me connecter",
    keywords: ["connexion", "connecter", "marche", "pas", "erreur", "bloque", "acceder", "login"],
    phrases: ["je ne peux pas me connecter", "connexion impossible"],
    answer:
      "Trois causes fréquentes. **1.** Après 8 tentatives en 15 minutes, la connexion est temporairement bloquée par sécurité : attendez un quart d'heure. **2.** Un mot de passe temporaire doit être changé à la première connexion — si vous l'avez perdu, passez par « Mot de passe oublié ». **3.** Votre compte peut être désactivé : contactez l'administration. Ne communiquez jamais votre mot de passe, même à un agent SANTÉ+.",
    related: ["mot-de-passe", "compte-creation"],
  },
  {
    id: "donnees-securite",
    title: "Mes données sont-elles protégées ?",
    keywords: ["donnees", "securite", "protege", "confidentiel", "prive", "rgpd", "apdp", "chiffre", "secret"],
    answer:
      "Vos données de santé ne sont jamais publiques. Quatre protections : **1.** votre dossier n'est lisible que par vous, ou par un professionnel à qui vous avez accordé un accès nominatif ; **2.** chaque consultation de dossier est enregistrée dans un journal d'audit avec l'identité du professionnel ; **3.** les documents médicaux sont chiffrés (AES-256-GCM) ; **4.** vous pouvez révoquer un accès à tout moment, l'effet est immédiat. L'administration voit votre profil administratif, mais jamais le contenu médical.",
    related: ["consentement", "journal-audit"],
  },
  {
    id: "journal-audit",
    title: "Le journal d'audit",
    keywords: ["journal", "audit", "tracabilite", "trace", "historique", "qui", "consulte"],
    answer:
      "Le journal d'audit consigne les actions sensibles : recherches de NPI, demandes d'accès, décisions, consultations de dossier, modifications (avec le nom du professionnel et le numéro de révision), connexions et changements de mot de passe. **Les refus d'accès y figurent aussi**, avec leur motif. Il est en ajout seul : l'application elle-même ne peut ni le modifier ni l'effacer.",
    related: ["donnees-securite", "consentement"],
  },
  {
    id: "urgences",
    title: "Urgence médicale",
    keywords: ["urgence", "samu", "112", "secours", "grave", "danger", "mourir", "inconscient", "saigne"],
    phrases: ["c est une urgence", "je saigne beaucoup"],
    answer:
      "**En cas d'urgence vitale, appelez immédiatement le 112** (SAMU) ou rendez-vous au service d'urgences le plus proche — n'attendez pas une réponse de ma part. L'onglet « Trouver un centre » vous aide à localiser un établissement autour de vous. Je suis une assistante de plateforme : je ne peux ni évaluer une urgence ni remplacer un soignant.",
    related: ["trouver-centre", "assistant-sante"],
  },
];

/** Sujets réservés au patient. */
const PATIENT: AyabaTopic[] = [
  {
    id: "consentement",
    title: "Gérer les accès à mon dossier",
    keywords: ["consentement", "autorisation", "acces", "autoriser", "revoquer", "retirer", "accord", "permission", "partager"],
    answer:
      "Tout se passe dans **« Confidentialité & Droits »**, en trois temps. **1.** Quand un médecin demande l'accès, la demande apparaît en haut avec son nom et son motif. **2.** Vous choisissez : *Consulter*, *Consulter et modifier*, ou *Refuser*. **3.** Ensuite, vous pouvez cocher ou décocher « modifier les données médicales » à tout moment, et révoquer l'autorisation — le professionnel perd l'accès dans la seconde. Chaque décision est journalisée.",
    related: ["npi", "journal-audit", "modification-dossier"],
  },
  {
    id: "modification-dossier",
    title: "Qui peut modifier mon dossier ?",
    keywords: ["modifier", "modification", "changer", "corriger", "editer", "ecrire", "dossier"],
    answer:
      "Consulter et modifier sont **deux droits séparés**. Par défaut, un professionnel que vous autorisez peut seulement consulter. Pour qu'il puisse modifier, vous devez cocher explicitement « Modifier les données médicales » sur son autorisation. Chaque modification est horodatée, rattachée au professionnel qui l'a faite, et vous recevez une notification.",
    related: ["consentement", "journal-audit"],
  },
  {
    id: "rendez-vous",
    title: "Prendre un rendez-vous",
    keywords: ["rendez", "vous", "rdv", "prendre", "reserver", "consultation", "planifier", "medecin"],
    answer:
      "Dans **« Mes rendez-vous »**, cliquez sur « Prendre rendez-vous ». Choisissez l'établissement, puis le praticien, la date, l'heure et le motif. En validant, vous **autorisez ce médecin à consulter votre dossier** pour la préparation et la consultation — c'est le consentement de soins. Sans ce consentement, la réservation est refusée. Vous pouvez annuler un rendez-vous à venir depuis la même page.",
    related: ["consentement", "trouver-centre"],
  },
  {
    id: "trouver-centre",
    title: "Trouver un hôpital ou une pharmacie",
    keywords: ["trouver", "centre", "hopital", "pharmacie", "clinique", "annuaire", "carte", "proche", "autour"],
    answer:
      "La page **« Trouver un centre »** répertorie les établissements et pharmacies du Bénin, filtrables par ville, type et recherche libre. Ces données proviennent d'OpenStreetMap (relevé de février 2025) : elles sont communautaires, donc **non garanties à jour** — appelez avant de vous déplacer. Les adresses postales et téléphones manquants sont indiqués « non renseignés » plutôt qu'inventés.",
    related: ["urgences", "rendez-vous"],
  },
  {
    id: "assistant-sante",
    title: "L'assistant de santé",
    keywords: ["assistant", "sante", "symptome", "fievre", "douleur", "mal", "orienter", "conseil"],
    answer:
      "L'**assistant de santé** (menu « Assistant santé ») analyse vos symptômes et vous oriente : urgence, avis rapide, ou surveillance. Il fonctionne **localement par défaut** : rien ne sort de la plateforme. Si vous cochez la case de consentement, un service d'IA externe affine l'analyse — c'est vous qui décidez. Dans tous les cas, il ne pose pas de diagnostic.",
    related: ["urgences", "rendez-vous"],
  },
  {
    id: "don-sang",
    title: "Don de sang",
    keywords: ["don", "sang", "donner", "transfusion", "groupe", "sanguin"],
    answer:
      "Dans **« Don de sang »**, choisissez un centre de collecte et une date pour signaler votre intention de donner. L'établissement voit votre proposition et vous contacte. Votre groupe sanguin, renseigné à l'inscription ou dans « Profil personnel », aide les établissements à anticiper leurs besoins.",
    related: ["trouver-centre", "profil"],
  },
  {
    id: "profil",
    title: "Modifier mon profil",
    keywords: ["profil", "modifier", "information", "telephone", "ville", "naissance", "groupe", "sanguin", "email"],
    answer:
      "Dans **« Profil personnel »**, vous pouvez mettre à jour votre téléphone, votre ville, votre date de naissance et votre groupe sanguin. Votre **email sert d'identifiant de connexion** : un changement passe par l'administration pour éviter qu'un tiers ne détourne votre compte. Votre NPI, lui, ne change jamais.",
    related: ["npi", "mot-de-passe"],
  },
  {
    id: "telecharger-documents",
    title: "Télécharger mon dossier",
    keywords: ["telecharger", "exporter", "pdf", "imprimer", "sauvegarde", "document", "recuperer"],
    answer:
      "Depuis **« Dossier médical »** ou **« Historique & Suivi »**, le bouton d'export produit un fichier lisible de vos données. Sur mobile, ouvrez-le avant d'imprimer ou de le partager : il contient des informations médicales sensibles. Vous pouvez aussi demander un export complet via « Confidentialité & Droits ».",
    related: ["donnees-securite", "consentement"],
  },
  {
    id: "paiements",
    title: "Paiements",
    keywords: ["paiement", "payer", "facture", "montant", "prix", "frais", "remboursement", "argent"],
    answer:
      "Le paiement en ligne **n'est pas activé** sur SANTÉ+. Les paiements que vous voyez dans votre espace sont ceux **encaissés à l'établissement** et enregistrés avec une référence : c'est un relevé, pas un moyen de payer. Aucune carte bancaire n'est demandée par la plateforme. Ne payez jamais un soignant via un lien reçu par message.",
    related: ["rendez-vous", "donnees-securite"],
  },
  {
    id: "droits",
    title: "Mes droits sur mes données",
    keywords: ["droit", "droits", "effacement", "rectification", "opposition", "supprimer", "anonymiser", "reclamation"],
    answer:
      "Vous disposez des droits d'accès, de rectification, d'effacement et d'opposition. Ils s'exercent depuis **« Confidentialité & Droits »** : votre demande est enregistrée, l'administration vérifie votre identité, puis traite la demande. Une suppression complète n'est pas immédiate : les données médicales peuvent devoir être conservées pour votre suivi, mais elles sont anonymisées.",
    related: ["donnees-securite", "journal-audit"],
  },
  {
    id: "notifications",
    title: "Notifications",
    keywords: ["notification", "alerte", "message", "pas", "recevoir", "cloche"],
    answer:
      "La cloche en haut de l'écran et la page **« Notifications »** regroupent vos alertes : demande d'accès d'un professionnel, consultation disponible, modification de dossier, résultat d'examen, réponse à une demande de droits. Une notification de sécurité (changement de mot de passe) ne doit jamais être ignorée : si vous n'êtes pas à l'origine de l'action, changez votre mot de passe et prévenez l'administration.",
    related: ["mot-de-passe", "consentement"],
  },
];

/** Sujets réservés aux professionnels (médecin, établissement). */
const PROFESSIONAL: AyabaTopic[] = [
  {
    id: "recherche-npi",
    title: "Rechercher un patient par NPI",
    keywords: ["rechercher", "recherche", "npi", "patient", "trouver", "identifier", "scanner", "qr"],
    answer:
      "Le menu **« Rechercher un NPI »** accepte un NPI, un nom ou un téléphone. Vous obtenez toujours l'identité du patient (nom, NPI, ville, structure, statut), mais **le dossier ne s'ouvre que si le patient vous a accordé son consentement**. Trois états s'affichent : « Dossier ouvert », « Fiche seule », « Accès refusé ». Dans les deux derniers cas, le bouton « Demander l'accès au patient » envoie une demande motivée.",
    related: ["demande-acces", "consultation-dossier"],
  },
  {
    id: "demande-acces",
    title: "Demander l'accès à un dossier",
    keywords: ["demande", "demander", "acces", "autorisation", "consentement", "motif"],
    answer:
      "Depuis la fiche du patient, cliquez sur « Demander l'accès au patient » et rédigez un motif de 10 à 400 caractères. Le patient reçoit une notification et décide : consulter seule, consulter et modifier, ou refuser. **Tant qu'il n'a pas répondu, vous n'avez aucun accès** — une demande en attente ne vaut pas autorisation. Vous pouvez suivre la décision depuis la recherche.",
    related: ["recherche-npi", "refus-acces"],
  },
  {
    id: "refus-acces",
    title: "Le patient a refusé",
    keywords: ["refuse", "refus", "bloque", "pas", "acces", "interdit", "403"],
    answer:
      "Un refus n'est pas une panne : c'est le patient qui exerce son droit. Deux options : lui demander d'accorder l'accès depuis son espace « Confidentialité & Droits », ou solliciter un autre professionnel s'il vous a autorisé nominativement. En cas d'urgence vitale, la prise en charge passe par l'établissement et les procédures de soins, pas par un contournement de la plateforme — et tout contournement est refusé par le serveur, pas seulement par l'interface.",
    related: ["demande-acces", "urgences"],
  },
  {
    id: "consultation-dossier",
    title: "Consulter et modifier un dossier",
    keywords: ["consulter", "dossier", "modifier", "compte", "rendu", "consultation", "enregistrer", "revision"],
    answer:
      "Le bouton « Ouvrir le dossier » s'affiche si le patient vous a accordé la consultation. Le bouton « Modifier », lui, n'apparaît que si vous avez aussi le droit de modification — c'est un droit distinct que le patient choisit. Chaque modification crée une **nouvelle révision** avec votre nom et l'horodatage, et le patient est notifié. Le serveur revérifie ce droit à chaque écriture.",
    related: ["demande-acces", "journal-audit"],
  },
  {
    id: "agenda-medecin",
    title: "Gérer mon agenda",
    keywords: ["agenda", "rendez", "vous", "planning", "creneau", "annuler", "confirmer", "patient"],
    answer:
      "Le menu **« Mon agenda »** liste vos rendez-vous par onglet (avenir, aujourd'hui, tous). Vous pouvez confirmer, marquer comme terminé ou annuler. Chaque rendez-vous donne accès au dossier du patient **si celui-ci a consenti lors de la réservation** — sinon, passez par une demande d'accès.",
    related: ["consultation-dossier", "prescriptions"],
  },
  {
    id: "prescriptions",
    title: "Rédiger une ordonnance",
    keywords: ["ordonnance", "prescription", "medicament", "traitement", "posologie", "interaction"],
    answer:
      "Depuis **« Ordonnances »** ou après une consultation, vous composez l'ordonnance (médicament, dosage, fréquence, durée). La plateforme signale les **interactions médicamenteuses** connues et vous demande de les vérifier explicitement avant validation. L'ordonnance apparaît immédiatement dans l'espace du patient.",
    related: ["consultation-dossier", "agenda-medecin"],
  },
  {
    id: "etablissement-comptes",
    title: "Comptes de mon établissement",
    keywords: ["etablissement", "medecin", "equipe", "creer", "compte", "rattacher", "hopital", "service"],
    answer:
      "Les comptes médecins sont créés par l'administration, avec rattachement à votre établissement et numéro d'ordre. Un médecin ne voit que les patients qui l'ont autorisé nominativement ; l'établissement voit ceux qui ont autorisé la structure. La gestion des services et des lits se fait dans **« Services & lits »**, les stocks dans **« Pharmacie & stocks »**.",
    related: ["consultation-dossier", "recherche-npi"],
  },
];

/** Sujets réservés à l'administration. */
const ADMIN: AyabaTopic[] = [
  {
    id: "admin-creation-comptes",
    title: "Créer un compte professionnel",
    keywords: ["creer", "compte", "medecin", "etablissement", "admin", "utilisateur", "temporaire", "inviter"],
    answer:
      "Dans **« Utilisateurs »** → « Créer un compte ». Choisissez le rôle, puis pour un médecin : établissement, spécialité, numéro d'ordre et années d'expérience. Un mot de passe temporaire est généré et **envoyé par email au titulaire** si le service d'email est configuré ; sinon il s'affiche une seule fois et vous devez le transmettre par un canal sûr. Le titulaire devra le changer à la première connexion.",
    related: ["admin-roles", "admin-audit"],
  },
  {
    id: "admin-roles",
    title: "Rôles et permissions",
    keywords: ["role", "permission", "droit", "admin", "medecin", "hopital", "patient", "qui", "peut"],
    answer:
      "Quatre rôles. **Patient** : son dossier et ses droits. **Médecin** : les patients qui l'ont autorisé nominativement. **Établissement** : les patients ayant autorisé la structure, plus ses stocks, services et finances. **Administration** : la gestion des comptes, établissements, demandes d'accès et statistiques — mais **jamais le contenu clinique**, elle reste au niveau « fiche seule ».",
    related: ["admin-creation-comptes", "admin-audit"],
  },
  {
    id: "admin-demandes-acces",
    title: "Valider les demandes d'accès",
    keywords: ["demande", "acces", "valider", "approuver", "refuser", "inscription", "professionnel", "ordre"],
    answer:
      "Les demandes d'ouverture de compte arrivent dans **« Demandes d'accès »**. Vérifiez toujours l'identité et les habilitations avant d'approuver : numéro d'ordre professionnel, établissement de rattachement, cohérence du parcours. Une fois approuvée, la création du compte se fait dans « Utilisateurs ».",
    related: ["admin-creation-comptes", "admin-audit"],
  },
  {
    id: "admin-audit",
    title: "Journal d'audit et incidents",
    keywords: ["audit", "journal", "incident", "securite", "fuite", "compromis", "verifier", "tracer"],
    answer:
      "Le **« Journal d'audit »** enregistre recherches de NPI, demandes et décisions, consultations, refus d'accès, modifications et connexions. En cas de suspicion de compromission : désactivez le compte, révoquez ses sessions, changez les mots de passe concernés, puis relisez le journal pour établir la chronologie. Le journal est en ajout seul : même l'administration ne peut pas le réécrire.",
    related: ["admin-roles", "donnees-securite"],
  },
  {
    id: "admin-etablissements",
    title: "Gérer les établissements",
    keywords: ["etablissement", "hopital", "clinique", "ajouter", "annuaire", "osm", "importer", "ville"],
    answer:
      "**« Établissements »** liste les structures du réseau, avec recherche par nom ou ville et filtre par ville. Elles alimentent les sélecteurs de rendez-vous et de don de sang. Les données cartographiques viennent d'OpenStreetMap (relevé de février 2025, licence ODbL) : elles sont déclaratives, sans garantie d'activité. Un établissement doit exister **avant** de créer les comptes qui s'y rattachent.",
    related: ["admin-creation-comptes", "admin-roles"],
  },
  {
    id: "admin-droits-patients",
    title: "Traiter les droits des patients",
    keywords: ["droit", "effacement", "rectification", "opposition", "demande", "rgpd", "apdp", "anonymiser"],
    answer:
      "Les demandes d'accès, rectification, effacement et opposition arrivent dans **« Droits des patients »**. Vérifiez l'identité avant toute action, puis tracez la décision. Pour un effacement, la pratique retenue est l'**anonymisation** : le dossier clinique reste lié à un identifiant technique, sans nom, contact ni NPI — parce qu'un dossier médical peut être nécessaire au patient lui-même.",
    related: ["admin-audit", "donnees-securite"],
  },
  {
    id: "admin-statistiques",
    title: "Statistiques de la plateforme",
    keywords: ["statistique", "chiffre", "rapport", "indic", "couverture", "activite", "national"],
    answer:
      "**« Statistiques »** présente la couverture géographique du réseau, la capacité, l'activité et les tendances. Les chiffres sont calculés à partir des données réelles de la base : aucune valeur de démonstration n'est injectée. Une série vide reste vide plutôt que d'être complétée artificiellement.",
    related: ["admin-etablissements", "admin-roles"],
  },
];

const BY_ROLE: Record<AyabaRole, AyabaTopic[]> = {
  patient: [...COMMON, ...PATIENT],
  doctor: [...COMMON, ...PROFESSIONAL],
  hospital: [...COMMON, ...PROFESSIONAL],
  admin: [...COMMON, ...ADMIN, ...PROFESSIONAL.filter((topic) => ["recherche-npi", "consultation-dossier"].includes(topic.id))],
};

/** Normalise une question : minuscules, sans accents, sans ponctuation. */
export function normalizeQuestion(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Liste des sujets visibles pour un rôle, pour l'écran d'accueil d'AYABA. */
export function topicsFor(role: AyabaRole) {
  return (BY_ROLE[role] || BY_ROLE.patient).map(({ id, title }) => ({ id, title }));
}

/**
 * Trouve les meilleurs sujets pour une question.
 *
 * Deux signaux : formulation exacte (poids fort) puis recouvrement de
 * mots-clés. Le score est normalisé pour que les longues questions ne
 * désavantagent pas les sujets courts.
 */
export function findTopics(question: string, role: AyabaRole, limit = 3) {
  const topics = BY_ROLE[role] || BY_ROLE.patient;
  const normalized = normalizeQuestion(question);
  if (!normalized) return [];

  const words = new Set(normalized.split(" ").filter((word) => word.length > 2));

  const scored = topics.map((topic) => {
    let score = 0;

    for (const phrase of topic.phrases || []) {
      if (normalized.includes(normalizeQuestion(phrase))) score += 10;
    }

    let hits = 0;
    for (const keyword of topic.keywords) {
      const normalizedKeyword = normalizeQuestion(keyword);
      if (!normalizedKeyword) continue;
      if (normalizedKeyword.includes(" ")) {
        if (normalized.includes(normalizedKeyword)) hits += 2.5;
      } else if (words.has(normalizedKeyword)) {
        hits += 1.5;
      }
    }

    // Un titre proche pèse lourd : « comment prendre un rendez-vous » doit
    // répondre sur les rendez-vous, pas sur les paiements.
    const titleWords = normalizeQuestion(topic.title).split(" ");
    const titleHits = titleWords.filter((word) => word.length > 3 && words.has(word)).length;
    score += hits + titleHits * 2;

    return { topic, score };
  });

  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.topic);
}

/** Réponse de repli quand aucun sujet ne correspond. */
export function fallbackAnswer(role: AyabaRole) {
  const suggestions = topicsFor(role).slice(0, 4).map((topic) => `« ${topic.title} »`).join(", ");
  return `Je n'ai pas de réponse fiable à cette question, et je préfère vous le dire plutôt que d'inventer. Voici ce que je sais traiter : ${suggestions}… Vous pouvez aussi formuler autrement, ou contacter l'administration pour un cas particulier.`;
}
