// Supabase client — shared across all pages that need it
const SUPABASE_URL = 'https://ppymuuyoveyyoswcimck.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBweW11dXlvdmV5eW9zd2NpbWNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMjYxNDYsImV4cCI6MjA4NzYwMjE0Nn0.rstM8tgn0MfgDtWdbEk0061yxacJtFj5tV7HbmyGcXI';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        // Previeni deadlock in PWA: navigator.locks può restare bloccato quando
        // l'OS sospende l'app in background durante un token refresh.
        // Usiamo il lock con timeout: se non si acquisisce entro 2s, esegui senza lock.
        lock: async (name, acquireTimeout, fn) => {
            if (navigator?.locks) {
                const ac = new AbortController();
                const timer = setTimeout(() => ac.abort(), acquireTimeout || 2000);
                try {
                    return await navigator.locks.request(name, { signal: ac.signal }, fn);
                } catch (e) {
                    if (e.name === 'AbortError') {
                        console.warn('[Supabase Auth] Lock timeout — esecuzione senza lock');
                        return fn();
                    }
                    throw e;
                } finally {
                    clearTimeout(timer);
                }
            }
            return fn();
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
