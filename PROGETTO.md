# TB Training — Diario di Sviluppo & Roadmap

> Documento aggiornato al 14/03/2026 (sessione 33)
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

**Obiettivo finale:** sistema funzionante online, con database reale, notifiche email automatiche il giorno prima della lezione, e possibilmente notifiche WhatsApp in futuro.

---

## 2. Stack tecnologico attuale

| Componente | Tecnologia | Note |
|---|---|---|
| Frontend | HTML5 + CSS3 + JavaScript vanilla | Nessuna dipendenza esterna |
| Persistenza dati | localStorage | Solo per il prototipo |
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

### 4.1 Pagina pubblica (index.html)

**Calendario settimanale desktop:**
- Visualizzazione 7 giorni con colonne per ogni giorno
- Slot colorati per tipo: Personal Training (rosso), Small Group (azzurro), Lezione di Gruppo (giallo)
- Contatore posti disponibili con pallini colorati
- Slot disabilitati se pieni o passati

**Calendario mobile:**
- Selezione giorno tramite slider orizzontale
- Card verticali per ogni slot
- Input ottimizzati per touch (niente zoom iOS)

**Calendario parte dal giorno attuale:**
- Precedentemente il calendario mostrava sempre la settimana da lunedì, inclusi i giorni passati
- Ora il primo giorno disponibile è sempre **oggi**, e si può solo andare avanti
- Il pulsante "settimana precedente" è disabilitato alla settimana corrente (opacity 0.3, cursor not-allowed)
- I nomi dei giorni sul selettore mobile ora usano correttamente `date.getDay()` (con array domenica-primo) invece dell'indice fisso che assumeva lunedì come primo giorno

**Form prenotazione:**
- Campi: nome, email, WhatsApp
- Validazione lato client
- Conferma immediata
- Dati salvati in localStorage

---

### 4.2 Dashboard Admin (admin.html)

**Accesso:**
- Password hardcoded `admin123` (solo per demo)
- Da sostituire con autenticazione vera in produzione

**Tab 1 — Prenotazioni:**
- Calendario settimanale con navigazione giorno per giorno
- Per ogni slot: elenco partecipanti con nome e numero WhatsApp
- Checkbox pagamento per ogni persona
- Note aggiuntive se presenti
- Contatore posti occupati/disponibili

**Tab 2 — Gestione Orari:**
- Navigazione settimana per settimana (passato e futuro)
- Tutti i 16 time slot (06:00–22:00) sempre visibili
- Dropdown per assegnare tipo lezione a ogni slot
- Sistema di override: possibile personalizzare orari per date specifiche
- Auto-save immediato delle modifiche
- Logica intelligente: usa template settimanale se non ci sono override

**Tab 3 — Analitiche:**
- Stats card: Prenotazioni totali, Fatturato, Occupazione media, Clienti unici
- Ogni stat mostra la variazione % rispetto al periodo precedente (badge verde/rosso)
- Grafico a linea: trend prenotazioni (vista giornaliera per ≤60 giorni, mensile per >60)
- Grafico a torta: distribuzione prenotazioni per tipo di lezione
- Tabella prenotazioni recenti (ultime 15, ordinate per data)
- Fasce orarie più popolari (bar chart orizzontale)

**Filtri analytics:**
- Questo mese
- Mese scorso
- Quest'anno
- Anno scorso
- Personalizzato (con date picker from/to e pulsante Applica)
- Tutti i grafici e le stats si aggiornano rispettando il filtro selezionato

---

### 4.3 Dati demo (data.js)

- Genera automaticamente ~150–200 prenotazioni casuali per gli ultimi 90 giorni e i prossimi 14 giorni
- ~3% delle prenotazioni passate risultano non pagate (simulazione realistica)
- Prezzi: Personal Training €50, Small Group €30, Lezione di Gruppo €20
- Sistema di flag `dataClearedByUser` in localStorage: se l'admin ha cancellato i dati manualmente, i dati demo non vengono rigenerati automaticamente al prossimo accesso

---

### 4.4 Grafici (chart-mini.js)

Libreria Canvas custom, nessuna dipendenza esterna.

**Bug risolti:**
- Quando il tab analytics era nascosto, `offsetWidth/offsetHeight` valevano 0, il che causava un radius negativo nel grafico a torta → `ctx.arc()` lanciava `IndexSizeError` → l'intera funzione `loadDashboardData` si bloccava, lasciando vuoti anche tabella e fasce orarie
- Fix 1: costruttore usa dimensioni fallback (400×250) quando offset è 0
- Fix 2: guard `if (radius <= 0) return` in `drawPieChart`
- Fix 3: `switchTab('analytics')` usa `setTimeout(50ms)` per aspettare che il browser calcoli il layout prima di leggere `offsetWidth`
- Fix 4: all'avvio, la dashboard chiama `updateNonChartData()` invece di `loadDashboardData()`, evitando di disegnare grafici su tab nascosti

---

### 4.5 Miglioramenti UI e nuove pagine (feb 2026)

**Grafici Statistiche (chart-mini.js + admin.js):**
- Fix canvas: costruttore usa `getBoundingClientRect()` per la larghezza reale post-CSS; `canvas { width: 100% !important }`
- Aggiunto titoli h3 alle card grafici ("Prenotazioni nel tempo", "Distribuzione per tipo")
- Fix grafico torta: la % "Slot Prenotato" (GROUP_CLASS) era sempre 0% perché si leggevano le prenotazioni invece degli slot nel calendario. Ora `countGroupClassSlots()` itera i giorni usando `scheduleOverrides` con fallback a `DEFAULT_WEEKLY_SCHEDULE`
- Aggiunto due card sotto i grafici: **Fasce Orarie Popolari** (top 5, cyan) e **Fasce Orarie Non Popolari** (bottom 5, grigio, ordine inverso). Ogni card usa il proprio massimo locale per lo scaling delle barre

**Pagamenti e debiti (admin.js):**
- Fix debiti residui: `getUnpaidAmountForContact` ora viene sempre chiamata indipendentemente da `isPaid`, così le card mostrano l'avviso di debito residuo anche su prenotazioni parzialmente pagate

**Dati demo (data.js):**
- I booking demo includono ora `paymentMethod` (60% contanti / 25% carta / 15% iban) e `paidAt` (ISO timestamp entro 72h dalla fine della lezione)
- `initializeDemoData()` pre-popola 3 settimane di `scheduleOverrides` dalla settimana corrente, così il calendario non risulta vuoto su un browser mai usato prima

**Login admin (admin.css + admin.html):**
- Rimosso lucchetto e sottotitolo dalla pagina di accesso
- Logo aumentato da 60px a 80px
- Box di login spostato in alto: `padding-bottom: 12vh` desktop, `28vh` mobile
- Rimosso il pulsante "Cerca" dalla ricerca pagamenti (era inutile e confondeva su mobile)

**Pagina "Dove Sono" (dove-sono.html + css/dove-sono.css):**
- Hero con icona 📍 animata, indirizzo, due CTA (Google Maps + WhatsApp)
- Mappa Google Maps embed (`Via San Rocco 1, Sabbio Chiese BS`)
- 4 info card: 🚗 In auto, 🅿️ Parcheggio, 🚌 Con i mezzi, 🚶 A piedi
- Sezione contatti & orari settimanali su sfondo scuro
- CTA con link al calendario

---

### 4.6 Preparazione e attivazione Supabase (feb 2026)

**Supabase CLI installato su Windows.**

**Schema SQL definito in `supabase/migrations/20260225000000_init.sql`:**
- Tabella `bookings`: id, date, time, slot_type, name, email, whatsapp, notes, paid, payment_method, paid_at
- Tabella `schedule_overrides`: id, date, time, slot_type (unique su date+time)
- Tabella `credits`: id, name, whatsapp, email, balance
- Tabella `credit_history`: id, credit_id (FK), amount, note
- RLS abilitato su tutte le tabelle con policy pubbliche per lettura e inserimento prenotazioni

