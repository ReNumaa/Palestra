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
- `supabase/migrations/20260327500000_push_enabled_profile.sql` — push_enabled su profiles + RPC + get_all_profiles
- `sw.js` — cache bump v157 → v174

#### Flag push_enabled + icona 🔕
- Nuova colonna `push_enabled` su profiles: sincronizzata dal client ad ogni apertura via RPC `set_push_enabled`
- Icona 🔕 accanto al nome in admin calendario se le notifiche non sono attive; nessuna icona se attive
- Incluso in backup restore profili

## Task: Fix cancellazione prenotazioni admin — popup chiude prima del salvataggio Supabase
**Data:** 2026-03-27
**Durata stimata:** ~30 min Claude + ~10 min prompt utente

### Modifiche effettuate
- Riscritto `deleteBooking()` in admin-calendar.js per usare la RPC atomica `cancel_booking_with_refund` invece di `replaceAllBookings()` fire-and-forget
- Il popup ora aspetta la risposta Supabase prima di chiudersi, mostrando "Salvataggio..." sul bottone Conferma
- Toast verde "Prenotazione annullata con successo" dopo il salvataggio
- In caso di errore: toast rosso + bottoni riabilitati per riprovare
- Fallback locale mantenuto per modalità offline (senza Supabase)
- Sync completo (bookings + crediti + debiti + bonus) dopo RPC prima di aggiornare la UI
- Mora/senza mora funziona identicamente per lezioni passate e future (nessuna distinzione)

### Decisioni prese
- Usata la RPC `cancel_booking_with_refund` (già esistente, atomica server-side) invece di operazioni client-side separate: previene stati parziali
- Nessuna distinzione passato/futuro: l'admin sceglie sempre mora o senza mora, con stessa logica rimborso credito
- Con mora + pagato = rimborso 50% credito; con mora + non pagato = addebito mora 50%
- Senza mora + pagato = rimborso 100% credito; senza mora + non pagato = solo cancellazione
- Bottoni disabilitati durante il salvataggio: previene doppi click

### File toccati
- `js/admin-calendar.js` — riscrittura completa di `deleteBooking()`: helper `_cancelViaRpc` (async, RPC + sync) e `_cancelLocal` (fallback offline)
- `sw.js` — cache bump v176 → v180

### Consumo risorse (solo per progetti cliente)
| Voce | Valore |
|------|--------|
| Tempo task Claude | ~30 min |
| Tempo prompt utente (stimato) | ~10 min |
| Token input (stimati) | ~200k |
| Token output (stimati) | ~18k |

## Task: Privacy prenotazioni + "Persone iscritte" + slot completi cliccabili
**Data:** 2026-03-27
**Durata stimata:** ~30 min Claude + ~10 min prompt utente

### Modifiche effettuate
- Nuova colonna `privacy_prenotazioni` su profiles (default `true` = nome nascosto)
- Checkbox "Privacy prenotazioni" nel modal modifica profilo in prenotazioni.html
- Sezione collapsible "Persone iscritte" nel modal di prenotazione (index.html) con `<details>/<summary>`
- RPC `get_slot_attendees(date, time)` — SECURITY DEFINER, restituisce solo nomi di utenti con privacy OFF
- `get_all_profiles()` aggiornata per includere `privacy_prenotazioni`
- Slot completi resi cliccabili (desktop, mobile, split): aprono il modal con form nascosto e tendina "Persone iscritte" aperta automaticamente

### Decisioni prese
- **Privacy ON di default**: GDPR-friendly, l'utente deve esplicitamente scegliere di essere visibile
- **RPC SECURITY DEFINER**: necessaria perché le RLS non permettono agli utenti di leggere le prenotazioni altrui
- **`<details>/<summary>` nativo**: dropdown senza JS aggiuntivo, leggero e accessibile
- **Slot pieni cliccabili**: cursor pointer, modal mostra solo info slot + persone iscritte (no form prenotazione)

### File toccati
- `supabase/migrations/20260328000000_privacy_prenotazioni.sql` — colonna + RPC + get_all_profiles aggiornata
- `js/auth.js` — `_loadProfile` select + `updateUserProfile` handler per privacy_prenotazioni
- `prenotazioni.html` — checkbox HTML nel modal profilo + wiring JS (openEditProfileModal + submit)
- `index.html` — sezione `#slotAttendees` con details/summary nel modal prenotazione
- `js/booking.js` — fetch attendees + hide form per slot pieni + reset in closeBookingModal
- `js/calendar.js` — slot completi cliccabili (3 punti: desktop, split, mobile)
- `css/prenotazioni.css` — stili checkbox `.edit-profile-checkbox-label`
- `css/style.css` — stili `.slot-attendees-*` per il dropdown persone iscritte
- `sw.js` — cache bump v177 → v181

### Consumo risorse (solo per progetti cliente)
| Voce | Valore |
|------|--------|
| Tempo task Claude | ~30 min |
| Tempo prompt utente (stimato) | ~10 min |
| Token input (stimati) | ~200k |
| Token output (stimati) | ~20k |

## Task: Fix cron reminder push notifications + deploy Edge Function
**Data:** 2026-03-28
**Durata stimata:** ~30 min Claude + ~20 min prompt utente

### Modifiche effettuate
- Diagnosticato che i reminder push (25h e 1h prima della lezione) non funzionavano: il cron pg_cron non era mai stato configurato in database
- Creato job pg_cron `send-reminders` con schedule `*/5 * * * *` via `cron.schedule()` + `net.http_post()`
- Salvata `service_role_key` nel vault Supabase (`vault.create_secret`) per autenticazione sicura
- Scoperto che tutte le chiamate tornavano 401: la Edge Function `send-reminders` era deployata con verifica JWT attiva
- Ri-deployata con `supabase functions deploy send-reminders --no-verify-jwt` — risolto (200 OK)
- Verificato che `notifyAdminNewClient` era già collegata in `login.html:380` (non serviva aggiunta in auth.js)
- Cache bump `sw.js` v181 → v182

### Decisioni prese
- **pg_cron + pg_net** invece di Dashboard Schedules: quest'ultima non disponibile su free tier
- **Vault per service_role_key**: più sicuro che hardcodare la chiave nel SQL del cron job
- **`--no-verify-jwt`**: necessario perché pg_net non invia un JWT utente ma la service_role_key come Bearer token

### File toccati
- `sw.js` — cache bump v181 → v182
- Supabase: `cron.job` — nuovo job #4 `send-reminders`
- Supabase: `vault.secrets` — aggiunta `service_role_key`
- Edge Function `send-reminders` — ri-deployata con `--no-verify-jwt`

