-- ============================================================
-- SUPABASE RPC — Thomas Bresciani Palestra (idempotente)
-- Esegui nel SQL Editor di Supabase.
-- ============================================================

-- ─── book_slot_atomic ────────────────────────────────────────
-- Prenota uno slot in modo atomico usando un advisory lock per
-- serializzare le prenotazioni concorrenti sullo stesso slot.
-- Impedisce il double-booking in caso di race condition.
--
-- Parametri:
--   p_max_capacity  Capacità effettiva calcolata dal client JS (base + extras)
--
-- Ritorna JSONB:
--   { "success": true,  "booking_id": "<uuid>" }
--   { "success": false, "error": "slot_full" }

CREATE OR REPLACE FUNCTION book_slot_atomic(
    p_local_id      TEXT,
    p_user_id       UUID,
    p_date          TEXT,
    p_time          TEXT,
    p_slot_type     TEXT,
    p_max_capacity  INTEGER,
    p_name          TEXT,
    p_email         TEXT,
    p_whatsapp      TEXT,
    p_notes         TEXT,
    p_created_at    TIMESTAMPTZ,
    p_date_display  TEXT DEFAULT ''
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_count INTEGER;
    v_id    UUID;
BEGIN
    -- Advisory lock su (data, orario, tipo) — serializza prenotazioni concorrenti
    PERFORM pg_advisory_xact_lock(hashtext(p_date || '|' || p_time || '|' || p_slot_type));

    -- Conta prenotazioni attive per questo slot
    -- Nota: date è tipo DATE, p_date è TEXT → cast esplicito necessario
    SELECT COUNT(*) INTO v_count
    FROM bookings
    WHERE date      = p_date::DATE
      AND time      = p_time
      AND slot_type = p_slot_type
      AND status IN ('confirmed', 'cancellation_requested');

    IF v_count >= p_max_capacity THEN
        RETURN jsonb_build_object('success', false, 'error', 'slot_full');
    END IF;

    INSERT INTO bookings (
        local_id, user_id, date, time, slot_type,
        name, email, whatsapp, notes, status, created_at, date_display
    ) VALUES (
        p_local_id, p_user_id, p_date::DATE, p_time, p_slot_type,
        p_name, p_email, p_whatsapp, p_notes, 'confirmed', p_created_at, p_date_display
    )
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('success', true, 'booking_id', v_id::TEXT);
END;
$$;

-- Permessi: solo utenti autenticati possono prenotare
GRANT EXECUTE ON FUNCTION book_slot_atomic TO authenticated;

-- ─── get_all_profiles ────────────────────────────────────────
-- Restituisce tutti i profili utente — usato da admin per syncUsersFromSupabase().
-- SECURITY DEFINER: bypassa RLS (profiles ha select_own).
-- Concesso a anon: admin.html usa password locale, non Supabase Auth.

CREATE OR REPLACE FUNCTION get_all_profiles()
RETURNS TABLE (
    id                   UUID,
    name                 TEXT,
    email                TEXT,
    whatsapp             TEXT,
    medical_cert_expiry  TEXT,
    medical_cert_history JSONB,
    insurance_expiry     TEXT,
    insurance_history    JSONB
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
        SELECT p.id, p.name, p.email, p.whatsapp,
               p.medical_cert_expiry, p.medical_cert_history,
               p.insurance_expiry, p.insurance_history
        FROM profiles p;
END;
$$;

GRANT EXECUTE ON FUNCTION get_all_profiles TO anon;

-- ─── Nota: REPLICA IDENTITY per Realtime ─────────────────────
-- Per ricevere dati completi su UPDATE/DELETE nei canali Realtime,
-- abilitare REPLICA IDENTITY FULL sulla tabella bookings:
--
--   ALTER TABLE bookings REPLICA IDENTITY FULL;
--
-- Poi in Supabase Dashboard → Database → Replication → abilitare
-- per la tabella "bookings".
