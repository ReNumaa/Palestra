# TB Training — Documentazione Tecnica Completa

> Ultimo aggiornamento: 24 marzo 2026 (sessione 50)
> Dominio: https://thomasbresciani.com — Repository: ReNumaa/Thomas-Bresciani
> Progetto Supabase: `ppymuuyoveyyoswcimck` (Frankfurt, free tier)

---

## Indice

1. [Panoramica](#1-panoramica)
2. [Stack tecnologico](#2-stack-tecnologico)
3. [Struttura dei file](#3-struttura-dei-file)
4. [Architettura](#4-architettura)
5. [Database Supabase — Schema](#5-database-supabase--schema)
6. [RPC PostgreSQL (operazioni atomiche)](#6-rpc-postgresql-operazioni-atomiche)
7. [Row Level Security (RLS)](#7-row-level-security-rls)
8. [Autenticazione](#8-autenticazione)
9. [PWA e Service Worker](#9-pwa-e-service-worker)
10. [Push Notifications](#10-push-notifications)
11. [Supabase Realtime](#11-supabase-realtime)
12. [Funzionalità — Lato Utente](#12-funzionalità--lato-utente)
13. [Funzionalità — Lato Admin](#13-funzionalità--lato-admin)
14. [Stripe — Ricarica Credito Online](#14-stripe--ricarica-credito-online)
15. [Production Hardening](#15-production-hardening)
16. [Migrazioni SQL](#16-migrazioni-sql)
17. [Edge Functions](#17-edge-functions)
18. [Bug risolti — Principali](#18-bug-risolti--principali)
19. [Diario di sviluppo (sessioni 1-50)](#19-diario-di-sviluppo-sessioni-1-50)
20. [Stato attuale e roadmap](#20-stato-attuale-e-roadmap)
21. [Decisioni architetturali](#21-decisioni-architetturali)
22. [Compatibilità Supabase Free Tier](#22-compatibilità-supabase-free-tier)
23. [Checklist go-live](#23-checklist-go-live)

---

## 1. Panoramica

Sistema di prenotazione online per la palestra **TB Training** di Thomas Bresciani, personal trainer. Permette ai clienti di prenotare lezioni dal sito web/PWA e al gestore di amministrare tutto da una dashboard completa.

**Funzionalità principali:**
- Calendario interattivo con prenotazione online (desktop + mobile)
- PWA installabile su smartphone con notifiche push
- Dashboard admin con calendario, statistiche, fatturato, gestione clienti
- Sistema crediti/debiti con pagamenti tracciati
- Annullamento prenotazioni con regole temporali e bonus giornaliero
- Certificato medico e assicurazione con scadenze e blocchi
- Viewer di emergenza per gestione offline
- Ricarica credito online via Stripe (in fase di attivazione)

**Volume target:** ~15.000 prenotazioni/anno (~41/giorno). L'architettura è dimensionata per questo volume.

---

## 2. Stack tecnologico

| Componente | Tecnologia | Note |
|---|---|---|
| Frontend | HTML5 + CSS3 + JavaScript vanilla | Zero dipendenze esterne, nessuna build chain |
| Database | Supabase (PostgreSQL) | Cache in memoria + sync; localStorage solo per settings/flags |
| Grafici | Canvas API custom (`chart-mini.js`) | Nessuna libreria esterna |
| Autenticazione | Supabase Auth + Google OAuth | SDK via CDN (`@supabase/supabase-js@2`) |
| Hosting | GitHub Pages | https://thomasbresciani.com |
| Email transazionale | Brevo (SMTP) | `noreply@thomasbresciani.com`, DKIM+SPF verificati |
| Push Notifications | Web Push (VAPID) + Supabase Edge Functions | Promemoria 25h e 1h prima della lezione |
| Pagamenti | Stripe Checkout (in fase di attivazione) | Edge Functions `create-checkout` + `stripe-webhook` |

**Costo totale in produzione: €0/mese** (tutti servizi su free tier).

---

## 3. Struttura dei file

```
Thomas-Bresciani/
├── index.html              # Calendario pubblico + form prenotazione
├── chi-sono.html           # Profilo personal trainer
├── dove-sono.html          # Mappa, indicazioni, contatti e orari
├── login.html              # Login/registrazione utenti + reset password
├── prenotazioni.html       # "Le mie prenotazioni" — area utente loggato
├── admin.html              # Dashboard amministratore completa
├── regolamento.html        # Regolamento della palestra
├── viewer.html             # Viewer emergenza: backup offline + gestione
├── nutrizione.html         # Pagina nutrizione
├── sw.js                   # Service Worker (cache, push, offline)
├── manifest.json           # PWA manifest
├── css/
│   ├── style.css           # Stili pagina pubblica + componenti globali
│   ├── login.css           # Stili login/registrazione
│   ├── admin.css           # Stili dashboard admin
│   ├── prenotazioni.css    # Stili area utente
│   ├── chi-sono.css        # Stili pagina chi sono
│   ├── dove-sono.css       # Stili pagina dove sono
│   ├── regolamento.css     # Stili regolamento
│   └── nutrizione.css      # Stili nutrizione
├── js/
│   ├── data.js             # Storage classes, sync Supabase, slot/prezzi
│   ├── calendar.js         # Calendario pubblico (desktop + mobile)
│   ├── booking.js          # Form prenotazione, validazione, conferma
│   ├── auth.js             # Supabase Auth, profili, normalizePhone()
│   ├── supabase-client.js  # Init Supabase SDK + logCreditClick
│   ├── admin.js            # Logica dashboard admin principale
│   ├── admin-clients.js    # Tab Clienti admin
│   ├── admin-payments.js   # Tab Pagamenti admin
│   ├── admin-calendar.js   # Tab Prenotazioni/calendario admin
│   ├── admin-schedule.js   # Tab Gestione Orari admin
│   ├── admin-analytics.js  # Tab Statistiche/Analytics admin
│   ├── admin-registro.js   # Tab Registro transazioni admin
│   ├── admin-messaggi.js   # Tab Messaggi push admin
│   ├── admin-backup.js     # Backup/ripristino/export admin
│   ├── admin-settings.js   # Tab Impostazioni admin
│   ├── chart-mini.js       # Libreria grafici Canvas (linea, barre, torta)
│   ├── push.js             # Push notification subscription + VAPID
│   ├── pwa-install.js      # Banner installazione PWA
│   ├── sw-update.js        # Auto-update service worker
│   └── ui.js               # Utility: setLoading, showToast, _escHtml
├── images/                 # Logo, badge push, icone
├── supabase/
│   ├── config.toml         # Config Supabase CLI
│   ├── migrations/         # 60+ file SQL di migrazione
│   └── functions/          # Edge Functions (Deno/TypeScript)
│       ├── send-reminders/
│       ├── notify-slot-available/
│       ├── notify-admin-booking/
│       ├── send-admin-message/
│       ├── create-checkout/
│       └── stripe-webhook/
├── .github/
│   └── workflows/
│       └── backup.yml      # Backup automatico notturno su Nextcloud
└── Backups/                # Backup JSON locali
```

**Navbar:** tutte le pagine pubbliche condividono la stessa navbar: Calendario, Chi sono, Dove sono, Admin.

---

## 4. Architettura

### 4.1 Flusso dati — Supabase-first

```
Browser (ogni page load)
    │
    ├─► syncFromSupabase()              ← Supabase → _cache in memoria
    └─► syncAppSettingsFromSupabase()   ← Supabase → localStorage (settings)

Scrittura (ogni operazione)
    │
    ├─► _cache in memoria (sincrono, immediato)
    └─► Supabase RPC/upsert (async, immediato — no debounce)

Operazioni multi-step (crediti, pagamenti, annullamenti)
    │
    └─► RPC PostgreSQL atomica (server-side, transazione singola)

Realtime (aggiornamenti cross-device)
    │
    └─► Supabase Realtime channels → debounced full-sync → re-render UI
```

### 4.2 Pattern architetturale

- **Source of truth persistente:** Supabase (PostgreSQL)
- **Source of truth in sessione:** `_cache` in memoria (array/oggetto statico per classe Storage)
- **localStorage:** solo per settings, flags e template settimanali
- **Principio:** il client invia un'*intention* (RPC) → il server esegue tutto atomicamente → il client risincronizza

### 4.3 Diagramma componenti

```
┌─────────────────────────────────────────────────────────┐
│                     UTENTE (Browser/PWA)                 │
│  index.html · prenotazioni.html · login.html             │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTPS (fetch / Supabase SDK)
                        ▼
┌─────────────────────────────────────────────────────────┐
│              GITHUB PAGES (gratis)                       │
│  HTML + CSS + JS statici — nessun server-side            │
└───────────────────────┬─────────────────────────────────┘
                        │ REST API + Realtime WebSocket
                        ▼
┌─────────────────────────────────────────────────────────┐
│              SUPABASE (gratis — Frankfurt)                │
│  ┌──────────────────────────────────────────────────┐   │
│  │  PostgreSQL (RLS + RPC + Triggers + pg_cron)     │   │
│  │  Auth (JWT + Google OAuth + Email/Password)       │   │
│  │  Realtime (WebSocket channels)                    │   │
│  │  Edge Functions (Deno — push, reminders, Stripe) │   │
│  └──────────────────────────────────────────────────┘   │
└───────────────────────┬─────────────────────────────────┘
                        │ SMTP
                        ▼
┌─────────────────────────────────────────────────────────┐
│              BREVO (gratis — 300 email/giorno)           │
│  Conferma registrazione · Reset password · Conferma email│
└─────────────────────────────────────────────────────────┘
```

---

## 5. Database Supabase — Schema

### 5.1 Tabelle principali

#### `bookings`
Prenotazioni degli utenti.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | UUID (PK) | Auto-generato |
| `local_id` | TEXT | Legacy ID localStorage |
| `user_id` | UUID (FK → auth.users) | Chi ha prenotato |
| `user_name`, `user_email` | TEXT | Dati utente denormalizzati |
| `date` | DATE | Data della lezione |
| `time` | TEXT | Es. `"10:00 - 11:00"` |
| `duration` | INTEGER | Durata in minuti |
| `slot_type` | TEXT | `personal-training`, `small-group`, `group-class` |
| `status` | TEXT | `confirmed`, `cancellation_requested`, `cancelled` |
| `paid` | BOOLEAN | Pagato sì/no |
| `payment_method` | TEXT | `contanti`, `carta`, `iban`, `credito`, `lezione-gratuita`, `stripe` |
| `credit_applied` | NUMERIC | Credito usato per questa prenotazione |
| `reminder_24h_sent`, `reminder_1h_sent` | BOOLEAN | Flag promemoria inviati |
| `updated_at` | TIMESTAMPTZ | Optimistic locking (trigger automatico) |
| `created_at` | TIMESTAMPTZ | Timestamp creazione |

#### `profiles`
Profili utente (creati da trigger `handle_new_user` alla registrazione).

| Colonna | Tipo | Note |
|---|---|---|
| `id` | UUID (PK, FK → auth.users) | |
| `name`, `email`, `whatsapp` | TEXT | Dati anagrafici |
| `codice_fiscale` | TEXT | Per fatturazione carta/bonifico |
| `indirizzo_via`, `indirizzo_paese`, `indirizzo_cap` | TEXT | Residenza |
| `medical_cert_expiry` | DATE | Scadenza certificato medico |
| `medical_cert_history` | JSONB | Storico aggiornamenti cert |
| `insurance_expiry` | DATE | Scadenza assicurazione |
| `insurance_history` | JSONB | Storico aggiornamenti assicurazione |
| `documento_firmato` | BOOLEAN | Flag documento firmato (solo admin) |
| `created_at` | TIMESTAMPTZ | |

#### `credits`
Saldo credito per utente.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | UUID (PK) | |
| `user_id` | UUID (FK) | Auto-linkato da trigger |
| `name`, `email`, `whatsapp` | TEXT | Identificazione contatto |
| `balance` | NUMERIC | Saldo corrente |
| `free_balance` | NUMERIC | Saldo lezioni gratuite |
| `updated_at` | TIMESTAMPTZ | Optimistic locking |

#### `credit_history`
Movimenti credito (log immutabile).

| Colonna | Tipo | Note |
|---|---|---|
| `id` | UUID (PK) | |
| `credit_id` | UUID (FK → credits) | |
| `amount` | NUMERIC | Positivo = ricarica, negativo = utilizzo |
| `display_amount` | NUMERIC | Importo visuale per voci informative |
| `note` | TEXT | Descrizione |
| `method` | TEXT | Metodo pagamento (contanti, carta, iban, stripe) |
| `booking_ref` | UUID | Riferimento prenotazione |
| `hidden` | BOOLEAN | Voci obsolete nascoste |
| `stripe_session_id` | TEXT (UNIQUE) | Idempotenza Stripe |
| `created_at` | TIMESTAMPTZ | |

#### `manual_debts`
Debiti manuali inseriti dall'admin.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | UUID (PK) | |
| `user_id` | UUID (FK) | Auto-linkato da trigger |
| `name`, `email`, `whatsapp` | TEXT | |
| `balance` | NUMERIC | Saldo debito |
| `history` | JSONB | Array di movimenti `[{amount, note, date}]` |
| `updated_at` | TIMESTAMPTZ | |

#### `bonuses`
Bonus annullamento giornaliero.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | UUID (PK) | |
| `user_id` | UUID (FK) | |
| `name`, `email`, `whatsapp` | TEXT | |
| `bonus` | INTEGER | 0 o 1 |
| `last_reset_date` | TEXT | Data ultimo reset |

#### `schedule_overrides`
Override orari per date specifiche.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | UUID (PK) | |
| `date` | DATE | |
| `time` | TEXT | Es. `"10:00 - 11:00"` |
| `slot_type` | TEXT | |
| `extras` | JSONB | Posti extra per tipo |
| `client_name`, `client_email`, `client_whatsapp` | TEXT | Cliente assegnato (slot prenotato) |
| `booking_id` | TEXT | Booking associato |

#### `settings`
Impostazioni chiave-valore.

| Chiave | Contenuto |
|---|---|
| `debt_threshold` | Soglia blocco prenotazioni (€) |
| `cancellation_mode` | Modalità annullamento |
| `cert_scadenza_editable` | Cert modificabile da utente (bool) |
| `cert_block_expired/not_set` | Blocco per cert scaduto/mancante |
| `assic_block_expired/not_set` | Blocco per assicurazione |
| `gym_week_templates` | 3 template settimana standard |
| `gym_active_week_template` | Indice template attivo |

#### `push_subscriptions`
Subscription push per dispositivo.

#### `admin_audit_log`
Log audit delle operazioni admin (azione, attore, tabella target, dati vecchi/nuovi, timestamp).

### 5.2 Trigger automatici

| Trigger | Tabella | Funzione |
|---|---|---|
| `handle_new_user` | `auth.users` | Crea profilo in `profiles` alla registrazione |
| `credits_auto_link_user` | `credits` | Popola `user_id` da email su INSERT/UPDATE |
| `auto_link_manual_debt_user_id` | `manual_debts` | Popola `user_id` da email |
| `_trg_audit_booking_change` | `bookings` | Log in `admin_audit_log` |
| `set_updated_at` | `bookings`, `credits`, `manual_debts` | Aggiorna `updated_at` automaticamente |

---

## 6. RPC PostgreSQL (operazioni atomiche)

Tutte le operazioni multi-step sono eseguite server-side come transazioni atomiche PostgreSQL. Pattern: `SECURITY DEFINER` + `is_admin()` check + `FOR UPDATE` locks.

### RPC Admin (richiedono `is_admin()`)

| RPC | Descrizione |
|---|---|
| `admin_add_credit` | Ricarica credito + auto-pay FIFO booking non pagati + offset debiti manuali |
| `admin_pay_bookings` | Segna booking pagati + salda debiti manuali + acconto credito |
| `admin_change_payment_method` | Cambio metodo pagamento (8 scenari: contanti<->carta<->credito<->iban) |
| `admin_add_debt` | Aggiunge debito manuale con storico JSONB |
| `admin_delete_debt_entry` | Rimuove voce debito + ricalcola saldo |
| `admin_delete_booking_with_refund` | Elimina booking + rimborso credito atomici |
| `admin_delete_booking` | Elimina fisicamente un booking da Supabase |
| `admin_rename_client` | Rinomina su bookings + credits + manual_debts atomicamente |
| `admin_update_booking` | Aggiorna booking con check optimistic locking (`updated_at`) |
| `admin_clear_all_data` | DELETE atomico su tutte le tabelle operative |
| `admin_delete_client_data` | Elimina tutti i dati di un cliente (FK ordering) |
| `admin_edit_credit_entry` | Modifica voce in credit_history + ricalcola saldo |
| `admin_edit_debt_entry` | Modifica voce nella history JSONB di manual_debts |
| `admin_delete_credit_entry` | Elimina voce credit_history |
| `admin_health_check` | Verifica integrita dati (6 tipi di anomalia) |
| `admin_health_fix` | Fix conservativo anomalie (non cancella MAI dati) |
| `process_pending_cancellations` | Ripristina booking `cancellation_requested` entro 2h |
| `get_all_profiles` | Restituisce tutti i profili (admin only) |

### RPC Utente (authenticated)

| RPC | Descrizione |
|---|---|
| `book_slot_atomic` | Prenotazione con advisory lock anti-overbooking + check cutoff 30min |
| `cancel_booking_with_refund` | Annullamento + rimborso + mora opzionale (atomici) |
| `user_request_cancellation` | Richiesta annullamento (verifica ownership) |
| `fulfill_pending_cancellation` | FIFO cancel pending + rimborso (user-side) |
| `apply_credit_on_booking` | Applica credito su nuova prenotazione (full/partial) |
| `apply_credit_to_past_bookings` | Auto-paga booking passati dopo ricarica |
| `get_or_reset_bonus` | Legge/resetta bonus giornaliero |
| `save_push_subscription` | Salva subscription push (SECURITY DEFINER) |
| `stripe_topup_credit` | Accredita ricarica Stripe (idempotente, service_role only) |

### RPC Pubbliche (anon)

| RPC | Descrizione |
|---|---|
| `get_slot_availability` | Conta prenotazioni per slot (calendario pubblico) |
| `get_availability_range` | Disponibilita per range di date |
| `is_whatsapp_taken` | Verifica unicita WhatsApp (registrazione) |

---

## 7. Row Level Security (RLS)

RLS abilitata su tutte le tabelle. Pattern: `is_admin()` helper che verifica `auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'`.

| Tabella | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `bookings` | `user_id = auth.uid()` OR `is_admin()` | authenticated | via RPC | via RPC admin |
| `profiles` | `id = auth.uid()` OR `is_admin()` | trigger only | `id = auth.uid()` OR `is_admin()` | — |
| `credits` | `user_id = auth.uid()` OR `is_admin()` | via RPC | via RPC | via RPC |
| `credit_history` | via JOIN credits.user_id OR `is_admin()` | via RPC | via RPC | via RPC |
| `manual_debts` | `user_id = auth.uid()` OR `is_admin()` | via RPC | via RPC | via RPC |
| `bonuses` | `user_id = auth.uid()` OR `is_admin()` | via RPC | via RPC | via RPC |
| `schedule_overrides` | pubblico (anon + auth) | `is_admin()` | `is_admin()` | `is_admin()` |
| `settings` | pubblico | `is_admin()` | `is_admin()` | `is_admin()` |
| `push_subscriptions` | `user_id = auth.uid()` | via RPC | — | `user_id = auth.uid()` |

**Nota:** gli utenti normali vedono solo booking sintetici anonimi (`_avail_*`) per la disponibilita calendario. I dati personali degli altri utenti non sono mai esposti.

---

## 8. Autenticazione

### 8.1 Supabase Auth

- **Email + password** con conferma email obbligatoria (Brevo SMTP)
- **Google OAuth** con modal "Completa profilo" per WhatsApp al primo accesso
- **Reset password** via email con pannello dedicato in `login.html`
- **Cambio email** con conferma obbligatoria prima dell'aggiornamento
- **Unique WhatsApp** — partial index su `profiles.whatsapp` + RPC `is_whatsapp_taken`

### 8.2 Flusso auth

1. `initAuth()` chiamata su ogni pagina
2. Usa evento `INITIAL_SESSION` (non `getSession()`) per evitare race condition con token refresh in PWA
3. Timeout fallback 6s -> `getSession()` -> `refreshSession()`
4. `_loadProfile(userId)` popola `window._currentUser` da tabella `profiles`
5. `updateNavAuth()` aggiorna navbar con nome utente / link login
6. Auto-capitalize nomi (Gmail) + auto-fix nomi esistenti al login

### 8.3 Admin

- JWT claim `app_metadata.role = "admin"` su Supabase
- Funzione SQL `is_admin()` verifica il claim
- Tutte le RPC admin includono `IF NOT is_admin() THEN RAISE EXCEPTION`
- Fallback password SHA-256 per accesso offline (salt `tb-admin-2026`)
- `sessionStorage.adminAuth` per persistenza tab (non cross-sessione)

### 8.4 Logout

- `signOut({ scope: 'local' })` — non disconnette altri dispositivi
- Flag `_isManualLogout` distingue logout manuale da SIGNED_OUT spurio di Supabase
- Cleanup: svuota tutte le cache in memoria

---

## 9. PWA e Service Worker

### 9.1 Manifest

- Nome: "Palestra" — Display: standalone, orientamento portrait
- Icona: `images/logo-tb---nero.jpg`

### 9.2 Service Worker (`sw.js`)

- **CACHE_NAME** versionato (`palestra-v135`) — bumpare ad ogni deploy
- **Install:** pre-cache APP_SHELL con `cache: 'reload'` + `Promise.allSettled`
- **Activate:** elimina cache vecchie + `clients.claim()`
- **Fetch strategy:**
  - HTML (navigate) -> **Network First** (cache come fallback offline)
  - JS + CSS -> **Stale-While-Revalidate** (serve dalla cache, aggiorna in background)
  - Immagini/asset -> **Cache First** (aggiorna solo se mancante)
- **`ignoreSearch: true`** su tutti i `caches.match()` per gestire query string (`?v=5`)
- **Push handler:** riceve notifiche da Edge Functions, mostra con badge dumbbell
- **Notification click:** porta in primo piano la finestra app

### 9.3 Auto-update (`js/sw-update.js`)

- Registra SW con `updateViaCache: 'none'`
- Check aggiornamenti una volta all'apertura dell'app
- Listener `updatefound` + `statechange` -> reload automatico al nuovo SW
- Flag `refreshing` anti-loop

### 9.4 Viewport e iOS

- `maximum-scale=1.0, user-scalable=no, viewport-fit=cover` su tutte le pagine
- `overscroll-behavior: none` per bloccare bounce elastico iOS
- Safe area padding per iPhone (barra home)

---

## 10. Push Notifications

### 10.1 Infrastruttura

- **VAPID keys** generate con `web-push generate-vapid-keys`
- **Public key** in `js/push.js`, **private key** nei secrets Supabase
- **Tabella** `push_subscriptions` con RLS per `user_id`
- **RPC** `save_push_subscription` (SECURITY DEFINER) per il salvataggio

### 10.2 Edge Functions

| Funzione | Trigger | Descrizione |
|---|---|---|
| `send-reminders` | pg_cron `*/5 * * * *` | Promemoria **25h** e **1h** prima della lezione (finestra +/-12min, fuso Europe/Rome) |
| `notify-slot-available` | Client (su annullamento) | Notifica "Slot libero disponibile" solo se lo slot era pieno; esclude chi ha annullato e chi e gia prenotato |
| `notify-admin-booking` | Client (su prenotazione) | Notifica all'admin con nome cliente e occupazione slot |
| `send-admin-message` | Admin (tab Messaggi) | Notifica personalizzata a tutti / iscritti giorno / iscritti ora |

### 10.3 Banner push

- Card non dismissable su `index.html`, `prenotazioni.html`, `admin.html`
- Ricompare finche l'utente non concede o nega il permesso
- Gestione mismatch VAPID key: unsubscribe + ri-crea subscription

---

## 11. Supabase Realtime

Canali WebSocket per aggiornamenti cross-device in tempo reale.

| Pagina | Canale | Tabelle monitorate | Azione |
|---|---|---|---|
| `index.html` | `bookings-rt-calendar` + `appsettings-rt-calendar` | bookings, settings, schedule_overrides | Re-render calendario |
| `admin.html` | `admin-rt` (debounced 600ms) | bookings, credits, credit_history, manual_debts, bonuses, profiles, settings | Sync completa + re-render tab attiva |
| `prenotazioni.html` | `preno-rt` (debounced 300ms) | bookings, credits, credit_history, manual_debts, bonuses | Sync + re-render lista/saldo |

**Configurazione necessaria:** le tabelle devono essere nella publication `supabase_realtime` (Dashboard -> Database -> Replication o `ALTER PUBLICATION supabase_realtime ADD TABLE <nome>`).

---

## 12. Funzionalita — Lato Utente

### 12.1 Calendario pubblico (`index.html`)

- **Desktop:** 7 colonne Lun-Dom, slot colorati per tipo, contatore posti a pallini
- **Mobile:** slider giorno orizzontale (swipe), card verticali con indicatori posti
- Parte dal giorno corrente; avanza automaticamente dopo le 20:30
- **Cutoff prenotazione:** inizio lezione + 30 minuti (client + server-side)
- **3 tipi di slot:** Personal Training (rosso, max 1), Small Group (azzurro, max 4), Lezione di Gruppo (giallo, max 5)
- Sticky mobile: selettore giorni e navigazione settimana rimangono fissi allo scroll

### 12.2 Prenotazione

- Login richiesto (modale "Accedi/Registrati" se non loggato)
- Campi nascosti per utenti loggati (vede solo: tipo + giorno/ora + posti + note + conferma)
- **Protezioni:** doppio click, duplicati via Supabase, debito > soglia, cert scaduto, assicurazione, documento firmato
- Timeout 45s su RPC con avviso "Connessione lenta" dopo 15s + safety timeout 50s
- Notifica locale + notifica push all'admin dopo conferma

### 12.3 Le mie prenotazioni (`prenotazioni.html`)

- Tab "Prossime" e "Passate" con paginazione "Mostra altro" (5 iniziali + 20)
- Tab "Transazioni" con storico crediti/debiti/pagamenti
- Saldo credito, debiti, bonus annullamento
- Bottone ricarica Stripe (per utenti abilitati)
- Warning certificato medico (rosso/giallo) cliccabile
- Alert debito superato (toast rosso 8s)

### 12.4 Annullamento prenotazioni

| Tempo alla lezione | Comportamento |
|---|---|
| > 24h | Annullamento diretto + rimborso completo |
| 24h-2h | Richiesta condizionale (serve sostituto) |
| < 2h | Bloccato (bonus giornaliero permette override) |

- **Bonus giornaliero:** 0 o 1, si ripristina al cambio giorno, non cumulabile
- RPC atomiche: `cancel_booking_with_refund`, `user_request_cancellation`

### 12.5 Profilo utente

- Modifica nome, WhatsApp, password, indirizzo (via, paese, CAP), codice fiscale
- Certificato medico e assicurazione: solo admin puo modificare la scadenza
- Cambio email con conferma obbligatoria via email

---

## 13. Funzionalita — Lato Admin

### 13.1 Dashboard (`admin.html`)

8 tab: Prenotazioni, Gestione Orari, Statistiche, Pagamenti, Registro, Clienti, Messaggi, Impostazioni. Tab sticky sotto navbar con persistenza in `sessionStorage`.

### 13.2 Tab Prenotazioni

- Calendario settimanale con partecipanti, badge cert/assic/documento, checkbox pagamento
- Posti extra per slot, booking a nome cliente ("Persona")
- Popup annullamento: >24h confirm semplice, <24h con opzioni bonus/mora

### 13.3 Tab Gestione Orari

- 12 fasce orarie per giorno, override per date specifiche
- 3 settimane standard configurabili e rinominabili
- Assegnazione cliente a slot prenotato con conferma

### 13.4 Tab Statistiche

- 4 stat card con variazione %, grafici trend/proiezione/pie chart
- Pannelli dettaglio: top clienti, meno attivi, top annullatori, nuovi clienti, trend occupazione
- Filtri temporali, fetch diretto da Supabase (bypass localStorage)

### 13.5 Tab Pagamenti

- Card debitori/creditori con ricerca unificata
- Popup "Da pagare" (booking non pagati + debiti manuali)
- Modifica/elimina voci storico, soglia blocco prenotazioni
- Controllo dati anagrafici per carta/bonifico
- Report settimanale XLSX

### 13.6 Tab Registro

- Event sourcing con 7+ tipi evento, filtri, paginazione 50/pagina, export Excel
- Formula fatturato: `booking_paid` (no credito/gratuita) + `credit_added` (no freeLesson)

### 13.7 Tab Clienti

- Stat card: clienti totali + attivi, ricerca con dropdown, filtri (cert/assic/anagrafica)
- Popup modifica cliente, eliminazione dati (con password operativa)

### 13.8 Tab Messaggi

- Invio notifiche push personalizzate: tutti, iscritti giorno, iscritti ora

### 13.9 Tab Impostazioni

- Soglia debito, blocchi cert/assic, cert modificabile, settimane standard
- Backup & Ripristino (JSON + CSV), Health Check / Health Fix

### 13.10 Viewer emergenza (`viewer.html`)

- Importa backup JSON, toolbar (+Prenotazione, +Credito, Esporta), export admin-compatibile
- Funziona completamente offline con persistenza localStorage

---

## 14. Stripe — Ricarica Credito Online

### 14.1 Flusso

1. Utente clicca (+) -> sceglie importo (€50-€200 o custom, min €50)
2. Edge Function `create-checkout` crea sessione Stripe Checkout (verifica JWT)
3. Utente paga su Stripe (browser esterno se PWA)
4. Stripe -> webhook -> `stripe-webhook` -> RPC `stripe_topup_credit`
5. Credito accreditato -> Realtime aggiorna PWA -> `apply_credit_to_past_bookings` auto-paga FIFO

### 14.2 Stato

- **Frontend:** completato (bottone, modal, CSP, re-sync)
- **Database:** migration eseguita (`stripe_session_id` + RPC)
- **Edge Functions:** scritte, da deployare
- **Account Stripe:** da creare (Thomas)
- **Go live:** rimuovere filtro UID, chiavi test -> live

### 14.3 Costi

- 1.5% + €0.25 per carta europea | 3.25% + €0.25 extra-UE | Nessun costo fisso

### 14.4 Cosa resta da fare

1. Creare account Stripe (stripe.com)
2. Copiare chiavi API + configurare webhook (`checkout.session.completed`)
3. `supabase secrets set STRIPE_SECRET_KEY=sk_test_... STRIPE_WEBHOOK_SECRET=whsec_...`
4. Deploy Edge Functions: `supabase functions deploy create-checkout && supabase functions deploy stripe-webhook`
5. Testare con carta test `4242 4242 4242 4242`
6. Per go live: verifica identita Thomas, chiavi live, rimuovere filtro UID

---

## 15. Production Hardening

Audit completo sessione 26: **18 issue identificate e tutte risolte**.

### Fase 1 — Critici

| # | Issue | Fix |
|---|---|---|
| 1 | `cancel_booking_with_refund` mancava `FOR UPDATE` | Aggiunto lock anti-doppio rimborso |
| 2 | `fulfill_pending_cancellation` accessibile da `anon` | REVOKE da anon |
| 3 | `bookings_public_insert` RLS troppo permissiva | Ristretta a authenticated |
| 4 | Manca validazione input nelle RPC admin | Aggiunta validazione email/importo |
| 5 | `admin_rename_client` mancava `FOR UPDATE` | Aggiunto lock |

### Fase 2 — Alti

| 6 | Writes perdono dati alla chiusura tab | Risolto con refactor Supabase-first (scritture immediate) |
| 7 | Fallback INSERT -> overbooking | Rimosso fallback, errore esplicito |

### Fase 3 — Medi

| 8 | Admin session bypass DevTools | `checkAuth()` hardened con check JWT |
| 9 | Schedule overrides race condition | UPSERT + delete selettiva |
| 10 | Credit history non awaited | Estratto in async function |
| 11 | Nessun optimistic locking | `updated_at` + trigger + check stale_data |
| 12 | Sync fallisce silenziosamente | Toast su errore |
| 13 | OAuth redirect hardcoded | `window.location.origin` |

### Fase 4 — Bassi

| 14 | Missing indexes | credit_history + bookings partial index |
| 15 | JSONB history unbounded | CHECK <= 500 |
| 16 | Nessun audit trail | `admin_audit_log` + trigger + helper |
| 17 | CSP mancanti | Meta tag su tutte le pagine |
| 18 | FK CASCADE pericolosa | Cambiata a SET NULL |

### Ulteriori fix

- XSS: `_escHtml()` centralizzata in `ui.js`
- Password admin: SHA-256 con salt
- CSP: `wss://*.supabase.co` per Realtime
- localStorage: quota protection `_lsSet`, JSON.parse safety, pruning history

---

## 16. Migrazioni SQL

60+ file in `supabase/migrations/`, da applicare in ordine cronologico.

| Range | Contenuto |
|---|---|
| `20260225-20260308` | Schema base, profiles, trigger handle_new_user, RPC base |
| `20260309` | Push notifications, security fixes, constraints, no-duplicate booking, cron |
| `20260310` | Admin role, migrate app_settings, bookings privacy, RPC atomiche base |
| `20260311` | 12 RPC atomiche (credit, payment, debt, booking, rename, cancel) |
| `20260312` | Production hardening (3 migration), user cancellation, client data, credit policies, unique whatsapp |
| `20260313-20260314` | Fix credit balances, auto-link triggers, normalize email |
| `20260315` | Indirizzo residenza, schema hardening (FK, audit, updated_at) |
| `20260316` | Credit history method, book_slot_time_cutoff, admin_edit_entries |
| `20260317` | Fix ghost users, health check, email match, schedule_overrides client fields |
| `20260319-20260323` | Profiles policy, settings realtime, stripe_topup, push cleanup, get_debtors, documento_firmato |

---

## 17. Edge Functions

| Funzione | Trigger | Note |
|---|---|---|
| `send-reminders` | pg_cron `*/5 * * * *` | Promemoria 25h + 1h, fuso Europe/Rome |
| `notify-slot-available` | Client (annullamento) | Solo se slot era pieno, esclude gia prenotati |
| `notify-admin-booking` | Client (prenotazione) | Nome + occupazione slot |
| `send-admin-message` | Admin (tab Messaggi) | 3 modalita destinatari |
| `create-checkout` | Client (ricarica) | Sessione Stripe, verifica JWT |
| `stripe-webhook` | Stripe webhook | Verifica firma, RPC idempotente |

**Secrets:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

---

## 18. Bug risolti — Principali

### Migrazione Supabase

| Bug | Fix |
|---|---|
| UUID type mismatch | Colonna `local_id TEXT` separata |
| Double-booking race condition | `book_slot_atomic` con `pg_advisory_xact_lock` |
| Booking scompare al reload | Merge: mantieni booking locali < 5min |

### PWA

| Bug | Fix |
|---|---|
| Profilo scompare al refresh | Pattern `INITIAL_SESSION` |
| Logout PWA da desktop | `signOut({ scope: 'local' })` |
| Logout spurio in background | Flag `_isManualLogout` + refresh recovery |
| Calendario vuoto nuovi utenti | Fix riferimento BookingStorage before init |

### Crediti/Pagamenti

| Bug | Fix |
|---|---|
| Crediti invisibili agli utenti | RLS SELECT + trigger auto_link_user_id |
| Race condition crediti | RPC atomiche server-side |
| Debito non blocca prenotazione | Usa localStorage (gia sincronizzato) |

### Admin

| Bug | Fix |
|---|---|
| 52 utenti fantasma | Backfill + fix trigger handle_new_user |
| Annullamento non persistente | Clone array + spread oggetti (no mutazione in-place) |
| Elimina dati cliente sbagliato | Lookup per email/whatsapp (non indice) |

---

## 19. Diario di sviluppo (sessioni 1-50)

### Sessioni 1-9 (feb 2026) — Base
Calendario pubblico, dashboard admin, dati demo, grafici Canvas, Google OAuth, E.164, annullamento FIFO, slot prenotato.

### Sessioni 10-13 — Transazioni e annullamento
Sistema transazioni, profilo utente, certificato medico, export XLSX, tab Registro, annullamento 24h, debiti manuali.

### Sessione 14 — Dominio
`thomasbresciani.com`, repo rinominato, Brevo SMTP.

### Sessioni 15-18 — Bonus, impostazioni, analytics
Bonus annullamento, soglia debito, certificato/assicurazione, backup JSON, pannelli dettaglio statistiche, sicurezza XSS.

### Sessione 19 — Migrazione Auth
`auth.js` riscritto, tabella `profiles`, trigger, RLS 7 tabelle, Brevo attivo.

### Sessioni 20-23 — Migrazione dati
Dual-write, sync, smart diff, push notifications complete, refactoring tabelle dedicate, ruolo admin JWT, bookings privacy.

### Sessioni 24-28 — Atomicita e hardening
12 RPC atomiche, audit 18 issue, 8 bug critici, localStorage hardening, Realtime debounced.

### Sessioni 29-34 — Fix e stabilita
Crediti invisibili, viewer emergenza, password dimenticata, PWA auto-update, sticky calendar, refactor Supabase-first.

### Sessioni 35-42 — UX e integrità
Realtime verificato, debito fix, popup annullamento, VAPID rotation, tab Messaggi, indirizzo, report XLSX, cutoff 30min, ghost users, health check.

### Sessioni 43-50 — Ultime feature
Gestione Orari fix, conferma email, notifica admin booking, annullamento persistente, settimane standard, bottone conferma fix, notifica slot migliorata, documento firmato.

---

## 20. Stato attuale e roadmap

### Da fare

| Priorita | Task |
|---|---|
| Alta | Attivare Stripe (account + deploy Edge Functions) |
| Alta | Configurare Uptime Robot |
| Media | Upload foto certificato medico (Supabase Storage) |
| Media | Email notifiche automatiche (Edge Function cron) |
| Bassa | Notifiche WhatsApp (whatsapp-web.js) |
| Bassa | Abbonamenti / pacchetti lezioni |

---

## 21. Decisioni architetturali

| Decisione | Scelta | Motivazione |
|---|---|---|
| Database | Supabase | Gratis, Auth integrata, Edge Functions, Realtime |
| Hosting | GitHub Pages | Gratis, HTTPS, deploy automatico |
| Framework | Vanilla JS | Zero build chain, deploy immediato |
| Grafici | Canvas API custom | Nessuna dipendenza |
| Auth | Supabase Auth | JWT, OAuth, reset password nativi |
| Operazioni | RPC PostgreSQL | Atomicita, zero race condition |
| Cache | In memoria (`_cache`) | Letture sincrone, Supabase sync al boot |
| Pagamenti | Stripe Checkout | Zero costo fisso, webhook sicuro |

---

## 22. Compatibilita Supabase Free Tier

| Risorsa | Limite | Consumo stimato |
|---|---|---|
| Database | 500 MB | <6 MB/anno |
| Auth MAU | 50.000 | ~200 utenti |
| Edge Functions | 500k/mese | ~5k/mese |
| Realtime | 200 connessioni | ~10 |
| Storage | 1 GB | ~90 MB (certificati) |
| **Pausa 7gg** | Si | **Uptime Robot** |
| **Backup** | No | **GitHub Actions** |

---

## 23. Checklist go-live

- [x] Migration SQL applicate
- [x] Admin role JWT configurato
- [x] pg_cron attivo
- [x] VAPID keys configurate
- [x] Brevo SMTP configurato
- [x] Site URL = thomasbresciani.com
- [x] Redirect URLs configurati
- [x] Tabelle nella publication supabase_realtime
- [ ] Configurare Uptime Robot
- [ ] Attivare account Stripe + deploy Edge Functions
- [ ] Test end-to-end completo
- [ ] Verificare aspetto fiscale ricariche con commercialista

---

*Documento unificato da PROGETTO.md, MIGRAZIONE.md, OPUS.md, Riassunto.md, fix.md e stripe.md — 24 marzo 2026*
