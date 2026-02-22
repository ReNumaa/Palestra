// Mock data storage - In production, this would be a database
const SLOT_TYPES = {
    PERSONAL: 'personal-training',
    SMALL_GROUP: 'small-group',
    GROUP_CLASS: 'group-class'
};

const SLOT_MAX_CAPACITY = {
    'personal-training': 1,
    'small-group': 4,
    'group-class': 5
};

const SLOT_PRICES = {
    'personal-training': 50,
    'small-group': 30,
    'group-class': 20
};

const SLOT_NAMES = {
    'personal-training': 'Allenamento in autonomia',
    'small-group': 'Lezione personal training gruppo',
    'group-class': 'Slot prenotato'
};

// Time slots configuration — 80 min each, 05:20 → 20:00
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
    '18:40 - 20:00'
];

// Default weekly schedule template (used only if no custom schedule exists)
const DEFAULT_WEEKLY_SCHEDULE = {
    'Lunedì': [
        { time: '05:20 - 06:40', type: SLOT_TYPES.PERSONAL },
        { time: '06:40 - 08:00', type: SLOT_TYPES.SMALL_GROUP },
        { time: '08:00 - 09:20', type: SLOT_TYPES.GROUP_CLASS },
        { time: '09:20 - 10:40', type: SLOT_TYPES.PERSONAL },
        { time: '17:20 - 18:40', type: SLOT_TYPES.SMALL_GROUP },
        { time: '18:40 - 20:00', type: SLOT_TYPES.GROUP_CLASS }
    ],
    'Martedì': [
        { time: '05:20 - 06:40', type: SLOT_TYPES.PERSONAL },
        { time: '08:00 - 09:20', type: SLOT_TYPES.GROUP_CLASS },
        { time: '10:40 - 12:00', type: SLOT_TYPES.PERSONAL },
        { time: '17:20 - 18:40', type: SLOT_TYPES.GROUP_CLASS },
        { time: '18:40 - 20:00', type: SLOT_TYPES.SMALL_GROUP }
    ],
    'Mercoledì': [
        { time: '06:40 - 08:00', type: SLOT_TYPES.SMALL_GROUP },
        { time: '08:00 - 09:20', type: SLOT_TYPES.GROUP_CLASS },
        { time: '09:20 - 10:40', type: SLOT_TYPES.PERSONAL },
        { time: '16:00 - 17:20', type: SLOT_TYPES.SMALL_GROUP },
        { time: '17:20 - 18:40', type: SLOT_TYPES.GROUP_CLASS },
        { time: '18:40 - 20:00', type: SLOT_TYPES.GROUP_CLASS }
    ],
    'Giovedì': [
        { time: '05:20 - 06:40', type: SLOT_TYPES.PERSONAL },
        { time: '08:00 - 09:20', type: SLOT_TYPES.GROUP_CLASS },
        { time: '10:40 - 12:00', type: SLOT_TYPES.PERSONAL },
        { time: '17:20 - 18:40', type: SLOT_TYPES.GROUP_CLASS },
        { time: '18:40 - 20:00', type: SLOT_TYPES.SMALL_GROUP }
    ],
    'Venerdì': [
        { time: '06:40 - 08:00', type: SLOT_TYPES.SMALL_GROUP },
        { time: '08:00 - 09:20', type: SLOT_TYPES.GROUP_CLASS },
        { time: '09:20 - 10:40', type: SLOT_TYPES.PERSONAL },
        { time: '16:00 - 17:20', type: SLOT_TYPES.SMALL_GROUP },
        { time: '17:20 - 18:40', type: SLOT_TYPES.GROUP_CLASS },
        { time: '18:40 - 20:00', type: SLOT_TYPES.GROUP_CLASS }
    ],
    'Sabato': [
        { time: '08:00 - 09:20', type: SLOT_TYPES.GROUP_CLASS },
        { time: '09:20 - 10:40', type: SLOT_TYPES.SMALL_GROUP },
        { time: '10:40 - 12:00', type: SLOT_TYPES.GROUP_CLASS },
        { time: '12:00 - 13:20', type: SLOT_TYPES.PERSONAL }
    ],
    'Domenica': []
};

// Function to get the current weekly schedule (from localStorage or default)
function getWeeklySchedule() {
    const saved = localStorage.getItem('weeklyScheduleTemplate');
    if (saved) {
        const parsed = JSON.parse(saved);
        // Migration check: if stored slots don't match current TIME_SLOTS format, reset
        const storedTimes = Object.values(parsed).flat().map(s => s.time);
        const isCurrentFormat = storedTimes.length === 0 || storedTimes.every(t => TIME_SLOTS.includes(t));
        if (isCurrentFormat) {
            return parsed;
        }
        // Outdated slot format detected — clear overrides too
        localStorage.removeItem('scheduleOverrides');
    }
    localStorage.setItem('weeklyScheduleTemplate', JSON.stringify(DEFAULT_WEEKLY_SCHEDULE));
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
        return bookings.filter(b => b.date === date && b.time === time);
    }

    static getRemainingSpots(date, time, slotType) {
        const bookings = this.getBookingsForSlot(date, time);
        const maxCapacity = SLOT_MAX_CAPACITY[slotType];
        return maxCapacity - bookings.length;
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

    static initializeDemoData() {
        // Skip if user explicitly cleared all data
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

            // ~3% of past bookings are unpaid

            const notes = ['', '', '', '', 'Richiesta asciugamano extra', 'Allergia al lattice - usare guanti', 'Prima lezione', ''];

            const demoBookings = [];
            const start = new Date(2026, 0, 1); // 1 Gennaio 2026
            const today = new Date();
            today.setHours(23, 59, 59, 999);

            const current = new Date(start);
            while (current <= today) {
                const dayIndex = current.getDay();
                const dayName = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'][dayIndex];
                const scheduledSlots = DEFAULT_WEEKLY_SCHEDULE[dayName] || [];
                const dateStr = this.formatDate(current);

                scheduledSlots.forEach(slot => {
                    const capacity = SLOT_MAX_CAPACITY[slot.type];
                    // Fill 60-100% of capacity
                    const fillCount = Math.max(1, Math.round(capacity * (0.6 + Math.random() * 0.4)));

                    // Shuffle clients and pick fillCount of them
                    const shuffled = [...clients.keys()].sort(() => Math.random() - 0.5);
                    const selected = shuffled.slice(0, Math.min(fillCount, capacity));

                    // Parse end time (HH:MM) to decide if booking is in the past
                    const endParts = slot.time.split(' - ')[1].split(':').map(Number);
                    const endDateTime = new Date(current);
                    endDateTime.setHours(endParts[0], endParts[1], 0, 0);
                    const isPast = new Date() >= endDateTime;

                    selected.forEach(idx => {
                        const client = clients[idx];
                        const paid = isPast ? (Math.random() < 0.97) : false;
                        demoBookings.push({
                            date: dateStr,
                            time: slot.time,
                            slotType: slot.type,
                            name: client.name,
                            email: client.email,
                            whatsapp: client.whatsapp,
                            notes: notes[Math.floor(Math.random() * notes.length)],
                            paid
                        });
                    });
                });

                current.setDate(current.getDate() + 1);
            }

            demoBookings.forEach(booking => this.saveBooking(booking));
        }
    }

    static formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
}

// Initialize demo data on load
if (typeof window !== 'undefined') {
    BookingStorage.initializeDemoData();
}