**Accesso dati centralizzato in `data.js`:**
- Aggiunti metodi statici a `BookingStorage`:
  - `getScheduleOverrides()` — lettura centralizzata degli override orari
  - `saveScheduleOverrides(obj)` — scrittura centralizzata degli override orari
  - `replaceAllBookings(arr)` — sovrascrittura bulk array prenotazioni
- Rimossi tutti i `localStorage.getItem('scheduleOverrides')` e `localStorage.setItem(BOOKINGS_KEY, ...)` sparsi in `calendar.js`, `booking.js`, `admin.js`, `data.js`
- Tutto l'accesso ai dati passa ora esclusivamente da `BookingStorage` e `CreditStorage`
- **Il comportamento del sito è invariato** — è solo un refactoring interno
- Quando si migra a Supabase: si cambia solo l'interno di questi metodi + si aggiunge async/await in un unico passaggio

**Progetto Supabase cloud attivato:**
- Progetto creato su supabase.com: `Thomas Bresciani` (free tier)
- URL: `https://ppymuuyoveyyoswcimck.supabase.co`
- Collegamento locale: `supabase link --project-ref ppymuuyoveyyoswcimck`
- Schema applicato al cloud: `supabase db push` → tabelle `bookings`, `schedule_overrides`, `credits`, `credit_history` create e visibili nel Table Editor
- Le migrazioni sono versionabili in git — ogni modifica futura al DB è un file `.sql` in `supabase/migrations/`

---

### 4.7 Autenticazione utenti con Google OAuth (feb 2026)

**Obiettivo:** sostituire il login social mock (che chiedeva nome/email manualmente) con OAuth reale tramite Supabase Auth.

**File creato: `js/supabase-client.js`**
- Inizializza il client Supabase con URL e anon key
- Esporta `supabaseClient` come variabile globale usata da `login.html`
- Caricato via CDN: `@supabase/supabase-js@2` (UMD build da jsDelivr)

**Configurazione Google Cloud Console:**
- Creato progetto OAuth "Thomas Bresciani" su console.cloud.google.com
- Tipo applicazione: Web
- Origini JavaScript autorizzate: `https://renumaa.github.io`
- URI di reindirizzamento autorizzato: `https://ppymuuyoveyyoswcimck.supabase.co/auth/v1/callback`
- Ottenuti Client ID e Client Secret

**Configurazione Supabase Auth:**
- Provider Google abilitato con Client ID e Client Secret di Google
- Site URL: `https://renumaa.github.io/Palestra`
- Redirect URL: `https://renumaa.github.io/Palestra/login.html`

**Flusso OAuth implementato in `login.html`:**
1. Utente clicca "Continua con Google" → `supabaseClient.auth.signInWithOAuth({ provider: 'google', redirectTo: login.html })`
2. Google autentica → redirect a Supabase callback → redirect a `login.html?code=...`
3. `handleOAuthReturn()` rileva il parametro `code` (o `access_token`) nell'URL
4. `supabaseClient.auth.getSession()` scambia il codice per una sessione
5. Estrazione dati utente: `user_metadata.full_name`, `user_metadata.name`, `user.email`
6. Bridge al sistema localStorage esistente tramite `loginUser({ name, email, provider })`
7. Redirect a `index.html`

**Rimozione login mock:**
- Eliminato il `socialModal` HTML (che chiedeva nome/email manualmente)
- Eliminati `pendingProvider`, `startSocialLogin` mock, `closeSocialModal`, `confirmSocialLogin`
- Il pulsante Apple mostra alert "non ancora disponibile" (richiede Apple Developer account a pagamento)
- Facebook: infrastruttura pronta, richiede configurazione app Facebook Developers

**Compatibilità mantenuta:**
- Il resto del sito (calendario, prenotazioni, admin) continua a usare `getCurrentUser()` da localStorage — invariato
- Quando si migra a Supabase full, l'auth è già collegata; si aggiornerà solo il bridge

---

### 4.8 Modal "Completa il profilo" dopo OAuth (feb 2026)

**Problema:** Google OAuth fornisce solo nome ed email — non il numero WhatsApp, necessario per i promemoria.

**Soluzione implementata:**
- Dopo il login OAuth, prima di redirectare a `index.html`, il codice controlla se l'utente ha già un numero WhatsApp in `gym_users` (localStorage)
- **Prima volta:** mostra il modal "Un'ultima cosa!" con campo WhatsApp obbligatorio — non si può procedere senza compilarlo
- **Accessi successivi:** se il numero è già salvato, redirect diretto senza mostrare il modal

**Dettaglio tecnico:**
- `getUserByEmail(email)` controlla la lista `gym_users` in localStorage
- Se non trovato o senza WhatsApp → `window._pendingOAuthUser = { name, email, provider }` + mostra modal
- `confirmCompleteProfile()`: valida il numero, lo normalizza, salva in `gym_users` tramite `_getAllUsers()` / `_saveUsers()`, poi chiama `loginUser()` e redirect
- Il numero viene salvato in formato E.164 (vedi sezione 4.9)

---

### 4.9 Normalizzazione numeri WhatsApp in E.164 (feb 2026)

**Obiettivo:** salvare tutti i numeri di telefono in formato standard E.164 (`+39XXXXXXXXXX`) per compatibilità futura con le API WhatsApp Business.

**Funzione `normalizePhone(raw)` aggiunta in `auth.js`:**
```js
// Gestisce tutti i formati comuni italiani:
// "348 123 4567"      → "+39348123456"
// "0348 123 4567"     → "+39348123456"
// "0039 348 123 4567" → "+39348123456"
// "+39 348 123 4567"  → "+39348123456"
```
- Rimuove spazi, trattini, parentesi
- Gestisce prefissi: `0039`, `39`, `0`, nessun prefisso → aggiunge `+39`
- Validazione finale con regex `^\+\d{10,15}$`

**Applicata a:**
- Modal OAuth "Completa profilo" (`confirmCompleteProfile` in `login.html`)
- Form di registrazione manuale (`registerForm` in `login.html`)
- Messaggio di errore chiaro: "Numero non valido. Usa formato: +39 348 1234567"

**Nota:** il form di prenotazione (`booking.js`) accetta ancora numeri non normalizzati — da allineare in futuro quando si migra a Supabase (validazione server-side).

---

### 4.10 Sistema di annullamento prenotazioni (feb 2026)

**Flusso implementato:**
1. Utente clicca "Richiedi annullamento" → `status = 'cancellation_requested'`, timestamp `cancellationRequestedAt`
2. Lo slot torna disponibile sul calendario (conta come posto libero)
3. Se qualcun altro prenota → `fulfillPendingCancellations()` cancella la prenotazione più vecchia in attesa (FIFO), rimborsa il credito se pagato con credito, azzera `paid/paymentMethod/paidAt`
4. Se nessuno prenota entro 2h dall'inizio lezione → `processPendingCancellations()` ripristina `status = 'confirmed'`, l'utente deve presentarsi e pagare

**File modificati:**
- `js/data.js`: aggiunti `requestCancellation()`, `fulfillPendingCancellations()`, `processPendingCancellations()`; `getBookingsForSlot` e `getRemainingSpots` escludono `cancelled`
- `js/booking.js`: chiama `fulfillPendingCancellations()` dopo ogni nuova prenotazione
- `prenotazioni.html`: UI con badge "⏳ Annullamento in attesa" / "✕ Annullata", polling ogni 3s, `processPendingCancellations()` al caricamento
- `css/prenotazioni.css`: badge `preno-badge-cancelled` (grigio) e `preno-cancel-pending` (ambra)
- `js/admin.js`: participant card con badge ambra per `cancellation_requested`; `css/admin.css`: `.admin-participant-card.cancel-pending`

**Rimborso credito:** `fulfillPendingCancellations` azzera `paid`, `paymentMethod`, `paidAt` sulla prenotazione cancellata e aggiunge il credito tramite `CreditStorage.addCredit(+price)`

---

### 4.11 Miglioramenti admin e consistenza dati (feb 2026)

**Prenotazioni annullate visibili nello storico Clienti:**
- `getAllClients()` include prenotazioni `cancelled` (prima le escludeva)
- Riga in tabella: testo barrato + grigio (`.row-cancelled`), badge "✕ Annullata", colonne metodo/data con `—`, nessun pulsante ✏️ (solo 🗑️)
- Contatori `totalBookings`, `totalPaid`, `totalUnpaid` calcolati solo su `activeBookings` (esclude `cancelled`)

