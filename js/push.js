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
    try {
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
            sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
            });
        }
        await savePushSubscription(sub);
        return sub;
    } catch (e) {
        console.warn('[Push] Subscription fallita:', e);
        return null;
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

    // Salva su Supabase push_subscriptions
    if (typeof supabaseClient !== 'undefined' && userId) {
        supabaseClient.from('push_subscriptions').upsert({
            endpoint:   json.endpoint,
            p256dh:     json.keys.p256dh,
            auth:       json.keys.auth,
            user_id:    userId,
            user_email: userEmail,
        }, { onConflict: 'endpoint' }).then(({ error }) => {
            if (error) console.warn('[Push] Supabase save error:', error.message);
            else       console.log('[Push] Subscription salvata su Supabase per', userEmail);
        });
    } else {
        console.warn('[Push] Utente non autenticato — subscription non salvata su Supabase');
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
