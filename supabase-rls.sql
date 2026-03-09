-- ============================================================
-- SUPABASE RLS — Thomas Bresciani Palestra (idempotente)
-- DROP POLICY IF EXISTS + CREATE POLICY: sicuro da rieseguire
-- ============================================================

-- ─── bookings ────────────────────────────────────────────────
alter table bookings enable row level security;

drop policy if exists "bookings_public_read"   on bookings;
drop policy if exists "bookings_public_insert" on bookings;
drop policy if exists "bookings_select_own"    on bookings;
drop policy if exists "bookings_insert_own"    on bookings;
drop policy if exists "bookings_update_own"    on bookings;

create policy "bookings_public_read"
    on bookings for select using (true);

-- bookings_public_insert rimossa: solo utenti autenticati possono prenotare.
-- Le prenotazioni passano per book_slot_atomic (SECURITY DEFINER) che bypassa RLS.
-- drop policy if exists "bookings_public_insert" on bookings;

create policy "bookings_select_own"
    on bookings for select to authenticated using (user_id = auth.uid());

create policy "bookings_insert_own"
    on bookings for insert to authenticated with check (user_id = auth.uid());

create policy "bookings_update_own"
    on bookings for update to authenticated
    using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─── profiles ────────────────────────────────────────────────
alter table profiles enable row level security;

drop policy if exists "profiles_select_own" on profiles;
drop policy if exists "profiles_insert_own" on profiles;
drop policy if exists "profiles_update_own" on profiles;

create policy "profiles_select_own"
    on profiles for select to authenticated using (id = auth.uid());

create policy "profiles_insert_own"
    on profiles for insert to authenticated with check (id = auth.uid());

create policy "profiles_update_own"
    on profiles for update to authenticated
    using (id = auth.uid()) with check (id = auth.uid());

-- ─── credits ─────────────────────────────────────────────────
alter table credits enable row level security;

drop policy if exists "credits_select_own" on credits;
create policy "credits_select_own"
    on credits for select to authenticated using (user_id = auth.uid());

-- ─── schedule_overrides ──────────────────────────────────────
alter table schedule_overrides enable row level security;

drop policy if exists "schedule_overrides_public_read"   on schedule_overrides;
drop policy if exists "schedule_overrides_select_public" on schedule_overrides;
create policy "schedule_overrides_select_public"
    on schedule_overrides for select to anon, authenticated using (true);

-- ─── manual_debts ────────────────────────────────────────────
alter table manual_debts enable row level security;

drop policy if exists "manual_debts_select_own" on manual_debts;
create policy "manual_debts_select_own"
    on manual_debts for select to authenticated using (user_id = auth.uid());

-- ─── push_subscriptions ──────────────────────────────────────
alter table push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_insert_own" on push_subscriptions;
drop policy if exists "push_subscriptions_select_own" on push_subscriptions;
drop policy if exists "push_subscriptions_delete_own" on push_subscriptions;

create policy "push_subscriptions_insert_own"
    on push_subscriptions for insert to authenticated with check (user_id = auth.uid());

create policy "push_subscriptions_select_own"
    on push_subscriptions for select to authenticated using (user_id = auth.uid());

create policy "push_subscriptions_delete_own"
    on push_subscriptions for delete to authenticated using (user_id = auth.uid());

-- ─── settings ────────────────────────────────────────────────
alter table settings enable row level security;

drop policy if exists "settings_select_public" on settings;
create policy "settings_select_public"
    on settings for select to anon, authenticated using (true);
