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

// Notifica "slot disponibile" dopo una cancellazione — chiamata dal client
async function notifySlotAvailable(booking) {
    if (typeof SUPABASE_URL === 'undefined') return;

    // Notifica solo se lo slot era pieno prima della cancellazione.
    // A questo punto la cancellazione è già avvenuta: se ora ci sono (capacity-1)
    // prenotati confermati, significa che lo slot era pieno.
    if (typeof BookingStorage !== 'undefined') {
        const allBookings = BookingStorage.getAllBookings();
        const confirmedInSlot = allBookings.filter(b =>
            b.date === booking.date && b.time === booking.time && b.status === 'confirmed'
        ).length;
        const capacity = typeof BookingStorage.getEffectiveCapacity === 'function'
            ? BookingStorage.getEffectiveCapacity(booking.date, booking.time, booking.slotType)
            : 5;
        const wasFullBeforeCancellation = confirmedInSlot === capacity - 1;
        if (!wasFullBeforeCancellation) {
            console.log('[Push] Slot non era pieno — notifica slot available saltata');
            return;
        }
    }

    const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    let excludeUserId = user?.id ?? null;
    // Fallback: prova dalla sessione Supabase
    if (!excludeUserId && typeof supabaseClient !== 'undefined') {
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            excludeUserId = session?.user?.id ?? null;
        } catch {}
    }
    const dateDisplay = booking.dateDisplay || booking.date_display || booking.date || '';
    const date = booking.date || '';
    const time = booking.time || '';
    try {
        await fetch(`${SUPABASE_URL}/functions/v1/notify-slot-available`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date_display: dateDisplay, date, time, exclude_user_id: excludeUserId }),
        });
    } catch (e) {
        console.warn('[Push] notifySlotAvailable error:', e);
    }
}

// Se permesso già concesso, registra silenziosamente ad ogni apertura
if ('Notification' in window && Notification.permission === 'granted') {
    navigator.serviceWorker?.ready.then(() => registerPushSubscription());
}

// Mostra banner "Abilita notifiche" la prima volta che l'utente apre il calendario.
// Chiamata da index.html dopo initAuth(). Richiede interazione utente.
async function promptPushPermission() {
    if (!('Notification' in window) || !('PushManager' in window)) return;
    if (Notification.permission === 'granted') {
        await registerPushSubscription();
        return;
    }
    if (Notification.permission === 'denied') return;
    if (localStorage.getItem('push_prompt_dismissed')) return;

    const existing = document.getElementById('pushBanner');
    if (existing) return;

    const banner = document.createElement('div');
    banner.id = 'pushBanner';
    banner.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);width:calc(100% - 32px);max-width:400px;background:#1a1a1a;color:#fff;border-radius:18px;padding:18px 18px 16px;z-index:9999;box-shadow:0 8px 32px rgba(0,0,0,0.4);font-family:inherit;box-sizing:border-box';
    banner.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
            <div style="display:flex;align-items:center;gap:12px">
                <span style="font-size:26px;line-height:1">🔔</span>
                <div>
                    <div style="font-weight:700;font-size:15px;line-height:1.2">Abilita notifiche</div>
                    <div style="font-size:12px;color:#aaa;margin-top:4px;line-height:1.5">Promemoria 1h prima della lezione<br>e avvisi quando si libera uno slot</div>
                </div>
            </div>
            <button id="pushBannerClose" style="background:none;border:none;color:#666;cursor:pointer;font-size:20px;line-height:1;padding:0;margin-left:8px;flex-shrink:0">✕</button>
        </div>
        <button id="pushBannerYes" style="width:100%;background:#00AEEF;color:#fff;border:none;padding:12px;border-radius:10px;cursor:pointer;font-weight:700;font-size:14px;letter-spacing:0.01em">Abilita notifiche</button>
    `;
    document.body.appendChild(banner);

    const dismiss = () => { localStorage.setItem('push_prompt_dismissed', '1'); banner.remove(); };
    document.getElementById('pushBannerClose').addEventListener('click', dismiss);
    document.getElementById('pushBannerYes').addEventListener('click', async () => {
        banner.remove();
        const permission = await Notification.requestPermission();
        if (permission === 'granted') await registerPushSubscription();
        else localStorage.setItem('push_prompt_dismissed', '1');
    });
}
