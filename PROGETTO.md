# TB Training — Diario di Sviluppo & Roadmap

> Documento aggiornato al 27/02/2026 (sessione 4)
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
│   ├── push.js             # Push notification subscription (VAPID, localStorage → Supabase)
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
- Se il certificato è **scaduto**: banner rosso `🏥 Certificato medico scaduto il DD/MM/YYYY (aggiorna)`
- Se mancano **≤ 15 giorni**: banner giallo `⏳ Mancano X giorni alla scadenza del tuo certificato medico (aggiorna)`
- "(aggiorna)" è un link cliccabile che apre direttamente il modale di modifica profilo
- Nessun banner se la scadenza è oltre 15 giorni o non impostata

**Warning certificato medico — admin prenotazioni (`js/admin.js` + `css/admin.css`):**
- In `createAdminSlotCard`, per ogni partecipante: lookup `getUserByEmail(booking.email)` → controlla `certificatoMedicoScadenza`
- Se scaduto: badge rosso `🏥 Cert. scaduto il DD/MM/YY` nella card partecipante (sotto le note, sopra il debito)

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
| Warning certificato scaduto/imminente nel profilo (con link aggiorna) | Funzionante ✅ |
| Warning certificato scaduto nella card partecipante admin | Funzionante ✅ |
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
  - **⚠️ ATTENZIONE DOMINIO CUSTOM:** `sw.js` e `manifest.json` hanno i percorsi hardcoded con `/Palestra/` (es. `start_url`, `scope`, APP_SHELL). Quando si passerà a dominio custom (es. `tbtraining.it`), aggiornare:
    - `manifest.json`: `start_url` → `/index.html`, rimuovere `scope`
    - `sw.js`: tutti i path in `APP_SHELL` da `/Palestra/xxx` → `/xxx`
    - HTML: `navigator.serviceWorker.register('/Palestra/sw.js')` → `register('/sw.js')`
  - [x] Push Notifications — frontend pronto ✅ (subscription, sw handler, VAPID keys)
    - Manca solo il backend: tabella `push_subscriptions` + Edge Function cron su Supabase
    - Da fare nella fase di migrazione (vedere sezione 4.18 per dettaglio e TODO commentati in `push.js`)

- [ ] **Migrazione da localStorage a Supabase**
  - ~~Installare Supabase CLI~~ ✅
  - ~~Definire schema tabelle (`bookings`, `schedule_overrides`, `credits`)~~ ✅ (in `supabase/migrations/`)
  - ~~Centralizzare accesso dati in `BookingStorage`~~ ✅
  - ~~Creare progetto su supabase.com e fare `supabase db push`~~ ✅
  - Sostituire implementazione localStorage con chiamate Supabase API in `data.js`
  - Aggiungere `async/await` a tutti i caller (già strutturati per farlo in un colpo solo)
  - Gestire loading states nell'UI

  **⚠️ Problemi da risolvere PRIMA della migrazione (vedi analisi completa sotto):**
  - Schema SQL incompleto: mancano colonne su `bookings` e la tabella `manual_debts`
  - Le operazioni multi-step (prenota+scala credito, annulla+rimborsa) devono diventare SQL RPC atomiche
  - `processPendingCancellations` va spostato in Supabase Edge Function schedulata (cron)
  - Il netting credito/debito va spostato in SQL view per evitare N+1 query

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