**Badge stato in tabella Statistiche & Fatturato:**
- Mappati tutti e 4 gli stati: `confirmed` → verde "Confermata", `cancellation_requested` → ambra "Richiesta annullamento", `cancelled` → grigio "Annullata", altro → giallo "In attesa"
- Aggiunto CSS `.status-badge.cancellation_requested` e `.status-badge.cancelled`

**Verifica doppia prenotazione:**
- `booking.js`: prima di salvare, controlla se esiste già una prenotazione attiva (non `cancelled`) per la stessa email o numero WhatsApp, stessa data e ora
- Mostra alert "Hai già una prenotazione per questo orario."

**Fix credito e statistiche:**
- `applyToUnpaidBookings()`: salta prenotazioni `cancelled` e `cancellation_requested` per non spendere credito su lezioni annullate
- `getFilteredBookings()` (admin Statistiche): esclude `cancelled` da fatturato, conteggio totale, grafici e tasso di occupazione

**processPendingCancellations su ogni pagina:**
- Aggiunta chiamata in `DOMContentLoaded` dentro `data.js` → eseguita su ogni pagina che carica lo script
- Aggiunta anche in `renderCalendar()`, `renderAdminDayView()`, `loadDashboardData()` per sicurezza aggiuntiva
- Limitazione nota: se nessuno apre il sito nelle 2h prima della lezione, il ripristino avviene alla prima apertura successiva (qualunque pagina)

---

### 4.13 Fix annullamento e blocco prenotazioni tardive (feb 2026)

**Bug fix — flusso annullamento con utente diverso:**
- Problema: se `processPendingCancellations` girava prima della prenotazione di un secondo utente (via `DOMContentLoaded`), la richiesta di annullamento veniva revertita a `confirmed` e `cancellationRequestedAt` veniva cancellato. Quando il secondo utente prenotava, `fulfillPendingCancellations` non trovava più la richiesta pendente e la prenotazione originale rimaneva `confirmed`.
- Fix in `data.js`:
  - `processPendingCancellations`: non cancella più il campo `cancellationRequestedAt` al ripristino — il campo resta come traccia dell'intenzione
  - `fulfillPendingCancellations`: ora cerca anche prenotazioni `confirmed` con `cancellationRequestedAt` impostato (oltre a `cancellation_requested`)

**Nascondere bottone annullamento per lezioni già passate:**
- `buildCard` in `prenotazioni.html` calcola la data+ora reale di inizio lezione
- Se l'orario è già passato (`lessonStart <= new Date()`), il bottone "Richiedi annullamento" non viene renderizzato — evita il ciclo richiesta → revert immediato da `processPendingCancellations`

**Blocco prenotazioni entro 2h dall'inizio:**
- `createSlot` (desktop) e `createMobileSlotCard` (mobile) in `calendar.js`: lo slot è cliccabile solo se `lessonStart - now > 2h`; altrimenti cursore `not-allowed`
- `renderMobileSlots` in `calendar.js`: gli slot entro 2h non vengono proprio renderizzati su mobile (invece di mostrarsi come disabilitati). Se non rimangono slot disponibili per il giorno selezionato, mostra "Nessuna lezione disponibile per questo giorno"
- `handleBookingSubmit` in `booking.js`: validazione aggiuntiva lato submit — se la lezione inizia entro 2h, mostra alert e chiude il modal

**Ripristino credito nel reset dati:**
- `resetDemoData` e `clearAllData` in `admin.js` ora rimuovono anche `gym_credits` da localStorage — in precedenza il saldo crediti sopravviveva al reset

**Elimina storico credito per singolo cliente:**
- Aggiunto `CreditStorage.clearRecord(whatsapp, email)` in `data.js`: rimuove completamente il record crediti di un cliente
- Admin tab Clienti: bottone 🗑️ "Elimina storico" nell'header dello storico credito di ogni cliente, con richiesta di conferma
- CSS: `.btn-clear-credit` (bordo rosso, stile inline)

---

### 4.14 Gestione Orari — Slot prenotato con cliente associato (feb 2026)

**Obiettivo:** quando l'admin assegna il tipo "Slot prenotato" (group-class) in Gestione Orari, deve obbligatoriamente associare un cliente registrato. La selezione crea una prenotazione reale visibile in tutte le tab admin e in "Le mie prenotazioni".

**`UserStorage` in `data.js`:**
- Nuova classe che aggrega account registrati (`gym_users`) + clienti unici dallo storico prenotazioni (`gym_bookings`)
- Deduplicazione per email (case-insensitive) e telefono (ultimi 10 cifre); account registrati hanno priorità
- Risultato ordinato alfabeticamente per nome
- Supabase migration: sostituire i due `localStorage.getItem` con query su `profiles` + `bookings`, stessa logica di dedup

**Client picker in Gestione Orari (`admin.js` + `admin.css`):**
- `renderAllTimeSlots()`: gli slot `group-class` usano un layout a colonna con pannello client picker sotto il dropdown
- Autocomplete per nome, email o telefono (min 2 caratteri) — risultati da `UserStorage.search()`
- Badge verde se cliente assegnato; avviso arancione "⚠️ Cliente obbligatorio" se mancante
- Bottone ✕ per rimuovere il cliente
- Nuove funzioni: `sanitizeSlotId()`, `searchClientsForSlot()`, `selectSlotClient()`, `clearSlotClient()`, `formatAdminBookingDate()`

**Prenotazione reale automatica:**
- `selectSlotClient()`: crea una vera prenotazione in `gym_bookings` e salva il `bookingId` nell'override
- Lo slot prenotato è visibile in: Prenotazioni, Clienti, Pagamenti, Statistiche, "Le mie prenotazioni"
- Se l'admin cambia cliente: elimina la prenotazione precedente e ne crea una nuova
- Se l'admin rimuove il cliente, cambia tipo slot o svuota lo slot: la prenotazione viene eliminata (`BookingStorage.removeBookingById()`)
- Nuovo metodo `BookingStorage.removeBookingById(id)` in `data.js`

**Annullamento slot prenotato con regola 3 giorni (`prenotazioni.html` + `data.js`):**
- Per slot `group-class` in "Le mie prenotazioni":
  - ≥ 3 giorni prima → bottone **"Annulla prenotazione"**: cancellazione immediata + slot convertito in Lezione di Gruppo
  - < 3 giorni prima → badge grigio 🔒 "Non annullabile (meno di 3 giorni)"
  - Lezione già passata → nessun controllo (come per tutti gli altri tipi)
- Nuovo metodo `BookingStorage.cancelAndConvertSlot(id)`:
  - Imposta `status = 'cancelled'` direttamente (nessuno stato intermedio `cancellation_requested`)
  - Converte lo slot in Gestione Orari da `group-class` a `small-group`, rimuove `client` e `bookingId`
- Per tutti gli altri tipi di slot: comportamento invariato (blocco 2h, flusso pending)
- CSS: `.preno-cancel-locked` in `prenotazioni.css`

**Fix evidenziazione giorno in Gestione Orari:**
- Bug: `selectedScheduleDate` veniva impostato DOPO la generazione HTML dei tab → la classe `active` non veniva mai applicata al cambio settimana
- Fix: la logica di default viene eseguita PRIMA di costruire il markup; aggiunto reset se la data selezionata appartiene a una settimana diversa

**Formato data uniforme in "Le mie prenotazioni":**
- Aggiunta `formatBookingDate(dateStr)` in `prenotazioni.html`
- Tutte le card mostrano il formato esteso "Lunedì 2 Marzo 2026" invece del formato breve "Giovedì 26/2" che arrivava dal campo `dateDisplay` del calendario pubblico

---

### 4.15 Sistema transazioni, pagamenti e storico credito (feb 2026)

