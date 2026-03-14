// Restituisce la data locale corrente (o di un oggetto Date) come "YYYY-MM-DD".
// Usa il fuso locale del browser, non UTC — evita l'off-by-one dopo le 23:00 CET.
function _localDateStr(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Parsa "HH:MM - HH:MM" in { startH, startM, endH, endM }.
// Restituisce null e logga un errore se il formato non è riconosciuto.
function _parseSlotTime(str) {
    if (!str || typeof str !== 'string') {
        console.error('[_parseSlotTime] Formato orario non valido:', str);
        return null;
    }
    const parts = str.split(' - ');
    if (parts.length !== 2) {
        console.error('[_parseSlotTime] Formato atteso "HH:MM - HH:MM":', str);
        return null;
    }
    const [sh, sm] = parts[0].trim().split(':').map(Number);
    const [eh, em] = parts[1].trim().split(':').map(Number);
    if ([sh, sm, eh, em].some(isNaN)) {
        console.error('[_parseSlotTime] Ore/minuti non numerici in:', str);
        return null;
    }
    return { startH: sh, startM: sm, endH: eh, endM: em };
}

// Salva in localStorage con gestione QuotaExceededError.
// Logga l'errore senza lanciare eccezioni — evita crash silenziosi su storage pieno.
function _lsSet(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (e) {
        if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22)) {
            console.error('[localStorage] QuotaExceededError: impossibile salvare', key,
                '— dimensione approssimativa:', Math.round((value?.length || 0) / 1024), 'KB');
            if (typeof showToast === 'function') showToast('⚠️ Memoria locale piena. Alcuni dati potrebbero non essere salvati.', 'error', 8000);
        } else {
            console.error('[localStorage] Errore setItem per chiave', key, ':', e);
        }
        return false;
    }
}

// Legge e parsa JSON da localStorage con protezione errori.
function _lsGetJSON(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
        console.error('[localStorage] JSON.parse error per chiave', key, ':', e);
        return fallback;
    }
}

// Wrappa una promise RPC con un timeout esplicito.
// Se supera ms millisecondi, rifiuta con Error('rpc_timeout').
function _rpcWithTimeout(promise, ms = 12000) {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('rpc_timeout')), ms)
        )
    ]);
}

// Mock data storage - In production, this would be a database
const SLOT_TYPES = {
    PERSONAL: 'personal-training',
    SMALL_GROUP: 'small-group',
    GROUP_CLASS: 'group-class'
};

const SLOT_MAX_CAPACITY = {
    'personal-training': 5,
    'small-group': 5,
    'group-class': 0
};

const SLOT_PRICES = {
    'personal-training': 5,
    'small-group': 10,
    'group-class': 30
};

const SLOT_NAMES = {
    'personal-training': 'Autonomia',
    'small-group': 'Lezione di Gruppo',
    'group-class': 'Slot prenotato'
};

// Time slots configuration — 80 min each, 05:20 → 21:20
const TIME_SLOTS = [
    '05:20 - 06:40',
    '06:40 - 08:00',
    '08:00 - 09:20',
    '09:20 - 10:40',
    '10:40 - 12:00',
    '12:00 - 13:20',
    '13:20 - 14:40',
    '14:40 - 16:00',
    '16:00 - 17:20',
    '17:20 - 18:40',
    '18:40 - 20:00',
    '20:00 - 21:20'
];

// Bump this whenever DEFAULT_WEEKLY_SCHEDULE changes — forces a reset for all clients
const SCHEDULE_VERSION = 'v8';

// Default weekly schedule — all 12 slots assigned every day
// 🟢 GREEN = personal-training | 🟡 YELLOW = small-group | 🔴 RED = group-class
const DEFAULT_WEEKLY_SCHEDULE = {
    'Lunedì': [
        { time: '05:20 - 06:40', type: SLOT_TYPES.PERSONAL },   // 🟢
        { time: '06:40 - 08:00', type: SLOT_TYPES.PERSONAL },   // 🟢
        { time: '08:00 - 09:20', type: SLOT_TYPES.SMALL_GROUP },// 🟡
        { time: '09:20 - 10:40', type: SLOT_TYPES.SMALL_GROUP },// 🟡
        { time: '10:40 - 12:00', type: SLOT_TYPES.SMALL_GROUP },// 🟡
        { time: '12:00 - 13:20', type: SLOT_TYPES.PERSONAL },   // 🟢
        { time: '13:20 - 14:40', type: SLOT_TYPES.PERSONAL },   // 🟢
        { time: '14:40 - 16:00', type: SLOT_TYPES.PERSONAL },   // 🟢
        { time: '16:00 - 17:20', type: SLOT_TYPES.SMALL_GROUP },// 🟡
        { time: '17:20 - 18:40', type: SLOT_TYPES.SMALL_GROUP },// 🟡
        { time: '18:40 - 20:00', type: SLOT_TYPES.PERSONAL },   // 🟢
        { time: '20:00 - 21:20', type: SLOT_TYPES.PERSONAL }    // 🟢
    ],
    'Martedì': [
        { time: '05:20 - 06:40', type: SLOT_TYPES.SMALL_GROUP },// 🟡
        { time: '06:40 - 08:00', type: SLOT_TYPES.SMALL_GROUP },// 🟡
        { time: '08:00 - 09:20', type: SLOT_TYPES.SMALL_GROUP },// 🟡
        { time: '09:20 - 10:40', type: SLOT_TYPES.SMALL_GROUP },// 🟡
        { time: '10:40 - 12:00', type: SLOT_TYPES.PERSONAL },   // 🟢
        { time: '12:00 - 13:20', type: SLOT_TYPES.PERSONAL },   // 🟢
        { time: '13:20 - 14:40', type: SLOT_TYPES.PERSONAL },   // 🟢
        { time: '14:40 - 16:00', type: SLOT_TYPES.GROUP_CLASS },// 🔴
        { time: '16:00 - 17:20', type: SLOT_TYPES.SMALL_GROUP },// 🟡
        { time: '17:20 - 18:40', type: SLOT_TYPES.SMALL_GROUP },// 🟡
        { time: '18:40 - 20:00', type: SLOT_TYPES.SMALL_GROUP },// 🟡
        { time: '20:00 - 21:20', type: SLOT_TYPES.PERSONAL }    // 🟢
    ],
    'Mercoledì': [
        { time: '05:20 - 06:40', type: SLOT_TYPES.SMALL_GROUP },// 🟡
        { time: '06:40 - 08:00', type: SLOT_TYPES.SMALL_GROUP },// 🟡
        { time: '08:00 - 09:20', type: SLOT_TYPES.SMALL_GROUP },// 🟡
        { time: '09:20 - 10:40', type: SLOT_TYPES.SMALL_GROUP },// 🟡
        { time: '10:40 - 12:00', type: SLOT_TYPES.PERSONAL },   // 🟢
        { time: '12:00 - 13:20', type: SLOT_TYPES.PERSONAL },   // 🟢
        { time: '13:20 - 14:40', type: SLOT_TYPES.PERSONAL },   // 🟢
        { time: '14:40 - 16:00', type: SLOT_TYPES.SMALL_GROUP },// 🟡
        { time: '16:00 - 17:20', type: SLOT_TYPES.SMALL_GROUP },// 🟡
        { time: '17:20 - 18:40', type: SLOT_TYPES.SMALL_GROUP },// 🟡
        { time: '18:40 - 20:00', type: SLOT_TYPES.SMALL_GROUP },// 🟡
        { time: '20:00 - 21:20', type: SLOT_TYPES.PERSONAL }    // 🟢
    ],
    'Giovedì': [
        { time: '05:20 - 06:40', type: SLOT_TYPES.PERSONAL },   // 🟢
        { time: '06:40 - 08:00', type: SLOT_TYPES.PERSONAL },   // 🟢
        { time: '08:00 - 09:20', type: SLOT_TYPES.PERSONAL },   // 🟢
        { time: '09:20 - 10:40', type: SLOT_TYPES.PERSONAL },   // 🟢
        { time: '10:40 - 12:00', type: SLOT_TYPES.PERSONAL },   // 🟢
        { time: '12:00 - 13:20', type: SLOT_TYPES.PERSONAL },   // 🟢
        { time: '13:20 - 14:40', type: SLOT_TYPES.PERSONAL },   // 🟢
        { time: '14:40 - 16:00', type: SLOT_TYPES.PERSONAL },   // 🟢
        { time: '16:00 - 17:20', type: SLOT_TYPES.PERSONAL },   // 🟢
        { time: '17:20 - 18:40', type: SLOT_TYPES.PERSONAL },   // 🟢
        { time: '18:40 - 20:00', type: SLOT_TYPES.PERSONAL },   // 🟢
        { time: '20:00 - 21:20', type: SLOT_TYPES.PERSONAL }    // 🟢
    ],
    'Venerdì': [
        { time: '05:20 - 06:40', type: SLOT_TYPES.GROUP_CLASS },// 🔴
        { time: '06:40 - 08:00', type: SLOT_TYPES.PERSONAL },   // 🟢
        { time: '08:00 - 09:20', type: SLOT_TYPES.PERSONAL },   // 🟢
        { time: '09:20 - 10:40', type: SLOT_TYPES.SMALL_GROUP },// 🟡
        { time: '10:40 - 12:00', type: SLOT_TYPES.SMALL_GROUP },// 🟡
        { time: '12:00 - 13:20', type: SLOT_TYPES.SMALL_GROUP },// 🟡
        { time: '13:20 - 14:40', type: SLOT_TYPES.PERSONAL },   // 🟢
        { time: '14:40 - 16:00', type: SLOT_TYPES.GROUP_CLASS },// 🔴
        { time: '16:00 - 17:20', type: SLOT_TYPES.SMALL_GROUP },// 🟡
        { time: '17:20 - 18:40', type: SLOT_TYPES.SMALL_GROUP },// 🟡
        { time: '18:40 - 20:00', type: SLOT_TYPES.PERSONAL },   // 🟢
        { time: '20:00 - 21:20', type: SLOT_TYPES.PERSONAL }    // 🟢
    ],
    'Sabato': [
        { time: '05:20 - 06:40', type: SLOT_TYPES.PERSONAL },   // 🟢
        { time: '06:40 - 08:00', type: SLOT_TYPES.PERSONAL },   // 🟢
        { time: '08:00 - 09:20', type: SLOT_TYPES.SMALL_GROUP },// 🟡
        { time: '09:20 - 10:40', type: SLOT_TYPES.SMALL_GROUP },// 🟡
        { time: '10:40 - 12:00', type: SLOT_TYPES.SMALL_GROUP },// 🟡
        { time: '12:00 - 13:20', type: SLOT_TYPES.PERSONAL },   // 🟢
        { time: '13:20 - 14:40', type: SLOT_TYPES.PERSONAL },   // 🟢
        { time: '14:40 - 16:00', type: SLOT_TYPES.SMALL_GROUP },// 🟡
        { time: '16:00 - 17:20', type: SLOT_TYPES.SMALL_GROUP },// 🟡
        { time: '17:20 - 18:40', type: SLOT_TYPES.PERSONAL },   // 🟢
        { time: '18:40 - 20:00', type: SLOT_TYPES.PERSONAL },   // 🟢
        { time: '20:00 - 21:20', type: SLOT_TYPES.PERSONAL }    // 🟢
    ],
    'Domenica': [
        { time: '05:20 - 06:40', type: SLOT_TYPES.PERSONAL },   // 🟢
        { time: '06:40 - 08:00', type: SLOT_TYPES.PERSONAL },   // 🟢
        { time: '08:00 - 09:20', type: SLOT_TYPES.PERSONAL },   // 🟢
        { time: '09:20 - 10:40', type: SLOT_TYPES.PERSONAL },   // 🟢
        { time: '10:40 - 12:00', type: SLOT_TYPES.PERSONAL },   // 🟢
        { time: '12:00 - 13:20', type: SLOT_TYPES.PERSONAL },   // 🟢
        { time: '13:20 - 14:40', type: SLOT_TYPES.PERSONAL },   // 🟢
        { time: '14:40 - 16:00', type: SLOT_TYPES.PERSONAL },   // 🟢
        { time: '16:00 - 17:20', type: SLOT_TYPES.PERSONAL },   // 🟢
        { time: '17:20 - 18:40', type: SLOT_TYPES.PERSONAL },   // 🟢
        { time: '18:40 - 20:00', type: SLOT_TYPES.PERSONAL },   // 🟢
        { time: '20:00 - 21:20', type: SLOT_TYPES.PERSONAL }    // 🟢
    ]
};