### Consumo risorse (solo per progetti cliente)
| Voce | Valore |
|------|--------|
| Tempo task Claude | ~30 min |
| Tempo prompt utente (stimato) | ~20 min |
| Token input (stimati) | ~250k |
| Token output (stimati) | ~20k |

## Task: Grace period 10 minuti per annullamento prenotazioni
**Data:** 2026-03-28
**Durata stimata:** ~10 min Claude + ~5 min prompt utente

### Modifiche effettuate
- Aggiunto grace period di 10 minuti dopo la creazione della prenotazione: entro questo periodo l'utente può annullare con "Annulla prenotazione" (cancellazione diretta, rimborso pieno) anche se la lezione è entro le 24h
- Dopo i 10 minuti, riprende la logica normale (bonus/mora/richiesta annullamento a seconda della modalità configurata)
- Applicato sia lato utente (prenotazioni.html) sia lato admin (admin-schedule.js)

### Decisioni prese
- Il grace period usa `createdAt` del booking: se mancante (prenotazioni vecchie senza timestamp), il grace period non si attiva (fallback sicuro)
- Lato admin: durante il grace period, il popup bonus/mora viene saltato e si mostra il confirm semplice

### File toccati
- `prenotazioni.html` — logica display pulsanti: `_inGracePeriod` bypassa `_canCancelDirect`
- `js/admin-schedule.js` — `clearSlotClient()`: grace period rende `isWithin24h = false`

### Consumo risorse (solo per progetti cliente)
| Voce | Valore |
|------|--------|
| Tempo task Claude | ~10 min |
| Tempo prompt utente (stimato) | ~5 min |
| Token input (stimati) | ~80k |
| Token output (stimati) | ~8k |

## Task: Fix notifiche duplicate + pulizia GPS/proximity + vari fix UI
**Data:** 2026-03-29

### Modifiche effettuate

#### Fix notifiche promemoria duplicate
- Edge Function `send-reminders`: update atomico del flag `reminder_*_sent` prima dell'invio push, evita duplicati su esecuzioni concorrenti del cron
- Usato `.select('id')` invece di `count` per claim atomico delle righe da notificare

#### Pulizia GPS proximity
- Rimossa Edge Function `notify-admin-proximity` (non più utilizzata)
- Rimossa `_proximityIcon()` e icone GPS (✅/⚠️/❌/👍🏻) dalle card prenotazioni admin
- Disabilitata geolocalizzazione su iOS (non supporta background tracking affidabile)
- Warning ⚠️ solo per notifiche push, rimosso check GPS
- Banner geo/push migliorati: mostrati solo per utenti con prenotazioni, gestione permessi negati

