-- ── Repair: aggancia/risincronizza workout_exercises a imported_exercises ────
-- Le rinomine fatte da Importa prima del fix JS lasciavano workout_exercises
-- con exercise_name vecchio e (per le righe legacy) exercise_slug NULL.
-- Questa migration:
--   1. Aggancia le righe orfane (slug NULL) facendo match case-insensitive
--      del nome corrente contro nome_it o nome_original di imported_exercises,
--      e contestualmente sincronizza il nome al valore attuale.
--   2. Per le righe gia' linkate via slug ma con exercise_name desync (es.
--      rinomine fatte prima del fix di propagazione), riallinea exercise_name
--      al nome_it corrente.

-- 1. Backfill slug + sync nome sulle orfane
UPDATE workout_exercises we
SET    exercise_slug = ie.slug,
       exercise_name = ie.nome_it
FROM   imported_exercises ie
WHERE  we.exercise_slug IS NULL
  AND  (
        LOWER(TRIM(we.exercise_name)) = LOWER(TRIM(ie.nome_it))
     OR (ie.nome_original IS NOT NULL
         AND LOWER(TRIM(we.exercise_name)) = LOWER(TRIM(ie.nome_original)))
  );

-- 2. Sync nome sulle righe gia' linkate ma desync
UPDATE workout_exercises we
SET    exercise_name = ie.nome_it
FROM   imported_exercises ie
WHERE  we.exercise_slug IS NOT NULL
  AND  we.exercise_slug = ie.slug
  AND  we.exercise_name IS DISTINCT FROM ie.nome_it;
