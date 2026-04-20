// Supabase client — shared across all pages that need it
const SUPABASE_URL = 'https://ppymuuyoveyyoswcimck.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBweW11dXlvdmV5eW9zd2NpbWNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMjYxNDYsImV4cCI6MjA4NzYwMjE0Nn0.rstM8tgn0MfgDtWdbEk0061yxacJtFj5tV7HbmyGcXI';

// Serializzazione intra-tab per-nome usata quando navigator.locks non è
// disponibile oppure quando il lock request va in timeout. Una Promise chain
// garantisce che le operazioni sullo stesso nome vengano eseguite una alla
// volta anche senza Web Locks — niente più "esecuzione senza lock" che
// permetteva refresh concorrenti dell'auth e sessioni incoerenti.
const _authLockChains = new Map();

function _runSerialized(name, fn) {
    const prev = _authLockChains.get(name) || Promise.resolve();
    const run = prev.then(fn, fn); // prosegue anche se la precedente è fallita
    _authLockChains.set(name, run.catch(() => {}));
    return run;
}

// Stuck-lock detection: su PWA mobile navigator.locks può restare appeso quando
// l'OS sospende la webview in background. Dopo 2 timeout entro 30s assumiamo il
// lock API rotto e saltiamo direttamente al fallback JS per 60s → niente più
// "ogni chiamata attende 3s di timeout a vuoto".
let _locksBrokenUntil  = 0;
let _recentLockTimeouts = [];
const LOCK_ACQUIRE_MS       = 500;     // era 3000 → troppo alto, blocca l'UI
const LOCKS_BROKEN_WINDOW_MS = 30000;
const LOCKS_BROKEN_PENALTY_MS = 60000;

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        // Contratto supabase-js:
        //   acquireTimeout === 0 → "non-blocking": se il lock è già preso,
        //     NON aspettare, salta l'operazione. Usato dall'auto-refresh tick
        //     per evitare di accodare tick ridondanti.
        //   acquireTimeout > 0 o assente → blocking con cap.
        lock: async (name, acquireTimeout, fn) => {
            const nonBlocking = acquireTimeout === 0;
            const locksUsable = navigator?.locks && Date.now() > _locksBrokenUntil;

            if (locksUsable) {
                if (nonBlocking) {
                    // ifAvailable: la callback riceve null se il lock è occupato
                    return navigator.locks.request(name, { ifAvailable: true }, (lock) => {
                        if (!lock) return; // occupato → skip, come richiesto
                        return fn();
                    });
                }
                const timeout = Math.min(acquireTimeout ?? LOCK_ACQUIRE_MS, LOCK_ACQUIRE_MS);
                const ac = new AbortController();
                const timer = setTimeout(() => ac.abort(), timeout);
                try {
                    return await navigator.locks.request(name, { signal: ac.signal }, fn);
                } catch (e) {
                    if (e.name !== 'AbortError') throw e;
                    const now = Date.now();
                    _recentLockTimeouts = _recentLockTimeouts.filter(t => now - t < LOCKS_BROKEN_WINDOW_MS);
                    _recentLockTimeouts.push(now);
                    if (_recentLockTimeouts.length >= 2) {
                        _locksBrokenUntil = now + LOCKS_BROKEN_PENALTY_MS;
                        _recentLockTimeouts = [];
                        console.warn(`[Supabase Auth] navigator.locks appeso — disabilito per ${LOCKS_BROKEN_PENALTY_MS/1000}s (uso fallback JS)`);
                    } else {
                        console.warn(`[Supabase Auth] Lock timeout (${timeout}ms) — fallback mutex JS`);
                    }
                } finally {
                    clearTimeout(timer);
                }
            }

            // Fallback senza navigator.locks (o locks temporaneamente disabilitati).
            if (nonBlocking && _authLockChains.has(name)) return;
            return _runSerialized(name, fn);
        }
    }
});

// Log click on "Andrea Pompili" credit link
function logCreditClick() {
    // Don't preventDefault — let the <a> open normally (critical for iOS PWA)
    const user = window._currentUser;
    supabaseClient.from('click_andrea_pompili').insert({
        user_name:  user?.name  || null,
        user_email: user?.email || null,
        page:       window.location.pathname
    }).then(({ error }) => {
        if (error) console.error('credit-click log failed:', error.message);
    }).catch(err => console.error('credit-click exception:', err));
}
