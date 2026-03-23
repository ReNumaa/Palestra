# Riassunto Progetto — Thomas Bresciani Palestra

## Task: Fix filtri statistiche admin non si aggiornano
**Data:** 2026-03-19
**Durata stimata:** 20 min Claude + 5 min prompt utente

### Modifiche effettuate
- Aggiunto sequence guard (`_loadDashboardSeq`) in `loadDashboardData()` per scartare risposte stale da fetch concorrenti
- Esteso range fetch di `_statsBookings` per coprire sempre almeno 12 mesi indietro (necessario per i grafici dei detail panel)
- Fix 4 funzioni detail panel (`renderFatturatoDetail`, `renderPrenotazioniDetail`, `renderClientiDetail`, `renderOccupancyDetail`) per usare `_statsBookings ?? BookingStorage.getAllBookings()` invece di localStorage
- Fix `updateNonChartData()` per usare `_statsBookings` se disponibile

### Decisioni prese
- Il sequence guard (pattern standard per request deduplication) è la fix principale della race condition: se l'utente clicca filtri rapidamente, solo l'ultima risposta viene applicata, le precedenti vengono scartate silenziosamente
- Il fetch range esteso a 12 mesi indietro permette ai detail panel di usare i dati Supabase invece di localStorage, garantendo dati freschi e coerenti con la main view
- Nessuna modifica all'HTML, solo `admin.js`

### File toccati
- `js/admin.js` — 5 modifiche puntuali (sequence guard, range fetch, 4 detail panel + updateNonChartData)

### Consumo risorse (solo per progetti cliente)
| Voce | Valore |
|------|--------|
| Tempo task Claude | ~20 min |
| Tempo prompt utente (stimato) | ~5 min |
| Token input (stimati) | ~80k |
| Token output (stimati) | ~5k |

## Task: Fix linea mancante tra ieri e oggi nei grafici statistiche
**Data:** 2026-03-23
**Durata stimata:** 10 min Claude + 2 min prompt utente

### Modifiche effettuate
- Aggiunto ponte (bridge) tra array `fActual` e `fForecast`/`fEstimate` dopo il loop di costruzione dati del grafico "Andamento e proiezione"
- Con `groupDays=1` (vista giornaliera) il caso "straddles pastCutoff" non scattava mai, lasciando un gap null tra l'ultimo punto actual e il primo punto forecast

### Decisioni prese
- Fix post-loop con ricerca del punto di transizione (ultimo actual non-null → primo null) anziché complicare la logica interna al loop
- Il ponte imposta `fForecast[g] = fActual[g]` così la linea tratteggiata parte esattamente dall'ultimo punto della linea solida
- Stessa logica applicata a `fEstimate` per la linea verde

### File toccati
- `js/admin-analytics.js` — aggiunto blocco bridge dopo riga 823 (10 righe)

### Consumo risorse (solo per progetti cliente)
| Voce | Valore |
|------|--------|
| Tempo task Claude | ~10 min |
| Tempo prompt utente (stimato) | ~2 min |
| Token input (stimati) | ~50k |
| Token output (stimati) | ~3k |

## Task: Aggiunta totale € nella legenda pie chart "Fatturato per tipo di lezione"
**Data:** 2026-03-23
**Durata stimata:** 5 min Claude + 1 min prompt utente

### Modifiche effettuate
- Legenda pie chart ora mostra il valore in € per ogni tipo oltre alla percentuale (es. "Autonomia — €450 (35%)")

### Decisioni prese
- Modifica in `drawPieChart()` di chart-mini.js, così il cambiamento si applica a tutti i pie chart (fatturato per tipo + metodo pagamento)

### File toccati
- `js/chart-mini.js` — legenda pie chart, riga 416

### Consumo risorse (solo per progetti cliente)
| Voce | Valore |
|------|--------|
| Tempo task Claude | ~5 min |
| Tempo prompt utente (stimato) | ~1 min |
| Token input (stimati) | ~40k |
| Token output (stimati) | ~2k |

## Task: Aggiunta flag "Documento firmato" al profilo utente
**Data:** 2026-03-23
**Durata stimata:** 15 min Claude + 5 min prompt utente

### Modifiche effettuate
- Nuova colonna `documento_firmato` (BOOLEAN DEFAULT FALSE) nella tabella `profiles` Supabase
- Aggiornata RPC `get_all_profiles()` per restituire il nuovo campo
- Admin può attivare/disattivare il flag dal popup "Modifica contatto" (checkbox nella sezione Documenti)
- Badge visivo nella card cliente admin: verde "Documento firmato" / rosso "Documento non firmato"
- Warning "Porta documento firmato" nella pagina prenotazioni utente se il flag è false
- L'utente non può modificare questo flag dal proprio profilo

### Decisioni prese
- Il campo è salvato sia in localStorage (cache `UserStorage._cache`) che su Supabase (`profiles.documento_firmato`), seguendo lo stesso pattern di tutti gli altri campi profilo
- La `_loadProfile()` in auth.js ora include `documento_firmato` nella SELECT, così `getCurrentUser()` lo espone all'utente
- La funzione `updateUserProfile()` (usata dall'utente) non tocca `documento_firmato` — solo l'admin tramite `_saveClientEditLocalProfile()` può modificarlo
- Warning utente usa classe `preno-cert-expiring` (stile giallo/avviso) coerente con gli altri warning

### File toccati
- `supabase/migrations/20260323300000_documento_firmato.sql` — nuova migration (colonna + RPC aggiornata)
- `js/auth.js` — aggiunto `documento_firmato` alla SELECT in `_loadProfile()`
- `js/data.js` — aggiunto `documentoFirmato` al merge in `syncUsersFromSupabase()`
- `js/admin-clients.js` — checkbox nel popup, badge nella card, salvataggio locale + Supabase
- `prenotazioni.html` — warning "Porta documento firmato" in `renderCertWarning()`
- `css/admin.css` — stile `.cedit-checkbox-label` per la checkbox nel popup

### Consumo risorse (solo per progetti cliente)
| Voce | Valore |
|------|--------|
| Tempo task Claude | ~15 min |
| Tempo prompt utente (stimato) | ~5 min |
| Token input (stimati) | ~120k |
| Token output (stimati) | ~8k |
