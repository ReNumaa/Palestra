# Riassunto Progetto — TB Training

## Task: Fix app freeze dopo background PWA
**Data:** 2026-03-24
**Durata stimata:** ~40 min Claude + ~10 min prompt utente

### Modifiche effettuate
- Aggiunto lock con timeout 5s al client Supabase per prevenire deadlock `navigator.locks` quando la PWA viene sospesa dall'OS durante un token refresh
- Aggiunto `try/catch/finally` alle async IIFE in admin-clients.js e admin-payments.js che lasciavano bottoni permanentemente disabilitati su errore
- Aggiunto re-sync automatico di bookings, crediti e debiti quando l'app torna in foreground dopo ≥30 secondi di background
- Cache bump SW v141 → v143

### Decisioni prese
- Lock timeout 5s: compromesso tra sicurezza (previene refresh concorrenti tra tab) e affidabilità (non blocca mai l'app)
- Re-sync solo dopo 30s di background: evita traffico inutile su switch tab veloci
- Re-sync silenzioso (nessun loading/toast): non interferisce con l'UX

### File toccati
- `js/supabase-client.js` — custom lock handler con AbortController + timeout 5s
- `js/admin-clients.js` — try/catch/finally su saveBookingRowEdit e deleteBookingFromClients
- `js/admin-payments.js` — try/catch su deleteManualDebtEntry e deleteCreditEntryFromCard
- `js/auth.js` — re-sync dati al visibilitychange dopo background ≥30s
- `sw.js` — cache bump v143

### Consumo risorse (solo per progetti cliente)
| Voce | Valore |
|------|--------|
| Tempo task Claude | ~40 min |
| Tempo prompt utente (stimato) | ~10 min |
| Token input (stimati) | ~120k |
| Token output (stimati) | ~15k |

## Task: Fix "Da pagare" non sottrae credito disponibile
**Data:** 2026-03-24
**Durata stimata:** ~30 min Claude + ~10 min prompt utente

### Modifiche effettuate
- Fix badge "Da pagare" nelle card partecipanti del calendario admin: ora sottrae il credito disponibile dal debito lordo (prima mostrava il debito manuale senza compensare il credito)
- Migration Supabase: fix trigger `auto_link_credit_user_id` (case-insensitive come manual_debts), fix `link_anonymous_on_register`, aggiunto normalize_email su profiles, backfill user_id NULL su credits, RLS fallback su email
- Cache bump SW v143 → v144

### Decisioni prese
- Il bug visibile era nel JS admin (admin-calendar.js), non nella RLS — ma la migration era comunque necessaria per il lato utente (prenotazioni.html)
- RLS con fallback email come rete di sicurezza: se user_id resta NULL, l'utente vede comunque i propri crediti

### File toccati
- `js/admin-calendar.js` — `_buildParticipantCard()`: sottrae `CreditStorage.getBalance()` dal debito lordo
- `supabase/migrations/20260324200000_fix_credits_user_visibility.sql` — fix trigger + RLS + backfill
- `sw.js` — cache bump v144

### Consumo risorse (solo per progetti cliente)
| Voce | Valore |
|------|--------|
| Tempo task Claude | ~30 min |
| Tempo prompt utente (stimato) | ~10 min |
| Token input (stimati) | ~200k |
| Token output (stimati) | ~20k |

## Task: Await mancanti su operazioni credito/debito nelle cancellazioni
**Data:** 2026-03-24
**Durata stimata:** ~15 min Claude + ~5 min prompt utente

### Modifiche effettuate
- Rese async le funzioni di cancellazione offline in data.js: cancelDirectly, cancelAndConvertSlot, cancelWithBonus, cancelWithPenalty, fulfillPendingCancellations
- Aggiunto `await` su tutte le chiamate `CreditStorage.addCredit()` e `ManualDebtStorage.addDebt()` nelle cancellazioni
- Aggiornati i chiamanti in prenotazioni.html con `await`
- Cache bump SW v144 → v145

### Decisioni prese
- Queste funzioni sono i fallback offline (quando Supabase non è disponibile), quindi il rischio era limitato ma reale: rimborso credito perso se l'utente navigava via prima del salvataggio async
- I chiamanti erano già tutti in funzioni async, quindi zero impatto sulla catena di chiamate

### File toccati
- `js/data.js` — 5 funzioni rese async + 6 await aggiunti
- `prenotazioni.html` — 4 await aggiunti sui chiamanti offline
- `sw.js` — cache bump v145

### Consumo risorse (solo per progetti cliente)
| Voce | Valore |
|------|--------|
| Tempo task Claude | ~15 min |
| Tempo prompt utente (stimato) | ~5 min |
| Token input (stimati) | ~80k |
| Token output (stimati) | ~10k |

## Task: Timeout 12s su tutte le RPC prive di timeout
**Data:** 2026-03-24
**Durata stimata:** ~20 min Claude + ~5 min prompt utente

### Modifiche effettuate
- Wrappato con `_rpcWithTimeout()` tutte le chiamate RPC Supabase che non avevano timeout in admin-payments.js, admin-clients.js e prenotazioni.html
- Ora se Supabase non risponde entro 12 secondi, l'operazione viene interrotta e l'utente vede un messaggio di errore invece di restare bloccato
- Cache bump SW v145 → v146

### Decisioni prese
- Timeout 12s (il default di `_rpcWithTimeout`, già usato in data.js): sufficiente per operazioni normali, abbastanza corto da non far sembrare l'app bloccata
- Nessuna logica cambiata: solo aggiunto il wrapper attorno alla promise esistente

### File toccati
- `js/admin-payments.js` — timeout su 8 RPC (get_debtors, delete, add, edit, pay, apply_credit)
- `js/admin-clients.js` — timeout su 6 RPC (change_payment, delete_booking, rename, delete_client, delete_tx)
- `prenotazioni.html` — timeout su 4 RPC (cancel_booking x3, user_request_cancellation)
- `sw.js` — cache bump v146

### Consumo risorse (solo per progetti cliente)
| Voce | Valore |
|------|--------|
| Tempo task Claude | ~20 min |
| Tempo prompt utente (stimato) | ~5 min |
| Token input (stimati) | ~100k |
| Token output (stimati) | ~12k |

## Task: SW network-first per JS + riduzione lock timeout a 1s
**Data:** 2026-03-25
**Durata stimata:** ~15 min Claude + ~10 min prompt utente

### Modifiche effettuate
- Cambiata strategia caching SW per JS/CSS da stale-while-revalidate a network-first: il browser scarica sempre il JS fresco dal server, fallback cache solo se offline
- Ridotto lock timeout Supabase da 5s → 2s → 1s dopo test utente: l'app è pronta quasi istantaneamente dopo il ritorno da background
- Ridotto visibilitychange wait da 1s a 500ms
- Cache bump SW v146 → v149 (poi v152 dall'utente)

### Decisioni prese
- Network-first per JS: leggero aumento di traffico rete ma garantisce che gli aggiornamenti arrivino subito — fondamentale per una PWA che si aggiorna spesso
- Lock timeout 1s: sufficiente per lock libero (istantaneo), abbastanza corto da non bloccare l'utente se il lock è stuck. Rischio concorrenza tra tab trascurabile per app single-user

### File toccati
- `sw.js` — strategia JS/CSS da stale-while-revalidate a network-first + cache bump
- `js/supabase-client.js` — lock timeout ridotto a 1s
- `js/auth.js` — visibilitychange wait ridotto a 500ms

### Consumo risorse (solo per progetti cliente)
| Voce | Valore |
|------|--------|
| Tempo task Claude | ~15 min |
| Tempo prompt utente (stimato) | ~10 min |
| Token input (stimati) | ~60k |
| Token output (stimati) | ~8k |

## Task: GPS Proximity Tracking + Storico Notifiche
**Data:** 2026-03-27

### Modifiche effettuate

#### GPS Proximity
- Banner "📍 Abilita la posizione" per tutti gli utenti — salva `geo_enabled` sul profilo via RPC
- Watch GPS: monitora posizione utente con prenotazione ±2h, notifica admin entro 200m dalla palestra
- Notifica anche senza prenotazione: "📍 Nome — In palestra senza prenotazione"
- Nuova Edge Function `notify-admin-proximity` — invia push a tutti gli admin (Thomas + Andrea)
- `arrived_at` su bookings: scritto via RPC `mark_booking_arrived` quando proximity scatta
- Icone in admin calendario (solo oggi): ✅ arrivato, ⚠️ GPS/push mancanti, ❌ non arrivato (slot iniziato da 10+ min)
- Sync `geo_enabled` su tutte le pagine: controlla permesso GPS → aspetta sessione auth → chiama RPC

#### Storico Notifiche Admin
- Nuova tabella `admin_messages`: tipo, titolo, body, client_name, date, time, slot_type, sent_count
- Edge Functions aggiornate (notify-admin-booking, cancellation, proximity, new-client): INSERT dopo invio push
- Sezione "📩 Storico notifiche" nel tab Registro con filtri tipo/data e paginazione

#### Storico Notifiche Clienti
- Nuova tabella `client_notifications`: user_id, user_name, user_email, type, title, body, status (sent/failed/no_subscription), error, booking_date/time
- Edge Functions aggiornate (send-reminders, notify-slot-available, send-admin-message): log per ogni utente con stato
- Sezione "📬 Notifiche ai clienti" nel tab Registro con filtri tipo/stato/cliente/data e paginazione

#### Backup
- `arrived_at` incluso nel converter cron→admin
- `geo_enabled` incluso nel restore profili
- `admin_messages` e `client_notifications` inclusi in export/import

### File toccati
- `js/push.js` — geolocation tracker, banner GPS, sync geo_enabled, haversine distance
- `js/data.js` — arrivedAt in _mapRow, geoEnabled in syncUsers, syncPushEnabledUsers/hasPushEnabled
- `js/admin-calendar.js` — _proximityIcon() accanto al nome partecipante
- `js/admin-registro.js` — sezioni Storico notifiche + Notifiche clienti con filtri/paginazione
- `js/admin-backup.js` — export/import admin_messages e client_notifications
- `admin.html` — HTML sezioni messaggi + notifiche clienti, syncPushEnabledUsers all'init
- `index.html`, `prenotazioni.html` — chiamata startProximityWatch
- `supabase/functions/notify-admin-proximity/index.ts` — nuova Edge Function
- `supabase/functions/notify-admin-booking/index.ts` — INSERT admin_messages
- `supabase/functions/notify-admin-cancellation/index.ts` — INSERT admin_messages
- `supabase/functions/notify-admin-new-client/index.ts` — INSERT admin_messages
- `supabase/functions/send-reminders/index.ts` — INSERT client_notifications per utente
- `supabase/functions/notify-slot-available/index.ts` — INSERT client_notifications per utente
- `supabase/functions/send-admin-message/index.ts` — INSERT client_notifications per utente
- `supabase/migrations/20260327200000_proximity_tracking.sql` — arrived_at, geo_enabled, 3 RPC, get_all_profiles aggiornata
- `supabase/migrations/20260327300000_admin_messages.sql` — tabella admin_messages
- `supabase/migrations/20260327400000_client_notifications.sql` — tabella client_notifications
- `sw.js` — cache bump v157 → v170
