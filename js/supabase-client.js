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

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        // Previeni deadlock in PWA / desktop idle: navigator.locks può restare
        // bloccato quando l'OS sospende l'app o la tab durante un token refresh
        // (la fetch interna a Supabase rimane in pausa, lock mai rilasciato).
        //
        // Strategia in due stadi:
        //   1. navigator.locks con cap 3s (supabase-js passa anche 10s+).
        //   2. Se timeout o assenza dell'API → mutex JS (_runSerialized) che
        //      serializza per-nome dentro la tab. Evita refresh concorrenti
        //      lasciando comunque procedere l'app, a differenza di throw.
        // Usiamo `??` invece di `||` per rispettare un eventuale `0` (no-wait).
        lock: async (name, acquireTimeout, fn) => {
            if (navigator?.locks) {
                const timeout = Math.min(acquireTimeout ?? 1000, 3000);
                const ac = new AbortController();
                const timer = setTimeout(() => ac.abort(), timeout);
                try {
                    return await navigator.locks.request(name, { signal: ac.signal }, fn);
                } catch (e) {
                    if (e.name !== 'AbortError') throw e;
                    console.warn(`[Supabase Auth] Lock timeout (${timeout}ms) — fallback mutex JS`);
                } finally {
                    clearTimeout(timer);
                }
            }
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
