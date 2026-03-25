# TB Training — Audit di Sicurezza

> Data audit: 24 marzo 2026
> Scope: HTML, JS, CSS, SQL migrations, Edge Functions

---

## Riepilogo

L'applicazione ha un buon livello di sicurezza per il suo contesto (palestra locale, ~200 utenti). Le protezioni server-side (RLS, RPC SECURITY DEFINER, FOR UPDATE locks) sono solide. Le vulnerabilita residue sono a basso rischio pratico.

---

## Protezioni attive

- **RLS** configurata su tutte le tabelle — utenti vedono solo i propri dati
- **RPC atomiche** con `SECURITY DEFINER` + `is_admin()` check + `FOR UPDATE` locks
- **Advisory lock** anti-overbooking su `book_slot_atomic`
- **Optimistic locking** con `updated_at` trigger
- **XSS prevention**: `_escHtml()` applicata in `showToast()` e nei punti di interpolazione innerHTML
- **CSP meta tag** su tutte le pagine (`script-src 'self' 'unsafe-inline' cdn.jsdelivr.net`)
- **Audit trail** su operazioni admin (`admin_audit_log`)
- **HTTPS** forzato (GitHub Pages + Supabase)

---

## Vulnerabilita note

### ALTA — A1. Autenticazione admin con fallback password

**File:** `js/admin.js`

L'autenticazione admin ha un fallback password SHA-256 client-side. Se Supabase non e raggiungibile, il fallback permette di vedere la dashboard ma **le RPC admin falliscono comunque** (richiedono `is_admin()` server-side).

**Rischio pratico:** basso — l'attaccante vedrebbe la UI ma non potrebbe eseguire operazioni.

**Raccomandazione:** rimuovere il fallback quando l'accesso offline non serve piu.

---

### ALTA — A2. CSP permette `unsafe-inline`

La CSP include `'unsafe-inline'` per scripts (necessario per gli `onclick` inline in HTML).

**Raccomandazione (lungo termine):** migrare da `onclick="..."` a `addEventListener()`, poi rimuovere `'unsafe-inline'`.

---

### MEDIA — M1. Uso quasi-completo di _escHtml()

`_escHtml()` e applicata nella maggior parte dei punti innerHTML, ma non ovunque (es. alcuni messaggi in `admin-analytics.js`, `admin-settings.js`). I dati interpolati provengono quasi sempre da Supabase o costanti JS.

**Raccomandazione:** passata sistematica per coprire tutti i punti.

---

### MEDIA — M2. Console logging con dati personali

Email e user ID loggati in console (`auth.js`, `push.js`). Visibili da DevTools.

**Raccomandazione:** ridurre il logging in produzione.

---

### BASSA — B1. Edge Functions senza verifica JWT

`notify-slot-available`, `notify-admin-booking`, `send-admin-message` sono deployate con `--no-verify-jwt`. Le funzioni sono di sola notifica (non modificano dati). Un attaccante potrebbe inviare spam push se conosce l'URL.

**Raccomandazione:** rate limiting o token custom per `send-admin-message`.

---

### BASSA — B2. Mancano security headers HTTP

GitHub Pages non permette headers custom (`X-Content-Type-Options`, `X-Frame-Options`, HSTS). Mitigato parzialmente da CSP meta tag e HTTPS forzato.

---

### INFO

- **Supabase Anon Key in JS** — architettura standard, non una vulnerabilita. La sicurezza e garantita da RLS.
- **VAPID public key in JS** — progettata per essere pubblica.
- **Nessun rate limiting su prenotazioni** — Supabase ha rate limiting built-in (~100 req/s). Per una palestra locale, trascurabile.

---

## Fix gia applicati

| Issue | Stato |
|---|---|
| XSS in `showToast()` — `_escHtml()` applicata al messaggio | Risolto |
| File backup JS in produzione (`admin_backup_20260321.js`) | Rimosso |
| `cancel_booking_with_refund` senza `FOR UPDATE` | Risolto |
| `fulfill_pending_cancellation` accessibile da `anon` | Risolto |
| RLS `bookings_public_insert` troppo permissiva | Risolto |
| Mancava validazione input nelle RPC admin | Risolto |
| Admin session bypass via DevTools | Hardened con check JWT |
| Optimistic locking mancante | Aggiunto `updated_at` + trigger |
| CSP mancanti | Aggiunti meta tag su tutte le pagine |
| Audit trail mancante | `admin_audit_log` + trigger |

---

## Raccomandazioni aperte

| Priorita | Task |
|---|---|
| Media | Passata sistematica `_escHtml()` su tutti gli innerHTML |
| Media | Ridurre console logging in produzione |
| Bassa | Rimuovere fallback password admin |
| Bassa | Migrare da inline event handlers per rimuovere `unsafe-inline` dalla CSP |
| Bassa | Rate limiting su `send-admin-message` |

---

## Dipendenze di sicurezza critiche

1. **Supabase RLS** — verificare periodicamente con `SELECT * FROM pg_policies`
2. **SECURITY DEFINER functions** — devono validare i permessi internamente (tutte includono `is_admin()`)
3. **JWT Supabase** — secret gestito da Supabase, non accessibile dal client
4. **HTTPS** — forzato da GitHub Pages e Supabase

---

*Report generato tramite analisi statica del codice sorgente — 24 marzo 2026*
