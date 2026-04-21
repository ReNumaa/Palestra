// Utility debounce: ritarda l'esecuzione finché non passa `delay` ms senza nuove chiamate.
function _debounce(fn, delay) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

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
function _queryWithTimeout(promise, ms = 12000) {
    return _rpcWithTimeout(promise, ms);
}

// Mock data storage - In production, this would be a database
const SLOT_TYPES = {
    PERSONAL: 'personal-training',
    SMALL_GROUP: 'small-group',
    GROUP_CLASS: 'group-class',
    CLEANING: 'cleaning'
};

const SLOT_MAX_CAPACITY = {
    'personal-training': 5,
    'small-group': 5,
    'group-class': 0,
    'cleaning': 0
};

const SLOT_PRICES = {
    'personal-training': 5,
    'small-group': 10,
    'group-class': 30,
    'cleaning': 0
};

// Prezzo effettivo di un booking: rispetta custom_price (slot condiviso 15€/p),
// altrimenti il listino standard SLOT_PRICES. Usare SEMPRE questo helper al posto
// di SLOT_PRICES[b.slotType] quando si calcola il prezzo di uno specifico booking.
function getBookingPrice(booking) {
    if (!booking) return 0;
    if (booking.customPrice != null && !Number.isNaN(Number(booking.customPrice))) {
        return Number(booking.customPrice);
    }
    return SLOT_PRICES[booking.slotType] || 0;
}

// Email degli admin — esclusi dalle statistiche
const ADMIN_EMAILS = new Set([
    'thomasbresciani1992@gmail.com',
    'andrea.pompili1997@gmail.com'
]);

