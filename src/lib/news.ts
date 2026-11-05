export type Article = {
  id: string;
  slug: string;
  title: string;
  category: "Campagne nationale" | "Don de sang" | "Prévention & Conseils" | "Réseau Santé+" | "Droits & Sécurité";
  categoryBadge: "blue" | "rose" | "mint" | "purple" | "orange";
  date: string;
  readTime: string;
  excerpt: string;
  content: string[];
  keyPoints?: string[];
  author: string;
};

export const ARTICLES: Article[] = [
  {
    id: "1",
    slug: "carnet-sante-numerique-deploiement",
    title: "Généralisation du carnet de santé numérique sur le réseau Santé+",
    category: "Campagne nationale",
    categoryBadge: "blue",
    date: "4 novembre 2026",
    readTime: "3 min de lecture",
    excerpt: "Les hôpitaux et cliniques partenaires adoptent le carnet de santé numérique pour un suivi continu des consultations, ordonnances et vaccinations.",
    keyPoints: [
      "Identifiant unique Santé+ (NPI) délivré à chaque patient inscrit",
      "Partage des dossiers soumis au consentement préalable et révocable",
      "Accès aux ordonnances et résultats d'examens depuis un ordinateur ou smartphone",
    ],
    content: [
      "Dans le cadre de la modernisation du système de santé béninois, le déploiement du carnet de santé numérique Santé+ franchit une étape décisive avec l'intégration continue de nouveaux établissements dans les départements de l'Atlantique, du Littoral et de l'Ouémé.",
      "Chaque patient inscrit bénéficie d'un espace personnel sécurisé lui permettant de centraliser son historique médical : rendez-vous, comptes-rendus de consultation, ordonnances médicales téléchargeables en PDF et résultats d'examens de biologie ou d'imagerie.",
      "Ce dispositif assure une véritable continuité des soins lors des transferts entre cliniques privées et hôpitaux publics, tout en garantissant que seul le patient peut autoriser son médecin traitant à consulter ses antécédents.",
    ],
    author: "Direction Technique Santé+",
  },
  {
    id: "2",
    slug: "mobilisation-don-du-sang-benin",
    title: "Appel à la mobilisation pour le don de sang à Cotonou et Porto-Novo",
    category: "Don de sang",
    categoryBadge: "rose",
    date: "2 novembre 2026",
    readTime: "4 min de lecture",
    excerpt: "L'Agence Nationale de Transfusion Sanguine et les hôpitaux partenaires appellent les citoyens en bonne santé à donner leur sang pour soutenir les urgences et maternités.",
    keyPoints: [
      "Besoins urgents pour les groupes O+, B+ et A+",
      "Planification de rendez-vous de don directement dans l'espace patient",
      "Vérification médicale préalable gratuite et collation offerte",
    ],
    content: [
      "Les réserves de produits sanguins font l'objet d'une vigilance accrue dans les centres hospitaliers du Sud-Bénin. Les besoins restent quotidiens pour la prise en charge des femmes enceintes en situation d'urgence obstétricale, des enfants anémiés et des personnes accidentées.",
      "L'espace patient Santé+ permet désormais d'enregistrer son intention de don dans l'établissement de son choix (CNHU-HKM, CHU de la Mère et de l'Enfant Lagune, Hôpital d'Instruction des Armées...). Un rappel est automatiquement envoyé pour préparer votre venue.",
      "Donner son sang est un geste simple et sûr : le prélèvement dure une dizaine de minutes sous surveillance médicale, après un entretien préalable avec un soignant qualifié.",
    ],
    author: "Cellule Transfusion & Urgences",
  },
  {
    id: "3",
    slug: "prevention-paludisme-conseils-saisonniers",
    title: "Paludisme : reconnaître les signes d'alerte et consulter précocement",
    category: "Prévention & Conseils",
    categoryBadge: "mint",
    date: "28 octobre 2026",
    readTime: "5 min de lecture",
    excerpt: "Fièvre, frissons, courbatures : nos médecins partenaires rappellent les bons réflexes pour un diagnostic rapide et une prise en charge efficace sans automédication.",
    keyPoints: [
      "Toute fièvre doit motiver un test diagnostique rapide (TDR) sous 24h",
      "Éviter absolument l'automédication avec des antipaludéens non prescrits",
      "Dormir chaque nuit sous moustiquaire imprégnée d'insecticide",
    ],
    content: [
      "Première cause de consultation médicale au Bénin, le paludisme peut évoluer rapidement vers des formes sévères chez l'enfant et la femme enceinte s'il n'est pas pris en charge dès les premières 24 heures.",
      "Les professionnels de santé rappellent que la fièvre, même modérée, associée à des maux de tête ou des courbatures, ne doit pas être traitée au hasard. Un test de diagnostic rapide permet de confirmer l'infection en quelques minutes dans n'importe quel centre de santé du réseau.",
      "L'assistant d'orientation clinique intégré dans l'espace patient Santé+ permet d'évaluer vos symptômes 24h/24 et de trouver le médecin ou l'établissement le plus proche pour une prise en charge immédiate.",
    ],
    author: "Comité Médical & Prévention",
  },
  {
    id: "4",
    slug: "nouveaux-centres-hospitaliers-connectes",
    title: "Cinq nouveaux établissements de référence raccordés à la plateforme",
    category: "Réseau Santé+",
    categoryBadge: "purple",
    date: "20 octobre 2026",
    readTime: "3 min de lecture",
    excerpt: "Le maillage territorial de Santé+ s'étend pour offrir un service de santé numérique accessible au plus près des populations.",
    keyPoints: [
      "Prise de rendez-vous en ligne disponible dans de nouvelles communes",
      "Transmissions sécurisées des ordonnances et comptes-rendus",
      "Lits d'hospitalisation et stocks de pharmacie synchronisés",
    ],
    content: [
      "La couverture du réseau Santé+ s'enrichit avec le raccordement technique de cinq nouvelles structures hospitalières et cliniques privées agréées. Ce renforcement permet de fluidifier la coordination entre la médecine de ville et les plateaux techniques spécialisés.",
      "Les patients peuvent désormais prendre rendez-vous directement en ligne, choisir leur praticien disponible selon sa spécialité (pédiatrie, cardiologie, gynécologie...) et recevoir leurs ordonnances directement dans leur espace personnel sans formalité papier.",
      "Pour les praticiens, cette interconnexion permet de consulter l'historique vaccinal et les antécédents documentés d'un patient transféré, évitant ainsi les redondances d'examens complémentaires.",
    ],
    author: "Relations Réseau Hospitalier",
  },
  {
    id: "5",
    slug: "protection-donnees-sante-loi-2017-20",
    title: "Secret médical et données de santé : la garantie de souveraineté",
    category: "Droits & Sécurité",
    categoryBadge: "orange",
    date: "15 octobre 2026",
    readTime: "4 min de lecture",
    excerpt: "Conformément à la loi 2017-20 sur le numérique en République du Bénin, vos données de santé sont chiffrées et protégées sous le contrôle exclusif du patient.",
    keyPoints: [
      "Chiffrement fort AES-256 des documents et dossiers médicaux",
      "Comptes professionnels validés par l’administration avant leur activation",
      "Droit d'accès, d'opposition et de portabilité en un clic depuis votre espace",
    ],
    content: [
      "La confiance des usagers est le pilier de toute santé connectée. La plateforme Santé+ applique rigoureusement les dispositions du Code du numérique béninois (loi 2017-20) et les directives de l'Autorité de Protection des Données Personnelles (APDP).",
      "Contrairement à une simple application grand public, un compte Santé+ ne monétise aucune donnée. Chaque accès à un dossier par un soignant fait l'objet d'un accord explicite du patient et est consigné de façon immuable dans un journal d'audit de sécurité.",
      "Chaque patient peut à tout moment exporter l'intégralité de son dossier médical au format PDF ou au format structuré JSON pour exercer son droit à la portabilité des données.",
    ],
    author: "Délégué à la Protection des Données (DPO)",
  },
];
