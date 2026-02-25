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
    'small-group': 30,
    'group-class': 10
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
        const parsed = JSON.parse(saved);
        // Extra safety: verify slot format matches current TIME_SLOTS
        const storedTimes = Object.values(parsed).flat().map(s => s.time);
        const isCurrentFormat = storedTimes.length === 0 || storedTimes.every(t => TIME_SLOTS.includes(t));
        if (isCurrentFormat) return parsed;
    }
    // Outdated version or format — reset template and overrides
    localStorage.removeItem('scheduleOverrides');
    localStorage.setItem('weeklyScheduleTemplate', JSON.stringify(DEFAULT_WEEKLY_SCHEDULE));
    localStorage.setItem('scheduleVersion', SCHEDULE_VERSION);
    return DEFAULT_WEEKLY_SCHEDULE;
}

// Global variable that will be used throughout the app
let WEEKLY_SCHEDULE_TEMPLATE = getWeeklySchedule();

// Storage functions
class BookingStorage {
    static BOOKINGS_KEY = 'gym_bookings';
    static STATS_KEY = 'gym_stats';

    static getAllBookings() {
        const data = localStorage.getItem(this.BOOKINGS_KEY);
        return data ? JSON.parse(data) : [];
    }

    static saveBooking(booking) {
        const bookings = this.getAllBookings();
        // Generate truly unique ID using timestamp + random number
        booking.id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        booking.createdAt = new Date().toISOString();
        booking.status = 'confirmed';
        bookings.push(booking);
        localStorage.setItem(this.BOOKINGS_KEY, JSON.stringify(bookings));
        this.updateStats(booking);
        return booking;
    }

    static getBookingsForSlot(date, time) {
        const bookings = this.getAllBookings();
        return bookings.filter(b => b.date === date && b.time === time && b.status !== 'cancelled');
    }

