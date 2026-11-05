# Sécurité et déploiement — SANTÉ+

## État livré

- Aucun mode démonstration, aucun compte de démonstration, aucune donnée fictive.
- Base vide à l’exception d’un unique administrateur et des paramètres techniques.
- Migrations SQL versionnées (`drizzle/`) ; pas de `push` automatique en production.
- Amorçage administrateur idempotent et bloqué si la base contient déjà des données.
- Changement de mot de passe obligatoire à la première connexion.
- 2FA TOTP obligatoire pour les rôles médecin, hôpital et administrateur.
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
- Superviser connexions, locks, croissance, sauvegardes et échecs d’authentification.

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

## Avant toute mise en production réelle

1. Validation APDP et conformité loi 2017-20.
2. Vérification d’identité (ANIP ou équivalent) et des ordres professionnels.
3. Intégration d’un prestataire de paiement réel et réconciliation.
4. Audit de sécurité indépendant, tests d’intrusion et revue des dépendances.
5. Sauvegardes, PRA/PCA, supervision et astreinte.
6. Tests de charge, accessibilité et parcours utilisateurs réels.

Tant que ces étapes ne sont pas validées, l’application ne doit pas recevoir de données de santé réelles.
