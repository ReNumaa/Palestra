# TB Training - Sistema di Prenotazione Palestra

Prototipo funzionale di sistema di prenotazione online per la palestra TB Training.

## Caratteristiche

### Per gli Utenti
- 📅 **Calendario interattivo** con visualizzazione settimanale (desktop) e giornaliera (mobile)
- 📱 **Design mobile-first** ottimizzato per smartphone con:
  - Selezione giorni scorrevole orizzontalmente
  - Card verticali per ogni slot con indicatori visivi posti occupati
  - Form ottimizzato touch con input grandi (no zoom iOS)
  - Smooth scrolling e animazioni fluide
- 🎨 **3 tipi di slot** con colori distintivi:
  - Personal Training (1-to-1) - Rosso
  - Small Group (2-4 persone) - Azzurro
  - Lezione di Gruppo (5+ persone) - Giallo
- 👥 **Contatore posti disponibili** (max 5 per slot gruppo) con indicatori a pallini colorati
- 📝 **Form di prenotazione** con validazione (nome, email, WhatsApp)
- ✅ **Conferma immediata** della prenotazione
- 📱 **Notifica WhatsApp** programmata (simulata - da implementare con API)

### Per l'Amministratore
- 🔐 **Dashboard protetta da password** (demo: admin123)
- 📑 **Interfaccia a 3 tab** organizzata:
  - **Tab Prenotazioni**: Calendario settimanale con utenti iscritti
  - **Tab Gestione Orari**: Editor orari settimanali
  - **Tab Statistiche**: Analytics e fatturato
- 📅 **Calendario admin settimanale** con visualizzazione dettagliata:
  - Navigazione giorno per giorno
  - Vista completa persone iscritte a ogni slot
  - Nome e telefono WhatsApp di ogni partecipante (no email)
  - Checkbox pagamento per tracciare i pagamenti ricevuti
  - Note aggiuntive se presenti
  - Contatore posti occupati/disponibili
  - Colori distintivi per tipo di lezione
- ⚙️ **Gestione orari settimanali e future**:
  - Navigazione settimana per settimana (precedente/successiva)
  - Visualizzazione con data completa (es. "Lunedì 16/02")
  - Tutti i 16 time slots (06:00-22:00) sempre visibili
  - Dropdown per assegnare/modificare tipo lezione per ogni slot
  - Possibilità di personalizzare orari per date specifiche (override)
  - Auto-save immediato delle modifiche
  - Sistema intelligente: usa template settimanale se non ci sono override specifici
- 💰 **Statistiche fatturato** mensile e totale
- 📊 **Grafici trend** prenotazioni ultimi 7 giorni
- 📈 **Distribuzione per tipo** di lezione (grafico a torta)
- 👥 **Tasso di occupazione** settimanale
- 🕒 **Fasce orarie più popolari**
- 📋 **Tabella prenotazioni recenti**
- 💾 **Esportazione dati** in formato JSON
- 🔄 **Reset dati demo** per rigenerare prenotazioni casuali

## Tecnologie Utilizzate

- **HTML5** - Struttura semantica
- **CSS3** - Styling moderno con gradients, flexbox e grid
- **JavaScript (Vanilla)** - Nessuna dipendenza esterna
- **LocalStorage** - Persistenza dati lato client (temporanea per demo)
- **Canvas API** - Grafici personalizzati

## Come Utilizzare

### Avvio Locale

1. Apri il file `index.html` in un browser moderno
2. Naviga il calendario settimanale con i pulsanti "Settimana Precedente/Successiva"
3. Clicca su uno slot disponibile (colorato e non completo)
4. Compila il form di prenotazione con i tuoi dati
5. Conferma la prenotazione

### Dashboard Admin

1. Clicca su "Admin" nel menu di navigazione
2. Inserisci la password: `admin123`
3. Visualizza statistiche, grafici e gestisci le prenotazioni

## Struttura del Progetto