**Prenotazioni in corso prenotabili (`calendar.js` + `booking.js`):**
- Rimossa la regola "non prenotabile se la lezione inizia tra meno di 2h"
- Nuova regola: prenotabile se **la lezione finisce tra almeno 30 minuti** (utile per lezioni già iniziate)
- Fix in `calendar.js` in 3 punti (slot desktop, lista mobile, card mobile): legge l'orario di FINE dalla stringa slot (`"14:00 - 15:30".split(' - ')[1]`) invece dell'orario di inizio
- Fix parallelo in `booking.js`: stessa logica nella validazione al submit

**Eccedenza di pagamento — `displayAmount` (`admin.js` + `data.js` + `prenotazioni.html`):**
- Quando un pagamento in contanti/carta/iban supera il costo della lezione, lo storico ora mostra il totale pagato (es. +€50) invece del solo credito aggiunto (es. +€45)
- `CreditStorage.addCredit()`: aggiunto 6° parametro opzionale `displayAmount` — se presente viene salvato sull'entry storico
- Nota rinominata: `"Pagamento con credito di €X (metodo)"` con `displayAmount = amountPaid`
- `renderTransazioni` sezione 2: usa `e.displayAmount ?? e.amount`

**"Da pagare" include prenotazioni passate (`prenotazioni.html`):**
- `renderCreditBalance()` considerava solo le prenotazioni future per calcolare il debito
- Fix: usa `[...upcoming, ...past]` — le prenotazioni passate non pagate ora compaiono nel totale

**Annullamenti nello storico transazioni — niente più `splice` (`data.js` + `admin.js` + `prenotazioni.html`):**
- Le prenotazioni cancellate non vengono più eliminate fisicamente: si preserva lo storico
- `BookingStorage.removeBookingById()`: cambiato da `splice` a `status='cancelled'` + azzera `paid/paymentMethod/paidAt/creditApplied`
- `admin.js deleteBooking()`: stessa logica — marca `cancelled` invece di eliminare
- `prenotazioni.html renderTransazioni` **sezione 4** (nuova): mostra voci `cancelled` con icona ✕, `-€prezzo` (costo reale, non €0) e flag `cancelled: true` per forzare il segno negativo nel display
- Il dialog di conferma annullamento admin: testo aggiornato da "non può essere annullata" a "Il record resterà nello storico del cliente"

**Rimborso credito su annullamento admin (`admin.js`):**
- Prima: rimborsava solo se `paymentMethod === 'credito'`
- Fix: rimborsa il prezzo pieno per QUALSIASI metodo di pagamento (`booking.paid || creditApplied > 0`)
- Fix rimborso parziale: se booking aveva `creditApplied=15` e `paid=false`, il rimborso era €15 invece di €30 (prezzo pieno). Ora `creditToRefund = price` sempre

**`getDebtors()` — filtro prenotazioni annullate (`admin.js`):**
- Il calcolo dei debitori non filtrava le prenotazioni `cancelled`
- Fix: aggiunto `&& booking.status !== 'cancelled'` nel loop

**Badge metodo pagamento in "Le mie prenotazioni" (`prenotazioni.html`):**
- `buildCard` ora mostra il metodo con etichetta completa: `💳 Pagata con Credito`, `💵 Pagata con Contanti`, `💳 Pagata con Carta`, `🏦 Pagata con IBAN`

**Storico transazioni nella card cliente admin (`admin.js` + `admin.css`):**
- Sostituito il vecchio "Storico credito" con una vista transazioni identica a "Le mie prenotazioni"
- Include le stesse 4 sezioni: storico crediti, prenotazioni non pagate, debiti manuali, prenotazioni annullate
- Filtri data a pill: **Settimana / Mese / 6 mesi / 1 anno** (basati su attributo `data-ts` sulle righe)
- Rimosso il pulsante 🗑️ "Elimina storico"
- Aggiunta funzione globale `filterClientTx(listId, days, btn)` per filtraggio client-side
- Aggiunti stili `.tx-filter-bar`, `.tx-filter-btn`, `.tx-filter-btn.active` in `admin.css`

**Netting crediti/debiti in "Pagamenti" (`admin.js`):**
- Un cliente con sia credito che debito manuale appariva in entrambe le liste (debitori e creditori)
- `getDebtors()`: sottrae il saldo `CreditStorage` dal debito totale; filtra se `totalAmount <= 0`
- Lista creditori in `renderPaymentsTab()`: sottrae debiti da prenotazioni non pagate + debiti manuali dal saldo credito; filtra se `netBalance <= 0`

**Rimozione metodo pagamento dai debiti manuali (`prenotazioni.html` + `admin.js`):**
- Le voci ✏️ mostravano "💵 Contanti" ecc. — rimosso
- Fix: `sub: ''` in entrambe le sezioni 3 (prenotazioni.html e createClientCard in admin.js)

**Saldo netto nella card cliente admin — header storico (`admin.js`):**
- L'header "saldo credito: €65" non sottraeva i debiti manuali (es. €171 di debiti → saldo reale -€106)
- Fix: `netBalance = CreditStorage.getBalance() - ManualDebtStorage.getBalance()`
- Visualizzazione: "saldo: +€X" se positivo, "saldo: -€X" se negativo

**Saldo netto nella barra nome cliente (`admin.js`):**
- Il badge 💳 nella barra del nome mostrava ancora `credit` grezzo (€65) invece di `netBalance` (-€106)
- Fix: usa `netBalance` anche nel badge della barra — verde `+€X` se positivo, rosso `-€X` se negativo, assente se zero

**Totale "pagato" nella barra nome cliente (`admin.js`):**
- Il badge "pagato" mostrava solo le prenotazioni pagate, senza considerare il credito disponibile
- Fix: `totalAllPaid = totalPaid + credit` (credito disponibile = saldo CreditStorage)
- I debiti manuali non sono inclusi perché non sono ancora stati pagati

---

### 4.16 Profilo utente, certificato medico e fix UI mobile (feb 2026)

**Badge credito parziale — wrap su mobile (`css/prenotazioni.css`):**
- Il badge "💳 Credito parziale — €X da pagare" usciva dal div su schermi piccoli
- Fix: `white-space: normal; text-align: center` su `.preno-badge-partial`
- Stesso fix applicato a `.preno-cancel-locked` ("🔒 Non annullabile...") per lo stesso motivo

**Prenotazioni "Passate" per orario di fine (`js/auth.js`):**
- `getUserBookings()` confrontava solo la data (`b.date >= today`): una lezione di oggi restava in "Prossime" anche dopo la sua fine
- Fix: se `b.date === today`, controlla l'orario di fine dalla stringa `b.time` (`"6:40 - 8:00".split(' - ')[1]`)
- La prenotazione passa in "Passate" all'orario esatto di fine, non a mezzanotte

**Cutoff annullamenti corretti (`prenotazioni.html`):**
- Regole precedenti erano invertite; corrette con i criteri definitivi:
  - **Slot prenotato** (PT / Small Group): pulsante "Annulla prenotazione" attivo solo con ≥ 3 giorni di anticipo; altrimenti 🔒 "Non annullabile (meno di 3 giorni)"
  - **Lezione di gruppo**: pulsante "Richiedi annullamento" attivo solo con ≥ 3 ore di anticipo; altrimenti 🔒 "Non annullabile (meno di 3 ore)"
- Costanti `THREE_DAYS_MS` e `THREE_HOURS_MS` calcolate da `_msToLesson = _lessonStart - new Date()`

**Modifica profilo utente (`prenotazioni.html` + `js/auth.js` + `css/prenotazioni.css`):**
- Bottone "✏️ Modifica profilo" affiancato al nome nella barra header (`.preno-header-top`)
- Modale con campi: Nome, Email, WhatsApp, Scadenza certificato medico (date picker), Nuova password + conferma
- Sezione password nascosta automaticamente per utenti autenticati con Google (`user.provider === 'google'`)
- Nuova funzione `updateUserProfile(currentEmail, updates, newPassword)` in `auth.js`:
  - Aggiorna `gym_users` in localStorage
  - Controlla unicità email; se cambia, aggiorna anche tutte le prenotazioni collegate (`gym_bookings`)
  - Aggiorna la sessione `currentUser` senza logout
  - Ritorna `{ ok, error }`
- Header (nome, email, avatar) e navbar si aggiornano in real-time dopo il salvataggio

