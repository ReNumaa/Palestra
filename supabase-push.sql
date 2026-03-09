-- ============================================================
-- SUPABASE PUSH — Thomas Bresciani Palestra (idempotente)
-- Esegui nel SQL Editor di Supabase.
-- ============================================================

-- ─── push_subscriptions ──────────────────────────────────────
-- Tabella che memorizza le subscription Web Push di ogni utente.
-- Ogni utente può avere più subscription (es. telefono + tablet).

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    endpoint   TEXT        UNIQUE NOT NULL,
    p256dh     TEXT        NOT NULL,
    auth       TEXT        NOT NULL,
    user_id    UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
    user_email TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS già definite in supabase-rls.sql (insert/select/delete own)

-- ─── reminder_1h_sent su bookings ────────────────────────────
-- Flag per evitare doppie notifiche: la Edge Function lo imposta
-- a true dopo aver inviato il promemoria 1h prima della lezione.

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reminder_1h_sent BOOLEAN DEFAULT false;

-- ─── Cron: pg_cron + pg_net ─────────────────────────────────
-- ALTERNATIVA A: Dashboard Supabase (CONSIGLIATO, più semplice)
--   Vai su: Dashboard → Edge Functions → send-reminders → Schedules
--   Aggiungi schedule: */5 * * * *
--
-- ALTERNATIVA B: pg_cron via SQL (richiede pg_cron + pg_net abilitati)
--   Vai su: Dashboard → Database → Extensions → abilita pg_cron e pg_net
--   Poi esegui il blocco qui sotto:

/*
SELECT cron.schedule(
    'send-reminders-1h',
    '*/5 * * * *',
    $$
    SELECT net.http_post(
        url     := 'https://ppymuuyoveyyoswcimck.supabase.co/functions/v1/send-reminders',
        headers := jsonb_build_object(
            'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
            'Content-Type',  'application/json'
        ),
        body    := '{}'::jsonb
    );
    $$
);
*/
