-- ═══════════════════════════════════════════════════════════════════════════
-- Slot condiviso: reset custom_price del sopravvissuto quando uno annulla
-- ═══════════════════════════════════════════════════════════════════════════
-- Quando una delle 2 prenotazioni di uno slot condiviso (group-class con
-- custom_price = 15) viene annullata/eliminata, lo slot torna ad essere
-- "Slot prenotato" singolo: il sopravvissuto deve tornare a 30€ (custom_price
-- → NULL → si usa il listino).
--
-- Esisteva già un fix lato client (admin-calendar.js _resetSharedPrice) ma
-- in qualche percorso non scattava o falliva silenziosamente. Qui spostiamo
-- la logica nelle RPC server-side: cancel_booking_with_refund (base ultima
-- versione 20260410000000), admin_delete_booking_with_refund e
-- fulfill_pending_cancellation (base ultima versione 20260420010000).
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── cancel_booking_with_refund (+ reset shared) ─────────────────────────────
CREATE OR REPLACE FUNCTION cancel_booking_with_refund(
    p_booking_id       UUID,
    p_credit_amount    NUMERIC  DEFAULT 0,
    p_credit_note      TEXT     DEFAULT '',
    p_use_bonus        BOOLEAN  DEFAULT false,
    p_with_bonus       BOOLEAN  DEFAULT false,
    p_with_penalty     BOOLEAN  DEFAULT false,
    p_mora_debt_amount NUMERIC  DEFAULT 0,
    p_mora_debt_note   TEXT     DEFAULT ''
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_booking          RECORD;
    v_credit_id        UUID;
    v_now              TIMESTAMPTZ := now();
    v_entry            JSONB;
    v_remaining_count  INTEGER;
BEGIN
    SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'booking_not_found');
    END IF;

    IF v_booking.status = 'cancelled' THEN
        RETURN jsonb_build_object('success', false, 'error', 'already_cancelled');
    END IF;

    IF v_booking.user_id IS NULL AND NOT is_admin() THEN
        RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
    END IF;
    IF v_booking.user_id IS NOT NULL
       AND v_booking.user_id IS DISTINCT FROM auth.uid()
       AND NOT is_admin() THEN
        RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
    END IF;

    UPDATE bookings SET
        status                    = 'cancelled',
        cancelled_at              = v_now,
        cancelled_by              = auth.uid(),
        paid                      = false,
        payment_method            = null,
        credit_applied            = 0,
        cancelled_with_bonus      = p_with_bonus,
        cancelled_with_penalty    = p_with_penalty,
        cancelled_payment_method  = v_booking.payment_method,
        cancelled_paid_at         = v_booking.paid_at
    WHERE id = p_booking_id;

    -- ── Slot condiviso: se cancello una delle 2, l'altra torna a 30€ ──────────
    IF v_booking.slot_type = 'group-class' AND v_booking.custom_price IS NOT NULL THEN
        SELECT count(*) INTO v_remaining_count
        FROM   bookings
        WHERE  date = v_booking.date
          AND  time = v_booking.time
          AND  slot_type = 'group-class'
          AND  status IN ('confirmed', 'cancellation_requested')
          AND  id <> p_booking_id;

        IF v_remaining_count = 1 THEN
            UPDATE bookings
            SET    custom_price = NULL
            WHERE  date = v_booking.date
              AND  time = v_booking.time
              AND  slot_type = 'group-class'
              AND  status IN ('confirmed', 'cancellation_requested')
              AND  id <> p_booking_id;
        END IF;
    END IF;

    IF p_credit_amount > 0
       AND v_booking.email IS NOT NULL
       AND trim(v_booking.email) <> '' THEN

        SELECT id INTO v_credit_id
        FROM credits
        WHERE email = lower(trim(v_booking.email))
        FOR UPDATE;

        IF NOT FOUND THEN
            INSERT INTO credits (name, whatsapp, email, balance, free_balance)
            VALUES (v_booking.name, v_booking.whatsapp, lower(trim(v_booking.email)), p_credit_amount, 0)
            RETURNING id INTO v_credit_id;
        ELSE
            UPDATE credits
            SET balance = round((balance + p_credit_amount)::numeric, 2)
            WHERE id = v_credit_id;
        END IF;

        INSERT INTO credit_history (credit_id, amount, note, created_at)
        VALUES (v_credit_id, p_credit_amount, p_credit_note, v_now);
    END IF;

    IF p_mora_debt_amount > 0
       AND v_booking.email IS NOT NULL
       AND trim(v_booking.email) <> '' THEN

        v_entry := jsonb_build_object(
            'date',      v_now,
            'amount',    p_mora_debt_amount,
            'note',      COALESCE(NULLIF(p_mora_debt_note, ''), 'Mora 50%'),
            'method',    '',
            'entryType', 'mora'
        );

        INSERT INTO manual_debts (name, whatsapp, email, balance, history)
        VALUES (
            v_booking.name,
            v_booking.whatsapp,
            lower(trim(v_booking.email)),
            p_mora_debt_amount,
            jsonb_build_array(v_entry)
        )
        ON CONFLICT (email) DO UPDATE
        SET balance = round((manual_debts.balance + p_mora_debt_amount)::numeric, 2),
            history = manual_debts.history || jsonb_build_array(v_entry);
    END IF;

    IF p_use_bonus
       AND v_booking.email IS NOT NULL
       AND trim(v_booking.email) <> '' THEN

        INSERT INTO bonuses (user_id, name, whatsapp, email, bonus, last_reset_month)
        VALUES (
            v_booking.user_id,
            v_booking.name,
            v_booking.whatsapp,
            lower(trim(v_booking.email)),
            0,
            to_char(v_now AT TIME ZONE 'Europe/Rome', 'YYYY-MM')
        )
        ON CONFLICT (email) DO UPDATE
            SET bonus            = 0,
                last_reset_month = to_char(v_now AT TIME ZONE 'Europe/Rome', 'YYYY-MM'),
                user_id          = COALESCE(bonuses.user_id, EXCLUDED.user_id);
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION cancel_booking_with_refund FROM public;
GRANT EXECUTE ON FUNCTION cancel_booking_with_refund TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_booking_with_refund TO service_role;


