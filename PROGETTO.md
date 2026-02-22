# TB Training — Diario di Sviluppo & Roadmap

> Documento aggiornato al 21/02/2026
> Prototipo: sistema di prenotazione palestra, frontend-only con localStorage

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
| Hosting | File locali (browser) | Da deployare |

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
├── admin.html          # Dashboard amministratore (protetta da password)
├── css/
│   ├── style.css       # Stili pagina pubblica
│   └── admin.css       # Stili dashboard admin
├── js/
│   ├── data.js         # Dati demo, storage, slot e prezzi
│   ├── calendar.js     # Logica calendario pubblico
│   ├── booking.js      # Form prenotazione e conferma
│   ├── chart-mini.js   # Libreria grafici su Canvas (linea + torta)
│   └── admin.js        # Tutta la logica della dashboard admin
├── README.md           # Documentazione tecnica base
└── PROGETTO.md         # Questo file (diario + roadmap)
```

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

### 4.5 Notifiche (pianificate, non ancora implementate)

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
| Dati demo realistici | Funzionante |
| Persistenza dati | localStorage (solo locale) |
| Autenticazione admin | Password hardcoded (solo demo) |
| Notifiche email | Non implementate |
| Notifiche WhatsApp | Non implementate |
| Hosting online | Non deployato |
| Database reale | Non collegato |

---

## 6. Cosa manca / cosa è da fare

### Priorità alta (bloccante per andare online)

- [ ] **Migrazione da localStorage a Supabase**
  - Creare progetto Supabase
  - Definire schema tabelle (`bookings`, `schedule_overrides`)
  - Riscrivere `data.js` con chiamate alle Supabase API (fetch)
  - Gestire loading states nell'UI

- [ ] **Autenticazione admin sicura**
  - Supabase Auth (email + password) oppure token fisso in variabile d'ambiente
  - Rimuovere la password hardcoded `admin123`
  - Proteggere le API Supabase con Row Level Security (RLS)

- [ ] **Deploy su GitHub Pages**
  - Creare repository GitHub
  - Abilitare GitHub Pages sul branch `main`
  - Aggiornare tutti i path relativi se necessario
  - Testare su mobile e desktop dopo il deploy

### Priorità media (importante per usabilità)

- [ ] **Notifiche email automatiche**
  - Scegliere provider: Brevo (raccomandato, gratis fino a 300/giorno) o Resend
  - Email di conferma immediata dopo la prenotazione
  - Email promemoria automatica il giorno prima (cron job su Supabase Edge Functions o servizio esterno)
  - Template email con branding TB Training

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

---

*Documento generato durante le sessioni di sviluppo con Claude Code.*
