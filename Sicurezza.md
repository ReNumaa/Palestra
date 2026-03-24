# TB Training — Audit di Sicurezza

> Data audit: 24 marzo 2026
> Auditor: Claude Code (analisi statica del codice sorgente)
> Scope: tutti i file HTML, JS, CSS, SQL migrations, Edge Functions

---

## Riepilogo

| Severita | Trovate | Mitigate |
|---|---|---|
| ALTA | 3 | 1 parzialmente |
| MEDIA | 5 | 3 |
| BASSA | 4 | 2 |
| INFO | 3 | — |

L'applicazione ha un buon livello di sicurezza per il suo contesto (palestra locale, ~200 utenti). Le protezioni server-side (RLS, RPC SECURITY DEFINER, FOR UPDATE locks) sono solide. Le vulnerabilita residue sono principalmente legate all'architettura frontend-only (nessun backend proprio).

---

## SEVERITA ALTA

### A1. Autenticazione admin con doppio fallback

**File:** `js/admin.js`

**Problema:** l'autenticazione admin ha due livelli:
1. **Primario:** verifica JWT Supabase (`app_metadata.role = "admin"`) — sicuro
2. **Fallback:** password SHA-256 client-side + `sessionStorage.adminAuth` — aggirabile

Se Supabase non e' raggiungibile (offline, errore rete), il fallback permette accesso admin con la sola password. L'hash SHA-256 e il salt (`tb-admin-2026`) sono visibili nel codice sorgente pubblico su GitHub.

**Rischio reale:** BASSO in pratica — senza Supabase attivo, le RPC admin falliscono comunque (tutte richiedono `is_admin()` lato server). L'attaccante vedrebbe la dashboard ma non potrebbe eseguire operazioni.

**Raccomandazione:** rimuovere il fallback password quando si e' certi che l'accesso offline non e' piu' necessario. Le operazioni admin richiedono comunque connessione a Supabase.

**Stato:** parzialmente mitigato (RPC server-side bloccano le operazioni anche con bypass client).

---

### A2. XSS in messaggi di errore (showToast)

**File:** `js/ui.js` (riga 54), `js/admin-settings.js` (righe 371, 422)