    static getRemainingSpots(date, time, slotType) {
        const bookings = this.getBookingsForSlot(date, time);
        // Only confirmed bookings count toward capacity; cancellation_requested frees the spot
        const confirmedCount = bookings.filter(b => b.status === 'confirmed').length;
        const maxCapacity = SLOT_MAX_CAPACITY[slotType];
        return maxCapacity - confirmedCount;
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
        const wasPaidWithCredit = toCancel.paid && toCancel.paymentMethod === 'credito';
        const partialCredit = toCancel.creditApplied || 0;
        const slotType = toCancel.slotType;
        all[idx].status = 'cancelled';
        all[idx].cancelledAt = new Date().toISOString();
        all[idx].paid = false;
        all[idx].paymentMethod = null;
        all[idx].paidAt = null;
        all[idx].creditApplied = 0;
        this.replaceAllBookings(all);
        // Rimborso credito: intero se pagato con credito, parziale se creditApplied > 0
        const creditToRefund = wasPaidWithCredit
            ? (SLOT_PRICES[slotType] || 0)
            : partialCredit;
        if (creditToRefund > 0) {
            CreditStorage.addCredit(
                toCancel.whatsapp,
                toCancel.email,
                toCancel.name,
                creditToRefund,
                `Rimborso annullamento ${toCancel.date} ${toCancel.time}`
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
            const startTime = b.time.split(' - ')[0].trim();
            const lessonStart = new Date(`${b.date}T${startTime}:00`);
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

        localStorage.setItem(this.STATS_KEY, JSON.stringify(stats));
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
        const overrides = JSON.parse(localStorage.getItem('scheduleOverrides') || '{}');
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
        if (changed) localStorage.setItem('scheduleOverrides', JSON.stringify(overrides));
    }

    static initializeDemoData() {
        // Always populate current + next week calendar — works even for new browsers
        this._ensureWeekOverrides();

        // Skip demo bookings if user explicitly cleared all data
        if (localStorage.getItem('dataClearedByUser') === 'true') return;

        // Migration check: if existing bookings use old time slot format, regenerate
        const existing = this.getAllBookings();
        if (existing.length > 0) {
            const hasOutdatedSlots = existing.some(b => !TIME_SLOTS.includes(b.time));
            if (hasOutdatedSlots) {
                localStorage.removeItem(this.BOOKINGS_KEY);
                localStorage.removeItem(this.STATS_KEY);
            } else {
                return; // Data is current, nothing to do
            }
        }

        if (this.getAllBookings().length === 0) {
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

            // Fixed demo range: 1 Jan → 28 Feb 2026 (stable, never grows)
            const start   = new Date(2026, 0, 1);
            const demoEnd = new Date(2026, 1, 28, 23, 59, 59);

            const current = new Date(start);
            while (current <= demoEnd) {
                const dayIndex = current.getDay();
                const dayName  = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'][dayIndex];
                const scheduledSlots = DEFAULT_WEEKLY_SCHEDULE[dayName] || [];
                const dateStr = this.formatDate(current);

                scheduledSlots.forEach(slot => {
                    const capacity = SLOT_MAX_CAPACITY[slot.type];
                    if (capacity === 0) return;

                    // Seed PRNG from date + slot → same browser always gets same data
                    const rand = this._makeSeededRand(dateStr + '|' + slot.time);

                    // Fill 60-100% of capacity
                    const fillCount = Math.max(1, Math.round(capacity * (0.6 + rand() * 0.4)));
                    const shuffled  = this._shuffle([...Array(clients.length).keys()], rand);
                    const selected  = shuffled.slice(0, Math.min(fillCount, capacity));

                    const [endH, endM] = slot.time.split(' - ')[1].split(':').map(Number);
                    const endDateTime  = new Date(current);
                    endDateTime.setHours(endH, endM, 0, 0);

                    selected.forEach(idx => {
                        const client = clients[idx];

                        // All demo slots are historical → treat as past
                        const paid = rand() < 0.97;

                        // Payment method: 60% contanti, 25% carta, 15% iban
                        const methodRoll    = rand();
                        const paymentMethod = paid
                            ? (methodRoll < 0.60 ? 'contanti' : methodRoll < 0.85 ? 'carta' : 'iban')
                            : undefined;

                        // paidAt: deterministic delay 0-72 h after slot end, capped at demoEnd
                        let paidAt;
                        if (paid) {
                            const paidDate = new Date(endDateTime.getTime() + rand() * 72 * 3600000);
                            if (paidDate > demoEnd) paidDate.setTime(demoEnd.getTime());
                            paidAt = paidDate.toISOString();
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
            localStorage.setItem(this.BOOKINGS_KEY, JSON.stringify(demoBookings));

            // Recalculate stats from scratch
            const stats = { totalBookings: 0, totalRevenue: 0, typeDistribution: {}, dailyBookings: {} };
            demoBookings.forEach(b => {
                stats.totalBookings++;
                stats.totalRevenue += SLOT_PRICES[b.slotType];
                stats.typeDistribution[b.slotType] = (stats.typeDistribution[b.slotType] || 0) + 1;
                stats.dailyBookings[b.date] = (stats.dailyBookings[b.date] || 0) + 1;
            });
            localStorage.setItem(this.STATS_KEY, JSON.stringify(stats));
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
        localStorage.setItem('scheduleOverrides', JSON.stringify(overrides));
    }

    // Sostituisce l'intero array di prenotazioni (usato dopo modifiche bulk)
    static replaceAllBookings(bookings) {
        localStorage.setItem(this.BOOKINGS_KEY, JSON.stringify(bookings));
    }
}

// Credit storage — tracks per-client credit balance
class CreditStorage {
    static CREDITS_KEY = 'gym_credits';

    static _getAll() {
        try { return JSON.parse(localStorage.getItem(this.CREDITS_KEY) || '{}'); } catch { return {}; }
    }

    static _save(data) {
        localStorage.setItem(this.CREDITS_KEY, JSON.stringify(data));
    }

    static _key(whatsapp, email) {
        return `${whatsapp}||${email}`;
    }

    // Strip +39 / 0039 prefix and non-digit chars so numbers can be compared without prefix
    static _normalizePhone(phone) {
        if (!phone) return '';
        return phone.replace(/^\+39\s*/, '').replace(/^0039\s*/, '').replace(/[\s\-(). ]/g, '');
    }

    // Check if a stored record matches the given contact: phone OR email
    static _matchContact(record, whatsapp, email) {
        const normStored = this._normalizePhone(record.whatsapp);
        const normInput  = this._normalizePhone(whatsapp);
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

    static addCredit(whatsapp, email, name, amount, note = '') {
        if (amount === 0) return;
        const all = this._getAll();
        let key = this._findKey(whatsapp, email);
        if (!key) key = this._key(whatsapp, email);
        if (!all[key]) all[key] = { name, whatsapp, email, balance: 0, history: [] };
        all[key].name = name;
        all[key].balance = Math.round((all[key].balance + amount) * 100) / 100;
        all[key].history.push({ date: new Date().toISOString(), amount, note });
        this._save(all);
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

    // Auto-pay unpaid bookings (past and future) for this client using available credit
    static applyToUnpaidBookings(whatsapp, email, name) {
        let balance = this.getBalance(whatsapp, email);
        if (balance <= 0) return false;

        const normWhatsapp = this._normalizePhone(whatsapp);
        const allBookings = BookingStorage.getAllBookings();
        const now = new Date().toISOString();
        let totalApplied = 0;
        let count = 0;

        allBookings
            .filter(b => {
                const normB      = CreditStorage._normalizePhone(b.whatsapp);
                const phoneMatch = normWhatsapp && normB && normB === normWhatsapp;
                const emailMatch = email && b.email && b.email.toLowerCase() === email.toLowerCase();
                return (phoneMatch || emailMatch) && !b.paid && b.status !== 'cancelled' && b.status !== 'cancellation_requested';
            })
            .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
            .forEach(b => {
                const price = SLOT_PRICES[b.slotType];
                const alreadyApplied = b.creditApplied || 0;
                const remaining = price - alreadyApplied;
                if (balance >= remaining) {
                    // Fully cover the remaining amount
                    b.paid = true;
                    b.paymentMethod = 'credito';
                    b.paidAt = now;
                    b.creditApplied = 0; // absorbed into paid
                    balance -= remaining;
                    totalApplied += remaining;
                    count++;
                } else if (balance > 0 && alreadyApplied === 0) {
                    // Partial payment on a booking with no credit yet
                    b.creditApplied = Math.round(balance * 100) / 100;
                    totalApplied += balance;
                    balance = 0;
                }
            });

        if (totalApplied > 0) {
            BookingStorage.replaceAllBookings(allBookings);
            this.addCredit(whatsapp, email, name, -totalApplied,
                `Auto-pagamento ${count} lezione${count > 1 ? 'i' : ''} con credito`);
        }

        return totalApplied > 0;
    }
}

// Initialize demo data on load
if (typeof window !== 'undefined') {
    BookingStorage.initializeDemoData();
    // Process pending cancellations on every page load:
    // if nobody booked the slot and 2h before the lesson have passed,
    // the booking is automatically restored to 'confirmed'.
    document.addEventListener('DOMContentLoaded', () => {
        BookingStorage.processPendingCancellations();
    });
}
