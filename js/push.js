// Push notification subscription management
// Chiave pubblica VAPID — la privata va nelle env vars di Supabase (secret VAPID_PRIVATE_KEY)
const VAPID_PUBLIC_KEY = 'BOIkkllAmpdW6-MWn85UW36xGPDk9rJDtEIs23w9gmVxGeKx3OSTqTVzcZOcz7gfm8kCHmzc3jp6J2IlEXC0AGA';

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
            // Confronta con backup locale: se l'endpoint è diverso, la subscription
            // è stata rigenerata dal browser (es. dopo toggle notifiche).
            // In quel caso è già nuova e va bene. Se invece è uguale ma le notifiche
            // erano state disattivate e riattivate, l'endpoint potrebbe essere morto.
            // Controlliamo se il permesso era stato revocato in precedenza.
            if (sub && localStorage.getItem('push_permission_was_denied') === '1') {
                console.log('[Push] Permesso era stato revocato — forzo rinnovo subscription');
                localStorage.removeItem('push_permission_was_denied');
                await sub.unsubscribe();
                sub = null;
            }
        }
        // Se non esiste subscription, ne crea una nuova
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

    // Se l'utente non è ancora autenticato, ritenta dopo 3 secondi (una sola volta)
    if (!userId && typeof supabaseClient !== 'undefined') {
        console.log('[Push] Utente non ancora autenticato — ritento fra 3s');
        setTimeout(async () => {
            try {
                const { data: { session } } = await supabaseClient.auth.getSession();
                const retryUserId = session?.user?.id ?? null;
                const retryEmail  = session?.user?.email ?? null;
                if (retryUserId) {
                    await _doSavePush(json, retryUserId, retryEmail);
                } else {
                    console.warn('[Push] Retry fallito — utente ancora non autenticato');
                }
            } catch (e) {
                console.warn('[Push] Retry savePushSubscription fallito:', e);
            }
        }, 3000);
        // Salva comunque in locale come backup
        localStorage.setItem('push_subscription', JSON.stringify({
            endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth,
            user_email: userEmail, saved_at: new Date().toISOString()
        }));
        return;
    }

    await _doSavePush(json, userId, userEmail);
}

async function _doSavePush(json, userId, userEmail) {
    // Salva su Supabase via RPC (SECURITY DEFINER — bypassa RLS)
    if (typeof supabaseClient !== 'undefined' && userId) {
        const { error } = await supabaseClient.rpc('save_push_subscription', {
            p_endpoint:   json.endpoint,
            p_p256dh:     json.keys.p256dh,
            p_auth:       json.keys.auth,
            p_user_email: userEmail,
            p_user_id:    userId,
        });
        if (error) {
            console.warn('[Push] Supabase RPC error:', error.message, error);
            const toastFn = typeof showToast === 'function' ? showToast : null;
            toastFn?.('Notifiche attivate, ma non salvate sul server. Riprova.', 'warning');
        } else {
            console.log('[Push] Subscription salvata su Supabase per', userEmail, userId);
        }
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
    const spotsAvailable = capacity - confirmedInSlot;
    try {
        await fetch(`${SUPABASE_URL}/functions/v1/notify-slot-available`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date_display: dateDisplay, date, time, exclude_user_id: excludeUserId, spots_available: spotsAvailable, max_capacity: capacity }),
        });
    } catch (e) {
        console.warn('[Push] notifySlotAvailable error:', e);
    }
}