**Certificato medico — struttura dati (`js/auth.js`):**
- Nuovo campo `certificatoMedicoScadenza` (stringa `YYYY-MM-DD` o `null`) nell'oggetto utente in `gym_users`
- Nuovo campo `certificatoMedicoHistory`: array di oggetti `{ scadenza, aggiornatoIl }` — ogni modifica alla scadenza aggiunge una voce; lo storico completo viene mantenuto anche dopo aggiornamenti successivi
- Aggiornato solo se il valore cambia rispetto a quello salvato

**Warning certificato medico — profilo (`prenotazioni.html` + `css/prenotazioni.css`):**
- `renderCertWarning()` chiamata al caricamento e subito dopo ogni salvataggio del profilo
- Se il certificato **non è impostato**: banner rosso `🏥 Imposta scadenza Cert. Medico (qui)` — "(qui)" apre il modale di modifica profilo
- Se il certificato è **scaduto**: banner rosso `🏥 Cert. Medico scaduto il DD/MM/YYYY` (nessun link)
- Se mancano **≤ 30 giorni**: banner giallo `⏳ Mancano X giorni alla scadenza del tuo Cert. Medico (porta a Thomas quello nuovo)` (nessun link)
- Nessun banner se la scadenza è oltre 30 giorni

**Warning certificato medico — admin prenotazioni (`js/admin.js` + `css/admin.css`):**
- In `createAdminSlotCard`, per ogni partecipante: lookup `getUserByEmail(booking.email)` → controlla `certificatoMedicoScadenza`
- Se **non impostato**: badge rosso `🏥 Imposta scadenza certificato medico` nella card partecipante e nella scheda cliente
- Se **scaduto**: badge rosso `🏥 Cert. scaduto il DD/MM/YY` nella card partecipante
- Nella scheda cliente (tab Clienti): `🏥 Imposta scadenza...` (rosso), `⏳ Cert. scade il...` (giallo, ≤30gg), `✅ Cert. valido fino al...` (verde)

**Decisione — recupero password e conflitto Google/email:**
- Un utente che si registra con email/password non ha modo di recuperare la password in autonomia
- Un utente che usa prima Google e poi prova email/password con la stessa email riceve messaggi d'errore non chiari
- **Decisione:** non gestire questi casi ora — Supabase Auth li risolve nativamente (reset via email, account linking). Rimandato alla migrazione Supabase.

---

### 4.17 Fix pagamenti, transazioni, ordinamento e prezzi (feb 2026)

**Export dati — file .xlsx unico con SheetJS (`admin.js` + `admin.html`):**
- Sostituiti i 6 CSV separati con un singolo file `.xlsx` (`TB_Training_export_YYYY-MM-DD.xlsx`)
- Libreria SheetJS (`xlsx@0.18.5`) caricata via CDN in `admin.html`
- 6 fogli: Clienti, Prenotazioni, Pagamenti, Crediti, Debiti Manuali, Gestione Orari
- Larghezze colonne auto-calcolate (`ws['!cols']`)

**Fix transazioni: pagamento carta/contanti/iban mancante (`data.js` + `admin.js` + `prenotazioni.html`):**
- Quando si pagava un debito con carta/contanti/iban, lo storico transazioni mostrava solo le voci negative (es. -30€ e -5€ per le lezioni) senza la corrispondente voce positiva (+35€ incassato)
- `CreditStorage.addCredit()`: rimosso il `return` immediato su `amount === 0` — le voci con importo zero sono ora ammesse come log informativi (non modificano il saldo)
- `paySelectedDebts()`: quando `paymentMethod !== 'credito'` e `creditDelta <= 0`, aggiunge una voce `{ amount: 0, displayAmount: amountPaid, note: "💳 Carta ricevuto" }` nel registro crediti
- Filtro sezione 2 della transaction view (entrambe le pagine): `e.amount > 0 || (e.amount === 0 && e.displayAmount > 0)` — include le voci informative

**Badge "Segna pagato" cliccabile in Prenotazioni admin (`admin.js` + `admin.css`):**
- Il badge "Non pagato" era solo testo; ora è "⊕ Segna pagato", cliccabile, colore ambra con hover
- Click → apre `openDebtPopup()` direttamente dalla card prenotazione, anche per lezioni future
- `openDebtPopup()` modificato: rimosso il filtro `bookingHasPassed(b)` → ora mostra **tutte** le prenotazioni non pagate (passate e future)
- Subtitle aggiornato: "3 lezioni non pagate (1 passata, 2 future)"

**Fix cutoff annullamento (`prenotazioni.html`):**
- La variabile `_isGroupClass` controllava `b.slotType === 'group-class'` che è lo **Slot prenotato** (rosso), non la Lezione di Gruppo
- Fix: `_isGroupClass = b.slotType !== 'group-class'` — solo lo Slot prenotato (rosso) ha cutoff 3 giorni; Lezione di Gruppo e Autonomia usano 3 ore
- Secondo fix: il controllo `b.status === 'cancellation_requested'` era solo nel ramo `else`, mai raggiunto per i tipi con `_isGroupClass = true` → il bottone riappariva dopo la richiesta. Aggiunto il check anche dentro il ramo `if (_isGroupClass)`

**Prezzi lezioni aggiornati (`data.js`):**
- `personal-training` (Autonomia, verde): €5 (invariato)
- `small-group` (Lezione di Gruppo, giallo): €10 (era €30)
- `group-class` (Slot prenotato, rosso): €50 (era €10)

**Ordinamento prenotazioni per orario (`js/auth.js`):**
- `upcoming`: ordinato per `date ASC, time ASC` (la più vicina in cima) — prima usava solo `date`
- `past`: ordinato per `date DESC, time DESC` (la più recente in cima) — prima usava solo `date`

**Fix paidAt nell'export e nel form di modifica (`admin.js`):**
- Foglio "Pagamenti": le righe prenotazione usavano `fmtDate` (solo data) invece di `fmtDateTime` (data+ora) → ora tutte le righe mostrano data e orario come le voci credito
- Form modifica pagamento in admin Clienti: campo `type="date"` → `type="datetime-local"` per preservare l'orario esatto
- Valore pre-compilato: `booking.paidAt.slice(0, 16)` (formato `YYYY-MM-DDTHH:MM` per datetime-local)
- Save: rimosso il suffisso artificiale `+ 'T12:00:00'`; usa `new Date(newPaidAtRaw).toISOString()` direttamente

---

### 4.18 PWA miglioramenti e infrastruttura push notification (feb 2026)

**Rinomina app: "TB Training" → "Palestra"**
- `manifest.json`: `name` e `short_name` aggiornati a "Palestra"
- Tutti e 6 gli HTML: `apple-mobile-web-app-title` → "Palestra", `manifest.json?v=3`
- `sw.js`: cache rinominata `palestra-v1` (forza refresh service worker su tutti i dispositivi)

**Fix icona PWA troppo zoomata**
- `manifest.json`: rimosso `"maskable"` dal campo `purpose` → ora solo `"any"`
- Con `maskable` Android riempiva il cerchio con il logo senza padding, risultando molto zoomato
- Con `any` Chrome aggiunge automaticamente padding bianco e il logo appare proporzionato
- Effettivo dopo disinstallazione e reinstallazione della PWA

**Notifica locale alla conferma prenotazione**
- `booking.js`: `notificaPrenotazione(savedBooking)` chiamata dopo `showConfirmation()`
- Richiede permesso notifiche al primo utilizzo (dentro il click handler — gesto utente)
- Mostra notifica tramite `serviceWorker.showNotification()` con tipo, data e orario
- `sw.js`: `notificationclick` handler — tap sulla notifica porta in primo piano la finestra app o apre `prenotazioni.html`

**Infrastruttura push notification pronta per Supabase**
- Generata coppia di chiavi VAPID P-256 (una volta sola):
  - Public key: hardcoded in `js/push.js` (appartiene al frontend)
  - Private key: salvata in `.vapid-keys.txt` (ignorato da git via `.gitignore`)
