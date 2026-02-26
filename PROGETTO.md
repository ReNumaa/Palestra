# TB Training — Diario di Sviluppo & Roadmap

> Documento aggiornato al 26/02/2026
> Prototipo: sistema di prenotazione palestra, frontend-only con localStorage
> Supabase CLI installato, schema SQL definito, accesso dati centralizzato
> Supabase cloud attivo (tabelle create), Google OAuth funzionante, numeri normalizzati E.164

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
| Hosting | GitHub Pages | https://renumaa.github.io/Palestra |

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
│   └── admin.js            # Tutta la logica della dashboard admin
├── supabase/           # Configurazione Supabase CLI (locale)
│   ├── config.toml     # Config progetto Supabase locale
│   └── migrations/
│       └── 20260225000000_init.sql  # Schema DB: bookings, schedule_overrides, credits
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

### 4.12 Notifiche (pianificate, non ancora implementate)

- Il form di prenotazione simula l'invio di un messaggio WhatsApp (solo `console.log`)
- Decisione presa: usare **email automatiche** (Brevo/Resend, gratis) come canale principale per i promemoria
- WhatsApp come canale futuro opzionale (whatsapp-web.js, se il volume lo giustifica)

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

---

## 6. Cosa manca / cosa è da fare

### Priorità alta (bloccante per andare online)

- [ ] **PWA + Push Notifications** ← **PRIMA COSA DA FARE**
  - Aggiungere `manifest.json` (nome, icona, colori, display standalone)
  - Aggiungere `service-worker.js` (cache offline + ricezione push)
  - Aggiungere `<link rel="manifest">` in tutti gli HTML
  - Implementare richiesta permesso notifiche dopo il login
  - Testare notifica push manuale dall'admin (promemoria lezione)
  - Funziona già con localStorage — testabile subito, gratis, migliora UX immediata
  - Se gli utenti accettano le notifiche → riduce o elimina la necessità di WhatsApp Business API

- [ ] **Migrazione da localStorage a Supabase**
  - ~~Installare Supabase CLI~~ ✅
  - ~~Definire schema tabelle (`bookings`, `schedule_overrides`, `credits`)~~ ✅ (in `supabase/migrations/`)
  - ~~Centralizzare accesso dati in `BookingStorage`~~ ✅
  - ~~Creare progetto su supabase.com e fare `supabase db push`~~ ✅
  - Sostituire implementazione localStorage con chiamate Supabase API in `data.js`
  - Aggiungere `async/await` a tutti i caller (già strutturati per farlo in un colpo solo)
  - Gestire loading states nell'UI

- [ ] **Autenticazione admin sicura**
  - ~~Supabase Auth installata e funzionante per utenti (Google OAuth)~~ ✅
  - Autenticazione admin vera (Supabase Auth con ruolo admin o token in variabile d'ambiente)
  - Rimuovere la password hardcoded `admin123`
  - Proteggere le API Supabase con Row Level Security (RLS) per i dati admin

- ~~[ ] **Deploy su GitHub Pages**~~ ✅
  - ~~Creare repository GitHub~~ ✅
  - ~~Abilitare GitHub Pages~~ ✅
  - Sito live: https://renumaa.github.io/Palestra

- [ ] **Normalizzare numeri WhatsApp nel form di prenotazione** (booking.js)
  - `normalizePhone()` è già disponibile in `auth.js`
  - Da applicare al campo WhatsApp in `handleBookingSubmit` per coerenza con il resto

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

- [ ] **Operazioni atomiche con Postgres RPC (crediti + annullamenti)**
  - Le operazioni multi-step (prenota+scala credito, annulla+rimborsa) attualmente sono sequenziali: se il secondo step fallisce (timeout, errore rete), i dati restano in stato inconsistente
  - Con Supabase usare funzioni SQL (`supabase.rpc(...)`) che eseguono tutto in una singola transazione:
    - `book_slot_with_credit(...)` → inserisce prenotazione + scala credito + inserisce in credit_history
    - `cancel_booking_with_refund(...)` → imposta `cancelled` + rimborsa credito in un colpo solo
    - `fulfill_cancellation(...)` → cancella vecchia prenotazione + salva nuova in modo atomico
  - Finché si è su localStorage non è un problema (tutto sincrono locale); diventa critico appena si passa a Supabase

- [ ] **Validazione server-side**
  - Attualmente la validazione è solo lato client
  - Supabase permette constraints a livello di database
  - Verificare che uno slot non venga sovraprenotato (race condition)

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

### Fase 1 — Deploy base (stimato: 1–2 settimane di lavoro)

```
Obiettivo: il sito funziona online con dati reali

1. Creare progetto Supabase
   └── Definire schema DB
   └── Configurare RLS (Row Level Security)

2. Migrare frontend a Supabase
   └── Riscrivere data.js
   └── Gestire async/await nell'UI
   └── Testare prenotazioni reali

3. Autenticazione admin
   └── Supabase Auth oppure password in .env
   └── Rimuovere admin123 hardcoded

4. Deploy GitHub Pages
   └── Creare repo
   └── Abilitare Pages
   └── Test completo online
```

**Risultato:** il sistema è online, i clienti possono prenotare, l'admin può gestire tutto.

---

### Fase 2 — Notifiche email (stimato: 2–3 giorni di lavoro)

```
Obiettivo: email automatiche per conferme e promemoria

1. Registrarsi su Brevo (gratis)
   └── Ottenere API key

2. Email di conferma
   └── Triggera subito dopo la prenotazione
   └── Riepilogo slot, data, ora, tipo lezione

3. Email promemoria
   └── Supabase Edge Function (cron) o script esterno
   └── Gira ogni sera alle 20:00
   └── Trova tutte le prenotazioni del giorno dopo
   └── Invia email a ogni cliente
```

**Risultato:** i clienti ricevono conferma e promemoria automatici, zero lavoro manuale per il gestore.

---

### Fase 3 — Ottimizzazioni (stimato: ongoing)

```
Obiettivo: migliorare esperienza utente e gestione

- Pagina conferma prenotazione dedicata
- Link "aggiungi a Google Calendar"
- Gestione cancellazioni (con policy: es. cancellazione entro 24h)
- Lista clienti con storico
- Export CSV mensile
- Test su vari dispositivi e browser
```

---

### Fase 4 — Funzionalità avanzate (futuro)

```
Obiettivo: automatizzare ulteriormente, crescere

- WhatsApp automatico (whatsapp-web.js su Railway)
- Gestione abbonamenti / pacchetti
- Pagamenti online (Stripe)
- PWA installabile
- App mobile (React Native / Flutter)
```

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
| Auth utenti | Supabase Auth + Google OAuth | Gratis, sicuro, gestisce token e sessioni; bridge a localStorage per compatibilità |
| Timing migrazione Supabase | Dopo completamento sito | Evita complessità async durante sviluppo; BookingStorage già centralizzato per migrazione rapida |
| Formato numeri WhatsApp | E.164 (`+39XXXXXXXXXX`) | Standard richiesto da WhatsApp Business API; normalizzazione automatica lato client |
| Apple Sign In | Non implementato | Richiede Apple Developer account a pagamento ($99/anno); Google + Facebook coprono la maggior parte degli utenti |

---

*Documento generato durante le sessioni di sviluppo con Claude Code.*