// Notifica admin dopo una prenotazione confermata
async function notifyAdminBooking(booking) {
    console.log('[Push] notifyAdminBooking chiamata', booking);
    if (typeof SUPABASE_URL === 'undefined') {
        console.warn('[Push] SUPABASE_URL non definito — notifica admin saltata');
        return;
    }

    const dateDisplay = booking.dateDisplay || booking.date_display || booking.date || '';
    const date = booking.date || '';
    const time = booking.time || '';
    const slotType = booking.slotType || booking.slot_type || '';
    const maxCapacity = typeof BookingStorage !== 'undefined' && typeof BookingStorage.getEffectiveCapacity === 'function'
        ? BookingStorage.getEffectiveCapacity(date, time, slotType)
        : 5;

    try {
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/notify-admin-booking`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({
                name: booking.name || '',
                date_display: dateDisplay,
                date,
                time,
                slot_type: slotType,
                max_capacity: maxCapacity,
            }),
        });
        const result = await resp.json();
        console.log('[Push] notifyAdminBooking response:', resp.status, result);
    } catch (e) {
        console.warn('[Push] notifyAdminBooking error:', e);
    }
}

// Notifica admin dopo un annullamento
async function notifyAdminCancellation(booking, { withBonus = false, withMora = false } = {}) {
    console.log('[Push] notifyAdminCancellation chiamata', booking);
    if (typeof SUPABASE_URL === 'undefined') {
        console.warn('[Push] SUPABASE_URL non definito — notifica admin saltata');
        return;
    }

    const dateDisplay = booking.dateDisplay || booking.date_display || booking.date || '';
    const date = booking.date || '';
    const time = booking.time || '';
    const slotType = booking.slotType || booking.slot_type || '';
    const maxCapacity = typeof BookingStorage !== 'undefined' && typeof BookingStorage.getEffectiveCapacity === 'function'
        ? BookingStorage.getEffectiveCapacity(date, time, slotType)
        : 5;

    try {
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/notify-admin-cancellation`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({
                name: booking.name || '',
                date_display: dateDisplay,
                date,
                time,
                slot_type: slotType,
                max_capacity: maxCapacity,
                with_bonus: withBonus,
                with_mora: withMora,
            }),
        });
        const result = await resp.json();
        console.log('[Push] notifyAdminCancellation response:', resp.status, result);
    } catch (e) {
        console.warn('[Push] notifyAdminCancellation error:', e);
    }
}

