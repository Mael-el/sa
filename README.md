# SANTÉ+ Bénin

Application de coordination des soins : patients, médecins, établissements et administration.

**Aucun mode démonstration, aucun compte de démonstration et aucune donnée fictive ne sont livrés.** La base est vide à l’exception d’un unique compte administrateur et des paramètres techniques, jusqu’à l’import facultatif du répertoire cartographique public.

Les **patients créent eux-mêmes leur compte** depuis la page publique (identifiant Santé+ et QR code générés automatiquement). Les comptes **médecin** et **établissement** restent créés ou validés par l’administration.

## Démarrage

```bash
npm ci
cp .env.example .env.local
# Renseignez DATABASE_URL, SESSION_SECRET, DATA_ENCRYPTION_KEY et le compte administrateur.
npm run db:migrate
npm run db:bootstrap
npm run db:import:health-facilities
npm run dev -- --hostname 0.0.0.0 --port 3000
```

- `db:migrate` applique les migrations versionnées de `drizzle/`.
- `db:bootstrap` crée **un seul** administrateur si la base est vide, avec mot de passe temporaire et changement obligatoire à la première connexion. Il refuse de s’exécuter sur une base déjà peuplée.
- `db:import:health-facilities` importe les hôpitaux, centres et pharmacies cartographiés dans [OpenStreetMap via l’export HOT/HDX du Bénin](https://data.humdata.org/dataset/hotosm_ben_health_facilities). L’import est répétable et conserve l’identifiant OSM, la source, la date du relevé et la licence ODbL.
- `db:import:hospitals -- --file=…` enregistre les hôpitaux et cliniques béninois réellement cartographiés dans OpenStreetMap dans la table `hospitals`, donc dans les sélecteurs d’établissement. Les intitulés génériques, les services internes et les doublons sont écartés ; aucune donnée n’est inventée (adresse et téléphone restent explicitement « non renseignés »).
- `scripts/provision-db-roles.sql` crée les rôles PostgreSQL de production : `sante_migrator` (propriétaire du schéma) et `sante_app` (DML seulement, journal d’audit en ajout seul). À exécuter une fois avec un superutilisateur, après les migrations.
- `maintenance:purge` supprime les données techniques expirées (sessions, codes de réinitialisation, compteurs de limitation, notifications lues anciennes). Ne touche jamais aux données médicales ni au journal d’audit. `-- --dry-run` pour simuler. À planifier chaque nuit.
- Ne lancez jamais `db:bootstrap` pour « réinitialiser » une base réelle. Les migrations sont la source de vérité du schéma.

Le répertoire OSM est communautaire et incomplet : la présence d’un lieu ne garantit ni son activité, ni ses horaires ou ses services. Les données sont présentées comme non vérifiées et attribuées à [OpenStreetMap](https://www.openstreetmap.org/copyright). Aucune pharmacie de garde n’est affichée sans calendrier daté et vérifiable ; l’export de lieux ne constitue pas un registre officiel. La licence ODbL s’applique aux données importées.

## Variables principales

Voir `.env.example`.

- `DATABASE_URL` : rôle applicatif PostgreSQL, sans droits DDL.
- `MIGRATION_DATABASE_URL` : rôle autorisé à appliquer les migrations, utilisé uniquement par `db:migrate`/`db:generate`.
- `SESSION_SECRET` : secret de session, au moins 48 caractères.
- `DATA_ENCRYPTION_KEY` : clé AES-256-GCM, 64 caractères hexadécimaux.
- `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_INITIAL_PASSWORD`, `ADMIN_SUPPORT_EMAIL` : amorçage du compte administrateur.

Les secrets et `.env.local` ne doivent jamais être ajoutés à Git. En production, utilisez un gestionnaire de secrets et une base PostgreSQL administrée avec sauvegardes, chiffrement au repos et supervision.

## Première connexion administrateur

1. Connectez-vous avec l’email et le mot de passe temporaires fournis par `db:bootstrap`.
2. Définissez un mot de passe définitif d’au moins 12 caractères.

Le mot de passe temporaire n’est affiché qu’une seule fois. Conservez-le dans un canal sûr jusqu’à la première connexion, puis détruisez-le.

Les connexions professionnelles et administrateur reposent actuellement sur le mot de passe seul ; cette configuration est moins sûre qu’une authentification multifacteur et ne doit pas être considérée comme adaptée à la production de données de santé.

## Système complet d’inscription, d’authentification et espace patient

### 1. Inscription et accès dédiés
- **/inscription** : page dédiée d'inscription patient avec validation en direct du nom, prénom, email, téléphone (unicité contrôlée en base), mot de passe (≥12 caractères, lettres et chiffres obligatoires, vérification anti-dictionnaire, confirmation identique). Consentement obligatoire à la politique de confidentialité (loi 2017-20). Rôle serveur **strictement forcé à `patient`**.
- **/connexion** : page dédiée de connexion (email/téléphone + mot de passe) et changement obligatoire du mot de passe temporaire à la première connexion.
- **/mot-de-passe-oublie & /reinitialiser** : parcours de réinitialisation sécurisé sans divulgation d'existence de compte. Émission d'un code à usage unique valable 30 minutes, soit généré à la demande, soit remis par l'administration dans le panneau Utilisateurs après vérification d'identité.
- **/espace** : route protégée au niveau serveur. Toute requête sans session valide est redirigée vers `/connexion`.

### 2. Fonctionnalités réelles de l’espace patient
- **Tableau de bord** : vue synthétique (prochain RDV, rappels de soins, métriques, carte d'identité Santé+ avec QR code téléchargeable).
- **Profil personnel** : consultation et modification effective des coordonnées (nom, email unique, téléphone unique, ville, groupe sanguin, date de naissance) avec persistance en base PostgreSQL.
- **Mes rendez-vous** : prise de rendez-vous en ligne avec choix d'établissement et praticien disponible, calendrier des consultations programmées, **reprogrammation / déplacement** avec vérification de créneau, et **annulation**.
- **Dossier médical** : consultation sécurisée des observations cliniques, antécédents, vaccinations et constantes.
- **Mes ordonnances** : détail complet des prescriptions (médicaments, posologies, durée, médecin prescripteur) avec **téléchargement officiel en PDF** (`/api/export?type=prescription&id=...`).
- **Résultats d’examens** : consultation et téléchargement direct des fichiers d'analyses et comptes-rendus chiffrés en base (`/api/documents/[id]`).
- **Historique & Suivi médical** : chronologie unifiée retraçant l'ensemble des événements (soins, RDV, ordonnances délivrées, consentements de soins et événements de sécurité).
- **Notifications** : alertes de rendez-vous et sécurité, avec marquage individuel ou global.
- **Paramètres & Sécurité** : changement de mot de passe sécurisé, déconnexion des autres appareils, déconnexion globale, accessibilité (grande police, synthèse vocale), mode hors ligne.
- **Déconnexion** : fermeture propre de session avec révocation du jeton en base.

### Médecins et établissements — création par l’administration

Depuis l’espace administrateur :

1. **Établissements** : créez d’abord les établissements réels.
2. **Utilisateurs** : créez les comptes médecin ou établissement. Un mot de passe temporaire est généré et affiché une seule fois.
3. Remettez les identifiants par un canal sûr. Les médecins et comptes établissement doivent changer leur mot de passe temporaire à la première connexion.

Une personne peut aussi déposer une demande d’accès professionnel depuis la page publique ; elle n’obtient aucun droit avant validation par un administrateur.

## Paiements

Aucun paiement en ligne simulé n’est livré. Les patients voient les modalités de règlement de l’établissement. Les établissements enregistrent les paiements réellement encaissés, avec moyen de paiement et référence ; l’action est auditée.

## Vérifications

```bash
npm run typecheck
npm run lint
npm run build
node scripts/security-smoke.mjs
```

`security-smoke.mjs` vérifie les accès anonymes, l’ouverture contrôlée de l’inscription patient, le refus des inscriptions sans consentement ou avec un mot de passe faible, le refus du mode démonstration et les en-têtes de sécurité. Il ne crée aucun compte.

## Limites avant production réelle

Cette application ne doit pas recevoir de données de santé réelles avant : validation APDP / loi 2017-20, vérification d’identité et des habilitations, intégration d’un prestataire de paiement réel, gestion de clés managée, sauvegardes testées, supervision, tests de charge et audit de sécurité indépendant.
