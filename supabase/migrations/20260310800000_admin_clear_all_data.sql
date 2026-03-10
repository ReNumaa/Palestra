-- ─── RPC admin_clear_all_data ────────────────────────────────────────────────
-- Cancella tutti i dati delle tabelle operative in un'unica chiamata server-side.
-- security definer → bypassa RLS, ma controlla is_admin() esplicitamente.

create or replace function admin_clear_all_data()
returns void language plpgsql security definer
set search_path = public as $$
begin
    if not is_admin() then
        raise exception 'Accesso negato: richiesto ruolo admin';
    end if;

    delete from credit_history;
    delete from credits;
    delete from manual_debts;
    delete from bonuses;
    delete from schedule_overrides;
    delete from bookings;
end;
$$;

revoke all on function admin_clear_all_data() from public;
grant execute on function admin_clear_all_data() to authenticated;
