// Push notification subscription management
// Chiave pubblica VAPID — la privata va nelle env vars di Supabase (secret VAPID_PRIVATE_KEY)
const VAPID_PUBLIC_KEY = 'BMV_WwKcaQr4c5l-Yz7FJtTHQDqagPGMiNLAZmKi4vfGpapKEZxE4RyaYRU1kn9E230XyX1YURsVRMjkfOOgwpQ';

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function registerPushSubscription() {
    if (!('PushManager' in window) || !navigator.serviceWorker) return null;
    const reg = await navigator.serviceWorker.ready;
    const appKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);

    async function _subscribe() {
        let sub = await reg.pushManager.getSubscription();
        if (sub) {
            // Controlla se la chiave VAPID corrisponde — se no, cancella e ricrea
            const existingKey = sub.options?.applicationServerKey;
            if (existingKey) {
                const a = new Uint8Array(existingKey);
                const b = appKey;
                const mismatch = a.length !== b.length || a.some((v, i) => v !== b[i]);
                if (mismatch) {
                    console.log('[Push] Chiave VAPID cambiata — cancello subscription vecchia');
                    await sub.unsubscribe();
                    sub = null;
                }
            }
        }
        if (!sub) {
            sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey });
        }
        return sub;
    }

    try {
        const sub = await _subscribe();
        await savePushSubscription(sub);
        return sub;
    } catch (e) {
        // Fallback: forza cancellazione e ricrea (es. push service error)
        try {
            console.warn('[Push] Primo tentativo fallito, forzo unsubscribe e riprovo:', e.message);
            const old = await reg.pushManager.getSubscription();
            if (old) await old.unsubscribe();
            const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey });
            await savePushSubscription(sub);
            return sub;
        } catch (e2) {
            console.warn('[Push] Subscription fallita definitivamente:', e2);
            return null;
        }
    }
}

async function savePushSubscription(subscription) {
    const json = subscription.toJSON();

    // Recupera user_id direttamente dalla sessione Supabase (non dipende dal timing di initAuth)
    let userId = null;
    let userEmail = null;
    if (typeof supabaseClient !== 'undefined') {
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            userId    = session?.user?.id    ?? null;
            userEmail = session?.user?.email ?? null;
        } catch {}
    }
    // Fallback al cached getCurrentUser se la sessione non è ancora pronta
    if (!userId) {
        const u = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
        userId    = u?.id    ?? null;
        userEmail = u?.email ?? null;
    }

    // Salva su Supabase via RPC (SECURITY DEFINER — bypassa RLS)
    if (typeof supabaseClient !== 'undefined' && userId) {
        supabaseClient.rpc('save_push_subscription', {
            p_endpoint:   json.endpoint,
            p_p256dh:     json.keys.p256dh,
            p_auth:       json.keys.auth,
            p_user_email: userEmail,
            p_user_id:    userId,
        }).then(({ error }) => {
            if (error) console.warn('[Push] Supabase RPC error:', error.message, error);
            else       console.log('[Push] Subscription salvata su Supabase per', userEmail, userId);
        });
    } else {
        console.warn('[Push] Utente non autenticato — subscription non salvata su Supabase', { userId, userEmail, supabaseReady: typeof supabaseClient !== 'undefined' });
    }

    // Backup locale
    localStorage.setItem('push_subscription', JSON.stringify({
        endpoint:   json.endpoint,
        p256dh:     json.keys.p256dh,
        auth:       json.keys.auth,
        user_email: userEmail,
        saved_at:   new Date().toISOString()
    }));
}

// Se permesso già concesso, registra silenziosamente ad ogni apertura
if ('Notification' in window && Notification.permission === 'granted') {
    navigator.serviceWorker?.ready.then(() => registerPushSubscription());
}

// Mostra banner "Abilita notifiche" se il permesso non è ancora stato dato.
// Chiamata da prenotazioni.html dopo initAuth(), richiede interazione utente.
async function promptPushPermission() {
    if (!('Notification' in window) || !('PushManager' in window)) return; // browser non supporta
    if (Notification.permission === 'granted') {
        // Già concesso: assicurati che la subscription sia su Supabase
        await registerPushSubscription();
        return;
    }
    if (Notification.permission === 'denied') return; // utente ha negato

    // Mostra banner
    const existing = document.getElementById('pushBanner');
    if (existing) return;
    const banner = document.createElement('div');
    banner.id = 'pushBanner';
    banner.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:#1a1a1a;color:#fff;padding:14px 20px;border-radius:12px;display:flex;align-items:center;gap:12px;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.3);max-width:90vw;font-size:14px';
    banner.innerHTML = `
        <span>🔔 Ricevi promemoria 1h prima della lezione</span>
        <button id="pushBannerYes" style="background:#fff;color:#1a1a1a;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;font-weight:600;white-space:nowrap">Abilita</button>
        <button id="pushBannerNo" style="background:transparent;color:#aaa;border:none;cursor:pointer;font-size:18px;padding:0 4px">✕</button>
    `;
    document.body.appendChild(banner);
    document.getElementById('pushBannerYes').addEventListener('click', async () => {
        banner.remove();
        const permission = await Notification.requestPermission();
        if (permission === 'granted') await registerPushSubscription();
    });
    document.getElementById('pushBannerNo').addEventListener('click', () => banner.remove());
}
