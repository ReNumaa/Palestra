-- ─── RPC: admin_health_check — verifica integrità dati ───────────────────────
-- Controlla anomalie: utenti fantasma, booking orfane, email mismatch, ecc.

CREATE OR REPLACE FUNCTION admin_health_check()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_ghost_users   JSONB;
    v_orphan_bookings JSONB;
    v_email_mismatch  JSONB;
    v_orphan_credits  JSONB;
    v_orphan_debts    JSONB;
    v_orphan_bonuses  JSONB;
BEGIN
    IF NOT is_admin() THEN
        RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
    END IF;

    -- 1. Utenti auth senza profilo (fantasma)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'email', au.email,
        'created_at', au.created_at::TEXT
    )), '[]'::JSONB)
    INTO v_ghost_users
    FROM auth.users au
    LEFT JOIN profiles p ON au.id = p.id
    WHERE p.id IS NULL;

    -- 2. Booking con user_id che punta a profilo inesistente
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'booking_id', b.id,
        'email', b.email,
        'date', b.date::TEXT,
        'user_id', b.user_id::TEXT
    )), '[]'::JSONB)
    INTO v_orphan_bookings
    FROM bookings b
    LEFT JOIN profiles p ON b.user_id = p.id
    WHERE b.user_id IS NOT NULL AND p.id IS NULL;

    -- 3. Booking con user_id il cui profilo ha email diversa
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'booking_id', b.id,
        'booking_email', b.email,
        'profile_email', p.email,
        'date', b.date::TEXT
    )), '[]'::JSONB)
    INTO v_email_mismatch
    FROM bookings b
    JOIN profiles p ON b.user_id = p.id
    WHERE b.email IS NOT NULL AND p.email IS NOT NULL
      AND lower(trim(b.email)) <> lower(trim(p.email));

    -- 4. Credits con user_id orfano
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'email', c.email,
        'balance', c.balance,
        'user_id', c.user_id::TEXT
    )), '[]'::JSONB)
    INTO v_orphan_credits
    FROM credits c
    LEFT JOIN profiles p ON c.user_id = p.id
    WHERE c.user_id IS NOT NULL AND p.id IS NULL;

    -- 5. Manual debts con user_id orfano
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'email', d.email,
        'balance', d.balance,
        'user_id', d.user_id::TEXT
    )), '[]'::JSONB)
    INTO v_orphan_debts
    FROM manual_debts d
    LEFT JOIN profiles p ON d.user_id = p.id
    WHERE d.user_id IS NOT NULL AND p.id IS NULL;

    -- 6. Bonuses con user_id orfano
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'email', bo.email,
        'user_id', bo.user_id::TEXT
    )), '[]'::JSONB)
    INTO v_orphan_bonuses
    FROM bonuses bo
    LEFT JOIN profiles p ON bo.user_id = p.id
    WHERE bo.user_id IS NOT NULL AND p.id IS NULL;

    RETURN jsonb_build_object(
        'success', true,
        'ghost_users', v_ghost_users,
        'orphan_bookings', v_orphan_bookings,
        'email_mismatch', v_email_mismatch,
        'orphan_credits', v_orphan_credits,
        'orphan_debts', v_orphan_debts,
        'orphan_bonuses', v_orphan_bonuses
    );
END;
$$;

REVOKE ALL ON FUNCTION admin_health_check FROM public;
GRANT EXECUTE ON FUNCTION admin_health_check TO authenticated;