const SLOT_NAMES = {
    'personal-training': 'Autonomia',
    'small-group': 'Lezione di Gruppo',
    'group-class': 'Slot prenotato',
    'cleaning': 'Pulizie'
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
const SCHEDULE_VERSION = 'v9';

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
        { time: '18:40 - 20:00', type: SLOT_TYPES.SMALL_GROUP },  // 🟡
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

// Function to get the current weekly schedule (from active template or default)
function getWeeklySchedule() {
    // Try to load from WeekTemplateStorage (active template)
    const templatesRaw = localStorage.getItem('gym_week_templates');
    if (templatesRaw) {
        try {
            const templates = JSON.parse(templatesRaw);
            const activeId = parseInt(localStorage.getItem('gym_active_week_template') || '1', 10);
            const active = templates.find(t => t.id === activeId);
            if (active && active.schedule) {
                _lsSet('weeklyScheduleTemplate', JSON.stringify(active.schedule));
                return active.schedule;
            }
        } catch { /* corrupted — fall through */ }
    }

    // Fallback: legacy localStorage or default
    const saved = localStorage.getItem('weeklyScheduleTemplate');
    const savedVersion = localStorage.getItem('scheduleVersion');
    if (saved && savedVersion === SCHEDULE_VERSION) {
        try {
            const parsed = JSON.parse(saved);
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

    static async syncFromSupabase({ ownOnly = false } = {}) {
        if (typeof supabaseClient === 'undefined') return;
        try {
            const user    = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
            const isAdmin = sessionStorage.getItem('adminAuth') === 'true';

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
            // Utente: ultime 4 settimane + prossimi 3 mesi (storico vecchio non serve).
            // Query complete (senza limite) per stats/export avvengono tramite fetchForAdmin().
            const bookingSelect = 'id,local_id,user_id,date,time,slot_type,date_display,name,email,whatsapp,notes,status,paid,payment_method,paid_at,credit_applied,custom_price,created_at,cancellation_requested_at,cancelled_at,cancelled_with_bonus,updated_at,cancelled_payment_method,cancelled_paid_at,cancelled_with_penalty,cancelled_refund_pct,created_by,cancelled_by,arrived_at';
            // ownOnly: filtra per user_id server-side (es. prenotazioni.html — anche admin vedono solo i propri)
            const pastD   = new Date(); pastD.setDate(pastD.getDate() - 60);
            const futureD = new Date(); futureD.setDate(futureD.getDate() + 90);
            const pastStr   = _localDateStr(pastD);
            const futureStr = _localDateStr(futureD);

            // Paginazione: Supabase limita a 1000 righe per request (max-rows server)
            const PAGE = 1000;
            let data = [], pageFrom = 0, done = false;
            while (!done) {
                let q = supabaseClient.from('bookings').select(bookingSelect)
                    .order('created_at', { ascending: false })
                    .range(pageFrom, pageFrom + PAGE - 1)
                    .gte('date', pastStr).lte('date', futureStr);
                if (ownOnly && user) q = q.eq('user_id', user.id);
                const { data: page, error: pageErr } = await q;
                if (pageErr) { console.error('[Supabase] syncFromSupabase page error:', pageErr.message); done = true; break; }
                data = data.concat(page || []);
                done = !page || page.length < PAGE;
                pageFrom += PAGE;
            }
            // Utente non-admin: richiede anche la disponibilità aggregata in parallelo
            const fetchAvail = !isAdmin
                ? _rpcWithTimeout(supabaseClient.rpc('get_availability_range', { p_start: todayStr, p_end: endStr }))
                    .catch(e => ({ data: null, error: e }))
                : Promise.resolve({ data: null, error: null });

            const { data: availData, error: e2 } = await fetchAvail;
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
                // Se ha _sbId era già su Supabase: se non è più nella risposta, è stato eliminato
                if (b._sbId) return false;
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
            customPrice:              row.custom_price != null ? Number(row.custom_price) : null,
            createdAt:                row.created_at,
            cancellationRequestedAt:  row.cancellation_requested_at || null,
            cancelledAt:              row.cancelled_at || null,
            cancelledPaymentMethod:   row.cancelled_payment_method || null,
            cancelledPaidAt:          row.cancelled_paid_at || null,
            cancelledWithBonus:       row.cancelled_with_bonus || false,
            cancelledWithPenalty:     row.cancelled_with_penalty || false,
            cancelledRefundPct:       row.cancelled_refund_pct ?? null,
            updatedAt:                row.updated_at || null,
            createdBy:                row.created_by || null,
            cancelledBy:              row.cancelled_by || null,
            arrivedAt:                row.arrived_at || null,
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
        if (typeof supabaseClient === 'undefined') return null;
        try {
            const adminCols = 'id,date,time,slot_type,name,email,whatsapp,notes,status,paid,payment_method,paid_at,credit_applied,custom_price,created_at,cancelled_at,cancelled_with_bonus,cancelled_with_penalty,cancelled_paid_at,cancelled_payment_method,cancelled_refund_pct';
            // Paginazione: il server limita a 1000 righe per request
            const PAGE = 1000;
            let all = [], pageFrom = 0, done = false;
            while (!done) {
                let q = supabaseClient.from('bookings').select(adminCols)
                    .order('date', { ascending: false })
                    .range(pageFrom, pageFrom + PAGE - 1);
                if (startStr) q = q.gte('date', startStr);
                if (endStr)   q = q.lte('date', endStr);
                const { data, error } = await _queryWithTimeout(q, 15000);
                if (error) { console.error('[Supabase] fetchForAdmin page error:', error.message); break; }
                all = all.concat(data || []);
                done = !data || data.length < PAGE;
                pageFrom += PAGE;
            }
            return all.map(row => this._mapRow(row));
        } catch (e) {
            console.error('[Supabase] fetchForAdmin exception:', e);
            return null;
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

    static async saveBooking(booking, overrideCapacity) {
        booking.id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        booking.createdAt = new Date().toISOString();
        booking.status = 'confirmed';

        if (typeof supabaseClient === 'undefined') {
            return { ok: false, error: 'offline', booking };
        }

        const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
        // Se l'utente loggato è admin e l'email del booking è diversa dalla sua,
        // risolvi il user_id del vero cliente (per evitare email_mismatch nel health check)
        let bookingUserId = user?.id || null;
        if (user && booking.email && user.email
            && booking.email.toLowerCase() !== user.email.toLowerCase()) {
            try {
                const { data: prof } = await supabaseClient
                    .from('profiles').select('id').eq('email', booking.email.toLowerCase()).maybeSingle();
                bookingUserId = prof?.id || null;
            } catch { /* fallback: nessun profilo trovato → null */ }
        }
        const maxCap = overrideCapacity || BookingStorage.getEffectiveCapacity(booking.date, booking.time, booking.slotType);
        // Timeout 45s per evitare che il bottone resti bloccato su rete lenta
        const _abortCtrl = new AbortController();
        const _abortTimer = setTimeout(() => _abortCtrl.abort(), 45000);
        let data, error;
        try {
            ({ data, error } = await supabaseClient.rpc('book_slot_atomic', {
                p_local_id:     booking.id,
                p_user_id:      bookingUserId,
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
            }).abortSignal(_abortCtrl.signal));
        } catch (e) {
            clearTimeout(_abortTimer);
            console.error('[Supabase] book_slot_atomic timeout/abort:', e.message);
            return { ok: false, error: 'server_error', booking };
        }
        clearTimeout(_abortTimer);
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
        return Math.max(0, maxCapacity - confirmedCount);
    }

    // Aggiunge un posto extra di tipo extraType allo slot di quella data/ora
    static addExtraSpot(date, time, extraType) {
        const overrides = this.getScheduleOverrides();
        const slots = overrides[date] || [];
        const slot = slots.find(s => s.time === time);
        if (!slot) return false;
        if (!slot.extras) slot.extras = [];
        slot.extras.push({ type: extraType });
        this.saveScheduleOverrides(overrides, [date]);
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
        this.saveScheduleOverrides(overrides, [date]);
        return true;
    }

    // Cancella direttamente una prenotazione (small-group, autonomia) senza conversione slot
    // Usato quando il cliente annulla con più di 24h di anticipo
    static async cancelDirectly(id) {
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
            ? (savedCreditApplied > 0 ? savedCreditApplied : getBookingPrice(booking))
            : 0;
        if (creditToRefund > 0) {
            await CreditStorage.addCredit(
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
    static async cancelAndConvertSlot(id) {
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
            ? (savedCreditApplied2 > 0 ? savedCreditApplied2 : getBookingPrice(booking))
            : 0;
        if (creditToRefund > 0) {
            await CreditStorage.addCredit(
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
                this.saveScheduleOverrides(overrides, [booking.date]);
            }
        }
        return true;
    }

    // Cancella una prenotazione non annullabile usando il bonus giornaliero.
    // Rimborsa il credito (come cancelDirectly) e consuma il bonus (1 → 0).
    static async cancelWithBonus(id) {
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
                    this.saveScheduleOverrides(overrides, [booking.date]);
                }
            }
        }
        const creditToRefund = wasPaid
            ? (savedCreditApplied3 > 0 ? savedCreditApplied3 : getBookingPrice(booking))
            : 0;
        if (creditToRefund > 0) {
            await CreditStorage.addCredit(
                booking.whatsapp, booking.email, booking.name,
                creditToRefund,
                `Rimborso annullamento con bonus ${booking.date} ${booking.time}`,
                null, false, true
            );
        }
        // Usa i dati del profilo corrente come identificatore authoritative per il bonus,
        // in modo che getBonus(user.whatsapp, user.email, user.id) trovi sempre il record.
        // user.id è la chiave più robusta (sopravvive a cambi di email/phone del profilo).
        const _cu = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
        BonusStorage.useBonus(
            _cu?.whatsapp || booking.whatsapp,
            _cu?.email    || booking.email,
            _cu?.name     || booking.name,
            _cu?.id       || booking.userId || null
        );
        return true;
    }

    // Annulla con mora del 50%: rimborso immediato al 50% del prezzo
    // Usato quando il cliente è nella finestra ristretta e la modalità è 'penalty-50'
    static async cancelWithPenalty(id) {
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
                    this.saveScheduleOverrides(overrides, [booking.date]);
                }
            }
        }
        // Mora 50%: comportamento in base allo stato di pagamento
        const mora = Math.round(getBookingPrice(booking) * 0.5 * 100) / 100;
        if (mora > 0) {
            if (wasPaid) {
                // Era stata pagata: rimborsa solo il 50% (il restante 50% è la mora)
                await CreditStorage.addCredit(
                    booking.whatsapp, booking.email, booking.name,
                    mora,
                    `Rimborso parziale 50% — annullamento con mora ${booking.date} ${booking.time}`,
                    null, false, true
                );
            } else {
                // Non era stata pagata: addebita il 50% come mora (il restante 50% è condonato)
                await ManualDebtStorage.addDebt(
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
    static async fulfillPendingCancellations(date, time) {
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
        const creditToRefund = wasPaid ? getBookingPrice(toCancel) : 0;
        if (creditToRefund > 0) {
            await CreditStorage.addCredit(
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
                total += getBookingPrice(b) - (b.creditApplied || 0);
            }
        });
        total += ManualDebtStorage.getBalance(whatsapp, email);
        total -= CreditStorage.getBalance(whatsapp, email);
        return Math.round(Math.max(0, total) * 100) / 100;
    }

    static updateStats(booking) {
        const stats = this.getStats();
        stats.totalBookings = (stats.totalBookings || 0) + 1;
        stats.totalRevenue = (stats.totalRevenue || 0) + getBookingPrice(booking);

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
        if (changed) {
            this._scheduleOverridesCache = overrides;
            _lsSet('scheduleOverrides', JSON.stringify(overrides));
        }
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
                stats.totalRevenue += getBookingPrice(b);
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

    static _scheduleOverridesCache = null;

    static getScheduleOverrides() {
        if (this._scheduleOverridesCache) return this._scheduleOverridesCache;
        try {
            this._scheduleOverridesCache = JSON.parse(localStorage.getItem('scheduleOverrides') || '{}');
        } catch {
            this._scheduleOverridesCache = {};
        }
        return this._scheduleOverridesCache;
    }

    // Salva solo le date specificate (default: tutte).
    // changedDates: array di date YYYY-MM-DD che sono cambiate, oppure null per sync completo.
    static saveScheduleOverrides(overrides, changedDates) {
        this._scheduleOverridesCache = overrides;
        _lsSet('scheduleOverrides', JSON.stringify(overrides));
        if (typeof supabaseClient === 'undefined') return;

        // Se changedDates è specificato, sincronizza solo quelle date (molto più veloce)
        const datesToSync = changedDates || Object.keys(overrides);

        const rows = [];
        for (const dateStr of datesToSync) {
            const slots = overrides[dateStr];
            if (slots && slots.length > 0) {
                for (const slot of slots) {
                    rows.push({
                        date: dateStr, time: slot.time, slot_type: slot.type, extras: slot.extras || [],
                        client_name:     slot.client?.name || null,
                        client_email:    slot.client?.email || null,
                        client_whatsapp: slot.client?.whatsapp || null,
                        booking_id:      slot.bookingId || null,
                    });
                }
            }
        }

        (async () => {
            try {
                if (rows.length > 0) {
                    const { error } = await supabaseClient.from('schedule_overrides')
                        .upsert(rows, { onConflict: 'date,time' });
                    if (error) { console.error('[Supabase] saveScheduleOverrides upsert error:', error.message); return; }
                }
                // Elimina le date svuotate e gli slot rimossi dalle date cambiate
                if (changedDates) {
                    for (const dateStr of datesToSync) {
                        const activeTimesForDate = (overrides[dateStr] || []).map(s => s.time);
                        const { data: existing } = await supabaseClient.from('schedule_overrides')
                            .select('id, time').eq('date', dateStr);
                        if (existing) {
                            const toDelete = existing
                                .filter(r => !activeTimesForDate.includes(r.time))
                                .map(r => r.id);
                            if (toDelete.length > 0) {
                                await supabaseClient.from('schedule_overrides')
                                    .delete().in('id', toDelete);
                            }
                        }
                    }
                } else {
                    // Sync completo (importa settimana, clear, ecc.)
                    const activeKeys = new Set(rows.map(r => `${r.date}|${r.time}`));
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
            // Promise.allSettled: ogni query è indipendente — se una fallisce le altre vanno avanti
            // Ogni query è wrappata in _queryWithTimeout per evitare hang infiniti
            // credit_history paginato: supera il limite default PostgREST (~1000 righe),
            // altrimenti con tante entries le più recenti vengono silenziosamente troncate.
            const _fetchCreditHistoryAll = (async () => {
                const all = [];
                const BATCH = 1000;
                const MAX_PAGES = 100; // cap di sicurezza: 100k righe
                for (let page = 0; page < MAX_PAGES; page++) {
                    const from = page * BATCH;
                    const { data, error } = await supabaseClient.from('credit_history')
                        .select('credit_id, amount, note, created_at, method')
                        .order('created_at', { ascending: true })
                        .range(from, from + BATCH - 1);
                    if (error) return { data: null, error };
                    if (!data || data.length === 0) break;
                    all.push(...data);
                    if (data.length < BATCH) break;
                }
                return { data: all, error: null };
            })();

            const _results = await Promise.allSettled([
                _queryWithTimeout(supabaseClient.from('app_settings').select('value').eq('key', 'data_cleared_at').maybeSingle()),
                _queryWithTimeout(supabaseClient.from('credits').select('id, name, whatsapp, email, balance, free_balance')),
                _queryWithTimeout(_fetchCreditHistoryAll, 30000), // timeout più alto per paginazione multipla
                _queryWithTimeout(supabaseClient.from('manual_debts').select('name, whatsapp, email, balance, history')),
                _queryWithTimeout(supabaseClient.from('bonuses').select('name, whatsapp, email, bonus, last_reset_month')),
                _queryWithTimeout(supabaseClient.from('schedule_overrides').select('date, time, slot_type, extras, client_name, client_email, client_whatsapp, booking_id').order('date').order('time')),
                _queryWithTimeout(supabaseClient.from('settings').select('key, value')),
            ]);
            const _syncLabels = ['app_settings', 'credits', 'credit_history', 'manual_debts', 'bonuses', 'schedule_overrides', 'settings'];
            _results.forEach((r, i) => { if (r.status === 'rejected') console.warn(`[Supabase] syncAppSettings: ${_syncLabels[i]} skipped (timeout/error)`); });
            const _v = (i) => _results[i].status === 'fulfilled' ? _results[i].value : { data: null, error: 'rejected' };
            const { data: clearedRow }              = _v(0);
            const { data: creditsData,  error: e1 } = _v(1);
            const { data: histData }                = _v(2);
            const { data: debtsData,    error: e3 } = _v(3);
            const { data: bonusesData,  error: e4 } = _v(4);
            const { data: overridesData, error: e5 } = _v(5);
            const { data: settingsData, error: e6 } = _v(6);

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
                    BookingStorage._scheduleOverridesCache = null;
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
                    histMap[h.credit_id].push({ date: h.created_at, amount: h.amount, note: h.note || '', method: h.method || '' });
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
                    if (r.client_name) slot.client = { name: r.client_name, email: r.client_email || '', whatsapp: r.client_whatsapp || '' };
                    if (r.booking_id) slot.bookingId = r.booking_id;
                    overrides[r.date].push(slot);
                }
                BookingStorage._scheduleOverridesCache = overrides;
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
                _s(WeekTemplateStorage.KEY,        'week_templates');
                _s(WeekTemplateStorage.ACTIVE_KEY, 'active_week_template');
                _s(RechargeBonusStorage.KEY_ENABLED,   'recharge_bonus_enabled');
                _s(RechargeBonusStorage.KEY_THRESHOLD, 'recharge_bonus_threshold');
                _s(RechargeBonusStorage.KEY_AMOUNT,    'recharge_bonus_amount');
                // Refresh global template after sync
                WEEKLY_SCHEDULE_TEMPLATE = getWeeklySchedule();
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
        const all = this._cache;
        const idx = all.findIndex(b => b.id === id);
        if (idx !== -1 && all[idx].status !== 'cancelled') {
            // Build a new array with the modified booking so replaceAllBookings
            // can diff against the old cache (which still has the original refs)
            const updated = all.map((b, i) => {
                if (i !== idx) return b;
                return {
                    ...b,
                    status: 'cancelled',
                    cancelledAt: new Date().toISOString(),
                    paid: false,
                    paymentMethod: null,
                    paidAt: null,
                    creditApplied: 0,
                };
            });
            this.replaceAllBookings(updated);
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

    static _pendingSave = null;

    static async _save(data) {
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
        const p = supabaseClient.from('credits')
            .upsert(rows, { onConflict: 'email' })
            .then(({ error }) => {
                if (error) {
                    console.error('[Supabase] CreditStorage._save error:', error.message);
                    if (typeof showToast === 'function') showToast('⚠️ Errore salvataggio crediti sul server. Ricarica la pagina.', 'error', 5000);
                }
            });
        this._pendingSave = p;
        await p;
        if (this._pendingSave === p) this._pendingSave = null;
    }

    static async syncFromSupabase() {
        if (typeof supabaseClient === 'undefined') return;
        try {
            // 1. Credits (1 riga per utente, ben sotto il limite PostgREST)
            const { data: creditsData, error: e1 } = await _queryWithTimeout(
                supabaseClient.from('credits').select('id, name, whatsapp, email, balance, free_balance')
            );
            if (e1) { console.error('[Supabase] CreditStorage.sync error:', e1.message); return; }
            if (!creditsData?.length) return;

            // 2. credit_history: paginazione esplicita per superare il limite PostgREST
            //    (default ~1000 righe/query). Senza questo, con >1000 entries totali, le
            //    righe più recenti venivano silenziosamente troncate.
            const allHist = [];
            const BATCH = 1000;
            const MAX_PAGES = 100; // cap di sicurezza: 100k righe
            for (let page = 0; page < MAX_PAGES; page++) {
                const from = page * BATCH;
                const { data, error } = await supabaseClient.from('credit_history')
                    .select('credit_id, amount, note, created_at, display_amount, booking_ref, hidden, method')
                    .eq('hidden', false)
                    .order('created_at', { ascending: true })
                    .range(from, from + BATCH - 1);
                if (error) {
                    console.error('[Supabase] CreditStorage.sync credit_history page error:', error.message);
                    break;
                }
                if (!data || data.length === 0) break;
                allHist.push(...data);
                if (data.length < BATCH) break; // ultima pagina
            }

            const histMap = {};
            for (const h of allHist) {
                if (!histMap[h.credit_id]) histMap[h.credit_id] = [];
                histMap[h.credit_id].push({
                    date: h.created_at,
                    amount: h.amount,
                    note: h.note || '',
                    method: h.method || '',
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
            console.log(`[Supabase] CreditStorage.sync: dati caricati (${allHist.length} history entries)`);
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
                method:     entry.method || '',
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

    static async addCredit(whatsapp, email, name, amount, note = '', displayAmount = null, freeLesson = false, hiddenRefund = false, bookingRef = null, method = '') {
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
        await this._save(all);

        // Inserisce la nuova voce in credit_history su Supabase e attende il completamento.
        if (typeof supabaseClient !== 'undefined') {
            const _entry = entry;
            const _email = (email || '').toLowerCase();
            const _rec = all[key];
            await this._insertCreditHistory(_email, _rec, _entry);
        }
    }

    static async hidePaymentEntryByBooking(whatsapp, email, bookingId) {
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
        if (changed) await this._save(all);
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

    static getAllWithHistory() {
        return Object.values(this._getAll())
            .filter(c => c.history && c.history.length > 0)
            .sort((a, b) => {
                const lastA = a.history[a.history.length - 1]?.date || '';
                const lastB = b.history[b.history.length - 1]?.date || '';
                return lastB.localeCompare(lastA);
            });
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
                const price = getBookingPrice(b);
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

    static _pendingSave = null;

    static async _save(data) {
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
        const p = supabaseClient.from('manual_debts')
            .upsert(rows, { onConflict: 'email' })
            .then(({ error }) => {
                if (error) {
                    console.error('[Supabase] ManualDebtStorage._save error:', error.message);
                    if (typeof showToast === 'function') showToast('⚠️ Errore salvataggio debiti sul server. Ricarica la pagina.', 'error', 5000);
                }
            });
        this._pendingSave = p;
        await p;
        if (this._pendingSave === p) this._pendingSave = null;
    }

    static async syncFromSupabase() {
        if (typeof supabaseClient === 'undefined') return;
        try {
            const { data, error } = await _queryWithTimeout(supabaseClient
                .from('manual_debts').select('name, whatsapp, email, balance, history'));
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
    static async addDebt(whatsapp, email, name, amount, note = '', method = '', entryType = '') {
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
        await this._save(all);
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

    static async clearRecord(whatsapp, email) {
        const all = this._getAll();
        const key = this._findKey(whatsapp, email);
        if (key) { delete all[key]; await this._save(all); }
        if (typeof supabaseClient !== 'undefined' && email) {
            const { error } = await supabaseClient.from('manual_debts').delete().eq('email', (email || '').toLowerCase());
            if (error) console.error('[Supabase] ManualDebtStorage.clearRecord error:', error.message);
        }
    }

    // Elimina una singola voce di debito manuale per data (ISO string) e ricalcola il saldo.
    // Rimuove anche eventuali voci di saldamento orfane (amount < 0) se la somma diventa negativa.
    static async deleteDebtEntry(whatsapp, email, entryDate) {
        const all = this._getAll();
        const key = this._findKey(whatsapp, email);
        if (!key || !all[key]) return false;
        const idx = all[key].history.findIndex(e => e.date === entryDate && e.amount > 0);
        if (idx === -1) return false;
        all[key].history.splice(idx, 1);

        // Se la somma è negativa, rimuovi voci negative orfane (più recenti prima)
        let sum = all[key].history.reduce((s, e) => s + e.amount, 0);
        if (sum < 0) {
            let excess = -sum;
            for (let i = all[key].history.length - 1; i >= 0 && excess > 0; i--) {
                if (all[key].history[i].amount < 0) {
                    excess += all[key].history[i].amount;
                    if (excess < 0) excess = 0;
                    all[key].history.splice(i, 1);
                }
            }
        }

        all[key].balance = Math.round(
            Math.max(0, all[key].history.reduce((s, e) => s + e.amount, 0)) * 100
        ) / 100;
        const wasDeleted = all[key].history.length === 0;
        if (wasDeleted) delete all[key];
        await this._save(all);
        // Se il record è stato eliminato completamente, rimuovilo anche da Supabase
        // (_save fa upsert dei record rimasti, ma non cancella quelli assenti)
        if (wasDeleted && typeof supabaseClient !== 'undefined' && email) {
            const { error } = await supabaseClient.from('manual_debts').delete().eq('email', (email || '').toLowerCase());
            if (error) console.error('[Supabase] deleteDebtEntry cleanup error:', error.message);
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
        // NOTA: user_id NON è incluso volutamente nel body dell'upsert.
        // PostgREST upsert esegue INSERT ... ON CONFLICT DO UPDATE settando
        // solo le colonne presenti nel body → escludendo user_id preserviamo
        // il valore già scritto dalla RPC backend e non rischiamo mai di
        // sovrascrivere un user_id valido con null. Le righe nuove create
        // da path frontend (es. resetClientBonus per cliente senza record)
        // avranno user_id=null, poi backfillato dalla migration o dal
        // prossimo consumo via RPC.
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

    // Match primario: user_id (autoritativo). Fallback: email/phone per record legacy senza user_id.
    // Se il caller fornisce un userId e il record ha un userId diverso da quello → NON è il record giusto,
    // evita cross-match via email per prevenire collisioni teoriche (es. email riciclate).
    static _matchContact(record, whatsapp, email, userId) {
        if (userId && record.userId) {
            return record.userId === userId;
        }
        const normStored = normalizePhone(record.whatsapp);
        const normInput  = normalizePhone(whatsapp);
        const phoneMatch = normInput && normStored && normStored === normInput;
        const emailMatch = email && record.email && record.email.toLowerCase() === email.toLowerCase();
        return phoneMatch || emailMatch;
    }

    static _findKey(whatsapp, email, userId) {
        const all = this._getAll();
        // Priorità 1: cerca match esatto per user_id (se fornito)
        if (userId) {
            for (const [key, record] of Object.entries(all)) {
                if (record.userId && record.userId === userId) return key;
            }
        }
        // Priorità 2: fallback legacy su email/phone (anche per record senza userId)
        for (const [key, record] of Object.entries(all)) {
            if (this._matchContact(record, whatsapp, email, userId)) return key;
        }
        return null;
    }

    // Returns current bonus (0 or 1). Auto-restores to 1 on month change (non-cumulative).
    // `userId` opzionale: se fornito, il lookup è autoritativo via user_id (robusto anche
    // se l'email del profilo è stata cambiata dopo il consumo del bonus).
    static getBonus(whatsapp, email, userId) {
        const all       = this._getAll();
        const key       = this._findKey(whatsapp, email, userId);
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
            const { data, error } = await _queryWithTimeout(supabaseClient
                .from('bonuses')
                .select('user_id, name, whatsapp, email, bonus, last_reset_month'));
            if (error) { console.error('[Supabase] BonusStorage.syncFromSupabase error:', error.message); return; }
            const all = {};
            (data || []).forEach(r => {
                const key = `${normalizePhone(r.whatsapp) || ''}||${(r.email || '').toLowerCase()}`;
                all[key] = {
                    userId:         r.user_id || null,
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
    // `userId` opzionale: popolato nella cache locale per permettere lookup autoritativo
    // nella stessa sessione prima che la sync da Supabase riporti il user_id dal DB.
    static useBonus(whatsapp, email, name, userId) {
        const all       = this._getAll();
        const thisMonth = this._thisMonthStr();
        // Normalizza per garantire che getBonus() trovi sempre il record con gli stessi input
        const normWa = normalizePhone(whatsapp) || '';
        const normEm = (email || '').toLowerCase();
        let key = this._findKey(normWa, normEm, userId);
        if (!key) key = `${normWa}||${normEm}`;
        if (!all[key]) all[key] = { userId: userId || null, name, whatsapp: normWa, email: normEm, bonus: 1, lastResetMonth: thisMonth };
        all[key].bonus = 0;
        all[key].lastResetMonth = thisMonth;
        all[key].whatsapp = normWa;
        all[key].email    = normEm;
        all[key].name     = name || all[key].name;
        // Backfill userId locale se il caller lo ha fornito e il record non lo aveva
        if (userId && !all[key].userId) all[key].userId = userId;
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
    static get() { return localStorage.getItem(this.KEY) || 'penalty-50'; }
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

// Week template storage — 3 named standard week templates, one active
class WeekTemplateStorage {
    static KEY = 'gym_week_templates';
    static ACTIVE_KEY = 'gym_active_week_template';

    static _defaultTemplates() {
        return [
            { id: 1, name: 'Settimana Standard 1', schedule: JSON.parse(JSON.stringify(DEFAULT_WEEKLY_SCHEDULE)) },
            { id: 2, name: 'Settimana Standard 2', schedule: JSON.parse(JSON.stringify(DEFAULT_WEEKLY_SCHEDULE)) },
            { id: 3, name: 'Settimana Standard 3', schedule: JSON.parse(JSON.stringify(DEFAULT_WEEKLY_SCHEDULE)) },
        ];
    }

    static getAll() {
        const raw = localStorage.getItem(this.KEY);
        if (raw) {
            try { return JSON.parse(raw); } catch { /* corrupted */ }
        }
        const defaults = this._defaultTemplates();
        _lsSet(this.KEY, JSON.stringify(defaults));
        return defaults;
    }

    static save(templates) {
        _lsSet(this.KEY, JSON.stringify(templates));
        _upsertSetting(this.KEY, JSON.stringify(templates));
    }

    static getActiveId() {
        return parseInt(localStorage.getItem(this.ACTIVE_KEY) || '1', 10);
    }

    static setActiveId(id) {
        _lsSet(this.ACTIVE_KEY, String(id));
        _upsertSetting(this.ACTIVE_KEY, String(id));
        // Update global template variable
        const templates = this.getAll();
        const active = templates.find(t => t.id === id);
        if (active) {
            WEEKLY_SCHEDULE_TEMPLATE = active.schedule;
            _lsSet('weeklyScheduleTemplate', JSON.stringify(active.schedule));
        }
    }

    static getActiveSchedule() {
        const templates = this.getAll();
        const activeId = this.getActiveId();
        const active = templates.find(t => t.id === activeId);
        return active ? active.schedule : DEFAULT_WEEKLY_SCHEDULE;
    }

    static updateTemplate(id, data) {
        const templates = this.getAll();
        const tpl = templates.find(t => t.id === id);
        if (!tpl) return;
        if (data.name !== undefined) tpl.name = data.name;
        if (data.schedule !== undefined) tpl.schedule = data.schedule;
        this.save(templates);
        // If this is the active template, update global
        if (id === this.getActiveId()) {
            WEEKLY_SCHEDULE_TEMPLATE = tpl.schedule;
            _lsSet('weeklyScheduleTemplate', JSON.stringify(tpl.schedule));
        }
    }
}

// Recharge bonus — when a client loads credit >= threshold, auto-add free lesson credit
class RechargeBonusStorage {
    static KEY_ENABLED   = 'gym_recharge_bonus_enabled';
    static KEY_THRESHOLD = 'gym_recharge_bonus_threshold';
    static KEY_AMOUNT    = 'gym_recharge_bonus_amount';
    static isEnabled()  { return localStorage.getItem(this.KEY_ENABLED) === 'true'; }
    static getThreshold() { return parseFloat(localStorage.getItem(this.KEY_THRESHOLD) || '100') || 100; }
    static getAmount()    { return parseFloat(localStorage.getItem(this.KEY_AMOUNT) || '5') || 5; }
    static setEnabled(val)   { _lsSet(this.KEY_ENABLED, val ? 'true' : 'false'); _upsertSetting(this.KEY_ENABLED, val ? 'true' : 'false'); }
    static setThreshold(val) { const v = parseFloat(val) || 100; _lsSet(this.KEY_THRESHOLD, String(v)); _upsertSetting(this.KEY_THRESHOLD, v); }
    static setAmount(val)    { const v = parseFloat(val) || 5;   _lsSet(this.KEY_AMOUNT, String(v));    _upsertSetting(this.KEY_AMOUNT, v); }
    /** Calcola il bonus gratuito per un dato importo di ricarica. Ritorna 0 se disabilitato o sotto soglia. */
    static calcBonus(rechargeAmount) {
        if (!this.isEnabled()) return 0;
        const threshold = this.getThreshold();
        if (rechargeAmount < threshold) return 0;
        const multiplier = Math.floor(rechargeAmount / threshold);
        return Math.round(multiplier * this.getAmount() * 100) / 100;
    }
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

        const _add = (user) => {
            const { name, email, whatsapp } = user;
            if (!name || (!email && !whatsapp)) return;
            if (_isDup(email, whatsapp)) return;
            _mark(email, whatsapp);
            result.push({ ...user, email: email || '', whatsapp: whatsapp || '' });
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
            const { data, error } = await _rpcWithTimeout(supabaseClient.rpc('get_all_profiles'));
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
                    userId:   row.id || existing.userId || null,
                    name:     row.name     || existing.name     || '',
                    email:    row.email    || existing.email    || '',
                    whatsapp: row.whatsapp || existing.whatsapp || '',
                    certificatoMedicoScadenza: row.medical_cert_expiry ?? existing.certificatoMedicoScadenza ?? null,
                    certificatoMedicoHistory: row.medical_cert_history || existing.certificatoMedicoHistory || [],
                    assicurazioneScadenza: row.insurance_expiry ?? existing.assicurazioneScadenza ?? null,
                    assicurazioneHistory: row.insurance_history || existing.assicurazioneHistory || [],
                    codiceFiscale: row.codice_fiscale ?? existing.codiceFiscale ?? null,
                    indirizzoVia: row.indirizzo_via ?? existing.indirizzoVia ?? null,
                    indirizzoPaese: row.indirizzo_paese ?? existing.indirizzoPaese ?? null,
                    indirizzoCap: row.indirizzo_cap ?? existing.indirizzoCap ?? null,
                    documentoFirmato: row.documento_firmato ?? existing.documentoFirmato ?? false,
                    privacyPrenotazioni: row.privacy_prenotazioni ?? existing.privacyPrenotazioni ?? false,
                    geoEnabled: row.geo_enabled ?? existing.geoEnabled ?? false,
                    pushEnabled: row.push_enabled ?? existing.pushEnabled ?? false,
                    stripeEnabled: row.stripe_enabled ?? existing.stripeEnabled ?? false,
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

// ── Push-enabled users cache (per icone proximity in admin) ──────────────────
// Set di user_id che hanno almeno una push subscription attiva
let _pushEnabledUsers = new Set();
async function syncPushEnabledUsers() {
    if (typeof supabaseClient === 'undefined') return;
    try {
        const { data, error } = await _rpcWithTimeout(supabaseClient.rpc('get_push_enabled_users'), 12000);
        if (error) { console.warn('[Push] get_push_enabled_users error:', error.message); return; }
        _pushEnabledUsers = new Set((data || []).map(id => id));
    } catch (e) {
        console.warn('[Push] syncPushEnabledUsers exception:', e);
    }
}
function hasPushEnabled(userId) {
    return _pushEnabledUsers.has(userId);
}

// ═══════════════════════════════════════════════════════════════════════════════
// WorkoutPlanStorage — Schede palestra
// ═══════════════════════════════════════════════════════════════════════════════
class WorkoutPlanStorage {
    static _cache = [];           // array of plan objects with nested exercises

    static getAllPlans() { return this._cache; }

    static getPlansByUser(userId) {
        return this._cache.filter(p => p.user_id === userId);
    }

    static getActivePlan(userId) {
        return this._cache.find(p => p.user_id === userId && p.active);
    }

    static getPlanById(planId) {
        return this._cache.find(p => p.id === planId);
    }

    // Admin: fetch all plans with nested exercises
    // Client: fetch only own active plan(s)
    static async syncFromSupabase({ adminMode = false } = {}) {
        if (typeof supabaseClient === 'undefined') return;
        try {
            let query = supabaseClient
                .from('workout_plans')
                .select('*, workout_exercises(*)');

            if (!adminMode) {
                // Client: only own active plans
                const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
                if (!user) return;
                query = query.eq('user_id', user.id).eq('active', true);
            }
            query = query.order('updated_at', { ascending: false });

            // Timeout 30s: query pesante (join workout_exercises su tutti i piani).
            // In admin mode carica 30+ piani e puo' superare i 12s di default.
            const { data, error } = await _queryWithTimeout(query, 30000);
            if (error) { console.error('[Supabase] WorkoutPlanStorage.sync error:', error.message); return; }

            // Sort exercises within each plan by sort_order
            for (const plan of (data || [])) {
                if (plan.workout_exercises) {
                    plan.workout_exercises.sort((a, b) => a.sort_order - b.sort_order);
                }
            }
            this._cache = data || [];
            console.log(`[Supabase] WorkoutPlanStorage.sync: ${this._cache.length} piani caricati`);
        } catch (e) { console.error('[Supabase] WorkoutPlanStorage.sync exception:', e); }
    }

    // ── CRUD Plans ───────────────────────────────────────────────────────────
    // Tutte le CRUD usano _queryWithTimeout(15000): senza timeout, in caso di
    // auth lock contention o rete lenta le insert/update/delete restavano
    // appese indefinitamente, lasciando l'utente senza feedback (es. click
    // "Aggiungi Esercizio" che non aggiungeva nulla, niente toast, niente errore).
    static async createPlan({ user_id, name, start_date, end_date, notes }) {
        const { data, error } = await _queryWithTimeout(supabaseClient
            .from('workout_plans')
            .insert({ user_id, name, start_date: start_date || null, end_date: end_date || null, notes: notes || null, active: true })
            .select()
            .single(), 15000);
        if (error) throw error;
        data.workout_exercises = [];
        this._cache.unshift(data);
        return data;
    }

    static async updatePlan(planId, updates) {
        const { error } = await _queryWithTimeout(supabaseClient
            .from('workout_plans')
            .update(updates)
            .eq('id', planId), 15000);
        if (error) throw error;
        const idx = this._cache.findIndex(p => p.id === planId);
        if (idx >= 0) Object.assign(this._cache[idx], updates);
    }

    static async deletePlan(planId) {
        const { error } = await _queryWithTimeout(supabaseClient
            .from('workout_plans')
            .delete()
            .eq('id', planId), 15000);
        if (error) throw error;
        this._cache = this._cache.filter(p => p.id !== planId);
    }

    static async duplicatePlan(planId, newUserId, newName) {
        const { data, error } = await _rpcWithTimeout(
            supabaseClient.rpc('admin_duplicate_plan', {
                p_plan_id: planId,
                p_new_user_id: newUserId,
                p_new_name: newName || null,
            })
        );
        if (error) throw error;
        await this.syncFromSupabase({ adminMode: true });
        return data; // new plan id
    }

    // ── CRUD Exercises ───────────────────────────────────────────────────────
    static async addExercise(planId, exerciseData) {
        const plan = this.getPlanById(planId);
        // Se sort_order non è passato esplicitamente, leggi il max reale dal DB
        let maxOrder = -1;
        if (exerciseData.sort_order == null) {
            try {
                const { data: lastEx } = await _queryWithTimeout(
                    supabaseClient
                        .from('workout_exercises')
                        .select('sort_order')
                        .eq('plan_id', planId)
                        .order('sort_order', { ascending: false })
                        .limit(1)
                        .maybeSingle(),
                    15000
                );
                maxOrder = lastEx?.sort_order ?? -1;
            } catch (_) {
                // Fallback: cache locale se la query fallisce
                maxOrder = plan?.workout_exercises?.reduce((m, e) => Math.max(m, e.sort_order ?? -1), -1) ?? -1;
            }
        }
        const row = {
            plan_id: planId,
            day_label: exerciseData.day_label || 'Giorno A',
            exercise_name: exerciseData.exercise_name,
            exercise_slug: exerciseData.exercise_slug || null,
            muscle_group: exerciseData.muscle_group || null,
            sort_order: exerciseData.sort_order ?? (maxOrder + 1),
            sets: exerciseData.sets || 3,
            reps: exerciseData.reps || '10',
            weight_kg: exerciseData.weight_kg ?? null,
            rest_seconds: exerciseData.rest_seconds ?? 90,
            notes: exerciseData.notes || null,
            superset_group: exerciseData.superset_group || null,
        };
        const { data, error } = await _queryWithTimeout(supabaseClient
            .from('workout_exercises')
            .insert(row)
            .select()
            .single(), 15000);
        if (error) throw error;
        if (plan) {
            plan.workout_exercises = plan.workout_exercises || [];
            plan.workout_exercises.push(data);
        }
        return data;
    }

    // Add a superset pair (two exercises linked by the same superset_group UUID)
    // Caller can pass sort_order in ex1Data/ex2Data to force placement;
    // otherwise maxOrder is computed from cache, or (fallback) fetched from Supabase.
    static async addSuperset(planId, ex1Data, ex2Data) {
        let maxOrder = -1;
        if (ex1Data.sort_order == null || ex2Data.sort_order == null) {
            // Sempre dal DB per evitare sort_order stale da cache locale
            try {
                const { data: lastEx } = await _queryWithTimeout(
                    supabaseClient
                        .from('workout_exercises')
                        .select('sort_order')
                        .eq('plan_id', planId)
                        .order('sort_order', { ascending: false })
                        .limit(1)
                        .maybeSingle(),
                    15000
                );
                maxOrder = lastEx?.sort_order ?? -1;
            } catch (_) {
                // Fallback: cache locale
                const plan = this.getPlanById(planId);
                if (plan && Array.isArray(plan.workout_exercises) && plan.workout_exercises.length > 0) {
                    maxOrder = plan.workout_exercises.reduce((m, e) => Math.max(m, e.sort_order ?? -1), -1);
                }
            }
        }
        const groupId = crypto.randomUUID();
        const so1 = ex1Data.sort_order != null ? ex1Data.sort_order : (maxOrder + 1);
        const so2 = ex2Data.sort_order != null ? ex2Data.sort_order : (maxOrder + 2);
        // First exercise: no rest (done back-to-back)
        const first = await this.addExercise(planId, {
            ...ex1Data,
            sort_order: so1,
            rest_seconds: 0,
            superset_group: groupId,
        });
        // Second exercise: has the actual rest
        const second = await this.addExercise(planId, {
            ...ex2Data,
            sort_order: so2,
            superset_group: groupId,
        });
        return { first, second, superset_group: groupId };
    }

    static async updateExercise(exerciseId, updates) {
        const { error } = await _queryWithTimeout(supabaseClient
            .from('workout_exercises')
            .update(updates)
            .eq('id', exerciseId), 15000);
        if (error) throw error;
        // Update cache
        for (const plan of this._cache) {
            const ex = (plan.workout_exercises || []).find(e => e.id === exerciseId);
            if (ex) { Object.assign(ex, updates); break; }
        }
    }

    static async deleteExercise(exerciseId) {
        const { error } = await _queryWithTimeout(supabaseClient
            .from('workout_exercises')
            .delete()
            .eq('id', exerciseId), 15000);
        if (error) throw error;
        for (const plan of this._cache) {
            plan.workout_exercises = (plan.workout_exercises || []).filter(e => e.id !== exerciseId);
        }
    }

    static async reorderExercises(planId, orderedIds) {
        const updates = orderedIds.map((id, i) => ({ id, sort_order: i }));
        for (const u of updates) {
            await _queryWithTimeout(supabaseClient.from('workout_exercises').update({ sort_order: u.sort_order }).eq('id', u.id), 15000);
        }
        const plan = this.getPlanById(planId);
        if (plan && plan.workout_exercises) {
            plan.workout_exercises.sort((a, b) => {
                const ai = orderedIds.indexOf(a.id);
                const bi = orderedIds.indexOf(b.id);
                return ai - bi;
            });
        }
    }

}

// ═══════════════════════════════════════════════════════════════════════════════
// WorkoutLogStorage — Log allenamenti clienti
// ═══════════════════════════════════════════════════════════════════════════════
class WorkoutLogStorage {
    static _cache = [];

    static getAll() { return this._cache; }

    static getByExercise(exerciseId) {
        return this._cache.filter(l => l.exercise_id === exerciseId);
    }

    static getByDate(logDate) {
        return this._cache.filter(l => l.log_date === logDate);
    }

    // Fetch logs for a specific plan (all exercises)
    static async syncForPlan(planId) {
        if (typeof supabaseClient === 'undefined') return;
        try {
            const plan = WorkoutPlanStorage.getPlanById(planId);
            if (!plan || !plan.workout_exercises?.length) { this._cache = []; return; }
            const exIds = plan.workout_exercises.map(e => e.id);
            const { data, error } = await _queryWithTimeout(supabaseClient
                .from('workout_logs')
                .select('id,exercise_id,user_id,log_date,set_number,reps_done,weight_done,rpe')
                .in('exercise_id', exIds)
                .order('log_date', { ascending: false })
                .order('set_number', { ascending: true }));
            if (error) { console.error('[Supabase] WorkoutLogStorage.sync error:', error.message); return; }
            this._cache = data || [];
            console.log(`[Supabase] WorkoutLogStorage.sync: ${this._cache.length} log caricati`);
        } catch (e) { console.error('[Supabase] WorkoutLogStorage.sync exception:', e); }
    }

    // Fetch ALL logs for a user (for charts across plans)
    static async syncForUser(userId) {
        if (typeof supabaseClient === 'undefined') return;
        try {
            const { data, error } = await _queryWithTimeout(supabaseClient
                .from('workout_logs')
                .select('id,exercise_id,user_id,log_date,set_number,reps_done,weight_done,rpe')
                .eq('user_id', userId)
                .order('log_date', { ascending: false })
                .order('set_number', { ascending: true }));
            if (error) { console.error('[Supabase] WorkoutLogStorage.syncUser error:', error.message); return; }
            this._cache = data || [];
        } catch (e) { console.error('[Supabase] WorkoutLogStorage.syncUser exception:', e); }
    }

    // Insert or update (upsert on unique constraint)
    static async logSet({ exercise_id, user_id, log_date, set_number, reps_done, weight_done, rpe, rest_done, notes }) {
        const row = {
            exercise_id, user_id,
            log_date: log_date || _localDateStr(),
            set_number,
            reps_done: reps_done ?? null,
            weight_done: weight_done ?? null,
            rpe: rpe ?? null,
            rest_done: rest_done ?? null,
            notes: notes || null,
        };
        const { data, error } = await _queryWithTimeout(supabaseClient
            .from('workout_logs')
            .upsert(row, { onConflict: 'exercise_id,user_id,log_date,set_number' })
            .select()
            .single(), 15000);
        if (error) throw error;
        // Update cache
        const idx = this._cache.findIndex(l =>
            l.exercise_id === exercise_id && l.log_date === row.log_date && l.set_number === set_number
        );
        if (idx >= 0) this._cache[idx] = data;
        else this._cache.push(data);
        return data;
    }

    // Delete a single log entry
    static async deleteLog(logId) {
        const { error } = await _queryWithTimeout(supabaseClient
            .from('workout_logs')
            .delete()
            .eq('id', logId), 15000);
        if (error) throw error;
        this._cache = this._cache.filter(l => l.id !== logId);
    }
}

// processPendingCancellations() è chiamata solo da pagine admin (admin.js).
// Il pg_cron server-side (job "process-pending-cancellations", ogni 15 min) è la fonte autorevole.
// NON chiamare da pagine utente: replaceAllBookings usa admin_update_booking RPC che richiede is_admin().
