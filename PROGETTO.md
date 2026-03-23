# TB Training — Diario di Sviluppo & Roadmap

> Documento aggiornato al 21/03/2026 (sessione 50)
> Prototipo: sistema di prenotazione palestra, frontend-only con localStorage
> Supabase CLI installato, schema SQL definito, accesso dati centralizzato
> Supabase cloud attivo (tabelle create), Google OAuth funzionante, numeri normalizzati E.164
> Dominio custom thomasbresciani.com attivo, repo rinominato Thomas-Bresciani, Brevo SMTP configurato
> **FASE 2 AVVIATA**: Supabase Auth completamente migrato (js/auth.js riscritto, profili su DB, email conferma via Brevo)
> **SESSIONE 20**: migrazione dati Supabase completata (booking + app_settings dual-write + sync); fix notifiche cert
> **SESSIONE 21**: push notification complete (slot disponibile, promemoria 25h/1h, Edge Functions deployate); admin booking a nome cliente; fix extra spot
> **SESSIONE 22**: fix PWA profilo che scompare al refresh (race condition token Supabase); fix removeExtraSpot; RPC admin_delete_booking
> **SESSIONE 23**: refactoring app_settings → tabelle dedicate completato; ruolo admin JWT + is_admin(); RPC get_slot_availability; bookings privacy RLS; scalabilità localStorage (finestra -180/+90gg admin); backup strategy Umbrel
> **SESSIONE 24**: fix bug pre go-live completati — _parseSlotTime (M3), processPendingCancellations auto-call rimossa (M4), RPC cancel_booking_with_refund atomica (M5), _lsSet QuotaExceeded handler (B3), _rpcWithTimeout (B2), admin sessionStorage guard A6; M6 già corretto; B4 N/A (JWT Bearer)
> **SESSIONE 25**: tutte le operazioni credito/pagamento migrate ad RPC PostgreSQL atomiche; fix sync PWA dopo "Elimina Tutti i Dati"; Realtime balance su prenotazioni.html
> **SESSIONE 26**: audit production hardening completo (18 issue) — FOR UPDATE locks, RLS restrict, input validation, optimistic locking, audit trail, indexes, CSP, FK fix; tutte 18/18 risolte
> **SESSIONE 27**: fix clearAllData (4 bug), mora nel registro, bonus utilizzato nel registro, CSP wss://, 8 bug critici produzione (booking await, doppio click, fire-and-forget, sync retry, offline feedback, stale_data rollback, cert blocco inline)
> **SESSIONE 28**: hardening localStorage (quota, JSON.parse, pruning history, logout cleanup), fix processPendingCancellations non-admin, navbar admin su tutte le pagine, Realtime debounced full-sync per saldi in tempo reale
> **SESSIONE 29**: fix bug critico crediti invisibili agli utenti — RLS policy SELECT mancante su credits/credit_history + trigger auto-link user_id + calendario desktop Lun-Dom
> **SESSIONE 30**: viewer emergency mode completo, auto-capitalize nomi, "Mostra altro" pagination, RPC user_request_cancellation, pulsante elimina dati cliente, fix cancellazioni utente
> **SESSIONE 33**: PWA auto-update, sticky calendar mobile+desktop, fix race condition crediti/debiti, booking modal semplificato, debiti unificati, alert debito superato
> **SESSIONE 34**: fix soglia blocco debito (localStorage instead of RPC), trigger auto-link manual_debts user_id, messaggi "Contatta Thomas"
> **SESSIONE 35**: verifica Realtime (già attivo su tutte le pagine), fix check duplicati prenotazione via Supabase (evita dati stale localStorage)
> **SESSIONE 36**: fix getUnpaidPastDebt (startTime invece di endTime), refactoring popup annullamento admin (conferma semplice >24h, con/senza mora <24h), bonus auto-seleziona senza mora, sidebar credit PWA iPhone fix, rinomina tabella click_andrea_pompili
> **SESSIONE 37**: refactor Supabase-first (localStorage → cache in memoria), fix booking popup incompleto, admin tabs sticky + persistenza tab + scroll to top, fix tab vuote al refresh, fix logout spurio PWA
> **SESSIONE 38**: badge notifica dumbbell, rotazione VAPID keys, tab admin "Messaggi" per invio push personalizzate
> **SESSIONE 39**: indirizzo residenza, controllo dati carta/bonifico, fix Google OAuth, schema hardening (FK/audit/locking), fix import backup Nextcloud, export CSV
> **SESSIONE 40**: report settimanale (fix timezone, crediti manuali, method in credit_history), popup modifica cliente, restyling tab Clienti (stat cards, filtro anagrafica), ricerca unificata dropdown, modifica/elimina crediti e debiti in Pagamenti, navigazione settimana auto-hide
> **SESSIONE 41**: cutoff prenotazione (inizio lezione + 30 min client+server), fix badge notifica "Prenotazione confermata" (path + icona monocromatica)
> **SESSIONE 42**: fix 52 utenti fantasma (trigger handle_new_user rotto), health check/fix admin, filtri clienti indipendenti, fix modifica cliente con filtri attivi
> **SESSIONE 43**: fix assegnazione cliente a slot (invalid_capacity), persistenza client in schedule_overrides su Supabase, fix annullamento booking da Gestione Orari (removeBookingById + clearSlotClient con popup bonus/mora), fix apply_credit email case-insensitive
> **SESSIONE 44**: fix link conferma email registrazione (emailRedirectTo + auto-login dopo conferma), conferma manuale utenti bloccati, configurazione Site URL produzione
> **SESSIONE 45**: notifica push admin su nuova prenotazione (Edge Function notify-admin-booking), fix apply_credit email case-insensitive
> **SESSIONE 46**: fix annullamento admin che non persisteva su Supabase (bug reference-sharing _cache in deleteBooking/replaceAllBookings)
> **SESSIONE 47**: ripristino bottone elimina dati cliente nel popup Modifica contatto, fix deleteClientData con filtro attivo (lookup per email/whatsapp invece di index)
> **SESSIONE 48**: 3 settimane standard configurabili/rinominabili in Impostazioni, popup editor (simile a Gestione Orari), Realtime sync tabella settings tra dispositivi, fix backup (export/import settimane standard)
> **SESSIONE 49**: fix bottone "Conferma Prenotazione" che restava disabilitato (grigio) dopo errori — reset in openBookingModal, try/catch/finally su async submit
> **SESSIONE 50**: migliora notifica push "slot disponibile" — titolo "Slot libero disponibile", body con nome giorno e posti disponibili (es. "martedì 24 marzo alle 18:00 (4/5)")

---

## Indice

