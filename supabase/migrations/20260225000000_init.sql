-- TB Training — Schema iniziale
-- Tabelle: bookings, schedule_overrides, credits, credit_history

-- ─── BOOKINGS ────────────────────────────────────────────────────────────────
create table bookings (
    id              uuid primary key default gen_random_uuid(),
    created_at      timestamptz not null default now(),
    date            date not null,
    time            text not null,           -- es. '08:00 - 09:20'
    slot_type       text not null,           -- 'personal-training' | 'small-group' | 'group-class'
    name            text not null,
    email           text not null,
    whatsapp        text,
    notes           text,
    status          text not null default 'confirmed',
    paid            boolean not null default false,
    payment_method  text,                    -- 'contanti' | 'carta' | 'iban' | 'credito'
    paid_at         timestamptz
);

-- Indici utili per le query più comuni
create index bookings_date_idx      on bookings (date);
create index bookings_email_idx     on bookings (email);
create index bookings_date_time_idx on bookings (date, time);

-- ─── SCHEDULE OVERRIDES ──────────────────────────────────────────────────────
-- Una riga per ogni slot di ogni giorno modificato rispetto al template settimanale
create table schedule_overrides (
    id          uuid primary key default gen_random_uuid(),
    created_at  timestamptz not null default now(),
    date        date not null,
    time        text not null,       -- es. '08:00 - 09:20'
    slot_type   text,                -- null = slot disabilitato per quel giorno
    unique (date, time)
);

-- ─── CREDITS ─────────────────────────────────────────────────────────────────
-- Saldo crediti per cliente (whatsapp + email come chiave logica)
create table credits (
    id          uuid primary key default gen_random_uuid(),
    created_at  timestamptz not null default now(),
    name        text not null,
    whatsapp    text,
    email       text not null,
    balance     numeric(10,2) not null default 0,
    unique (email)
);

-- ─── CREDIT HISTORY ──────────────────────────────────────────────────────────
-- Storico movimenti credito per ogni cliente
create table credit_history (
    id          uuid primary key default gen_random_uuid(),
    created_at  timestamptz not null default now(),
    credit_id   uuid not null references credits(id) on delete cascade,
    amount      numeric(10,2) not null,   -- positivo = ricarica, negativo = utilizzo
    note        text
);

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────────────────────
-- Abilita RLS su tutte le tabelle (per ora tutto bloccato, poi configuriamo le policy)
alter table bookings          enable row level security;
alter table schedule_overrides enable row level security;
alter table credits            enable row level security;
alter table credit_history     enable row level security;

-- Policy pubblica: chiunque può LEGGERE schedule_overrides (serve al calendario pubblico)
create policy "schedule_overrides_public_read"
    on schedule_overrides for select
    using (true);

-- Policy pubblica: chiunque può LEGGERE bookings (serve per contare posti disponibili)
-- Nota: in produzione limitare i campi esposti tramite view o RLS più granulare
create policy "bookings_public_read"
    on bookings for select
    using (true);

-- Policy pubblica: chiunque può INSERIRE una prenotazione (form pubblico)
create policy "bookings_public_insert"
    on bookings for insert
    with check (true);

-- Tutte le altre operazioni (UPDATE, DELETE, lettura crediti) richiederanno auth admin