- `js/push.js` (nuovo file):
  - `registerPushSubscription()`: ottiene o crea la subscription con `pushManager.subscribe()`
  - `savePushSubscription()`: salva endpoint + chiavi p256dh/auth in localStorage in formato già compatibile con schema Supabase
  - Auto-registrazione silenziosa se permesso già concesso (ad ogni apertura)
  - Codice TODO commentato con il `supabase.upsert()` sostitutivo + schema tabella `push_subscriptions`
- `booking.js`: dopo il permesso notifiche concesso, chiama `registerPushSubscription()`
- `sw.js`: aggiunto handler `push` — riceve notifiche dal server (Supabase Edge Function) e le mostra
- `js/push.js` caricato in tutti e 6 gli HTML dopo `auth.js`
- `.gitignore` creato: esclude `.vapid-keys.txt`, `.env`, `.claude/`

**Quando si migra a Supabase (3 passi):**
1. Crea tabella `push_subscriptions` (schema già scritto in `push.js`)
2. In `push.js`: sostituisci `savePushSubscription()` con `supabase.upsert()` (codice commentato nel file)
3. Scrivi Edge Function cron: legge prenotazioni di domani, manda push con VAPID private key dai secrets

---

### 4.19 UX mobile e layout (feb 2026)

**Footer sempre al fondo (`css/style.css`):**
- Quando non ci sono lezioni disponibili, il footer non raggiungeva il fondo della pagina lasciando spazio bianco
- Fix: `body { display: flex; flex-direction: column; min-height: 100vh }` + `flex: 1` sulle sezioni principali (`.calendar-section`, `.login-page`, `.preno-page`, `.dashboard-section`)
- Il calendario mobile mantiene un'altezza minima pari allo schermo quando non ci sono slot

**"powered by Andrea Pompili" nella sidebar mobile (`css/style.css` + tutti gli HTML):**
- Aggiunta riga `.nav-sidebar-credit` in fondo alla sidebar mobile: `font-size: 0.65rem; color: rgba(255,255,255,0.35); text-align: right; padding: 0.6rem 1rem`
- Markup aggiunto in tutti e 6 gli HTML dentro `.nav-sidebar`

**Calendario avanza automaticamente dopo le 20:30 (`js/calendar.js`):**
- Dopo le 20:30 non ci sono più lezioni disponibili per oggi: `getWeekDates()` controlla `minutesNow >= 20*60+30` con `offset === 0` e imposta `today = domani`
- Il calendario su offset 0 mostra già il giorno successivo, senza dover mostrare una giornata vuota

**Swipe orizzontale sul selettore giorni mobile (`js/calendar.js`):**
- Aggiunti `touchstart` / `touchend` su `#mobileDaySelector` in `setupCalendarControls()`
- Swipe sinistra (dx < −50px) → settimana successiva (solo se ha slot configurati)
- Swipe destra (dx > +50px) → settimana precedente (solo se `currentWeekOffset > 0`)
- Listener `passive: true` per non bloccare lo scroll verticale della pagina

---

### 4.20 Posti extra per slot, login gate, fix bfcache e aggiornamento mobile (mar 2026)

**Posti extra per slot — admin Prenotazioni (`js/admin.js`, `js/data.js`, `js/calendar.js`, `css/admin.css`, `css/style.css`):**
- Bottone "＋" nell'header di ogni slot admin → apre picker con i tipi disponibili ("Aggiungi 1 posto: [Autonomia] [Lezione di Gruppo]")
- Click su un tipo → aggiunge esattamente **1 posto extra** a quello slot tramite `BookingStorage.addExtraSpot(date, time, extraType)`
- Extra rimossi con il bottone "−" nella barra badge, solo se il posto non è già prenotato (`BookingStorage.removeExtraSpot`)
- Struttura dati: ogni slot in `schedule_overrides` può avere `extras: [{type}]` — uno per ogni posto extra aggiunto
- `getEffectiveCapacity(date, time, slotType)`: restituisce `SLOT_MAX_CAPACITY[slotType] + count(extras of same type)` se il tipo è quello principale dello slot; altrimenti restituisce solo `count(extras of that type)` (base = 0) → **fix critico**: evita che aggiungere 1 posto di Lezione di Gruppo a uno slot Autonomia mostrasse 6 posti disponibili invece di 1
- `getRemainingSpots`: filtra le prenotazioni per `slotType` e usa `getEffectiveCapacity` per calcolare i posti liberi

**Vista split slot calendario desktop e mobile:**
- Se gli extra hanno un tipo diverso dal tipo principale → lo slot nel calendario desktop si divide in due metà affiancate (`.split-slot-half`), ciascuna con colore e contaposti del proprio tipo
- Fix CSS: `.calendar-slot.split-slot` ora ha `flex-direction: row` e `align-items: stretch` — prima ereditava `flex-direction: column` dalla classe base e le due metà si impillavano con spazio bianco

**Vista split in admin Prenotazioni:**
- Se lo slot ha extra di tipo diverso → card divisa in colonne (`.admin-slot-split`), una per tipo, con titolo e partecipanti separati per tipo

**Login gate per utenti non loggati (`js/booking.js`, `index.html`):**
- Prima di aprire il form di prenotazione, `openBookingModal()` controlla `getCurrentUser()`
- Se non loggato: mostra il div `#loginPrompt` con bottone "Accedi / Registrati" (link a `login.html`) e nasconde il form
- Se loggato: mostra il form e pre-compila nome, email e WhatsApp dai dati dell'utente

**Fix aggiornamento posti su mobile dopo prenotazione (`js/booking.js`):**
- `handleBookingSubmit`: dopo `renderCalendar()` (solo desktop), ora chiama anche `renderMobileSlots(selectedMobileDay)` se disponibile → i contatori dei posti si aggiornano immediatamente anche su mobile senza refresh

**Fix bfcache — navigazione tra pagine senza Ctrl+R (`js/calendar.js`, `js/admin.js`):**
- Problema: il browser restaura la pagina dal Back/Forward Cache (`bfcache`) senza rieseguire `DOMContentLoaded` → i dati rimanevano quelli al momento della navigazione
- Fix: aggiunto listener `pageshow` in `calendar.js` → se `event.persisted === true`, richiama `renderCalendar()` e `renderMobileCalendar()`
- Fix parallelo in `admin.js` → rileva il tab attivo (`.admin-tab.active`) e richiama `switchTab()` per re-renderizzare i dati senza riattaccare i listener
- Entrambi i listener si attivano solo su restore da bfcache (`event.persisted`), non ad ogni caricamento normale

**Service worker cache bump (`sw.js`):**
- `CACHE_NAME` aggiornato da `palestra-v1` a `palestra-v2`
- Forza il browser a scartare la cache precedente e scaricare le versioni aggiornate di `data.js`, `calendar.js`, `admin.js`, `booking.js` e CSS
- **Regola di sviluppo:** incrementare il numero di versione ogni volta che si modificano file JS o CSS significativi

---

### 4.21 Lezione Gratuita e fix rimborso credito su annullamento pendente (mar 2026)

**Metodo di pagamento "Lezione Gratuita" (`js/admin.js`, `js/data.js`, `js/booking.js`, `admin.html`, `css/admin.css`, `prenotazioni.html`):**
- Nuovo bottone "🎁 Lezione Gratuita" nel popup "Aggiungi Credito Manuale" (verde, distinto dagli altri metodi)
- Il credito aggiunto con questo metodo viene tracciato separatamente nel campo `freeBalance` del record credito, oltre al normale `balance`
- `CreditStorage.addCredit(..., freeLesson=true)`: incrementa sia `balance` che `freeBalance`; aggiunge entry con flag `freeLesson: true`
- Nuovo metodo `CreditStorage.getFreeBalance(whatsapp, email)`: restituisce il saldo disponibile da lezioni gratuite
- `applyToUnpaidBookings()`: usa prima il `freeBalance`; le prenotazioni pagate con credito gratuito ricevono `paymentMethod = 'lezione-gratuita'`; il `freeBalance` viene decrementato manualmente dopo l'applicazione
- `booking.js`: al momento della prenotazione, se l'utente ha `freeBalance >= price`, usa il credito gratuito e imposta `paymentMethod = 'lezione-gratuita'`
- **Esclusione da statistiche/fatturato**: `filteredBookings.filter(b => b.paymentMethod !== 'lezione-gratuita')` prima di sommare i ricavi in admin Statistiche — le lezioni gratuite non compaiono nel fatturato né nel confronto periodi
- Label display: `'lezione-gratuita': '🎁 Gratuita'` in admin, `'lezione-gratuita': '🎁 Lezione Gratuita'` in prenotazioni.html