**Problema:** `showToast()` usa `innerHTML` senza escaping:
```javascript
toast.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-message">${message}</span>`;
```

I messaggi di errore da Supabase vengono passati direttamente:
```javascript
showToast(`Errore: ${e.message}`, 'error');
```

Se un messaggio di errore Supabase contenesse HTML/JS, verrebbe eseguito nel browser.

**Rischio reale:** BASSO — i messaggi Supabase sono tipicamente testo semplice. Ma un attaccante che controlla i dati in tabella potrebbe iniettare HTML tramite un campo che finisce in un messaggio di errore.

**Raccomandazione:** applicare `_escHtml()` al parametro `message` dentro `showToast()`:
```javascript
toast.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-message">${_escHtml(message)}</span>`;
```

---

### A3. CSP permette `unsafe-inline`

**File:** tutte le pagine HTML (meta tag CSP)

**Problema:** la Content Security Policy include `'unsafe-inline'` per scripts e styles:
```html
script-src 'self' 'unsafe-inline' cdn.jsdelivr.net;
style-src 'self' 'unsafe-inline';
```

Questo indebolisce significativamente la protezione CSP contro XSS, perche' qualsiasi HTML injection puo' eseguire script inline.

**Causa:** l'app usa `onclick="toggleNavMenu()"` e simili inline handler in HTML.

**Rischio reale:** MEDIO — combinato con eventuali punti di injection (A2), un attaccante potrebbe eseguire codice.

**Raccomandazione (lungo termine):** migrare da inline event handlers (`onclick="..."`) a `addEventListener()` in JS, poi rimuovere `'unsafe-inline'` dalla CSP.

---

## SEVERITA MEDIA

### M1. Push subscription credentials in localStorage

**File:** `js/push.js` (righe 141-147)

**Problema:** le chiavi crittografiche della push subscription (`p256dh`, `auth`) e l'email utente sono salvate in localStorage in chiaro.

**Rischio:** accessibili a qualsiasi script che gira sulla pagina. Con un XSS, l'attaccante potrebbe rubare le credenziali push.

**Mitigazione esistente:** le subscription sono legate al browser e non riutilizzabili su altri dispositivi. Il rischio pratico e' limitato.

**Raccomandazione:** valutare se il salvataggio in localStorage e' ancora necessario dopo la migrazione a Supabase (la subscription e' gia' salvata server-side).

---

### M2. sessionStorage per flag admin

**File:** `js/auth.js` (righe ~117-125)

**Problema:** il flag `adminAuth` in sessionStorage puo' essere impostato da DevTools o da script XSS per far apparire il link "Amministrazione" nella navbar.

**Mitigazione esistente:** il flag controlla solo la visibilita' del link — l'accesso effettivo alla dashboard richiede `checkAuth()` che verifica il JWT Supabase. Le operazioni admin richiedono `is_admin()` server-side.

**Rischio reale:** BASSO — l'attaccante vedrebbe la pagina admin ma non potrebbe fare nulla.

---

### M3. Uso inconsistente di _escHtml()

**File:** vari file admin-*.js

**Problema:** `_escHtml()` e' usata nella maggior parte dei punti di interpolazione innerHTML, ma non in tutti. Esempi dove manca:

- `admin-analytics.js` — tipo di lezione interpolato in innerHTML senza escape
- `admin-settings.js` — messaggi di errore in innerHTML

**Mitigazione esistente:** i dati interpolati provengono quasi sempre da Supabase (gia' validati) o da costanti JS. Il rischio di injection e' basso ma il pattern inconsistente crea rischio di regressione.

**Raccomandazione:** fare una passata sistematica e assicurarsi che TUTTI i dati dinamici in innerHTML passino per `_escHtml()`.

---

### M4. Backup file JS in produzione

**File:** `js/admin_backup_20260321.js`

**Problema:** file di backup del codice admin presente nella directory deployata. Contiene codice duplicato e potenzialmente versioni vecchie con vulnerabilita' gia' corrette.

**Raccomandazione:** rimuovere il file dal repository e aggiungerlo a `.gitignore`.

---

### M5. Console logging con dati personali

**File:** `js/auth.js`, `js/push.js`, `js/admin.js`

**Problema:** email e user ID degli utenti sono loggati in console:
```javascript
console.log('[Push] Subscription salvata su Supabase per', userEmail, userId);
```

**Rischio:** chiunque apra DevTools puo' vedere questi dati. Su dispositivi condivisi, l'utente successivo potrebbe accedervi.

**Raccomandazione:** ridurre il logging in produzione. Usare solo per debug con un flag `DEBUG` globale.

---

## SEVERITA BASSA

### B1. Supabase Anon Key esposta in JS

**File:** `js/supabase-client.js` (riga 3)

**Nota:** questa e' architettura standard Supabase, NON una vulnerabilita'. L'anon key e' progettata per essere pubblica (come una API key read-only). Tutta la sicurezza e' garantita da RLS server-side.

**Verifica effettuata:** le RLS policies sono configurate correttamente su tutte le tabelle. Le operazioni admin richiedono JWT con claim `role: admin`. Le RPC usano `SECURITY DEFINER` + `is_admin()`.

**Rischio:** se una RLS policy fosse misconfigured, l'anon key permetterebbe accesso non autorizzato. Ma questo vale per qualsiasi applicazione Supabase.

**Raccomandazione:** periodicamente verificare le RLS policies con `SELECT * FROM pg_policies`.

---

### B2. VAPID public key in JS

**File:** `js/push.js` (riga 3)

**Nota:** la VAPID public key e' progettata per essere pubblica (e' la componente pubblica della coppia). La chiave privata e' nei secrets Supabase (non accessibile dal client).

**Nessuna azione necessaria.**

---

### B3. Edge Functions con `--no-verify-jwt`

**File:** `notify-slot-available`, `notify-admin-booking`, `send-admin-message`

**Problema:** queste Edge Functions sono deployate senza verifica JWT. Chiunque con l'URL potrebbe invocarle.

**Mitigazione esistente:** le funzioni accettano un `Authorization: Bearer SUPABASE_ANON_KEY` che e' gia' pubblico. Le operazioni sono di sola notifica push (non modificano dati).

**Rischio:** un attaccante potrebbe inviare spam push se conosce l'URL. Ma le push subscriptions sono legate a utenti reali e le notifiche non contengono dati sensibili.

**Raccomandazione:** aggiungere rate limiting o un token custom come header per le Edge Functions piu' sensibili (`send-admin-message`).

---

### B4. Mancano security headers HTTP

**Problema:** GitHub Pages non permette di configurare headers HTTP personalizzati. Mancano:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security` (HSTS)