1. [Cos'è il progetto](#1-cosè-il-progetto)
2. [Stack tecnologico attuale](#2-stack-tecnologico-attuale)
3. [Struttura dei file](#3-struttura-dei-file)
4. [Cosa è stato fatto — dettaglio completo](#4-cosa-è-stato-fatto--dettaglio-completo)
5. [Stato attuale del prototipo](#5-stato-attuale-del-prototipo)
6. [Cosa manca / cosa è da fare](#6-cosa-manca--cosa-è-da-fare)
7. [Roadmap verso la produzione](#7-roadmap-verso-la-produzione)
8. [Architettura target (produzione)](#8-architettura-target-produzione)
9. [Decisioni prese](#9-decisioni-prese)

---

## 1. Cos'è il progetto

Sistema di prenotazione online per la palestra **TB Training**. Permette ai clienti di prenotare lezioni dal sito, e al gestore di avere una dashboard admin con calendario, statistiche e fatturato.

**Obiettivo finale:** sistema funzionante online, con database reale, notifiche automatiche il giorno prima della lezione, e possibilmente notifiche WhatsApp in futuro.

---

## 2. Stack tecnologico attuale

| Componente | Tecnologia | Note |
|---|---|---|
| Frontend | HTML5 + CSS3 + JavaScript vanilla | Nessuna dipendenza esterna |
| Persistenza dati | Supabase (cache in memoria + sync) | localStorage solo per settings/flags |
| Grafici | Canvas API custom (`chart-mini.js`) | Nessuna libreria esterna |
| Autenticazione | Supabase Auth + Google OAuth | SDK via CDN (`@supabase/supabase-js@2`) |
| Hosting | GitHub Pages | https://thomasbresciani.com (repo: ReNumaa/Thomas-Bresciani) |
| Email transazionale | Brevo (SMTP) | Configurato, attivo dopo migrazione Supabase Auth |

**Stack target per la produzione:**

| Componente | Tecnologia | Costo |
|---|---|---|
| Frontend hosting | GitHub Pages | Gratis |
| Database | Supabase (PostgreSQL) | Gratis (fino a 500MB) |
| Notifiche email | Brevo o Resend | Gratis (fino a 300/giorno) |
| Notifiche WhatsApp | (futuro) whatsapp-web.js su Railway | ~€5/mese SIM dedicata |

---

## 3. Struttura dei file

```
Palestra-Booking-Prototype/
├── index.html          # Pagina pubblica: calendario + form prenotazione
├── chi-sono.html       # Pagina pubblica: profilo personal trainer
├── dove-sono.html      # Pagina pubblica: indicazioni, mappa, contatti e orari
├── login.html          # Login utenti (per prenotare)
├── admin.html          # Dashboard amministratore (protetta da password)
├── viewer.html         # Viewer emergenza: visualizza backup + aggiungi prenotazioni/crediti offline
├── css/
│   ├── style.css       # Stili pagina pubblica
│   ├── login.css       # Stili pagina login utenti
│   ├── admin.css       # Stili dashboard admin e login admin
│   └── dove-sono.css   # Stili pagina dove sono
├── js/
│   ├── data.js             # Dati demo, storage, slot e prezzi + helper centralizzati
│   ├── calendar.js         # Logica calendario pubblico
│   ├── booking.js          # Form prenotazione e conferma
│   ├── chart-mini.js       # Libreria grafici su Canvas (linea + torta)
│   ├── auth.js             # Auth localStorage + normalizePhone() E.164
│   ├── supabase-client.js  # Inizializzazione Supabase JS SDK (usato da login.html)
│   ├── push.js             # Push notification subscription (VAPID, localStorage → Supabase)
│   └── admin.js            # Tutta la logica della dashboard admin
├── supabase/           # Configurazione Supabase CLI (locale)
│   ├── config.toml     # Config progetto Supabase locale
│   └── migrations/
│       ├── 20260225000000_init.sql  # Schema DB: bookings, schedule_overrides, credits
│       └── ...                     # 17 migration files (fino a 20260312400000_admin_delete_client_data.sql)
├── images/             # Loghi e immagini
├── README.md           # Documentazione tecnica base
└── PROGETTO.md         # Questo file (diario + roadmap)
```

**Navbar:** tutte e 5 le pagine (index, chi-sono, dove-sono, login, admin) hanno gli stessi link: Calendario → Chi sono → Dove sono → Admin.

---

## 4. Cosa è stato fatto — dettaglio completo

### 4.1–4.5 Features base e UI (feb 2026)

**Calendario pubblico (`index.html`):** settimanale desktop (7 colonne, slot colorati per tipo, contatore posti) + mobile (slider giorno, card verticali). Parte dal giorno attuale. Form prenotazione con validazione client.

**Dashboard admin (`admin.html`):** tab Prenotazioni (calendario + partecipanti + checkbox pagamento), Gestione Orari (16 slot/giorno, override per data), Analitiche (stats card con variazione %, grafici linea/torta custom Canvas, fasce orarie popolari, filtri temporali).

**Dati demo (`data.js`):** ~150-200 booking casuali, flag `dataClearedByUser` blocca regen. `paymentMethod` e `paidAt` realistici.

**Grafici (`chart-mini.js`):** libreria Canvas custom, fix dimensioni su tab nascosti (fallback 400×250, guard radius ≤ 0).

**Pagina "Dove Sono":** mappa embed, info card trasporti, contatti & orari.

---

### 4.6 Preparazione e attivazione Supabase (feb 2026)

Schema SQL (`bookings`, `schedule_overrides`, `credits`, `credit_history`), RLS, accesso dati centralizzato in `BookingStorage`/`CreditStorage`. Progetto cloud: `ppymuuyoveyyoswcimck` (Frankfurt, free tier).

---

### 4.7–4.9 Auth, OAuth e normalizzazione telefono (feb 2026)

**Google OAuth** via Supabase Auth (`supabase-client.js`). Flusso: `signInWithOAuth` → callback → `getSession()` → `_loadProfile()`. Modal "Completa profilo" chiede WhatsApp al primo OAuth. **`normalizePhone()`** in `auth.js` → formato E.164 (`+39XXXXXXXXXX`).

---

### 4.10–4.11 Annullamento prenotazioni e consistenza dati (feb 2026)

**Flusso annullamento:** `requestCancellation()` → `cancellation_requested` → se qualcuno prenota, `fulfillPendingCancellations()` cancella FIFO + rimborso credito → se nessuno entro 2h, `processPendingCancellations()` ripristina `confirmed`. Badge colorati in prenotazioni.html e admin. `applyToUnpaidBookings()` salta cancelled/cancellation_requested. Verifica doppia prenotazione. `processPendingCancellations` eseguita su ogni pagina via DOMContentLoaded.

---

### 4.13–4.14 Fix annullamento, slot prenotato con cliente, gestione orari (feb 2026)

**Fix flusso annullamento:** `processPendingCancellations` non cancella più `cancellationRequestedAt` al ripristino. `fulfillPendingCancellations` cerca anche `confirmed` con `cancellationRequestedAt`. Blocco prenotazioni entro 2h. `CreditStorage.clearRecord()`.

**Slot prenotato con cliente (`UserStorage`):** autocomplete clienti in Gestione Orari, `selectSlotClient()` crea booking reale. Annullamento slot prenotato con regola 3 giorni (slot prenotato) vs 3 ore (lezione di gruppo). `cancelAndConvertSlot()`.

---

### 4.15 Sistema transazioni, pagamenti e storico credito (feb 2026)

Prenotazioni in corso prenotabili (≥30min dalla fine). `displayAmount` per eccedenza pagamento. "Da pagare" include passate. Annullamenti preservati (no `splice`, marca `cancelled`). Rimborso credito per qualsiasi metodo pagamento. Netting crediti/debiti in Pagamenti. Storico transazioni con filtri data (Settimana/Mese/6m/1a). Badge "Segna pagato" cliccabile. Prezzi aggiornati: Autonomia €5, Lezione di Gruppo €10, Slot prenotato €50.

---

### 4.16 Profilo utente, certificato medico e fix UI mobile (feb 2026)

Modifica profilo utente (modale con nome, email, WhatsApp, cert. medico, password). `certificatoMedicoScadenza` + `certificatoMedicoHistory` in profilo. Warning banner su prenotazioni.html (rosso se scaduto/mancante, giallo se <30gg). Badge cert. medico in admin su card partecipante e scheda cliente. Prenotazioni "Passate" calcolate per orario di fine. Cutoff annullamenti corretti (3 giorni slot prenotato, 3 ore lezioni di gruppo).

---

### 4.17 Fix pagamenti, transazioni, ordinamento e prezzi (feb 2026)

Export .xlsx unico con SheetJS (6 fogli). Fix voci pagamento mancanti nello storico (amount=0 come log informativo). Badge "Segna pagato" cliccabile in admin. Fix cutoff annullamento invertito. Ordinamento prenotazioni per data+ora. Fix paidAt datetime-local.

---

### 4.18 PWA miglioramenti e infrastruttura push notification (feb 2026)

Rinomina "TB Training" → "Palestra". Fix icona PWA (rimosso maskable). Notifica locale alla conferma prenotazione. Infrastruttura push notification: chiavi VAPID, `js/push.js`, handler `push` in sw.js. `.gitignore`.

**Quando si migra a Supabase (3 passi):**
1. Crea tabella `push_subscriptions` (schema già scritto in `push.js`)
2. In `push.js`: sostituisci `savePushSubscription()` con `supabase.upsert()` (codice commentato nel file)
3. Scrivi Edge Function cron: legge prenotazioni di domani, manda push con VAPID private key dai secrets

---

### 4.19 UX mobile e layout (feb 2026)

Footer flex min-height 100vh. Credit "powered by" in sidebar. Calendario avanza auto dopo 20:30. Swipe orizzontale su selettore giorni mobile.

---

### 4.20 Posti extra, login gate, bfcache fix (mar 2026)

**Posti extra:** bottone "+" in admin per aggiungere posti extra con tipo diverso. `getEffectiveCapacity()`. Vista split slot (desktop + mobile). `removeExtraSpot`.

**Login gate:** `openBookingModal()` controlla `getCurrentUser()`, mostra prompt login se non loggato.

**bfcache fix:** listener `pageshow` con `event.persisted` su calendar.js e admin.js.

---

### 4.21–4.24 Lezione gratuita, dark mode fix, refactor phone (mar 2026)

**Lezione Gratuita:** `freeBalance` separato, `paymentMethod = 'lezione-gratuita'`, esclusa da fatturato. Fix rimborso su annullamento pendente.

**Dark mode:** `color-scheme: light` su tutti gli elementi logo.

**Tab giorno rosso** se slot prenotato senza cliente in Gestione Orari.

**Unificazione `normalizePhone`:** rimossi duplicati, tutto usa `normalizePhone()` di auth.js. Fix XSS in `showConfirmation()`.

---

### 4.25–4.27 Tab Registro, annullamento diretto, fix rimborsi (sessioni 10-12, mar 2026)

**Tab Registro:** event sourcing con 7 tipi evento, filtri multipli, paginazione 50/pagina, export Excel, summary incassato (esclude lezione-gratuita). Formula fatturato: `booking_paid` (no credito/gratuita) + `credit_added` (no freeLesson).

**Annullamento diretto:** >24h → annullamento immediato; ≤24h >2h → richiesta con sostituzione; ≤2h → bloccato. Debiti manuali nel popup admin (selezionabili + pagabili insieme).

**Fix Registro rimborsi:** `cancelledPaidAt`/`cancelledPaymentMethod` preservati in `deleteBooking` per ricostruire la sequenza Prenotazione → Pagamento → Annullamento → Rimborso. Rimosso filtro `hiddenRefund`.

---

### 4.29 Dominio custom, migrazione repo e Brevo SMTP (sessione 14, mar 2026)

**Dominio custom `thomasbresciani.com`:**
- Acquistato dominio `thomasbresciani.com`, configurato su GitHub Pages
- Repository rinominato da `Palestra` a `Thomas-Bresciani` (`ReNumaa/Thomas-Bresciani`)
- Remote git aggiornato al nuovo repo

**Fix path post-migrazione repo:**
- Service Worker: `register('/Palestra/sw.js')` → `register('/sw.js')` in tutti i 6 HTML
- OAuth `redirectTo`: `https://renumaa.github.io/Palestra/login.html` → `https://thomasbresciani.com/login.html`
- `apple-mobile-web-app-title`: aggiornato da `Palestra` a `Gym` (nome PWA invariato)
- Supabase: aggiunto `https://thomasbresciani.com/login.html` agli **Allowed Redirect URLs**
- Supabase **Site URL** lasciato invariato (cambio URL causava blocco dashboard — da aggiornare quando stabile)

**URL puliti (rimozione `/index.html`):**
- Redirect JS in `index.html`: se path termina con `/index.html` → redirect a `/`
- Tutti i link `href="index.html"` → `href="/"` in tutti gli HTML
- `auth.js`: redirect logout da `index.html` → `/`

**Brevo SMTP configurato:**
- Account Brevo creato
- SMTP configurato in Supabase (Authentication → Email → SMTP Settings): `smtp-relay.brevo.com:587`
- Sender: `noreply@thomasbresciani.com` / `Thomas Bresciani`
- Email di autenticazione (confirm signup, reset password) attive dopo migrazione a Supabase Auth
- Template email da personalizzare in italiano al momento della migrazione

**File modificati:** `index.html`, `admin.html`, `chi-sono.html`, `dove-sono.html`, `login.html`, `prenotazioni.html`, `js/auth.js`

---

### 4.30 Bonus annullamento, fix bfcache prenotazioni e soglia debito (sessione 15, mar 2026)

#### Bonus annullamento

Ogni cliente ha un **bonus giornaliero** (0 o 1) che permette di annullare una prenotazione normalmente bloccata. Non è cumulabile: al cambio giorno si ripristina da 0→1, ma non va oltre 1.

**Logica finestre di annullamento rivista per tipo:**

| Tipo | Annullamento diretto | Richiesta annullamento | Bloccato (bonus o niente) |
|---|---|---|---|
| Personal Training / Lezione di Gruppo | > 24h | ≤ 24h e > 2h | ≤ 2h |
| Slot prenotato (group-class) | > 3 giorni | — | ≤ 3 giorni e > 2h |

**Comportamento bonus:**
- Se il cliente ha bonus = 1 e la prenotazione è bloccata: compare il pulsante "🎟️ Usa bonus e annulla"
- Utilizzando il bonus: credito rimborsato normalmente, bonus passa a 0
- Se bonus = 0: il pulsante è sostituito da "🔒 Non annullabile" (come prima)

**Implementazione:**
- `BonusStorage` in `data.js`: salva `{ bonus, lastResetDate }` per contatto in localStorage; auto-ripristino giornaliero
- `BookingStorage.cancelWithBonus(id)` in `data.js`: annulla + rimborsa credito + chiama `BonusStorage.useBonus()` + riconverte slot group-class in small-group
- `prenotazioni.html`: UI "🎟️ Bonus annullamento" nella saldo card, pulsante bonus nel buildCard, `renderBonusBalance()`, `cancelWithBonus()`
- `css/prenotazioni.css`: stile pulsante viola per il bonus

**Nota Supabase:** `BonusStorage` → tabella `bonus_balance(whatsapp, email, bonus, last_reset_date)` o colonna su `profiles`.

---

#### Fix navigazione index.html → prenotazioni.html (bfcache)

**Problema:** navigando da `index.html` a `prenotazioni.html` i dati non si caricavano; funzionava solo dopo refresh.

**Cause:**
1. `data.js` servito dal cache del browser (versione vecchia senza `BonusStorage` → `ReferenceError`)
2. Il browser usa `bfcache` (Back/Forward Cache): restaura la pagina senza rieseguire `DOMContentLoaded`

**Fix:**
- Bump versione `data.js` v5→v6 in tutti gli HTML (cache busting)
- `prenotazioni.html`: aggiunto check `document.readyState === 'loading'` + listener `pageshow` con `event.persisted` per forzare il reinit su restore da bfcache
- Estratto `_initPrenoPage()` come funzione richiamabile indipendentemente dal lifecycle evento

---

#### Soglia debito per blocco prenotazioni

**Funzionalità:** l'admin può impostare una soglia in € nella sezione 💳 Pagamenti. Chi ha debiti passati non pagati superiori alla soglia non può effettuare nuove prenotazioni.

- Solo debiti **passati** contano (prenotazioni già terminate + debiti manuali); le prenotazioni future vengono ignorate
- Soglia = 0 → nessun blocco (default)
- Il credito disponibile viene nettato dal debito prima del confronto

**Implementazione:**
- `DebtThresholdStorage` in `data.js`: `get()` / `set(amount)` su localStorage (chiave `gym_debt_threshold`)
- `BookingStorage.getUnpaidPastDebt(whatsapp, email)` in `data.js`: calcola debito passato per contatto (phone OR email match)
- `admin.html`: riquadro "🚫 Soglia blocco prenotazioni" con input € nella tab Pagamenti
- `admin.js`: `renderDebtThresholdUI()` + `saveDebtThreshold()` (oninput, salvataggio immediato)
- `booking.js`: validazione prima del salvataggio — se `pastDebt > threshold` mostra toast e blocca
- `css/admin.css`: stile riquadro giallo/ambra per il pannello soglia

**Nota Supabase:** `DebtThresholdStorage` → tabella `settings(key TEXT PRIMARY KEY, value TEXT)` con `key = 'debt_threshold'`. `getUnpaidPastDebt` → query SQL su `bookings` con filtro `paid = false` e `ended_at < now()`.

**File modificati:** `js/data.js` (v7), `js/admin.js` (v11), `js/booking.js` (v5), `admin.html`, `css/admin.css` (v7), più bump v7 `data.js` in tutti gli altri HTML

---

### 4.31 Layout mobile prenotazioni, impostazioni certificato e filtri clienti (sessione 16, mar 2026)

#### Layout mobile "Le mie prenotazioni"

**Problema:** su mobile la card prenotazione aveva badge e bottone affiancati in riga, e l'hint grigio a fianco del bottone invece che sotto.

**Fix layout card su mobile (`css/prenotazioni.css`):**
- `.preno-card`: aggiunto `flex-wrap: wrap; align-items: flex-start` → la card si divide in riga destra/sinistra con eventuale hint a piena larghezza sotto
- `.preno-card-left`: `flex: 1; min-width: 0`
- `.preno-card-right`: ripristinato `flex-direction: column; max-width: 130px` → badge in alto a destra, bottone sotto
- `.preno-badge`: `white-space: normal; text-align: center; padding: 0.3rem` → il testo lungi (es. "Pagata con Contanti") va a capo e si centra
- `.preno-cancel-btn`: stessi override per il wrap
- `.preno-card-date`: `font-size: 0.82rem`

**Rimozione hint grigi (preno-bonus-hint):**
- Rimossa la classe `.preno-bonus-hint` da `prenotazioni.css` e `admin.css`
- In `buildCard()` (`prenotazioni.html`): `cancelHint` separato da `cancelBtn` (era un div annidato), poi eliminato del tutto — i commenti "Non annullabile... hai 1 bonus" e "Rimborso del 50%..." sono stati rimossi su richiesta

#### Warning certificato medico — tutto cliccabile

- Rimosso lo `<span>(qui)</span>` dal warning "Imposta scadenza Cert. Medico"
- Tutti e tre i warning (non impostato, scaduto, in scadenza) sono ora interi `<div>` cliccabili con classe `preno-cert-clickable`
- **Se cert non modificabile:** click → `showToast('Porta a Thomas il certificato medico', 'error')` invece di aprire il modale

#### Impostazioni admin — Certificato medico modificabile

Nuova sezione in **Admin → Impostazioni** per controllare se i clienti possono modificare la data di scadenza del proprio certificato:

- **`CertEditableStorage`** in `data.js`: `get()` (default `true`) / `set(val)`; chiave `gym_cert_scadenza_editable`
- **Toggle switch CSS** (`.settings-toggle-wrap`, `.settings-toggle-track`, `.settings-toggle-thumb`) in `admin.css`
- **`renderCertEditableUI()`** e **`saveCertEditable(val)`** in `admin.js`, chiamati da `renderSettingsTab()`
- **`prenotazioni.html`**: `openEditProfileModal()` imposta `certField.disabled = !CertEditableStorage.get()`

#### Impostazioni admin — Blocco prenotazioni per certificato

Nuova sezione in **Admin → Impostazioni** con due toggle indipendenti:

| Toggle | Comportamento se attivo |
|---|---|
| Certificato scaduto | Blocca la prenotazione se `certScad < today` |
| Certificato non impostato | Blocca la prenotazione se `certScad` è vuoto |

- **`CertBookingStorage`** in `data.js`: `getBlockIfExpired()` / `getBlockIfNotSet()` / `setBlockIfExpired(val)` / `setBlockIfNotSet(val)`; chiavi `gym_cert_block_expired` e `gym_cert_block_not_set`
- **`renderCertBlockUI()`**, **`saveCertBlockExpired(val)`**, **`saveCertBlockNotSet(val)`** in `admin.js`
- **`booking.js`**: check dopo il debito threshold — `getUserByEmail(formData.email)` + confronto `certScad < today`; toast di errore e `return` se bloccato

#### Tab Clienti — filtro e utenti senza prenotazioni

**Filtro "🏥 Senza certificato":**
- Bottone toggle nella barra di ricerca clienti (`.clients-cert-filter-btn`)
- Stato `clientCertFilter` (boolean) in `admin.js`
- `clientHasCertIssue(client)`: cert non impostato o scaduto → `true`
- `renderClientsTab()` applica il filtro con `filtered.filter(clientHasCertIssue)` quando attivo
- Funziona in combinazione con la ricerca testuale

**Utenti registrati senza prenotazioni:**
- `getAllClients()` itera ora anche `UserStorage.getAll()` dopo aver costruito la mappa dalle prenotazioni
- Gli account registrati (`gym_users`) senza prenotazioni appaiono come card con 0 prenotazioni

**Stile ricerca clienti allineato a Pagamenti:**
- `border: 2px solid #e0e0e0`, `font-size: 1rem`, focus `border-color: #ff6b6b`

**File modificati:** `js/data.js` (v13), `js/admin.js` (v18), `js/booking.js` (v6), `css/admin.css` (v11), `admin.html`, `prenotazioni.html`, `css/prenotazioni.css` (v7), bump `data.js` in tutti gli HTML

---

### 4.32 Sicurezza, XSS fix, RLS Supabase e password SHA-256 (sessione 17, mar 2026)

#### Scansione sicurezza pre-migrazione

Analisi completa del progetto prima della migrazione a Supabase. Problemi identificati e risolti:

1. **XSS** — dati utente interpolati in `innerHTML` senza escaping
2. **Link admin statico** — "Amministrazione" visibile a tutti anche prima del login
3. **Password admin in chiaro** — `admin123` hardcoded nel sorgente pubblico su GitHub
4. **Bug stat** — confronto prenotazioni usava campione filtrato per ricavo invece che per conteggio

#### XSS fix — `_escHtml()` centralizzata

- Aggiunta `_escHtml(str)` in `js/ui.js` (v1→v2): escape di `&`, `<`, `>`, `"` per uso in `innerHTML`
- Rimossa la copia locale di `_escHtml` che era solo in `admin.js` (registro)
- **`js/admin.js`**: applicato `_escHtml()` sistematicamente a tutti i dati utente interpolati in innerHTML: tab analytics, card partecipanti, schedule manager client picker, storico crediti, card debitori, storico transazioni, tab clienti, valori degli `input[value]`
- **`js/booking.js`** (v6→v7): `_escHtml(booking.name)` in `showConfirmation()`
- Aggiornato `ui.js?v=1` → `ui.js?v=2` in tutti gli HTML

#### Link Amministrazione — visibilità dinamica (poi ripristinato statico)

- **Prima modifica:** rimosso il link statico `<li><a href="admin.html">Amministrazione</a></li>` da tutti gli HTML pubblici; aggiunto in `auth.js` (`updateNavAuth()`) nel ramo `isAdmin` tramite `_injectNavLinkLast()` — visibile solo dopo login admin
- **Ripristinato su richiesta:** Thomas preferisce il link sempre visibile durante la fase di sviluppo/test → link statico rimesso in navbar desktop e sidebar di tutti gli HTML (index, chi-sono, dove-sono, login, prenotazioni)

#### Password admin SHA-256

Sostituito il controllo in chiaro `password === 'admin123'` con verifica SHA-256 via Web Crypto API. La password non è più leggibile dal sorgente pubblico su GitHub.

- **Salt:** `tb-admin-2026`
- **Hash SHA-256:** `036f86f46401f7c2c915c266c56db12210c784961d783c8efa32532fa7fb4fe5`
- **`js/admin.js`** (v19→v20): rimosso `ADMIN_PASSWORD`; aggiunta `async _checkAdminPassword(password)` con `crypto.subtle.digest('SHA-256', ...)`; `setupLogin()` diventa `async`
- **`login.html`**: stesso pattern async per il form `adminLoginForm`

#### Fix bug statistiche admin

**Problema:** il confronto "prenotazioni periodo precedente" usava `prevRevBookings` (campione filtrato per ricavo: escludeva `lezione-gratuita`) anche per il conteggio prenotazioni, producendo un delta errato.

**Fix in `js/admin.js`:** aggiunto `prevAllBookings` separato (esclude solo `cancelled`, come `filteredBookings`) usato esclusivamente per `calcChange` sul contatore prenotazioni. `prevRevBookings` resta per il confronto ricavo.

#### File RLS Supabase

Creato `supabase-rls.sql` con le policy Row Level Security per tutte le 7 tabelle del progetto:

| Tabella | Policy |
|---|---|
| `bookings` | SELECT/INSERT/UPDATE solo per `user_id = auth.uid()` |
| `users` | SELECT/INSERT/UPDATE solo per `id = auth.uid()` |
| `credits` | SELECT solo per `user_id = auth.uid()`; write riservato a service_role |
| `schedule_overrides` | SELECT pubblico (anon + authenticated); write solo service_role |
| `manual_debts` | SELECT solo per `user_id = auth.uid()`; write solo service_role |
| `push_subscriptions` | SELECT/INSERT/DELETE per `user_id = auth.uid()` |
| `settings` | SELECT pubblico; write solo service_role |

**File modificati:** `js/ui.js` (v2), `js/admin.js` (v20), `js/booking.js` (v7), `login.html`, `admin.html`, `index.html`, `chi-sono.html`, `dove-sono.html`, `prenotazioni.html`, `supabase-rls.sql` (nuovo)

---

### 4.33 Admin panel: grafici dettaglio, panel occupancy, nuovi clienti, backup e assicurazione (sessione 18, mar 2026)

#### Grafici prenotazioni — rimozione simbolo € e proiezione mese corrente

- `chart-mini.js`: `drawBarChart` ora accetta `options.prefix` (default `'€'`) e `options.suffix` (default `''`) per label assi e barre — le chiamate da tab Prenotazioni passano `prefix: ''` per eliminare il simbolo euro
- Grafico "Trend mensile" in dettaglio Prenotazioni: aggiunta barra tratteggiata rossa per il mese corrente con le prenotazioni future stimate (`data.projected[]` in `drawForecastChart`)

#### Ristrutturazione pannelli dettaglio Statistiche

- **Pannello Prenotazioni:** rimossi i widget "Prossime prenotazioni" e "Top clienti" dal pannello dettaglio
- **Pannello Clienti:** aggiunto "Top clienti", "Meno attivi", "Top annullatori" e "Più fedeli" nel pannello `renderClientiDetail`
- **Pannello Occupancy:** aggiunto `renderOccupancyDetail` con grafici trend Autonomia e Lezione di Gruppo (ultimi 12 mesi) e tasso di occupazione per giorno della settimana
  - Fix >100%: il calcolo per giorno ora conta le occorrenze reali del giorno nel periodo (`dowOccurrences`) invece di approssimare le settimane; le prenotazioni `group-class` (capacità 0) escluse dal numeratore
- **Pannello Clienti — Nuovi clienti:** aggiunta sezione con conteggio e lista nomi clienti che hanno prenotato per la prima volta nel periodo filtrato

#### Tab Clienti — filtro default 1 mese

- Il filtro transazioni nella scheda cliente ora parte dal mese (era 1 anno); il bottone "Mese" ha classe `active` al render iniziale; le righe più vecchie di 30 giorni sono nascoste via `style="display:none"` al render

#### Popup debiti — sfondo rosso per prenotazioni passate non pagate

- `.debt-popup-item--past { background: #fff1f2; border-radius: 6px }` in `admin.css` — applicato alle voci del popup debiti dove `bookingHasPassed(b)` è vero

#### Badge "Segna pagato" nascosto se già presente "Da pagare"

- In `_buildParticipantCard`: il badge "⊕ Segna pagato" non viene renderizzato se `hasDebts === true` (il popup "Da pagare" è già visibile e cliccabile — duplicato inutile)

#### Certificato medico — mini modal e fix salvataggio

- Sostituito editing inline con mini modal (`certModalOverlay` / `certModal`) identico al popup debiti: header con nome cliente, date picker, Annulla/Salva
- Badge rinominato "Imposta scadenza Cert. Med" (più corto)
- Badge cliccabile (`cert-expired-badge--clickable`) con `cursor: pointer` e `hover` opacity
- `openCertModal` / `closeCertModal` / `saveCertDate` in `admin.js`
- **Fix salvataggio su ricarica:** `saveCertDate` usa `_findUserIdx(users, email, whatsapp)` che cerca prima per email poi per telefono normalizzato (E.164); se il cliente non esiste in `gym_users` viene creato un record minimo — la data non scompariva più dopo reload
- Il badge si aggiorna in-place dopo il salvataggio (senza re-render della scheda)
- Stessa data viene aggiornata anche nella sessione corrente se l'utente è loggato

#### Fix filtri e aggiornamento pannello dettaglio

- `updateBookingsTable`: aggiunto null guard `if (!tbody) return` — evitava crash quando il tab Prenotazioni non era attivo e `bookingsTableBody` era `null`, che bloccava l'aggiornamento del pannello dettaglio al cambio filtro

#### Backup & Ripristino JSON completo

- Nuova sezione "💾 Backup & Ripristino" in **Admin → Impostazioni**
- `exportBackup()`: serializza tutte le 15 chiavi localStorage in un file `.json` con timestamp
- `importBackup(input)`: legge il file, chiede conferma, ripristina tutte le chiavi, ricarica la pagina
- `BACKUP_KEYS`: array con tutte le chiavi incluse `gym_cert_block_expired`, `gym_cert_block_not_set`

#### Scadenza assicurazione — gestione completa come certificato medico

Aggiunto un secondo campo data "Scadenza assicurazione" (`assicurazioneScadenza`) gestito esattamente come il certificato medico:

**js/data.js:**
- `AssicBookingStorage`: chiavi `gym_assic_block_expired` / `gym_assic_block_not_set`

**js/auth.js:**
- `updateUserProfile`: salva `assicurazioneScadenza` con storico `assicurazioneHistory`

**js/admin.js:**
- `_buildParticipantCard`: badge 📋 per assicurazione (arancione se non impostata, rosso se scaduta, giallo se ≤30 giorni)
- `openAssicModal` / `closeAssicModal` / `saveAssicDate`: mini modal identico al cert, badge aggiornato in-place
- Card cliente: badge inline `assicDisplay` (accanto al cert), campo `Assicurazione` nel form "Modifica contatto"
- `saveClientEdit`: salva `assicurazioneScadenza` con storico
- `renderAssicBlockUI` / `saveAssicBlockExpired` / `saveAssicBlockNotSet`: toggle impostazioni
- `BACKUP_KEYS`: aggiunte `gym_assic_block_expired`, `gym_assic_block_not_set`

**admin.html:**
- Modal `assicModal` (clone di certModal)
- Sezione "🚫 Blocco prenotazioni per assicurazione" con 2 toggle in Impostazioni

**js/booking.js:**
- Blocco prenotazione se assicurazione scaduta o non impostata (toggle rispettivi attivi)

**prenotazioni.html:**
- Campo "Scadenza assicurazione" `disabled` nel modal "Modifica profilo" — visibile ma non modificabile dal cliente (solo il trainer può modificarla)
- Nessun banner di warning visibile nella pagina principale (a differenza del certificato medico)

---

### 4.28 Logica annullamento unificata a 24h e fix rimborso (sessione 13, mar 2026)

**Nuova soglia unica per tutti i tipi di prenotazione:**

La precedente logica con soglie diverse per tipo (3 giorni per Slot prenotato, 3 ore per Lezione di Gruppo/Autonomia) è stata sostituita da una soglia unica a 24h:

| Tempo alla lezione | Comportamento |
|---|---|
| > 24h | "Annulla prenotazione" → annullamento diretto (group-class converte lo slot in Lezione di Gruppo) |
| ≤ 24h e > 2h | "Richiedi annullamento" → condizionale: il posto deve essere preso da un altro cliente |
| ≤ 2h | 🔒 Bloccato (coerente con `processPendingCancellations`) |

- Separazione netta in `prenotazioni.html`: `cancelDirect(id)` per il flusso diretto e `requestCancellation(id)` per il flusso condizionale
- Rimosso il branching per tipo slot dal render del bottone: ora unica logica `_canCancelDirect` / `_canRequestCancel`

**Fix rimborso credito su annullamento diretto (bug pre-esistente):**

- **Problema:** `cancelDirectly()` e `cancelAndConvertSlot()` non azzeravano i campi di pagamento né accreditavano il rimborso — la prenotazione veniva annullata ma il credito del cliente restava invariato
- **Root cause:** il rimborso automatico era implementato solo in `fulfillPendingCancellations` (flusso sostituzione cliente), non nei metodi di cancellazione diretta; il bug era già presente nel vecchio flusso group-class (> 3 giorni prima)
- **Fix:** entrambi i metodi ora applicano la stessa logica di `fulfillPendingCancellations`: reset di `paid`, `paymentMethod`, `paidAt`, `creditApplied`; salvataggio di `cancelledPaymentMethod` e `cancelledPaidAt` per lo storico; `CreditStorage.addCredit` con il prezzo pieno e `hiddenRefund=true`

**File modificati:** `js/data.js`, `prenotazioni.html`

---

### 4.34 Migrazione Supabase Auth — js/auth.js riscritto (sessione 19, mar 2026)

#### Obiettivo

Sostituire il vecchio sistema `localStorage` (`gym_users`, `currentUser`) con **Supabase Auth** reale: sessioni gestite lato server, token JWT, email di conferma, reset password nativi.

#### Riscrittura completa di `js/auth.js`

**Cache in memoria:**
- `window._currentUser = null` — popolato da `initAuth()` all'avvio di ogni pagina; rimane valido per tutta la navigazione grazie al token Supabase in localStorage

**Funzioni principali:**
- `initAuth()` — async; chiama `supabaseClient.auth.getSession()`, carica il profilo da `profiles`, registra `onAuthStateChange` listener per login/logout in altre tab. Chiamata su **ogni pagina**.
- `_loadProfile(userId)` — query su `profiles` per id; popola `window._currentUser`
- `getCurrentUser()` — sync; restituisce `window._currentUser` (compatibile con tutto il codice esistente)
- `registerUser(name, email, whatsapp, password)` — `signUp` con `user_metadata: { full_name, whatsapp }`; ritorna `{ ok: true }` immediatamente (il trigger crea il profilo lato server)
- `loginWithPassword(email, password)` — `signInWithPassword` + `_loadProfile`
- `logoutUser()` — `signOut` + rimozione `adminAuthenticated` da localStorage
- `updateUserProfile(currentEmail, updates, newPassword)` — aggiorna `profiles` su Supabase; gestisce `medical_cert_history` e `insurance_history` come array jsonb; aggiorna email/password su Supabase Auth se modificate
- `getUserByEmail(email)` — query async su `profiles`
- `getUserBookings()` — ancora su localStorage (migrazione Fase 3)

**Versione:** `auth.js?v=10`

#### Migrazioni SQL applicate su Supabase cloud

Tutti e 4 i file applicati manualmente via Supabase SQL Editor:

| File | Contenuto |
|---|---|
| `20260225000000_init.sql` | Tabelle base: bookings, schedule_overrides, credits, credit_history. Reso idempotente con `CREATE TABLE IF NOT EXISTS` |
| `20260227000000_profiles_and_transactions.sql` | Tabella `profiles`, colonne aggiuntive bookings/credits, trigger `link_anonymous_on_register`, RPC `apply_credits_to_bookings` |
| `20260308000000_assicurazione_and_missing_tables.sql` | Colonne assicurazione su profiles, tabelle settings/manual_debts/bonuses/push_subscriptions, colonne extra su bookings, RPC get_or_reset_bonus / get_unpaid_past_debt |
| `20260308100000_profile_trigger.sql` | Trigger `handle_new_user` su `auth.users`: crea profilo in `profiles` automaticamente con SECURITY DEFINER, passando nome/whatsapp da `user_metadata` |

**Problema risolto:** `CREATE POLICY IF NOT EXISTS` è solo PostgreSQL 17 — Supabase hosted usa PG15. Soluzione: pattern `DROP POLICY IF EXISTS` + `CREATE POLICY` in tutti i file.

#### RLS aggiornato (`supabase-rls.sql`)

Policy idempotenti per tutte le 7 tabelle usando `DROP POLICY IF EXISTS` + `CREATE POLICY`:
- `bookings`: select/insert pubblico (anon) + select/insert/update per `user_id = auth.uid()`
- `profiles`: select/insert/update per `id = auth.uid()`
- `credits`, `manual_debts`: select per `user_id = auth.uid()`
- `schedule_overrides`, `settings`: select pubblico (anon + authenticated)
- `push_subscriptions`: insert/select/delete per `user_id = auth.uid()`

#### Fix integrazione pagine

**`login.html`:**
- Tutti i form handler sono `async`
- Login: `await loginWithPassword(email, password)`
- Registrazione: `await registerUser(...)` → mostra messaggio "📧 Controlla la tua email!" invece di redirect
- OAuth callback: `handleOAuthReturn()` async; upsert profilo su Supabase invece di localStorage
- Init: `initAuth().then(async session => { ...; if (!isOAuth && session && getCurrentUser()) redirect })` — condizione `getCurrentUser()` necessaria per evitare loop redirect quando la sessione esiste ma il profilo non è ancora stato creato
- try/catch nel handler registrazione per evitare bottone bloccato su eccezioni

**Tutte le pagine aggiornate:**
- `index.html`, `prenotazioni.html`, `admin.html`: Supabase SDK + `supabase-client.js` + `auth.js?v=10` + `initAuth()` già aggiunti nelle sessioni precedenti
- `chi-sono.html`, `dove-sono.html`: aggiunti Supabase SDK + `supabase-client.js` + `auth.js?v=10` + `initAuth()` (mancavano — mostravano sempre "Accedi")
- `admin.html`: aggiunto `initAuth()` — mostrava "Accedi" agli utenti loggati

#### Fix bug risolti durante la sessione

| Bug | Causa | Fix |
|---|---|---|
| "relation bookings already exists" | Tabelle già create da migrazione parziale | `CREATE TABLE IF NOT EXISTS` su tutti i migration |
| "syntax error at or near 'not'" | `CREATE POLICY IF NOT EXISTS` non supportato su PG15 | Pattern `DROP POLICY IF EXISTS` + `CREATE POLICY` |
| Profilo non creato dopo registrazione | RLS bloccava INSERT da client (sessione non ancora stabile) | Trigger `handle_new_user` con SECURITY DEFINER bypassa RLS |
| Loop redirect login ↔ index | Sessione esisteva ma profilo no → redirect a index → no profilo → "Accedi" → login → loop | Condizione `session && getCurrentUser()` prima del redirect |
| "Registrazione in corso..." bloccato | `registerUser` aspettava 500ms + `_loadProfile` + upsert fallback → possibile hang | Semplificato: `signUp` → ritorna `{ ok: true }` subito; trigger gestisce il profilo |
| "Accedi" su chi-sono/dove-sono | Mancavano Supabase SDK e `initAuth()` | Aggiunti in entrambe le pagine |
| "Accedi" su admin.html | Mancava `initAuth()` | Aggiunto |

#### Email transazionale — Brevo SMTP

- **Provider:** Brevo (ex Sendinblue) — account già esistente
- **Dominio mittente:** `thomasbresciani.com` — autenticato in Brevo (DKIM + SPF)
- **Sender:** `noreply@thomasbresciani.com` / `Thomas Bresciani`
- **SMTP Supabase:** Settings → Authentication → SMTP: `smtp-relay.brevo.com:587`, username = email login Brevo, password = SMTP key Brevo
- **Email di conferma** alla registrazione: Supabase invia automaticamente il link; dopo il click l'utente viene loggato e redirectato a `index.html`
- **Email conferma abilitata:** Authentication → Email → "Enable email confirmations" ✅

#### File modificati

`js/auth.js` (v10), `login.html`, `chi-sono.html`, `dove-sono.html`, `admin.html`, `index.html`, `prenotazioni.html`, `supabase-rls.sql`, `supabase/migrations/20260308000000_assicurazione_and_missing_tables.sql` (nuovo), `supabase/migrations/20260308100000_profile_trigger.sql` (nuovo)

---

### 4.35 Migrazione dati Supabase — dual-write + sync (sessione 20, mar 2026)

Vedi `MIGRAZIONE.md` per il dettaglio completo. In sintesi:

- **Tabella `bookings`**: dual-write con colonna `local_id TEXT` (ID localStorage); sync on page load via `BookingStorage.syncFromSupabase()`; smart diff in `replaceAllBookings()` per aggiornare solo i booking cambiati
- **Tabella `app_settings`**: dual-write per schedule overrides, crediti, debiti manuali, bonus, e tutte le impostazioni globali; sync consolidata in `BookingStorage.syncAppSettingsFromSupabase()` (1 query per tutto)
- **`js/auth.js` v12**: `updateUserProfile()` sincronizza `medical_cert_expiry` → `gym_users` localStorage
- **`js/admin.js` v53**: aggiunte `_getUsersFull()`, `_saveUsers()`, `_getUserRecord()` per leggere/scrivere raw `gym_users` con tutti i campi cert; ripristinata `_saveUsers` (era stata rimossa); risolti bug notifiche cert sempre rosse
- **`prenotazioni.html`**: `renderCertWarning()` ora legge `user.medical_cert_expiry` direttamente da `getCurrentUser()`

#### Bug risolti sessione 20

| Bug | Causa | Fix |
|---|---|---|
| Notifiche cert non sparivano su prenotazioni.html | `getUserByEmail()` diventata async → ritornava Promise → cert sempre `undefined` | Letto `user.medical_cert_expiry` da `getCurrentUser()` |
| Badge cert sempre rosso in admin | `UserStorage.getAll()` strippava i campi cert; `getUserByEmail()` async usata sync | Aggiunta `_getUserRecord()` che legge raw `gym_users` |
| `saveCertDate()`/`saveAssicDate()` crasha | `_saveUsers` rimossa ma ancora chiamata | Ripristinate `_getUsersFull()` e `_saveUsers()` |
| Cert impostata dall'utente non vista dall'admin | Nessun sync Supabase → `gym_users` localStorage | `updateUserProfile()` ora aggiorna anche `gym_users` |

**File modificati:** `js/auth.js` (v12), `js/admin.js` (v53), `prenotazioni.html`, `admin.html`, `index.html`, `MIGRAZIONE.md` (nuovo)

---

### 4.36 Push notification complete, admin booking a nome cliente, fix extra slot (sessioni 21–22, mar 2026)

#### Push notification — infrastruttura completa

**Edge Function `send-reminders` (Supabase Deno):**
- Cron ogni 5 minuti via pg_cron
- Invia promemoria **25h prima** (non 24h — finestra ±12 min) e **1h prima** della lezione
- Segna `reminder_24h_sent` / `reminder_1h_sent` su `bookings` per non inviare duplicati
- `parseStartMin()` + `targetItaly()` per calcolo orario in fuso Europe/Rome

**Edge Function `notify-slot-available` (Supabase Deno):**
- Chiamata dal client quando un utente annulla una prenotazione
- Invia push notification **solo se lo slot era pieno** prima dell'annullamento
- Esclude dalla notifica sia chi ha annullato sia gli utenti già prenotati nello stesso slot
- Controllo lato client (`wasFullBeforeCancellation`) + esclusione lato Edge Function (query `push_subscriptions`)

**Banner push non dismissable (`js/push.js` v10):**
- Redesignato: card scura 400px, bottone `#00AEEF`
- Rimosso il bottone ✕ e il flag `push_prompt_dismissed` — il banner ricompare finché l'utente non concede o nega
- Spostato da `prenotazioni.html` a `index.html` (calendario): appare 1.5s dopo il login

**PWA rinominata "Palestra":**
- `manifest.json`: `name` e `short_name` → `"Palestra"` (usato come mittente nelle push notification)
- Tutti gli HTML: `apple-mobile-web-app-title` → `"Palestra"`

**RPC `admin_delete_booking` (nuova migration):**
- `supabase/migrations/20260309200000_admin_delete_booking.sql`
- SECURITY DEFINER: bypassa RLS per consentire all'admin di eliminare fisicamente un booking da Supabase
- `admin.js`: `deleteBookingFromClients` ora chiama la RPC dopo lo splice locale — i booking eliminati non ricompaiono al refresh

#### Admin — prenotazione a nome di un cliente

**Bottone "Persona" nel picker extra slot (`admin.js`):**
- Aggiunto accanto ad Autonomia/Lezione di Gruppo nel pannello extra-picker
- Campo di ricerca autocomplete: mostra i clienti **solo quando si inizia a digitare**
- Usa `_clientPickerState` (oggetto globale) invece di `JSON.stringify` in inline handler — evita `SyntaxError: Unexpected end of input`
- `bookForClient(date, time, slotType)`: controlla `getRemainingSpots` prima di aggiungere un posto extra; aggiunge il posto extra **solo se lo slot è già pieno**

**`BookingStorage.saveBookingForClient(booking, clientUserId, onResult)` (`js/data.js`):**
- Variante di `saveBooking` per prenotazioni fatte dall'admin a nome di un cliente
- Usa `clientUserId` (non l'admin) come `user_id` nel record Supabase → i promemoria push arrivano al cliente

#### Fix bug

**`BookingStorage.removeExtraSpot` (`js/data.js`):**
- Bug: `const base = SLOT_MAX_CAPACITY[extraType] || 0` restituiva 5 per `small-group` anche quando era un extra su uno slot `personal-training` → la rimozione veniva erroneamente permessa anche con prenotazioni attive
- Fix: `const isMainType = slot.type === extraType; const base = isMainType ? (...) : 0` — coerente con `getEffectiveCapacity`

**`initAuth` race condition PWA (`js/auth.js` v14):**
- Bug: `getSession()` poteva restituire `null` mentre Supabase stava aggiornando il token (PWA che si sveglia dal background) → `updateNavAuth()` con utente null → profilo scompare dalla navbar → riappare dopo 1-2s (TOKEN_REFRESHED)
- Fix: sostituito `getSession()` con evento `INITIAL_SESSION` da `onAuthStateChange` — risolve solo dopo che il token refresh è completato
- `_loadProfile` non nullifica `_currentUser` su errore di rete — fallback minimo da dati sessione
- `_authListenerActive`: il listener persistente viene registrato una sola volta (evita duplicati su bfcache restore)

**File modificati:** `js/auth.js` (v14), `js/admin.js`, `js/data.js`, `js/push.js` (v10), `manifest.json`, `index.html`, `prenotazioni.html`, `admin.html`, `chi-sono.html`, `dove-sono.html`, `login.html`, `supabase/functions/send-reminders/index.ts`, `supabase/functions/notify-slot-available/index.ts`, `supabase/migrations/20260309200000_admin_delete_booking.sql` (nuovo)

---

### 4.37 Operazioni atomiche server-side — eliminazione race conditions (sessione 25, mar 2026)

#### Problema risolto

Con il dual-write localStorage+Supabase, operazioni multi-step come "aggiungi credito + auto-paga prenotazioni + compensa debito" venivano eseguite lato client come 3–6 chiamate async separate. Se la rete interrompeva la sequenza a metà, i dati in Supabase rimanevano in stato inconsistente (es. credito aggiunto ma prenotazione non segnata come pagata). Race condition aggiuntive: più chiamate `addCredit()` in rapida successione inviavano upsert concorrenti al DB con valori di `balance` diversi — l'ultima a arrivare vinceva indipendentemente dall'ordine corretto.

#### Fix sincronizzazione PWA dopo "Elimina Tutti i Dati"

**Problema:** dopo che l'admin premeva 🗑️ Elimina Tutti i Dati, la PWA (su telefono) mostrava ancora prenotazioni e transazioni anche dopo il refresh.

**Root cause:** `syncAppSettingsFromSupabase()` confrontava `cleared_at` ma poi cancellava solo `gym_bookings` da localStorage — lasciando intatti `gym_credits`, `gym_manual_debts`, `gym_bonuses`, `scheduleOverrides`. Le condizioni di sync dei crediti avevano un filtro `.length` che impediva il ripristino su array vuoto.

**Fix:** cancellazione di TUTTE le chiavi localStorage rilevanti al rilevamento del clear remoto; rimosso il filtro `?.length` sulle condizioni di sync.

**RPC `admin_clear_all_data`:** sostituisce i 6 DELETE client-side con un'unica chiamata server-side atomica. Fix "DELETE requires a WHERE clause": aggiunti `WHERE true` a ogni DELETE.

#### Realtime balance su prenotazioni.html

Aggiunti canali Supabase Realtime per `credits`, `credit_history`, `manual_debts`, `bonuses`: quando l'admin aggiunge un credito da PC, la PWA aggiorna saldo e transazioni in tempo reale senza refresh.

#### Operazioni atomiche — 12 RPC PostgreSQL

| RPC | Sostituisce | Operazioni atomiche |
|---|---|---|
| `admin_clear_all_data` | 6 DELETE client-side | Cancella tutte le tabelle operative in una transazione |
| `admin_add_credit` | `addCredit` + `applyToUnpaidBookings` + debt offset | Upsert credits + credit_history + mark bookings paid FIFO + offset manual_debts |
| `admin_pay_bookings` | `paySelectedDebts` (credit ops) | Mark bookings paid + salda debito manuale + acconto credito + auto-pay altri booking |
| `apply_credit_on_booking` | Credit block in booking.js | Applica credito su nuova prenotazione: full/partial, free_balance priority, FIFO auto-pay |
| `admin_change_payment_method` | `saveBookingRowEdit` (8 casi) | Tutti i casi cambio pagamento: rimborso credito, addebito, hide vecchie voci storico |
| `admin_add_debt` | `ManualDebtStorage.addDebt()` fire-and-forget | Upsert manual_debts + append history JSONB, con error surfacing |
| `admin_delete_debt_entry` | `ManualDebtStorage.deleteDebtEntry()` | Rimuove voce history + ricalcola balance, elimina riga se vuota |
| `admin_delete_booking_with_refund` | `deleteBookingFromClients` multi-step | DELETE booking + rimborso credito atomici |
| `fulfill_pending_cancellation` | `fulfillPendingCancellations` client-side | FIFO cancel pending + rimborso credito (user-side, non admin) |
| `admin_rename_client` | `saveClientEdit` cross-table updates | UPDATE bookings+credits+manual_debts atomico |
| `cancel_booking_with_refund` (estesa) | `cancelWithPenalty` + mora debito | Aggiunto `p_mora_debt_amount` per addebito mora atomico |

Ogni RPC usa `SECURITY DEFINER` per bypassare RLS + `FOR UPDATE` per lock di riga anti-race-condition.

#### Schema aggiornato: `credit_history`

Aggiunte 3 colonne:
- `booking_ref UUID` — collega una voce storico alla prenotazione specifica (usato da `admin_change_payment_method` per nascondere voci obsolete)
- `hidden BOOLEAN DEFAULT false` — voci "nascoste" (es. pagamento contanti poi cambiato a credito) escluse dal sync e dalla UI
- `display_amount NUMERIC(10,2)` — importo visuale per voci informative (amount=0, es. "Contanti ricevuto €35")

`CreditStorage.syncFromSupabase()` aggiornato: filtra `hidden=true`, mappa `display_amount` → `displayAmount`.

#### Principio architetturale adottato

Come nelle app di produzione (Stripe, Shopify, ecc.): il client non conosce lo stato finale — invia un'intention (RPC) e il server esegue tutto atomicamente, poi il client risincronizza dal server. Zero race conditions, zero stati parziali se il browser si chiude a metà operazione.

**Debounce `CreditStorage._save()`:** per le operazioni ancora client-side (es. reconciliazione dashboard), un debounce 200ms collassa upsert multipli rapidi in uno solo — il balance scritto è sempre quello finale e corretto.

#### File modificati

`supabase/migrations/20260310800000_admin_clear_all_data.sql` (nuovo)
`supabase/migrations/20260310900000_admin_add_credit.sql` (nuovo)
`supabase/migrations/20260311000000_credit_history_extra_cols.sql` (nuovo)
`supabase/migrations/20260311100000_admin_pay_bookings.sql` (nuovo)
`supabase/migrations/20260311200000_apply_credit_on_booking.sql` (nuovo)
`supabase/migrations/20260311300000_admin_change_payment_method.sql` (nuovo)
`supabase/migrations/20260311400000_admin_add_debt.sql` (nuovo)
`supabase/migrations/20260311500000_admin_delete_debt_entry.sql` (nuovo)
`supabase/migrations/20260311600000_admin_delete_booking_with_refund.sql` (nuovo)
`supabase/migrations/20260311700000_fulfill_pending_cancellation.sql` (nuovo)
`supabase/migrations/20260311800000_admin_rename_client.sql` (nuovo)
`supabase/migrations/20260311900000_cancel_with_penalty_debt.sql` (nuovo — estende cancel_booking_with_refund)
`js/admin.js` — `saveManualEntry` (debt+credit), `paySelectedDebts`, `saveBookingRowEdit`, `deleteManualDebtEntry`, `deleteBookingFromClients`, `saveClientEdit` → tutti RPC + sync
`js/booking.js` — credit block → `apply_credit_on_booking` RPC; fulfillPendingCancellations → `fulfill_pending_cancellation` RPC
`js/data.js` — `CreditStorage._save` (debounce 200ms), `syncFromSupabase` (hidden+display_amount), `syncAppSettingsFromSupabase` (clear all LS keys)
`prenotazioni.html` — Realtime channels + `cancelWithPenalty` → `cancel_booking_with_refund` RPC con mora atomica
`sw.js` — bump cache v10

---

### 4.38 Production hardening — audit sicurezza e atomicità (sessione 26, mar 2026)

Audit completo del sistema pre-produzione: identificate e risolte 18 issue in 4 fasi di priorità.

#### Fase 1 — Critici (migration `20260312000000`)
1. `cancel_booking_with_refund` mancava `FOR UPDATE` → race condition doppio rimborso
2. `fulfill_pending_cancellation` accessibile da `anon` → chiunque poteva cancellare booking altrui
3. `bookings_public_insert` RLS troppo permissiva → INSERT diretto bypassava `book_slot_atomic`
4. Manca validazione input nelle RPC admin (email, importo)
5. `admin_rename_client` mancava `FOR UPDATE` → race condition

#### Fase 2 — Alti (JS fixes)
6. Debounced Supabase writes perdono dati alla chiusura tab → aggiunto `beforeunload` flush con `fetch keepalive`
7. Fallback INSERT se `book_slot_atomic` non esiste → rimosso fallback, errore esplicito

#### Fase 3 — Medi (JS + migration `20260312100000`)
8. Admin session bypass via DevTools → `checkAuth()` hardened con check JWT
9. Schedule overrides DELETE+INSERT race condition → sostituito con UPSERT + delete selettiva
10. Credit history IIFE non awaited → estratto in `_insertCreditHistory()` async
11. Optimistic locking → colonna `updated_at` + trigger + check `stale_data` in `admin_update_booking`
12. Sync fallisce silenziosamente → aggiunto `showToast()` su errore
13. OAuth redirect hardcoded → `window.location.origin`

#### Fase 4 — Bassi (migration `20260312200000`)
14. Missing indexes → `credit_history(credit_id, created_at)` + `bookings(email, status)` partial
15. JSONB history unbounded → CHECK `jsonb_array_length(history) <= 500`
16. Audit trail admin → tabella `admin_audit_log` + trigger + helper `_audit_log()`
17. CSP headers → meta tag su tutte le 6 pagine HTML
18. FK credits ON DELETE CASCADE → cambiato a ON DELETE SET NULL

Tracker completo in `OPUS.md`.

#### File modificati/creati
`supabase/migrations/20260312000000_production_hardening.sql` (nuovo)
`supabase/migrations/20260312100000_optimistic_locking.sql` (nuovo)
`supabase/migrations/20260312200000_phase4_post_launch.sql` (nuovo)
`OPUS.md` (nuovo — tracker delle 18 issue)
`js/data.js` — rimosso fallback INSERT, beforeunload flush, UPSERT schedule, sync toast, updatedAt mapping
`js/admin.js` — checkAuth hardened
`login.html` — OAuth redirect dinamico
Tutte le 6 pagine HTML — CSP meta tag

---

### 4.39 Fix clearAllData + registro transazioni (sessione 27, mar 2026)

#### clearAllData — 4 bug che facevano riapparire dati dopo il clear
1. **Race condition Realtime:** canali postgres_changes facevano `syncFromSupabase()` durante il clear → `removeAllChannels()` prima della RPC
2. **Ordine sbagliato:** localStorage svuotato PRIMA di Supabase → invertito: prima Supabase (await), poi localStorage
3. **scheduleOverrides non svuotato:** condizione `overridesData?.length` è falsy su array vuoto → rimossa
4. **Cache PWA non svuotata:** aggiunto `caches.keys()` + `caches.delete()` prima del reload

#### Registro transazioni — mora e bonus
- **Mora trattenuta:** quando un booking pagato viene annullato con penalità 50%, il registro ora mostra sia il rimborso parziale (+5€) sia la mora trattenuta (-5€) come evento `cancellation_mora`
- **Bonus utilizzato:** nuovo evento `bonus_used` nel registro con icona 🎟️, label e filtro
- Fix: `deleteBooking` (admin) ora setta correttamente `cancelledWithBonus` quando usa il bonus

#### CSP fix
- Aggiunto `wss://*.supabase.co` al `connect-src` CSP su tutte le 6 pagine (Supabase Realtime usa WebSocket)

#### 8 bug critici per produzione

| # | Bug | Fix |
|---|-----|-----|
| 1 | **Booking fantasma:** RPC `book_slot_atomic` fallisce ma utente vede conferma | `saveBooking` ora è `async`, attende RPC prima di conferma; errore specifico per slot pieno vs errore rete |
| 2 | **Doppio click:** due prenotazioni create | Bottone disabilitato al primo click, riabilitato dopo |
| 3 | **Crediti fire-and-forget:** errore Supabase ignorato | Toast "Errore salvataggio" visibile su failure di credits/debts/bonus |
| 4 | **Debito riappare:** `deleteDebtEntry()` non cancella da Supabase | Aggiunto DELETE esplicito su Supabase quando record svuotato |
| 5 | **Booking offline:** conferma senza dire nulla | "Sei offline" se rete assente; "Salvato localmente" se no Supabase |
| 6 | **Admin stale data:** localStorage sbagliato dopo reject | Rollback automatico via `syncFromSupabase()` + re-render vista admin |
| 7 | **Sync fallita:** dati stale per sempre | Retry automatico dopo 5 secondi (max 1 tentativo) |
| 8 | **Certificato scaduto:** toast tardivo | Blocco inline nel modal booking, form nascosto, messaggio visibile |

#### Cambio architetturale: `saveBooking` / `saveBookingForClient`
Entrambi i metodi passati da fire-and-forget (`.then()` callback) ad `async/await`. Il booking viene aggiunto al localStorage **solo dopo** conferma server. In caso di fallimento RPC, il booking non viene creato localmente. Return type cambiato da `booking` a `{ ok, error, booking, offline }`.

#### File modificati
`js/data.js` — `saveBooking` async, `saveBookingForClient` async, toast su _save errors, `deleteDebtEntry` Supabase sync, stale_data rollback, sync retry
`js/booking.js` — doppio click prevention, await saveBooking, errori specifici, offline detection, cert/assic blocco inline nel modal
`js/admin.js` — clearAllData riscritta, mora/bonus nel registro, bookForClient await
`sw.js` — bump cache v10→v13

---

### 4.40 Hardening localStorage + Realtime fix (sessione 28, mar 2026)

#### localStorage — protezione quota e dati corrotti

| # | Problema | Fix |
|---|----------|-----|
| 1 | 29 chiamate `localStorage.setItem` senza protezione quota | Sostituite tutte con `_lsSet()` che gestisce `QuotaExceededError` + mostra toast utente |
| 2 | `JSON.parse` senza try-catch in `getAllBookings`, `getWeeklySchedule`, `_ensureWeekOverrides` | Aggiunto helper `_lsGetJSON(key, fallback)` con protezione errori |
| 3 | Credit history cresce senza limiti → rischio superare 5MB | `CreditStorage._pruneHistory()` — max 60 voci per cliente in localStorage; storico completo resta su Supabase |
| 4 | Dati visibili tra utenti diversi sullo stesso device | `logoutUser()` ora pulisce tutte le chiavi dati sensibili (gym_bookings, gym_credits, gym_manual_debts, gym_bonus, gym_registered_users) |
| 5 | `_lsSet` non avvisava l'utente su errore | Toast "Memoria locale piena" su QuotaExceededError |

#### processPendingCancellations — fix chiamate da pagine non-admin
- Rimosso da `prenotazioni.html` (DOMContentLoaded + polling 30s) e `calendar.js` (renderCalendar)
- Il problema: `processPendingCancellations()` usa `replaceAllBookings()` → `admin_update_booking` RPC che richiede `is_admin()`. Per utenti normali la RPC falliva silenziosamente → localStorage diceva "confirmed" ma Supabase restava "cancellation_requested"
- pg_cron server-side (ogni 15 min) è la fonte autorevole; le chiamate restano solo in admin.js

#### selectSlotClient — fix post-refactoring async
- `selectSlotClient` (admin.js) non era stato aggiornato dopo che `saveBooking` è diventato async → restituiva una Promise invece del booking
- Reso `async` con `await BookingStorage.saveBooking(booking)` + error handling + toast errore

#### auth.js — memory leak + navbar admin
- **Memory leak:** listener `onAuthStateChange` non unsubscribed quando il timeout di 4s scattava prima di `INITIAL_SESSION` → aggiunto `subscription.unsubscribe()` nel timeout
- **Navbar admin:** utente admin loggato non vedeva "Amministrazione" nella navbar perché `updateNavAuth()` aveva branch separati per `user` e `isAdmin` → unificati: se admin, mostra sia "Le mie prenotazioni" che "Amministrazione"
- **Click sul nome:** ora va sempre a `prenotazioni.html` (prima andava a admin.html per admin)
- **Link duplicato su admin.html:** i link statici in admin.html avevano classe `nav-admin-link` → `_injectNavLinkLast` li rileva e non duplica; link dinamici marcati con `data-nav-dynamic` per il cleanup

#### Realtime — saldi credito/debito/bonus non aggiornati correttamente
- **Problema:** ogni tabella Realtime (bookings, credits, manual_debts, bonuses) aveva un handler separato che sincronizzava solo i propri dati. Quando un'operazione admin modificava più tabelle (es. credito + booking), gli eventi arrivavano in ordine sparso e i render intermedi usavano dati parzialmente aggiornati
- **Fix:** un unico canale Realtime `preno-rt` con handler `_debouncedFullSync` (300ms) che sincronizza TUTTO (bookings + credits + debts + bonuses/settings) e poi fa un singolo render completo. Il debounce collassa gli eventi ravvicinati in un'unica sync

#### File modificati
`js/data.js` — `_lsSet` con toast, `_lsGetJSON` helper, tutte le localStorage.setItem → _lsSet, `CreditStorage._pruneHistory`, commenti aggiornati
`js/auth.js` — logout cleanup, navbar unificata user+admin, click nome → prenotazioni, subscription unsubscribe timeout, `data-nav-dynamic` su link iniettati
`js/calendar.js` — rimosso `processPendingCancellations()`
`js/admin.js` — `selectSlotClient` async
`admin.html` — classe `nav-admin-link` su link statici
`prenotazioni.html` — rimosso `processPendingCancellations()`, Realtime debounced full-sync
`sw.js` — bump cache v13→v18

---

### 4.41 Fix crediti invisibili agli utenti + calendario desktop Lun-Dom (sessione 29, mar 2026)

#### Bug critico: crediti non visibili agli utenti normali

**Problema:** quando l'admin aggiungeva crediti a un utente, il saldo restava a €0,00 nella pagina "Le mie prenotazioni" dell'utente. L'admin vedeva tutto correttamente sia in admin.html che in prenotazioni.html.

**Causa (doppia):**
1. **RLS policy mancante**: le tabelle `credits` e `credit_history` avevano RLS abilitato ma l'unica policy era `credits_admin_all` / `credit_history_admin_all` (solo `is_admin()`). Gli utenti normali facevano la query Supabase e ricevevano 0 righe silenziosamente. Il codice JS (`CreditStorage.syncFromSupabase()` in data.js:1438) usciva con `if (!creditsData?.length) return;` senza errori.
2. **`user_id` NULL nei record credits**: l'upsert in `CreditStorage._save()` (data.js:1411-1417) non includeva `user_id`. Il trigger `link_anonymous_on_register` popolava `user_id` solo alla creazione del profilo, ma i crediti aggiunti dopo la registrazione restavano con `user_id = NULL`. Anche con la policy `user_id = auth.uid()`, nessun record matchava.

**Nota:** le tabelle `manual_debts` e `bonuses` non avevano questo problema perché avevano già policy `_select_own` (`user_id = auth.uid()`) definite nella migration `20260308000000`.

**Fix — migration `20260312500000_credits_user_read_policy.sql`:**

| # | Azione | Dettaglio |
|---|--------|----------|
| 1 | Policy `credits_select_own` | `on credits for select to authenticated using (user_id = auth.uid())` |
| 2 | Policy `credit_history_select_own` | `on credit_history for select to authenticated using (exists (select 1 from credits where credits.id = credit_history.credit_id and credits.user_id = auth.uid()))` |
| 3 | Trigger `credits_auto_link_user` | `before insert or update on credits` — se `user_id` è NULL, lo risolve automaticamente da `profiles.email`. Così l'upsert dell'admin (che non passa user_id) funziona sempre |
| 4 | Update record esistenti | `update credits c set user_id = p.id from profiles p where c.email = p.email and c.user_id is null` |

#### Calendario desktop Lun-Dom

- Il calendario desktop ora mostra 7 giorni da Lunedì a Domenica invece di Lunedì a Venerdì

#### File modificati
`supabase/migrations/20260312500000_credits_user_read_policy.sql` — nuova migration (policy SELECT + trigger auto_link_credit_user_id + update record esistenti)

---

### 4.42 Viewer emergency mode, auto-capitalize, pagination, cancellazioni utente e elimina dati cliente (sessione 30, mar 2026)

#### Viewer emergency mode (`viewer.html`)

Strumento offline completo per gestire prenotazioni e crediti quando GitHub Pages o Supabase sono down.

**Funzionalità:**
- Importa backup JSON (formato admin o cron Supabase) e visualizza tutti i dati
- **Toolbar emergenza** con 3 bottoni: + Prenotazione, + Credito, Esporta backup
- **Modal prenotazione**: ricerca cliente con dropdown autocomplete, campi per nuovo cliente, selezione data/ora/tipo slot
- **Modal credito**: ricerca cliente, importo, metodo pagamento
- **Esporta backup** in formato 100% compatibile con "Importa backup" dell'admin, incluse schedule overrides convertite al formato admin
- Dati aggiunti offline marcati con `_addedOffline: true` per distinguerli dai dati originali
- **localStorage persistence**: `persistData()` / `restoreData()` su chiave `viewer_emergency_data`; `beforeunload` warning se ci sono dati non esportati
- **Profilo tab** nel dettaglio cliente: scadenza certificato, assicurazione, data registrazione
- **Favicon** nella barra del browser
- `capitalizeName()` helper per auto-capitalizzare nomi di nuovi clienti

**Export admin-compatible:**
- Formato: `{ version, exportedAt, source: 'viewer-emergency', data: { gym_bookings, gym_credits, gym_manual_debts, gym_bonus } }`
- Schedule overrides: conversione da formato Supabase array `[{date, time, slot_type}]` a formato admin `{date: [{time, type, extras}]}`
- Credit history: solo le entry `_addedOffline: true` vengono esportate come `_credit_history`, inserite con INSERT (non UPSERT) perché `credit_history` non ha UNIQUE constraint

**Admin import (`js/admin.js`):**
- Step 6 aggiunto in `importBackup()`: gestisce `_credit_history` dal viewer emergency
- Attende il completamento dell'upsert credits prima di inserire credit_history (dependency su `credit_id`)
- Mappa `email → credit_id` da query fresh su tabella `credits`

#### Auto-capitalize nomi

Regex: `.replace(/\S+/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase())`

**Applicata a:**
- `js/auth.js` — `registerUser()` prima di `signUp`, `updateUserProfile()` su aggiornamento profilo
- `js/booking.js` — capitalizza `name` nei dati del form prima del salvataggio
- `js/admin.js` — `saveClientEdit()` capitalizza il nuovo nome
- `viewer.html` — `saveBooking()` capitalizza nome nuovo cliente

**Auto-fix nomi esistenti al login (`js/auth.js`):**
- In `_loadProfile()`: dopo il fetch del profilo da Supabase, confronta `full_name` con la versione capitalizzata
- Se diversi (es. utente Gmail con nome in minuscolo), aggiorna `profiles.full_name` su Supabase e `user_metadata` su auth.users
- Fix retroattivo: corregge automaticamente gli utenti esistenti man mano che accedono, senza intervento manuale

#### Paginazione "Mostra altro" (`prenotazioni.html`)

- Costanti: `INITIAL_SHOW = 5`, `LOAD_MORE = 20`
- Stato `_visibleCount` resettato a `INITIAL_SHOW` ad ogni cambio tab (`switchPrenoTab`)
- `renderPrenoList()`: mostra solo i primi `_visibleCount` elementi, poi bottone "Mostra altro (N rimanenti)"
- `renderTransazioni()`: stessa logica di paginazione
- `showMore()`: incrementa `_visibleCount` di `LOAD_MORE` e ri-renderizza
- CSS: `.preno-show-more` (full-width, testo blu, sfondo bianco, hover/active states) in `css/prenotazioni.css`

#### RPC `user_request_cancellation` (nuova migration)

**Problema:** gli utenti non potevano annullare prenotazioni — "Errore aggiornamento prenotazione sul server". Causa: `cancelDirect` e `requestCancellation` usavano `admin_update_booking` che richiede `is_admin()`.

**Fix:**
- `requestCancellation` in `prenotazioni.html` ora chiama la nuova RPC `user_request_cancellation` invece di `admin_update_booking`
- `cancelDirect` e `cancelWithBonus` usano `cancel_booking_with_refund` (già SECURITY DEFINER)
- La RPC verifica ownership (`user_id = auth.uid()`) e che lo status sia `confirmed`

**Migration:** `supabase/migrations/20260312300000_user_request_cancellation.sql`

#### Pulsante elimina dati cliente (cestino)

- Bottone 🗑️ nella sezione "Modifica contatto" della scheda cliente admin
- Richiede password "Palestra123" (SHA-256 non necessario — è una conferma operativa, non un'autenticazione)
- Conferma con `confirm()` prima di procedere
- Elimina da localStorage: prenotazioni, crediti, debiti manuali, bonus
- Elimina da Supabase via RPC `admin_delete_client_data`

**RPC `admin_delete_client_data`** (`supabase/migrations/20260312400000_admin_delete_client_data.sql`):
- SECURITY DEFINER, solo `is_admin()`
- Elimina in ordine FK: `credit_history` → `bookings` → `credits` → `manual_debts` → `bonuses`
- Ritorna conteggio righe eliminate per tabella

**Bug fix `_getClientsForDisplay`:** la funzione non esisteva — sostituita con `getAllClients()` già presente

#### Fix mappa Google bloccata da CSP

- Aggiunto `maps.google.com` a `frame-src` nel meta tag CSP di `dove-sono.html`
- Risolve "Questi contenuti sono bloccati" nell'iframe Google Maps

#### Cache bust e service worker

- `auth.js`: v18 → v20
- `admin.js`: v69 → v72
- `booking.js`: v14 → v15
- `prenotazioni.css`: v6 → v7
- `sw.js`: v29 → v35

#### File modificati/creati

`viewer.html` — emergency mode completo (toolbar, modali, persist, export, profilo tab, favicon, capitalize)
`js/auth.js` (v20) — auto-capitalize registrazione/profilo, auto-fix nomi esistenti al login
`js/admin.js` (v72) — deleteClientData, importBackup credit_history step, saveClientEdit capitalize
`js/booking.js` (v15) — capitalize nome form
`prenotazioni.html` — paginazione "Mostra altro", RPC user_request_cancellation
`css/prenotazioni.css` (v7) — stile .preno-show-more
`dove-sono.html` — CSP frame-src maps.google.com
`supabase/migrations/20260312300000_user_request_cancellation.sql` — nuova RPC
`supabase/migrations/20260312400000_admin_delete_client_data.sql` — nuova RPC
`admin.html`, `chi-sono.html`, `index.html`, `login.html` — cache bust auth.js
`sw.js` — bump cache v29 → v35

---

### 4.43 Password dimenticata, protezione duplicati e fix logout PWA (sessione 31, mar 2026)

**Contesto:** mancava il flusso di reset password, un utente poteva registrarsi con lo stesso numero WhatsApp di un altro, e il logout da desktop disconnetteva anche la PWA mobile.

**Cosa è stato fatto:**

1. **Password dimenticata (login.html)**
   - Aggiunto link "Hai dimenticato la password?" sotto il form di login
   - Nuovo pannello per inserire l'email e richiedere il reset via `resetPasswordForEmail` di Supabase
   - Nuovo pannello per impostare la nuova password, attivato dall'evento `PASSWORD_RECOVERY` di Supabase al ritorno dal link email
   - Validazione: min 6 caratteri, conferma password, messaggi di errore/successo
   - Template email personalizzato con branding TB (da configurare in Supabase > Authentication > Email Templates)

2. **Rimozione sezione "Accedi come Admin"**
   - Rimosso HTML, JS (toggleAdminForm, _checkAdminPass, hash SHA-256) e CSS dalla pagina di login
   - L'accesso admin avviene ora esclusivamente tramite il claim Supabase `role: admin`

3. **Cambio email con conferma obbligatoria**
   - `updateUserProfile()` in auth.js non aggiorna più l'email nel profilo immediatamente
   - Supabase Auth invia un'email di conferma; il profilo viene aggiornato solo dopo conferma
   - Il form profilo mostra un toast specifico: "Controlla la tua email per confermare il cambio di indirizzo"
   - Template email personalizzato per conferma cambio email (da configurare in Supabase)

4. **Protezione duplicati WhatsApp**
   - Migration `20260312600000_unique_whatsapp.sql`:
     - Unique partial index su `profiles.whatsapp` (ignora valori vuoti)
     - Funzione RPC `is_whatsapp_taken(phone, exclude_user_id)` — callable da anon + authenticated, ritorna solo boolean
   - Validazione client-side in 3 punti: `registerUser()`, `confirmCompleteProfile()`, `updateUserProfile()`
   - L'email era già protetta da Supabase Auth (unique su auth.users)

5. **Fix logout PWA cross-device**
   - `logoutUser()` ora usa `signOut({ scope: 'local' })` invece del default `'global'`
   - Il logout da desktop non invalida più la sessione sulla PWA mobile

**Commit:** `6c480f2`, `b725da8`, `d72af5d`

**File modificati:**
- `login.html` — pannelli forgot/reset password, rimosso admin, check WhatsApp OAuth
- `css/login.css` — stile `.forgot-password-link`, rimosso CSS admin
- `js/auth.js` — check WhatsApp RPC, signOut scope local, email pending confirmation
- `prenotazioni.html` — toast per email pending confirmation
- `supabase/migrations/20260312600000_unique_whatsapp.sql` — unique index + RPC

---

### 4.44 Fix PWA iOS — link credit, viewport lock e footer mobile (sessione 32, mar 2026)

**Contesto:** su iPhone in modalità PWA, il link "powered by Andrea Pompili" non si apriva (il click veniva loggato su Supabase ma `window.open` dentro `.finally()` veniva bloccato da iOS). Inoltre la pagina si muoveva con swipe laterale e il pinch-to-zoom mostrava uno sfondo azzurrino dietro il contenuto. Il footer "powered by" era troppo in basso su mobile.

**Cosa è stato fatto:**

1. **Fix link credit su iOS PWA (supabase-client.js)**
   - Rimosso `e.preventDefault()` e `window.open()` dalla funzione `logCreditClick()`
   - Il click viene loggato in background su Supabase, ma il tag `<a href>` gestisce la navigazione nativamente
   - iOS PWA blocca `window.open` se non è sincrono con il gesto utente — ora funziona perché il browser apre il link direttamente

2. **Blocco overscroll bounce iOS (style.css)**
   - Aggiunto `overscroll-behavior: none` su `html` e `body`
   - Impedisce il bounce elastico di Safari/WebKit quando si fa swipe oltre i bordi della pagina

3. **Blocco pinch-to-zoom (tutti i file .html)**
   - Viewport aggiornato su tutte le 7 pagine: `maximum-scale=1.0, user-scalable=no, viewport-fit=cover`
   - Impedisce lo zoom che mostrava lo sfondo azzurrino di sistema
   - `viewport-fit=cover` assicura che la pagina copra l'intero schermo inclusi i safe area

4. **Footer "powered by" più alto su mobile (style.css)**
   - Aumentato `padding-bottom` da `0.6rem` a `1.4rem` (+ `env(safe-area-inset-bottom)`)

**Commit:** `72035ae`, `94ec7f8`

**File modificati:**
- `js/supabase-client.js` — logCreditClick senza preventDefault
- `css/style.css` — overscroll-behavior: none, padding footer
- `index.html`, `chi-sono.html`, `dove-sono.html`, `login.html`, `admin.html`, `prenotazioni.html`, `viewer.html` — viewport aggiornato

---

### 4.45 PWA auto-update, sticky calendar, fix debiti e booking semplificato (sessione 33, mar 2026)

**Contesto:** la PWA richiedeva hard refresh per aggiornamenti; il calendario mobile non fissava le date allo scroll; i debiti manuali non erano integrati nel totale "da pagare"; il form di prenotazione mostrava campi inutili per utenti loggati.

**Cosa è stato fatto:**

1. **PWA auto-update (`js/sw-update.js`)**
   - Nuovo file centralizzato che sostituisce la registrazione SW inline in tutti i 6 HTML
   - Registra il service worker con `updateViaCache: 'none'`
   - Poll `reg.update()` ogni 60 secondi per rilevare nuove versioni
   - Listener `updatefound` + `statechange` → reload automatico quando il nuovo SW si attiva
   - Flag `refreshing` per prevenire loop di reload
   - Listener `controllerchange` come fallback
   - **Per deployare aggiornamenti:** basta bumpare `CACHE_NAME` in `sw.js`

2. **Sticky calendar mobile (calendario utente)**
   - `.mobile-week-nav` e `.mobile-day-selector` resi sticky sotto la navbar
   - `setupMobileStickyOffsets()` in `calendar.js` calcola offset esatti da `navbar.offsetHeight` via JS
   - `margin-top: -1px` sul day-selector per eliminare gap sub-pixel tra i due elementi
   - Sfondo `var(--light-gray)` per coprire il contenuto che scorre sotto
   - Aggiornamento offset su `resize`

3. **Sticky calendar desktop (admin)**
   - `.admin-calendar-controls` e `.admin-day-selector` sticky sotto la navbar (solo >768px)
   - `setupAdminStickyOffsets()` in `admin.js` con reset `position: static` su mobile
   - z-index 12/11 per restare sopra il contenuto

4. **Fix race condition crediti/debiti**
   - `clearTimeout(CreditStorage._supabaseSaveTimer)` e `clearTimeout(ManualDebtStorage._supabaseSaveTimer)` spostati **PRIMA** delle RPC (prima erano dopo, permettendo al debounce di sovrascrivere i dati)
   - Aggiunto debounce 200ms a `ManualDebtStorage._save()` (prima scriveva sync a Supabase)
   - Fix applicato a 3 flussi: `admin_add_credit`, `admin_add_debt`, `admin_pay_bookings`

5. **`bookingHasPassed()` usa orario di INIZIO lezione**
   - Cambiato da `split(' - ')[1]` (fine) a `split(' - ')[0]` (inizio)
   - Allinea il calcolo "Da pagare" in admin con `prenotazioni.html`

6. **Booking modal semplificato per utenti loggati**
   - Campi nome/email/whatsapp wrappati in `#bookingUserFields` e nascosti con `display: none`
   - Rimosso attributo `required` HTML (la validazione JS resta invariata)
   - Data e ora centrate e ingrandite (`flex-direction: column`, font 1.5rem desktop / 1.3rem mobile)
   - Badge tipo lezione e posti disponibili centrati sopra
   - L'utente vede solo: tipo lezione + giorno/ora + posti + campo note + bottone conferma

7. **Debiti unificati nella scheda clienti**
   - "Da pagare" = booking non pagati + debiti manuali − credito (un unico numero)
   - Rimosso footer inline "Totale / Seleziona… / Incassa tutto" dalle card debitori
   - Debiti manuali nel popup "Da pagare" ora hanno sfondo rossiccio (`debt-popup-item--past`)

8. **Alert debito superato**
   - Toast rosso 8 secondi su apertura app (`index.html` + `prenotazioni.html`)
   - Confronta `BookingStorage.getUnpaidPastDebt()` vs `DebtThresholdStorage.get()`
   - Messaggio: "ATTENZIONE: debito superato! Non potrai più prenotare finché non hai saldato."

**File modificati:**
- `js/sw-update.js` — nuovo, auto-update PWA
- `js/calendar.js` — `setupMobileStickyOffsets()`
- `js/admin.js` — `setupAdminStickyOffsets()`, fix clearTimeout race condition, debiti unificati, `bookingHasPassed()` start time
- `js/booking.js` — nasconde campi utente se loggato
- `js/data.js` — debounce su `ManualDebtStorage._save()`
- `css/style.css` — sticky mobile day selector/week nav, modal centrato
- `css/admin.css` — sticky admin calendar controls/day selector (desktop only)
- `index.html` — alert debito, booking modal refactored, sw-update.js
- `prenotazioni.html` — alert debito, sw-update.js
- `admin.html`, `login.html`, `chi-sono.html`, `dove-sono.html` — sw-update.js
- `sw.js` — bump cache da v42 a v59

---

### 4.46 Fix soglia blocco debito e trigger auto-link manual_debts (sessione 34, mar 2026)

**Contesto:** la soglia blocco prenotazioni (impostata a €29 nell'admin) non funzionava — utenti con debiti superiori potevano comunque prenotare. Causa principale: la tabella `manual_debts` su Supabase non aveva `user_id` popolato, quindi le RLS policies bloccavano la lettura per utenti non-admin, e il calcolo debito risultava sempre 0.

**Cosa è stato fatto:**

1. **Fix calcolo debito in `js/booking.js`**
   - Rimossa la chiamata RPC `get_unpaid_past_debt` (richiedeva `is_admin()`, inutilizzabile da utenti)
   - Rimosse le query dirette Supabase su `bookings`, `credits`, `manual_debts` che sovrascrivevano il valore localStorage con dati incompleti (manual_debts non leggibile senza user_id)
   - Ora usa `BookingStorage.getUnpaidPastDebt()` (localStorage, già popolato dal sync) sia nel modal open che nel submit — fonte affidabile e coerente
   - Check debito al modal open: se debito > soglia, il form viene nascosto e appare messaggio di blocco (stesso pattern di certificato/assicurazione)
   - Check debito al submit: secondo controllo come safety net

2. **Migration `20260314000000_auto_link_manual_debts_user_id.sql`**
   - Trigger `auto_link_manual_debt_user_id`: popola automaticamente `user_id` da `profiles.email` su INSERT/UPDATE (stesso pattern di `auto_link_credit_user_id` su credits)
   - UPDATE delle righe esistenti con `user_id` NULL → match su `lower(email)`
   - Senza questo trigger, il sync per utenti non-admin non portava i debiti manuali in localStorage

3. **Sostituito "il trainer" → "Thomas"**
   - Tutti i messaggi di blocco in `booking.js` (certificato, assicurazione, debito) ora dicono "Contatta Thomas" invece di "Contatta il trainer"

**File modificati:**
- `js/booking.js` — fix check debito (localStorage instead of Supabase), "Thomas" nei messaggi
- `js/auth.js` — logout con timeout 3s per evitare blocco UX se Supabase non risponde
- `supabase/migrations/20260314000000_auto_link_manual_debts_user_id.sql` — nuovo
- `sw.js` — bump cache
- `index.html` — bump booking.js version

---

### 4.47 Verifica Realtime e fix check duplicati prenotazione (sessione 35, mar 2026)

**Contesto:** l'utente segnalava che molte cose non si aggiornavano in tempo reale e richiedevano refresh della pagina. Inoltre un utente non riusciva a ri-prenotare uno slot dopo cancellazione perché il sistema diceva "hai già una prenotazione".

**Cosa è stato verificato:**

1. **Supabase Realtime già attivo su tutte le pagine**
   - `index.html` — channel `bookings-rt-calendar` + `appsettings-rt-calendar`: ri-renderizza calendario desktop e mobile
   - `admin.html` — channel `admin-rt` debounced (600ms): sincronizza bookings, app_settings, profiles, manual_debts, credits, credit_history, bonuses → ri-renderizza dashboard, calendario admin, tab attiva
   - `prenotazioni.html` — channel `preno-rt` debounced (600ms): sincronizza bookings, credits, credit_history, manual_debts, bonuses → ri-renderizza lista prenotazioni, saldo crediti, bonus
   - Cleanup su `beforeunload` e `visibilitychange`

2. **Configurazione Supabase Dashboard necessaria**
   - Le tabelle devono essere aggiunte alla publication `supabase_realtime` nel Dashboard → Database → Replication
   - Tabelle: bookings, credits, credit_history, manual_debts, bonuses, app_settings, profiles, schedule_overrides
   - Comando SQL: `ALTER PUBLICATION supabase_realtime ADD TABLE <nome_tabella>`

**Cosa è stato fatto:**

3. **Fix check duplicati prenotazione (`js/booking.js`)**
   - **Prima:** il controllo duplicati usava `BookingStorage.getAllBookings()` (localStorage) — se il localStorage aveva una prenotazione cancellata con status stale, bloccava la ri-prenotazione
   - **Dopo:** per utenti loggati, query diretta a Supabase (`bookings` WHERE `user_id` + `date` + `time` AND status NOT IN cancelled/cancellation_requested)
   - Fallback a localStorage se Supabase non raggiungibile o utente non loggato
   - L'indice DB `bookings_no_duplicate_user_slot` (partial, esclude cancelled) resta come protezione server-side

**File modificati:**
- `js/booking.js` — check duplicati via Supabase per utenti loggati

---

### 4.48 Fix debito, popup annullamento admin, sidebar PWA (sessione 36, mar 2026)

**Contesto:** diversi bug e miglioramenti UX segnalati dall'utente su annullamento prenotazioni e sidebar mobile.

**Cosa è stato fatto:**

1. **Fix `getUnpaidPastDebt` — ora usa ora di inizio lezione**
   - **Prima:** il debito veniva conteggiato solo dopo la *fine* della lezione (`endDt`)
   - **Dopo:** usa `startDt` (ora di inizio), coerente con `applyToUnpaidBookings` che scala il credito all'inizio
   - File: `js/data.js` riga ~900

2. **Refactoring popup annullamento admin (`deleteBooking` in `js/admin.js`)**
   - **Oltre 24h dall'inizio:** semplice `confirm()` con rimborso completo automatico, niente popup complesso
   - **Entro 24h con bonus:** scelta "Utilizza bonus Sì/No" + "Con mora / Senza mora"
   - **Entro 24h senza bonus:** solo scelta "Con mora (€X)" o "Senza mora"
   - "Con mora" → rimborso 50% se pagato, addebito mora (`ManualDebtStorage.addDebt`) se non pagato
   - "Senza mora" → rimborso completo
   - Rimossa sezione "Rimborso 0%/50%/100%" e sostituita con logica automatica

3. **UX: bonus Sì auto-seleziona "Senza mora"**
   - Quando l'admin seleziona "Utilizza bonus: Sì", la modalità "Senza mora" viene auto-selezionata e il bottone Conferma si abilita immediatamente

4. **Fix sidebar "powered by" su PWA iPhone**
   - Aggiunto `margin-top: auto` → spinge la scritta in fondo alla sidebar
   - Aggiunto `padding-bottom: calc(1.4rem + env(safe-area-inset-bottom))` → rispetta la safe area di iPhone (barra home)

5. **Rinomina tabella Supabase `credit_link_clicks` → `click_andrea_pompili`**
   - Aggiornato `js/supabase-client.js` per usare il nuovo nome tabella
   - Rimosso `preventDefault` dal `logCreditClick` per compatibilità iOS PWA (il link WhatsApp si apre normalmente)

**File modificati:**
- `js/data.js` — fix `getUnpaidPastDebt` startTime
- `js/admin.js` — refactoring `deleteBooking` popup
- `js/supabase-client.js` — rinomina tabella + fix iOS
- `css/style.css` — sidebar credit positioning + safe area
- Tutti i file HTML — bump cache version `style.css?v=7`, `admin.js?v=78`

---

### 4.49 Refactor Supabase-first, admin UX e fix logout PWA (sessione 37, mar 2026)

**Contesto:** completamento della migrazione dati da localStorage a Supabase come fonte di verità, con cache in memoria come intermediario. Correzione di bug UX nell'admin e fix critico per logout spurio nella PWA.

**Cosa è stato fatto:**

1. **Refactor Supabase-first — localStorage → cache in memoria**
   - Ogni classe Storage ora ha `static _cache = []` o `{}` come source of truth in sessione
   - `_getAll()` ritorna la cache; `syncFromSupabase()` popola la cache; le scritture aggiornano cache + upsert Supabase immediato
   - Rimosso debounce 200ms su `CreditStorage._save()` e `ManualDebtStorage._save()` — scritture immediate
   - Rimosso handler `beforeunload` flush (~35 righe)
   - Rimosso fallback offline in `saveBooking()`/`saveBookingForClient()` — ritornano `{ ok: false, error: 'offline' }`
   - `logoutUser()` svuota tutte le cache
   - `exportBackup()`, `resetDemoData()`, `clearAllData()`, `deleteClientData` — tutti aggiornati per usare cache
   - Rimossi tutti i 12+ `clearTimeout(CreditStorage._supabaseSaveTimer)` e `clearTimeout(ManualDebtStorage._supabaseSaveTimer)`
   - localStorage mantenuto solo per: settings, scheduleOverrides, flags (dataClearedByUser, etc.)

2. **Fix popup conferma prenotazione incompleto**
   - `showConfirmation()` nascondeva `#modalSlotInfo` senza ripristinarlo
   - Fix: `document.getElementById('modalSlotInfo').style.display = ''` in `openBookingModal()` e `closeBookingModal()`

3. **Admin tabs sticky + persistenza tab**
   - `.admin-tabs` reso sticky sotto navbar (z-index 13, background white)
   - `setupAdminStickyOffsets()` aggiornato: navbar → tabs → controls → day-selector (desktop only)
   - Tab attiva salvata in `sessionStorage('adminActiveTab')`
   - `showDashboard()` ripristina il tab salvato
   - Cambio tab scorre in alto (tranne Prenotazioni)

4. **Auto-scroll all'orario corrente in admin**
   - `_scrollToCurrentAdminSlot(container)`: scorre al primo slot con endTime > now

5. **Fix tab Pagamenti/Clienti vuote al refresh**
   - Le cache sono vuote al boot; sync popola async; il tab renderizzato prima del sync mostrava dati vuoti
   - Fix in `admin.html`: dopo sync completato, `switchTab()` ri-renderizza il tab attivo

6. **Fix logout spurio nella PWA**
   - **Causa:** il refactor Supabase-first genera più chiamate API → più possibilità di token expiry → `SIGNED_OUT` spurio da Supabase → `_currentUser = null`
   - **Fix:** flag `_isManualLogout` settato solo in `logoutUser()`. Il handler `SIGNED_OUT` in `onAuthStateChange`: se manuale → pulisci tutto; se spurio → tenta `refreshSession()` per recuperare la sessione, se rete assente mantieni lo stato corrente

**File modificati:**
- `js/data.js` — cache in memoria, rimosso debounce/beforeunload/offline fallback
- `js/admin.js` — cache, sticky tabs, tab persistence, auto-scroll, rimossi clearTimeout
- `js/auth.js` — cache clear in logout, fix SIGNED_OUT spurio con `_isManualLogout`
- `js/booking.js` — fix popup #modalSlotInfo
- `css/admin.css` — sticky admin-tabs
- `admin.html` — re-render tab dopo sync
- `sw.js` — bump cache da v61 a v70

---

### 4.50 Badge notifica dumbbell, rotazione VAPID e tab Messaggi admin (sessione 38, mar 2026)

**Contesto:** miglioramento UX notifiche push e aggiunta funzionalità admin per invio notifiche personalizzate.

**Cosa è stato fatto:**

1. **Badge notifica dumbbell**
   - Sostituito il vecchio badge (bilanciere + T) con icona dumbbell outline bold
   - Sorgente: `images/dumbbell.png` (512x512, nero su bianco, da Icons8/Flaticon)
   - Dilatazione bordi via sharp (radius 8px) → `images/dumbbell-bold.png`
   - Conversione automatica: dark→white, light→transparent, crop+resize 96x96 → `images/badge-mono-96.png`
   - Badge bianco su trasparente (requisito Android per monocromaticità)

2. **Rotazione VAPID keys**
   - La chiave privata VAPID originale era irrecuperabile (Supabase dashboard mostra solo hash/digest)
   - Generata nuova coppia VAPID con `web-push generate-vapid-keys`
   - Aggiornata public key in `js/push.js`
   - Aggiornati secrets Supabase (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`) via `supabase secrets set`
   - Svuotata tabella `push_subscriptions` (vecchie subscription incompatibili)
   - `registerPushSubscription()` gestisce automaticamente il mismatch: unsubscribe + ri-crea

3. **Tab admin "Messaggi" — invio notifiche push personalizzate**
   - Nuovo tab `📩 Messaggi` nella dashboard admin (`admin.html`)
   - Form con titolo (max 60 char) e messaggio (max 200 char)
   - Selettore destinatari con 3 modalità:
     - `🌐 Tutti gli utenti` — tutte le push_subscriptions
     - `📅 Iscritti di un giorno` — filtro per data (JOIN bookings)
     - `🕐 Iscritti di un'ora specifica` — filtro per data + time slot
   - Date picker + select orario (popolato da `getScheduleForDate()`)
   - Conferma prima dell'invio con indicazione scope
   - Popup risultato con lista nomi destinatari (✅ inviata / ❌ non recapitata)

4. **Edge Function `send-admin-message`**
   - Nuovo file: `supabase/functions/send-admin-message/index.ts`
   - Pattern identico a `notify-slot-available` (web-push, CORS, cleanup 410/404)
   - Modalità `tutti`: query diretta su `push_subscriptions`
   - Modalità `giorno`/`ora`: JOIN `bookings` → `push_subscriptions` (status confirmed/cancellation_requested)
   - JOIN con `profiles` per recuperare i nomi dei destinatari
   - Risposta include `recipients` (nomi ok) e `failed` (nomi non recapitati)
   - Deploy con `--no-verify-jwt` (accesso senza token, come le altre Edge Functions)
   - Tag notifica: `admin-msg-{timestamp}` per evitare deduplicazione

**File modificati/creati:**
- `images/badge-mono-96.png` — nuovo badge dumbbell bold bianco
- `images/badge-mono.svg` — aggiornato (non più usato, PNG è il riferimento)
- `images/dumbbell.png` — sorgente icona originale
- `images/dumbbell-bold.png` — versione con bordi ispessiti
- `js/push.js` — nuova VAPID public key
- `js/admin.js` — funzioni `showMsgResultPopup()`, `renderMessaggiTab()`, `onMsgRecipientModeChange()`, `onMsgDateChange()`, `sendAdminMessage()` + case in `switchTab()`
- `admin.html` — tab button + `#tab-messaggi` con form completo
- `supabase/functions/send-admin-message/index.ts` — nuova Edge Function
- `sw.js` — bump cache da v71 a v77

---

### 4.51 Indirizzo residenza, controllo dati, fix OAuth, schema hardening, backup (sessione 39, mar 2026)

**Contesto:** completamento dati anagrafici per clienti che pagano con carta/bonifico, hardening schema DB, fix backup Nextcloud.

**Cosa è stato fatto:**

1. **Indirizzo di residenza (Via, Paese, CAP)**
   - Migration `20260315000000_indirizzo_residenza.sql`: 3 nuove colonne su `profiles`
   - `handle_new_user()` aggiornata con EXCEPTION WHEN OTHERS + ON CONFLICT DO UPDATE SET
   - `get_all_profiles()` aggiornata per restituire i campi indirizzo
   - **Registrazione** (`login.html`): 3 nuovi campi dopo Codice Fiscale
   - **OAuth completion modal** (`login.html`): stessi 3 campi, pre-fill se già presenti
   - **Modifica profilo** (`prenotazioni.html`): campi indirizzo modificabili con validazione CAP
   - `registerUser()` in `auth.js`: passa indirizzo come user_metadata
   - `_loadProfile()` e `updateUserProfile()`: gestione campi indirizzo
   - `syncUsersFromSupabase()` in `data.js`: mapping indirizzo nel cache utenti
   - Report settimanale XLSX: colonna "Indirizzo" aggiunta

2. **Controllo dati per pagamento carta/bonifico**
   - `ensureClientDataForCardPayment()`: verifica CF + indirizzo prima di accettare carta/iban
   - Popup modale `#missingDataOverlay` per inserire i dati mancanti (z-index 2200/2300, sopra popup debiti 2000/2100)
   - `saveMissingData()`: salva CF e indirizzo su Supabase e aggiorna cache locale
   - Integrato in `paySelectedDebts()`, `saveManualEntry()`, `saveBookingRowEdit()`

3. **Fix Google OAuth "Database error saving new user"**
   - Causa: `handle_new_user` con ON CONFLICT DO NOTHING non gestiva conflitti sulla UNIQUE(email)
   - Fix: ON CONFLICT (id) DO UPDATE SET + wrapper EXCEPTION WHEN OTHERS per evitare che errori nel trigger blocchino il login
   - Eliminati account orfani (ik2yyo@gmail.com, spamrenuma@protonmail.com) da auth.users

4. **Schema hardening — migration `20260315100000_schema_hardening.sql`**
   - **bonuses FK CASCADE → SET NULL**: il bonus resta (con user_id NULL) se si cancella un profilo
   - **credit_history.booking_id**: nuova colonna nullable per tracciare contesto prenotazione
   - **updated_at + trigger su credits e manual_debts**: infrastruttura per optimistic locking (come bookings)
   - **Audit triggers su credits, manual_debts, bonuses**: ogni modifica admin viene loggata in admin_audit_log, come già avveniva per bookings via `_trg_audit_booking_change`
   - NON aggiunto CHECK >= 0 su credits.balance (romperebbe il flusso admin_add_credit con importo negativo)

5. **Fix import backup Nextcloud**
   - Il backup Nextcloud aveva formato `{ exportedAt, source, tables: { bookings, ... } }` (wrapper `tables`)
   - La detection cercava `backup.bookings` (piatto) o `backup.generated_at` — entrambi assenti
   - Fix: aggiunto rilevamento formato `tables` wrapper → appiattimento prima della conversione
   - Aggiunto logging diagnostico `[Backup]` in console per debug futuri

6. **Export CSV manuale**
   - Due bottoni nella sezione Backup: "📤 Esporta JSON" (reimportabile) e "📤 Esporta CSV" (Excel)
   - Export JSON invariato (reimportabile)
   - Export CSV: fetch diretto da Supabase di tutte le 12 tabelle, CSV unico con intestazioni per tabella
   - BOM UTF-8 per corretta visualizzazione accenti in Excel
   - `_exportBackupCSV()`: converte array di oggetti in CSV con escape virgole/doppie virgolette

7. **Backup Nextcloud auto-discovery**
   - Workflow `.github/workflows/backup.yml` riscritto con auto-discovery PostgREST
   - Scopre tutte le tabelle pubbliche automaticamente (fallback a lista hardcoded di 12)
   - Ordinamento specifico per tabella, pulizia backup vecchi (mantiene ultimi 60)

**File modificati/creati:**
- `login.html` — campi indirizzo in registrazione + OAuth modal
- `prenotazioni.html` — campi indirizzo in modifica profilo
- `admin.html` — popup dati mancanti + bottoni export JSON/CSV
- `js/auth.js` — registerUser con indirizzo, _loadProfile, updateUserProfile
- `js/data.js` — syncUsersFromSupabase con mapping indirizzo
- `js/admin.js` — ensureClientDataForCardPayment, saveMissingData, _exportBackupCSV, fix _convertCronToAdminFormat (tables wrapper), debug logging import
- `css/admin.css` — z-index popup dati mancanti
- `supabase/migrations/20260315000000_indirizzo_residenza.sql` — nuova migration
- `supabase/migrations/20260315100000_schema_hardening.sql` — nuova migration
- `.github/workflows/backup.yml` — riscritto con auto-discovery
- `sw.js` — bump cache da v77 a v85

---

### 4.52 Report, ricerca unificata, modifica crediti/debiti, restyling Clienti (sessione 40, mar 2026)

**Contesto:** fix report settimanale XLSX (crediti manuali mancanti, bug timezone), restyling completo tab Clienti, ricerca unificata con dropdown in entrambe le tab, possibilità di modificare/eliminare voci credito e debito dalla tab Pagamenti.

**Cosa è stato fatto:**

1. **Fix report settimanale XLSX**
   - **Crediti manuali mancanti**: il report non includeva i crediti manuali pagati con carta/bonifico — aggiunto scan di `CreditStorage` con filtro su `REPORT_METHODS`
   - **Colonna `method` in `credit_history`**: migration `20260316000000_credit_history_method.sql` aggiunge colonna `method TEXT NOT NULL DEFAULT ''`
   - **RPC `admin_add_credit` aggiornata**: salva `p_method` nella INSERT di credit_history
   - **`_insertCreditHistory()` in `data.js`**: passa `method` a Supabase
   - **Sync crediti**: SELECT e mapping aggiornati per includere `method`
   - **Bug timezone**: `toISOString()` converte in UTC, spostando le date indietro di 1 giorno in CET — fix con formattazione data locale (`localDate()`)
   - **Sync prima del report**: aggiunto `await Promise.all([ManualDebtStorage.syncFromSupabase(), CreditStorage.syncFromSupabase(), UserStorage.syncUsersFromSupabase()])` prima della generazione
   - **Fix `UserStorage.getAll()`**: il destructuring `_add({ name, email, whatsapp })` perdeva tutti i campi extra (CF, indirizzo) — fix con spread `{ ...user }`

2. **Popup modifica cliente (tab Clienti)**
   - `openEditClientPopup()`: popup modale con sezioni dati personali, codice fiscale, indirizzo (via, comune, CAP), documenti (cert medico, assicurazione)
   - Sostituisce il vecchio form inline di modifica contatto
   - Icona ✏️ posizionata accanto al nome del cliente nella card
   - `_saveClientEditLocalProfile()` aggiornata per accettare `extraFields` (CF, indirizzo) e salvare su Supabase via `_updateSupabaseProfile`

3. **Restyling tab Clienti**
   - Due stat card (stile Pagamenti): "👥 Clienti Totali" e "💪 Clienti Attivi" con toggle dropdown
   - `getActiveClients()`: filtra clienti con prenotazioni negli ultimi 2 mesi + prossimo mese
   - Barra di ricerca con dropdown a tendina (stesso stile di Pagamenti)
   - Clic su risultato mostra solo la card del cliente selezionato (non tutta la lista)
   - Filtro "📝 Senza anagrafica": `clientHasAnagIssue()` verifica CF, via, paese, CAP mancanti
   - Numero telefono: nascosto prefisso +39 nella visualizzazione

4. **Ricerca unificata con tutti i clienti**
   - **Tab Clienti**: `liveSearchClients()` con dropdown, cerca tra tutti i clienti registrati indipendentemente dalla lista aperta
   - **Tab Pagamenti**: `_searchAllContacts()` estesa per includere tutti i clienti da `UserStorage`, non solo debitori/creditori — i clienti senza debiti/crediti mostrati con badge "👤 Cliente"

5. **Modifica e eliminazione crediti/debiti (tab Pagamenti)**
   - **Bottoni +Credito / +Debito** nell'header di ogni card credito, accanto al nome
   - **Pulsante ✏️ modifica** su ogni voce storico (crediti e debiti manuali)
   - **Popup modifica** (`openEditEntryPopup`): permette di cambiare importo, nota e metodo
   - **Pulsante ✕ elimina** su ogni voce storico crediti (già esistente per debiti)
   - `deleteCreditEntryFromCard()`: chiama RPC `admin_delete_credit_entry` e ricarica
   - `saveEditEntry()`: chiama nuove RPC `admin_edit_credit_entry` / `admin_edit_debt_entry`
   - **Migration `20260316100000_admin_edit_entries.sql`**: due nuove RPC PostgreSQL
     - `admin_edit_credit_entry(p_email, p_entry_date, p_new_amount, p_new_note, p_new_method)`: modifica voce in `credit_history`, ricalcola saldo preservando segno originale
     - `admin_edit_debt_entry(p_email, p_entry_date, p_new_amount, p_new_note)`: modifica voce nella history JSONB di `manual_debts`, ricalcola saldo
   - `openManualEntryPopup()` aggiornata per accettare parametri pre-fill (email, nome, whatsapp)

6. **Navigazione settimana auto-hide**
   - La barra "← Settimana Precedente / date / Settimana Successiva →" ora scompare appena si scrolla (in qualsiasi direzione)
   - Riappare solo quando si torna in cima alla pagina (`scrollY <= 10`)

**File modificati/creati:**
- `admin.html` — restyling tab Clienti (stat cards, dropdown ricerca, filtro anagrafica), cache busting v89→v97
- `js/admin.js` — downloadWeeklyReport fix (timezone, crediti manuali), openEditClientPopup, liveSearchClients con dropdown, selectClientFromDropdown, createCreditCard con bottoni header + edit/delete, openEditEntryPopup/saveEditEntry, deleteCreditEntryFromCard, scroll handler semplificato
- `js/data.js` — method in _insertCreditHistory/syncFromSupabase, fix UserStorage.getAll() spread
- `css/admin.css` — popup modifica cliente, bottoni header card credito, popup edit entry, btn-edit-contact-icon, dropdown clienti, debt-entry-edit-btn
- `supabase/migrations/20260316000000_credit_history_method.sql` — colonna method + RPC admin_add_credit aggiornata
- `supabase/migrations/20260316100000_admin_edit_entries.sql` — RPC admin_edit_credit_entry + admin_edit_debt_entry

**Migrazioni SQL da eseguire su Supabase:**
1. `20260316000000_credit_history_method.sql` — aggiunge colonna `method` a `credit_history` e aggiorna RPC `admin_add_credit`
2. `20260316100000_admin_edit_entries.sql` — crea RPC `admin_edit_credit_entry` e `admin_edit_debt_entry`

---

### 4.53 Cutoff prenotazione e fix notifica conferma (sessione 41, mar 2026)

**Contesto:** il cutoff per prenotare usava la fine della lezione meno 30 minuti, ma il requisito era inizio lezione + 30 minuti. Inoltre la notifica push "Prenotazione confermata" mostrava una campanella generica su Android invece del badge dumbbell.

**Cosa è stato fatto:**

1. **Cutoff prenotazione: inizio lezione + 30 minuti**
   - **Vecchio comportamento**: si poteva prenotare finché `(fine_lezione - now) >= 30 min` — di fatto permetteva prenotazioni fino a metà lezione per slot lunghi
   - **Nuovo comportamento**: si può prenotare finché `(now - inizio_lezione) <= 30 min`
   - **Client JS — `booking.js`**: check al submit ora usa `startH/startM` invece di `endH/endM`, confronto invertito
   - **Client JS — `calendar.js`**: aggiornati 3 punti che controllavano la visibilità/cliccabilità degli slot nel calendario
     - `createSlot()` (desktop): slot non cliccabile dopo inizio + 30 min
     - `renderMobileSlots()`: slot nascosto dalla lista mobile dopo inizio + 30 min
     - `createMobileSlotCard()`: card non cliccabile dopo inizio + 30 min
   - **Server SQL — migration `20260316100000_book_slot_time_cutoff.sql`**: nuova versione di `book_slot_atomic` con check server-side
     - Estrae orario di inizio da `p_time` (formato `"HH:MM - HH:MM"`) via `split_part`
     - Converte in timestamptz con timezone `Europe/Rome`
     - Ritorna errore `too_late` se `now() > inizio + 30 min`
   - **Client error handling**: aggiunta gestione errore `too_late` dal server con toast dedicato

2. **Fix badge notifica "Prenotazione confermata"**
   - **Problema**: su Android appariva una campanella generica invece del manubrio
   - **Causa 1 — badge sbagliato**: `booking.js` usava `logo-tb---nero.jpg` come badge (immagine a colori, non monocromatica) — Android richiede un'icona con alpha channel per il badge
   - **Causa 2 — path errato**: `booking.js` usava il prefisso `/Palestra/images/...` che dava 404, mentre il service worker usava correttamente `/images/...`
   - **Fix**: badge cambiato in `/images/badge-mono-96.png` (icona monocromatica dumbbell, stessa usata dal SW per i reminder) e rimosso prefisso `/Palestra/` da icon e badge

**File modificati/creati:**
- `js/booking.js` — cutoff inizio+30min al submit, gestione errore `too_late`, fix path icon/badge notifica
- `js/calendar.js` — cutoff inizio+30min in 3 punti (desktop slot, mobile lista, mobile card)
- `supabase/migrations/20260316100000_book_slot_time_cutoff.sql` — check server-side in `book_slot_atomic`

**Migrazioni SQL da eseguire su Supabase:**
1. `20260316100000_book_slot_time_cutoff.sql` — aggiorna `book_slot_atomic` con controllo orario inizio + 30 min

---

### 4.54 Fix utenti fantasma, health check admin e UX filtri clienti (sessione 42, mar 2026)

**Contesto:** 52 utenti registrati risultavano invisibili nella lista clienti admin. La causa: il trigger `handle_new_user` (che crea il profilo in `profiles` alla registrazione) era rotto da una migrazione precedente (`indirizzo_residenza.sql`) che aveva rimosso `SET search_path = public` e non gestiva i conflitti sulla colonna `whatsapp` (unique constraint). Di conseguenza il trigger falliva silenziosamente e l'utente rimaneva "fantasma" — presente in `auth.users` ma senza riga in `profiles`.

**Cosa è stato fatto:**

1. **Diagnosi e backfill dei 52 profili mancanti**
   - Query diagnostica: `SELECT au.email FROM auth.users au LEFT JOIN profiles p ON au.id = p.id WHERE p.id IS NULL` → 52 righe
   - **Migration `20260317000000_fix_missing_profiles.sql`**:
     - DO block che itera sui ghost users e crea i profili mancanti usando `raw_user_meta_data` (nome, email, whatsapp, codice_fiscale, indirizzo)
     - Gestione conflitto whatsapp: se il numero è già usato, inserisce con whatsapp vuoto
     - Collega le booking orfane ai nuovi profili (`UPDATE bookings SET user_id = p.id WHERE email match`)
   - **Trigger `handle_new_user` riscritto**: ripristinato `SET search_path = public`, aggiunto pre-check whatsapp uniqueness prima dell'INSERT, catch specifico per `unique_violation` e `OTHERS` con logging

2. **Self-healing profilo utente (`js/auth.js`)**
   - `updateUserProfile()` cambiato da `.update().eq('id')` a `.upsert({ id, ... })` — se il profilo manca (ghost user residuo), lo ricrea automaticamente al primo salvataggio
   - Fallback `_currentUser` arricchito con tutti i campi profilo (codice_fiscale, indirizzo_*, cert, insurance) dalla session metadata

3. **Health Check e Health Fix in admin Impostazioni**
   - **Migration `20260317100000_health_check.sql`** — due nuove RPC:
     - `admin_health_check()`: read-only, controlla 6 tipi di anomalia:
       - Utenti fantasma (auth.users senza profilo)
       - Booking orfane (user_id → profilo inesistente)
       - Email mismatch (email booking ≠ email profilo collegato)
       - Credits/manual_debts/bonuses con user_id orfano
     - `admin_health_fix()`: fix conservativo (non cancella MAI dati):
       - Ghost users → crea profilo mancante
       - Booking orfane → scollega user_id (la booking resta intatta)
       - Email mismatch → allinea email booking al profilo (autoritativo)
       - Credits/debts/bonuses orfani → scollega user_id
   - **UI in `admin.html`**: sezione "Verifica integrità dati" nel tab Impostazioni con pulsanti "Verifica" e "Correggi anomalie"
   - **`js/admin.js`**: funzioni `runHealthCheck()` (mostra risultati con badge OK/warning per check) e `runHealthFix()` (confirm dialog, esegue fix, ri-sincronizza cache)

4. **Filtri clienti indipendenti (cert/assic/anag)**
   - **Problema**: i filtri 🏥 Senza certificato / 📋 Senza assicurazione / 📝 Senza anagrafica funzionavano solo se "Mostra lista" era attivo
   - **Fix in `renderClientsTab()`**: aggiunta variabile `hasFilter` — se almeno un filtro è attivo, la lista si visualizza subito senza dover cliccare "Mostra lista"

5. **Fix modifica cliente con filtri attivi**
   - **Problema**: `openEditClientPopup(index)` riceveva l'indice della lista filtrata ma cercava in `getAllClients()` (lista completa) → modificava il profilo sbagliato
   - **Fix**: il popup ora trova il cliente per email/whatsapp invece che per indice:
     ```javascript
     const client = clients.find(c =>
         (email && c.email && c.email.toLowerCase() === email.toLowerCase()) ||
         (whatsapp && c.whatsapp && normalizePhone(c.whatsapp) === normalizePhone(whatsapp))
     ) || clients[index];
     ```

6. **Fix modifica nome senza WhatsApp**
   - Rimosso requisito WhatsApp obbligatorio nella validazione del nome cliente — ora è sufficiente il solo nome

**File modificati/creati:**
- `supabase/migrations/20260317000000_fix_missing_profiles.sql` — backfill 52 profili + fix trigger
- `supabase/migrations/20260317100000_health_check.sql` — RPC health check + health fix
- `js/auth.js` — upsert profilo self-healing, fallback currentUser arricchito
- `js/admin.js` — health check/fix UI, filtri indipendenti, fix edit con filtri, validazione nome
- `admin.html` — sezione health check in Impostazioni, version bump

**Migrazioni SQL da eseguire su Supabase:**
1. `20260317000000_fix_missing_profiles.sql` — backfill profili mancanti + fix trigger handle_new_user
2. `20260317100000_health_check.sql` — RPC admin_health_check + admin_health_fix

---

### 4.55 Fix slot assignment, persistenza client e annullamento da Gestione Orari (sessione 43, mar 2026)

**Contesto:** assegnare un cliente a uno slot prenotato in Gestione Orari falliva con `invalid_capacity`. Dopo il fix, il cliente scompariva al refresh della pagina. Inoltre, rimuovere un cliente dallo slot non annullava la prenotazione su Supabase.

**Cosa è stato fatto:**

1. **Fix `invalid_capacity` per assegnazione cliente a slot**
   - **Problema:** `selectSlotClient` hardcodava `slotType: SLOT_TYPES.GROUP_CLASS` (capacità base 0 in `SLOT_MAX_CAPACITY`), quindi `book_slot_atomic` rifiutava sempre con `invalid_capacity`
   - **Fix 1:** usa `slot.type` (il tipo effettivo dello slot dalla schedule override) invece di hardcodare `GROUP_CLASS`
   - **Fix 2:** aggiunto parametro `overrideCapacity` a `saveBooking()` — `selectSlotClient` passa `currentCount + 1` per garantire che l'admin possa sempre assegnare un cliente

2. **Persistenza client association in `schedule_overrides`**
   - **Problema:** `saveScheduleOverrides` salvava su Supabase solo `date, time, slot_type, extras` — i campi `client` e `bookingId` venivano persi al refresh
   - **Migration `20260317210000_schedule_overrides_client_fields.sql`**: aggiunge 4 colonne a `schedule_overrides`:
     - `client_name TEXT`
     - `client_email TEXT`
     - `client_whatsapp TEXT`
     - `booking_id TEXT`
   - **Save (`saveScheduleOverrides`)**: include sempre `client_name/email/whatsapp` e `booking_id` nella row upsert, impostando `null` esplicitamente quando il client è rimosso (prima ometteva i campi → Supabase manteneva i valori vecchi)
   - **Load (`syncAppSettingsFromSupabase`)**: SELECT e mapping aggiornati per ricostruire `slot.client` e `slot.bookingId` dalla tabella

3. **Fix annullamento booking da `clearSlotClient`**
   - **Bug 1 — `removeBookingById` non sincronizzava su Supabase:** `getAllBookings()` restituiva `this._cache` (riferimento diretto). Le mutazioni in-place rendevano il diff in `replaceAllBookings` invisibile (prev e new puntavano agli stessi oggetti). Fix: `removeBookingById` ora crea un array completamente nuovo via `map()`, così il vecchio cache resta intatto per il confronto
   - **Bug 2 — campi client non azzerati nell'upsert:** quando si rimuoveva il client con `delete slot.client`, i campi non venivano inclusi nella row di upsert → Supabase manteneva i valori vecchi. Fix: invio esplicito di `null` per tutti i campi client/booking_id

4. **Conferme per inserimento e cancellazione in Gestione Orari**
   - **Inserimento:** `confirm()` prima di creare la prenotazione (mostra nome cliente, slot e data)
   - **Cancellazione:** stessa logica di `deleteBooking` in tab Prenotazioni:
     - **Oltre 24h:** `confirm()` semplice + rimborso completo se pagato
     - **Entro 24h:** popup con opzioni bonus/mora (stessa UI `cancel-popup` delle Prenotazioni)
   - Bonus "Sì" auto-seleziona "Senza mora"; mora addebita 50% o rimborsa 50%

5. **Fix `apply_credit_to_past_bookings` — email case-insensitive**
   - **Migration `20260317200000_fix_apply_credit_email_match.sql`**: il lookup sulla tabella `credits` usava `email = v_email` (case-sensitive), mentre i bookings usavano `lower(email)`. Fix: `WHERE lower(trim(email)) = v_email` anche nel SELECT su `credits`

**File modificati/creati:**
- `js/data.js` — `saveBooking` con `overrideCapacity`, `saveScheduleOverrides` con campi client sempre inclusi, `syncAppSettingsFromSupabase` con mapping client, `removeBookingById` con array nuovo via `map()`
- `js/admin.js` — `selectSlotClient` con `slot.type` + confirm + override capacità, `clearSlotClient` con logica cancellazione completa (24h threshold, popup bonus/mora)
- `admin.html` — version bump data.js e admin.js
- `supabase/migrations/20260317200000_fix_apply_credit_email_match.sql` — fix email case-insensitive in RPC
- `supabase/migrations/20260317210000_schedule_overrides_client_fields.sql` — 4 nuove colonne su schedule_overrides

**Migrazioni SQL da eseguire su Supabase:**
1. `20260317200000_fix_apply_credit_email_match.sql` — fix email matching case-insensitive in `apply_credit_to_past_bookings`
2. `20260317210000_schedule_overrides_client_fields.sql` — aggiunge colonne `client_name`, `client_email`, `client_whatsapp`, `booking_id` a `schedule_overrides`

---

### 4.56 Fix link conferma email e configurazione Site URL (sessione 44, mar 2026)

**Contesto:** una nuova utente (Emanuela Zappini) non riusciva ad accedere dopo la registrazione. Aveva cliccato il link di conferma email ma non funzionava, e il login con credenziali restituiva "Email not confirmed". Un secondo utente (Massimiliano Dalò) aveva lo stesso problema.

**Diagnosi:**
- `confirmed_at` era NULL per entrambi gli utenti in `auth.users`
- Il **Site URL** nel dashboard Supabase puntava ancora a un URL non corretto → il link di conferma nell'email reindirizzava nel nulla
- Il codice di registrazione non specificava `emailRedirectTo` → Supabase usava il Site URL di default
- Non c'era gestione del callback di conferma email in `login.html` → anche se il link avesse funzionato, non ci sarebbe stato auto-login

**Cosa è stato fatto:**

1. **Conferma manuale utenti bloccati**
   - Emanuela Zappini (`b6461979-3684-4dcb-9fbb-b164862c23fa`): confermata via SQL `UPDATE auth.users SET email_confirmed_at = now()`
   - Massimiliano Dalò (`581ef39d-3b92-4fee-815f-370315912a55`): confermato con la stessa query
   - Nota: `confirmed_at` è una colonna generata che si aggiorna automaticamente da `email_confirmed_at`

2. **Configurazione Site URL produzione (dashboard Supabase)**
   - **Site URL** → `https://thomasbresciani.com`
   - **Redirect URLs** → `https://thomasbresciani.com/**` (aggiunto ai due esistenti: `/login.html` e `/`)

3. **`emailRedirectTo` nella registrazione (`js/auth.js`)**
   - Aggiunto `emailRedirectTo: window.location.origin + '/login.html'` nelle options di `signUp()`
   - Il link di conferma nell'email ora reindirizza sempre a `login.html` sul dominio corretto

4. **Gestione callback conferma email (`login.html`)**
   - Rilevamento URL di conferma: controlla `type=signup` o `type=email_change` nell'hash dell'URL
   - Flag `window._isEmailConfirmation` settato prima di `initAuth()`
   - Dopo `initAuth()`, se è una conferma email e la sessione è attiva → auto-redirect a `index.html`
   - L'utente viene loggato automaticamente dopo aver cliccato il link di conferma

**Flusso conferma email dopo il fix:**
1. Utente si registra → Supabase invia email con link a `https://thomasbresciani.com/login.html#access_token=...&type=signup`
2. Utente clicca il link → browser apre `login.html`
3. Supabase SDK consuma il token automaticamente e crea la sessione
4. `login.html` rileva `type=signup` nell'hash → auto-redirect a homepage
5. L'utente è loggato e può usare l'app

**File modificati:**
- `js/auth.js` — aggiunto `emailRedirectTo` a `signUp()`
- `login.html` — rilevamento callback conferma email + auto-redirect

---

### 4.57 Notifica push admin su nuova prenotazione e fix apply_credit (sessione 45, mar 2026)

**Contesto:** l'admin voleva ricevere una push notification ogni volta che un utente effettua una nuova prenotazione, con nome del cliente e occupazione dello slot. Inoltre, la RPC `apply_credit_to_past_bookings` non trovava crediti per alcuni utenti a causa di un confronto email case-sensitive.

**Cosa è stato fatto:**

1. **Edge Function `notify-admin-booking`**
   - Nuovo file: `supabase/functions/notify-admin-booking/index.ts`
   - Invia push notification ai due admin hardcoded (`ac72d54b-...`, `cf5f39f3-...`)
   - Titolo: nome del cliente (es. "Mario Rossi")
   - Body: data, orario e occupazione slot (es. "Mer 18 Mar alle 06:00 (3/5)")
   - Occupazione calcolata server-side: count bookings confirmed/cancellation_requested per lo slot
   - CORS headers con `Authorization` per evitare blocco preflight dal browser
   - Pattern identico a `notify-slot-available` (web-push, cleanup 410/404)

2. **Client-side caller (`js/push.js`)**
   - Nuova funzione `notifyAdminBooking(booking)` che chiama la Edge Function
   - Calcola `max_capacity` con `BookingStorage.getEffectiveCapacity()` (gestisce extra spots)
   - Header `Authorization: Bearer SUPABASE_ANON_KEY` per autenticazione Edge Function
   - Log di debug per troubleshooting: log chiamata, risposta server, errori

3. **Hook nel flusso di prenotazione (`js/booking.js`)**
   - Chiamata `notifyAdminBooking(savedBooking)` subito dopo `notificaPrenotazione()` in `handleBookingSubmit()`
   - Solo per prenotazioni utente (non per prenotazioni admin da admin.js)

4. **Fix CORS Edge Function**
   - Il primo deploy restituiva 401 (missing Authorization header) — aggiunto Bearer token nel fetch
   - Il secondo tentativo falliva con errore CORS: `Access-Control-Allow-Headers` non includeva `authorization` — aggiunto e rideployato

5. **Migration `20260317200000_fix_apply_credit_email_match.sql`**
   - Fix `apply_credit_to_past_bookings`: il lookup sulla tabella `credits` usava `email = v_email` (case-sensitive) mentre i bookings usavano `lower(email)`. Se l'email nei credits aveva casing diverso, il credito non veniva trovato
   - Fix: `WHERE lower(trim(email)) = v_email` nel SELECT su credits

6. **Cache version bump su tutte le pagine**
   - `push.js`: v11 → v14 su tutte le 6 pagine HTML
   - `booking.js`: v16 → v18
   - `sw.js`: v92 → v95

**Bug risolti durante la sessione:**

| Bug | Causa | Fix |
|---|---|---|
| Edge Function restituisce 401 | Mancava header `Authorization` nel fetch | Aggiunto `Bearer SUPABASE_ANON_KEY` |
| CORS blocca il fetch | `Access-Control-Allow-Headers` non includeva `authorization` | Aggiunto nella Edge Function e rideployato |
| Notifica non arriva da `prenotazioni.html` | `push.js` aveva versione cache vecchia (v11) | Bump a v13/v14 su tutte le pagine |
| Credito non applicato per alcuni utenti | Confronto email case-sensitive in `apply_credit_to_past_bookings` | `lower(trim(email))` nel WHERE su credits |

**File modificati/creati:**
- `supabase/functions/notify-admin-booking/index.ts` — nuova Edge Function
- `supabase/migrations/20260317200000_fix_apply_credit_email_match.sql` — fix email case-insensitive
- `js/push.js` — funzione `notifyAdminBooking()` con log debug
- `js/booking.js` — chiamata `notifyAdminBooking` dopo prenotazione
- `index.html`, `prenotazioni.html`, `admin.html`, `login.html`, `chi-sono.html`, `dove-sono.html` — bump cache versions push.js
- `sw.js` — bump cache v92 → v95

---

### 4.58 Fix annullamento admin non persistente su Supabase (sessione 46, mar 2026)

**Contesto:** annullando una prenotazione dall'admin (sia >24h che <24h, con o senza mora/bonus), l'operazione sembrava funzionare nella UI ma dopo un refresh la prenotazione ricompariva come `confirmed`. Il database Supabase non veniva mai aggiornato.

**Cosa è stato fatto:**

1. **Root cause analysis**
   - `deleteBooking()` in `admin.js` otteneva l'array prenotazioni con `BookingStorage.getAllBookings()`, che ritorna un **riferimento diretto** a `BookingStorage._cache`
   - Le mutazioni in-place (`bookings[index].status = 'cancelled'`, ecc.) modificavano gli oggetti direttamente dentro `_cache`
   - `replaceAllBookings(bookings)` faceva `const prev = [...this._cache]` per catturare lo stato precedente, ma `prev` conteneva riferimenti agli **stessi oggetti già mutati** — il diff (`p.status !== b.status`) risultava sempre `false`
   - La RPC `admin_update_booking` non veniva mai chiamata → il database restava invariato

2. **Fix: clone dell'array + creazione nuovi oggetti**
   - `const bookings = [...BookingStorage.getAllBookings()]` — crea un nuovo array (diverso da `_cache`)
   - `bookings[index] = { ...booking, status: 'cancelled', ... }` — crea un **nuovo oggetto** invece di mutare in-place
   - Ora `_cache` mantiene i vecchi oggetti, `bookings` ha il nuovo oggetto; `replaceAllBookings` rileva correttamente il cambiamento e chiama la RPC

3. **Entrambi i path corretti**
   - Path >24h (semplice conferma): spread con nuovo oggetto
   - Path <24h (popup mora/bonus): variabile `refundPct` locale + spread con nuovo oggetto — eliminata la mutazione in-place di `cancelledRefundPct`

**File modificati:**
- `js/admin.js` — `deleteBooking()`: clone array + spread oggetti in entrambi i path (>24h e <24h)

---

### 4.59 Ripristino bottone elimina dati cliente e fix filtro (sessione 47, mar 2026)

**Contesto:** il bottone 🗑️ per eliminare tutti i dati di un cliente era scomparso dopo il refactoring del popup "Modifica contatto" (sessione 40). Inoltre, la funzione `deleteClientData()` usava `clients[index]` per trovare il cliente, causando l'eliminazione del cliente sbagliato quando era attivo un filtro nella tab Clienti.

**Cosa è stato fatto:**

1. **Ripristino bottone elimina nel popup Modifica contatto**
   - Aggiunto bottone `🗑️ Elimina` con classe `btn-delete-client` nella sezione `edit-client-popup-actions` del popup
   - Posizionato accanto a "Salva" e "Annulla", spinto a destra con `margin-left: auto` (CSS già esistente)
   - Chiama `deleteClientData()` che richiede password "Palestra123" prima di procedere

2. **Fix deleteClientData con filtro attivo**
   - **Bug:** `deleteClientData()` usava `clients[index]` dove `index` era l'indice nella lista filtrata, ma `getAllClients()` restituisce tutti i clienti → l'indice non corrispondeva al cliente corretto
   - **Fix:** sostituito `clients[index]` con lookup per email/whatsapp (stesso pattern di `openEditClientPopup`), con fallback a `clients[index]` se il match non viene trovato
   - Pattern: `clients.find(c => (email && c.email.toLowerCase() === email.toLowerCase()) || (whatsapp && normalizePhone(c.whatsapp) === normalizePhone(whatsapp)))`

**File modificati:**
- `js/admin.js` — bottone elimina nel popup + fix lookup `deleteClientData`

---

### 4.60 Settimane standard configurabili e Realtime settings (sessione 48, mar 2026)

**Contesto:** la settimana standard (template usato dal bottone "Importa settimana standard" in Gestione Orari) era hardcoded in `DEFAULT_WEEKLY_SCHEDULE` dentro `data.js`. L'admin non poteva modificarla senza toccare il codice. Inoltre, nessuna impostazione admin (soglia debiti, blocchi certificato/assicurazione) si sincronizzava in tempo reale tra dispositivi.

**Cosa è stato fatto:**

1. **3 settimane standard configurabili e rinominabili**
   - Nuova classe `WeekTemplateStorage` in `data.js`: gestisce 3 template con nome, schedule e flag attiva
   - Persistenza: localStorage (cache) + tabella `settings` su Supabase (via `_upsertSetting`)
   - Inizializzazione: le 3 settimane partono come copia di `DEFAULT_WEEKLY_SCHEDULE`
   - `getWeeklySchedule()` aggiornata per caricare dal template attivo invece che dall'hardcoded

2. **Sezione "Settimane Standard" nel tab Impostazioni**
   - 3 card con nome (rinominabile inline con ✏️), riepilogo slot colorato (🟢🟡🔴🧹), badge "Attiva"
   - Bottone "Attiva" per scegliere quale template usare per l'import
   - Bottone "Modifica" apre popup editor modale

3. **Popup editor template (simile a Gestione Orari)**
   - 7 tab giorno (Lun-Dom) con 12 fasce orarie ciascuna
   - Ogni slot configurabile: Autonomia, Lezione di Gruppo, Slot prenotato, Pulizie, o nessuna lezione
   - Salvataggio aggiorna il template e, se attivo, la variabile globale `WEEKLY_SCHEDULE_TEMPLATE`

4. **CSS tema light coerente con Impostazioni**
   - Card e popup inizialmente scritti in dark mode, corretti per tema bianco/grigio coerente col resto del tab

5. **Realtime sync tabella `settings` tra dispositivi**
   - **Bug preesistente:** nessuna impostazione (soglia debiti, blocchi cert/assic) si aggiornava in tempo reale — solo al refresh pagina
   - Aggiunto listener Realtime sulla tabella `settings` in `admin.html` (canale `admin-rt`) e `index.html` (canale `appsettings-rt-calendar`)
   - `admin.html`: dopo sync, ri-renderizza `renderSettingsTab()` e `renderScheduleManager()` se il tab è attivo
   - Migration `20260321200000_settings_realtime.sql`: `alter publication supabase_realtime add table settings`

6. **Backup completo (export/import)**
   - Aggiunte chiavi `gym_week_templates` e `gym_active_week_template` a `BACKUP_KEYS`
   - Aggiunto mapping in `_convertCronToAdminFormat()` per backup formato Nextcloud/cron
   - Il backup automatico GitHub Actions (Nextcloud) già includeva la tabella `settings`

7. **Integrazione con Gestione Orari**
   - Il bottone "Importa settimana standard" ora mostra il nome del template attivo (es. "📥 Importa: Settimana Invernale")
   - `importWeekTemplate()` usa `WEEKLY_SCHEDULE_TEMPLATE` che viene aggiornata automaticamente ad ogni cambio template

**File modificati:**
- `js/data.js` — `WeekTemplateStorage`, aggiornamento `getWeeklySchedule()`, sync Supabase
- `js/admin.js` — UI templates, popup editor, `_getActiveTemplateName()`, fix backup keys/mapping
- `admin.html` — sezione HTML Settimane Standard, listener Realtime `settings`, re-render settings tab
- `index.html` — listener Realtime `settings`
- `css/admin.css` — stili card template + popup editor (tema light)
- `supabase/migrations/20260321200000_settings_realtime.sql` — Realtime per tabella settings

---

### 4.61 Fix bottone "Conferma Prenotazione" bloccato (sessione 49, mar 2026)

**Contesto:** alcuni utenti riportavano il bottone "Conferma Prenotazione" grigio e non cliccabile. Il problema si risolveva solo chiudendo e riaprendo l'app (refresh completo del DOM).

**Causa:** in `handleBookingSubmit()` il bottone viene disabilitato subito (riga 160) per prevenire doppi click. In alcuni percorsi d'errore il bottone non veniva mai riabilitato:
- Percorso "lezione iniziata da più di 30 minuti": `closeBookingModal()` veniva chiamato senza `submitBtn.disabled = false`
- Eccezioni non gestite nelle chiamate async (`saveBooking`, `fulfill_pending_cancellation`, `showConfirmation`): nessun try/catch, quindi il bottone restava disabled

**Cosa è stato fatto:**

1. **Reset bottone in `openBookingModal()`** — ogni volta che il modal si apre, il submit button viene riabilitato e lo stato di loading resettato. Copre qualsiasi caso "stuck" da submit precedenti.

2. **`submitBtn.disabled = false` nel percorso "too late"** — aggiunto prima di `closeBookingModal()` per completezza.

3. **Try/catch/finally sulla parte async** — l'intera sezione da `saveBooking()` alla fine è ora wrappata in try/catch/finally. Il `finally` garantisce che `setLoading(false)` e `submitBtn.disabled = false` vengano sempre eseguiti, anche in caso di eccezioni impreviste.

**File modificati:**
- `js/booking.js` — fix `handleBookingSubmit()` e `openBookingModal()`

---

### 4.62 Migliora notifica push slot disponibile (sessione 50, mar 2026)

**Contesto:** la notifica push inviata quando si libera un posto in uno slot pieno aveva titolo generico ("Slot Disponibile!") e body senza nome del giorno né indicazione dei posti rimasti.

**Cosa è stato fatto:**

1. **Titolo aggiornato** — da "Slot Disponibile!" a "Slot libero disponibile"
2. **Nome giorno nel body** — il giorno della settimana (es. "martedì") viene calcolato dalla data nella Edge Function e preposto al messaggio
3. **Posti disponibili nel body** — il client calcola `spotsAvailable` e `maxCapacity` e li passa alla Edge Function, che li mostra nel formato `(4/5)`
4. **Rimosso "prenota ora"** dal messaggio per renderlo più pulito

**Esempio notifica risultante:**
- Titolo: `Slot libero disponibile`
- Body: `martedì 24 marzo alle 18:00 (4/5)`

**File modificati:**
- `js/push.js` — aggiunto invio `spots_available` e `max_capacity` alla Edge Function
- `supabase/functions/notify-slot-available/index.ts` — nuovo titolo, calcolo giorno settimana, formato posti disponibili

---

### 4.12 Notifiche (pianificate, non ancora implementate)

- Il form di prenotazione simula l'invio di un messaggio WhatsApp (solo `console.log`)
- Decisione presa: usare **email automatiche** (Brevo/Resend, gratis) come canale principale per i promemoria
- WhatsApp come canale futuro opzionale (whatsapp-web.js, se il volume lo giustifica)
- **Notifica locale alla conferma prenotazione:** implementata ✅ (vedi 4.18)
- **Infrastruttura push (subscription + sw handler):** implementata ✅ (vedi 4.18) — manca solo il backend Supabase

---

## 5. Stato attuale del prototipo

| Funzionalità | Stato |
|---|---|
| Calendario pubblico con prenotazione | Funzionante |
| Calendario parte da oggi | Funzionante |
| Dashboard admin con 3 tab | Funzionante |
| Gestione orari settimanali | Funzionante |
| Analytics con filtri per periodo | Funzionante |
| Grafici (linea + torta) | Funzionante |
| Fasce orarie popolari e non popolari | Funzionante |
| % tipi lezione da calendario (non prenotazioni) | Funzionante |
| Dati demo con paymentMethod e paidAt | Funzionante |
| Calendario pre-popolato su browser nuovo | Funzionante |
| Avviso debiti residui anche su pagato parziale | Funzionante |
| Pagina Chi sono | Funzionante |
| Pagina Dove Sono (mappa + indicazioni) | Funzionante |
| Navbar completa su tutte le pagine | Funzionante |
| Persistenza dati | localStorage (solo locale) |
| Autenticazione admin | Password hardcoded (solo demo) |
| Notifiche email | Non implementate |
| Notifiche WhatsApp | Non implementate |
| Supabase CLI installato | Fatto ✅ |
| Schema SQL definito (migrations) | Fatto ✅ |
| Accesso dati centralizzato (BookingStorage) | Fatto ✅ |
| Progetto Supabase cloud creato e collegato | Fatto ✅ |
| Tabelle DB create nel cloud (db push) | Fatto ✅ |
| Login con Google OAuth (Supabase Auth) | Funzionante ✅ |
| Modal "Completa profilo" (WhatsApp dopo OAuth) | Funzionante ✅ |
| Normalizzazione numeri E.164 | Funzionante ✅ |
| Hosting online (GitHub Pages) | https://renumaa.github.io/Palestra ✅ |
| Annullamento prenotazioni (richiesta + conferma automatica) | Funzionante ✅ |
| Rimborso credito su annullamento | Funzionante ✅ |
| Storico prenotazioni annullate in admin Clienti | Funzionante ✅ |
| Badge stato completi in Statistiche & Fatturato | Funzionante ✅ |
| Verifica doppia prenotazione (stesso utente, stessa data+ora) | Funzionante ✅ |
| processPendingCancellations su ogni pagina | Funzionante ✅ |
| Fix annullamento con secondo utente (cancellationRequestedAt preservato) | Funzionante ✅ |
| Bottone annullamento nascosto per lezioni già passate | Funzionante ✅ |
| Blocco prenotazioni entro 2h dall'inizio (UI + submit) | Funzionante ✅ |
| Slot mobile nascosti entro 2h (non renderizzati) | Funzionante ✅ |
| Reset dati azzera anche crediti | Funzionante ✅ |
| Elimina storico credito per singolo cliente | Funzionante ✅ |
| Slot prenotato con cliente obbligatorio in Gestione Orari | Funzionante ✅ |
| Creazione prenotazione reale da admin (slot prenotato) | Funzionante ✅ |
| UserStorage: ricerca clienti in gym_users + gym_bookings | Funzionante ✅ |
| Annullamento slot prenotato: immediato ≥3gg, bloccato <3gg | Funzionante ✅ |
| Conversione slot in Lezione di Gruppo all'annullamento | Funzionante ✅ |
| Fix evidenziazione giorno attivo in Gestione Orari al cambio settimana | Funzionante ✅ |
| Formato data uniforme "Lunedì 2 Marzo 2026" in Le mie prenotazioni | Funzionante ✅ |
| Prenotazioni in corso prenotabili (fine lezione - 30min) | Funzionante ✅ |
| displayAmount su eccedenza pagamento (mostra totale pagato) | Funzionante ✅ |
| "Da pagare" include prenotazioni passate non pagate | Funzionante ✅ |
| Annullamenti admin nello storico transazioni (no splice) | Funzionante ✅ |
| Rimborso credito su annullamento per qualsiasi metodo pagamento | Funzionante ✅ |
| Fix rimborso parziale (prezzo pieno sempre) | Funzionante ✅ |
| getDebtors filtra prenotazioni cancelled | Funzionante ✅ |
| Badge metodo pagamento completi in Le mie prenotazioni | Funzionante ✅ |
| Storico transazioni card cliente admin (con filtri data) | Funzionante ✅ |
| Netting crediti/debiti in Pagamenti (no duplicati nelle due liste) | Funzionante ✅ |
| Saldo netto card cliente (credito - debiti manuali) | Funzionante ✅ |
| Rimozione metodo pagamento dai debiti manuali | Funzionante ✅ |
| Saldo netto barra nome cliente (credito - debiti manuali, verde/rosso) | Funzionante ✅ |
| Totale "pagato" include credito disponibile (prenotazioni + credito) | Funzionante ✅ |
| Badge credito parziale e "Non annullabile" con wrap su mobile | Funzionante ✅ |
| Prenotazioni passate per orario di fine (non solo data) | Funzionante ✅ |
| Cutoff annullamenti: slot prenotato ≥3gg, lezione di gruppo ≥3h | Funzionante ✅ |
| Modifica profilo utente (nome, email, WhatsApp, password, certificato) | Funzionante ✅ |
| Certificato medico: scadenza corrente + storico completo in gym_users | Funzionante ✅ |
| Warning certificato: non impostato / scaduto / imminente (≤30gg) nel profilo | Funzionante ✅ |
| Warning certificato nella card partecipante e scheda cliente admin | Funzionante ✅ |
| Export dati: file .xlsx unico con 6 fogli (SheetJS) | Funzionante ✅ |
| Transazioni: voce positiva per pagamenti carta/contanti/iban | Funzionante ✅ |
| Badge "Segna pagato" cliccabile in Prenotazioni (anche lezioni future) | Funzionante ✅ |
| Popup debiti mostra tutte le lezioni non pagate (passate + future) | Funzionante ✅ |
| Fix cutoff annullamento: Lezione di Gruppo e Autonomia 3h, Slot prenotato 3gg | Funzionante ✅ |
| Fix status cancellation_requested nei rami _isGroupClass | Funzionante ✅ |
| Prezzi: Autonomia €5, Lezione di Gruppo €10, Slot prenotato €50 | Funzionante ✅ |
| Ordinamento prossime per data+ora ASC, passate per data+ora DESC | Funzionante ✅ |
| paidAt export e form modifica: data+ora completa (datetime-local) | Funzionante ✅ |
| PWA installabile (manifest.json + sw.js + meta tags) | Funzionante ✅ |
| Service worker: cache app shell, offline fallback | Funzionante ✅ |
| ui.js: setLoading(), showToast(), showInlineError() | Funzionante ✅ |
| CSS spinner, toast success/error/info | Funzionante ✅ |
| PWA rinominata "Palestra" (manifest + HTML + sw cache) | Funzionante ✅ |
| Fix icona PWA: rimosso maskable, padding automatico Android | Funzionante ✅ |
| Notifica locale conferma prenotazione (Notification API) | Funzionante ✅ |
| Push subscription registrata in localStorage (formato Supabase-ready) | Funzionante ✅ |
| sw.js: handler push per notifiche server-side (Supabase Edge Function) | Pronto ✅ |
| VAPID keys generate, private key in .vapid-keys.txt (fuori repo) | Fatto ✅ |
| .gitignore: esclude .vapid-keys.txt, .env, .claude/ | Fatto ✅ |
| Footer fisso al fondo con flexbox (min-height 100vh) | Funzionante ✅ |
| "powered by Andrea Pompili" nella sidebar mobile | Funzionante ✅ |
| Calendario avanza automaticamente al giorno successivo dopo le 20:30 | Funzionante ✅ |
| Swipe orizzontale su mobile per navigare tra le settimane | Funzionante ✅ |
| Login gate: utenti non loggati vedono "Accedi / Registrati" nel modal di prenotazione | Funzionante ✅ |
| Fix aggiornamento posti mobile dopo prenotazione (renderMobileSlots) | Funzionante ✅ |
| Posti extra per slot in admin Prenotazioni (picker tipo, +1 per click) | Funzionante ✅ |
| Vista split slot desktop calendario (due metà affiancate per tipi misti) | Funzionante ✅ |
| Vista split slot admin Prenotazioni (colonne separate per tipo) | Funzionante ✅ |
| Fix capacità extra tipo diverso: base 0 per tipi non principali | Funzionante ✅ |
| Fix CSS split slot: flex-direction row + align-items stretch (no spazio bianco) | Funzionante ✅ |
| Fix bfcache: pageshow listener su calendar.js e admin.js (dati aggiornati al back/forward) | Funzionante ✅ |
| Service worker: bump a palestra-v2 per forzare reload JS/CSS aggiornati | Fatto ✅ |
| Metodo pagamento "Lezione Gratuita": credito freeBalance, escluso da fatturato | Funzionante ✅ |
| Fix rimborso credito: nessun rimborso automatico se annullamento ancora pendente | Funzionante ✅ |
| Service worker: bump a palestra-v4 | Fatto ✅ |
| Tab giorno rosso in Gestione Orari se slot prenotato senza cliente | Funzionante ✅ |
| Fix logo dark mode: color-scheme light su tutti i punti (navbar, sidebar, login, chi-sono) | Funzionante ✅ |
| Hero name in maiuscolo (THOMAS BRESCIANI) | Fatto ✅ |
| PWA rinominata da "Palestra" a "Gym" (manifest.json + meta tag Apple) | Fatto ✅ |
| Tab Registro: log unificato eventi con filtri, ordinamento, paginazione | Funzionante ✅ |
| Export Excel dal Registro (SheetJS, 13 colonne) | Funzionante ✅ |
| Metodo pagamento salvato come campo dedicato nei crediti (non nelle note) | Funzionante ✅ |
| Fatturato Registro: credit_added (non gratuiti) + booking_paid (no credito, no gratuiti) | Funzionante ✅ |
| Annullamento diretto entro 24h / richiesta nelle ultime 24h (finestre distinte) | Funzionante ✅ |
| Debiti manuali visibili e pagabili nel popup "Segna pagato" del calendario | Funzionante ✅ |
| Fix voce "+€" in Transazioni su pagamento carta/contanti/iban dal popup calendario | Funzionante ✅ |
| Bonus annullamento giornaliero: BonusStorage, cancelWithBonus, UI in prenotazioni.html | Funzionante ✅ |
| Fix bfcache prenotazioni.html: readyState check + pageshow listener | Funzionante ✅ |
| Soglia debito blocco prenotazioni: DebtThresholdStorage, getUnpaidPastDebt, UI admin | Funzionante ✅ |
| Grafici prenotazioni senza simbolo €, proiezione mese corrente | Funzionante ✅ |
| Pannello dettaglio Occupancy (trend Autonomia/Gruppo, tasso per giorno) | Funzionante ✅ |
| Fix occupancy per giorno >100%: dowOccurrences reali, esclusione group-class | Funzionante ✅ |
| Pannello dettaglio Clienti: top attivi, meno attivi, top annullatori, nuovi clienti | Funzionante ✅ |
| Filtro default 1 mese nella scheda cliente (era 1 anno) | Funzionante ✅ |
| Sfondo rosso voci passate non pagate nel popup debiti | Funzionante ✅ |
| Badge "Segna pagato" nascosto se già visibile "Da pagare" | Funzionante ✅ |
| Cert. medico — mini modal + fix salvataggio su ricarica | Funzionante ✅ |
| Fix aggiornamento pannello dettaglio al cambio filtro (null guard tbody) | Funzionante ✅ |
| Backup & Ripristino JSON completo in Impostazioni (15 chiavi localStorage) | Funzionante ✅ |
| Scadenza assicurazione: badge admin, modal, modifica contatto, blocco prenotazione | Funzionante ✅ |
| Assicurazione: campo read-only in "Modifica profilo" su prenotazioni.html | Funzionante ✅ |
| **Supabase Auth — registrazione email+password con conferma email** | Funzionante ✅ |
| **Supabase Auth — login email+password** | Funzionante ✅ |
| **Supabase Auth — logout** | Funzionante ✅ |
| **Supabase Auth — Google OAuth con profilo completo (WhatsApp)** | Funzionante ✅ |
| **Profili utente su tabella Supabase `profiles`** | Funzionante ✅ |
| **Trigger `handle_new_user`: profilo creato automaticamente su signUp** | Funzionante ✅ |
| **RLS configurata su tutte le 7 tabelle** | Configurata ✅ |
| **Brevo SMTP configurato (noreply@thomasbresciani.com)** | Funzionante ✅ |
| **Email di conferma alla registrazione** | Funzionante ✅ |
| **Messaggio "Controlla la tua email" dopo registrazione** | Funzionante ✅ |
| **`initAuth()` su tutte le pagine (navbar aggiornata su ogni pagina)** | Funzionante ✅ |
| **Fix loop redirect login ↔ index** | Risolto ✅ |
| **Fix "Registrazione in corso..." bloccato** | Risolto ✅ |
| **Dual-write booking + app_settings su Supabase** | Funzionante ✅ |
| **Sync da Supabase al page load** | Funzionante ✅ |
| **Supabase Realtime (bookings)** | Funzionante ✅ |
| **RPC `book_slot_atomic` (anti double-booking)** | Funzionante ✅ |
| **RPC `admin_delete_booking` (elimina fisicamente da Supabase)** | Funzionante ✅ |
| **Edge Function `send-reminders` (promemoria 25h + 1h)** | Deployata ✅ |
| **Edge Function `notify-slot-available` (slot libero → push)** | Deployata ✅ |
| **Push notification solo se slot era pieno** | Funzionante ✅ |
| **Esclusione utenti già prenotati dalla notifica slot** | Funzionante ✅ |
| **Banner push non dismissable (ricompare finché non risposta)** | Funzionante ✅ |
| **Admin booking a nome cliente ("Persona")** | Funzionante ✅ |
| **Posto extra aggiunto solo se slot pieno** | Funzionante ✅ |
| **Fix removeExtraSpot con prenotazione attiva** | Risolto ✅ |
| **Fix PWA profilo scompare al refresh (INITIAL_SESSION)** | Risolto ✅ |
| **Fix sync PWA dopo "Elimina Tutti i Dati" (clear tutte le LS keys)** | Risolto ✅ |
| **RPC admin_clear_all_data (DELETE atomico 6 tabelle)** | Funzionante ✅ |
| **RPC admin_add_credit (credito + auto-pay FIFO + debt offset atomici)** | Funzionante ✅ |
| **RPC admin_pay_bookings (paga prenotazioni + debiti + acconto atomici)** | Funzionante ✅ |
| **RPC apply_credit_on_booking (credito su nuova prenotazione, user-side)** | Funzionante ✅ |
| **RPC admin_change_payment_method (8 scenari cambio pagamento atomici)** | Funzionante ✅ |
| **RPC admin_add_debt (debito manuale atomico, fix silent failures)** | Funzionante ✅ |
| **RPC admin_delete_debt_entry (eliminazione voce debito atomica)** | Funzionante ✅ |
| **RPC admin_delete_booking_with_refund (delete booking + rimborso atomici)** | Funzionante ✅ |
| **RPC fulfill_pending_cancellation (FIFO cancel + rimborso, user-side)** | Funzionante ✅ |
| **RPC admin_rename_client (rinomina su tutte le tabelle)** | Funzionante ✅ |
| **cancel_booking_with_refund estesa (mora debito atomico)** | Funzionante ✅ |
| **credit_history: colonne booking_ref, hidden, display_amount** | Aggiunto ✅ |
| **CreditStorage._save debounce 200ms (anti race condition balance)** | Funzionante ✅ |
| **Realtime balance su prenotazioni.html (credits/debts/bonus)** | Funzionante ✅ |
| **RLS SELECT su credits/credit_history per utenti normali** | Funzionante ✅ |
| **Trigger auto_link_credit_user_id (popola user_id su upsert)** | Funzionante ✅ |
| **Viewer emergency mode (prenotazioni/crediti offline + export compatibile)** | Funzionante ✅ |
| **Viewer localStorage persistence + beforeunload warning** | Funzionante ✅ |
| **Viewer profilo tab (certificato, assicurazione, registrazione)** | Funzionante ✅ |
| **Viewer favicon** | Funzionante ✅ |
| **Auto-capitalize nomi su registrazione, profilo, booking, admin edit** | Funzionante ✅ |
| **Password dimenticata — reset via email Supabase** | Funzionante ✅ |
| **Pannello nuova password dopo click link email (PASSWORD_RECOVERY)** | Funzionante ✅ |
| **Cambio email con conferma obbligatoria via email** | Funzionante ✅ |
| **Unique WhatsApp — index DB + RPC `is_whatsapp_taken` + check client** | Funzionante ✅ |
| **Logout scope local (non disconnette altri dispositivi)** | Funzionante ✅ |
| **Rimossa sezione "Accedi come Admin" da login.html** | Fatto ✅ |
| **Auto-fix nomi minuscoli esistenti (Gmail) al login** | Funzionante ✅ |
| **Paginazione "Mostra altro" in Prossime, Passate, Transazioni (5+20)** | Funzionante ✅ |
| **RPC user_request_cancellation (annullamento utente senza admin)** | Funzionante ✅ |
| **Pulsante elimina dati cliente (cestino + password)** | Funzionante ✅ |
| **RPC admin_delete_client_data (elimina bookings/credits/debts/bonus)** | Funzionante ✅ |
| **Fix mappa Google CSP (frame-src maps.google.com)** | Risolto ✅ |

---

## 6. Cosa manca / cosa è da fare

### Priorità alta (bloccante per andare online)

- [x] **PWA base** ✅ (feb 2026)
  - ~~Aggiungere `manifest.json`~~ ✅ (nome, icona, colori, display standalone, start_url, scope)
  - ~~Aggiungere `sw.js`~~ ✅ (cache app shell, Network First per HTML, Cache First per asset)
  - ~~Aggiungere `<link rel="manifest">` in tutti gli HTML~~ ✅
  - ~~Meta tags Apple PWA su tutti gli HTML~~ ✅
  - ~~`js/ui.js`~~ ✅ — `setLoading()`, `showToast()`, `showInlineError()` per loading states e feedback errori
  - ~~CSS spinner, btn-loading, toast (success/error/info)~~ ✅ in `style.css`
  - ~~**⚠️ ATTENZIONE DOMINIO CUSTOM:**~~ ✅ Risolto in sessione 14 — tutti i path `/Palestra/` aggiornati, dominio custom attivo
  - [x] Push Notifications — frontend pronto ✅ (subscription, sw handler, VAPID keys)
    - Manca solo il backend: tabella `push_subscriptions` + Edge Function cron su Supabase
    - Da fare nella fase di migrazione (vedere sezione 4.18 per dettaglio e TODO commentati in `push.js`)

- [ ] **Migrazione da localStorage a Supabase**
  - ~~Installare Supabase CLI~~ ✅
  - ~~Definire schema tabelle (`bookings`, `schedule_overrides`, `credits`)~~ ✅ (in `supabase/migrations/`)
  - ~~Centralizzare accesso dati in `BookingStorage`~~ ✅
  - ~~Creare progetto su supabase.com e fare `supabase db push`~~ ✅
  - ~~**Supabase Auth per utenti: registrazione, login, logout, Google OAuth**~~ ✅ (sessione 19)
  - ~~**Tabella `profiles` su Supabase + trigger auto-creazione profilo**~~ ✅ (sessione 19)
  - ~~**RLS configurata su tutte le 7 tabelle**~~ ✅ (sessione 19)
  - ~~**Brevo SMTP + email di conferma registrazione**~~ ✅ (sessione 19)
  - ~~**Fase 3-5:** Refactor Supabase-first — cache in memoria + sync da Supabase~~ ✅ (sessione 37)
    - BookingStorage, CreditStorage, ManualDebtStorage, BonusStorage, UserStorage ora usano `_cache` in memoria
    - Scritture immediate a Supabase (no debounce), letture dalla cache
    - localStorage mantenuto solo per settings e flags
  - ~~Operazioni multi-step migrate a SQL RPC atomiche~~ ✅ (sessione 25)
  - `processPendingCancellations` → da spostare in Supabase Edge Function schedulata (cron)
  - Il netting credito/debito → da spostare in SQL view per evitare N+1 query

- [ ] **Autenticazione admin sicura**
  - ~~Supabase Auth installata e funzionante per utenti (email+password + Google OAuth)~~ ✅
  - ~~Password admin SHA-256 (non più in chiaro)~~ ✅
  - Autenticazione admin vera (Supabase Auth con ruolo admin o token in variabile d'ambiente)
  - Proteggere le scritture Supabase con RLS per i dati admin (attualmente solo service_role)

- ~~[ ] **Deploy su GitHub Pages**~~ ✅
  - ~~Creare repository GitHub~~ ✅
  - ~~Abilitare GitHub Pages~~ ✅
  - ~~Dominio custom `thomasbresciani.com`~~ ✅ (sessione 14)
  - Sito live: https://thomasbresciani.com

- [x] **Normalizzare numeri WhatsApp — unificazione `normalizePhone`** ✅ (mar 2026)
  - `_normalizePhone` rimosso da `CreditStorage` e `ManualDebtStorage`
  - Tutti i confronti usano `normalizePhone()` di `auth.js` (E.164)

- [ ] **Upload foto certificato medico** (da fare insieme alla migrazione Supabase)
  - Aggiungere input file nel modal "Modifica profilo" di `prenotazioni.html`
  - Compressione client-side prima dell'upload (Canvas API, resize ~1200px, JPEG 0.75) → ~300–600 KB
  - Storage su Supabase bucket `certificates`, path fisso `{user_id}.jpg` (sovrascrittura ad ogni rinnovo)
  - Salvare `cert_file_path` sulla tabella `profiles`
  - RLS: ogni utente legge/scrive solo il proprio file
  - Admin può visualizzare/scaricare il certificato dalla card partecipante
  - Edge Function cron mensile: elimina file dal bucket per certificati scaduti da più di X mesi
  - 180 utenti × ~500 KB = ~90 MB → abbondantemente nel free tier Supabase (1 GB)
  - **Non implementare prima della migrazione** — localStorage non supporta base64 di immagini

### Priorità media (importante per usabilità)

- [ ] **Edge Function schedulata per annullamenti pendenti**
  - Attualmente `processPendingCancellations` gira solo quando qualcuno apre il sito
  - Se nessuno apre il sito nelle 2h prima della lezione, il ripristino a `confirmed` è ritardato
  - Soluzione: Supabase Edge Function con cron ogni 30 minuti che:
    1. Legge prenotazioni `cancellation_requested` con lezione entro 2h
    2. Le imposta a `confirmed` direttamente nel DB
  - Da implementare nella fase di migrazione a Supabase

- [ ] **Notifiche email automatiche**
  - Scegliere provider: Brevo (raccomandato, gratis fino a 300/giorno) o Resend
  - Email di conferma immediata dopo la prenotazione
  - Email promemoria automatica il giorno prima (cron job su Supabase Edge Functions o servizio esterno)
  - Template email con branding TB Training

- [x] **Operazioni atomiche con Postgres RPC (crediti + pagamenti)** ✅ (sessione 25)
  - ~~`admin_add_credit`~~ ✅ — credito manuale + auto-pay FIFO + debt offset
  - ~~`admin_pay_bookings`~~ ✅ — paga prenotazioni selezionate + debiti manuali + acconto
  - ~~`apply_credit_on_booking`~~ ✅ — applica credito su nuova prenotazione (user-side)
  - ~~`admin_change_payment_method`~~ ✅ — cambio metodo pagamento (8 scenari)
  - ~~`admin_clear_all_data`~~ ✅ — elimina tutti i dati atomicamente
  - ~~`admin_add_debt`~~ ✅ — aggiunta debito manuale atomica (fix silent failures)
  - ~~`admin_delete_debt_entry`~~ ✅ — eliminazione voce debito atomica
  - ~~`admin_delete_booking_with_refund`~~ ✅ — eliminazione booking + rimborso atomici
  - ~~`fulfill_pending_cancellation`~~ ✅ — FIFO cancel + rimborso (user-side)
  - ~~`admin_rename_client`~~ ✅ — rinomina cliente su tutte le tabelle atomicamente
  - ~~`cancel_booking_with_refund` estesa~~ ✅ — mora debito atomico su annullamento con penale
  - ~~`cancel_booking_with_refund`~~ ✅ (sessione 24)
  - ~~`book_slot_atomic_validation`~~ ✅ (sessione 23)
  - ~~Tutte le operazioni ora atomiche server-side~~ ✅ (sessione 25 cont.)

- [x] **Validazione server-side** ✅ (sessione 26)
  - ~~Attualmente la validazione è solo lato client~~ → validazione input in tutte le RPC admin
  - ~~Supabase permette constraints a livello di database~~ → constraints su bookings (status, slot_type, payment_method, credit_applied)
  - ~~Verificare che uno slot non venga sovraprenotato (race condition)~~ → `book_slot_atomic` con advisory lock + FOR UPDATE

- [x] **Production hardening completo** ✅ (sessione 26-27)
  - ~~18 issue identificate nell'audit~~ → tutte risolte (OPUS.md)
  - ~~CSP headers~~ ✅ — meta tag su tutte le pagine + wss:// per Realtime
  - ~~Audit trail admin~~ ✅ — tabella `admin_audit_log` + trigger
  - ~~Optimistic locking~~ ✅ — `updated_at` + check stale_data
  - ~~Indexes mancanti~~ ✅ — credit_history, bookings email+status
  - ~~8 bug critici~~ ✅ — booking await, doppio click, fire-and-forget, sync retry, offline, stale rollback, cert blocco

- [ ] **Pagina di conferma prenotazione**
  - Attualmente solo un messaggio inline
  - Creare una pagina dedicata o modal con riepilogo completo
  - Link per aggiungere al calendario (Google Calendar / iCal)

### Priorità bassa (miglioramenti futuri)

- [ ] **Notifiche WhatsApp automatiche** (whatsapp-web.js)
  - Node.js server su Railway (~€5/mese per SIM dedicata)
  - Cron job serale che legge prenotazioni del giorno dopo da Supabase
  - Attenzione: tecnicamente viola i ToS di Meta, usare numero dedicato

- [ ] **Gestione clienti**
  - Lista clienti con storico prenotazioni
  - Profilo cliente con statistiche (frequenza, spesa totale)
  - Possibilità di bloccare/contattare un cliente

- [ ] **Abbonamenti e pacchetti**
  - Gestione pacchetti (es. 10 lezioni) con scalare automatico
  - Scadenza abbonamenti
  - Stato pagamento per abbonato

- [ ] **PWA (Progressive Web App)**
  - Installabile su smartphone
  - Funziona offline (cached)
  - Notifiche push native

- [ ] **Esportazione dati**
  - Export CSV delle prenotazioni (per contabilità)
  - Report mensile automatico via email all'admin

---

## 7. Roadmap verso la produzione

> Ordine concordato nella sessione 9 — da eseguire in sequenza

---

### Fase 0 — Testing e riverifica ✅ completata

- [x] Testare tutte le logiche in uso: prenotazioni, crediti, annullamenti, transazioni
- [x] Scansione sicurezza (XSS, password admin, RLS Supabase)
- [x] Backup & Ripristino JSON — tutti i dati esportabili/importabili

---

### Fase 1 — Dominio + infrastruttura email

- [ ] Acquistare dominio `.it` o `.com` (Aruba / Namecheap)
- [ ] Creare account **Brevo** (gratis, piano free 300 email/giorno)
- [ ] Configurare DNS nel registrar in un'unica sessione:
  - Record A/CNAME → GitHub Pages (attiva dominio custom)
  - Record SPF + DKIM → Brevo (verifica dominio mittente email)
- [ ] Impostare dominio custom in GitHub Pages → SSL automatico Let's Encrypt
- [ ] **Aggiornare tutti i path `/Palestra/` → `/`** nel codice (sw.js, manifest.json, HTML × 6, booking.js, login.html OAuth redirect)
- [ ] Aggiornare URL redirect OAuth in pannello Supabase → Authentication → URL Configuration

---

### Fase 2 — Migrazione Supabase Auth ✅ completata (sessione 19)

- [x] **Supabase Auth per utenti** ✅ — registrazione email+password, login, logout, Google OAuth
- [x] **Tabella `profiles`** ✅ — creata in Supabase; trigger `handle_new_user` crea profilo automaticamente
- [x] **RLS configurata** ✅ — tutte le 7 tabelle protette con policy idempotenti
- [x] **Brevo SMTP** ✅ — `noreply@thomasbresciani.com`, email di conferma registrazione attiva
- [x] **`js/auth.js` riscritto** ✅ — Supabase Auth sostituisce localStorage per sessioni utente
- [x] **`initAuth()` su tutte le pagine** ✅ — navbar mostra stato login/logout corretto ovunque
- [x] **Email recupero password** ✅ — Supabase Auth la gestisce nativamente (link via email)

---

### Fase 3–5 — Migrazione dati Supabase ✅ completata (sessione 37)

**Architettura Supabase-first implementata:**
- Cache in memoria (`_cache`) come source of truth in sessione
- Supabase come source of truth persistente (sync al boot, scritture immediate)
- localStorage mantenuto solo per settings e flags
- RPC atomiche già attive (sessione 25)
- Realtime subscriptions già attive su tutte le pagine (sessione 35)

**Rimane da fare:**
- [ ] `processPendingCancellations` → Edge Function cron (attualmente client-side su ogni pagina)
- [ ] SQL view `v_client_balances` per netting credito/debito
- [ ] `push_subscriptions` → upsert Supabase (codice commentato pronto in `push.js`)

---

### Fase 6 — Notifiche email automatiche

- [ ] Supabase Edge Function schedulata (cron) — gira ogni sera alle 20:00
- [ ] Legge tutte le prenotazioni del giorno dopo da PostgreSQL
- [ ] Invia email promemoria via Brevo per ogni prenotazione trovata (SMTP già configurato ✅)
- [ ] Email di conferma immediata alla prenotazione (trigger su INSERT in `bookings`)
- [ ] Template email in italiano con branding TB Training

---

### Fase 7 — Funzionalità future

- [ ] Upload foto certificato medico (Supabase Storage)
- [ ] Notifiche WhatsApp (whatsapp-web.js su Railway)
- [ ] Gestione abbonamenti / pacchetti lezioni
- [ ] Pagamenti online (Stripe)

---

## 8. Architettura target (produzione)

```
┌─────────────────────────────────────────────────────────┐
│                     CLIENTE                              │
│  Apre il sito da smartphone o PC                        │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTPS
                        ▼
┌─────────────────────────────────────────────────────────┐
│              GITHUB PAGES (gratis)                       │
│  HTML + CSS + JS statici                                │
│  index.html, admin.html, js/, css/                      │
└───────────────────────┬─────────────────────────────────┘
                        │ fetch() / REST API
                        ▼
┌─────────────────────────────────────────────────────────┐
│              SUPABASE (gratis)                           │
│  PostgreSQL database                                    │
│  Tabelle: bookings, schedule_overrides                  │
│  Auth: login admin                                      │
│  RLS: regole di sicurezza per dati                      │
│  Edge Functions: cron job per email promemoria          │
└───────────────────────┬─────────────────────────────────┘
                        │ API call
                        ▼
┌─────────────────────────────────────────────────────────┐
│              BREVO / RESEND (gratis)                     │
│  Invio email transazionali                              │
│  Conferma prenotazione                                  │
│  Promemoria giorno prima                                │
└─────────────────────────────────────────────────────────┘

(futuro)
┌─────────────────────────────────────────────────────────┐
│              RAILWAY (free tier / ~€5/mese SIM)         │
│  Node.js + whatsapp-web.js                              │
│  Cron serale → legge Supabase → manda WhatsApp          │
└─────────────────────────────────────────────────────────┘
```

**Costo totale stimato in produzione:**
- Fase 1+2: **€0/mese** (tutti servizi gratuiti)
- Fase 4 con WhatsApp: **~€5/mese** (solo SIM dedicata)

---

## 9. Decisioni prese

| Decisione | Scelta | Motivazione |
|---|---|---|
| Database | Supabase | Gratis, PostgreSQL robusto, Auth integrata, Edge Functions per cron |
| Hosting frontend | GitHub Pages | Gratis, deploy automatico, HTTPS incluso |
| Notifiche | Email (Brevo/Resend) | Gratis, affidabile, nessun rischio ban |
| WhatsApp | Futuro, non ora | Rischio ban account, complessità aggiuntiva, email sufficiente per iniziare |
| Grafici | Canvas API custom | Nessuna dipendenza esterna, controllo totale |
| Framework frontend | Nessuno (vanilla JS) | Semplicità, nessuna build chain, deploy immediato su Pages |
| WhatsApp library | whatsapp-web.js (se implementata) | Gratis, ma necessita SIM dedicata e accetta rischio ToS |
| Auth utenti | Supabase Auth (email+password + Google OAuth) | Gratis, sicuro, gestisce token/sessioni/reset-password/conferma email nativamente |
| Profili utente | Tabella `profiles` su Supabase + trigger `handle_new_user` | Trigger SECURITY DEFINER bypassa RLS → profilo sempre creato anche se la sessione non è ancora stabile |
| Email transazionale | Brevo SMTP (`noreply@thomasbresciani.com`) | Dominio già autenticato, 300 email/giorno gratis, deliverability ottima |
| Conferma email alla registrazione | Abilitata (Supabase → Authentication → Email) | Previene account falsi; messaggio "Controlla la tua email" mostrato dopo signup |
| `window._currentUser` | Cache in memoria popolata da `initAuth()` | Mantiene `getCurrentUser()` sincrono per compatibilità con tutto il codice esistente |
| Timing migrazione Supabase | In fasi: Auth (✅ fatto) → bookings → crediti → admin | Riduce rischio: ogni fase è testabile indipendentemente; bfcache e async gestiti in modo incrementale |
| Formato numeri WhatsApp | E.164 (`+39XXXXXXXXXX`) | Standard richiesto da WhatsApp Business API; normalizzazione automatica lato client |
| Apple Sign In | Non implementato | Richiede Apple Developer account a pagamento ($99/anno); Google + Facebook coprono la maggior parte degli utenti |
| Recupero password e conflitto Google/email | Rimandato a Supabase | Supabase Auth gestisce reset via email e account linking nativamente; inutile costruirlo su localStorage |
| Schema `gym_users` per certificato medico | `certificatoMedicoScadenza` + `certificatoMedicoHistory` | Storico completo mantenuto anche dopo aggiornamenti; migrazione: colonna `cert_expiry` su tabella `profiles` in Supabase |

---

---

## 10. Analisi rischi migrazione Supabase

> Aggiornata al 26/02/2026 — include tutte le funzionalità sviluppate fino alla sezione 4.15

### 10.1 Schema SQL incompleto

Il migration attuale (`20260225000000_init.sql`) **non copre** tutto ciò che è stato aggiunto dopo:

| Problema | Dettaglio | Fix richiesto |
|---|---|---|
| Colonne mancanti su `bookings` | Mancano `status`, `cancellation_requested_at`, `cancelled_at`, `credit_applied`, `paid_at` | Nuovo migration con `ALTER TABLE bookings ADD COLUMN ...` |
| Tabella `manual_debts` assente | `ManualDebtStorage` (debiti manuali admin) non ha tabella né storico nel DB | Creare tabelle `manual_debts` e `manual_debt_history` |
| Colonna `display_amount` su `credit_history` | Usata per le eccedenze di pagamento | `ALTER TABLE credit_history ADD COLUMN display_amount numeric` |
| `bookingId` negli `schedule_overrides` | Il campo `client` e `bookingId` negli override (slot prenotato) non è nel migration | `ALTER TABLE schedule_overrides ADD COLUMN client_booking_id uuid` |

### 10.2 Race conditions critiche

Con localStorage tutto è **sincrono e locale** — non ci sono race conditions. Con Supabase ogni operazione è asincrona e il DB è condiviso. I flussi multi-step attuali **diventano pericolosi**:

**`fulfillPendingCancellations`** (chiamato ad ogni nuova prenotazione):
```
INSERT booking → SELECT pending cancellations → UPDATE old booking status → INSERT credit_history
```
Se uno step fallisce a metà: nuova prenotazione salvata, vecchia non cancellata, credito non rimborsato.

**`deleteBooking` admin** (annullamento con rimborso):
```
UPDATE booking status='cancelled' → INSERT credit_history
```
Se fallisce dopo l'UPDATE: booking cancellata senza rimborso credito.

**`processPendingCancellations`** (gira su ogni pagina DOMContentLoaded):
```
SELECT cancellation_requested WHERE lessonStart < now+2h → UPDATE status='confirmed'
```
Con DB condiviso: due browser aperti contemporaneamente potrebbero aggiornare le stesse righe in doppio.

**Soluzione necessaria:** tutte e tre diventano **Supabase RPC** (funzioni SQL):
```sql
-- Esempio
CREATE FUNCTION fulfill_pending_cancellations(p_date text, p_time text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- tutto in una singola transazione atomica
END;
$$;
```
Chiamata dal client: `supabase.rpc('fulfill_pending_cancellations', { p_date, p_time })`

### 10.3 `processPendingCancellations` non funziona lato client con DB condiviso

Attualmente viene chiamato in `DOMContentLoaded` di `data.js` (ogni pagina), `renderCalendar()`, `renderAdminDayView()`, `loadDashboardData()`.

Con Supabase:
- **Non va bene** richiamarla dal browser: il DB è condiviso, nessuna garanzia di chi la chiama e quando
- **Soluzione:** Supabase Edge Function schedulata (cron ogni 10-15 minuti):
  ```ts
  // supabase/functions/process-cancellations/index.ts
  Deno.cron("process-cancellations", "*/10 * * * *", async () => {
    // UPDATE bookings SET status='confirmed' WHERE status='cancellation_requested'
    // AND lesson_datetime < now() + interval '2 hours'
  });
  ```
- Dal lato client si può **lasciare** la chiamata come fallback ottimistico (non fa danni se gira, peggio è se non gira mai)

### 10.4 Query N+1 — performance su dataset reali

I calcoli attuali caricano tutto in memoria e iterano in JS. Con Supabase su dataset reali:

| Funzione | Problema attuale | Soluzione |
|---|---|---|
| `getDebtors()` | Carica tutti i booking → raggruppa in JS → 1 query CreditStorage per cliente | SQL view `v_client_balances` con GROUP BY e JOIN |
| `renderPaymentsTab()` | 3 sorgenti dati separate in sequenza | SQL view con JOIN su `bookings`, `credits`, `manual_debts` |
| `getAllClients()` | Carica TUTTI i booking in memoria | Query paginata con LIMIT/OFFSET |
| Netting credito/debito | Fatto in JS con 3 `getBalance()` separati | SQL: `credit_balance - SUM(unpaid_bookings) - manual_debt_balance` in view |

**SQL view suggerita:**
```sql
CREATE VIEW v_client_balances AS
SELECT
  b.email,
  b.whatsapp,
  b.name,
  COALESCE(c.balance, 0) AS credit_balance,
  COALESCE(md.balance, 0) AS manual_debt,
  SUM(CASE WHEN b.paid = false AND b.status NOT IN ('cancelled','cancellation_requested') THEN price ELSE 0 END) AS unpaid_bookings,
  COALESCE(c.balance, 0) - COALESCE(md.balance, 0) - SUM(...) AS net_balance
FROM bookings b
LEFT JOIN credits c ON ...
LEFT JOIN manual_debts md ON ...
GROUP BY b.email, b.whatsapp, b.name, c.balance, md.balance;
```

### 10.5 `ManualDebtStorage` — completamente fuori schema

`ManualDebtStorage` gestisce debiti manuali con storico (aggiunto/saldato, metodo, nota). Nello schema SQL attuale non esiste nulla di equivalente.

**Tabelle da creare:**
```sql
CREATE TABLE manual_debts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  whatsapp text,
  email text,
  balance numeric DEFAULT 0
);

CREATE TABLE manual_debt_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manual_debt_id uuid REFERENCES manual_debts(id),
  amount numeric NOT NULL,  -- positivo=debito, negativo=pagamento
  note text,
  method text,              -- contanti|carta|iban (opzionale, solo display)
  created_at timestamptz DEFAULT now()
);
```

### 10.6 Riepilogo — lista completa cose da fare prima della migrazione

1. **Nuovo migration SQL** con tutte le colonne mancanti su `bookings`, `credit_history`, `schedule_overrides`
2. **Nuove tabelle** `manual_debts` + `manual_debt_history`
3. **SQL RPC functions:** `fulfill_pending_cancellations`, `cancel_booking_with_refund`, `process_pending_cancellations`
4. **SQL view** `v_client_balances` per netting e liste Pagamenti
5. **Edge Function cron** per `processPendingCancellations` ogni 10 minuti
6. **Riscrivere** `data.js` con async/await su tutti i metodi
7. **Aggiungere loading states** nell'UI (scheletri o spinner sui tab che aspettano dati)

**Stima impatto:** la logica di business è già corretta e centralizzata in `data.js`. I punti 1-2 sono modifiche DB, il punto 3 è ~100 righe di SQL, i punti 4-5 sono ~50 righe ciascuno. Il punto 6 (riscrittura async) è il lavoro più lungo ma meccanico. Complessivamente: 3-5 giorni di lavoro concentrato.

---

---

## 11. Compatibilità con Supabase Free Tier

> Analisi aggiornata al 01/03/2026

### 11.1 Limiti Supabase Free (2026)

| Risorsa | Limite |
|---|---|
| Database storage | 500 MB |
| Connessioni simultanee | 20 dirette / 200 con connection pooling |
| Auth MAU | 50.000 utenti attivi/mese |
| Email Auth rate limit (SMTP default) | **2 email/ora** (signup, recovery) |
| Edge Function invocazioni | 500.000/mese |
| Edge Function CPU time | **2 secondi** per esecuzione |
| Storage file | 1 GB |
| Egress | 5 GB/mese |
| Realtime connessioni | 200 simultanee |
| Backup automatici | **Nessuno** |
| **Pausa per inattività** | **7 giorni senza richieste API** |
| Progetti attivi | 2 per account |

---

### 11.2 Analisi per il progetto TB Training

| Aspetto | Compatibilità | Note |
|---|---|---|
| Database storage | ✅ Abbondante | Stimato <3 MB anche dopo anni (500 prenotazioni/anno × ~1 KB) |
| Auth MAU | ✅ Perfetto | 50.000 MAU vs ~50–200 utenti reali |
| Google OAuth | ✅ Nessun problema | Nessuna email generata lato Supabase |
| Email signup/recovery | ⚠️ Risolto con SMTP custom | Vedi sezione 11.3 |
| Edge Functions (cron) | ✅ Sufficiente | ~5.000/mese stimate vs 500.000 incluse |
| Edge Function CPU time | ⚠️ Da monitorare | 2s per exec; ok per DB piccolo |
| Storage certificati medici | ✅ Abbondante | ~90 MB previsti (180 utenti × 500 KB) vs 1 GB |
| Egress | ✅ Sufficiente | Traffico minimo per una palestra locale |
| **Pausa 7 giorni** | 🔴 **Richiede workaround** | Vedi sezione 11.4 |
| Backup automatici | 🟡 Richiede workaround | Vedi sezione 11.5 |
| SLA | 🟡 Nessuna | Accettabile in fase early-stage |

---

### 11.3 Email Auth rate limit — Soluzione: SMTP personalizzato

Il limite di **2 email/ora** si applica **solo all'SMTP di default di Supabase** (condiviso tra tutti i progetti free). Si risolve configurando Brevo o Resend come SMTP personalizzato — già previsti nel progetto per le notifiche (sezione Fase 2).

**Configurazione (5 minuti):**
Dashboard Supabase → **Auth → Settings → SMTP Settings** → inserire credenziali Brevo o Resend.

| Provider | Free tier | Limite dopo configurazione |
|---|---|---|
| **Brevo** | 300 email/giorno, 9.000/mese | Nessun limite Supabase |
| **Resend** | 100 email/giorno, 3.000/mese | Nessun limite Supabase |

**Nota importante:** gli utenti che si iscrivono tramite Google OAuth (flusso principale) non generano alcuna email di Auth — Google gestisce tutto. Il limite riguarda solo la registrazione email+password manuale (flusso secondario). Con SMTP personalizzato, il problema scompare anche al lancio con molte iscrizioni simultanee.

**⚠️ Da fare prima del go-live:** configurare SMTP personalizzato in Supabase Auth Settings.

---

### 11.4 Pausa automatica dopo 7 giorni di inattività — Soluzione: Uptime Robot

Supabase mette in pausa i progetti free che non ricevono richieste API per 7 giorni consecutivi. Il DB torna online alla prima visita successiva con un ritardo di 15–30 secondi.

**Impatto reale:** durante vacanze del trainer o chiusura stagionale, il sito potrebbe non ricevere traffico per più di 7 giorni. Il primo cliente che accede dopo la pausa trova errori o lentezza.

**Soluzione: Uptime Robot (gratuito)**
1. Registrarsi su [uptimerobot.com](https://uptimerobot.com)
2. Creare un monitor HTTP verso l'endpoint Supabase (es. `https://ppymuuyoveyyoswcimck.supabase.co/rest/v1/bookings?select=count&limit=1` con l'`anon key` nell'header)
3. Intervallo: ogni 5 minuti (gratis)
4. Risultato: il progetto non va mai in pausa

**⚠️ Da fare prima del go-live:** configurare Uptime Robot.

---

### 11.5 Backup — Soluzione: pg_dump via GitHub Actions

Sul free tier non ci sono backup automatici scaricabili. I dati dei clienti (prenotazioni, crediti, debiti) non hanno protezione automatica.

**Soluzione: GitHub Actions settimanale (gratuito)**
- Workflow cron che esegue `pg_dump` sulla connection string Supabase
- Salva il dump su repository privato GitHub o Nextcloud
- Costo: zero (GitHub Actions è gratis per repository privati fino a 2.000 minuti/mese)

**⚠️ Da fare dopo la migrazione a Supabase:** configurare il workflow di backup.

---

### 11.6 Riepilogo azioni necessarie prima del go-live

| Priorità | Azione | Tempo stimato |
|---|---|---|
| 🔴 Alta | Configurare SMTP personalizzato (Brevo/Resend) in Supabase Auth Settings | 5 minuti |
| 🔴 Alta | Configurare Uptime Robot per evitare pausa inattività | 5 minuti |
| 🟡 Media | Configurare backup settimanale via GitHub Actions + pg_dump | 30 minuti |

**Conclusione:** il progetto è pienamente compatibile con il free tier di Supabase per le dimensioni di una palestra locale. Con le tre azioni sopra, tutti i rischi concreti vengono eliminati o mitigati — costo totale: **€0/mese**.

---

## 12. Sessione 23 marzo 2026 — Fix stabilità PWA e bottone prenotazione

### 12.1 Fix bottone "Conferma prenotazione" bloccato

**Problema:** molti utenti riportavano il tasto conferma prenotazione che si "impallava", costringendoli a chiudere e riaprire l'app.

**Cause identificate:**
- Nessun timeout sulle chiamate Supabase RPC (`book_slot_atomic`): su rete lenta il `fetch` restava appeso indefinitamente
- Il `try/catch/finally` non copriva l'intero flusso di `handleBookingSubmit` — errori nella fase di validazione (righe 164-319) lasciavano il bottone disabilitato
- Il duplicate check Supabase (query `bookings`) non aveva timeout

**Fix applicati:**
- **Timeout 45s** con `AbortController` sulla RPC `book_slot_atomic` in `data.js`
- **Timeout 10s** con `AbortController` sul duplicate check in `booking.js`
- **try/catch/finally globale** che wrappa l'intera funzione `handleBookingSubmit` dal momento della disabilitazione del bottone
- **Avviso "Connessione lenta, attendi..."** dopo 15 secondi (toast warning)
- **Safety timeout 50s** che sblocca il bottone forzatamente se tutto il resto fallisce

### 12.2 Service Worker — strategia caching JS

**Problema:** gli utenti non ricevevano aggiornamenti JS (Cache First serviva sempre la versione vecchia), poi il passaggio a Network First causava calendario vuoto su rete lenta.

**Evoluzione:**
1. **Cache First** (originale) → utenti bloccati su JS vecchio
2. **Network First** (primo fix) → calendario vuoto su rete lenta perché aspettava il server
3. **Stale-While-Revalidate** (fix definitivo) → serve dalla cache istantaneamente, aggiorna in background

**Fix aggiuntivo critico:** aggiunto `{ ignoreSearch: true }` a tutti i `caches.match()`. Il SW pre-cachava `/js/calendar.js` ma l'HTML richiedeva `/js/calendar.js?v=5` — il query string impediva il match e la cache non veniva mai usata per i nuovi utenti.

### 12.3 Crash data.js per nuovi utenti (BUG PRINCIPALE)

**Problema:** tutti i nuovi iscritti vedevano il calendario completamente vuoto — nessun giorno, nessuno slot, nessun bottone "Accedi".

**Causa:** in `data.js` riga 257, la funzione `getWeeklySchedule()` (chiamata a riga 264 durante l'inizializzazione del modulo) faceva riferimento a `BookingStorage._scheduleOverridesCache = null` — ma la classe `BookingStorage` era definita solo a riga 267. Per gli utenti esistenti non crashava perché il `return` avveniva prima (localStorage popolato). Per i nuovi utenti (localStorage vuoto) il codice arrivava alla riga 257 → `ReferenceError: Cannot access 'BookingStorage' before initialization` → tutto il JS si bloccava.

**Fix:** rimossa la riga `BookingStorage._scheduleOverridesCache = null` da `getWeeklySchedule()` (non necessaria, la proprietà statica è già `null` per default nella definizione della classe).

### 12.4 Sync Supabase resiliente

**Problema:** `syncAppSettingsFromSupabase()` usava `Promise.all` per 7 query parallele. Se una qualsiasi falliva (timeout, RLS, rete), tutte le altre venivano scartate — incluso `schedule_overrides` che serve per il calendario.

**Fix:** sostituito `Promise.all` con `Promise.allSettled`. Ogni query è indipendente: se `credits` o `credit_history` falliscono, `schedule_overrides` e `settings` vengono caricati comunque.

### 12.5 Calendario visibile senza login

**Problema:** `prenotazioni.html` redirigeva a `login.html` se l'utente non era loggato. Il calendario su `index.html` aspettava il completamento di `initAuth()` (fino a 6-8 secondi per utenti non autenticati) prima di renderizzare.

**Fix:**
- Rimosso il redirect a `login.html` da `prenotazioni.html` — il calendario è visibile a tutti, la prenotazione richiede login (gestito dal modale con banner "Accedi/Registrati")
- Aggiunto render immediato del calendario da localStorage prima del boot async in `index.html`

### 12.6 Push notifications

**Problema:** le notifiche push non arrivavano dopo aver disattivato/riattivato le notifiche di Chrome. Il banner "Abilita notifiche" appariva solo su `index.html`.

**Fix:**
- `promptPushPermission()` aggiunta anche a `prenotazioni.html` e `admin.html`
- Committata la migration SQL `push_subscription_cleanup` che elimina le subscription stale (stesso push-service origin, endpoint diverso)
- Committate le modifiche a `push.js`: retry auth dopo 3s, rinnovo forzato subscription se localStorage vuoto

### 12.7 Service Worker update

**Configurazione attuale:**
- Check aggiornamenti **una sola volta all'apertura** dell'app (non più polling ogni 15/60s)
- Bump `CACHE_NAME` ad ogni deploy (regola documentata in memoria Claude)
- CSS incluso nella strategia Stale-While-Revalidate insieme ai JS

### 12.8 Riepilogo file modificati

| File | Modifiche |
|---|---|
| `js/booking.js` | try/catch/finally globale, safety timeout, avviso connessione lenta |
| `js/data.js` | Fix crash `BookingStorage` before init, timeout `AbortController` su RPC, `Promise.allSettled` |
| `js/push.js` | Retry auth, rinnovo subscription, backup localStorage |
| `js/sw-update.js` | Check aggiornamenti solo all'apertura |
| `sw.js` | Stale-While-Revalidate per JS/CSS, `ignoreSearch: true`, bump cache |
| `index.html` | Render calendario immediato prima del boot async |
| `prenotazioni.html` | Rimosso redirect login, aggiunto `promptPushPermission` |
| `admin.html` | Aggiunto `promptPushPermission` |
| `supabase/migrations/20260323100000_push_subscription_cleanup.sql` | Cleanup endpoint stale |

---

*Documento generato durante le sessioni di sviluppo con Claude Code.*
