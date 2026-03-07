-- ============================================================
-- SUPABASE RLS — Thomas Bresciani Palestra
-- Da eseguire nell'SQL Editor di Supabase dopo aver creato
-- le tabelle tramite lo schema principale.
--
-- STRATEGIA:
--   - Utenti normali (anon / authenticated): possono leggere e
--     scrivere SOLO i propri dati (filtrati per email/user_id).
--   - Admin: usa la service_role key (solo nelle Edge Functions,
--     MAI esposta nel frontend). La service_role bypassa RLS.
--   - La anon key pubblica non deve mai vedere dati altrui.
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. TABELLA: bookings
--    Colonne attese: id, user_id (uuid, FK → auth.users),
--    date, time, slot_type, name, email, whatsapp, notes,
--    status, paid, payment_method, paid_at, credit_applied,
--    created_at, cancelled_at, ...
-- ─────────────────────────────────────────────────────────────

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Un utente autenticato vede solo le proprie prenotazioni
CREATE POLICY "bookings_select_own"
    ON bookings FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Un utente autenticato può creare prenotazioni solo per sé stesso
CREATE POLICY "bookings_insert_own"
    ON bookings FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

-- Un utente autenticato può aggiornare solo le proprie prenotazioni
-- (es. richiedere cancellazione). Campi critici come paid/payment_method
-- vanno aggiornati solo dalla service_role (Edge Function admin).
CREATE POLICY "bookings_update_own"
    ON bookings FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Nessun utente può cancellare fisicamente una prenotazione dal frontend
-- (la cancellazione è logica: status = 'cancelled')
-- La DELETE fisica è riservata alla service_role tramite Edge Function.
-- Non serve una policy DELETE per authenticated: il default è DENY.


-- ─────────────────────────────────────────────────────────────
-- 2. TABELLA: users (profilo esteso, separato da auth.users)
--    Colonne attese: id (uuid, FK → auth.users), name, email,
--    whatsapp, certificato_medico_scadenza,
--    certificato_medico_history (jsonb), created_at
-- ─────────────────────────────────────────────────────────────

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Lettura: solo il proprio profilo
CREATE POLICY "users_select_own"
    ON users FOR SELECT
    TO authenticated
    USING (id = auth.uid());

-- Inserimento: solo il proprio profilo (eseguito al momento della registrazione)
CREATE POLICY "users_insert_own"
    ON users FOR INSERT
    TO authenticated
    WITH CHECK (id = auth.uid());

-- Aggiornamento: solo il proprio profilo
CREATE POLICY "users_update_own"
    ON users FOR UPDATE
    TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());


-- ─────────────────────────────────────────────────────────────
-- 3. TABELLA: credits
--    Colonne attese: id, user_id (uuid), whatsapp, email,
--    name, balance (numeric), free_balance (numeric),
--    history (jsonb), updated_at
-- ─────────────────────────────────────────────────────────────

ALTER TABLE credits ENABLE ROW LEVEL SECURITY;

-- Un utente vede solo il proprio saldo
CREATE POLICY "credits_select_own"
    ON credits FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- INSERT e UPDATE sono riservati alla service_role (admin tramite Edge Function).
-- Gli utenti non possono aumentare il proprio credito dal frontend.


-- ─────────────────────────────────────────────────────────────
-- 4. TABELLA: schedule_overrides
--    Colonne attese: id, date (date), time (text),
--    type (text), extras (jsonb), client_user_id (uuid),
--    updated_at
--    Questa tabella definisce il calendario settimanale.
--    Gli utenti la leggono per vedere disponibilità; solo
--    l'admin (service_role) può scriverla.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE schedule_overrides ENABLE ROW LEVEL SECURITY;

-- Tutti gli utenti autenticati e anonimi possono leggere il calendario
-- (necessario per mostrare gli slot disponibili senza login)
CREATE POLICY "schedule_overrides_select_public"
    ON schedule_overrides FOR SELECT
    TO anon, authenticated
    USING (true);

