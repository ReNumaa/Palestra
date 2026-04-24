-- ═══════════════════════════════════════════════════════════════════════════
-- Slot condiviso: RPC admin_set_booking_custom_price + rimborso silenzioso
-- ═══════════════════════════════════════════════════════════════════════════
-- La tabella bookings non ha policy UPDATE per authenticated, quindi gli
-- UPDATE diretti da client (supabaseClient.from('bookings').update(...))
-- venivano silenziosamente bloccati da RLS. Di conseguenza custom_price
-- restava NULL anche quando lo slot condiviso veniva creato, e sia il
-- prezzo mostrato ("Da pagare") sia quello delle RPC di pagamento/debitori
-- cadevano sul listino standard group-class (€30) invece di €15/p.
--
-- Inoltre, quando il 1° cliente aveva già pagato €30 e poi viene aggiunto
-- il 2° cliente (slot condiviso), vogliamo che il 1° recuperi €15 sul
-- credito SENZA che in registro compaia una riga "Rimborso" e il
-- "booking_paid" mostri direttamente €15. Si usa per questo il flag
-- credit_history.hidden=true (il client filtra via .eq('hidden', false)).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION admin_set_booking_custom_price(
    p_booking_id UUID,
    p_price      NUMERIC DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_row_count INTEGER;
BEGIN
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Accesso negato: richiesto ruolo admin';
    END IF;

    UPDATE bookings
    SET    custom_price = p_price
    WHERE  id = p_booking_id;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success',    v_row_count > 0,
        'booking_id', p_booking_id,
        'price',      p_price
    );
END;
$$;

REVOKE ALL ON FUNCTION admin_set_booking_custom_price(UUID, NUMERIC) FROM public;
GRANT EXECUTE ON FUNCTION admin_set_booking_custom_price(UUID, NUMERIC) TO authenticated;


-- ─── RPC: admin_refund_shared_slot_hidden ────────────────────────────────────
-- Aggiunge p_amount al balance del credito del cliente del booking
-- e inserisce una riga in credit_history con hidden=true (invisibile al
-- client: registro, dettagli cliente, analytics).
-- Usata quando uno slot group-class passa da singolo (€30) a condiviso (€15)
-- e il 1° cliente aveva già pagato (non lezione-gratuita): gli torna €15
-- sul credito senza che in registro/UI compaia alcuna riga di rimborso.
CREATE OR REPLACE FUNCTION admin_refund_shared_slot_hidden(
    p_booking_id UUID,
    p_amount     NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_booking    RECORD;
    v_credit_id  UUID;
    v_now        TIMESTAMPTZ := now();
    v_email_norm TEXT;
BEGIN
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Accesso negato: richiesto ruolo admin';
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RETURN jsonb_build_object('success', true, 'refunded', 0, 'reason', 'amount_zero');
    END IF;

    SELECT id, name, email, whatsapp, date, time, paid, payment_method
    INTO   v_booking
    FROM   bookings
    WHERE  id = p_booking_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'refunded', 0, 'reason', 'booking_not_found');
    END IF;

    IF NOT v_booking.paid
       OR coalesce(v_booking.payment_method, '') IN ('lezione-gratuita', '')
       OR v_booking.email IS NULL
       OR trim(v_booking.email) = '' THEN
        RETURN jsonb_build_object('success', true, 'refunded', 0, 'reason', 'not_refundable');
    END IF;

    v_email_norm := lower(trim(v_booking.email));

    SELECT id INTO v_credit_id
    FROM   credits
    WHERE  email = v_email_norm
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO credits (name, whatsapp, email, balance, free_balance)
        VALUES (v_booking.name, v_booking.whatsapp, v_email_norm, p_amount, 0)
        RETURNING id INTO v_credit_id;
    ELSE
        UPDATE credits
        SET    balance = round((balance + p_amount)::numeric, 2)
        WHERE  id = v_credit_id;
    END IF;

    -- Entry hidden: traccia tecnica, invisibile al client (.eq('hidden', false))
    INSERT INTO credit_history (credit_id, amount, note, created_at, hidden, booking_ref)
    VALUES (v_credit_id, p_amount,
            'Allineamento slot condiviso (30→15) ' ||
                v_booking.date || ' ' || v_booking.time,
            v_now, true, p_booking_id);

    RETURN jsonb_build_object('success', true, 'refunded', p_amount);
END;
$$;

REVOKE ALL ON FUNCTION admin_refund_shared_slot_hidden(UUID, NUMERIC) FROM public;
GRANT EXECUTE ON FUNCTION admin_refund_shared_slot_hidden(UUID, NUMERIC) TO authenticated;


-- ─── Backfill: slot già condivisi con custom_price NULL ──────────────────────
-- Per ogni group-class attivo (confirmed o cancellation_requested) che
-- condivide stessa data+ora con almeno un altro group-class attivo:
--   1. imposta custom_price = 15
--   2. se era già pagato con metodo monetario (non lezione-gratuita),
--      aggiunge €15 al credito con entry hidden (silenzioso)
DO $$
DECLARE
    v_b RECORD;
    v_credit_id UUID;
    v_email_norm TEXT;
    v_now TIMESTAMPTZ := now();
BEGIN
    FOR v_b IN
        SELECT b.id, b.name, b.email, b.whatsapp, b.date, b.time,
               b.paid, b.payment_method
        FROM   bookings b
        WHERE  b.slot_type = 'group-class'
          AND  b.custom_price IS NULL
          AND  b.status IN ('confirmed', 'cancellation_requested')
          AND  EXISTS (
              SELECT 1 FROM bookings b2
              WHERE b2.date      = b.date
                AND b2.time      = b.time
                AND b2.slot_type = 'group-class'
                AND b2.status    IN ('confirmed', 'cancellation_requested')
                AND b2.id        <> b.id
          )
    LOOP
        UPDATE bookings SET custom_price = 15 WHERE id = v_b.id;

        IF v_b.paid
           AND coalesce(v_b.payment_method, '') NOT IN ('lezione-gratuita', '')
           AND v_b.email IS NOT NULL
           AND trim(v_b.email) <> '' THEN

            v_email_norm := lower(trim(v_b.email));

            SELECT id INTO v_credit_id
            FROM   credits
            WHERE  email = v_email_norm;

            IF NOT FOUND THEN
                INSERT INTO credits (name, whatsapp, email, balance, free_balance)
                VALUES (v_b.name, v_b.whatsapp, v_email_norm, 15, 0)
                RETURNING id INTO v_credit_id;
            ELSE
                UPDATE credits
                SET    balance = round((balance + 15)::numeric, 2)
                WHERE  id = v_credit_id;
            END IF;

            INSERT INTO credit_history (credit_id, amount, note, created_at, hidden, booking_ref)
            VALUES (v_credit_id, 15,
                    'Allineamento slot condiviso (30→15) ' ||
                        v_b.date || ' ' || v_b.time,
                    v_now, true, v_b.id);
        END IF;
    END LOOP;
END $$;
