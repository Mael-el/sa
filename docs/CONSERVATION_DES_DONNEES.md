# Politique de conservation des données — SANTÉ+

Ce document fixe la durée de vie de chaque catégorie de données et l'outillage qui
l'applique. Il répond à une exigence de la loi 2017-20 (protection des données à
caractère personnel au Bénin) : une donnée ne peut être conservée indéfiniment
sans finalité.

**Cette politique doit être validée par le responsable de traitement et par
l'APDP avant toute mise en production réelle.** Les durées ci-dessous sont des
propositions conformes aux pratiques du secteur de la santé, pas une décision
juridique.

## Ce que la purge automatique supprime

`node scripts/maintenance-purge.mjs` — à planifier chaque nuit en production.

| Donnée | Table | Conservation | Motif |
|---|---|---|---|
| Sessions expirées | `sessions` | 30 jours après expiration | Investigation d'incident |
| Codes de réinitialisation | `password_resets` | 7 jours après expiration ou usage | Traçabilité courte, code déjà inutilisable |
| Compteurs de limitation | `rate_limits` | Fin de la fenêtre | Aucun effet au-delà |
| Notifications lues | `notifications` | 180 jours après lecture | Confort ; les non lues sont conservées |

Le script accepte `--dry-run`, qui affiche les volumes sans rien supprimer, et
**consigne chaque exécution dans le journal d'audit**.

## Ce que la purge ne touche jamais

Volontairement hors périmètre : le dossier médical, les ordonnances, les
documents, les rendez-vous, les consentements et le journal d'audit.

Une suppression dans ces tables ne relève pas d'un script planifié mais d'une
procédure encadrée : demande d'exercice de droits (`privacy_requests`), vérification
d'identité par l'administration, puis traitement manuel et journalisé. Une purge
automatique de données de santé effacerait des éléments dont le patient peut avoir
besoin, et que la loi peut obliger à conserver.

## Durées recommandées pour les données de santé

À arbitrer avec un juriste, puis à implémenter via une procédure encadrée :

| Donnée | Durée proposée | Remarque |
|---|---|---|
| Dossier médical | 20 ans après le dernier acte | Aligné sur les usages de conservation médicale |
| Ordonnances | 10 ans | Utile en cas de contrôle pharmaceutique |
| Documents médicaux | Durée du dossier | Chiffrés au repos (AES-256-GCM) |
| Journal d'audit | 3 ans minimum | Preuve de conformité ; l'app ne peut ni le modifier ni l'effacer |
| Consentements révoqués | 5 ans | Preuve du consentement et de sa révocation |
| Comptes inactifs | Anonymisation après 3 ans | Sur demande ou décision du responsable |

## Comptes et anonymisation

La suppression d'un compte n'est pas encore automatisée. Le chemin prévu :

1. le patient dépose une demande via `privacy_requests` (droit à l'effacement) ;
2. l'administration vérifie son identité ;
3. les données sont anonymisées, pas supprimées en cascade : le dossier clinique
   reste lié à un identifiant technique, sans nom, sans contact, sans NPI.

La suppression brutale est écartée : treize clés étrangères en `NO ACTION`
protègent l'intégrité clinique, et effacer un dossier médical peut détruire une
preuve utile au patient lui-même.

## Planification en production

Exemple de tâche quotidienne (crontab du serveur applicatif) :

```cron
# Purge quotidienne à 03:15, journalisée dans les logs système
15 3 * * * cd /srv/sante && node scripts/maintenance-purge.mjs >> /var/log/sante/purge.log 2>&1
```

À surveiller : le nombre de lignes purgées chaque nuit. Une chute brutale ou une
croissance anormale des sessions révèle un problème d'authentification ou
d'utilisation.
