// Push notification subscription management
// Chiave pubblica VAPID — la privata va nelle env vars di Supabase
const VAPID_PUBLIC_KEY = 'BE7xZi-LqD7QbdmMwZs9j1IsZ6bgmcDV_ShvVSajkYN3pXp5Q0dV4h3gG4M6eKKFBKG3iiqo6FtV5IwGXf2VO8c';

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
        savePushSubscription(sub);
        return sub;
    } catch (e) {
        console.warn('[Push] Subscription fallita:', e);
        return null;
    }
}

function savePushSubscription(subscription) {
    const json = subscription.toJSON();
    const user = typeof AuthStorage !== 'undefined' ? AuthStorage.getUser() : null;
    const data = {
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_phone: user?.whatsapp || null,
        user_email: user?.email || null,
        saved_at: new Date().toISOString()
    };
    localStorage.setItem('push_subscription', JSON.stringify(data));
    console.log('[Push] Subscription salvata in localStorage');
}

// Se permesso già concesso, registra silenziosamente ad ogni apertura
if ('Notification' in window && Notification.permission === 'granted') {
    navigator.serviceWorker?.ready.then(() => registerPushSubscription());
}

/*
 * TODO — quando migri a Supabase, sostituisci savePushSubscription() con:
 *
 * async function savePushSubscription(subscription) {
 *     const json = subscription.toJSON();
 *     const user = AuthStorage.getUser();
 *     await supabase.from('push_subscriptions').upsert({
 *         endpoint: json.endpoint,
 *         p256dh: json.keys.p256dh,
 *         auth: json.keys.auth,
 *         user_phone: user?.whatsapp || null,
 *         user_email: user?.email || null,
 *     }, { onConflict: 'endpoint' });
 * }
 *
 * Schema tabella Supabase:
 *   push_subscriptions (
 *     id uuid default gen_random_uuid() primary key,
 *     endpoint text unique not null,
 *     p256dh text not null,
 *     auth text not null,
 *     user_phone text,
 *     user_email text,
 *     created_at timestamptz default now()
 *   )
 *
 * VAPID private key → salvarla SOLO come secret in Supabase (env var VAPID_PRIVATE_KEY)
 *                      NON scriverla mai nel codice frontend
 */
