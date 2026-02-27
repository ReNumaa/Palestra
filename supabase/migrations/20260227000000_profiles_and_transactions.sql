-- ─── PROFILES ─────────────────────────────────────────────────────────────────
-- Profilo utente collegato a Supabase Auth.
-- user_id è stabile: non cambia mai, anche se l'utente cambia email o numero.
-- Supporta sia Google OAuth che email/password.
create table profiles (
    id                   uuid primary key references auth.users(id) on delete cascade,
    created_at           timestamptz not null default now(),
    name                 text        not null,
    email                text        not null unique,
    whatsapp             text,
    medical_cert_expiry  date,
    medical_cert_history jsonb       not null default '[]'
);

alter table profiles enable row level security;

-- Ogni utente legge e aggiorna solo il proprio profilo
create policy "profiles_select_own" on profiles
    for select using (auth.uid() = id);

create policy "profiles_insert_own" on profiles
    for insert with check (auth.uid() = id);

create policy "profiles_update_own" on profiles
    for update using (auth.uid() = id);


-- ─── BOOKINGS: colonne mancanti ───────────────────────────────────────────────
alter table bookings
    add column user_id                    uuid references profiles(id) on delete set null,
    add column credit_applied             numeric(10,2) not null default 0,
    add column cancellation_requested_at  timestamptz,
    add column cancelled_at               timestamptz;

create index bookings_user_id_idx on bookings (user_id);


-- ─── CREDITS: aggiungi user_id ────────────────────────────────────────────────
-- user_id è nullable: l'admin può aggiungere credito anche a clienti non registrati,
-- identificati solo da email/whatsapp.
alter table credits
    add column user_id uuid references profiles(id) on delete cascade;

create index credits_user_id_idx on credits (user_id);


-- ─── TRIGGER: collega prenotazioni anonime al profilo al momento della registrazione
-- Quando un utente si registra, i suoi booking e crediti fatti prima
-- (identificati per email) vengono collegati al suo user_id.
create or replace function link_anonymous_on_register()
returns trigger language plpgsql security definer as $$
begin
    update bookings
    set    user_id = new.id
    where  email   = new.email
      and  user_id is null;

    update credits
    set    user_id = new.id
    where  email   = new.email
      and  user_id is null;

    return new;
end;
$$;

create trigger on_profile_created
    after insert on profiles
    for each row execute function link_anonymous_on_register();


-- ─── FUNZIONE: applicazione crediti atomica ───────────────────────────────────
-- Salda le prenotazioni non pagate usando il credito disponibile.
-- Tutto avviene in una singola transazione: o funziona tutto o non funziona niente.
-- Chiamata via: supabase.rpc('apply_credits_to_bookings', { p_user_id: '...' })
create or replace function apply_credits_to_bookings(p_user_id uuid)
returns json language plpgsql security definer as $$
declare
    v_credit_id     uuid;
    v_balance       numeric(10,2);
    v_booking       record;
    v_price         numeric(10,2);
    v_remaining     numeric(10,2);
    v_total_applied numeric(10,2) := 0;
    v_count         integer       := 0;
    v_now           timestamptz   := now();
begin
    -- Blocca la riga crediti per evitare modifiche concorrenti
    select id, balance
    into   v_credit_id, v_balance
    from   credits
    where  user_id = p_user_id
    for update;

    if v_credit_id is null or v_balance <= 0 then
        return json_build_object('applied', 0, 'count', 0);
    end if;

    -- Scorre le prenotazioni non pagate in ordine cronologico
    for v_booking in
        select *
        from   bookings
        where  user_id = p_user_id
          and  paid    = false
          and  status  = 'confirmed'
        order  by date asc, time asc
        for update
    loop
        v_price := case v_booking.slot_type
            when 'personal-training' then 5
            when 'small-group'       then 10
            when 'group-class'       then 50
            else 0
        end;

        v_remaining := v_price - coalesce(v_booking.credit_applied, 0);

        if v_balance >= v_remaining then
            -- Pagamento completo
            update bookings set
                paid           = true,
                payment_method = 'credito',
                paid_at        = v_now,
                credit_applied = 0
            where id = v_booking.id;

            v_balance       := v_balance - v_remaining;
            v_total_applied := v_total_applied + v_remaining;
            v_count         := v_count + 1;

        elsif v_balance > 0 and coalesce(v_booking.credit_applied, 0) = 0 then
            -- Pagamento parziale (solo se non è già stato applicato credito parziale)
            update bookings set credit_applied = v_balance
            where id = v_booking.id;

            v_total_applied := v_total_applied + v_balance;
            v_balance       := 0;
        end if;

        exit when v_balance <= 0;
    end loop;

    -- Aggiorna saldo e storico solo se qualcosa è stato applicato
    if v_total_applied > 0 then
        update credits
        set    balance = v_balance
        where  id      = v_credit_id;

        insert into credit_history (credit_id, amount, note)
        values (
            v_credit_id,
            -v_total_applied,
            'Auto-pagamento ' || v_count || ' lezione' ||
            case when v_count > 1 then 'i' else '' end || ' con credito'
        );
    end if;

    return json_build_object('applied', v_total_applied, 'count', v_count);
end;
$$;


-- ─── NOTE PER LA MIGRAZIONE ───────────────────────────────────────────────────
-- Le operazioni admin (UPDATE, DELETE su bookings/credits, lettura di tutti i profili)
-- devono usare la service_role key lato server — bypassa RLS senza bisogno
-- di policy complesse. Non esporre mai la service_role key nel frontend.
