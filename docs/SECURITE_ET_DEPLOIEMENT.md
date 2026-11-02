# SANTÉ+ — sécurité et critères de mise en service

## Statut actuel

**Pilote fonctionnel avec données fictives, pas un système national homologué.** Les espaces patient, médecin, établissement et administration partagent une base PostgreSQL. Les parcours de rendez-vous, consultation/ordonnance, documents, stocks, finances de démonstration et droits des patients sont reliés. L'activation `ENABLE_DEMO_MODE=true` est réservée à ce sandbox. **Ne jamais saisir de données réelles dans ce pilote.**

## Mesures intégrées et vérifiables

- Connexion par mot de passe haché bcrypt, sessions opaques aléatoires révocables en base, cookie HttpOnly/Secure/SameSite Strict. Durée : 12 h pour rôles sensibles, 7 jours pour patient.
- TOTP obligatoire pour médecin, hôpital et administration. Secrets TOTP et fichiers médicaux chiffrés en AES-256-GCM avec `DATA_ENCRYPTION_KEY`. Pas de clé dans le code.
- Contrôle d'origine, en-têtes CSP/HSTS/anti-cadrage/no-referrer, limitation des tentatives partagée en PostgreSQL.
- Un NPI ou QR **identifie, mais n'autorise pas l'accès**. Autorisations de soins explicites, expirables et révocables ; contrôle serveur sur lecture, export, upload et consultation. L'administration ne reçoit pas les dossiers cliniques.
- Journal d'audit des actions sensibles, exports et accès ; pas de symptômes conservés dans le journal.
- Compte SQL applicatif distinct du superutilisateur, sans permissions DDL ; TLS requis pour les bases distantes.
- Aucune donnée médicale persistée dans le stockage du navigateur pour l'accès hors ligne. L'assistant local ne transmet rien ; l'IA externe n'est appelée que si une clé serveur existe et si l'utilisateur accepte explicitement.

## Blocages avant données réelles / déploiement national

1. **Cadre juridique béninois** : désigner formellement le responsable du traitement, le DPO/point de contact, les responsables hospitaliers ; consulter l'APDP et accomplir les formalités applicables à la loi n° 2017-20. Valider la politique de confidentialité, les bases légales, les durées de conservation et les contrats des sous-traitants. La page actuelle est un brouillon de transparence, **pas une certification**.
2. **Identité nationale** : le champ `npi` de ce pilote est un identifiant interne fictif. Il ne faut pas le présenter comme un NPI officiel. Intégrer un mécanisme autorisé de vérification d'identité/ANIP et traiter homonymies, doublons, mineurs et représentants légaux avant production.
3. **Onboarding vérifié** : confirmer email/téléphone par canal sécurisé, vérifier les licences ONMB et l'habilitation des établissements par contrôle humain documenté. Les comptes créés par validation doivent recevoir leurs identifiants par un canal secret et forcer leur rotation au premier accès. Prévoir récupération 2FA, rotation des mots de passe et détection d'abus.
4. **Paiement** : MTN/MOOV est **simulé uniquement pour les comptes fictifs**. Pour les comptes réels, le serveur refuse le paiement. Intégrer un prestataire agréé avec contrats, webhooks signés, idempotence, rapprochement et remboursements avant d'encaisser.
5. **Infrastructure** : hébergement agréé pour données de santé, chiffrement des disques et sauvegardes, clés dans un KMS/HSM (rotation et contrôle d'accès), TLS bout-en-bout, isolation réseau, sauvegardes restaurées périodiquement, PRA/PCA, antivirus sur les fichiers, supervision et alerting. Remplacer la base locale et les secrets `.env` du sandbox.
6. **Sécurité applicative** : audit de code indépendant, tests d'intrusion, tests de charge nationaux, revue clinique de l'assistant, revue des dépendances, durcissement CSP avec nonces, sessions multi-appareils, politique de conservation des journaux et procédure de réponse aux incidents. Ajouter RLS PostgreSQL et séparation des responsabilités par établissement.
7. **Montée en charge** : les listes sont plafonnées pour ce pilote ; implémenter pagination serveur, statistiques agrégées exactes, index adaptés, traitement asynchrone des notifications, transactions atomiques pour les parcours multi-écritures et réplication/observabilité avant usage national.
8. **Interopérabilité** : définir un modèle de données clinique validé, codifications médicales, gestion de provenance, signatures des ordonnances, parcours pharmacie, intégrations HIS/LIS/PACS/FHIR et workflows d'urgence vérifiés avec les structures partenaires.
9. **Hors ligne** : le pilote ne conserve pas les dossiers sur l'appareil. Une vraie consultation hors ligne exige une conception chiffrée, une politique de terminal fiable et une analyse d'impact spécifique.

## Variables requises

- `DATABASE_URL` : compte applicatif à permissions limitées ; TLS requis hors localhost.
- `SESSION_SECRET` : secret aléatoire >= 48 caractères, stable et partagé entre instances.
- `DATA_ENCRYPTION_KEY` : 32 octets hexadécimaux, à conserver en KMS ; rotation planifiée.
- `ENABLE_DEMO_MODE` : `true` **uniquement** avec base isolée et données fictives ; `false` en production.
- `OPENAI_API_KEY` / `OPENAI_MODEL` facultatifs : la transmission n'a lieu qu'après accord explicite ; contrat de sous-traitance nécessaire avant activation réelle.

## Tests de fumée

Après lancement du serveur, exécuter `node scripts/security-smoke.mjs`. Il vérifie le refus anonyme, l'absence de bascule directe admin, le TOTP, l'isolation des dossiers et les en-têtes de sécurité. Les tests de charge et de conformité restent à réaliser.