// Function to get the current weekly schedule (from localStorage or default)
function getWeeklySchedule() {
    const saved = localStorage.getItem('weeklyScheduleTemplate');
    const savedVersion = localStorage.getItem('scheduleVersion');
    if (saved && savedVersion === SCHEDULE_VERSION) {
        try {
            const parsed = JSON.parse(saved);
            // Extra safety: verify slot format matches current TIME_SLOTS
            const storedTimes = Object.values(parsed).flat().map(s => s.time);
            const isCurrentFormat = storedTimes.length === 0 || storedTimes.every(t => TIME_SLOTS.includes(t));
            if (isCurrentFormat) return parsed;
        } catch { /* corrupted — will reset below */ }
    }
    // Outdated version or format — reset template and overrides
    localStorage.removeItem('scheduleOverrides');
    _lsSet('weeklyScheduleTemplate', JSON.stringify(DEFAULT_WEEKLY_SCHEDULE));
    _lsSet('scheduleVersion', SCHEDULE_VERSION);
    return DEFAULT_WEEKLY_SCHEDULE;
}

// Global variable that will be used throughout the app
let WEEKLY_SCHEDULE_TEMPLATE = getWeeklySchedule();

// Storage functions
class BookingStorage {
    static BOOKINGS_KEY = 'gym_bookings';
    static STATS_KEY = 'gym_stats';
    static _cache = [];

    static getAllBookings() {
        return this._cache;
    }

    // Fetches bookings from Supabase and updates the localStorage cache.
    // - Admin: SELECT * (sees all via is_admin() RLS)
    // - Authenticated user: SELECT own + RPC availability for others' slots (synthetic)
    // - Anon: RPC availability only (no personal data)
    static _syncRetryTimer = null;

    static async syncFromSupabase() {
        if (typeof supabaseClient === 'undefined') return;
        try {
            const user    = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
            const isAdmin = localStorage.getItem('adminAuthenticated') === 'true';

            // Date range for availability RPC (~3 months forward)
            const todayStr = _localDateStr();
            const endDate  = new Date(); endDate.setDate(endDate.getDate() + 90);
            const endStr   = _localDateStr(endDate);

            if (!user && !isAdmin) {
                // ── ANON: solo disponibilità aggregata, nessun dato personale ──────────
                const { data: availData, error } = await _rpcWithTimeout(
                    supabaseClient.rpc('get_availability_range', { p_start: todayStr, p_end: endStr })
                ).catch(e => ({ data: null, error: e }));
                if (error) {
                    console.error('[Supabase] get_availability_range error:', error.message);
                    if (typeof showToast === 'function') showToast('Errore di sincronizzazione. I dati potrebbero non essere aggiornati.', 'error', 5000);
                    return;
                }
                const synth = this._buildSyntheticBookings(availData, {});
                // Mantieni booking in cache non-sintetici (pending insert non ancora su Supabase)
                const local = this._cache.filter(b => !b.id?.startsWith('_avail_'));
                this._cache = [...synth, ...local];
                console.log(`[Supabase] syncFromSupabase (anon): ${synth.length} slot sintetici`);
                return;
            }

            // ── ADMIN o UTENTE: SELECT bookings reali ─────────────────────────────────
            // Admin: finestra operativa (6 mesi passati + 3 futuri) per contenere localStorage.
            // Query complete (senza limite) per stats/export avvengono tramite fetchForAdmin().
            let qBookings = supabaseClient.from('bookings').select('*').order('created_at', { ascending: false });
            if (isAdmin) {
                const pastD   = new Date(); pastD.setDate(pastD.getDate() - 180);
                const futureD = new Date(); futureD.setDate(futureD.getDate() + 90);
                qBookings = qBookings
                    .gte('date', _localDateStr(pastD))
                    .lte('date', _localDateStr(futureD));
            }
            const fetchBookings = qBookings;

            // Utente non-admin: richiede anche la disponibilità aggregata in parallelo
            const fetchAvail = !isAdmin
                ? _rpcWithTimeout(supabaseClient.rpc('get_availability_range', { p_start: todayStr, p_end: endStr }))
                    .catch(e => ({ data: null, error: e }))
                : Promise.resolve({ data: null, error: null });

            const [{ data, error }, { data: availData, error: e2 }] =
                await Promise.all([fetchBookings, fetchAvail]);

            if (error) {
                console.error('[Supabase] syncFromSupabase error:', error.message);
                if (typeof showToast === 'function') showToast('Errore di sincronizzazione. I dati potrebbero non essere aggiornati.', 'error', 5000);
                return;
            }
            if (e2) { console.error('[Supabase] get_availability_range error:', e2.message); }

            const mapped = data.map(row => this._mapRow(row));

            // Booking sintetici per slot occupati da altri (solo utente non-admin)
            let synth = [];
            if (!isAdmin && availData) {
                const ownCounts = {};
                for (const b of mapped) {
                    if (b.status === 'confirmed') {
                        const k = `${b.date}|${b.time}`;
                        ownCounts[k] = (ownCounts[k] || 0) + 1;
                    }
                }
                synth = this._buildSyntheticBookings(availData, ownCounts);
            }

            // Pending: booking in cache recenti (< 30 min) non ancora confermati su Supabase
            const supabaseIds = new Set(mapped.map(m => m.id));
            const local = this._cache.filter(b => !b.id?.startsWith('_avail_'));
            const now = Date.now();
            const dataLastCleared = localStorage.getItem('dataLastCleared') || '0';
            const pending = local.filter(b => {
                if (supabaseIds.has(b.id) || b.status === 'cancelled') return false;
                const age = now - new Date(b.createdAt).getTime();
                if (age >= 30 * 60 * 1000) return false;
                if (b.createdAt <= dataLastCleared) return false;
                return true;
            });

            this._cache = [...mapped, ...synth, ...pending];
            console.log(`[Supabase] syncFromSupabase (${isAdmin ? 'admin' : 'user'}): ${mapped.length} da Supabase, ${synth.length} sintetici, ${pending.length} pending`);

            this._retryPending(pending, user);
            // Sync riuscita — cancella eventuale retry pendente
            clearTimeout(BookingStorage._syncRetryTimer);
        } catch (e) {
            console.error('[Supabase] syncFromSupabase exception:', e);
            if (typeof showToast === 'function') showToast('Errore di connessione al server. Verifica la tua connessione.', 'error', 5000);
            // Retry automatico dopo 5 secondi (max 1 tentativo)
            clearTimeout(BookingStorage._syncRetryTimer);
            BookingStorage._syncRetryTimer = setTimeout(() => {
                console.log('[Supabase] syncFromSupabase — retry automatico');
                BookingStorage.syncFromSupabase();
            }, 5000);
        }
    }

    // Mappa una riga Supabase al formato booking localStorage
    static _mapRow(row) {
        return {
            id:                       row.local_id || row.id,
            _sbId:                    row.id,
            userId:                   row.user_id,
            date:                     row.date,
            time:                     row.time,
            slotType:                 row.slot_type,
            dateDisplay:              row.date_display || '',
            name:                     row.name,
            email:                    row.email,
            whatsapp:                 row.whatsapp,
            notes:                    row.notes || '',
            status:                   row.status,
            paid:                     row.paid || false,
            paymentMethod:            row.payment_method || null,
            paidAt:                   row.paid_at || null,
            creditApplied:            row.credit_applied || 0,
            createdAt:                row.created_at,
            cancellationRequestedAt:  row.cancellation_requested_at || null,
            cancelledAt:              row.cancelled_at || null,
            cancelledPaymentMethod:   row.cancelled_payment_method || null,
            cancelledPaidAt:          row.cancelled_paid_at || null,
            cancelledWithBonus:       row.cancelled_with_bonus || false,
            cancelledWithPenalty:     row.cancelled_with_penalty || false,
            cancelledRefundPct:       row.cancelled_refund_pct ?? null,
            updatedAt:                row.updated_at || null,
        };
    }

    // Crea booking sintetici (senza dati personali) per slot occupati da altri utenti.
    // availData: array di {slot_date, slot_time, slot_type, confirmed_count} dalla RPC
    // ownCounts: {date|time -> n} dei propri booking già confermati (da sottrarre)
    static _buildSyntheticBookings(availData, ownCounts) {
        const result = [];
        for (const row of availData || []) {
            const d     = row.slot_date;
            const t     = row.slot_time;
            const own   = ownCounts[`${d}|${t}`] || 0;
            const count = Math.max(0, Number(row.confirmed_count) - own);
            for (let i = 0; i < count; i++) {
                result.push({
                    id:        `_avail_${d}_${t.replace(/[: ]/g, '')}_${row.slot_type}_${i}`,
                    date:      d,
                    time:      t,
                    slotType:  row.slot_type,
                    status:    'confirmed',
                    name:      '',
                    email:     '',
                    whatsapp:  '',
                    notes:     '',
                    paid:      false,
                    createdAt: d + 'T00:00:00.000Z',
                });
            }
        }
        return result;
    }

    // Fetch diretto da Supabase senza toccare localStorage — usato da stats admin ed export.
    // startStr / endStr: 'YYYY-MM-DD' oppure null per nessun limite.
    static async fetchForAdmin(startStr, endStr) {
        if (typeof supabaseClient === 'undefined') return [];
        try {
            let q = supabaseClient.from('bookings').select('*').order('date', { ascending: false });
            if (startStr) q = q.gte('date', startStr);
            if (endStr)   q = q.lte('date', endStr);
            const { data, error } = await q;
            if (error) { console.error('[Supabase] fetchForAdmin error:', error.message); return []; }
            return data.map(row => this._mapRow(row));
        } catch (e) {
            console.error('[Supabase] fetchForAdmin exception:', e);
            return [];
        }
    }

    // Ritenta l'insert su Supabase per booking in stato pending (falliti in precedenza)
    static _retryPending(pending, user) {
        for (const b of pending) {
            console.warn('[Supabase] retry insert booking pending:', b.id);
            supabaseClient.from('bookings').insert({
                local_id:     b.id,
                user_id:      user?.id || b.userId || null,
                date:         b.date,
                time:         b.time,
                slot_type:    b.slotType,
                name:         b.name,
                email:        b.email,
                whatsapp:     b.whatsapp,
                notes:        b.notes || '',
                status:       b.status || 'confirmed',
                created_at:   b.createdAt,
                date_display: b.dateDisplay || '',
            }).then(({ error }) => {
                if (error && error.code !== '23505')
                    console.error('[Supabase] retry insert error:', error.message);
                else if (!error)
                    console.log('[Supabase] retry insert OK:', b.id);
            });
        }
    }

