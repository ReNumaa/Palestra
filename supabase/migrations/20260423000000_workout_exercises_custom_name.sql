-- ── Add custom_name to workout_exercises ──────────────────────────────────────
-- Nome personalizzato dell'esercizio scelto dal cliente. Si applica solo al
-- lato client (allenamento.html). In admin il trainer continua a vedere il
-- nome originale (exercise_name / imported_exercises.nome_it).
ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS custom_name TEXT;