-- Scrittura solo via service_role (nessuna policy INSERT/UPDATE/DELETE
-- per anon o authenticated → default DENY).


-- ─────────────────────────────────────────────────────────────
-- 5. TABELLA: manual_debts
--    Colonne attese: id, user_id (uuid), whatsapp, email,
--    name, balance (numeric), history (jsonb), updated_at
--    Creata e gestita solo dall'admin.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE manual_debts ENABLE ROW LEVEL SECURITY;

-- Un utente vede solo il proprio saldo debiti manuali
CREATE POLICY "manual_debts_select_own"
    ON manual_debts FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Tutto il resto (INSERT/UPDATE/DELETE) è riservato alla service_role.


-- ─────────────────────────────────────────────────────────────
-- 6. TABELLA: push_subscriptions
--    Colonne attese: id (uuid), endpoint (text unique),
--    p256dh (text), auth (text), user_id (uuid),
--    created_at (timestamptz)
-- ─────────────────────────────────────────────────────────────

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Un utente può registrare la propria subscription
CREATE POLICY "push_subscriptions_insert_own"
    ON push_subscriptions FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

-- Un utente può vedere la propria subscription (per evitare doppioni)
CREATE POLICY "push_subscriptions_select_own"
    ON push_subscriptions FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Un utente può cancellare la propria subscription (logout / revoca)
CREATE POLICY "push_subscriptions_delete_own"
    ON push_subscriptions FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());


-- ─────────────────────────────────────────────────────────────
-- 7. TABELLA: settings (impostazioni admin globali)
--    Colonne attese: key (text primary key), value (text),
--    updated_at
--    Contiene soglia debito, blocco certificato, ecc.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Tutti possono leggere le impostazioni (necessario per blocco prenotazioni
-- lato client: soglia debito, blocco certificato medico)
CREATE POLICY "settings_select_public"
    ON settings FOR SELECT
    TO anon, authenticated
    USING (true);

-- Scrittura riservata alla service_role (admin tramite Edge Function).


-- ─────────────────────────────────────────────────────────────
-- NOTE OPERATIVE
-- ─────────────────────────────────────────────────────────────
--
-- 1. ADMIN ACCESS: tutte le operazioni di lettura globale e
--    scrittura devono passare per Supabase Edge Functions
--    autenticate con la service_role key, che bypassa RLS.
--    La service_role key va in Supabase Secrets, MAI nel frontend.
--
-- 2. VERIFICA FINALE: dopo aver applicato queste policy, testare
--    con la anon key (dal browser, senza login) che:
--      SELECT * FROM bookings → 0 righe (RLS blocca tutto per anon)
--      SELECT * FROM schedule_overrides → righe visibili (public read)
--      SELECT * FROM settings → righe visibili (public read)
--    E con un utente autenticato che:
--      SELECT * FROM bookings → solo le proprie prenotazioni
--      SELECT * FROM bookings WHERE user_id != auth.uid() → 0 righe
--
-- 3. ATOMIC BOOKING: per evitare race conditions, usare una
--    Supabase RPC (funzione PostgreSQL) che esegue in un'unica
--    transazione:
--      a. Controlla disponibilità slot con SELECT FOR UPDATE
--      b. Verifica debito e certificato medico
--      c. Inserisce la prenotazione
--    Esempio di firma:
--      CREATE OR REPLACE FUNCTION book_slot(
--          p_date date, p_time text, p_slot_type text
--      ) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
--      ...
--      $$;
--
-- 4. ADMIN ROLE: valutare l'aggiunta di un claim custom nel JWT
--    per distinguere l'admin dagli utenti normali:
--      UPDATE auth.users SET raw_app_meta_data =
--          jsonb_set(raw_app_meta_data, '{role}', '"admin"')
--      WHERE email = 'thomas@example.com';
--    Da verificare nelle Edge Functions con:
--      const isAdmin = req.headers.get('x-admin-secret') === process.env.ADMIN_SECRET
--    oppure con JWT claims: auth.jwt() ->> 'role' = 'admin'