    static async saveBooking(booking) {
        booking.id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        booking.createdAt = new Date().toISOString();
        booking.status = 'confirmed';

        if (typeof supabaseClient === 'undefined') {
            return { ok: false, error: 'offline', booking };
        }

        const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
        const maxCap = BookingStorage.getEffectiveCapacity(booking.date, booking.time, booking.slotType);
        const { data, error } = await supabaseClient.rpc('book_slot_atomic', {
            p_local_id:     booking.id,
            p_user_id:      user?.id || null,
            p_date:         booking.date,
            p_time:         booking.time,
            p_slot_type:    booking.slotType,
            p_max_capacity: maxCap,
            p_name:         booking.name,
            p_email:        booking.email,
            p_whatsapp:     booking.whatsapp,
            p_notes:        booking.notes || '',
            p_created_at:   booking.createdAt,
            p_date_display: booking.dateDisplay || ''
        });
        if (error) {
            console.error('[Supabase] book_slot_atomic error:', error.message);
            return { ok: false, error: 'server_error', booking };
        }
        if (!data || !data.success) {
            const reason = data?.error || 'unknown';
            console.warn('[Supabase] book_slot_atomic rifiutato:', reason);
            return { ok: false, error: reason, booking };
        }
        // RPC confermata — aggiorna cache in memoria
        booking._sbId = data.booking_id || null;
        this._cache.push(booking);
        this.updateStats(booking);
        console.log('[Supabase] book_slot_atomic OK — id:', booking.id);
        return { ok: true, booking };
    }

    // Versione admin di saveBooking: usa clientUserId per il record Supabase
    // in modo che il promemoria push arrivi al cliente, non all'admin.
    // Il backend è protetto da is_admin() sulle RPC; questo guard dà un errore chiaro
    // se la sessione admin non è attiva (A6 fix).
    static async saveBookingForClient(booking, clientUserId) {
        if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('adminAuth') !== 'true') {
            console.warn('[saveBookingForClient] Chiamata senza sessione admin attiva — operazione bloccata lato frontend');
            return { ok: false, error: 'not_admin', booking };
        }
        booking.id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        booking.createdAt = new Date().toISOString();
        booking.status = 'confirmed';

        if (typeof supabaseClient === 'undefined') {
            return { ok: false, error: 'offline', booking };
        }

