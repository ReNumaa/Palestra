-- ═══════════════════════════════════════════════════════════════════════════
-- Admin può chiudere/rifiutare una richiesta accesso (pending o offered)
-- ═══════════════════════════════════════════════════════════════════════════
-- Aggiunge nuovo status `declined_admin` al CHECK constraint e una RPC
-- `admin_decline_access_request` chiamata dal tab Richieste con il bottone
-- "Chiudi". Funziona sia su pending (utente non ancora servito) che su
-- offered (offerta in attesa di conferma utente).
--
-- Quando l'admin chiude una richiesta `offered`, il posto liberato passa
-- al prossimo in coda via `_offer_next_in_queue` (stesso comportamento di
-- decline_offered_request lato utente).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE slot_access_requests
    DROP CONSTRAINT IF EXISTS slot_access_requests_status_check;

ALTER TABLE slot_access_requests
    ADD CONSTRAINT slot_access_requests_status_check
    CHECK (status IN ('pending','offered','approved','declined_user','declined_admin','expired'));


CREATE OR REPLACE FUNCTION admin_decline_access_request(
    p_request_id UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_req       RECORD;
    v_was_offer BOOLEAN;
    v_next      JSONB := NULL;
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

    v_was_offer := (v_req.status = 'offered');

    UPDATE slot_access_requests
    SET    status      = 'declined_admin',
           resolved_at = now()
    WHERE  id = p_request_id;

    -- Se chiudo una offerta, il posto torna disponibile per il prossimo in coda
    IF v_was_offer THEN
        BEGIN
            v_next := _offer_next_in_queue(v_req.date, v_req.time, v_req.slot_type);
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING '_offer_next_in_queue failed in admin_decline_access_request: %', SQLERRM;
            v_next := NULL;
        END;
    END IF;

    RETURN jsonb_build_object('success', true, 'offered_request', v_next);
END;
$$;

REVOKE ALL ON FUNCTION admin_decline_access_request FROM public;
GRANT EXECUTE ON FUNCTION admin_decline_access_request TO authenticated;
