# TB Training — Documentazione Tecnica

> Ultimo aggiornamento: 25 marzo 2026 (v2)
> Dominio: https://thomasbresciani.com — Repository: ReNumaa/Thomas-Bresciani
> Progetto Supabase: `ppymuuyoveyyoswcimck` (Frankfurt, free tier)

---

## Indice

1. [Stack tecnologico](#1-stack-tecnologico)
2. [Struttura dei file](#2-struttura-dei-file)
3. [Architettura](#3-architettura)
4. [Database — Schema](#4-database--schema)
5. [RPC PostgreSQL](#5-rpc-postgresql)
6. [Row Level Security](#6-row-level-security)
7. [Autenticazione](#7-autenticazione)
8. [PWA e Service Worker](#8-pwa-e-service-worker)
9. [Push Notifications](#9-push-notifications)
10. [Supabase Realtime](#10-supabase-realtime)
11. [Funzionalita — Lato Utente](#11-funzionalità--lato-utente)
12. [Funzionalita — Lato Admin](#12-funzionalità--lato-admin)
13. [Stripe — Ricarica Credito](#13-stripe--ricarica-credito)
14. [Edge Functions](#14-edge-functions)
15. [Migrazioni SQL](#15-migrazioni-sql)
16. [Stato attuale e roadmap](#16-stato-attuale-e-roadmap)

---

## 1. Stack tecnologico

| Componente | Tecnologia | Note |
|---|---|---|
| Frontend | HTML5 + CSS3 + JavaScript vanilla | Zero dipendenze, nessuna build chain |
| Database | Supabase (PostgreSQL) | Cache in memoria + sync |
| Grafici | Canvas API custom (`chart-mini.js`) | Nessuna libreria esterna |
| Autenticazione | Supabase Auth + Google OAuth | SDK via CDN |
| Hosting | GitHub Pages | HTTPS automatico |
| Email | Brevo SMTP | `noreply@thomasbresciani.com`, DKIM+SPF |
| Push | Web Push VAPID + Edge Functions | Promemoria 25h e 1h |
| Pagamenti | Stripe Checkout (in attivazione) | Edge Functions |

**Costo: €0/mese** (tutti free tier).

---

## 2. Struttura dei file

```
Thomas-Bresciani/
├── index.html              # Calendario pubblico + form prenotazione
├── chi-sono.html           # Profilo personal trainer
├── dove-sono.html          # Mappa, indicazioni, contatti
├── login.html              # Login/registrazione + reset password
├── prenotazioni.html       # Area utente loggato
├── admin.html              # Dashboard admin
├── regolamento.html        # Regolamento palestra
├── viewer.html             # Viewer emergenza offline
├── modulo_viewer.html      # Viewer/stampa modulo PDF
├── nutrizione.html         # Pagina nutrizione
├── privacy.html            # Informativa sulla privacy (GDPR)
├── termini.html            # Termini e condizioni del servizio
├── sw.js                   # Service Worker (cache, push, offline)
├── manifest.json           # PWA manifest
├── css/
│   ├── style.css           # Stili globali + pagina pubblica
│   ├── login.css           # Login/registrazione
│   ├── admin.css           # Dashboard admin
│   ├── prenotazioni.css    # Area utente
│   ├── chi-sono.css
│   ├── dove-sono.css
│   ├── regolamento.css
│   └── nutrizione.css
├── js/
│   ├── data.js             # Storage classes, sync Supabase, slot/prezzi
│   ├── calendar.js         # Calendario pubblico (desktop + mobile)
│   ├── booking.js          # Prenotazione, validazione, conferma
│   ├── auth.js             # Supabase Auth, profili, normalizePhone()
│   ├── supabase-client.js  # Init Supabase SDK
│   ├── admin.js            # Logica dashboard admin principale
│   ├── admin-clients.js    # Tab Clienti
│   ├── admin-payments.js   # Tab Pagamenti
│   ├── admin-calendar.js   # Tab Prenotazioni/calendario
│   ├── admin-schedule.js   # Tab Gestione Orari
│   ├── admin-analytics.js  # Tab Statistiche
│   ├── admin-registro.js   # Tab Registro transazioni
│   ├── admin-messaggi.js   # Tab Messaggi push
│   ├── admin-backup.js     # Backup/ripristino/export
│   ├── admin-settings.js   # Tab Impostazioni
│   ├── chart-mini.js       # Libreria grafici Canvas
│   ├── push.js             # Push notification subscription
│   ├── pwa-install.js      # Banner installazione PWA
│   ├── sw-update.js        # Auto-update service worker
│   └── ui.js               # setLoading, showToast, _escHtml
├── supabase/
│   ├── config.toml
│   ├── migrations/         # 60+ migrazioni SQL
│   └── functions/          # Edge Functions (Deno/TypeScript)
│       ├── send-reminders/
│       ├── notify-slot-available/
│       ├── notify-admin-booking/
│       ├── send-admin-message/
│       ├── create-checkout/
│       └── stripe-webhook/
└── .github/workflows/
    └── backup.yml          # Backup automatico notturno su Nextcloud
```

---

## 3. Architettura

### Flusso dati

```
Browser (page load)
    ├─► syncFromSupabase()              → _cache in memoria
    └─► syncAppSettingsFromSupabase()   → localStorage (settings)

Scrittura
    ├─► _cache in memoria (sincrono)
    └─► Supabase RPC/upsert (async, immediato)

Operazioni multi-step
    └─► RPC PostgreSQL atomica (SECURITY DEFINER, transazione singola)

Realtime
    └─► Supabase Realtime → debounced full-sync → re-render UI
```

### Pattern

- **Source of truth persistente:** Supabase PostgreSQL
- **Source of truth in sessione:** `_cache` in memoria
- **localStorage:** solo per settings, flags e template settimanali
- **Principio:** client invia intention (RPC) → server esegue atomicamente → client risincronizza

### Diagramma

```
┌──────────────────────────────────────────────────┐
│              UTENTE (Browser / PWA)               │
│  index · prenotazioni · login · chi-sono · ...    │
└──────────────────────┬───────────────────────────┘
                       │ HTTPS
                       ▼
┌──────────────────────────────────────────────────┐
│            GITHUB PAGES (statico)                 │
└──────────────────────┬───────────────────────────┘
                       │ REST API + Realtime WS
                       ▼
┌──────────────────────────────────────────────────┐
│            SUPABASE (Frankfurt)                   │
│  PostgreSQL · Auth · Realtime · Edge Functions    │
└──────────────────────┬───────────────────────────┘
                       │ SMTP
                       ▼
┌──────────────────────────────────────────────────┐
│            BREVO (300 email/giorno)               │
└──────────────────────────────────────────────────┘
```

---

## 4. Database — Schema

### Tabelle principali

#### `bookings`

| Colonna | Tipo | Note |
|---|---|---|
| `id` | UUID (PK) | |
| `local_id` | TEXT | Legacy ID |
| `user_id` | UUID (FK → auth.users) | |
| `user_name`, `user_email` | TEXT | Denormalizzati |
| `date` | DATE | |
| `time` | TEXT | Es. `"10:00 - 11:00"` |
| `duration` | INTEGER | Minuti |
| `slot_type` | TEXT | `personal-training`, `small-group`, `group-class` |
| `status` | TEXT | `confirmed`, `cancellation_requested`, `cancelled` |
| `paid` | BOOLEAN | |
| `payment_method` | TEXT | contanti, carta, iban, credito, lezione-gratuita, stripe |
| `credit_applied` | NUMERIC | |
| `reminder_24h_sent`, `reminder_1h_sent` | BOOLEAN | |
| `updated_at`, `created_at` | TIMESTAMPTZ | |

#### `profiles`

| Colonna | Tipo | Note |
|---|---|---|
| `id` | UUID (PK, FK → auth.users) | |
| `name`, `email`, `whatsapp` | TEXT | |
| `codice_fiscale` | TEXT | |
| `indirizzo_via`, `indirizzo_paese`, `indirizzo_cap` | TEXT | |
| `medical_cert_expiry` | DATE | |
| `medical_cert_history` | JSONB | |
| `insurance_expiry` | DATE | |
| `insurance_history` | JSONB | |
| `documento_firmato` | BOOLEAN | |

#### `credits`

| Colonna | Tipo | Note |
|---|---|---|
| `id` | UUID (PK) | |
| `user_id` | UUID (FK) | Auto-linkato da trigger |
| `name`, `email`, `whatsapp` | TEXT | |
| `balance` | NUMERIC | Saldo corrente |
| `free_balance` | NUMERIC | Lezioni gratuite |

#### `credit_history`

Log immutabile movimenti credito: `credit_id`, `amount`, `display_amount`, `note`, `method`, `booking_ref`, `hidden`, `stripe_session_id`.

#### `manual_debts`

Debiti manuali: `user_id`, `name/email/whatsapp`, `balance`, `history` (JSONB array).

#### `bonuses`

Bonus annullamento giornaliero: `user_id`, `bonus` (0/1), `last_reset_date`.

#### `schedule_overrides`

Override orari per data: `date`, `time`, `slot_type`, `extras` (JSONB), `client_name/email/whatsapp`, `booking_id`.

#### `settings`

Chiave-valore: `debt_threshold`, `cancellation_mode`, `cert_*`, `assic_*`, `gym_week_templates`, `gym_active_week_template`.

#### Altre

- `push_subscriptions` — subscription push per dispositivo
- `admin_audit_log` — log audit operazioni admin

### Trigger automatici

| Trigger | Funzione |
|---|---|
| `handle_new_user` | Crea profilo alla registrazione |
| `credits_auto_link_user` | Popola `user_id` da email |
| `auto_link_manual_debt_user_id` | Popola `user_id` da email |
| `_trg_audit_booking_change` | Log in `admin_audit_log` |
| `set_updated_at` | Aggiorna `updated_at` su bookings, credits, manual_debts |

---

## 5. RPC PostgreSQL

Tutte le operazioni multi-step sono transazioni atomiche. Pattern: `SECURITY DEFINER` + `is_admin()` + `FOR UPDATE` locks.

### Admin (richiedono `is_admin()`)

| RPC | Descrizione |
|---|---|
| `admin_add_credit` | Ricarica + auto-pay FIFO + offset debiti |
| `admin_pay_bookings` | Segna pagati + salda debiti + acconto credito |
| `admin_change_payment_method` | Cambio metodo (8 scenari) |
| `admin_add_debt` | Debito manuale con storico JSONB |
| `admin_delete_debt_entry` | Rimuove voce + elimina saldamenti orfani + ricalcola saldo |
| `admin_delete_booking_with_refund` | Elimina + rimborso atomici |
| `admin_delete_booking` | Elimina fisicamente |
| `admin_rename_client` | Rinomina su tutte le tabelle |
| `admin_update_booking` | Update con optimistic locking |
| `admin_clear_all_data` | DELETE atomico tutte le tabelle |
| `admin_delete_client_data` | Elimina tutti i dati di un cliente |
| `admin_edit_credit_entry` | Modifica voce + ricalcola saldo |
| `admin_edit_debt_entry` | Modifica voce JSONB |
| `admin_delete_credit_entry` | Elimina voce credit_history |
| `admin_health_check` | Verifica integrita (6 tipi anomalia) |
| `admin_health_fix` | Fix conservativo (non cancella dati) |
| `process_pending_cancellations` | Ripristina booking pending entro 2h |
| `get_all_profiles` | Tutti i profili (admin only) |
| `get_debtors` | Debitori aggregati (booking + debiti manuali + crediti) |

### Utente (authenticated)

| RPC | Descrizione |
|---|---|
| `book_slot_atomic` | Prenotazione con advisory lock + cutoff 30min (admin bypassa cutoff) |
| `cancel_booking_with_refund` | Annullamento + rimborso + mora (atomici) |
| `user_request_cancellation` | Richiesta annullamento (verifica ownership) |
| `fulfill_pending_cancellation` | FIFO cancel pending + rimborso |
| `apply_credit_on_booking` | Credito su nuova prenotazione |
| `apply_credit_to_past_bookings` | Auto-paga dopo ricarica |
| `get_or_reset_bonus` | Bonus giornaliero |
| `save_push_subscription` | Salva subscription push |
| `stripe_topup_credit` | Accredita ricarica Stripe (service_role only) |

### Pubbliche (anon)

| RPC | Descrizione |
|---|---|
| `get_slot_availability` | Conta prenotazioni per slot |
| `get_availability_range` | Disponibilita per range date |
| `is_whatsapp_taken` | Unicita WhatsApp |

---

## 6. Row Level Security

RLS abilitata su tutte le tabelle. Helper `is_admin()` verifica `app_metadata.role = 'admin'`.

| Tabella | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `bookings` | own + admin | authenticated | via RPC | via RPC admin |
| `profiles` | own + admin | trigger | own + admin | — |
| `credits` | own + admin | via RPC | via RPC | via RPC |
| `credit_history` | via JOIN + admin | via RPC | via RPC | via RPC |
| `manual_debts` | own + admin | via RPC | via RPC | via RPC |
| `bonuses` | own + admin | via RPC | via RPC | via RPC |
| `schedule_overrides` | pubblico | admin | admin | admin |
| `settings` | pubblico | admin | admin | admin |
| `push_subscriptions` | own | via RPC | — | own |

Gli utenti vedono solo booking sintetici anonimi per la disponibilita calendario.

---

## 7. Autenticazione

### Supabase Auth

- Email + password con conferma email (Brevo SMTP)
- Google OAuth con modal "Completa profilo" per WhatsApp
- Reset password, cambio email con conferma
- Unique WhatsApp (partial index + RPC)

### Flusso

1. `initAuth()` su ogni pagina — evento `INITIAL_SESSION` (no race condition PWA)
2. Timeout fallback 6s → `getSession()` → `refreshSession()`
3. `_loadProfile(userId)` → `window._currentUser`
4. `updateNavAuth()` aggiorna navbar

### Admin

- JWT `app_metadata.role = "admin"`
- `is_admin()` verifica il claim in tutte le RPC
- Fallback password SHA-256 per accesso offline
- `sessionStorage.adminAuth` per persistenza tab

---

## 8. PWA e Service Worker

### Service Worker (`sw.js`)

- **CACHE_NAME** versionato — bumpare ad ogni deploy
- **Install:** pre-cache APP_SHELL
- **Fetch:** Network First (HTML, JS, CSS), Cache First (immagini)
- **Push handler:** notifiche da Edge Functions
- `ignoreSearch: true` per gestire query string

### Auto-update (`sw-update.js`)

- `updateViaCache: 'none'`
- Listener `updatefound` + `statechange` → reload automatico

### iOS

- `maximum-scale=1.0, user-scalable=no, viewport-fit=cover`
- `overscroll-behavior: none`, safe area padding

---

## 9. Push Notifications

| Funzione | Trigger | Descrizione |
|---|---|---|
| `send-reminders` | pg_cron `*/5 * * * *` | Promemoria 25h e 1h (Europe/Rome) |
| `notify-slot-available` | Client (annullamento) | Solo se slot era pieno |
| `notify-admin-booking` | Client (prenotazione) | Nome + occupazione |
| `send-admin-message` | Admin (tab Messaggi) | 3 modalita destinatari |

VAPID keys: public in `push.js`, private nei secrets Supabase.

---

## 10. Supabase Realtime

| Pagina | Tabelle | Debounce |
|---|---|---|
| `index.html` | bookings, settings, schedule_overrides | — |
| `admin.html` | bookings, credits, credit_history, manual_debts, bonuses, profiles, settings | 600ms |
| `prenotazioni.html` | bookings, credits, credit_history, manual_debts, bonuses | 300ms |

Tabelle devono essere nella publication `supabase_realtime`.

---

## 11. Funzionalita — Lato Utente

### Calendario (`index.html`)

- Desktop: 7 colonne Lun-Dom, slot colorati, contatore posti a pallini
- Mobile: slider giorno con swipe, card verticali
- Cutoff prenotazione: inizio lezione + 30 minuti
- 3 tipi: Personal Training (rosso, max 1), Small Group (azzurro, max 4), Gruppo (giallo, max 5)

### Prenotazione

- Login richiesto, campi nascosti per utenti loggati
- Protezioni: doppio click, duplicati, debito, cert scaduto, assicurazione, documento
- Timeout 45s con avviso "Connessione lenta" (15s) + safety unlock (50s)

### Le mie prenotazioni (`prenotazioni.html`)

- Tab Prossime/Passate/Transazioni con paginazione
- Saldo crediti, debiti, bonus
- Ricarica Stripe, warning certificato

### Annullamento

| Tempo alla lezione | Comportamento |
|---|---|
| > 24h | Diretto + rimborso completo |
| 24h-2h | Condizionale (serve sostituto) |
| < 2h | Bloccato (bonus giornaliero override) |

### Profilo

Modifica: nome, WhatsApp, password, indirizzo, codice fiscale. Certificato e assicurazione: solo admin.

---

## 12. Funzionalita — Lato Admin

### Dashboard (`admin.html`)

8 tab: Prenotazioni, Gestione Orari, Statistiche, Pagamenti, Registro, Clienti, Messaggi, Impostazioni.

- **Prenotazioni:** calendario con partecipanti, badge cert/assic/documento, checkbox pagamento, posti extra, popup annullamento
- **Gestione Orari:** 12 fasce/giorno, 3 settimane standard, override per data, assegnazione cliente
- **Statistiche:** stat card, grafici trend/proiezione/pie, top/bottom clienti, filtri temporali
- **Pagamenti:** debitori/creditori, popup "Da pagare", modifica storico, report XLSX
- **Registro:** event sourcing, 7+ tipi, filtri, export Excel
- **Clienti:** ricerca, filtri (cert/assic/anagrafica), popup modifica, eliminazione
- **Messaggi:** push a tutti / iscritti giorno / iscritti ora
- **Impostazioni:** soglie, blocchi, backup/ripristino, health check

### Viewer emergenza (`viewer.html`)

Funziona offline con backup JSON importato.

---

## 13. Stripe — Ricarica Credito

### Flusso

1. Utente sceglie importo (min €50) → `create-checkout` → Stripe Checkout
2. Stripe webhook → `stripe-webhook` → `stripe_topup_credit`
3. Credito accreditato → Realtime aggiorna PWA → `apply_credit_to_past_bookings`

### Stato

- Frontend: completato
- Database: migration eseguita
- Edge Functions: scritte, da deployare
- **Account Stripe: da creare (Thomas)**

### Costi

1.5% + €0.25 (carta UE) | 3.25% + €0.25 (extra-UE) | Nessun costo fisso

### Passi per go live

1. Creare account Stripe
2. Chiavi API + webhook (`checkout.session.completed`)
3. `supabase secrets set STRIPE_SECRET_KEY=... STRIPE_WEBHOOK_SECRET=...`
4. Deploy: `supabase functions deploy create-checkout && supabase functions deploy stripe-webhook`
5. Test con `4242 4242 4242 4242`
6. Go live: verifica identita, chiavi live, rimuovere filtro UID

---

## 14. Edge Functions

| Funzione | Trigger | Note |
|---|---|---|
| `send-reminders` | pg_cron `*/5 * * * *` | Promemoria 25h + 1h |
| `notify-slot-available` | Client (annullamento) | Solo se slot era pieno |
| `notify-admin-booking` | Client (prenotazione) | Nome + occupazione |
| `send-admin-message` | Admin | 3 modalita |
| `create-checkout` | Client (ricarica) | Verifica JWT |
| `stripe-webhook` | Stripe webhook | Verifica firma, idempotente |

**Secrets:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

---

## 15. Migrazioni SQL

71 file in `supabase/migrations/`, in ordine cronologico.

| Periodo | Contenuto |
|---|---|
| feb 2026 | Schema base, profiles, trigger, RPC base |
| 9-10 mar | Push, security, constraints, admin role, bookings privacy |
| 11-12 mar | 12 RPC atomiche, production hardening, cancellation, unique whatsapp |
| 13-15 mar | Fix credit, auto-link triggers, indirizzo, audit, updated_at |
| 16-17 mar | Credit method, cutoff, edit entries, health check, ghost users |
| 19-23 mar | Settings realtime, stripe_topup, push cleanup, documento_firmato |
| 24-25 mar | Fix delete debt orfani, get_debtors manual-only, fix credits visibility, admin bypass cutoff, fix backup documento_firmato |

---

## 16. Stato attuale e roadmap

### Checklist go-live

- [x] Migration SQL applicate
- [x] Admin role JWT
- [x] pg_cron attivo
- [x] VAPID keys
- [x] Brevo SMTP
- [x] Site URL = thomasbresciani.com
- [x] Redirect URLs
- [x] Tabelle in supabase_realtime
- [ ] Attivare Stripe (account + deploy Edge Functions)
- [ ] Test end-to-end completo
- [ ] Verificare aspetto fiscale con commercialista

### Roadmap

| Priorita | Task |
|---|---|
| Alta | Attivare Stripe |
| Media | Upload foto certificato medico (Supabase Storage) |
| Bassa | Abbonamenti / pacchetti lezioni |

### Decisioni architetturali

| Decisione | Scelta | Motivazione |
|---|---|---|
| Database | Supabase | Gratis, Auth, Edge Functions, Realtime |
| Hosting | GitHub Pages | Gratis, HTTPS, deploy automatico |
| Framework | Vanilla JS | Zero build chain, deploy immediato |
| Operazioni | RPC PostgreSQL | Atomicita, zero race condition |
| Pagamenti | Stripe Checkout | Zero costo fisso, webhook sicuro |

### Compatibilita Supabase Free Tier

| Risorsa | Limite | Consumo stimato |
|---|---|---|
| Database | 500 MB | <6 MB/anno |
| Auth MAU | 50.000 | ~200 utenti |
| Edge Functions | 500k/mese | ~5k/mese |
| Realtime | 200 connessioni | ~10 |
| Storage | 1 GB | ~90 MB (certificati) |

---

*Documento unificato — 25 marzo 2026*
