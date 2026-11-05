# SANTÉ+ Bénin

Application de coordination des soins : patients, médecins, établissements et administration.

**Aucun mode démonstration, aucun compte de démonstration et aucune donnée fictive ne sont livrés.** La base est vide à l’exception d’un unique compte administrateur et des paramètres techniques.

Les **patients créent eux-mêmes leur compte** depuis la page publique (identifiant Santé+ et QR code générés automatiquement). Les comptes **médecin** et **établissement** restent créés ou validés par l’administration.

## Démarrage

```bash
npm ci
cp .env.example .env.local
# Renseignez DATABASE_URL, SESSION_SECRET, DATA_ENCRYPTION_KEY et le compte administrateur.
npm run db:migrate
npm run db:bootstrap
npm run dev -- --hostname 0.0.0.0 --port 3000
```

- `db:migrate` applique les migrations versionnées de `drizzle/`.
- `db:bootstrap` crée **un seul** administrateur si la base est vide, avec mot de passe temporaire et changement obligatoire à la première connexion. Il refuse de s’exécuter sur une base déjà peuplée.
- Ne lancez jamais `db:bootstrap` pour « réinitialiser » une base réelle. Les migrations sont la source de vérité du schéma.

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
2. Scannez le QR code dans une application TOTP.
3. Définissez un mot de passe définitif d’au moins 12 caractères.

Le mot de passe temporaire n’est affiché qu’une seule fois. Conservez-le dans un canal sûr jusqu’à la première connexion, puis détruisez-le.

## Système complet d’inscription, d’authentification et espace patient

### 1. Inscription et accès dédiés
- **/inscription** : page dédiée d'inscription patient avec validation en direct du nom, prénom, email, téléphone (unicité contrôlée en base), mot de passe (≥12 caractères, lettres et chiffres obligatoires, vérification anti-dictionnaire, confirmation identique). Consentement obligatoire à la politique de confidentialité (loi 2017-20). Rôle serveur **strictement forcé à `patient`**.
- **/connexion** : page dédiée de connexion sécurisée (email/téléphone + mot de passe), gestion des statuts de sécurité (2FA, changement de mot de passe initial pour les praticiens).
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
3. Remettez les identifiants par un canal sûr. Les médecins et comptes établissement doivent activer la 2FA et changer leur mot de passe temporaire.

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
