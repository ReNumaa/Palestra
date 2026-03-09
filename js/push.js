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
    const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;

    // Salva su Supabase push_subscriptions (legata all'utente autenticato)
    if (typeof supabaseClient !== 'undefined' && user?.id) {
        supabaseClient.from('push_subscriptions').upsert({
            endpoint:   json.endpoint,
            p256dh:     json.keys.p256dh,
            auth:       json.keys.auth,
            user_id:    user.id,
            user_email: user.email || null,
        }, { onConflict: 'endpoint' }).then(({ error }) => {
            if (error) console.warn('[Push] Supabase save error:', error.message);
            else       console.log('[Push] Subscription salvata su Supabase');
        });
    } else {
        console.warn('[Push] Utente non autenticato — subscription non salvata su Supabase');
    }

    // Backup locale
    localStorage.setItem('push_subscription', JSON.stringify({
        endpoint:   json.endpoint,
        p256dh:     json.keys.p256dh,
        auth:       json.keys.auth,
        user_email: user?.email || null,
        saved_at:   new Date().toISOString()
    }));
}

// Se permesso già concesso, registra silenziosamente ad ogni apertura
if ('Notification' in window && Notification.permission === 'granted') {
    navigator.serviceWorker?.ready.then(() => registerPushSubscription());
}
