-- ═══════════════════════════════════════════════════════════════════════════
-- Slot access requests (richieste di accesso a slot full)
-- ═══════════════════════════════════════════════════════════════════════════
-- Permette a un utente loggato di richiedere accesso a uno slot small-group
-- pieno. La richiesta resta `pending` finché:
--   1) Admin la approva manualmente (booking over-capacity)
--   2) Si libera un posto naturalmente → diventa `offered`, l'utente riceve
--      una push e può accettare/rifiutare
--   3) Lo slot inizia → diventa `expired`
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS slot_access_requests (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    user_name           TEXT NOT NULL,
    user_email          TEXT NOT NULL,
    user_whatsapp       TEXT,
    date                DATE NOT NULL,
    time                TEXT NOT NULL,
    slot_type           TEXT NOT NULL,
    date_display        TEXT,
    status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','offered','approved','declined_user','expired')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    offered_at          TIMESTAMPTZ,
    resolved_at         TIMESTAMPTZ,
    resolved_booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
    notes               TEXT
);

CREATE INDEX IF NOT EXISTS idx_sar_slot_active
    ON slot_access_requests(date, time, slot_type, created_at)
    WHERE status IN ('pending','offered');

CREATE INDEX IF NOT EXISTS idx_sar_user
    ON slot_access_requests(user_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sar_one_active_per_user_slot
    ON slot_access_requests(user_id, date, time, slot_type)
    WHERE status IN ('pending','offered');

ALTER TABLE slot_access_requests ENABLE ROW LEVEL SECURITY;

-- SELECT: proprietario o admin
CREATE POLICY sar_select_self_or_admin ON slot_access_requests
    FOR SELECT
    USING (user_id = auth.uid() OR is_admin());

-- INSERT: revocato per authenticated → solo via RPC SECURITY DEFINER
-- (nessuna policy permissiva)

-- UPDATE: admin tutto; utente solo le proprie righe e solo se non già finalizzate
CREATE POLICY sar_update_admin ON slot_access_requests
    FOR UPDATE
    USING (is_admin())
    WITH CHECK (is_admin());

-- DELETE: solo admin
CREATE POLICY sar_delete_admin ON slot_access_requests
    FOR DELETE
    USING (is_admin());


-- ─── RPC: create_slot_access_request ─────────────────────────────────────────
-- Crea una nuova richiesta di accesso. Verifica:
--   - utente loggato
--   - lo slot è effettivamente full
--   - utente non ha già un booking attivo per quello slot
--   - utente non ha già una richiesta attiva
CREATE OR REPLACE FUNCTION create_slot_access_request(
    p_date         TEXT,
    p_time         TEXT,
    p_slot_type    TEXT,
    p_max_capacity INTEGER,
    p_date_display TEXT DEFAULT ''
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_uid     UUID := auth.uid();
    v_profile RECORD;
    v_count   INTEGER;
    v_id      UUID;
    v_existing_active INTEGER;
    v_existing_booking INTEGER;
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
    END IF;

    IF p_date::DATE < current_date THEN
        RETURN jsonb_build_object('success', false, 'error', 'past_date');
    END IF;

    SELECT id, name, email, whatsapp INTO v_profile FROM profiles WHERE id = v_uid;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'profile_not_found');
    END IF;

    -- Verifica che lo slot sia effettivamente full
    SELECT COUNT(*) INTO v_count
    FROM   bookings
    WHERE  date      = p_date::DATE
      AND  time      = p_time
      AND  slot_type = p_slot_type
      AND  status IN ('confirmed', 'cancellation_requested');

    IF v_count < p_max_capacity THEN
        RETURN jsonb_build_object('success', false, 'error', 'slot_not_full');
    END IF;

    -- Utente non deve avere un booking attivo proprio
    SELECT COUNT(*) INTO v_existing_booking
    FROM   bookings
    WHERE  date      = p_date::DATE
      AND  time      = p_time
      AND  slot_type = p_slot_type
      AND  user_id   = v_uid
      AND  status IN ('confirmed', 'cancellation_requested');

    IF v_existing_booking > 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'already_booked');
    END IF;

    -- Utente non deve avere già una richiesta attiva
    SELECT COUNT(*) INTO v_existing_active
    FROM   slot_access_requests
    WHERE  date      = p_date::DATE
      AND  time      = p_time
      AND  slot_type = p_slot_type
      AND  user_id   = v_uid
      AND  status IN ('pending', 'offered');

    IF v_existing_active > 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'already_requested');
    END IF;

    INSERT INTO slot_access_requests (
        user_id, user_name, user_email, user_whatsapp,
        date, time, slot_type, date_display, status
    ) VALUES (
        v_uid,
        COALESCE(v_profile.name, ''),
        COALESCE(lower(trim(v_profile.email)), ''),
        v_profile.whatsapp,
        p_date::DATE, p_time, p_slot_type, p_date_display, 'pending'
    )
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('success', true, 'request_id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION create_slot_access_request FROM public;
GRANT EXECUTE ON FUNCTION create_slot_access_request TO authenticated;


-- ─── RPC: _offer_next_in_queue ───────────────────────────────────────────────
-- Trova la prima richiesta pending FIFO per (date, time, slot_type) e la passa
-- a 'offered'. Ritorna la riga (o NULL) per permettere al chiamante di mandare
-- la push notification.
CREATE OR REPLACE FUNCTION _offer_next_in_queue(
    p_date      DATE,
    p_time      TEXT,
    p_slot_type TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_req RECORD;
BEGIN
    SELECT * INTO v_req
    FROM   slot_access_requests
    WHERE  date      = p_date
      AND  time      = p_time
      AND  slot_type = p_slot_type
      AND  status    = 'pending'
    ORDER  BY created_at ASC
    LIMIT  1
    FOR UPDATE SKIP LOCKED;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    UPDATE slot_access_requests
    SET    status = 'offered',
           offered_at = now()
    WHERE  id = v_req.id;

    RETURN jsonb_build_object(
        'id',           v_req.id,
        'user_id',      v_req.user_id,
        'user_name',    v_req.user_name,
        'user_email',   v_req.user_email,
        'date',         v_req.date::TEXT,
        'time',         v_req.time,
        'slot_type',    v_req.slot_type,
        'date_display', v_req.date_display
    );
END;
$$;

REVOKE ALL ON FUNCTION _offer_next_in_queue FROM public;
-- Non serve grant su authenticated: chiamata solo da altre RPC SECURITY DEFINER
GRANT EXECUTE ON FUNCTION _offer_next_in_queue TO service_role;


-- ─── RPC: accept_offered_request ─────────────────────────────────────────────
-- Utente accetta il posto offerto: crea booking normale (capacity+1 bypass)
-- e marca richiesta approved.
CREATE OR REPLACE FUNCTION accept_offered_request(
    p_request_id   UUID,
    p_max_capacity INTEGER
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_uid     UUID := auth.uid();
    v_req     RECORD;
    v_count   INTEGER;
    v_book_id UUID;
    v_now     TIMESTAMPTZ := now();
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
    END IF;

    SELECT * INTO v_req
    FROM   slot_access_requests
    WHERE  id = p_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'request_not_found');
    END IF;

    IF v_req.user_id IS DISTINCT FROM v_uid THEN
        RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
    END IF;

    IF v_req.status <> 'offered' THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_offered', 'status', v_req.status);
    END IF;

    -- Lock advisory + count su slot, max_capacity + 1 (bypass per offered)
    PERFORM pg_advisory_xact_lock(hashtext(v_req.date::TEXT || '|' || v_req.time || '|' || v_req.slot_type));

    SELECT COUNT(*) INTO v_count
    FROM   bookings
    WHERE  date      = v_req.date
      AND  time      = v_req.time
      AND  slot_type = v_req.slot_type
      AND  status IN ('confirmed', 'cancellation_requested');

    IF v_count >= p_max_capacity + 1 THEN
        RETURN jsonb_build_object('success', false, 'error', 'slot_full');
    END IF;

    INSERT INTO bookings (
        local_id, user_id, date, time, slot_type,
        name, email, whatsapp, status, created_at, date_display
    ) VALUES (
        'local_' || extract(epoch from v_now)::bigint || '_' || substr(md5(random()::text), 1, 6),
        v_uid,
        v_req.date,
        v_req.time,
        v_req.slot_type,
        v_req.user_name,
        v_req.user_email,
        COALESCE(v_req.user_whatsapp, ''),
        'confirmed',
        v_now,
        COALESCE(v_req.date_display, '')
    )
    RETURNING id INTO v_book_id;

    UPDATE slot_access_requests
    SET    status = 'approved',
           resolved_at = v_now,
           resolved_booking_id = v_book_id
    WHERE  id = p_request_id;

    RETURN jsonb_build_object('success', true, 'booking_id', v_book_id);
END;
$$;

REVOKE ALL ON FUNCTION accept_offered_request FROM public;
GRANT EXECUTE ON FUNCTION accept_offered_request TO authenticated;


-- ─── RPC: decline_offered_request ────────────────────────────────────────────
-- Utente rifiuta il posto offerto. Si offre al prossimo in coda.
CREATE OR REPLACE FUNCTION decline_offered_request(
    p_request_id UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_uid  UUID := auth.uid();
    v_req  RECORD;
    v_next JSONB;
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
    END IF;

    SELECT * INTO v_req
    FROM   slot_access_requests
    WHERE  id = p_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'request_not_found');
    END IF;

    IF v_req.user_id IS DISTINCT FROM v_uid THEN
        RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
    END IF;

    IF v_req.status <> 'offered' THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_offered');
    END IF;

    UPDATE slot_access_requests
    SET    status = 'declined_user',
           resolved_at = now()
    WHERE  id = p_request_id;

    -- Offri al prossimo
    v_next := _offer_next_in_queue(v_req.date, v_req.time, v_req.slot_type);

    RETURN jsonb_build_object('success', true, 'offered_request', v_next);
END;
$$;

REVOKE ALL ON FUNCTION decline_offered_request FROM public;
GRANT EXECUTE ON FUNCTION decline_offered_request TO authenticated;


-- ─── RPC: admin_approve_access_request ───────────────────────────────────────
-- Admin approva manualmente una richiesta: crea booking over-capacity,
-- marca approved. Funziona sia da pending che da offered.
CREATE OR REPLACE FUNCTION admin_approve_access_request(
    p_request_id   UUID,
    p_max_capacity INTEGER
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_req     RECORD;
    v_count   INTEGER;
    v_book_id UUID;
    v_now     TIMESTAMPTZ := now();
BEGIN
    IF NOT is_admin() THEN
        RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
    END IF;

    SELECT * INTO v_req
    FROM   slot_access_requests
    WHERE  id = p_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'request_not_found');
    END IF;

    IF v_req.status NOT IN ('pending', 'offered') THEN
        RETURN jsonb_build_object('success', false, 'error', 'already_resolved', 'status', v_req.status);
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext(v_req.date::TEXT || '|' || v_req.time || '|' || v_req.slot_type));

    SELECT COUNT(*) INTO v_count
    FROM   bookings
    WHERE  date      = v_req.date
      AND  time      = v_req.time
      AND  slot_type = v_req.slot_type
      AND  status IN ('confirmed', 'cancellation_requested');

    -- Bypass: ammette over-capacity di 1
    IF v_count >= p_max_capacity + 1 THEN
        RETURN jsonb_build_object('success', false, 'error', 'slot_full_already_over');
    END IF;

    INSERT INTO bookings (
        local_id, user_id, date, time, slot_type,
        name, email, whatsapp, status, created_at, date_display
    ) VALUES (
        'local_' || extract(epoch from v_now)::bigint || '_' || substr(md5(random()::text), 1, 6),
        v_req.user_id,
        v_req.date,
        v_req.time,
        v_req.slot_type,
        v_req.user_name,
        v_req.user_email,
        COALESCE(v_req.user_whatsapp, ''),
        'confirmed',
        v_now,
        COALESCE(v_req.date_display, '')
    )
    RETURNING id INTO v_book_id;

    UPDATE slot_access_requests
    SET    status = 'approved',
           resolved_at = v_now,
           resolved_booking_id = v_book_id
    WHERE  id = p_request_id;

    RETURN jsonb_build_object('success', true, 'booking_id', v_book_id);
END;
$$;

REVOKE ALL ON FUNCTION admin_approve_access_request FROM public;
GRANT EXECUTE ON FUNCTION admin_approve_access_request TO authenticated;


-- ─── RPC: expire_started_slot_requests ───────────────────────────────────────
-- Marca expired tutte le richieste pending/offered il cui slot è già iniziato.
CREATE OR REPLACE FUNCTION expire_started_slot_requests()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_count INTEGER := 0;
    v_req   RECORD;
    v_start TIMESTAMPTZ;
BEGIN
    FOR v_req IN
        SELECT id, date, time
        FROM   slot_access_requests
        WHERE  status IN ('pending', 'offered')
          AND  date >= (now() AT TIME ZONE 'Europe/Rome' - interval '7 days')::date
          AND  date <= (now() AT TIME ZONE 'Europe/Rome' + interval '1 day')::date
    LOOP
        BEGIN
            v_start := (
                v_req.date::text || ' ' ||
                trim(split_part(v_req.time, ' - ', 1)) ||
                ':00 Europe/Rome'
            )::timestamptz;
        EXCEPTION WHEN OTHERS THEN
            CONTINUE;
        END;

        IF v_start <= now() THEN
            UPDATE slot_access_requests
            SET    status = 'expired',
                   resolved_at = now()
            WHERE  id = v_req.id;
            v_count := v_count + 1;
        END IF;
    END LOOP;

    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION expire_started_slot_requests FROM public;
GRANT EXECUTE ON FUNCTION expire_started_slot_requests TO authenticated;
GRANT EXECUTE ON FUNCTION expire_started_slot_requests TO service_role;
