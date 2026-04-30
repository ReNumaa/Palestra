-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: monthly_reports — campo goal (obiettivo del cliente)
--
-- La feature report passa da "scelta del tono" a "scelta dell'obiettivo".
-- L'utente seleziona uno dei 6 obiettivi (dimagrimento, massa, tonificazione,
-- forza, salute, recupero) e l'Edge Function adatta tono e linee guida del
-- report di conseguenza.
--
-- Il campo `tone` resta NOT NULL per compat. con i record già generati: la
-- nuova Edge Function lo riempie sempre con 'motivational' (il tono effettivo
-- è derivato dal goal). Possiamo deprecarlo in una migrazione futura.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE monthly_reports
    ADD COLUMN goal TEXT
        CHECK (goal IN (
            'dimagrimento',
            'massa',
            'tonificazione',
            'forza',
            'salute',
            'recupero'
        ));

CREATE INDEX IF NOT EXISTS idx_monthly_reports_user_month_goal
    ON monthly_reports(user_id, year_month, goal);

COMMENT ON COLUMN monthly_reports.goal IS
    'Obiettivo selezionato dal cliente per questo report. NULL sui record antecedenti l''introduzione della feature obiettivi.';
