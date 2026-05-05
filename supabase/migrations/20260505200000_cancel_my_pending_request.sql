-- ═══════════════════════════════════════════════════════════════════════════
-- RPC: cancel_my_pending_request
-- ═══════════════════════════════════════════════════════════════════════════
-- Permette all'utente di annullare una propria richiesta accesso in stato
-- `pending`. Per `offered` esiste già `decline_offered_request` (con riassegna
-- al prossimo in coda); qui invece la richiesta è solo in coda, non c'è alcun
-- posto liberato → nessuna riassegna necessaria.
--
-- Usato dal popup informativo nel calendario: l'utente clicca il "?" arancione
-- sullo slot full e ha l'opzione di annullare.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION cancel_my_pending_request(
    p_request_id UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_req RECORD;
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

    IF v_req.status <> 'pending' THEN
        -- Per `offered` l'utente deve usare decline_offered_request (gestisce il next-in-queue)
        RETURN jsonb_build_object('success', false, 'error', 'not_pending', 'status', v_req.status);
    END IF;

    UPDATE slot_access_requests
    SET    status      = 'declined_user',
           resolved_at = now()
    WHERE  id = p_request_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION cancel_my_pending_request FROM public;
GRANT EXECUTE ON FUNCTION cancel_my_pending_request TO authenticated;
