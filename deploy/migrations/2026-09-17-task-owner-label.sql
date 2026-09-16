-- Responsable de tâche en texte libre (champ "ownerLabel").
-- À exécuter une fois après `prisma db push` ; le script est rejouable sans effet de bord.
--
--   sudo -u postgres psql -d servicenow360 -f deploy/migrations/2026-09-17-task-owner-label.sql

BEGIN;

-- 1. Tâches affectées à un compte : on garde le nom de la personne.
UPDATE "Task" t
SET "ownerLabel" = u."firstName" || ' ' || u."lastName"
FROM "User" u
WHERE t."ownerId" = u.id
  AND t."ownerLabel" IS NULL;

-- 2. Tâches importées : le responsable du fichier était rangé dans la description.
UPDATE "Task"
SET "ownerLabel" = left(trim(substring(description FROM '(?i)Responsable au planning source\s*:\s*([^\n]+)')), 120)
WHERE "ownerLabel" IS NULL
  AND description ~* 'Responsable au planning source\s*:';

-- 3. On retire cette mention technique de la description.
UPDATE "Task"
SET description = NULLIF(trim(regexp_replace(description, '\n?Responsable au planning source\s*:\s*[^\n]*', '', 'gi')), '')
WHERE description ~* 'Responsable au planning source\s*:';

-- 4. Le responsable n'est plus un compte : l'ancien lien est rompu.
UPDATE "Task" SET "ownerId" = NULL WHERE "ownerId" IS NOT NULL;

COMMIT;
