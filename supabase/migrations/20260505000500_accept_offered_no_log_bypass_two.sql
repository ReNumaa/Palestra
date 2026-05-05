-- ═══════════════════════════════════════════════════════════════════════════
-- Consolidamento accept_offered_request: bypass +2 + nessun log admin_messages
-- ═══════════════════════════════════════════════════════════════════════════
-- Stato precedente confuso: 20260505000400_increase_overcapacity_bypass_to_two
-- ricreava la funzione CON il logging (sent_count=0) reintroducendolo dopo che
-- 20260505000400_remove_log_access_requests_in_admin_messages l'aveva tolto.
--
-- Versione finale unica:
--   - bypass over-capacity = +2 (5 nominali + 2 = max 7 prenotati)
--   - NESSUN INSERT in admin_messages (lo fa l'Edge Function notify-admin-
--     access-request, che imposta sent_count reale dopo aver spedito le push)
-- ═══════════════════════════════════════════════════════════════════════════

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

    -- Bypass over-capacity: ammette fino a max_capacity + 2
    IF v_count >= p_max_capacity + 2 THEN
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