**Bug fix — rimborso credito non dovuto su annullamento pendente (`js/admin.js`):**
- Problema: quando l'admin cliccava ✕ su una prenotazione con `status = 'cancellation_requested'`, `deleteBooking` rimborsava immediatamente il credito, anche se la cancellazione non era ancora stata completata da un'altra prenotazione
- Regola corretta: il rimborso deve avvenire **solo** tramite `fulfillPendingCancellations` (quando un'altra persona prenota effettivamente lo slot); se l'admin elimina manualmente una prenotazione in attesa di cancellazione, nessun credito viene aggiunto automaticamente (il PT può farlo manualmente se necessario)
- Fix: aggiunto controllo `isCancellationPending = booking.status === 'cancellation_requested'`; il rimborso viene saltato se vero

**Service worker cache bump (`sw.js`):**
- `CACHE_NAME` aggiornato da `palestra-v3` a `palestra-v4` per forzare reload dei file aggiornati

---

### 4.22 Evidenziazione giorni con slot prenotato senza cliente e fix logo dark mode (mar 2026)

**Tab giorno rosso se manca il cliente associato (`js/admin.js` + `css/admin.css`):**
- In `renderScheduleManager()`, il loop dei tab giornalieri calcola `hasMissingClient`: verifica se almeno uno slot del giorno ha `type === 'group-class'` senza proprietà `client`
- Se vero, il button del tab riceve la classe CSS `missing-client`
- `.schedule-day-tab.missing-client`: sfondo rosso chiaro `#fee2e2`, bordo `#fca5a5`
- `.schedule-day-tab.missing-client.active`: quando il tab è anche selezionato, il gradiente cyan torna a prevalere per non perdere la visibilità del tab attivo
- Il controllo usa `overrides[dateInfo.formatted]` già disponibile nel rendering, senza query aggiuntive

**Fix logo in modalità notturna (`css/style.css`, `css/login.css`, `css/admin.css`, `css/chi-sono.css`):**
- In dark mode (OS o browser force-dark), il browser applicava una trasformazione automatica al logo `logo-tb---nero.jpg` rendendolo bianco
- Fix: aggiunta proprietà `color-scheme: light` su tutte le classi che contengono il logo:
  - `.nav-logo` e `.nav-sidebar-logo` in `style.css`
  - `.login-logo` in `login.css`
  - `.login-admin-logo` in `admin.css`
  - `.cs-hero-photo` e `.cs-about-photo-placeholder img` in `chi-sono.css`
- `color-scheme: light` comunica al browser che quell'elemento è già progettato per il tema chiaro e non deve essere alterato automaticamente

---

### 4.23 UI hero e nome PWA (mar 2026)

**Titolo hero in maiuscolo (`index.html`):**
- `<h1 class="hero-name">` aggiornato da `Thomas Bresciani` a `THOMAS BRESCIANI`

**Rinomina app PWA da "Palestra" a "Gym":**
- `manifest.json`: `name` e `short_name` → `"Gym"`
- `index.html`: meta `apple-mobile-web-app-title` → `"Gym"`

---


### 4.24 Refactor phone, fix bug e warning certificato (mar 2026)

**Aggiornamenti warning certificato medico (`prenotazioni.html` + `js/admin.js`):**
- Tre stati distinti con testi ufficiali:
  - Non impostato: `🏥 Imposta scadenza Cert. Medico (qui)` — "(qui)" apre il modale modifica profilo
  - Scaduto: `🏥 Cert. Medico scaduto il DD/MM/YYYY` — nessun link
  - Imminente (≤ 30 giorni): `⏳ Mancano X giorni alla scadenza del tuo Cert. Medico (porta a Thomas quello nuovo)` — nessun link
- Soglia avviso imminente portata da 15 a 30 giorni
- Admin — card partecipante: badge `🏥 Imposta scadenza certificato medico` se non impostato (oltre al già esistente badge scaduto)
- Admin — scheda cliente: badge rosso se non impostato, giallo se ≤30gg, verde se valido

**Unificazione `normalizePhone` (`js/data.js` + `prenotazioni.html`):**
- Rimosso `static _normalizePhone()` da `CreditStorage` e `ManualDebtStorage` (erano duplicati con logica diversa)
- Rimossa funzione locale `normPhone()` da `prenotazioni.html`
- Tutti i confronti numeri WhatsApp usano ora `normalizePhone()` di `auth.js` (E.164 `+39XXXXXXXXXX`)
- Zero impatto visivo; elimina rischio di mismatch durante la migrazione dati a Supabase
- Rimane solo `_normPhone` locale in `getAllClients()` (scopo diverso: dedup visivo, ultimi 10 cifre)

**Fix bug concreti:**
- `booking.js` + `calendar.js`: parsing orario `split(' - ')` con fallback sicuro — nessun crash se formato orario anomalo
- `booking.js`: eliminato XSS in `showConfirmation()` — `JSON.stringify(booking)` dentro `onclick` sostituito con variabile globale `_confirmedBooking`
- `auth.js`: `u.email?.toLowerCase()` con optional chaining — nessun crash se un record utente è privo di email

---

### 4.25 Tab Registro — log unificato di tutte le attività (mar 2026)

**Nuova tab `📋 Registro`** posizionata accanto a `📊 Statistiche & Fatturato` nell'admin panel.

**Funzionalità:**
- Aggregazione in un unico stream di eventi ordinati per timestamp decrescente (event sourcing pattern):
  - `booking_created` — nuova prenotazione
  - `booking_paid` — pagamento registrato
  - `booking_cancellation_req` — richiesta di annullamento
  - `booking_cancelled` — annullamento confermato
  - `credit_added` — credito aggiunto manualmente o come acconto
  - `manual_debt` — debito manuale registrato
  - `manual_debt_paid` — debito manuale saldato
- Filtri: periodo (7gg / 30gg / 90gg / tutto / range custom), tipo evento, tipo lezione, metodo pagamento, stato, ricerca cliente
- Ordinamento cliccabile su qualsiasi colonna
- Paginazione 50 righe per pagina
- Scheda summary con: totale eventi, incassato, nuove prenotazioni
- Export Excel (SheetJS, filename `TB_Registro_YYYY-MM-DD.xlsx`, 13 colonne)
- XSS prevention con `_escHtml()` su tutti i dati utente
- Badge colorati (pastello) per tipo evento e stato, coerenti con il design system esistente
- "Bubble to top" naturale: la modifica di una prenotazione genera un nuovo evento con timestamp corrente

**Fix progressivi durante la sessione:**
- CSS riscritto in light-mode (testo scuro su sfondo bianco) dopo errore iniziale con colori dark-mode invisibili
- Rimossi eventi `credit_used` (ridondanti: il consumo di credito è già visibile come `booking_paid` con metodo credito)
- `Incassato` esclude lezioni gratuite (`paymentMethod !== 'lezione-gratuita'`)

**Fix metodo pagamento e fatturato crediti (sessione 10):**
- `CreditStorage.addCredit` in `data.js`: aggiunto parametro `method`, salvato come `entry.method` nel record storico
- `saveManualEntry`: nota semplificata (non contiene più il metodo tra parentesi), metodo passato come campo separato
- `paySelectedDebts`: metodo passato ad `addCredit` in entrambe le chiamate (log pagamento + acconto)
- `buildRegistroEntries`: crediti usano `h.amount` (non `displayAmount`) e espongono flag `freeLesson`
- `_updateRegistroSummary` — formula fatturato aggiornata:
  - `booking_paid` dove metodo ≠ `credito` AND ≠ `lezione-gratuita`
  - PLUS `credit_added` dove `freeLesson = false`
  - Evita doppio conteggio: la stessa somma non compare sia come `credit_added` che come `booking_paid (credito)`

---

### 4.26 Annullamento diretto, debiti nel popup e fix transazioni (sessione 11, mar 2026)

**Annullamento diretto entro 24h prima della lezione:**
- Finestra temporale distinta:
  - **> 24h prima:** bottone "Annulla" diretto → annullamento immediato (già funzionante)
  - **≤ 24h prima e > 2h prima:** bottone "Richiedi annullamento" → flow con sostituzione cliente
  - **≤ 2h prima:** nessun bottone (né annullamento né richiesta)
- Revisione della logica `BookingStorage.cancelDirectly()` e del render in `prenotazioni.html`

**Debiti manuali visibili e pagabili nel popup prenotazioni (admin calendar):**
- Il popup "⚠️ Da pagare" / "⊕ Segna pagato" mostra ora anche i debiti manuali del cliente (oltre alle prenotazioni non pagate)
- I debiti manuali sono selezionabili come checkbox e vengono saldati insieme alle prenotazioni
- Ordinamento cronologico dal più vecchio al più nuovo (backlog prima)
- Fix data visualizzata: usa `debtRec.history[i].date` (ISO string) invece del campo `date` del record aggregate

**Fix formato prezzi nel popup:**
- `€5,00` e `€10,00` mostrati uniformi con `.toFixed(2).replace('.', ',')`

**Fix voce "+€" mancante in Transazioni su pagamento carta/contanti/iban:**
- **Problema:** `paySelectedDebts()` (popup dal calendario) marcava le prenotazioni come pagate ma non aggiungeva alcuna voce al credit history — il cliente vedeva solo `-€X` (addebito lezione) senza il corrispondente `+€X` (incasso ricevuto)
- **Root cause:** la funzione gestiva solo il caso di sovrapagamento (`creditDelta > 0`) ma non il pagamento esatto (`creditDelta = 0`) né il pagamento parziale
- **Fix:** aggiunta branch `else` che chiama `CreditStorage.addCredit(..., 0, 'Carta ricevuto', amountPaid, ...)` con `amount=0` e `displayAmount=amountPaid` — coerente con quanto già faceva `saveBookingEdit()` dalla tab Clienti
- **Fix cache:** bump `admin.js?v=7` → `v=8` in `admin.html` per forzare il reload del browser (il fix era in produzione ma il browser serviva la versione cachata)

---

### 4.27 Fix Registro: rimborsi e storico annullamenti (sessione 12, mar 2026)

**Problema:** il 🔄 Rimborso non appariva nel Registro dopo l'annullamento di una prenotazione pagata.

**Root cause (tre livelli):**
1. **SW cache stale:** `admin.js?v=7/8` ancora in cache durante l'annullamento → il vecchio codice creava i rimborsi con `hiddenRefund=true`, rendendoli invisibili
2. **Filtro `hiddenRefund` in `buildRegistroEntries`:** il Registro filtrava le entry con `hiddenRefund=true`, nascondendo i rimborsi storici salvati col vecchio codice
3. **`booking_paid` assente per prenotazioni annullate:** dopo l'annullamento `booking.paid = false` e `booking.paidAt = null`, quindi `buildRegistroEntries` non generava la riga ✅ Pagamento

**Fix applicati:**

- **SW cache:** bump `palestra-v4` → `palestra-v5` per forzare il reload di tutti i file JS
- **`buildRegistroEntries` — `booking_paid` per annullati:** usa `cancelledPaidAt` / `cancelledPaymentMethod` (salvati da `deleteBooking`) per ricostruire la riga ✅ Pagamento anche dopo l'annullamento; analogamente `booking_created` mostra `cancelledPaymentMethod` e `bookingPaid=true` se era pagata prima della cancellazione
- **Rimosso filtro `hiddenRefund` da `buildRegistroEntries`:** il Registro è la vista admin completa e deve mostrare tutti i rimborsi, inclusi quelli storici salvati con `hiddenRefund=true`; il filtro rimane solo nel pannello storico transazioni del singolo cliente

**Risultato:** per ogni prenotazione pagata e poi annullata il Registro mostra correttamente tutte e 4 le righe in sequenza:

```
📅 Prenotazione   →  ✅ Pagamento  →  ❌ Annullamento  →  🔄 Rimborso
```

**File modificati:** `js/admin.js` (v=10), `admin.html`, `sw.js`

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
  - **Fase 3:** Sostituire `BookingStorage` (localStorage) con chiamate Supabase API in `data.js`
  - **Fase 4:** Sostituire `CreditStorage`, `ManualDebtStorage`, `BonusStorage`, `DebtThresholdStorage` con Supabase
  - **Fase 5:** Sostituire `schedule_overrides` localStorage con tabella Supabase
  - Aggiungere `async/await` a tutti i caller (già strutturati per farlo)
  - Gestire loading states nell'UI durante le query async

  **⚠️ Problemi da risolvere durante la migrazione data (vedi analisi completa sezione 10):**
  - Le operazioni multi-step (prenota+scala credito, annulla+rimborsa) devono diventare SQL RPC atomiche
  - `processPendingCancellations` va spostato in Supabase Edge Function schedulata (cron)
  - Il netting credito/debito va spostato in SQL view per evitare N+1 query

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

### Fase 3 — Migrazione dati `bookings` ⬅️ prossimo step

- [ ] Sostituire `BookingStorage` in `data.js`: lettura/scrittura prenotazioni da Supabase `bookings`
- [ ] Aggiungere `user_id` alle prenotazioni (collega booking a `profiles.id`)
- [ ] `async/await` in `booking.js` e `calendar.js` per lettura slot e creazione prenotazione
- [ ] `getRemainingSpots()` → query Supabase `COUNT(*)` invece di array in memoria
- [ ] `getBookingsForSlot()` → query Supabase con filtri `date` + `time`
- [ ] `getUserBookings()` in `auth.js` → query Supabase invece di localStorage
- [ ] Gestire loading states nell'UI (spinner durante le query)
- [ ] Verificare che il **login gate** (prenotazione richiede login) funzioni con dati Supabase
- [ ] **Operazioni atomiche con RPC:**
  - `book_slot_with_credit(...)` — prenota + scala credito in una transazione
  - `cancel_booking_with_refund(...)` — cancella + rimborsa credito atomicamente
  - `fulfill_pending_cancellation(...)` — sostituisce cliente su annullamento pendente

---

### Fase 4 — Migrazione dati finanziari (crediti, debiti, bonus, impostazioni)

- [ ] `CreditStorage` → tabella `credits` Supabase (saldo) + `credit_history` (storico)
- [ ] `ManualDebtStorage` → tabella `manual_debts` Supabase
- [ ] `BonusStorage` → tabella `bonuses` Supabase (RPC `get_or_reset_bonus` già scritta)
- [ ] `DebtThresholdStorage`, `CertBlockStorage`, `AssicBookingStorage`, `CertEditableStorage` → tabella `settings` Supabase (già popolata con valori default)
- [ ] SQL view `v_client_balances` per netting credito/debito senza N+1 query
- [ ] `getUnpaidPastDebt` → RPC Supabase `get_unpaid_past_debt` (già scritta nel migration)

---

### Fase 5 — Migrazione schedule_overrides e admin

- [ ] `BookingStorage.getScheduleOverrides()` → query Supabase `schedule_overrides`
- [ ] `BookingStorage.saveScheduleOverrides()` → upsert Supabase
- [ ] Admin panel: lettura e scrittura dati da Supabase invece di localStorage
- [ ] `UserStorage` → query su `profiles` + `bookings` (già pianificato in 4.14)
- [ ] `processPendingCancellations` → Supabase Edge Function cron (ogni 10-15 min)
- [ ] Sostituire polling 3s con **Supabase Realtime** subscriptions su `bookings`
- [ ] **Credenziali admin sicure**: Supabase Auth con ruolo `admin` o JWT custom claim
- [ ] `push_subscriptions` → upsert Supabase (codice commentato già pronto in `push.js`)

---

### Fase 6 — Notifiche email automatiche

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

*Documento generato durante le sessioni di sviluppo con Claude Code.*
