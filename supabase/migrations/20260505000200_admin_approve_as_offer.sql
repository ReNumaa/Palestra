-- ═══════════════════════════════════════════════════════════════════════════
-- Admin approve = "offri posto", non più "crea booking diretto"
-- ═══════════════════════════════════════════════════════════════════════════
-- Cambio di flusso (per richiesta utente):
--   PRIMA  : admin click Approva → INSERT bookings + status='approved'
--   ADESSO : admin click Approva → status='offered' (utente deve confermare
--            in app cliccando "Accetta" sul banner). Il booking viene creato
--            solo da accept_offered_request (chiamata dall'utente).
--
-- Aggiunge anche colonna `offer_source` per distinguere se l'offerta nasce
-- da una cancellazione naturale ('auto') o da approvazione admin ('admin'):
-- il banner UI mostra titolo diverso.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE slot_access_requests
    ADD COLUMN IF NOT EXISTS offer_source TEXT;


-- ─── _offer_next_in_queue: marca offer_source='auto' ─────────────────────────
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
    SET    status       = 'offered',
           offered_at   = now(),
           offer_source = 'auto'
    WHERE  id = v_req.id;

    RETURN jsonb_build_object(
        'id',           v_req.id,
        'user_id',      v_req.user_id,
        'user_name',    v_req.user_name,
        'user_email',   v_req.user_email,
        'date',         v_req.date::TEXT,
        'time',         v_req.time,
        'slot_type',    v_req.slot_type,
        'date_display', v_req.date_display,
        'offer_source', 'auto'
    );
END;
$$;

REVOKE ALL ON FUNCTION _offer_next_in_queue FROM public;
GRANT EXECUTE ON FUNCTION _offer_next_in_queue TO service_role;


-- ─── admin_approve_access_request: ora SOLO offre, non crea booking ──────────
CREATE OR REPLACE FUNCTION admin_approve_access_request(
    p_request_id   UUID,
    p_max_capacity INTEGER
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_req RECORD;
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

    -- Se già offered (es. da auto-offer), restituisci comunque i dati per re-notifica
    IF v_req.status = 'pending' THEN
        UPDATE slot_access_requests
        SET    status       = 'offered',
               offered_at   = now(),
               offer_source = 'admin'
        WHERE  id = p_request_id;
    ELSE
        -- Se già offered, marca comunque come admin (es. admin re-invia)
        UPDATE slot_access_requests
        SET    offer_source = COALESCE(offer_source, 'admin')
        WHERE  id = p_request_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'offered_request', jsonb_build_object(
            'id',           v_req.id,
            'user_id',      v_req.user_id,
            'user_name',    v_req.user_name,
            'user_email',   v_req.user_email,
            'date',         v_req.date::TEXT,
            'time',         v_req.time,
            'slot_type',    v_req.slot_type,
            'date_display', v_req.date_display,
            'offer_source', 'admin'
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION admin_approve_access_request FROM public;
GRANT EXECUTE ON FUNCTION admin_approve_access_request TO authenticated;