```
Palestra-Booking-Prototype/
├── index.html              # Homepage con calendario e form prenotazione
├── admin.html              # Dashboard amministratore
├── css/
│   ├── style.css          # Stili principali
│   └── admin.css          # Stili dashboard admin
├── js/
│   ├── data.js            # Gestione dati e storage
│   ├── calendar.js        # Logica calendario
│   ├── booking.js         # Gestione prenotazioni
│   ├── chart-mini.js      # Libreria grafici personalizzata
│   └── admin.js           # Logica dashboard admin
└── README.md              # Questa documentazione
```

## Configurazione Slot

Gli slot sono configurati in `js/data.js`:

```javascript
const SLOT_TYPES = {
    PERSONAL: 'personal-training',      // Max 1 persona
    SMALL_GROUP: 'small-group',         // Max 4 persone
    GROUP_CLASS: 'group-class'          // Max 5 persone
};

const SLOT_PRICES = {
    'personal-training': 50,   // €50
    'small-group': 30,         // €30
    'group-class': 20          // €20
};
```

Il calendario settimanale è configurato nell'oggetto `WEEKLY_SCHEDULE_TEMPLATE`.

## Prossimi Passi per Produzione

### Backend (Consigliato)

**Stack suggerito per VPS:**

```
Node.js + Express + PostgreSQL
```

**Vantaggi:**
- Leggero e performante
- Facile da deployare
- Ottimo per API REST
- PostgreSQL robusto per dati critici

**Alternativa senza backend:**
```
Firebase / Supabase
```

**Vantaggi:**
- Setup rapido
- Autenticazione integrata
- Database real-time
- Hosting incluso

### Funzionalità da Implementare

1. **Backend API**
   - Endpoint per CRUD prenotazioni
   - Autenticazione JWT per admin
   - Validazione server-side

2. **Database**
   - Schema utenti e prenotazioni
   - Indici per performance
   - Backup automatici

3. **Notifiche WhatsApp**
   - Integrazione API (Twilio / WhatsApp Business API)
   - Cron job per invio promemoria automatici
   - Template messaggi personalizzabili

4. **Email**
   - Conferme prenotazione
   - Promemoria via email
   - Newsletter

5. **Pagamenti** (opzionale)
   - Stripe / PayPal integration
   - Gestione abbonamenti
   - Fatturazione automatica

6. **Miglioramenti UX**
   - PWA (Progressive Web App)
   - Notifiche push
   - App mobile (React Native / Flutter)

## Comandi Deployment VPS

### Esempio con Node.js + Express

```bash
# Installazione dipendenze
npm init -y
npm install express pg bcrypt jsonwebtoken dotenv

# Struttura backend suggerita
backend/
├── server.js
├── routes/
│   ├── bookings.js
│   └── auth.js
├── models/
│   ├── Booking.js
│   └── User.js
└── middleware/
    └── auth.js
```

### Esempio con Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

## Sicurezza

⚠️ **IMPORTANTE per la produzione:**

1. ✅ Cambiare password admin (attualmente hardcoded)
2. ✅ Implementare autenticazione sicura (JWT/OAuth)
3. ✅ Validazione input server-side
4. ✅ Rate limiting per prevenire spam
5. ✅ HTTPS obbligatorio
6. ✅ Sanitizzazione dati per prevenire XSS/SQL injection
7. ✅ CORS configurato correttamente
8. ✅ Backup database regolari

## Note sul Prototipo

- I dati sono salvati in **LocalStorage** (temporaneo)
- Le notifiche WhatsApp sono **simulate** (console.log)
- L'autenticazione admin è **base** (solo per demo)
- I grafici usano Canvas API (nessuna libreria esterna)
- **Dati demo**: Vengono generati automaticamente ~150-200 prenotazioni casuali per gli ultimi 7 giorni e prossimi 14 giorni
- **Sistema orari**: Template settimanale ricorrente + override per date specifiche

## Supporto Browser

- ✅ Chrome/Edge (raccomandato)
- ✅ Firefox
- ✅ Safari
- ⚠️ IE11 (non supportato)

## Licenza

Prototipo dimostrativo per TB Training - 2024

## Contatti

Per implementazione completa e deployment, considera:
- Backend API development
- Database design e ottimizzazione
- Integrazione WhatsApp Business API
- Deploy su VPS con Docker
- Monitoring e analytics

---

**Pronto per essere usato come base per lo sviluppo completo!** 🚀
