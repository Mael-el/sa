-- ============================================================================
-- Rôles PostgreSQL pour SANTÉ+ — à exécuter UNE FOIS, avec un superutilisateur,
-- sur la base de production, APRÈS `npm run db:migrate`.
--
-- Principe : l'application ne doit jamais détenir de droits de structure. Si la
-- connexion applicative est compromise, l'attaquant peut lire et écrire les
-- lignes autorisées par les règles ci-dessous, mais ne peut ni créer, ni
-- modifier, ni supprimer une table, ni neutraliser le journal d'audit.
--
--   sante_migrator  propriétaire du schéma, exécute les migrations
--   sante_app       droits DML uniquement, utilisé par l'application
--
-- Remplacez les deux mots de passe avant exécution. Ne les committez jamais.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- 1. Rôles de connexion, sans attributs superflus.
--    Idempotent : rejouable sans échouer si les rôles existent déjà. Le mot de
--    passe n'est modifié qu'à la création — une rotation passe par ALTER ROLE.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sante_migrator') THEN
    CREATE ROLE sante_migrator LOGIN PASSWORD 'REMPLACER_MOT_DE_PASSE_MIGRATION'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sante_app') THEN
    CREATE ROLE sante_app LOGIN PASSWORD 'REMPLACER_MOT_DE_PASSE_APPLICATION'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END $$;

-- 2. Pas de schéma public en écriture pour tous (comportement par défaut de
--    PostgreSQL 15+ : public n'est déjà plus inscriptible par PUBLIC ; on le
--    rend explicite pour les versions antérieures).
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO sante_migrator, sante_app;

-- 3. Le migrateur possède les tables et séquences existantes.
--    (Sur une base déjà initialisée, ce bloc ne change rien : il sécurise le cas
--    d'une base créée par un autre compte que le migrateur.)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO sante_migrator', r.tablename);
  END LOOP;
  FOR r IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER SEQUENCE public.%I OWNER TO sante_migrator', r.sequencename);
  END LOOP;
END $$;

-- 4. L'application : lecture et écriture, rien de plus.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sante_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sante_app;

-- 5. Les tables qui ne doivent JAMAIS être modifiées par l'application.
--    Le journal d'audit est en ajout seul : une ligne écrite ne peut plus être
--    réécrite ni effacée par le compte applicatif, y compris en cas de faille
--    applicative. Seul le rôle de migration peut intervenir (purge légale).
REVOKE UPDATE, DELETE ON public.audit_logs FROM sante_app;
GRANT INSERT, SELECT ON public.audit_logs TO sante_app;

COMMIT;

-- 6. Vérification : ces deux requêtes doivent renvoyer 0 ligne.
--    SELECT * FROM information_schema.role_table_grants
--     WHERE grantee = 'sante_app' AND table_name = 'audit_logs'
--       AND privilege_type IN ('UPDATE','DELETE');
--
--    SELECT has_schema_privilege('sante_app', 'public', 'CREATE'); -- doit être false

-- 7. Droits par défaut pour les tables créées par les migrations suivantes.
ALTER DEFAULT PRIVILEGES FOR ROLE sante_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sante_app;
ALTER DEFAULT PRIVILEGES FOR ROLE sante_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO sante_app;