**Mitigazione:** i meta tag CSP coprono parzialmente. GitHub Pages forza HTTPS.

**Raccomandazione:** se si migra a un hosting con controllo headers (Cloudflare Pages, Vercel), aggiungere questi headers.

---

## INFO

### I1. Password operativa elimina dati cliente

La password "Palestra123" per l'eliminazione dati cliente e' una conferma operativa, non un'autenticazione. L'operazione richiede comunque `is_admin()` lato server via RPC `admin_delete_client_data`.

### I2. Nessun rate limiting su prenotazioni

Non c'e' rate limiting sulle prenotazioni. Un utente malintenzionato potrebbe fare molte prenotazioni rapidamente. `book_slot_atomic` previene l'overbooking ma non limita la frequenza.

**Mitigazione:** Supabase ha rate limiting built-in sulle API (default ~100 req/s). Per una palestra locale, il rischio e' trascurabile.

### I3. Dati sensibili in Backups/ directory

La cartella `Backups/` contiene file JSON con dati completi (prenotazioni, crediti, dati utente). E' listata in `.gitignore` ma presente sul filesystem locale.

---

## Dipendenze di sicurezza critiche

La sicurezza dell'applicazione si basa su:

1. **Supabase RLS** — se misconfigured, i dati sono esposti. Verificare periodicamente.
2. **SECURITY DEFINER functions** — bypassano RLS, devono validare i permessi internamente. Tutte le RPC admin includono `is_admin()` check.
3. **JWT di Supabase** — se il secret JWT fosse compromesso, tutta l'autenticazione sarebbe compromessa. Il secret e' gestito da Supabase (non accessibile).
4. **HTTPS** — GitHub Pages forza HTTPS. Supabase usa HTTPS per tutte le API.

---

## Raccomandazioni prioritarie

### Immediate (da fare subito)

1. **Fix XSS in showToast()** — applicare `_escHtml()` al messaggio. 5 minuti di lavoro.
2. **Rimuovere `admin_backup_20260321.js`** — file duplicato potenzialmente pericoloso.

### Breve termine

3. **Passata sistematica _escHtml()** — verificare tutti gli innerHTML con dati dinamici.
4. **Ridurre console logging** — rimuovere email/userId dai log in produzione.

### Lungo termine

5. **Rimuovere fallback password admin** — quando l'accesso offline non e' piu' necessario.
6. **Migrare da inline event handlers** — per poter rimuovere `'unsafe-inline'` dalla CSP.
7. **Rate limiting su send-admin-message** — per prevenire spam push.

---

## Conclusione

L'applicazione ha un'architettura di sicurezza solida per il suo contesto:
- **RLS correttamente configurata** su tutte le tabelle
- **Operazioni atomiche server-side** con validazione permessi
- **FOR UPDATE locks** anti-race-condition
- **Audit trail** su operazioni admin
- **XSS prevention** con `_escHtml()` (quasi ovunque)
- **CSP meta tag** su tutte le pagine

Le vulnerabilita' residue sono a basso rischio pratico per una palestra locale con ~200 utenti. I fix raccomandati come "immediati" richiedono meno di 30 minuti di lavoro totale.

---

*Report generato tramite analisi statica del codice sorgente — 24 marzo 2026*
