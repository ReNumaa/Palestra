-- ─────────────────────────────────────────────────────────────────────────────
-- Bug fix: numeri di cellulare con prefisso `39X` (es. 392, 393, 395, 397...)
-- erano stati salvati senza il country code. La vecchia normalizePhone() in JS
-- considerava qualunque numero che iniziasse per "39" come già prefissato col
-- country code, perdendo le prime 2 cifre del cellulare. Quindi `3925666618`
-- (cellulare valido di 10 cifre) veniva salvato come `+3925666618` invece di
-- `+393925666618`.
--
-- Pattern dei record corrotti: `^\+39\d{8}$` (esattamente 8 cifre dopo +39).
--
-- ⚠️  ATTENZIONE: lo stesso pattern matcha anche fissi italiani brevi normalizzati
-- (es. Napoli "081 123456" → `+3981123456`). I clienti palestra sono però quasi
-- tutti da cellulare WhatsApp, quindi il rischio di falsi positivi è basso. Per
-- sicurezza, eseguire prima la query di diagnostica (sotto) e validare la lista.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. DIAGNOSTICA — esegui questa parte da sola per vedere cosa verrà toccato
do $$
declare
    v_count int;
begin
    select count(*) into v_count from profiles where whatsapp ~ '^\+39\d{8}$';
    raise notice 'profiles affetti: %', v_count;

    select count(*) into v_count from bookings where whatsapp ~ '^\+39\d{8}$';
    raise notice 'bookings affetti: %', v_count;

    select count(*) into v_count from credits where whatsapp ~ '^\+39\d{8}$';
    raise notice 'credits affetti: %', v_count;

    select count(*) into v_count from manual_debts where whatsapp ~ '^\+39\d{8}$';
    raise notice 'manual_debts affetti: %', v_count;

    select count(*) into v_count from bonuses where whatsapp ~ '^\+39\d{8}$';
    raise notice 'bonuses affetti: %', v_count;

    select count(*) into v_count from slot_access_requests where user_whatsapp ~ '^\+39\d{8}$';
    raise notice 'slot_access_requests affetti: %', v_count;
end $$;

-- ── 2. ELENCO DETTAGLIATO (solo profiles, per cross-check con i clienti reali)
-- Lancia questa SELECT a parte se vuoi verificare nome per nome PRIMA del fix:
--
--   select id, name, email, whatsapp,
--          '+39' || substring(whatsapp from 2) as proposed_fix
--   from profiles
--   where whatsapp ~ '^\+39\d{8}$'
--   order by name;

-- ── 3. FIX — premette `39` dopo il `+` per ricostruire il country code mancante
--    `+3925666618` (11 char) → `+393925666618` (13 char)
--    Ordine: prima profiles (riferimento utente), poi tabelle correlate.

update profiles
set whatsapp = '+39' || substring(whatsapp from 2)
where whatsapp ~ '^\+39\d{8}$';

update bookings
set whatsapp = '+39' || substring(whatsapp from 2)
where whatsapp ~ '^\+39\d{8}$';

update credits
set whatsapp = '+39' || substring(whatsapp from 2)
where whatsapp ~ '^\+39\d{8}$';

update manual_debts
set whatsapp = '+39' || substring(whatsapp from 2)
where whatsapp ~ '^\+39\d{8}$';

update bonuses
set whatsapp = '+39' || substring(whatsapp from 2)
where whatsapp ~ '^\+39\d{8}$';

update slot_access_requests
set user_whatsapp = '+39' || substring(user_whatsapp from 2)
where user_whatsapp ~ '^\+39\d{8}$';
