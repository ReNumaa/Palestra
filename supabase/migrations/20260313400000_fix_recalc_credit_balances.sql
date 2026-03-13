-- ─── ONE-TIME FIX: ricalcola balance credits dalla somma di credit_history ───
-- La migrazione 20260313300000 ha rimborsato credito per prenotazioni future,
-- ma in alcuni casi le deduzioni originali non esistevano nello storico,
-- generando un balance gonfiato. Questo script ricalcola il balance corretto
-- per TUTTI i clienti basandosi sulla somma effettiva di credit_history.

DO $$
DECLARE
    v_rec   RECORD;
    v_count INTEGER := 0;
BEGIN
    FOR v_rec IN
        SELECT c.id,
               c.email,
               c.balance AS old_balance,
               coalesce(h.total, 0) AS computed_balance
        FROM   credits c
        LEFT JOIN (
            SELECT credit_id, round(sum(amount)::numeric, 2) AS total
            FROM   credit_history
            WHERE  hidden = false
            GROUP  BY credit_id
        ) h ON h.credit_id = c.id
        WHERE  c.balance <> coalesce(h.total, 0)
    LOOP
        UPDATE credits
        SET    balance = greatest(0, v_rec.computed_balance)
        WHERE  id = v_rec.id;

        RAISE NOTICE 'Fix %: % → %', v_rec.email, v_rec.old_balance, greatest(0, v_rec.computed_balance);
        v_count := v_count + 1;
    END LOOP;

    RAISE NOTICE 'Corretti % record credits', v_count;
END;
$$;