// Notifica admin dopo una nuova registrazione
async function notifyAdminNewClient(name) {
    console.log('[Push] notifyAdminNewClient chiamata', name);
    if (typeof SUPABASE_URL === 'undefined') {
        console.warn('[Push] SUPABASE_URL non definito — notifica admin saltata');
        return;
    }

    try {
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/notify-admin-new-client`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ name }),
        });
        const result = await resp.json();
        console.log('[Push] notifyAdminNewClient response:', resp.status, result);
    } catch (e) {
        console.warn('[Push] notifyAdminNewClient error:', e);
    }
}

// Ad ogni apertura: traccia stato permesso e registra subscription
if ('Notification' in window) {
    if (Notification.permission === 'granted') {
        navigator.serviceWorker?.ready.then(() => registerPushSubscription());
    } else if (Notification.permission === 'denied') {
        // Segna che il permesso è stato revocato — quando verrà riattivato,
        // forzeremo il rinnovo della subscription (l'endpoint vecchio è morto)
        localStorage.setItem('push_permission_was_denied', '1');
        localStorage.removeItem('push_permission_granted');
    }
}

// Rileva iOS
function _isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
// Rileva se la PWA è installata (standalone / display-mode)
function _isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

// ── Geolocation proximity: notifica admin quando un utente con prenotazione si avvicina ──

const GYM_COORDS = { lat: 45.6603401, lng: 10.4199751 };
const PROXIMITY_RADIUS_M = 200;
const PROXIMITY_ADMIN_UID = 'cf5f39f3-1581-40be-80e9-15b56acee337';

function _haversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = x => x * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Restituisce la prossima prenotazione confermata entro 2 ore (o null)
function _getUpcomingBooking() {
    if (typeof BookingStorage === 'undefined') return null;
    const now = new Date();
    const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    if (!user) return null;

    const todayStr = typeof _localDateStr === 'function' ? _localDateStr(now) : now.toISOString().slice(0, 10);
    const bookings = BookingStorage.getAllBookings().filter(b =>
        b.date === todayStr && b.status === 'confirmed' && b.userId === user.id
    );

    for (const b of bookings) {
        const startTime = (b.time || '').split(' - ')[0]?.trim();
        if (!startTime) continue;
        const [h, m] = startTime.split(':').map(Number);
        const slotStart = new Date(now);
        slotStart.setHours(h, m, 0, 0);
        const diffMin = (slotStart - now) / 60000;
        // Prenotazione che inizia tra -120 min (ritardatari) e +120 min (in anticipo)
        if (diffMin >= -120 && diffMin <= 120) return b;
    }
    return null;
}

let _proximityWatchId = null;

function startProximityWatch() {
    if (_proximityWatchId !== null) return; // già attivo
    if (!('geolocation' in navigator)) return;
    if (typeof SUPABASE_URL === 'undefined') return;

    // Non attivare per l'admin stesso — la notifica è PER l'admin
    const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    if (user?.id === PROXIMITY_ADMIN_UID) return;

    const booking = _getUpcomingBooking();
    if (!booking) return;

    const sentKey = `proximity_sent_${booking.id}`;
    if (sessionStorage.getItem(sentKey)) return;

    // Se il permesso è già concesso, avvia direttamente il watch
    if (navigator.permissions) {
        navigator.permissions.query({ name: 'geolocation' }).then(result => {
            if (result.state === 'granted') {
                localStorage.setItem('geo_permission_granted', '1');
                _startWatch(booking, user, sentKey);
            } else if (result.state === 'denied') {
                return; // l'utente ha bloccato — non mostrare nulla
            } else {
                // 'prompt' — mostra il banner personalizzato
                _showGeoBanner(booking, user, sentKey);
            }
        }).catch(() => {
            // Fallback: controlla localStorage
            if (localStorage.getItem('geo_permission_granted') === '1') {
                _startWatch(booking, user, sentKey);
            } else {
                _showGeoBanner(booking, user, sentKey);
            }
        });
    } else if (localStorage.getItem('geo_permission_granted') === '1') {
        _startWatch(booking, user, sentKey);
    } else {
        _showGeoBanner(booking, user, sentKey);
    }
}

function _showGeoBanner(booking, user, sentKey) {
    // Non mostrare se un altro banner (push/install) è già visibile
    if (document.getElementById('pushBanner') || document.getElementById('geoBanner')) return;

    const banner = document.createElement('div');
    banner.id = 'geoBanner';
    banner.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);width:calc(100% - 32px);max-width:400px;background:#1a1a1a;color:#fff;border-radius:18px;padding:18px 18px 16px;z-index:9999;box-shadow:0 8px 32px rgba(0,0,0,0.4);font-family:inherit;box-sizing:border-box';
    banner.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
            <span style="font-size:26px;line-height:1">📍</span>
            <div>
                <div style="font-weight:700;font-size:15px;line-height:1.2">Abilita la posizione</div>
                <div style="font-size:12px;color:#aaa;margin-top:4px;line-height:1.5">Per segnalare il tuo arrivo<br>in palestra automaticamente</div>
            </div>
        </div>
        <button id="geoBannerYes" style="width:100%;background:#00AEEF;color:#fff;border:none;padding:12px;border-radius:10px;cursor:pointer;font-weight:700;font-size:14px;letter-spacing:0.01em">Abilita posizione</button>
    `;
    document.body.appendChild(banner);

    document.getElementById('geoBannerYes').addEventListener('click', () => {
        banner.remove();
        // Il browser mostrerà il popup nativo di conferma
        navigator.geolocation.getCurrentPosition(
            () => {
                localStorage.setItem('geo_permission_granted', '1');
                _startWatch(booking, user, sentKey);
            },
            (err) => {
                console.warn('[Proximity] Permesso geolocation negato:', err.message);
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    });
}

function _startWatch(booking, user, sentKey) {
    if (_proximityWatchId !== null) return;
    if (sessionStorage.getItem(sentKey)) return;

    console.log('[Proximity] Watch attivato per prenotazione', booking.id);

    _proximityWatchId = navigator.geolocation.watchPosition(
        async (pos) => {
            if (sessionStorage.getItem(sentKey)) {
                _stopProximityWatch();
                return;
            }
            const dist = _haversineMeters(pos.coords.latitude, pos.coords.longitude, GYM_COORDS.lat, GYM_COORDS.lng);
            console.log(`[Proximity] Distanza dalla palestra: ${Math.round(dist)}m`);

            if (dist <= PROXIMITY_RADIUS_M) {
                sessionStorage.setItem(sentKey, '1');
                _stopProximityWatch();
                console.log('[Proximity] Utente vicino — invio notifica admin');

                try {
                    await fetch(`${SUPABASE_URL}/functions/v1/notify-admin-proximity`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
                        },
                        body: JSON.stringify({
                            name: booking.name || user?.name || 'Utente',
                            date: booking.date,
                            time: booking.time,
                            slot_type: booking.slotType || booking.slot_type || '',
                        }),
                    });
                } catch (e) {
                    console.warn('[Proximity] Errore invio notifica:', e);
                }
            }
        },
        (err) => {
            console.warn('[Proximity] Geolocation error:', err.message);
            _stopProximityWatch();
        },
        { enableHighAccuracy: true, maximumAge: 30000, timeout: 10000 }
    );

    // Auto-stop dopo 2.5 ore per risparmiare batteria
    setTimeout(() => _stopProximityWatch(), 2.5 * 60 * 60 * 1000);
}

function _stopProximityWatch() {
    if (_proximityWatchId !== null) {
        navigator.geolocation.clearWatch(_proximityWatchId);
        _proximityWatchId = null;
        console.log('[Proximity] Watch fermato');
    }
}

// Mostra banner "Abilita notifiche" ad ogni apertura finché non viene accettato o negato dal browser.
// Chiamata da index.html dopo initAuth().
async function promptPushPermission() {
    if (!('Notification' in window) || !('PushManager' in window)) return;

    // Su iOS le push funzionano SOLO se la PWA è installata (aggiunta alla Home).
    // Se non è installata, non mostrare il banner push — mostra invece un invito a installare.
    if (_isIOS() && !_isStandalone()) {
        // Non mostrare il banner notifiche — verrà gestito dal banner installazione PWA
        return;
    }

    if (Notification.permission === 'granted') {
        localStorage.setItem('push_permission_granted', '1');
        await registerPushSubscription();
        return;
    }
    if (Notification.permission === 'denied') {
        localStorage.setItem('push_permission_was_denied', '1');
        localStorage.removeItem('push_permission_granted');
        return;
    }

    // Su iOS il permission state può resettarsi a 'default' tra le sessioni.
    // Se l'utente aveva già concesso il permesso, ri-registra senza mostrare il banner.
    if (localStorage.getItem('push_permission_granted') === '1') {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            await registerPushSubscription();
        } else {
            localStorage.removeItem('push_permission_granted');
        }
        return;
    }

    const existing = document.getElementById('pushBanner');
    if (existing) return;

    const banner = document.createElement('div');
    banner.id = 'pushBanner';
    banner.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);width:calc(100% - 32px);max-width:400px;background:#1a1a1a;color:#fff;border-radius:18px;padding:18px 18px 16px;z-index:9999;box-shadow:0 8px 32px rgba(0,0,0,0.4);font-family:inherit;box-sizing:border-box';
    banner.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
            <span style="font-size:26px;line-height:1">🔔</span>
            <div>
                <div style="font-weight:700;font-size:15px;line-height:1.2">Abilita notifiche</div>
                <div style="font-size:12px;color:#aaa;margin-top:4px;line-height:1.5">Promemoria 1h prima della lezione<br>e avvisi quando si libera uno slot</div>
            </div>
        </div>
        <button id="pushBannerYes" style="width:100%;background:#00AEEF;color:#fff;border:none;padding:12px;border-radius:10px;cursor:pointer;font-weight:700;font-size:14px;letter-spacing:0.01em">Abilita notifiche</button>
    `;
    document.body.appendChild(banner);

    document.getElementById('pushBannerYes').addEventListener('click', async () => {
        banner.remove();
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            localStorage.setItem('push_permission_granted', '1');
            await registerPushSubscription();
        }
    });
}
