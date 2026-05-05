-- ═══════════════════════════════════════════════════════════════════════════
-- Rimuove il logging in admin_messages dalle 3 RPC di slot_access_requests
-- ═══════════════════════════════════════════════════════════════════════════
-- Sostituisce 20260505000300_log_access_requests_in_admin_messages.sql.
--
-- Motivo: il logging server-side scriveva sempre sent_count = 0 perché le RPC
-- non possono spedire push (servirebbe pg_net e una chiamata a Edge Function).
-- Risultato: registro pieno di righe "Non inviata".
--
-- Nuovo approccio (allineato a notify-admin-booking / notify-admin-cancellation):
--   - le RPC fanno SOLO la logica DB (creazione richiesta / booking / decline)
--   - il log + push admin viene fatto dall'Edge Function
--     `notify-admin-access-request`, chiamata dal client dopo la RPC ok
--
-- In più: l'evento "decline" non viene più loggato né notificato (rumore
-- inutile, l'admin non ha azioni da fare; la coda passa da sola al prossimo).
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── create_slot_access_request: ripristina versione senza log ──────────────
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

    SELECT COUNT(*) INTO v_count
    FROM   bookings
    WHERE  date      = p_date::DATE
      AND  time      = p_time
      AND  slot_type = p_slot_type
      AND  status IN ('confirmed', 'cancellation_requested');

    IF v_count < p_max_capacity THEN
        RETURN jsonb_build_object('success', false, 'error', 'slot_not_full');
    END IF;

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


-- ─── accept_offered_request: ripristina versione senza log ──────────────────
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


-- ─── decline_offered_request: ripristina versione senza log ─────────────────
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

    BEGIN
        v_next := _offer_next_in_queue(v_req.date, v_req.time, v_req.slot_type);
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '_offer_next_in_queue failed in decline_offered_request: %', SQLERRM;
        v_next := NULL;
    END;

    RETURN jsonb_build_object('success', true, 'offered_request', v_next);
END;
$$;

REVOKE ALL ON FUNCTION decline_offered_request FROM public;
GRANT EXECUTE ON FUNCTION decline_offered_request TO authenticated;