        const maxCap = BookingStorage.getEffectiveCapacity(booking.date, booking.time, booking.slotType);
        const { data, error } = await supabaseClient.rpc('book_slot_atomic', {
            p_local_id:     booking.id,
            p_user_id:      clientUserId || null,
            p_date:         booking.date,
            p_time:         booking.time,
            p_slot_type:    booking.slotType,
            p_max_capacity: maxCap,
            p_name:         booking.name,
            p_email:        booking.email,
            p_whatsapp:     booking.whatsapp,
            p_notes:        booking.notes || '',
            p_created_at:   booking.createdAt,
            p_date_display: booking.dateDisplay || ''
        });
        if (error) {
            console.error('[Supabase] adminBook error:', error.message);
            return { ok: false, error: 'server_error', booking };
        }
        if (!data || !data.success) {
            console.warn('[Supabase] adminBook rifiutato:', data?.error);
            return { ok: false, error: data?.error || 'unknown', booking };
        }
        booking._sbId = data.booking_id || null;
        this._cache.push(booking);
        this.updateStats(booking);
        return { ok: true, booking };
    }

    static getBookingsForSlot(date, time) {
        const bookings = this.getAllBookings();
        return bookings.filter(b => b.date === date && b.time === time && b.status !== 'cancelled');
    }

    // Capacità effettiva = base + numero di extra dello stesso tipo salvati sullo slot
    static getEffectiveCapacity(date, time, slotType) {
        const overrides = this.getScheduleOverrides();
        const slots = overrides[date] || [];
        const slot = slots.find(s => s.time === time);
        // Se il tipo richiesto è diverso dal tipo principale, la base è 0: contano solo gli extra
        const isMainType = !slot || slot.type === slotType;
        const base = isMainType ? (SLOT_MAX_CAPACITY[slotType] || 0) : 0;
        if (!slot || !slot.extras || slot.extras.length === 0) return base;
        return base + slot.extras.filter(e => e.type === slotType).length;
    }

    static getRemainingSpots(date, time, slotType) {
        const bookings = this.getBookingsForSlot(date, time);
        // Filtra per tipo: ogni "categoria" ha la propria capacità indipendente
        const confirmedCount = bookings.filter(b => b.status === 'confirmed' && (!b.slotType || b.slotType === slotType)).length;
        const maxCapacity = this.getEffectiveCapacity(date, time, slotType);
        return maxCapacity - confirmedCount;
    }

    // Aggiunge un posto extra di tipo extraType allo slot di quella data/ora
    static addExtraSpot(date, time, extraType) {
        const overrides = this.getScheduleOverrides();
        const slots = overrides[date] || [];
        const slot = slots.find(s => s.time === time);
        if (!slot) return false;
        if (!slot.extras) slot.extras = [];
        slot.extras.push({ type: extraType });
        this.saveScheduleOverrides(overrides);
        return true;
    }

    // Rimuove l'ultimo extra di tipo extraType se non è già prenotato
    static removeExtraSpot(date, time, extraType) {
        const overrides = this.getScheduleOverrides();
        const slots = overrides[date] || [];
        const slot = slots.find(s => s.time === time);
        if (!slot || !slot.extras) return false;
        const extrasOfType = slot.extras.filter(e => e.type === extraType).length;
        if (extrasOfType === 0) return false;
        // Controlla se c'è posto libero da rimuovere
        const isMainType = slot.type === extraType;
        const base = isMainType ? (SLOT_MAX_CAPACITY[extraType] || 0) : 0;
        const bookings = this.getBookingsForSlot(date, time);
        const bookedCount = bookings.filter(b => b.status === 'confirmed' && b.slotType === extraType).length;
        const effectiveCap = base + extrasOfType;
        if (effectiveCap - bookedCount <= 0) return false; // tutti i posti occupati
        const idx = slot.extras.map(e => e.type).lastIndexOf(extraType);
        slot.extras.splice(idx, 1);
        this.saveScheduleOverrides(overrides);
        return true;
    }

    // Cancella direttamente una prenotazione (small-group, autonomia) senza conversione slot
    // Usato quando il cliente annulla con più di 24h di anticipo
    static cancelDirectly(id) {
        const all = this.getAllBookings();
        const booking = all.find(b => b.id === id);
        if (!booking || booking.status !== 'confirmed') return false;
        const wasPaid = booking.paid || (booking.creditApplied || 0) > 0;
        const slotType = booking.slotType;
        booking.cancelledPaymentMethod = booking.paymentMethod;
        booking.cancelledPaidAt = booking.paidAt;
        booking.status = 'cancelled';
        booking.cancelledAt = new Date().toISOString();
        const savedCreditApplied = booking.creditApplied || 0;
        booking.paid = false;
        booking.paymentMethod = null;
        booking.paidAt = null;
        booking.creditApplied = 0;
        this.replaceAllBookings(all);
        const creditToRefund = wasPaid
            ? (savedCreditApplied > 0 ? savedCreditApplied : (SLOT_PRICES[slotType] || 0))
            : 0;
        if (creditToRefund > 0) {
            CreditStorage.addCredit(
                booking.whatsapp, booking.email, booking.name,
                creditToRefund,
                `Rimborso annullamento ${booking.date} ${booking.time}`,
                null, false, true
            );
        }
        return true;
    }

    // Cancella immediatamente uno "Slot prenotato" e converte lo slot in "Lezione di Gruppo"
    // Usato quando il cliente annulla con più di 24h di anticipo
    // Supabase migration: sostituire le due operazioni con una RPC atomica
    static cancelAndConvertSlot(id) {
        const all = this.getAllBookings();
        const booking = all.find(b => b.id === id);
        if (!booking || booking.status !== 'confirmed') return false;
        const wasPaid = booking.paid || (booking.creditApplied || 0) > 0;
        const slotType = booking.slotType;

        // Cancella subito la prenotazione
        booking.cancelledPaymentMethod = booking.paymentMethod;
        booking.cancelledPaidAt = booking.paidAt;
        booking.status = 'cancelled';
        booking.cancelledAt = new Date().toISOString();
        const savedCreditApplied2 = booking.creditApplied || 0;
        booking.paid = false;
        booking.paymentMethod = null;
        booking.paidAt = null;
        booking.creditApplied = 0;
        this.replaceAllBookings(all);
        const creditToRefund = wasPaid
            ? (savedCreditApplied2 > 0 ? savedCreditApplied2 : (SLOT_PRICES[slotType] || 0))
            : 0;
        if (creditToRefund > 0) {
            CreditStorage.addCredit(
                booking.whatsapp, booking.email, booking.name,
                creditToRefund,
                `Rimborso annullamento ${booking.date} ${booking.time}`,
                null, false, true
            );
        }

        // Converte lo slot in Gestione Orari da group-class a small-group
        const overrides = this.getScheduleOverrides();
        const dateSlots = overrides[booking.date];
        if (dateSlots) {
            const slot = dateSlots.find(s => s.time === booking.time && s.type === SLOT_TYPES.GROUP_CLASS);
            if (slot) {
                slot.type = SLOT_TYPES.SMALL_GROUP;
                delete slot.client;
                delete slot.bookingId;
                this.saveScheduleOverrides(overrides);
            }
        }
        return true;
    }

    // Cancella una prenotazione non annullabile usando il bonus giornaliero.
    // Rimborsa il credito (come cancelDirectly) e consuma il bonus (1 → 0).
    static cancelWithBonus(id) {
        const all = this.getAllBookings();
        const booking = all.find(b => b.id === id);
        if (!booking || booking.status !== 'confirmed') return false;
        const wasPaid = booking.paid || (booking.creditApplied || 0) > 0;
        const slotType = booking.slotType;
        booking.cancelledPaymentMethod = booking.paymentMethod;
        booking.cancelledPaidAt = booking.paidAt;
        booking.status = 'cancelled';
        booking.cancelledAt = new Date().toISOString();
        booking.cancelledWithBonus = true;
        const savedCreditApplied3 = booking.creditApplied || 0;
        booking.paid = false;
        booking.paymentMethod = null;
        booking.paidAt = null;
        booking.creditApplied = 0;
        this.replaceAllBookings(all);
        // Per group-class: riconverte lo slot in small-group
        if (slotType === SLOT_TYPES.GROUP_CLASS) {
            const overrides = this.getScheduleOverrides();
            const dateSlots = overrides[booking.date];
            if (dateSlots) {
                const slot = dateSlots.find(s => s.time === booking.time && s.type === SLOT_TYPES.GROUP_CLASS);
                if (slot) {
                    slot.type = SLOT_TYPES.SMALL_GROUP;
                    delete slot.client;
                    delete slot.bookingId;
                    this.saveScheduleOverrides(overrides);
                }
            }
        }
        const creditToRefund = wasPaid
            ? (savedCreditApplied3 > 0 ? savedCreditApplied3 : (SLOT_PRICES[slotType] || 0))
            : 0;
        if (creditToRefund > 0) {
            CreditStorage.addCredit(
                booking.whatsapp, booking.email, booking.name,
                creditToRefund,
                `Rimborso annullamento con bonus ${booking.date} ${booking.time}`,
                null, false, true
            );
        }
        // Usa i dati del profilo corrente come identificatore authoritative per il bonus,
        // in modo che getBonus(user.whatsapp, user.email) trovi sempre il record.
        const _cu = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
        BonusStorage.useBonus(
            _cu?.whatsapp || booking.whatsapp,
            _cu?.email    || booking.email,
            _cu?.name     || booking.name
        );
        return true;
    }

    // Annulla con mora del 50%: rimborso immediato al 50% del prezzo
    // Usato quando il cliente è nella finestra ristretta e la modalità è 'penalty-50'
    static cancelWithPenalty(id) {
        const all = this.getAllBookings();
        const booking = all.find(b => b.id === id);
        if (!booking || booking.status !== 'confirmed') return false;
        const wasPaid = booking.paid || (booking.creditApplied || 0) > 0;
        const slotType = booking.slotType;
        booking.cancelledPaymentMethod = booking.paymentMethod;
        booking.cancelledPaidAt = booking.paidAt;
        booking.status = 'cancelled';
        booking.cancelledAt = new Date().toISOString();
        booking.cancelledWithPenalty = true;
        booking.paid = false;
        booking.paymentMethod = null;
        booking.paidAt = null;
        booking.creditApplied = 0;
        this.replaceAllBookings(all);
        // Per group-class: riconverte lo slot in small-group
        if (slotType === SLOT_TYPES.GROUP_CLASS) {
            const overrides = this.getScheduleOverrides();
            const dateSlots = overrides[booking.date];
            if (dateSlots) {
                const slot = dateSlots.find(s => s.time === booking.time && s.type === SLOT_TYPES.GROUP_CLASS);
                if (slot) {
                    slot.type = SLOT_TYPES.SMALL_GROUP;
                    delete slot.client;
                    delete slot.bookingId;
                    this.saveScheduleOverrides(overrides);
                }
            }
        }
        // Mora 50%: comportamento in base allo stato di pagamento
        const mora = Math.round((SLOT_PRICES[slotType] || 0) * 0.5 * 100) / 100;
        if (mora > 0) {
            if (wasPaid) {
                // Era stata pagata: rimborsa solo il 50% (il restante 50% è la mora)
                CreditStorage.addCredit(
                    booking.whatsapp, booking.email, booking.name,
                    mora,
                    `Rimborso parziale 50% — annullamento con mora ${booking.date} ${booking.time}`,
                    null, false, true
                );
            } else {
                // Non era stata pagata: addebita il 50% come mora (il restante 50% è condonato)
                ManualDebtStorage.addDebt(
                    booking.whatsapp, booking.email, booking.name,
                    mora,
                    `Mora 50% annullamento tardivo ${booking.date} ${booking.time}`,
                    '', 'mora'
                );
            }
        }
        return true;
    }

    // Marca una prenotazione come "annullamento richiesto" (il posto torna disponibile)
    static requestCancellation(id) {
        const all = this.getAllBookings();
        const booking = all.find(b => b.id === id);
        if (!booking || booking.status !== 'confirmed') return false;
        booking.status = 'cancellation_requested';
        booking.cancellationRequestedAt = new Date().toISOString();
        this.replaceAllBookings(all);
        return true;
    }

    // Quando arriva una nuova prenotazione, cancella la prima richiesta pendente per quello slot (FIFO)
    static fulfillPendingCancellations(date, time) {
        const all = this.getAllBookings();
        const pending = all
            .filter(b => b.date === date && b.time === time &&
                (b.status === 'cancellation_requested' ||
                 (b.status === 'confirmed' && b.cancellationRequestedAt)))
            .sort((a, b) => (a.cancellationRequestedAt || '').localeCompare(b.cancellationRequestedAt || ''));
        if (pending.length === 0) return false;
        const toCancel = pending[0];
        const idx = all.findIndex(b => b.id === toCancel.id);
        // Salva i dati di pagamento prima di azzerarli
        const slotType = toCancel.slotType;
        const wasPaid = toCancel.paid || (toCancel.creditApplied || 0) > 0;
        const wasPaymentMethod = toCancel.paymentMethod;
        const wasPaidAt = toCancel.paidAt;
        all[idx].status = 'cancelled';
        all[idx].cancelledAt = new Date().toISOString();
        all[idx].cancelledPaymentMethod = wasPaymentMethod;
        all[idx].cancelledPaidAt = wasPaidAt;
        all[idx].paid = false;
        all[idx].paymentMethod = null;
        all[idx].paidAt = null;
        all[idx].creditApplied = 0;
        this.replaceAllBookings(all);
        // Rimborso credito: prezzo pieno per qualsiasi metodo di pagamento (contanti, carta, iban, credito)
        const creditToRefund = wasPaid ? (SLOT_PRICES[slotType] || 0) : 0;
        if (creditToRefund > 0) {
            CreditStorage.addCredit(
                toCancel.whatsapp,
                toCancel.email,
                toCancel.name,
                creditToRefund,
                `Rimborso lezione ${toCancel.date}`,
                null, false, false, null, wasPaymentMethod || ''
            );
        }
        return true;
    }

    // Controlla le richieste pendenti: se la lezione è entro 2h, nega l'annullamento (torna confirmed)
    static processPendingCancellations() {
        const all = this.getAllBookings();
        const now = new Date();
        const twoHoursMs = 2 * 60 * 60 * 1000;
        let changed = false;
        all.forEach(b => {
            if (b.status !== 'cancellation_requested') return;
            const _tp = _parseSlotTime(b.time);
            if (!_tp) return;
            const [_yr, _mo, _dy] = b.date.split('-').map(Number);
            const lessonStart = new Date(_yr, _mo - 1, _dy, _tp.startH, _tp.startM, 0, 0);
            if (lessonStart - now <= twoHoursMs) {
                b.status = 'confirmed';
                // Keep cancellationRequestedAt so fulfillPendingCancellations can still
                // honour the request if another user books this slot.
                changed = true;
            }
        });
        if (changed) this.replaceAllBookings(all);
        return changed;
    }

    // Calcola il debito passato non pagato di un contatto (telefono OPPURE email)
    // Usato per verificare la soglia blocco prenotazioni
    static getUnpaidPastDebt(whatsapp, email) {
        const normW = normalizePhone(whatsapp);
        const allBookings = this.getAllBookings();
        let total = 0;
        const now = new Date();
        allBookings.forEach(b => {
            if (b.paid || b.status === 'cancelled' || b.status === 'cancellation_requested') return;
            const phoneMatch = normW && normalizePhone(b.whatsapp) === normW;
            const emailMatch = email && b.email && b.email.toLowerCase() === email.toLowerCase();
            if (!phoneMatch && !emailMatch) return;
            // Controlla se la lezione è già iniziata
            const _tp2 = _parseSlotTime(b.time);
            if (!_tp2 || !b.date) return;
            const [yr, mo, dy] = b.date.split('-').map(Number);
            const startDt = new Date(yr, mo - 1, dy, _tp2.startH, _tp2.startM, 0);
            if (now >= startDt) {
                total += (SLOT_PRICES[b.slotType] || 0) - (b.creditApplied || 0);
            }
        });
        total += ManualDebtStorage.getBalance(whatsapp, email);
        total -= CreditStorage.getBalance(whatsapp, email);
        return Math.round(Math.max(0, total) * 100) / 100;
    }

    static updateStats(booking) {
        const stats = this.getStats();
        stats.totalBookings = (stats.totalBookings || 0) + 1;
        stats.totalRevenue = (stats.totalRevenue || 0) + SLOT_PRICES[booking.slotType];

        // Update type distribution
        if (!stats.typeDistribution) stats.typeDistribution = {};
        stats.typeDistribution[booking.slotType] = (stats.typeDistribution[booking.slotType] || 0) + 1;

        // Update daily bookings
        if (!stats.dailyBookings) stats.dailyBookings = {};
        const dateKey = booking.date;
        stats.dailyBookings[dateKey] = (stats.dailyBookings[dateKey] || 0) + 1;

        _lsSet(this.STATS_KEY, JSON.stringify(stats));
    }

    static getStats() {
        const data = localStorage.getItem(this.STATS_KEY);
        return data ? JSON.parse(data) : {
            totalBookings: 0,
            totalRevenue: 0,
            typeDistribution: {},
            dailyBookings: {}
        };
    }

    // ── Seeded PRNG (Mulberry32) ─────────────────────────────────────────────
    // Returns a deterministic pseudo-random function seeded by a string.
    // Same seed → always the same sequence of numbers → stable demo data.
    static _makeSeededRand(seedStr) {
        // FNV-1a hash → 32-bit seed
        let h = 0x811c9dc5;
        for (let i = 0; i < seedStr.length; i++) {
            h ^= seedStr.charCodeAt(i);
            h = Math.imul(h, 0x01000193) >>> 0;
        }
        return function () {
            h = (h + 0x6D2B79F5) >>> 0;
            let t = Math.imul(h ^ (h >>> 15), 1 | h);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // Fisher-Yates shuffle using seeded rand
    static _shuffle(arr, rand) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(rand() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    // Always ensure current week + next week have schedule overrides populated.
    // Runs even for brand-new browsers with no data.
    static _ensureWeekOverrides() {
        const overrides = _lsGetJSON('scheduleOverrides', {});
        const dayNamesMap = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
        const now = new Date();
        const dow = now.getDay();
        const monday = new Date(now);
        monday.setDate(now.getDate() + (dow === 0 ? -6 : 1 - dow));
        monday.setHours(0, 0, 0, 0);

        let changed = false;
        for (let weekOffset = 0; weekOffset < 2; weekOffset++) {
            for (let d = 0; d < 7; d++) {
                const date = new Date(monday);
                date.setDate(monday.getDate() + weekOffset * 7 + d);
                const dateStr = this.formatDate(date);
                if (!overrides[dateStr]) {
                    const slots = DEFAULT_WEEKLY_SCHEDULE[dayNamesMap[date.getDay()]] || [];
                    if (slots.length > 0) { overrides[dateStr] = slots; changed = true; }
                }
            }
        }
        if (changed) _lsSet('scheduleOverrides', JSON.stringify(overrides));
    }

    static initializeDemoData() {
        // Always populate current + next week calendar — works even for new browsers
        this._ensureWeekOverrides();

        // Skip demo bookings if user explicitly cleared all data
        if (localStorage.getItem('dataClearedByUser') === 'true') return;

        // Migration check: if existing bookings use old time slot format, regenerate
        const existing = this._cache;
        if (existing.length > 0) {
            const hasOutdatedSlots = existing.some(b => !TIME_SLOTS.includes(b.time));
            if (hasOutdatedSlots) {
                this._cache = existing.filter(b =>
                    !b.id?.startsWith('demo-') && TIME_SLOTS.includes(b.time)
                );
                localStorage.removeItem(this.STATS_KEY);
            } else {
                return; // Data is current, nothing to do
            }
        }

        if (this._cache.length === 0) {
            // 30 fixed clients with consistent contact info
            const clients = [
                { name: 'Mario Rossi',         email: 'mario.rossi@gmail.com',          whatsapp: '+39 348 1234567' },
                { name: 'Laura Bianchi',        email: 'laura.bianchi@email.it',          whatsapp: '+39 347 7654321' },
                { name: 'Giuseppe Verdi',       email: 'giuseppe.verdi@gmail.com',        whatsapp: '+39 333 2345678' },
                { name: 'Anna Ferrari',         email: 'anna.ferrari@email.it',           whatsapp: '+39 320 8765432' },
                { name: 'Marco Colombo',        email: 'marco.colombo@gmail.com',         whatsapp: '+39 349 3456789' },
                { name: 'Francesca Romano',     email: 'francesca.romano@libero.it',      whatsapp: '+39 338 9876543' },
                { name: 'Alessandro Greco',     email: 'a.greco@gmail.com',               whatsapp: '+39 345 4567890' },
                { name: 'Giulia Conti',         email: 'giulia.conti@email.it',           whatsapp: '+39 366 0987654' },
                { name: 'Luca Marino',          email: 'luca.marino@hotmail.it',          whatsapp: '+39 370 5678901' },
                { name: 'Elena Rizzo',          email: 'elena.rizzo@gmail.com',           whatsapp: '+39 329 1098765' },
                { name: 'Davide Bruno',         email: 'davide.bruno@libero.it',          whatsapp: '+39 334 6789012' },
                { name: 'Chiara Gallo',         email: 'chiara.gallo@gmail.com',          whatsapp: '+39 371 2109876' },
                { name: 'Matteo Fontana',       email: 'matteo.fontana@email.it',         whatsapp: '+39 346 7890123' },
                { name: 'Sofia Caruso',         email: 'sofia.caruso@gmail.com',          whatsapp: '+39 322 3210987' },
                { name: 'Andrea Leone',         email: 'andrea.leone@libero.it',          whatsapp: '+39 351 8901234' },
                { name: 'Valentina Longo',      email: 'valentina.longo@gmail.com',       whatsapp: '+39 368 4321098' },
                { name: 'Simone Giordano',      email: 'simone.giordano@email.it',        whatsapp: '+39 337 9012345' },
                { name: 'Martina Mancini',      email: 'martina.mancini@gmail.com',       whatsapp: '+39 326 5432109' },
                { name: 'Federico Vitale',      email: 'federico.vitale@hotmail.it',      whatsapp: '+39 352 0123456' },
                { name: 'Sara Santoro',         email: 'sara.santoro@gmail.com',          whatsapp: '+39 363 6543210' },
                { name: 'Roberto Pellegrini',   email: 'r.pellegrini@libero.it',          whatsapp: '+39 342 1234098' },
                { name: 'Beatrice De Luca',     email: 'beatrice.deluca@gmail.com',       whatsapp: '+39 319 7654312' },
                { name: 'Stefano Barbieri',     email: 'stefano.barbieri@email.it',       whatsapp: '+39 358 2345609' },
                { name: 'Alice Messina',        email: 'alice.messina@gmail.com',         whatsapp: '+39 367 8765423' },
                { name: 'Giovanni Ricci',       email: 'giovanni.ricci@libero.it',        whatsapp: '+39 333 3456710' },
                { name: 'Eleonora Gatti',       email: 'eleonora.gatti@gmail.com',        whatsapp: '+39 370 4875907' },
                { name: 'Daniele Monti',        email: 'daniele.monti@email.it',          whatsapp: '+39 348 4567801' },
                { name: 'Camilla Esposito',     email: 'camilla.esposito@gmail.com',      whatsapp: '+39 326 9876034' },
                { name: 'Lorenzo Ferri',        email: 'lorenzo.ferri@hotmail.it',        whatsapp: '+39 339 5678912' },
                { name: 'Alessia Moretti',      email: 'alessia.moretti@gmail.com',       whatsapp: '+39 365 0123478' }
            ];

            const notes = ['', '', '', '', 'Richiesta asciugamano extra', 'Allergia al lattice - usare guanti', 'Prima lezione', ''];

            const demoBookings = [];

            // Range: 1 Jan current year → 15 Mar current year
            const now     = new Date();
            const today   = new Date(now); today.setHours(0, 0, 0, 0);
            const start   = new Date(now.getFullYear(), 0, 1);
            const demoEnd = new Date(now.getFullYear(), 2, 15, 23, 59, 59);

            const current = new Date(start);
            while (current <= demoEnd) {
                const dayIndex = current.getDay();
                const dayName  = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'][dayIndex];
                const scheduledSlots = DEFAULT_WEEKLY_SCHEDULE[dayName] || [];
                const dateStr  = this.formatDate(current);
                const isPast   = current < today;

                scheduledSlots.forEach(slot => {
                    const capacity = SLOT_MAX_CAPACITY[slot.type];
                    if (capacity === 0) return;

                    const rand = this._makeSeededRand(dateStr + '|' + slot.time);

                    // Past: 60-100% fill; future: 40-75% fill
                    const fillPct   = isPast ? (0.6 + rand() * 0.4) : (0.4 + rand() * 0.35);
                    const fillCount = Math.max(1, Math.round(capacity * fillPct));
                    const shuffled  = this._shuffle([...Array(clients.length).keys()], rand);
                    const selected  = shuffled.slice(0, Math.min(fillCount, capacity));

                    const _stp = _parseSlotTime(slot.time);
                    if (!_stp) return;
                    const { endH, endM } = _stp;
                    const endDateTime  = new Date(current);
                    endDateTime.setHours(endH, endM, 0, 0);

                    selected.forEach(idx => {
                        const client = clients[idx];
                        let paid, paymentMethod, paidAt;

                        if (isPast) {
                            // <1% unpaid for past bookings
                            paid = rand() < 0.995;
                            if (paid) {
                                const methodRoll = rand();
                                paymentMethod = methodRoll < 0.60 ? 'contanti' : methodRoll < 0.85 ? 'carta' : 'iban';
                                const paidDate = new Date(endDateTime.getTime() + rand() * 72 * 3600000);
                                if (paidDate > now) paidDate.setTime(now.getTime());
                                paidAt = paidDate.toISOString();
                            }
                        } else {
                            paid = false;
                        }

                        const booking = {
                            id: `demo-${dateStr}-${slot.time.replace(/[^0-9]/g, '')}-${idx}`,
                            date: dateStr,
                            time: slot.time,
                            slotType: slot.type,
                            name: client.name,
                            email: client.email,
                            whatsapp: client.whatsapp,
                            notes: notes[Math.floor(rand() * notes.length)],
                            paid,
                            createdAt: start.toISOString(),
                            status: 'confirmed'
                        };
                        if (paymentMethod) booking.paymentMethod = paymentMethod;
                        if (paidAt)        booking.paidAt = paidAt;

                        demoBookings.push(booking);
                    });
                });

                current.setDate(current.getDate() + 1);
            }

            // Save all demo bookings in one shot (no random IDs, no Date.now())
            this._cache = demoBookings;

            // Recalculate stats from scratch
            const stats = { totalBookings: 0, totalRevenue: 0, typeDistribution: {}, dailyBookings: {} };
            demoBookings.forEach(b => {
                stats.totalBookings++;
                stats.totalRevenue += SLOT_PRICES[b.slotType];
                stats.typeDistribution[b.slotType] = (stats.typeDistribution[b.slotType] || 0) + 1;
                stats.dailyBookings[b.date] = (stats.dailyBookings[b.date] || 0) + 1;
            });
            _lsSet(this.STATS_KEY, JSON.stringify(stats));
        }
    }

    static formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // ── Helpers per scheduleOverrides ────────────────────────────────────────
    // Accesso centralizzato: quando si passa a Supabase si cambiano solo questi

    static getScheduleOverrides() {
        try { return JSON.parse(localStorage.getItem('scheduleOverrides') || '{}'); } catch { return {}; }
    }

    static saveScheduleOverrides(overrides) {
        _lsSet('scheduleOverrides', JSON.stringify(overrides));
        if (typeof supabaseClient === 'undefined') return;
        // UPSERT atomico: usa onConflict(date, time) per evitare la finestra di race
        // condition che il vecchio DELETE+INSERT causava (altro device vede 0 slot)
        const rows = [];
        for (const [dateStr, slots] of Object.entries(overrides)) {
            for (const slot of slots) {
                rows.push({ date: dateStr, time: slot.time, slot_type: slot.type, extras: slot.extras || [] });
            }
        }
        // Calcola le combinazioni (date, time) attive per eliminare le vecchie
        const activeKeys = new Set(rows.map(r => `${r.date}|${r.time}`));
        (async () => {
            try {
                // 1. Upsert le righe attuali (crea o aggiorna)
                if (rows.length > 0) {
                    const { error } = await supabaseClient.from('schedule_overrides')
                        .upsert(rows, { onConflict: 'date,time' });
                    if (error) { console.error('[Supabase] saveScheduleOverrides upsert error:', error.message); return; }
                }
                // 2. Elimina le righe che non sono più nell'override set
                const { data: existing } = await supabaseClient.from('schedule_overrides')
                    .select('id, date, time');
                if (existing) {
                    const toDelete = existing
                        .filter(r => !activeKeys.has(`${r.date}|${r.time}`))
                        .map(r => r.id);
                    if (toDelete.length > 0) {
                        await supabaseClient.from('schedule_overrides')
                            .delete().in('id', toDelete);
                    }
                }
            } catch (e) { console.error('[Supabase] saveScheduleOverrides exception:', e); }
        })();
    }

    // Carica tutti i dati da Supabase in parallelo e aggiorna il localStorage.
    // Fonti: tabelle dedicate (credits, manual_debts, bonuses, schedule_overrides, settings)
    //        + app_settings solo per il segnale data_cleared_at.
    static async syncAppSettingsFromSupabase() {
        if (typeof supabaseClient === 'undefined') return;
        try {
            const [
                { data: clearedRow },
                { data: creditsData,   error: e1 },
                { data: histData },
                { data: debtsData,     error: e3 },
                { data: bonusesData,   error: e4 },
                { data: overridesData, error: e5 },
                { data: settingsData,  error: e6 },
            ] = await Promise.all([
                supabaseClient.from('app_settings').select('value').eq('key', 'data_cleared_at').maybeSingle(),
                supabaseClient.from('credits').select('id, name, whatsapp, email, balance, free_balance'),
                supabaseClient.from('credit_history').select('credit_id, amount, note, created_at').order('created_at', { ascending: true }),
                supabaseClient.from('manual_debts').select('name, whatsapp, email, balance, history'),
                supabaseClient.from('bonuses').select('name, whatsapp, email, bonus, last_reset_month'),
                supabaseClient.from('schedule_overrides').select('date, time, slot_type, extras').order('date').order('time'),
                supabaseClient.from('settings').select('key, value'),
            ]);

            // 1. Propaga clearAllData: data_cleared_at ancora su app_settings per la propagazione Realtime
            const remoteClearedAt = clearedRow?.value?.ts || null;
            if (remoteClearedAt) {
                const localClearedAt = localStorage.getItem('dataLastCleared') || '0';
                if (remoteClearedAt > localClearedAt) {
                    BookingStorage._cache = [];
                    CreditStorage._cache = {};
                    ManualDebtStorage._cache = {};
                    BonusStorage._cache = {};
                    localStorage.removeItem('scheduleOverrides');
                    _lsSet('dataLastCleared', remoteClearedAt);
                    _lsSet('dataClearedByUser', 'true');
                    console.log('[Supabase] clearAllData ricevuto da remoto — tutte le cache svuotate');
                }
            }

            // 2. Credits + credit_history
            if (!e1) {
                const histMap = {};
                for (const h of histData || []) {
                    if (!histMap[h.credit_id]) histMap[h.credit_id] = [];
                    histMap[h.credit_id].push({ date: h.created_at, amount: h.amount, note: h.note || '' });
                }
                const credits = {};
                for (const c of creditsData) {
                    const key = `${c.whatsapp || ''}||${c.email}`;
                    credits[key] = { name: c.name, whatsapp: c.whatsapp || '', email: c.email, balance: c.balance, freeBalance: c.free_balance || 0, history: histMap[c.id] || [] };
                }
                CreditStorage._cache = credits;
            }

            // 3. Manual debts
            if (!e3) {
                const debts = {};
                for (const r of debtsData) {
                    const key = `${r.whatsapp || ''}||${r.email}`;
                    debts[key] = { name: r.name, whatsapp: r.whatsapp || '', email: r.email, balance: r.balance, history: r.history || [] };
                }
                ManualDebtStorage._cache = debts;
            }

            // 4. Bonuses
            if (!e4) {
                const bonuses = {};
                for (const r of bonusesData) {
                    const key = `${r.whatsapp || ''}||${r.email}`;
                    bonuses[key] = { name: r.name, whatsapp: r.whatsapp || '', email: r.email, bonus: r.bonus, lastResetMonth: r.last_reset_month || null };
                }
                BonusStorage._cache = bonuses;
            }

            // 5. Schedule overrides
            if (!e5) {
                const overrides = {};
                for (const r of (overridesData || [])) {
                    if (!overrides[r.date]) overrides[r.date] = [];
                    const slot = { time: r.time, type: r.slot_type };
                    if (r.extras?.length) slot.extras = r.extras;
                    overrides[r.date].push(slot);
                }
                _lsSet('scheduleOverrides', JSON.stringify(overrides));
            }

            // 6. Settings — chiavi nel DB senza prefisso gym_, in localStorage con prefisso
            if (!e6 && settingsData?.length) {
                const sMap = Object.fromEntries(settingsData.map(r => [r.key, r.value]));
                const _s = (lsKey, dbKey) => { if (sMap[dbKey] != null) _lsSet(lsKey, String(sMap[dbKey])); };
                _s(DebtThresholdStorage.KEY,       'debt_threshold');
                _s(CancellationModeStorage.KEY,    'cancellation_mode');
                _s(CertEditableStorage.KEY,        'cert_scadenza_editable');
                _s(CertBookingStorage.KEY_EXPIRED, 'cert_block_expired');
                _s(CertBookingStorage.KEY_NOT_SET, 'cert_block_not_set');
                _s(AssicBookingStorage.KEY_EXPIRED,'assic_block_expired');
                _s(AssicBookingStorage.KEY_NOT_SET,'assic_block_not_set');
            }

            const count = (creditsData?.length || 0) + (debtsData?.length || 0) +
                          (bonusesData?.length || 0) + (overridesData?.length || 0) + (settingsData?.length || 0);
            console.log(`[Supabase] syncAppSettings: ${count} record caricati`);
        } catch (e) { console.error('[Supabase] syncAppSettings exception:', e); }
    }

    // Kept for backward compat — use syncAppSettingsFromSupabase() on page load instead.
    static async syncScheduleFromSupabase() { await this.syncAppSettingsFromSupabase(); }

    // Sostituisce l'intero array di prenotazioni (usato dopo modifiche bulk).
    // Sincronizza su Supabase solo i booking effettivamente cambiati (diff intelligente).
    static replaceAllBookings(bookings) {
        const prev = [...this._cache];
        this._cache = bookings;

        if (typeof supabaseClient === 'undefined') return;
        const prevMap = Object.fromEntries(prev.map(b => [b.id, b]));
        const changed = bookings.filter(b => {
            const p = prevMap[b.id];
            if (!p) return false; // nuovi booking gestiti da saveBooking
            return p.status !== b.status
                || p.paid !== b.paid
                || p.paymentMethod !== b.paymentMethod
                || p.paidAt !== b.paidAt
                || p.creditApplied !== b.creditApplied
                || p.cancellationRequestedAt !== b.cancellationRequestedAt
                || p.cancelledAt !== b.cancelledAt;
        });
        for (const b of changed) {
            if (!b._sbId) { console.warn('[Supabase] booking update skip — nessun _sbId per:', b.id); continue; }
            // Usa RPC SECURITY DEFINER per bypassare RLS (admin può modificare booking altrui)
            // Passa updatedAt per optimistic locking: se il booking è stato modificato
            // da un altro admin nel frattempo, la RPC rifiuta con 'stale_data'
            supabaseClient.rpc('admin_update_booking', {
                p_booking_id:                b._sbId,
                p_status:                    b.status,
                p_paid:                      b.paid || false,
                p_payment_method:            b.paymentMethod || null,
                p_paid_at:                   b.paidAt || null,
                p_credit_applied:            b.creditApplied || 0,
                p_cancellation_requested_at: b.cancellationRequestedAt || null,
                p_cancelled_at:              b.cancelledAt || null,
                p_cancelled_payment_method:  b.cancelledPaymentMethod || null,
                p_cancelled_paid_at:         b.cancelledPaidAt || null,
                p_cancelled_with_bonus:      b.cancelledWithBonus || false,
                p_cancelled_with_penalty:    b.cancelledWithPenalty || false,
                p_cancelled_refund_pct:      b.cancelledRefundPct ?? null,
                p_expected_updated_at:       b.updatedAt || null,
            }).then(({ data, error }) => {
                if (error) {
                    console.error('[Supabase] admin_update_booking error:', error.message);
                    if (typeof showToast === 'function') showToast('⚠️ Errore aggiornamento prenotazione sul server.', 'error', 5000);
                    // Rollback: riscarica i dati dal server per riallineare
                    BookingStorage.syncFromSupabase().then(() => {
                        if (typeof renderAdminDayView === 'function' && typeof selectedAdminDay !== 'undefined' && selectedAdminDay) renderAdminDayView(selectedAdminDay);
                    });
                } else if (data && !data.success && data.error === 'stale_data') {
                    console.warn('[Supabase] admin_update_booking: dati obsoleti per', b._sbId, '— rollback');
                    if (typeof showToast === 'function') showToast('Prenotazione modificata da un altro dispositivo. Dati ricaricati.', 'error', 5000);
                    // Rollback: riscarica i dati dal server per riallineare
                    BookingStorage.syncFromSupabase().then(() => {
                        if (typeof renderAdminDayView === 'function' && typeof selectedAdminDay !== 'undefined' && selectedAdminDay) renderAdminDayView(selectedAdminDay);
                    });
                } else {
                    console.log('[Supabase] admin_update_booking OK — id:', b._sbId, 'status:', b.status);
                }
            });
        }
    }

    // Marca come cancellata una prenotazione per ID (preserva lo storico)
    static removeBookingById(id) {
        if (!id) return;
        const all = this.getAllBookings();
        const idx = all.findIndex(b => b.id === id);
        if (idx !== -1 && all[idx].status !== 'cancelled') {
            all[idx].status = 'cancelled';
            all[idx].cancelledAt = new Date().toISOString();
            all[idx].paid = false;
            all[idx].paymentMethod = null;
            all[idx].paidAt = null;
            all[idx].creditApplied = 0;
            this.replaceAllBookings(all);
        }
    }
}

// Credit storage — tracks per-client credit balance
class CreditStorage {
    static CREDITS_KEY = 'gym_credits';
    static _cache = {};

    static _getAll() {
        return this._cache;
    }

    static _save(data) {
        this._cache = data;
        if (typeof supabaseClient === 'undefined') return;
        const rows = Object.values(data).map(r => ({
            name:         r.name,
            whatsapp:     r.whatsapp || null,
            email:        (r.email || '').toLowerCase(),
            balance:      r.balance      || 0,
            free_balance: r.freeBalance  || 0,
        }));
        if (rows.length === 0) return;
        supabaseClient.from('credits')
            .upsert(rows, { onConflict: 'email' })
            .then(({ error }) => {
                if (error) {
                    console.error('[Supabase] CreditStorage._save error:', error.message);
                    if (typeof showToast === 'function') showToast('⚠️ Errore salvataggio crediti sul server. Ricarica la pagina.', 'error', 5000);
                }
            });
    }

    static async syncFromSupabase() {
        if (typeof supabaseClient === 'undefined') return;
        try {
            const [{ data: creditsData, error: e1 }, { data: histData }] = await Promise.all([
                supabaseClient.from('credits').select('id, name, whatsapp, email, balance, free_balance'),
                supabaseClient.from('credit_history').select('credit_id, amount, note, created_at, display_amount, booking_ref, hidden').eq('hidden', false).order('created_at', { ascending: true }),
            ]);
            if (e1) { console.error('[Supabase] CreditStorage.sync error:', e1.message); return; }
            if (!creditsData?.length) return;

            const histMap = {};
            for (const h of histData || []) {
                if (!histMap[h.credit_id]) histMap[h.credit_id] = [];
                histMap[h.credit_id].push({
                    date: h.created_at,
                    amount: h.amount,
                    note: h.note || '',
                    ...(h.display_amount != null && { displayAmount: h.display_amount }),
                    ...(h.booking_ref && { bookingRef: h.booking_ref }),
                });
            }
            const result = {};
            for (const c of creditsData) {
                const key = `${c.whatsapp || ''}||${c.email}`;
                result[key] = { name: c.name, whatsapp: c.whatsapp || '', email: c.email, balance: c.balance, freeBalance: c.free_balance || 0, history: histMap[c.id] || [] };
            }
            this._cache = result;
            console.log('[Supabase] CreditStorage.sync: dati caricati');
        } catch (e) { console.error('[Supabase] CreditStorage.sync exception:', e); }
    }

    // Inserisce una voce credit_history su Supabase.
    // Estratto per essere richiamabile e non fire-and-forget.
    static async _insertCreditHistory(email, rec, entry) {
        try {
            // 1. Trova la riga credits esistente
            let { data: row } = await supabaseClient.from('credits')
                .select('id').eq('email', email).maybeSingle();
            // 2. Se non esiste, creala come placeholder (balance reale arriva dal debounced _save)
            if (!row?.id) {
                const { data: inserted } = await supabaseClient.from('credits')
                    .upsert({
                        name:         rec.name,
                        whatsapp:     rec.whatsapp || null,
                        email:        email,
                        balance:      0,
                        free_balance: 0,
                    }, { onConflict: 'email', ignoreDuplicates: true })
                    .select('id').maybeSingle();
                if (!inserted?.id) {
                    ({ data: row } = await supabaseClient.from('credits')
                        .select('id').eq('email', email).maybeSingle());
                } else {
                    row = inserted;
                }
            }
            if (!row?.id) return;
            const res = await supabaseClient.from('credit_history').insert({
                credit_id:  row.id,
                amount:     entry.amount,
                note:       entry.note,
                created_at: entry.date,
            });
            if (res?.error) console.error('[Supabase] credit_history insert error:', res.error.message);
        } catch (e) {
            console.error('[Supabase] _insertCreditHistory exception:', e);
        }
    }

    static _key(whatsapp, email) {
        return `${whatsapp}||${email}`;
    }

    // Check if a stored record matches the given contact: phone OR email
    static _matchContact(record, whatsapp, email) {
        const normStored = normalizePhone(record.whatsapp);
        const normInput  = normalizePhone(whatsapp);
        const phoneMatch = normInput && normStored && normStored === normInput;
        const emailMatch = email && record.email && record.email.toLowerCase() === email.toLowerCase();
        return phoneMatch || emailMatch;
    }

    // Find the storage key for a contact (phone OR email match)
    static _findKey(whatsapp, email) {
        const all = this._getAll();
        for (const [key, record] of Object.entries(all)) {
            if (this._matchContact(record, whatsapp, email)) return key;
        }
        return null;
    }

    static getBalance(whatsapp, email) {
        const all = this._getAll();
        const key = this._findKey(whatsapp, email);
        return key ? (all[key]?.balance || 0) : 0;
    }

    static addCredit(whatsapp, email, name, amount, note = '', displayAmount = null, freeLesson = false, hiddenRefund = false, bookingRef = null, method = '') {
        // amount=0 is allowed for informational entries (payment log) that don't affect balance
        const all = this._getAll();
        let key = this._findKey(whatsapp, email);
        if (!key) key = this._key(whatsapp, email);
        if (!all[key]) all[key] = { name, whatsapp, email, balance: 0, history: [] };
        all[key].name = name;
        if (amount !== 0) {
            all[key].balance = Math.round((all[key].balance + amount) * 100) / 100;
        }
        // Track free (non-revenue) credit separately
        if (freeLesson && amount > 0) {
            all[key].freeBalance = Math.round(((all[key].freeBalance || 0) + amount) * 100) / 100;
        }
        const entry = { date: new Date().toISOString(), amount, note };
        if (displayAmount !== null) entry.displayAmount = displayAmount;
        if (freeLesson && amount > 0) entry.freeLesson = true;
        if (hiddenRefund) entry.hiddenRefund = true;
        if (bookingRef) entry.bookingRef = bookingRef;
        if (method) entry.method = method;
        all[key].history.push(entry);
        this._save(all);

        // Inserisce la nuova voce in credit_history su Supabase (fire-and-forget).
        // Il balance è già salvato sincrono via _save(); questo log è best-effort.
        if (typeof supabaseClient !== 'undefined') {
            const _entry = entry;
            const _email = (email || '').toLowerCase();
            const _rec = all[key];
            this._insertCreditHistory(_email, _rec, _entry);
        }
    }

    static hidePaymentEntryByBooking(whatsapp, email, bookingId) {
        const all = this._getAll();
        const key = this._findKey(whatsapp, email);
        if (!key || !all[key]?.history) return;
        let changed = false;
        all[key].history.forEach(entry => {
            if (entry.bookingRef === bookingId && !entry.hiddenRefund) {
                entry.hiddenRefund = true;
                changed = true;
            }
        });
        if (changed) this._save(all);
    }

    static getFreeBalance(whatsapp, email) {
        const all = this._getAll();
        const key = this._findKey(whatsapp, email);
        return key ? (all[key]?.freeBalance || 0) : 0;
    }

    static getAllWithBalance() {
        return Object.values(this._getAll())
            .filter(c => c.balance > 0)
            .sort((a, b) => b.balance - a.balance);
    }

    static getTotalCredit() {
        return this.getAllWithBalance().reduce((s, c) => s + c.balance, 0);
    }

    static getRecord(whatsapp, email) {
        const key = this._findKey(whatsapp, email);
        return key ? this._getAll()[key] : null;
    }

    static clearRecord(whatsapp, email) {
        const all = this._getAll();
        const key = this._findKey(whatsapp, email);
        if (key) { delete all[key]; this._save(all); }
        if (typeof supabaseClient !== 'undefined' && email) {
            supabaseClient.from('credits').delete().eq('email', (email || '').toLowerCase())
                .then(({ error }) => {
                    if (error) console.error('[Supabase] CreditStorage.clearRecord error:', error.message);
                });
        }
    }

    // Elimina una singola voce di credito per data (ISO string) e ricalcola il saldo
    static deleteCreditEntry(whatsapp, email, entryDate) {
        const all = this._getAll();
        const key = this._findKey(whatsapp, email);
        if (!key || !all[key]) return false;
        const hist = all[key].history || [];
        const idx = hist.findIndex(e => e.date === entryDate && (e.amount !== 0 || (e.displayAmount || 0) > 0));
        if (idx === -1) return false;
        hist.splice(idx, 1);
        // Ricalcola balance dalla history rimanente
        all[key].balance = Math.round(
            Math.max(0, hist.reduce((s, e) => s + e.amount, 0)) * 100
        ) / 100;
        all[key].history = hist;
        if (hist.length === 0) {
            delete all[key];
            // Elimina anche da Supabase se la history è vuota
            if (typeof supabaseClient !== 'undefined' && email) {
                supabaseClient.from('credits').delete().eq('email', (email || '').toLowerCase())
                    .then(({ error }) => {
                        if (error) console.error('[Supabase] deleteCreditEntry cleanup error:', error.message);
                    });
            }
        }
        this._save(all);
        return true;
    }

    // Auto-pay unpaid bookings (past and future) for this client using available credit
    static applyToUnpaidBookings(whatsapp, email, name) {
        let balance = this.getBalance(whatsapp, email);
        if (balance <= 0) return false;

        const normWhatsapp = normalizePhone(whatsapp);
        const allBookings = BookingStorage.getAllBookings();
        const now = new Date().toISOString();
        let totalApplied = 0;
        let totalFreeApplied = 0;
        let count = 0;

        // Track free (non-revenue) balance: use it first
        const credKey = this._findKey(whatsapp, email);
        let freeBalance = credKey ? (this._getAll()[credKey]?.freeBalance || 0) : 0;

        const nowDate = new Date();
        allBookings
            .filter(b => {
                const normB      = normalizePhone(b.whatsapp);
                const phoneMatch = normWhatsapp && normB && normB === normWhatsapp;
                const emailMatch = email && b.email && b.email.toLowerCase() === email.toLowerCase();
                if (!((phoneMatch || emailMatch) && !b.paid && b.status !== 'cancelled' && b.status !== 'cancellation_requested')) return false;
                // Solo lezioni già iniziate (ora inizio <= now)
                const startTime = new Date(`${b.date}T${b.time.split(' - ')[0].trim()}:00`);
                return startTime <= nowDate;
            })
            .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
            .forEach(b => {
                const price = SLOT_PRICES[b.slotType];
                const alreadyApplied = b.creditApplied || 0;
                const remaining = price - alreadyApplied;
                if (balance >= remaining) {
                    // Fully cover the remaining amount
                    b.paid = true;
                    // Use free balance first: if it fully covers the amount → lezione gratuita
                    b.paymentMethod = freeBalance >= remaining ? 'lezione-gratuita' : 'credito';
                    b.paidAt = now;
                    b.creditApplied = 0; // absorbed into paid
                    const freeUsed = Math.min(freeBalance, remaining);
                    freeBalance -= freeUsed;
                    totalFreeApplied += freeUsed;
                    balance -= remaining;
                    totalApplied += remaining;
                    count++;
                } else if (balance > 0 && alreadyApplied === 0) {
                    // Partial payment on a booking with no credit yet
                    b.creditApplied = Math.round(balance * 100) / 100;
                    const freeUsed = Math.min(freeBalance, balance);
                    freeBalance -= freeUsed;
                    totalFreeApplied += freeUsed;
                    totalApplied += balance;
                    balance = 0;
                }
            });

        if (totalApplied > 0) {
            BookingStorage.replaceAllBookings(allBookings);
            this.addCredit(whatsapp, email, name, -totalApplied,
                `Auto-pagamento ${count} lezione${count > 1 ? 'i' : ''} con credito`);
            // Reduce freeBalance separately (addCredit only handles the main balance)
            if (totalFreeApplied > 0 && credKey) {
                const freshAll = this._getAll();
                if (freshAll[credKey]) {
                    freshAll[credKey].freeBalance = Math.round(
                        Math.max(0, (freshAll[credKey].freeBalance || 0) - totalFreeApplied) * 100) / 100;
                    this._save(freshAll);
                }
            }
        }

        return totalApplied > 0;
    }
}

// Manual debt storage — per-client debts not tied to bookings (es. lezioni private non prenotate)
class ManualDebtStorage {
    static DEBTS_KEY = 'gym_manual_debts';
    static _cache = {};

    static _getAll() {
        return this._cache;
    }

    static _save(data) {
        this._cache = data;
        if (typeof supabaseClient === 'undefined') return;
        const rows = Object.values(data).map(r => ({
            name:     r.name,
            whatsapp: r.whatsapp || null,
            email:    (r.email || '').toLowerCase(),
            balance:  r.balance  || 0,
            history:  r.history  || [],
        }));
        if (rows.length === 0) return;
        supabaseClient.from('manual_debts')
            .upsert(rows, { onConflict: 'email' })
            .then(({ error }) => {
                if (error) {
                    console.error('[Supabase] ManualDebtStorage._save error:', error.message);
                    if (typeof showToast === 'function') showToast('⚠️ Errore salvataggio debiti sul server. Ricarica la pagina.', 'error', 5000);
                }
            });
    }

    static async syncFromSupabase() {
        if (typeof supabaseClient === 'undefined') return;
        try {
            const { data, error } = await supabaseClient
                .from('manual_debts').select('name, whatsapp, email, balance, history');
            if (error) { console.error('[Supabase] ManualDebtStorage.sync error:', error.message); return; }
            if (!data?.length) return;
            const result = {};
            for (const r of data) {
                const key = `${r.whatsapp || ''}||${r.email}`;
                result[key] = { name: r.name, whatsapp: r.whatsapp || '', email: r.email, balance: r.balance, history: r.history || [] };
            }
            this._cache = result;
            console.log('[Supabase] ManualDebtStorage.sync: dati caricati');
        } catch (e) { console.error('[Supabase] ManualDebtStorage.sync exception:', e); }
    }

    static _key(whatsapp, email) {
        return `${whatsapp}||${email}`;
    }


    static _matchContact(record, whatsapp, email) {
        const normStored = normalizePhone(record.whatsapp);
        const normInput  = normalizePhone(whatsapp);
        const phoneMatch = normInput && normStored && normStored === normInput;
        const emailMatch = email && record.email && record.email.toLowerCase() === email.toLowerCase();
        return phoneMatch || emailMatch;
    }

    static _findKey(whatsapp, email) {
        const all = this._getAll();
        for (const [key, record] of Object.entries(all)) {
            if (this._matchContact(record, whatsapp, email)) return key;
        }
        return null;
    }

    static getBalance(whatsapp, email) {
        const key = this._findKey(whatsapp, email);
        return key ? (this._getAll()[key]?.balance || 0) : 0;
    }

    // Positive amount = add debt; negative = reduce/pay debt
    // entryType: optional tag (e.g. 'mora') stored on the history entry for Registro display
    static addDebt(whatsapp, email, name, amount, note = '', method = '', entryType = '') {
        if (amount === 0) return;
        const all = this._getAll();
        let key = this._findKey(whatsapp, email);
        if (!key) key = this._key(whatsapp, email);
        if (!all[key]) all[key] = { name, whatsapp, email, balance: 0, history: [] };
        all[key].name = name;
        all[key].balance = Math.round((all[key].balance + amount) * 100) / 100;
        if (all[key].balance < 0) all[key].balance = 0;
        const entry = { date: new Date().toISOString(), amount, note, method };
        if (entryType) entry.entryType = entryType;
        all[key].history.push(entry);
        this._save(all);
    }

    static getAllWithBalance() {
        return Object.values(this._getAll())
            .filter(d => d.balance > 0)
            .sort((a, b) => b.balance - a.balance);
    }

    static getRecord(whatsapp, email) {
        const key = this._findKey(whatsapp, email);
        return key ? this._getAll()[key] : null;
    }

    static clearRecord(whatsapp, email) {
        const all = this._getAll();
        const key = this._findKey(whatsapp, email);
        if (key) { delete all[key]; this._save(all); }
        if (typeof supabaseClient !== 'undefined' && email) {
            supabaseClient.from('manual_debts').delete().eq('email', (email || '').toLowerCase())
                .then(({ error }) => {
                    if (error) console.error('[Supabase] ManualDebtStorage.clearRecord error:', error.message);
                });
        }
    }

    // Elimina una singola voce di debito manuale per data (ISO string) e ricalcola il saldo
    static deleteDebtEntry(whatsapp, email, entryDate) {
        const all = this._getAll();
        const key = this._findKey(whatsapp, email);
        if (!key || !all[key]) return false;
        const idx = all[key].history.findIndex(e => e.date === entryDate && e.amount > 0);
        if (idx === -1) return false;
        all[key].history.splice(idx, 1);
        all[key].balance = Math.round(
            Math.max(0, all[key].history.reduce((s, e) => s + e.amount, 0)) * 100
        ) / 100;
        const wasDeleted = all[key].history.length === 0;
        if (wasDeleted) delete all[key];
        this._save(all);
        // Se il record è stato eliminato completamente, rimuovilo anche da Supabase
        // (_save fa upsert dei record rimasti, ma non cancella quelli assenti)
        if (wasDeleted && typeof supabaseClient !== 'undefined' && email) {
            supabaseClient.from('manual_debts').delete().eq('email', (email || '').toLowerCase())
                .then(({ error }) => {
                    if (error) console.error('[Supabase] deleteDebtEntry cleanup error:', error.message);
                });
        }
        return true;
    }
}

// Bonus storage — one free cancellation bonus per client per month (non-cumulative)
class BonusStorage {
    static BONUS_KEY = 'gym_bonus';
    static _cache = {};

    static _getAll() {
        return this._cache;
    }

    static _save(data) {
        this._cache = data;
        if (typeof supabaseClient === 'undefined') return;
        const rows = Object.values(data).map(r => ({
            name:             r.name,
            whatsapp:         r.whatsapp || null,
            email:            (r.email || '').toLowerCase(),
            bonus:            r.bonus ?? 1,
            last_reset_month: r.lastResetMonth || null,
        }));
        if (rows.length === 0) return;
        supabaseClient.from('bonuses')
            .upsert(rows, { onConflict: 'email' })
            .then(({ error }) => {
                if (error) {
                    console.error('[Supabase] BonusStorage._save error:', error.message);
                    if (typeof showToast === 'function') showToast('⚠️ Errore salvataggio bonus sul server. Ricarica la pagina.', 'error', 5000);
                }
            });
    }

    // Returns current month as "YYYY-MM" using JS Date (handles leap years, variable month lengths).
    static _thisMonthStr() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }

    static _matchContact(record, whatsapp, email) {
        const normStored = normalizePhone(record.whatsapp);
        const normInput  = normalizePhone(whatsapp);
        const phoneMatch = normInput && normStored && normStored === normInput;
        const emailMatch = email && record.email && record.email.toLowerCase() === email.toLowerCase();
        return phoneMatch || emailMatch;
    }

    static _findKey(whatsapp, email) {
        const all = this._getAll();
        for (const [key, record] of Object.entries(all)) {
            if (this._matchContact(record, whatsapp, email)) return key;
        }
        return null;
    }

    // Returns current bonus (0 or 1). Auto-restores to 1 on month change (non-cumulative).
    static getBonus(whatsapp, email) {
        const all       = this._getAll();
        const key       = this._findKey(whatsapp, email);
        const thisMonth = this._thisMonthStr();
        if (!key || !all[key]) return 1; // new user: bonus starts at 1
        const record = all[key];
        // Monthly reset: month changed AND bonus was 0 → restore to 1 (if already 1, keep 1)
        if (record.lastResetMonth !== thisMonth && record.bonus === 0) {
            record.bonus = 1;
            record.lastResetMonth = thisMonth;
            this._save(all);
        }
        return record.bonus ?? 1;
    }

    static async syncFromSupabase() {
        if (typeof supabaseClient === 'undefined') return;
        try {
            const { data, error } = await supabaseClient
                .from('bonuses')
                .select('name, whatsapp, email, bonus, last_reset_month');
            if (error) { console.error('[Supabase] BonusStorage.syncFromSupabase error:', error.message); return; }
            const all = {};
            (data || []).forEach(r => {
                const key = `${normalizePhone(r.whatsapp) || ''}||${(r.email || '').toLowerCase()}`;
                all[key] = {
                    name:           r.name || '',
                    whatsapp:       normalizePhone(r.whatsapp) || '',
                    email:          (r.email || '').toLowerCase(),
                    bonus:          r.bonus ?? 1,
                    lastResetMonth: r.last_reset_month || null,
                };
            });
            this._cache = all;
        } catch (e) { console.error('[Supabase] BonusStorage.syncFromSupabase exception:', e); }
    }

    // Consume the bonus (1 → 0)
    static useBonus(whatsapp, email, name) {
        const all       = this._getAll();
        const thisMonth = this._thisMonthStr();
        // Normalizza per garantire che getBonus() trovi sempre il record con gli stessi input
        const normWa = normalizePhone(whatsapp) || '';
        const normEm = (email || '').toLowerCase();
        let key = this._findKey(normWa, normEm);
        if (!key) key = `${normWa}||${normEm}`;
        if (!all[key]) all[key] = { name, whatsapp: normWa, email: normEm, bonus: 1, lastResetMonth: thisMonth };
        all[key].bonus = 0;
        all[key].lastResetMonth = thisMonth;
        all[key].whatsapp = normWa;
        all[key].email    = normEm;
        all[key].name     = name || all[key].name;
        this._save(all);
    }
}

// Helper: scrive un'impostazione primitiva nella tabella settings (fire-and-forget).
// Mappa la chiave localStorage (con prefisso gym_) alla chiave DB (senza prefisso).
function _upsertSetting(key, value) {
    if (typeof supabaseClient === 'undefined') return;
    const dbKey = key.replace(/^gym_/, ''); // 'gym_debt_threshold' → 'debt_threshold'
    supabaseClient.from('settings').upsert({
        key: dbKey, value: String(value), updated_at: new Date().toISOString()
    }).then(({ error }) => {
        if (error) console.error(`[Supabase] setting '${dbKey}' save error:`, error.message);
    });
}

// Debt threshold storage — global setting: max past unpaid debt allowed to make new bookings
class DebtThresholdStorage {
    static KEY = 'gym_debt_threshold';
    static get() { return parseFloat(localStorage.getItem(this.KEY) || '0') || 0; }
    static set(amount) {
        const v = parseFloat(amount) || 0;
        _lsSet(this.KEY, String(v));
        _upsertSetting(this.KEY, v);
    }
}

// Cancellation mode — global setting: how the restricted cancellation window is handled
class CancellationModeStorage {
    static KEY = 'gym_cancellation_mode';
    static get() { return localStorage.getItem(this.KEY) || 'new-person'; }
    static set(mode) { _lsSet(this.KEY, mode); _upsertSetting(this.KEY, mode); }
}

// Cert editable — whether clients can modify their own medical certificate expiry date
class CertEditableStorage {
    static KEY = 'gym_cert_scadenza_editable';
    static get() { const v = localStorage.getItem(this.KEY); return v === null ? true : v === 'true'; }
    static set(val) { _lsSet(this.KEY, val ? 'true' : 'false'); _upsertSetting(this.KEY, val ? 'true' : 'false'); }
}

// Cert booking restrictions — block bookings when cert is expired or not set
class CertBookingStorage {
    static KEY_EXPIRED  = 'gym_cert_block_expired';
    static KEY_NOT_SET  = 'gym_cert_block_not_set';
    static getBlockIfExpired() { return localStorage.getItem(this.KEY_EXPIRED) === 'true'; }
    static getBlockIfNotSet()  { return localStorage.getItem(this.KEY_NOT_SET)  === 'true'; }
    static setBlockIfExpired(val) { _lsSet(this.KEY_EXPIRED, val ? 'true' : 'false'); _upsertSetting(this.KEY_EXPIRED, val ? 'true' : 'false'); }
    static setBlockIfNotSet(val)  { _lsSet(this.KEY_NOT_SET,  val ? 'true' : 'false'); _upsertSetting(this.KEY_NOT_SET,  val ? 'true' : 'false'); }
}

// Assicurazione booking restrictions — block bookings when assicurazione is expired or not set
class AssicBookingStorage {
    static KEY_EXPIRED  = 'gym_assic_block_expired';
    static KEY_NOT_SET  = 'gym_assic_block_not_set';
    static getBlockIfExpired() { return localStorage.getItem(this.KEY_EXPIRED) === 'true'; }
    static getBlockIfNotSet()  { return localStorage.getItem(this.KEY_NOT_SET)  === 'true'; }
    static setBlockIfExpired(val) { _lsSet(this.KEY_EXPIRED, val ? 'true' : 'false'); _upsertSetting(this.KEY_EXPIRED, val ? 'true' : 'false'); }
    static setBlockIfNotSet(val)  { _lsSet(this.KEY_NOT_SET,  val ? 'true' : 'false'); _upsertSetting(this.KEY_NOT_SET,  val ? 'true' : 'false'); }
}

// User storage — client lookup for schedule management (Slot prenotato picker)
// Sources: registered accounts (gym_users) + unique clients from booking history (gym_bookings)
// Supabase migration: replace localStorage reads in getAll() with:
//   - supabaseClient.from('profiles').select('name, email, whatsapp')
//   - supabaseClient.from('bookings').select('name, email, whatsapp')
//   then apply the same dedup logic below
class UserStorage {
    static USERS_KEY = 'gym_users'; // managed by auth.js
    static _cache = []; // registered users cache (synced from Supabase profiles)

    // Returns all known contacts: registered accounts first, then unique clients from booking history.
    // Deduplicates by email (case-insensitive) and phone (last 10 digits).
    static getAll() {
        const seenEmails = new Set();
        const seenPhones = new Set();
        const result = [];

        // Last 10 digits of a phone — used for dedup comparison only
        const _normPhone = p => (p || '').replace(/\D/g, '').slice(-10);

        const _isDup = (email, whatsapp) => {
            const e = (email || '').toLowerCase().trim();
            const p = _normPhone(whatsapp);
            return (e && seenEmails.has(e)) || (p.length >= 9 && seenPhones.has(p));
        };

        const _mark = (email, whatsapp) => {
            const e = (email || '').toLowerCase().trim();
            const p = _normPhone(whatsapp);
            if (e) seenEmails.add(e);
            if (p.length >= 9) seenPhones.add(p);
        };

        const _add = ({ name, email, whatsapp }) => {
            if (!name || (!email && !whatsapp)) return;
            if (_isDup(email, whatsapp)) return;
            _mark(email, whatsapp);
            result.push({ name, email: email || '', whatsapp: whatsapp || '' });
        };

        // 1. Registered accounts (from cache) — highest priority
        this._cache.forEach(_add);

        // 2. Unique clients from booking history (from BookingStorage cache)
        BookingStorage._cache
            .filter(b => b.name && (b.email || b.whatsapp))
            .forEach(_add);

        return result.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }

    // Sincronizza gym_users localStorage dai profili Supabase.
    // Chiama get_all_profiles() (SECURITY DEFINER) — accessibile anche senza sessione auth.
    // Strategia di merge:
    //   - Dati anagrafici (name/email/whatsapp) da Supabase sono autoritativi
    //   - Dati cert/assicurazione locali hanno priorità (admin li aggiorna solo localmente)
    //   - Utenti solo locali (non registrati) vengono preservati
    static async syncUsersFromSupabase() {
        if (typeof supabaseClient === 'undefined') return;
        try {
            const { data, error } = await supabaseClient.rpc('get_all_profiles');
            if (error) {
                console.error('[Supabase] syncUsersFromSupabase error:', error.message);
                return;
            }
            if (!data?.length) return;

            const local = this._cache;

            const normEmail = e => (e || '').toLowerCase().trim();
            const normPhone = p => (p || '').replace(/\D/g, '').slice(-10);

            // Indicizza utenti locali per email e telefono
            const localByEmail = new Map(
                local.filter(u => u.email).map(u => [normEmail(u.email), u])
            );
            const localByPhone = new Map(
                local.filter(u => normPhone(u.whatsapp).length >= 9)
                     .map(u => [normPhone(u.whatsapp), u])
            );

            const supabaseEmails = new Set();
            const supabasePhones = new Set();

            const merged = data.map(row => {
                const e = normEmail(row.email);
                const p = normPhone(row.whatsapp);
                const existing = (e && localByEmail.get(e)) || (p.length >= 9 && localByPhone.get(p)) || {};
                if (e) supabaseEmails.add(e);
                if (p.length >= 9) supabasePhones.add(p);
                return {
                    ...existing,
                    _fromSupabase: true,
                    name:     row.name     || existing.name     || '',
                    email:    row.email    || existing.email    || '',
                    whatsapp: row.whatsapp || existing.whatsapp || '',
                    certificatoMedicoScadenza: row.medical_cert_expiry ?? existing.certificatoMedicoScadenza ?? null,
                    certificatoMedicoHistory: row.medical_cert_history || existing.certificatoMedicoHistory || [],
                    assicurazioneScadenza: row.insurance_expiry ?? existing.assicurazioneScadenza ?? null,
                    assicurazioneHistory: row.insurance_history || existing.assicurazioneHistory || [],
                    codiceFiscale: row.codice_fiscale ?? existing.codiceFiscale ?? null,
                };
            });

            // Mantieni solo utenti mai syncati da Supabase (clienti offline senza account)
            const localOnly = local.filter(u => {
                if (u._fromSupabase) return false;
                const e = normEmail(u.email);
                const p = normPhone(u.whatsapp);
                return !(e && supabaseEmails.has(e)) && !(p.length >= 9 && supabasePhones.has(p));
            });

            this._cache = [...merged, ...localOnly];
            console.log(`[Supabase] syncUsersFromSupabase: ${data.length} da Supabase, ${localOnly.length} solo locali`);
        } catch (e) {
            console.error('[Supabase] syncUsersFromSupabase exception:', e);
        }
    }

    // Search by name, email, or whatsapp (min 2 chars)
    static search(query) {
        if (!query || query.trim().length < 2) return [];
        const q = query.trim().toLowerCase();
        return this.getAll().filter(u =>
            u.name?.toLowerCase().includes(q) ||
            u.email?.toLowerCase().includes(q) ||
            (u.whatsapp && u.whatsapp.replace(/\s/g, '').includes(q.replace(/\s/g, '')))
        );
    }
}

// processPendingCancellations() è chiamata solo da pagine admin (admin.js).
// Il pg_cron server-side (job "process-pending-cancellations", ogni 15 min) è la fonte autorevole.
// NON chiamare da pagine utente: replaceAllBookings usa admin_update_booking RPC che richiede is_admin().
