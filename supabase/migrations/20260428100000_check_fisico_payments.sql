-- ─── Check Fisico payments ──────────────────────────────────────────────────
-- Tabella per tracciare i pagamenti dei Check Fisici. Sono incassi "secchi":
-- entrano nelle statistiche admin (fatturato, prenotazioni, metodo pagamento,
-- tipo lezione) e nel registro, ma NON toccano il saldo crediti/debiti del
-- cliente e NON sono visibili lato utente.
-- RLS solo-admin: il cliente non puo' leggerli nemmeno se conosce la tabella.

CREATE TABLE IF NOT EXISTS check_fisico_payments (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id        UUID REFERENCES profiles(id) ON DELETE SET NULL,
    name           TEXT NOT NULL,
    email          TEXT NOT NULL,
    whatsapp       TEXT,
    amount         NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL,
    note           TEXT
);

CREATE INDEX IF NOT EXISTS idx_check_fisico_created_at ON check_fisico_payments (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_check_fisico_email      ON check_fisico_payments (lower(email));

ALTER TABLE check_fisico_payments ENABLE ROW LEVEL SECURITY;

-- Solo admin: nessuna policy per ruolo authenticated regolare,
-- l'accesso passa esclusivamente per le RPC SECURITY DEFINER sotto.
DROP POLICY IF EXISTS "check_fisico_admin_all" ON check_fisico_payments;
CREATE POLICY "check_fisico_admin_all" ON check_fisico_payments
    FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- ─── RPC admin_add_check_fisico ─────────────────────────────────────────────
-- Inserisce un pagamento Check Fisico. Non scala credito, non crea booking:
-- e' solo un movimento contabile usato dalle statistiche admin e dal registro.
--
-- Parametri:
--   p_email     email del cliente (chiave per inferire user_id)
--   p_whatsapp  telefono del cliente (opzionale)
--   p_name      nome del cliente
--   p_amount    importo positivo
--   p_method    metodo di pagamento (contanti, contanti-report, carta, iban, lezione-gratuita)
--   p_note      nota opzionale
--
-- Ritorna JSONB: { success, id, created_at }

CREATE OR REPLACE FUNCTION admin_add_check_fisico(
    p_email    TEXT,
    p_whatsapp TEXT    DEFAULT NULL,
    p_name     TEXT    DEFAULT '',
    p_amount   NUMERIC DEFAULT 0,
    p_method   TEXT    DEFAULT '',
    p_note     TEXT    DEFAULT ''
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_email      TEXT := lower(trim(p_email));
    v_user_id    UUID;
    v_id         UUID;
    v_created_at TIMESTAMPTZ;
BEGIN
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Accesso negato: richiesto ruolo admin';
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'amount_invalid');
    END IF;

    IF p_method IS NULL OR p_method = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'method_required');
    END IF;

    -- Inferisci user_id dall'email se esiste un profilo
    SELECT id INTO v_user_id
    FROM   profiles
    WHERE  lower(email) = v_email
    LIMIT  1;

    INSERT INTO check_fisico_payments (user_id, name, email, whatsapp, amount, payment_method, note)
    VALUES (v_user_id, p_name, v_email, p_whatsapp, round(p_amount::numeric, 2), p_method, NULLIF(p_note, ''))
    RETURNING id, created_at INTO v_id, v_created_at;

    RETURN jsonb_build_object(
        'success',    true,
        'id',         v_id,
        'created_at', v_created_at
    );
END;
$$;

REVOKE ALL ON FUNCTION admin_add_check_fisico FROM public;
GRANT EXECUTE ON FUNCTION admin_add_check_fisico TO authenticated;

-- ─── RPC admin_delete_check_fisico ──────────────────────────────────────────
-- Elimina un singolo pagamento Check Fisico per id.
--
-- Ritorna JSONB: { success, deleted }

CREATE OR REPLACE FUNCTION admin_delete_check_fisico(
    p_id UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Accesso negato: richiesto ruolo admin';
    END IF;

    DELETE FROM check_fisico_payments WHERE id = p_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    RETURN jsonb_build_object('success', v_deleted > 0, 'deleted', v_deleted > 0);
END;
$$;

REVOKE ALL ON FUNCTION admin_delete_check_fisico FROM public;
GRANT EXECUTE ON FUNCTION admin_delete_check_fisico TO authenticated;