#### Privacy prenotazioni
- Nascosta lista iscritti a chi ha privacy attiva (tendina visibile solo se l'utente ha privacy OFF)

#### Vari fix UI
- Fix slot prenotato mostra 0 disponibili invece di -1
- Escluse prenotazioni admin dalle statistiche
- Mostra solo il nome (senza cognome) in prenotazioni.html
- Registro: sub-tabs (Registro, Notifiche admin, Notifiche clienti) al posto della summary bar
- Fix a capo nella data prenotazione (white-space: nowrap)
- Fix gap sotto bottom-sheet modale su mobile
- Pagina nutrizione: pacchetto 199€, timeline 5 step

### File toccati
- `supabase/functions/send-reminders/index.ts` — fix claim atomico
- `supabase/functions/notify-admin-proximity/` — rimossa
- `js/push.js` — disabilitata geo su iOS, banner solo con prenotazioni
- `js/admin-calendar.js` — rimossa `_proximityIcon`, rimosso check GPS
- `js/admin-registro.js` — sub-tabs
- `js/admin-analytics.js` — escluse prenotazioni admin
- `js/data.js` — fix conteggio disponibilità
- `prenotazioni.html` — solo nome, fix privacy
- `nutrizione.html` — pagina nutrizione
- `css/admin.css`, `css/prenotazioni.css`, `css/style.css` — vari fix UI

## Task: Perf analytics + fix scroll + revoke anon RPCs
**Data:** 2026-03-31

### Modifiche effettuate

#### Performance analytics admin
- Cache intelligente con range tracking (`_statsCacheRange`): se il filtro richiesto è già coperto dai dati in memoria, skip fetch Supabase
- Stale-while-revalidate: render immediato da cache, aggiornamento silenzioso dopo fetch
- Skeleton loading con anti-flicker (appare solo dopo 200ms di attesa)
- Refresh automatico su `visibilitychange` dopo >2 min di inattività
- `invalidateStatsCache()` chiamata dopo ogni save/cancel/delete booking

#### Fix scroll prenotazioni
- Auto-scroll alla prima apertura del tab prenotazioni admin, non ad ogni render
- Fix scroll dopo render e tab visibile (requestAnimationFrame doppio)

#### Sicurezza
- Revocate RPC `admin_add_credit` e `admin_pay_bookings` per ruolo `anon` (erano callable senza autenticazione)
- Migration `20260331000000_revoke_anon_credit_rpcs.sql`

### File toccati
- `js/admin-analytics.js` — cache + stale-while-revalidate + skeleton + visibilitychange
- `js/admin-calendar.js` — `invalidateStatsCache()` su save/cancel
- `js/admin-clients.js` — `invalidateStatsCache()` su edit/delete
- `js/admin-schedule.js` — `invalidateStatsCache()` su assegnazione
- `css/admin.css` — skeleton-pulse animation per stat cards
- `supabase/migrations/20260331000000_revoke_anon_credit_rpcs.sql`

## Task: Schede Palestra — gestione allenamento clienti
**Data:** 2026-03-31

### Modifiche effettuate

#### Database
- 3 nuove tabelle: `workout_plans` (schede), `workout_exercises` (esercizi), `workout_logs` (progressi)
- RLS: admin full CRUD, cliente read-only proprie schede + insert/update propri log
- RPC `admin_duplicate_plan`: duplica scheda con esercizi per assegnare a un altro cliente
- Colonna `is_template` su `workout_plans`: schede template riutilizzabili
- Tabelle aggiunte a Supabase Realtime per sync in tempo reale

#### Admin — Tab Schede
- Nuovo tab "Schede" nella dashboard admin con due sub-tabs: Schede (CRUD) e Clienti (overview)
- Creazione/modifica schede: nome, date, note, esercizi con drag-and-drop (sort_order)
- Catalogo esercizi con menu a tendina raggruppato per gruppo muscolare
- Duplicazione scheda verso un altro cliente
- Schede template standard + assegnazione rapida da vista Clienti
- Vista Clienti: lista clienti con grafici progressi per esercizio
- `js/admin-schede.js` — nuovo file con tutta la logica admin

#### Utente — Pagina Allenamento
- Nuova pagina `allenamento.html` con design dark fitness
- Mostra scheda attiva con esercizi raggruppati per giorno
- Selettore schede vecchie (storico)
- Sezione Progressi: grafici per esercizio con filtri temporali e per muscolo
- Log allenamento: inserimento peso/reps per ogni esercizio
- Gating: redirect se l'utente non ha un UID autorizzato (login richiesto)

### File toccati
- `supabase/migrations/20260401000000_workout_plans.sql` — schema + RLS + RPC
- `supabase/migrations/20260401100000_workout_plans_template.sql` — colonna is_template
- `supabase/migrations/20260401200000_duplicate_plan_no_copia.sql` — fix nome duplicati
- `js/admin-schede.js` — nuovo file (tab Schede admin)
- `admin.html` — tab Schede + Realtime subscribe workout_*
- `allenamento.html` — nuova pagina standalone
- `css/admin.css` — stili tab Schede

## Task: Fix pagamento admin paga anche prenotazioni future non selezionate
**Data:** 2026-03-31
**Durata stimata:** ~15 min Claude + ~5 min prompt utente

### Modifiche effettuate
- Rimossa logica auto-pay FIFO dalla RPC `admin_pay_bookings`: il credito in eccesso restava usato per pagare automaticamente tutte le prenotazioni non pagate (anche future), anche se l'admin aveva selezionato solo quelle passate
- Ora il credito in eccesso viene salvato come saldo credito senza toccare altre prenotazioni

### Decisioni prese
- Il credito in eccesso resta disponibile per: `apply_credit_to_past_bookings` (lezioni passate), `apply_credit_on_booking` (nuove prenotazioni), pagamenti futuri espliciti dall'admin
- Nessuna modifica al codice client-side: il bug era interamente server-side nella RPC

### File toccati
- `supabase/migrations/20260401300000_fix_admin_pay_no_autopay.sql` — nuova migration che ricrea `admin_pay_bookings` senza auto-pay FIFO

### Consumo risorse (solo per progetti cliente)
| Voce | Valore |
|------|--------|
| Tempo task Claude | ~15 min |
| Tempo prompt utente (stimato) | ~5 min |
| Token input (stimati) | ~40k |
| Token output (stimati) | ~8k |

## Task: Fix scheda cliente si chiude dopo eliminazione
**Data:** 2026-03-31
**Durata stimata:** ~20 min Claude + ~5 min prompt utente

### Modifiche effettuate
- Creata funzione helper `_refreshOpenClientCard(whatsapp, email)` che aggiorna la card del cliente aperta in-place, senza ri-renderizzare l'intera lista
- `deleteBookingFromClients()`: convertita in async, usa `_refreshOpenClientCard` invece di `renderClientsTab()`, `alert()` → `showToast()`
- `deleteTxEntry()`: rimossa `_reopenCard()` basata su indice, usa `_refreshOpenClientCard` con identità cliente, `alert()` → `showToast()`
- `clearClientCredit()`: usa `_refreshOpenClientCard` invece di `renderClientsTab()` + riapertura manuale
- **Bug fix critico**: `deleteTxEntry('booking', ...)` chiamava `admin_delete_booking_with_refund` che **eliminava la prenotazione** dal DB. Ora usa `admin_change_payment_method(paid=false)` che rimuove solo il pagamento, lasciando la prenotazione attiva

### Decisioni prese
- Il refresh avviene per identità del cliente (email/whatsapp) e non per indice nella lista, così funziona sia in modalità lista completa che dopo ricerca singolo cliente
- Se il cliente non esiste più (tutti i booking eliminati e non registrato), fallback a `renderClientsTab()`
- Errori mostrati con toast rosso (non bloccante) invece di `alert()` bloccante
- Distinzione chiara: bottone 🗑️ nella tabella prenotazioni = elimina booking; bottone 🗑️ nello storico transazioni = rimuove solo il pagamento

### File toccati
- `js/admin-clients.js` — nuova `_refreshOpenClientCard()`, fix `deleteBookingFromClients`, `deleteTxEntry`, `clearClientCredit`

### Consumo risorse (solo per progetti cliente)
| Voce | Valore |
|------|--------|
| Tempo task Claude | ~30 min |
| Tempo prompt utente (stimato) | ~10 min |
| Token input (stimati) | ~150k |
| Token output (stimati) | ~20k |

## Task: Miglioramento UX mobile tab Schede admin
**Data:** 2026-03-31
**Durata stimata:** ~25 min Claude + ~5 min prompt utente

### Modifiche effettuate
- Riscritta completamente la media query mobile (max-width: 600px) per il tab Schede in admin.css
- Sub-nav pills ingrandite con touch target da 44px+ per facilità d'uso su mobile
- Plan cards: layout orizzontale mantenuto su mobile (info a sinistra, azioni a destra) con bottoni 40x40px
- Editor topbar: layout orizzontale (back + titolo) invece di stack verticale
- Exercise rows: delete button posizionato in alto a destra (position: absolute), drag buttons in barra superiore con separatore
- Campi input esercizi (serie, reps, kg, rec) in griglia 2x2 con font 16px (previene zoom iOS)
- Day tabs con scroll orizzontale, scrollbar nascosta, min-height 40px
- Save button sticky in basso con sfondo gradient per visibilità durante scroll
- Assign bar (quick assign): select e button full-width su mobile
- Search bar ingrandita per touch
- Sostituiti inline styles JS con classi CSS dedicate: schede-stats-grid, schede-stat-card, schede-chart-header, schede-chart-stats, schede-section-title
- Stats grid client detail: card dedicate con icona/label/value ben strutturate
- Chart cards: header e stats con classi CSS, trend colorati (verde/rosso)

### Decisioni prese
- Mantenuto layout orizzontale per le plan cards su mobile (più leggibile che stack verticale)
- Delete button esercizio posizionato absolute in alto a destra per non occupare spazio nel flusso
- Font 16px su tutti gli input per evitare auto-zoom iOS
- Sticky save button con gradient bianco per non coprire contenuto ma restare sempre accessibile

### File toccati
- `css/admin.css` — Nuove classi (schede-section-title, schede-stats-grid, schede-stat-card, schede-chart-header, schede-chart-stats, trend classes) + riscrittura completa media query mobile schede
- `js/admin-schede.js` — Sostituiti inline styles con classi CSS per stats grid, chart cards, section titles, assign template bar
- `sw.js` — Bump CACHE_NAME a v208

### Consumo risorse (solo per progetti cliente)
| Voce | Valore |
|------|--------|
| Tempo task Claude | ~25 min |
| Tempo prompt utente (stimato) | ~5 min |
| Token input (stimati) | ~120k |
| Token output (stimati) | ~15k |

## Task: Muscolo prima di esercizio + fix sizing mobile editor
**Data:** 2026-03-31
**Durata stimata:** ~15 min Claude + ~5 min prompt utente

### Modifiche effettuate
- Invertito ordine nei campi esercizio: prima il muscolo, poi l'esercizio filtrato per quel muscolo
- `_buildExerciseSelect` ora accetta parametro `muscleGroup` e mostra solo esercizi di quel gruppo
- Nuova funzione `_schedeMuscleChanged()` che ricostruisce il select esercizi filtrato quando si cambia muscolo
- Params (Serie, Reps, Kg, Rec) su mobile: griglia 4 colonne (1fr x4) anziché 2, font ridotto a 0.85rem, padding compatto
- Select muscolo e esercizio: font 0.88rem, padding ridotto per non sbordare
- Note: font 0.82rem, box-sizing border-box per evitare overflow
- Exercise row: padding ridotto, overflow hidden

### Decisioni prese
- Griglia 4 colonne per params su mobile: Serie/Reps/Kg/Rec tutti sulla stessa riga, compatti ma leggibili
- Quando si cambia muscolo, se l'esercizio corrente non appartiene al nuovo gruppo viene resettato
- Se nessun muscolo selezionato, il select esercizi mostra tutti raggruppati per optgroup (come prima)

### File toccati
- `js/admin-schede.js` — Nuova `_schedeMuscleChanged()`, aggiornato `_buildExerciseSelect` con filtro muscolo, invertito ordine campi
- `css/admin.css` — Fix sizing mobile: params 4 colonne, select/notes compatti, box-sizing
- `sw.js` — Bump CACHE_NAME a v209

### Consumo risorse (solo per progetti cliente)
| Voce | Valore |
|------|--------|
| Tempo task Claude | ~15 min |
| Tempo prompt utente (stimato) | ~5 min |
| Token input (stimati) | ~100k |
| Token output (stimati) | ~12k |

## Task: Fix fatturato reale — soldi in cassa senza double counting
**Data:** 2026-04-01
**Durata stimata:** ~60 min Claude + ~20 min prompt utente

### Modifiche effettuate

#### Fatturato reale
- Ristrutturato calcolo fatturato "Reale" per rappresentare i **soldi effettivamente incassati** (cassa)
- Credit history entries con `displayAmount` (da `admin_pay_bookings`) usano `displayAmount` come valore cassa (= soldi totali ricevuti dall'admin)
- Credit history entries senza `displayAmount` (da `admin_add_credit`) usano `amount` come prima
- Booking processati via RPC esclusi dal conteggio (matching `email|paidAt`): il loro incasso è già catturato dal `displayAmount`
- More (penalità cancellazione) rimosse dal fatturato reale: rappresentano creazione debito, non soldi incassati. Il cash arriva quando vengono pagate via `admin_pay_bookings`
- Inferenza method da booking per vecchie credit_history senza campo `method` (pre-migration)

#### Grafico a torta "Per tipo di pagamento"
- Rimossa categoria `lezione-gratuita` (non sono soldi reali)
- Applicata stessa deduplicazione e `_cashValue` del fatturato
- Filtro coerente con il KPI principale

#### Report settimanale e fiscale
- Transazione unica per pagamenti processati via `admin_pay_bookings`: usa `displayAmount` come importo, esclude booking e debiti corrispondenti
- Inferenza method da booking per vecchie entry senza `method`
- Es. Valentina Bertelli: prima 2 righe (€10 booking + €50 debito), ora 1 riga (€60 Pagamento)

### Decisioni prese
- **displayAmount come fonte primaria**: `admin_pay_bookings` salva sempre `displayAmount = p_amount_paid` (soldi totali ricevuti). Questa è la fonte di verità per il cash
- **Deduplicazione per timestamp**: il matching `email|paidAt` funziona perché la RPC PostgreSQL usa lo stesso `v_now` per booking e credit_history (precisione al microsecondo, stessa transazione)
- **More escluse in Reale**: le more sono debiti creati, non cash. Quando vengono pagate, il cash entra tramite `displayAmount`. Restano attive in modalità "Prenotazioni"
- **Non ristrutturato con tabella payments separata**: il fix pragmatico funziona correttamente per tutti i casi d'uso attuali. Una tabella payments dedicata sarebbe più elegante ma richiederebbe una migrazione importante

### File toccati
- `js/admin-analytics.js` — Ristrutturato `renderFatturatoDetail()`: credit entries con `_cashValue`, `_rpcPaymentKeys` Set per deduplicazione, `_rpcEntryMap` per inferenza method; fix grafico a torta; fix report settimanale e fiscale
- `sw.js` — Bump CACHE_NAME v214 → v217

### Consumo risorse (solo per progetti cliente)
| Voce | Valore |
|------|--------|
| Tempo task Claude | ~60 min |
| Tempo prompt utente (stimato) | ~20 min |
| Token input (stimati) | ~350k |
| Token output (stimati) | ~40k |

## Task: Fix allineamento mobile Registro Operazioni
**Data:** 2026-04-02
**Durata stimata:** ~15 min Claude + ~5 min prompt utente

### Modifiche effettuate
- Trasformata la tabella Registro Operazioni in card layout su mobile (≤640px)
- Nascosto `<thead>` su mobile, ogni `<td>` mostra la propria etichetta via `data-label` e pseudo-elemento `::before`
- Layout a griglia 2 colonne con Data/Ora, Tipo e Cliente full-width; nota full-width con testo che va a capo
- Card con bordo sinistro colorato per azioni admin (rosso) e system (verde)

### Decisioni prese
- Approccio CSS-only con `data-label`: minimo impatto sul JS (solo aggiunta attributi), massima flessibilità CSS
- Breakpoint 640px: coerente con gli altri media query mobile già presenti nel file

### File toccati
- `js/admin-registro.js` — Aggiunto `data-label` a ogni `<td>` nel rendering delle righe
- `css/admin.css` — Aggiunto card layout mobile nel media query 640px (thead nascosto, grid 2 colonne, bordi colorati)
- `sw.js` — Bump CACHE_NAME v238 → v239

### Consumo risorse (solo per progetti cliente)
| Voce | Valore |
|------|--------|
| Tempo task Claude | ~15 min |
| Tempo prompt utente (stimato) | ~5 min |
| Token input (stimati) | ~80k |
| Token output (stimati) | ~10k |

## Task: Redesign Pagamenti + fix bug dati a 0
**Data:** 2026-04-02
**Durata stimata:** ~25 min Claude + ~5 min prompt utente

### Modifiche effettuate
- **Bug fix**: Aggiunto skeleton loading alle stat cards Pagamenti per evitare che mostrino €0 durante il caricamento asincrono RPC. Il tab diventava visibile prima che `renderPaymentsTab()` completasse la fetch, mostrando i valori default. Ora un timer 150ms attiva un'animazione pulse se il fetch è lento, rimossa appena i dati arrivano.
- **Stat cards redesign**: Barra laterale sinistra con gradient al posto della top bar, icone in container con sfondo colorato semitrasparente, box-shadow sottile, hover con lift effect
- **Search bar**: Icona di ricerca integrata dentro l'input, bordo arrotondato 12px, sfondo #fafafa, focus con ring cyan
- **Debtor/credit cards**: Border-radius 14px, hover più delicato, booking items con bordo e hover, credit cards con border-left verde su hover
- **Credits list**: Separatore più sottile con padding migliorato
- **Search results**: Sfondo neutro con shadow leggera al posto del bordo rosso
- **Toggle hints**: Transizione colore su hover della card padre
- **Responsive**: Icone stat adattate per tablet (2.1rem) e mobile (1.8rem)

### Decisioni prese
- Usato lo stesso pattern skeleton-pulse già presente per le stat cards analytics (coerenza)
- Timer 150ms anti-flicker (mostra skeleton solo se fetch lento, evita flash)
- Barra laterale sinistra con gradient invece che top bar piatta: più moderno e meno invadente
- Icone in container arrotondato con sfondo tinted: migliore gerarchia visuale

### File toccati
- `css/admin.css` — Redesign completo sezione Pagamenti (stat cards, search, debtor cards, credits, skeleton)
- `js/admin-payments.js` — Aggiunto `_setPaymentCardsLoading()` e skeleton timer in `renderPaymentsTab()`
- `sw.js` — Cache bump v239 → v240

### Consumo risorse (solo per progetti cliente)
| Voce | Valore |
|------|--------|
| Tempo task Claude | ~25 min |
| Tempo prompt utente (stimato) | ~5 min |
| Token input (stimati) | ~120k |
| Token output (stimati) | ~15k |

## Task: Bonus ricarica credito — lezione gratuita automatica
**Data:** 2026-04-04
**Durata stimata:** ~20 min Claude + ~5 min prompt utente

### Modifiche effettuate
- Aggiunta classe `RechargeBonusStorage` in data.js con 3 impostazioni: abilitato, soglia (default 100€), importo bonus (default 5€)
- Logica `calcBonus()`: floor(importo/soglia) × bonusAmount — si moltiplica per ogni multiplo della soglia
- Integrato in `saveManualEntry()` (admin-payments.js): dopo aggiunta credito con metodo contanti/carta/iban, se bonus > 0 viene aggiunta automaticamente una seconda voce di tipo "lezione-gratuita" (freeBalance)
- Aggiunta card UI nelle Impostazioni admin con toggle attiva/disattiva + input soglia e importo bonus
- Funzioni render/save in admin-settings.js
- Sync delle 3 chiavi in `syncAppSettingsFromSupabase()`

### Decisioni prese
- Il bonus viene aggiunto come seconda chiamata RPC `admin_add_credit` con `p_free_lesson: true`, così va nel `freeBalance` separato e non nel credito principale (coerente con il sistema esistente "lezione-gratuita")
- Solo metodi contanti, carta, iban sono idonei (non credito, non stripe, non lezione-gratuita)
- Sotto soglia (es. 80€ con soglia 100€) nessun bonus; 150€ = 1x bonus; 200€ = 2x bonus

### File toccati
- `js/data.js` — aggiunta classe RechargeBonusStorage + sync in syncAppSettingsFromSupabase
- `js/admin-payments.js` — logica bonus dopo admin_add_credit in saveManualEntry()
- `js/admin-settings.js` — renderRechargeBonusUI, saveRechargeBonusEnabled, saveRechargeBonusValues
- `admin.html` — card impostazioni con toggle + input soglia/importo
- `sw.js` — cache v292

### Consumo risorse (solo per progetti cliente)
| Voce | Valore |
|------|--------|
| Tempo task Claude | ~20 min |
| Tempo prompt utente (stimato) | ~5 min |
| Token input (stimati) | ~80k |
| Token output (stimati) | ~10k |

## Task: Catalogo 200 esercizi nella sezione Schede admin
**Data:** 2026-04-04
**Durata stimata:** ~25 min Claude + ~10 min prompt utente

### Modifiche effettuate
- Sostituito catalogo esercizi hardcoded (EXERCISE_CATALOG, ~100 esercizi in 12 categorie) con 200 esercizi da `esercizi_metadata.json` (13 categorie reali)
- Nuovo exercise picker con ricerca full-text, filtro per categoria, thumbnail inline e selezione visuale
- Thumbnail dell'esercizio visibile direttamente nella riga esercizio della scheda
- Popup dettaglio esercizio con immagine full-size e video player MP4 (URL esterni diretti)
- Badge categoria automatico dal catalogo (es. "Petto", "Quadricipiti")
- Opzione "Personalizzato" per esercizi non presenti nel catalogo
- Layout ottimizzato desktop e mobile per il workflow trainer

### Decisioni prese
- Fetch del JSON al primo rendering del tab Schede (lazy load, cacheable dal SW)
- Picker inline nel DOM (non modale) per velocizzare il flusso di lavoro del trainer
- Limite 50 risultati nel picker per performance, con suggerimento di affinare la ricerca
- Chiusura automatica picker su click esterno
- Mantenuta retrocompatibilita: esercizi custom esistenti continuano a funzionare

### File toccati
- `js/admin-schede.js` — rimosso EXERCISE_CATALOG/MUSCLE_GROUPS, aggiunto _loadExercisesDB(), _buildExercisePicker(), _schedeOpenPicker(), _schedeFilterPicker(), _schedePickExercise(), _schedeShowExDetail()
- `css/admin.css` — nuove classi schede-ex-picker-*, schede-ex-detail-*, schede-ex-muscle-badge + responsive mobile
- `admin.html` — bump query string admin-schede.js v2, admin.css v37
- `sw.js` — cache v296, aggiunto esercizi_metadata.json all'APP_SHELL

### Consumo risorse (solo per progetti cliente)
| Voce | Valore |
|------|--------|
| Tempo task Claude | ~25 min |
| Tempo prompt utente (stimato) | ~10 min |
| Token input (stimati) | ~120k |
| Token output (stimati) | ~15k |

## Task: UX schede admin — rimozione uppercase, riorganizzazione assegnazione template
**Data:** 2026-04-04
**Durata stimata:** ~15 min Claude + ~5 min prompt utente

### Modifiche effettuate
- Rimosso `text-transform: uppercase` dai sub-nav pills Schede/Clienti e dai titoli sezione, allineandoli allo stile del Registro
- Rimossa la sezione "Schede assegnate" dalla pagina Schede (duplicava info già visibile nella sezione Clienti)
- Spostata la barra "Assegna template a cliente" nella pagina Schede, sotto la lista template
- Migliorato layout assegnazione: label sopra ogni campo, select con dettagli (esercizi/giorni), layout responsivo (stacked su mobile < 600px)
- Bump cache v303

### Decisioni prese
- L'assign bar nel dettaglio singolo cliente (sezione Clienti) è stata mantenuta perché contestualmente diversa (cliente già selezionato)
- Stile natural case scelto per coerenza con i subtab del Registro e i tab principali admin

### File toccati
- `css/admin.css` — rimosso uppercase da `.schede-subnav-pill` e `.schede-section-title`, aggiunto CSS per `.schede-assign-bar--schede`, `.schede-assign-field`, `.schede-assign-label`, responsive mobile
- `js/admin-schede.js` — rimossa sezione "Schede assegnate" da `_renderSchedeList()`, rimossa assign bar da `_renderClientsList()`, aggiunta assign bar migliorata in `_renderSchedeList()`
- `sw.js` — cache v303

### Consumo risorse (solo per progetti cliente)
| Voce | Valore |
|------|--------|
| Tempo task Claude | ~15 min |
| Tempo prompt utente (stimato) | ~5 min |
| Token input (stimati) | ~80k |
| Token output (stimati) | ~8k |

## Task: Aggiunta link Allenamento nella sidebar admin
**Data:** 2026-04-04
**Durata stimata:** ~10 min Claude + ~3 min prompt utente

### Modifiche effettuate
- Aggiunto link "Allenamento" nella sidebar mobile di admin.html (mancava solo lì)
- Gating UUID riutilizza il blocco `SCHEDE_ALLOWED_UID` già esistente

### Decisioni prese
- Inserito il link nello stesso ordine delle altre pagine (dopo "Calendario")
- Riutilizzato il blocco if esistente per il gating anziché duplicare la costante

### File toccati
- `admin.html` — Aggiunto `<li id="navAllenamento">` nella sidebar + gating JS
- `sw.js` — Cache bump v307 → v308

### Consumo risorse (solo per progetti cliente)
| Voce | Valore |
|------|--------|
| Tempo task Claude | ~10 min |
| Tempo prompt utente (stimato) | ~3 min |
| Token input (stimati) | ~40k |
| Token output (stimati) | ~4k |

## Task: UX allenamento — rimozione plan card, tab style, FAB crea scheda
**Data:** 2026-04-04
**Durata stimata:** ~25 min Claude + ~5 min prompt utente

### Modifiche effettuate
- Rimosso il div blu "plan card" (nome scheda, N esercizi, N giorni) dalla vista Scheda
- Cambiato stile dei tab Scheda/Progressi da segmented-control scuro (navy) a tab bianche con pill cyan attiva, identiche a quelle di prenotazioni.html
- Cambiato stile dei filtri (select) nella vista Progressi per essere coerenti con il nuovo stile tab (sfondo bianco, shadow leggero, focus cyan)
- Aggiunto FAB "+" in basso a destra per creare una nuova scheda (modal con nome + note)
- Rimosso gating UID specifico da allenamento.html — ora tutti gli utenti loggati possono accedere
- Aggiornato il link "Allenamento" nella sidebar di tutte le pagine: visibile per qualsiasi utente loggato (non solo UID di test)

### Decisioni prese
- Il FAB + modal usa `WorkoutPlanStorage.createPlan()` già esistente in data.js
- Rimosso il gating a singolo UID perché la richiesta è che "anche un utente può crearsi una scheda"
- Stile tabs e filtri allineato a prenotazioni.html per coerenza visiva cross-pagina

### File toccati
- `allenamento.html` — rimosso plan-card, rimosso gating UID, aggiunto FAB + modal + JS creazione scheda
- `css/allenamento.css` — riscritto `.all-nav` / `.all-nav-pill` (stile prenotazioni), riscritto `.all-filters select`, aggiunto `.all-fab` / `.all-modal-*`
- `index.html` — gating Allenamento da UID → qualsiasi utente loggato
- `prenotazioni.html` — idem
- `admin.html` — idem
- `dove-sono.html` — idem
- `chi-sono.html` — idem
- `login.html` — idem
- `nutrizione.html` — idem
- `privacy.html` — idem
- `regolamento.html` — idem
- `termini.html` — idem

### Consumo risorse (solo per progetti cliente)
| Voce | Valore |
|------|--------|
| Tempo task Claude | ~25 min |
| Tempo prompt utente (stimato) | ~5 min |
| Token input (stimati) | ~120k |
| Token output (stimati) | ~12k |

## Task: Tab Importa Esercizi — catalogo 7200+ con import selettivo
**Data:** 2026-04-04
**Durata stimata:** ~45 min Claude + ~15 min prompt utente

### Modifiche effettuate
- Creata nuova tab admin "💪🏻 Importa" per gestire un catalogo di 7215 esercizi
- Due viste: "Catalogo completo" (tutti gli esercizi dal JSON) e "Importati" (quelli selezionati salvati in Supabase)
- Griglia card con thumbnail, nome, categoria con icona SVG muscoli
- Import/rimozione esercizi con un click (salvataggio su Supabase `imported_exercises`)
- Rinomina nome italiano degli esercizi (il nome rinominato appare ovunque: schede, allenamento utente)
- Modale dettaglio con video/immagine e azioni import/rinomina/rimozione
- Filtro per categoria muscolare con chip, ricerca testuale con debounce
- Paginazione lazy (60 per pagina + "Mostra altri")
- Contatori totali/importati globali e per categoria
- Picker schede ora carica SOLO da `imported_exercises` (non più dal JSON completo)
- Anche `allenamento.html` carica esercizi da Supabase per coerenza nomi

### Decisioni prese
- Supabase per persistenza: la tabella `imported_exercises` è leggera e sincronizza tra dispositivi
- Normalizzazione campi: il loader mappa i campi Supabase ai nomi attesi dal picker (`nome_it`, `immagine_url_small`, `video_url`) per retrocompatibilità
- Container admin espandibile fino a 1280px quando tab Importa è attiva (via classe JS `container--wide`)
- Tab visibile solo per admin (`sessionStorage.adminAuth === 'true'`)
- Catalogo completo servito da `esercizi_completo.json` (file statico), importati da Supabase

### File toccati
- `admin.html` — nuovo tab button, div content, script include, init visibility, realtime sync
- `js/admin-importa.js` — **NUOVO** — logica completa tab Importa (catalogo, import, rinomina, rimozione, detail modal)
- `js/admin-schede.js` — `_loadExercisesDB()` ora carica da Supabase `imported_exercises` + funzione `_refreshSchedeFromImported()`
- `js/admin.js` — aggiunto loader importa in `switchTab()`, classe `container--wide`
- `allenamento.html` — `_loadAllExDB()` ora carica da Supabase `imported_exercises`
- `css/admin.css` — stili completi tab Importa (header, toggle, search, chips, grid, card, detail modal, responsive)
- `supabase/migrations/20260404000000_imported_exercises.sql` — **NUOVO** — tabella + indici + RLS + trigger
- `sw.js` — cache bump v310 → v311

### Consumo risorse (solo per progetti cliente)
| Voce | Valore |
|------|--------|
| Tempo task Claude | ~45 min |
| Tempo prompt utente (stimato) | ~15 min |
| Token input (stimati) | ~200k |
| Token output (stimati) | ~25k |

## Task: Aggiunta filtro "Notifiche Disattivate" nella tab Clienti admin
**Data:** 2026-04-04
**Durata stimata:** ~5 min Claude + ~2 min prompt utente

### Modifiche effettuate
- Aggiunto filtro "🔕 Notifiche Disattivate" alla sezione filtri clienti in admin
- Il filtro mostra clienti senza push notifications attivate (campo `pushEnabled` falsy)
- Filtro mutuamente esclusivo con gli altri (come da pattern esistente)

### Decisioni prese
- Utilizzato il campo `pushEnabled` già presente nel profilo utente (da `UserStorage`)
- Stessa architettura degli altri 5 filtri esistenti per coerenza

### File toccati
- `admin.html` — Aggiunto bottone filtro nel div `clientsFilterChips`
- `js/admin-clients.js` — Stato, detection function, toggle, sync e applicazione filtro
- `sw.js` — Cache bump v315 → v316

### Consumo risorse (solo per progetti cliente)
| Voce | Valore |
|------|--------|
| Tempo task Claude | ~5 min |
| Tempo prompt utente (stimato) | ~2 min |
| Token input (stimati) | ~50k |
| Token output (stimati) | ~5k |

## Task: Schede assegnate visibili/modificabili da tab Clienti
**Data:** 2026-04-06
**Durata stimata:** ~15 min Claude + ~3 min prompt utente

### Modifiche effettuate
- Aggiunta sezione "📋 Schede assegnate" nella card cliente (tab Clienti admin)
- Mostra nome scheda, badge Attiva/Inattiva, numero esercizi e giorni
- Pulsante ✏️ Modifica → switcha al tab Schede e apre l'editor
- Pulsante 🗑️ Rimuovi → conferma e cancella scheda con tutti gli esercizi
- CSS coerente con le altre sezioni della card (sfondo azzurro, hover actions)

### Decisioni prese
- La sezione appare solo per clienti registrati con almeno una scheda assegnata
- Modifica naviga al tab Schede esistente (riuso dell'editor completo già funzionante)
- Eliminazione usa `WorkoutPlanStorage.deletePlan()` con cascade automatico degli esercizi

### File toccati
- `js/admin-clients.js` — Sezione schede in `createClientCard()` + funzioni `clientGoToEditScheda()` e `clientDeleteScheda()`
- `css/admin.css` — Stili per `.client-schede-section`, `.client-scheda-row`, `.client-scheda-actions`
- `sw.js` — Cache bump v318 → v319

### Consumo risorse (solo per progetti cliente)
| Voce | Valore |
|------|--------|
| Tempo task Claude | ~15 min |
| Tempo prompt utente (stimato) | ~3 min |
| Token input (stimati) | ~120k |
| Token output (stimati) | ~8k |

## Task: Rimozione RPE dalla pagina Allenamento
**Data:** 2026-04-06
**Durata stimata:** ~5 min Claude + ~2 min prompt utente

### Modifiche effettuate
- Rimossa colonna RPE dalla griglia di log esercizi (header, righe esistenti, serie extra)
- Rimosso RPE dalla visualizzazione storico sessione precedente
- Il salvataggio passa `rpe: null` per mantenere compatibilità DB
- Aggiornate griglie CSS da 4 a 3 colonne in tutte le media query

### Decisioni prese
- Colonna `rpe` nel DB resta intatta per futuro riutilizzo
- `rpe: null` nel payload di salvataggio anziché rimuovere il campo, per evitare errori lato DB

### File toccati
- `allenamento.html` — Rimossi input RPE, header colonna, variabile rpeVal, riferimento nel salvataggio e nello storico
- `css/allenamento.css` — Grid template da `36px 1fr 1fr 54px` a `36px 1fr 1fr` (+ media query mobile e desktop)

### Consumo risorse (solo per progetti cliente)
| Voce | Valore |
|------|--------|
| Tempo task Claude | ~5 min |
| Tempo prompt utente (stimato) | ~2 min |
| Token input (stimati) | ~40k |
| Token output (stimati) | ~4k |

## Task: Fix freeze su tab Schede e Clienti
**Data:** 2026-04-06
**Durata stimata:** ~15 min Claude + ~2 min prompt utente

### Modifiche effettuate
- Aggiunto `_queryWithTimeout` (12s) a tutte le query Supabase che non avevano timeout (8 query in data.js + admin-schede.js)
- `refreshClients()`: wrappato in try/finally — bottone "Ricarica" non resta più disabilitato su errore
- `saveClientEdit()`: spostato `_saveClientEditLocalProfile` + `closeEditClientPopup` dentro il try, bottone ri-abilitato in `finally`
- `saveBookingRowEdit()`: ri-abilita bottone su early return per credito insufficiente (path fallback offline)
- `deleteTxEntry()`: wrappato intera funzione in try-catch globale
- `_renderClientDetail()`: aggiunto try-catch con timeout sulla query log — mostra errore invece di spinner infinito
- `renderSchedeTab()`: errore mostrato in `schedeInner` (preserva nav pills per poter cambiare tab)
- Cache bump v327 → v328

### Decisioni prese
- Timeout 12s (coerente con `_rpcWithTimeout` esistente): abbastanza lungo per connessioni lente, abbastanza corto per non sembrare un freeze
- Errori mostrati con toast/alert anziché blocco silenzioso: l'utente sa che deve riprovare
- `_queryWithTimeout` è alias di `_rpcWithTimeout` per chiarezza semantica (query vs RPC)

### File toccati
- `js/data.js` — Aggiunta `_queryWithTimeout`, timeout su syncFromSupabase di CreditStorage, ManualDebtStorage, BonusStorage, WorkoutPlanStorage, WorkoutLogStorage, UserStorage
- `js/admin-clients.js` — try/catch/finally su refreshClients, saveClientEdit, saveBookingRowEdit, deleteTxEntry
- `js/admin-schede.js` — timeout + try-catch su _loadExercisesDB e _renderClientDetail, migliorato errore in renderSchedeTab
- `sw.js` — Cache bump v327 → v328

### Consumo risorse (solo per progetti cliente)
| Voce | Valore |
|------|--------|
| Tempo task Claude | ~15 min |
| Tempo prompt utente (stimato) | ~2 min |
| Token input (stimati) | ~200k |
| Token output (stimati) | ~12k |

## Task: FAB allenamento — da "crea scheda" a "aggiungi esercizio"
**Data:** 2026-04-06
**Durata stimata:** ~15 min Claude + ~3 min prompt utente

### Modifiche effettuate
- Il tasto FAB (+) in allenamento.html ora ha comportamento condizionale:
  - Se non esiste nessuna scheda → apre il modal "Crea nuova scheda" (comportamento precedente)
  - Se esiste già una scheda → apre il picker esercizi (stessa UI di admin → schede → aggiungi esercizio)
- Il picker mostra categorie muscolari con icone, ricerca testuale, e opzione personalizzato
- L'esercizio scelto viene aggiunto al giorno attivo della scheda corrente via `WorkoutPlanStorage.addExercise()`
- CSS del picker copiato da admin.css in allenamento.css (fullscreen mobile, centrato desktop)

### Decisioni prese
- Riutilizzata la stessa UI/UX del picker admin per consistenza visiva
- L'esercizio viene aggiunto con valori default (3×10, 90s rest) — modificabili dall'admin nelle schede
- Il picker personalizzato usa `prompt()` nativo per semplicità

### File toccati
- `allenamento.html` — FAB onclick → `fabAction()`, aggiunta logica picker esercizi (~120 righe JS)
- `css/allenamento.css` — aggiunti stili picker esercizi (~95 righe CSS), version bump v8→v9

### Consumo risorse (solo per progetti cliente)
| Voce | Valore |
|------|--------|
| Tempo task Claude | ~15 min |
| Tempo prompt utente (stimato) | ~3 min |
| Token input (stimati) | ~150k |
| Token output (stimati) | ~15k |

## Task: Swipe-to-delete e drag-to-reorder esercizi in allenamento
**Data:** 2026-04-06
**Durata stimata:** ~20 min Claude + ~3 min prompt utente

### Modifiche effettuate
- **Swipe left** su una card esercizio rivela il tasto "Elimina" rosso (85px)
- **Long press** (500ms) su una card attiva la modalità drag-to-reorder con feedback aptico
- Il drag sposta visualmente le card adiacenti e salva il nuovo ordine su Supabase
- L'eliminazione rimuove l'esercizio dal piano e aggiorna la UI
- Card HTML ristrutturata: `.all-ex-swipe-content` wrappa il contenuto, `.all-ex-delete-action` posizionato dietro

### Decisioni prese
- Swipe threshold 60px per evitare aperture accidentali
- Direction lock: il primo movimento decide se è swipe orizzontale o scroll verticale
- Confirm dialog prima dell'eliminazione per sicurezza
- `navigator.vibrate(30)` come feedback aptico all'inizio del drag

### File toccati
- `allenamento.html` — logica touch swipe/drag (~180 righe JS), ristrutturazione HTML card, `deleteExerciseFromPlan()`
- `css/allenamento.css` — stili swipe-content, delete-action, dragging state; version bump v9→v10

### Consumo risorse (solo per progetti cliente)
| Voce | Valore |
|------|--------|
| Tempo task Claude | ~20 min |
| Tempo prompt utente (stimato) | ~3 min |
| Token input (stimati) | ~200k |
| Token output (stimati) | ~20k |

## Task: Esercizi cardio a tempo (minuti) invece che ripetizioni
**Data:** 2026-04-06
**Durata stimata:** ~15 min Claude + ~3 min prompt utente

### Modifiche effettuate
- Esercizi con `muscle_group === 'Cardio'` ora mostrano minuti invece di ripetizioni in allenamento e schede
- **allenamento.html**: target mostra "20 min" invece di "3 × 10", log con singolo input "Min" (senza serie/kg), sessione precedente mostra "X min"
- **admin-schede.js**: form editing mostra solo campo "Min" per cardio (nasconde Serie/Reps/Kg/Rec), tabella progressi con colonna "Min" invece di Serie/Reps/Peso
- Default quando si aggiunge un esercizio cardio dal picker: sets=1, reps='20', rest=0
- CSS dedicato per layout cardio centrato nel log

### Decisioni prese
- Cardio identificato tramite `muscle_group` (campo già presente in `workout_exercises`) con valore "Cardio" (case-insensitive)
- Il valore viene salvato nel campo `reps` del DB (compatibilità retroattiva, nessuna migrazione necessaria)
- Nascosti Serie, Kg e Recupero per cardio nella form admin — non hanno senso per attività a tempo

### File toccati
- `allenamento.html` — rendering scheda cardio a tempo, default picker cardio
- `js/admin-schede.js` — form editing cardio, progressi cardio, default su pick esercizio
- `css/allenamento.css` — stili `.all-log-grid-cardio` e `.all-log-row-cardio`

### Consumo risorse (solo per progetti cliente)
| Voce | Valore |
|------|--------|
| Tempo task Claude | ~15 min |
| Tempo prompt utente (stimato) | ~3 min |
| Token input (stimati) | ~150k |
| Token output (stimati) | ~15k |