-- ─── admin_delete_booking_with_refund (+ reset shared) ───────────────────────
CREATE OR REPLACE FUNCTION admin_delete_booking_with_refund(
    p_booking_id  UUID,
    p_slot_prices JSONB DEFAULT '{"personal-training":5,"small-group":10,"group-class":30}'
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_booking          RECORD;
    v_credit_id        UUID;
    v_refund_amount    NUMERIC(10,2) := 0;
    v_now              TIMESTAMPTZ := now();
    v_remaining_count  INTEGER;
BEGIN
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Accesso negato: richiesto ruolo admin';
    END IF;

    SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'booking_not_found');
    END IF;

    IF v_booking.paid THEN
        v_refund_amount := round(coalesce(v_booking.custom_price, (p_slot_prices ->> v_booking.slot_type)::numeric, 0), 2);
    END IF;

    IF v_refund_amount > 0
       AND v_booking.email IS NOT NULL
       AND trim(v_booking.email) <> '' THEN

        SELECT id INTO v_credit_id
        FROM   credits
        WHERE  email = lower(trim(v_booking.email))
        FOR UPDATE;

        IF NOT FOUND THEN
            INSERT INTO credits (name, whatsapp, email, balance, free_balance)
            VALUES (v_booking.name, v_booking.whatsapp, lower(trim(v_booking.email)), v_refund_amount, 0)
            RETURNING id INTO v_credit_id;
        ELSE
            UPDATE credits
            SET    balance = round((balance + v_refund_amount)::numeric, 2)
            WHERE  id = v_credit_id;
        END IF;

        INSERT INTO credit_history (credit_id, amount, note, created_at)
        VALUES (v_credit_id, v_refund_amount,
                'Rimborso lezione ' || v_booking.date::text,
                v_now);
    END IF;

    -- ── Slot condiviso: prima della DELETE, se l'altro è solo, riportalo a 30€
    IF v_booking.slot_type = 'group-class' AND v_booking.custom_price IS NOT NULL THEN
        SELECT count(*) INTO v_remaining_count
        FROM   bookings
        WHERE  date = v_booking.date
          AND  time = v_booking.time
          AND  slot_type = 'group-class'
          AND  status IN ('confirmed', 'cancellation_requested')
          AND  id <> p_booking_id;

        IF v_remaining_count = 1 THEN
            UPDATE bookings
            SET    custom_price = NULL
            WHERE  date = v_booking.date
              AND  time = v_booking.time
              AND  slot_type = 'group-class'
              AND  status IN ('confirmed', 'cancellation_requested')
              AND  id <> p_booking_id;
        END IF;
    END IF;

    DELETE FROM bookings WHERE id = p_booking_id;

    RETURN jsonb_build_object('success', true, 'credit_refunded', v_refund_amount);
END;
$$;

REVOKE ALL ON FUNCTION admin_delete_booking_with_refund FROM public;
GRANT EXECUTE ON FUNCTION admin_delete_booking_with_refund TO authenticated;


