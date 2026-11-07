# Sécurité et déploiement — SANTÉ+

## État livré

- Aucun mode démonstration, aucun compte de démonstration, aucune donnée fictive.
- Base vide à l’exception d’un unique administrateur et des paramètres techniques.
- Migrations SQL versionnées (`drizzle/`) ; pas de `push` automatique en production.
- Amorçage administrateur idempotent et bloqué si la base contient déjà des données.
- Changement de mot de passe obligatoire à la première connexion.
- Authentification à deux facteurs : **non implémentée**. L’ancienne 2FA TOTP a été retirée du produit (migration `0003`). Les comptes privilégiés reposent donc uniquement sur un mot de passe robuste, une session de 12 heures révocable et une limitation du nombre de tentatives. Ce point doit être arbitré avant toute mise en production.
- Inscription patient ouverte depuis la page dédiée `/inscription` (5 tentatives/heure/IP), désactivable par le paramètre `registrations_open`. Le rôle est forcé côté serveur à `patient`. Les rôles médecin et établissement restent sous validation administrative stricte.
- Protection des routes côté serveur : `/espace` exige une session active et redirige immédiatement les visiteurs non authentifiés vers `/connexion`.
- Réinitialisation de mot de passe sécurisée : table `password_resets`, code aléatoire à usage unique valable 30 minutes, haché en base (SHA-256), révoquant toutes les sessions actives lors de sa consommation.
- Robustesse des mots de passe : ≥12 caractères, contrôle de complexité (lettres et chiffres), vérification anti-dictionnaire et rejet des mots de passe contenant le nom ou l'adresse email de l'utilisateur.
- Paiements en ligne désactivés ; encaissements réels enregistrés par l’établissement avec référence et audit.

## Secrets et configuration

Ne jamais committer `.env.local`, mots de passe, clés ou journaux d’amorçage.

- `SESSION_SECRET` : ≥ 48 caractères, unique par environnement.
- `DATA_ENCRYPTION_KEY` : 64 hexadécimaux (AES-256-GCM). Une perte de clé rend les données chiffrées illisibles ; une rotation doit être planifiée.
- `DATABASE_URL` : rôle applicatif à privilèges minimaux.
- `MIGRATION_DATABASE_URL` : rôle de migration, séparé du rôle applicatif.

En production : gestionnaire de secrets, TLS PostgreSQL, chiffrement au repos, sauvegardes chiffrées et restauration testée.

## Base de données

- Appliquer les migrations avec un rôle dédié : `npm run db:migrate`.
- Ne pas utiliser `drizzle-kit push` sur une base réelle.
- Le rôle applicatif ne doit pas pouvoir créer/altérer des schémas ni supprimer les journaux d’audit et les données médicales protégées.
- Provisionnement des rôles : `scripts/provision-db-roles.sql`, à exécuter une fois avec un superutilisateur après les migrations. Il crée `sante_migrator` (propriétaire, utilisé par `db:migrate`) et `sante_app` (DML seulement), et **retire à l’application le droit de modifier ou supprimer le journal d’audit** : celui-ci devient en ajout seul. Le script est idempotent.
- Vérification après provisionnement : `sante_app` ne doit pouvoir ni créer de table, ni `UPDATE`/`DELETE` sur `audit_logs`.
- Purge des données techniques : `npm run maintenance:purge` (ou `node scripts/maintenance-purge.mjs`), à planifier chaque nuit. `--dry-run` affiche les volumes sans rien supprimer. Chaque exécution est journalisée.
- Superviser connexions, locks, croissance, sauvegardes et échecs d’authentification.

## Supervision

- `GET /api/health` répond `200` avec `{ status, database, responseTimeMs }`, ou `503` si la base est injoignable. À brancher sur le contrôleur de disponibilité de l’hébergeur.
- `GET /api/health?deep=1` vérifie en plus que les tables critiques sont lisibles : à utiliser après une migration ou une restauration.
- Aucun outil de métriques n’est intégré : prévoir journaux centralisés, alerte sur le point de santé et sur les échecs d’authentification répétés.

## Comptes et habilitations

- Les patients s’inscrivent eux-mêmes ; vérifier la modération des inscriptions en cas d’abus.
- Créer les établissements avant les comptes qui leur sont rattachés.
- Remettre les mots de passe temporaires par un canal sûr, une seule fois.
- Vérifier l’identité et les habilitations des professionnels avant activation.
- Révoquer sessions et accès lors d’un départ ou d’une suspicion de compromission.
- Les demandes d’accès médecin ne doivent être approuvées qu’après vérification humaine.

## Données de santé

- Consentement de soins révocable, accès professionnels tracés.
- Documents médicaux chiffrés côté applicatif ; ne pas les servir sans contrôle d’accès.
- Export et demandes de confidentialité soumis à vérification d’identité.
- Définir une politique de conservation et de suppression conforme au cadre légal.

## Livraison et intégration continue

- `Dockerfile` multi-étapes : image de production sans sources ni secrets, exécutée par un utilisateur non privilégié, avec `HEALTHCHECK`.
- `.github/workflows/verifications.yml` : types, lint, audit des dépendances, build de production, et application des migrations sur une base PostgreSQL vierge.
- Un build réussi en local ne remplace pas la CI : le workflow vérifie aussi qu’une base vierge atteint le schéma attendu par migrations seules.

## Conservation des données

Voir `docs/CONSERVATION_DES_DONNEES.md` : durées, ce que la purge supprime, ce
qu’elle ne touche jamais, et la procédure d’anonymisation.

## Avant toute mise en production réelle

1. Validation APDP et conformité loi 2017-20.
2. Vérification d’identité (ANIP ou équivalent) et des ordres professionnels.
3. Intégration d’un prestataire de paiement réel et réconciliation.
4. Audit de sécurité indépendant, tests d’intrusion et revue des dépendances.
5. Sauvegardes, PRA/PCA, supervision et astreinte.
6. Tests de charge, accessibilité et parcours utilisateurs réels.
7. Envoi d’emails et de SMS : **aucun transport n’est implémenté**. La remise des codes de réinitialisation et la vérification des inscriptions passent aujourd’hui par l’administration. À intégrer avant l’ouverture au public.
8. Authentification à deux facteurs : absente (voir plus haut), à arbitrer.
9. Planification de la purge nocturne et surveillance de ses volumes.

Tant que ces étapes ne sont pas validées, l’application ne doit pas recevoir de données de santé réelles.