-- ─── fulfill_pending_cancellation (+ reset shared) ───────────────────────────
CREATE OR REPLACE FUNCTION fulfill_pending_cancellation(
    p_date        TEXT,
    p_time        TEXT,
    p_slot_prices JSONB DEFAULT '{"personal-training":5,"small-group":10,"group-class":30}'
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_booking          RECORD;
    v_credit_id        UUID;
    v_refund_amount    NUMERIC(10,2) := 0;
    v_now              TIMESTAMPTZ := now();
    v_remaining_count  INTEGER;
BEGIN
    SELECT * INTO v_booking
    FROM   bookings
    WHERE  date::text = p_date
      AND  time       = p_time
      AND  (status = 'cancellation_requested'
            OR (status = 'confirmed' AND cancellation_requested_at IS NOT NULL))
    ORDER  BY cancellation_requested_at ASC NULLS LAST
    LIMIT  1
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', true, 'found', false);
    END IF;

    IF v_booking.paid OR coalesce(v_booking.credit_applied, 0) > 0 THEN
        v_refund_amount := round(coalesce(v_booking.custom_price, (p_slot_prices ->> v_booking.slot_type)::numeric, 0), 2);
    END IF;

    UPDATE bookings SET
        status                   = 'cancelled',
        cancelled_at             = v_now,
        cancelled_payment_method = v_booking.payment_method,
        cancelled_paid_at        = v_booking.paid_at,
        paid                     = false,
        payment_method           = null,
        paid_at                  = null,
        credit_applied           = 0
    WHERE id = v_booking.id;

    -- ── Slot condiviso: se il sopravvissuto resta solo, torna a 30€ ──────────
    IF v_booking.slot_type = 'group-class' AND v_booking.custom_price IS NOT NULL THEN
        SELECT count(*) INTO v_remaining_count
        FROM   bookings
        WHERE  date = v_booking.date
          AND  time = v_booking.time
          AND  slot_type = 'group-class'
          AND  status IN ('confirmed', 'cancellation_requested')
          AND  id <> v_booking.id;

        IF v_remaining_count = 1 THEN
            UPDATE bookings
            SET    custom_price = NULL
            WHERE  date = v_booking.date
              AND  time = v_booking.time
              AND  slot_type = 'group-class'
              AND  status IN ('confirmed', 'cancellation_requested')
              AND  id <> v_booking.id;
        END IF;
    END IF;

    IF v_refund_amount > 0
       AND v_booking.email IS NOT NULL
       AND trim(v_booking.email) <> '' THEN

        SELECT id INTO v_credit_id
        FROM   credits
        WHERE  email = lower(trim(v_booking.email))
        FOR UPDATE;

        IF NOT FOUND THEN
            INSERT INTO credits (name, whatsapp, email, balance, free_balance)
            VALUES (v_booking.name, v_booking.whatsapp, lower(trim(v_booking.email)), v_refund_amount, 0)
            RETURNING id INTO v_credit_id;
        ELSE
            UPDATE credits
            SET    balance = round((balance + v_refund_amount)::numeric, 2)
            WHERE  id = v_credit_id;
        END IF;

        INSERT INTO credit_history (credit_id, amount, note, created_at)
        VALUES (v_credit_id, v_refund_amount,
                'Rimborso lezione ' || p_date || ' (annullamento soddisfatto)',
                v_now);
    END IF;

    RETURN jsonb_build_object(
        'success',         true,
        'found',           true,
        'booking_id',      v_booking.id,
        'credit_refunded', v_refund_amount
    );
END;
$$;

REVOKE ALL ON FUNCTION fulfill_pending_cancellation FROM public;
GRANT EXECUTE ON FUNCTION fulfill_pending_cancellation TO anon, authenticated, service_role;


-- ─── Backfill: slot ex-condivisi con un solo sopravvissuto a 15€ ─────────────
-- Sistema lo stato di chi ha già subito il bug: per ogni group-class attivo
-- (confirmed o cancellation_requested) con custom_price NOT NULL, se è
-- l'unico attivo nello slot → riportalo a custom_price = NULL (30€).
DO $$
DECLARE
    v_b RECORD;
BEGIN
    FOR v_b IN
        SELECT b.id
        FROM   bookings b
        WHERE  b.slot_type = 'group-class'
          AND  b.custom_price IS NOT NULL
          AND  b.status IN ('confirmed', 'cancellation_requested')
          AND  NOT EXISTS (
              SELECT 1 FROM bookings b2
              WHERE  b2.date      = b.date
                AND  b2.time      = b.time
                AND  b2.slot_type = 'group-class'
                AND  b2.status    IN ('confirmed', 'cancellation_requested')
                AND  b2.id        <> b.id
          )
    LOOP
        UPDATE bookings SET custom_price = NULL WHERE id = v_b.id;
    END LOOP;
END $$;
