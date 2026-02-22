// Admin dashboard functionality

const ADMIN_PASSWORD = 'admin123'; // In production, use proper authentication
let adminWeekOffset = 0;
let selectedAdminDay = null;

// Analytics filter state
let currentFilter = 'this-month';
let customFilterFrom = null;
let customFilterTo = null;

function getFilterDateRange(filter) {
    const now = new Date();
    switch (filter) {
        case 'this-month':
            return {
                from: new Date(now.getFullYear(), now.getMonth(), 1),
                to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
            };
        case 'last-month': {
            const lm = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
            const ly = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
            return {
                from: new Date(ly, lm, 1),
                to: new Date(ly, lm + 1, 0, 23, 59, 59, 999)
            };
        }
        case 'this-year':
            return {
                from: new Date(now.getFullYear(), 0, 1),
                to: new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999)
            };
        case 'last-year':
            return {
                from: new Date(now.getFullYear() - 1, 0, 1),
                to: new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999)
            };
        case 'custom':
            return {
                from: customFilterFrom ? new Date(customFilterFrom + 'T00:00:00') : new Date(now.getFullYear(), now.getMonth(), 1),
                to: customFilterTo ? new Date(customFilterTo + 'T23:59:59') : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
            };
        default:
            return {
                from: new Date(now.getFullYear(), now.getMonth(), 1),
                to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
            };
    }
}

function getPreviousFilterDateRange(filter) {
    const now = new Date();
    switch (filter) {
        case 'this-month': {
            const lm = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
            const ly = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
            return { from: new Date(ly, lm, 1), to: new Date(ly, lm + 1, 0, 23, 59, 59, 999) };
        }
        case 'last-month': {
            const m2 = ((now.getMonth() - 2) % 12 + 12) % 12;
            const y2 = now.getMonth() <= 1 ? now.getFullYear() - 1 : now.getFullYear();
            return { from: new Date(y2, m2, 1), to: new Date(y2, m2 + 1, 0, 23, 59, 59, 999) };
        }
        case 'this-year':
            return { from: new Date(now.getFullYear() - 1, 0, 1), to: new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999) };
        case 'last-year':
            return { from: new Date(now.getFullYear() - 2, 0, 1), to: new Date(now.getFullYear() - 2, 11, 31, 23, 59, 59, 999) };
        default:
            return null;
    }
}

function getFilteredBookings(filter) {
    const allBookings = BookingStorage.getAllBookings();
    const { from, to } = getFilterDateRange(filter);
    return allBookings.filter(b => {
        const d = new Date(b.date + 'T00:00:00');
        return d >= from && d <= to;
    });
}

function getFilterLabel(filter) {
    const now = new Date();
    const months = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
    switch (filter) {
        case 'this-month': return `${months[now.getMonth()]} ${now.getFullYear()}`;
        case 'last-month': {
            const lm = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
            const ly = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
            return `${months[lm]} ${ly}`;
        }
        case 'this-year': return `${now.getFullYear()}`;
        case 'last-year': return `${now.getFullYear() - 1}`;
        case 'custom':
            return customFilterFrom && customFilterTo ? `${customFilterFrom} → ${customFilterTo}` : 'Personalizzato';
        default: return '';
    }
}

function setAnalyticsFilter(filter, btn) {
    currentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const customDates = document.getElementById('filterCustomDates');
    if (filter === 'custom') {
        customDates.style.display = 'flex';
        if (!customFilterFrom) {
            const now = new Date();
            customFilterFrom = formatAdminDate(new Date(now.getFullYear(), now.getMonth(), 1));
            customFilterTo = formatAdminDate(now);
            document.getElementById('filterDateFrom').value = customFilterFrom;
            document.getElementById('filterDateTo').value = customFilterTo;
        }
        return; // wait for "Applica"
    } else {
        customDates.style.display = 'none';
    }
    loadDashboardData();
}

function applyCustomFilter() {
    const from = document.getElementById('filterDateFrom').value;
    const to = document.getElementById('filterDateTo').value;
    if (!from || !to) { alert('Seleziona entrambe le date.'); return; }
    if (from > to) { alert('La data di inizio deve essere precedente alla data di fine.'); return; }
    customFilterFrom = from;
    customFilterTo = to;
    loadDashboardData();
}

function initAdmin() {
    setupLogin();
    checkAuth();

    // Close search dropdown when clicking outside
    document.addEventListener('click', (e) => {
        const search = document.querySelector('.payment-search');
        if (search && !search.contains(e.target)) {
            closeSearchDropdown();
        }
    });
}

function setupLogin() {
    const loginForm = document.getElementById('loginForm');
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const password = document.getElementById('adminPassword').value;

        if (password === ADMIN_PASSWORD) {
            sessionStorage.setItem('adminAuth', 'true');
            showDashboard();
        } else {
            alert('Password errata!');
        }
    });

    const logoutBtn = document.getElementById('logoutBtn');
    logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        sessionStorage.removeItem('adminAuth');
        hideDashboard();
    });
}

function checkAuth() {
    if (sessionStorage.getItem('adminAuth') === 'true') {
        showDashboard();
    }
}

function showDashboard() {
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('dashboardSection').style.display = 'block';
    setupTabs();
    setupAdminCalendar();
    setupScheduleManager();
    // Don't draw charts on initial load (analytics tab is hidden, canvas.offsetWidth = 0)
    updateNonChartData();
}

// Tab Management
function setupTabs() {
    const tabs = document.querySelectorAll('.admin-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            switchTab(tabName);
        });
    });
}

function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.tab === tabName) {
            tab.classList.add('active');
        }
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`tab-${tabName}`).classList.add('active');

    // Load specific data based on tab
    if (tabName === 'analytics') {
        // Delay so browser can layout the tab (canvas needs offsetWidth > 0)
        setTimeout(() => loadDashboardData(), 50);
    } else if (tabName === 'bookings') {
        renderAdminCalendar();
    } else if (tabName === 'payments') {
        renderPaymentsTab();
    } else if (tabName === 'schedule') {
        renderScheduleManager();
    }
}

function hideDashboard() {
    document.getElementById('loginSection').style.display = 'flex';
    document.getElementById('dashboardSection').style.display = 'none';
}

// Updates only DOM-based elements (no canvas) — safe to call when analytics tab is hidden
function updateNonChartData() {
    const allBookings = BookingStorage.getAllBookings();
    const filteredBookings = getFilteredBookings(currentFilter);
    updateStatsCards(filteredBookings, allBookings);
    updateBookingsTable(filteredBookings);
    updatePopularTimes(filteredBookings);
}

function loadDashboardData() {
    const allBookings = BookingStorage.getAllBookings();
    const filteredBookings = getFilteredBookings(currentFilter);

    updateStatsCards(filteredBookings, allBookings);
    drawBookingsChart(filteredBookings);
    drawTypeChart(filteredBookings);
    updateBookingsTable(filteredBookings);
    updatePopularTimes(filteredBookings);
}

function updateStatsCards(filteredBookings, allBookings) {
    const filterLabel = getFilterLabel(currentFilter);
    const prevRange = getPreviousFilterDateRange(currentFilter);

    function calcChange(current, prev, el) {
        if (prevRange && currentFilter !== 'custom' && prev > 0) {
            const pct = Math.round(((current - prev) / prev) * 100);
            el.textContent = `${pct >= 0 ? '+' : ''}${pct}% vs periodo prec.`;
            el.className = pct >= 0 ? 'stat-change positive' : 'stat-change negative';
        } else {
            el.textContent = filterLabel;
            el.className = 'stat-change';
        }
    }

    // Revenue
    const revenue = filteredBookings.reduce((t, b) => t + (SLOT_PRICES[b.slotType] || 0), 0);
    document.getElementById('monthlyRevenue').textContent = `€${revenue}`;
    const prevRevBookings = prevRange ? allBookings.filter(b => {
        const d = new Date(b.date + 'T00:00:00');
        return d >= prevRange.from && d <= prevRange.to;
    }) : [];
    const prevRev = prevRevBookings.reduce((t, b) => t + (SLOT_PRICES[b.slotType] || 0), 0);
    calcChange(revenue, prevRev, document.getElementById('revenueChange'));

    // Total bookings
    document.getElementById('totalBookings').textContent = filteredBookings.length;
    calcChange(filteredBookings.length, prevRevBookings.length, document.getElementById('bookingsChange'));

    // Active clients
    const uniqueClients = new Set(filteredBookings.map(b => b.email)).size;
    document.getElementById('activeClients').textContent = uniqueClients;
    const clientsChangeEl = document.getElementById('clientsChange');
    clientsChangeEl.textContent = filterLabel;
    clientsChangeEl.className = 'stat-change';

    // Occupancy rate over the filter period
    const { from, to } = getFilterDateRange(currentFilter);
    let totalSlots = 0;
    const cur = new Date(from); cur.setHours(0, 0, 0, 0);
    const end = new Date(to); end.setHours(23, 59, 59, 999);
    const dayNames = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
    while (cur <= end) {
        const slots = WEEKLY_SCHEDULE_TEMPLATE[dayNames[cur.getDay()]] || [];
        slots.forEach(s => totalSlots += SLOT_MAX_CAPACITY[s.type] || 0);
        cur.setDate(cur.getDate() + 1);
    }
    const occupancyRate = totalSlots > 0 ? Math.round((filteredBookings.length / totalSlots) * 100) : 0;
    document.getElementById('occupancyRate').textContent = `${occupancyRate}%`;
    const occEl = document.getElementById('occupancyChange');
    occEl.textContent = filterLabel;
    occEl.className = occupancyRate > 50 ? 'stat-change positive' : 'stat-change';
}

function calculateTotalWeeklySlots() {
    let total = 0;
    Object.values(WEEKLY_SCHEDULE_TEMPLATE).forEach(daySlots => {
        daySlots.forEach(slot => {
            total += SLOT_MAX_CAPACITY[slot.type] || 0;
        });
    });
    return total;
}

function drawBookingsChart(filteredBookings) {
    const canvas = document.getElementById('bookingsChart');
    const chart = new SimpleChart(canvas);

    const { from, to } = getFilterDateRange(currentFilter);
    const diffDays = Math.round((to - from) / (1000 * 60 * 60 * 24));
    const useMonthly = diffDays > 60;

    let labels = [];
    let values = [];

    if (useMonthly) {
        const monthNames = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
        const sy = from.getFullYear(), sm = from.getMonth();
        const ey = to.getFullYear(), em = to.getMonth();
        for (let y = sy; y <= ey; y++) {
            const mStart = (y === sy) ? sm : 0;
            const mEnd = (y === ey) ? em : 11;
            for (let m = mStart; m <= mEnd; m++) {
                labels.push(monthNames[m]);
                values.push(filteredBookings.filter(b => {
                    const d = new Date(b.date + 'T00:00:00');
                    return d.getFullYear() === y && d.getMonth() === m;
                }).length);
            }
        }
    } else {
        const cur = new Date(from); cur.setHours(0, 0, 0, 0);
        const end = new Date(to); end.setHours(23, 59, 59);
        while (cur <= end) {
            const dateStr = formatAdminDate(cur);
            labels.push(`${cur.getDate()}`);
            values.push(filteredBookings.filter(b => b.date === dateStr).length);
            cur.setDate(cur.getDate() + 1);
        }
    }

    // Thin out labels if too many to avoid overlap
    const maxLabels = 12;
    if (labels.length > maxLabels) {
        const step = Math.ceil(labels.length / maxLabels);
        labels = labels.map((l, i) => i % step === 0 ? l : '');
    }

    chart.drawLineChart({ labels, values }, { color: '#e63946' });
}

function drawTypeChart(filteredBookings) {
    const canvas = document.getElementById('typeChart');
    const chart = new SimpleChart(canvas);

    const distribution = {};
    filteredBookings.forEach(b => {
        distribution[b.slotType] = (distribution[b.slotType] || 0) + 1;
    });

    chart.drawPieChart({
        labels: ['Autonomia', 'Lezione di Gruppo', 'Slot prenotato'],
        values: [
            distribution[SLOT_TYPES.PERSONAL] || 0,
            distribution[SLOT_TYPES.SMALL_GROUP] || 0,
            distribution[SLOT_TYPES.GROUP_CLASS] || 0
        ]
    }, {
        colors: ['#22c55e', '#fbbf24', '#ef4444']
    });
}

function updateBookingsTable(bookings) {
    const tbody = document.getElementById('bookingsTableBody');
    tbody.innerHTML = '';

    // Sort by booking date (most recent first)
    const sortedBookings = [...bookings].sort((a, b) => {
        if (b.date !== a.date) return b.date.localeCompare(a.date);
        return b.time.localeCompare(a.time);
    }).slice(0, 15);

    if (sortedBookings.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #999;">Nessuna prenotazione nel periodo selezionato</td></tr>';
        return;
    }

    sortedBookings.forEach(booking => {
        const row = document.createElement('tr');
        const [y, m, d] = booking.date.split('-').map(Number);
        const dateDisplay = `${d}/${m}/${y}`;

        row.innerHTML = `
            <td>${dateDisplay}</td>
            <td>${booking.time}</td>
            <td>${booking.name}</td>
            <td>${SLOT_NAMES[booking.slotType]}</td>
            <td>${booking.whatsapp}</td>
            <td><span class="status-badge ${booking.status}">${booking.status === 'confirmed' ? 'Confermata' : 'In attesa'}</span></td>
        `;
        tbody.appendChild(row);
    });
}

function updatePopularTimes(bookings) {
    const timeCounts = {};

    // Count bookings per time slot
    bookings.forEach(booking => {
        timeCounts[booking.time] = (timeCounts[booking.time] || 0) + 1;
    });

    // Sort by popularity
    const sortedTimes = Object.entries(timeCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    const container = document.getElementById('popularTimes');
    container.innerHTML = '';

    if (sortedTimes.length === 0) {
        container.innerHTML = '<p style="color: #999;">Nessun dato disponibile</p>';
        return;
    }

    const maxCount = sortedTimes[0][1];

    sortedTimes.forEach(([time, count]) => {
        const percentage = (count / maxCount) * 100;

        const barHTML = `
            <div class="time-bar">
                <div class="time-label">${time}</div>
                <div class="time-progress">
                    <div class="time-progress-fill" style="width: ${percentage}%">
                        ${count} prenotazioni
                    </div>
                </div>
            </div>
        `;
        container.innerHTML += barHTML;
    });
}

// Action buttons
function exportData() {
    const bookings = BookingStorage.getAllBookings();
    const dataStr = JSON.stringify(bookings, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });

    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bookings-export-${new Date().toISOString().split('T')[0]}.json`;
    link.click();

    alert('Dati esportati con successo!');
}

function sendReminders() {
    const bookings = BookingStorage.getAllBookings();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = BookingStorage.formatDate(tomorrow);

    const tomorrowBookings = bookings.filter(b => b.date === tomorrowStr);

    if (tomorrowBookings.length === 0) {
        alert('Nessuna prenotazione per domani.');
        return;
    }

    console.log('📱 Invio promemoria WhatsApp per:', tomorrowBookings);
    alert(`${tomorrowBookings.length} promemoria WhatsApp programmati per essere inviati!`);
}

function viewRevenue() {
    const stats = BookingStorage.getStats();
    const bookings = BookingStorage.getAllBookings();

    let message = '💰 DETTAGLIO FATTURATO\n\n';
    message += `Fatturato totale: €${stats.totalRevenue || 0}\n`;
    message += `Numero prenotazioni: ${bookings.length}\n\n`;
    message += 'Per tipo:\n';

    Object.entries(stats.typeDistribution || {}).forEach(([type, count]) => {
        const revenue = count * SLOT_PRICES[type];
        message += `- ${SLOT_NAMES[type]}: ${count} x €${SLOT_PRICES[type]} = €${revenue}\n`;
    });

    alert(message);
}

function resetDemoData() {
    if (confirm('⚠️ ATTENZIONE: Questo cancellerà tutti i dati esistenti e genererà nuovi dati demo da Gennaio 2026 ad oggi. Continuare?')) {
        localStorage.removeItem(BookingStorage.BOOKINGS_KEY);
        localStorage.removeItem(BookingStorage.STATS_KEY);
        localStorage.removeItem('scheduleOverrides');
        localStorage.removeItem('dataClearedByUser');
        BookingStorage.initializeDemoData();
        alert('✅ Dati demo rigenerati con successo!');
        location.reload();
    }
}

function clearAllData() {
    if (confirm('⚠️ ATTENZIONE: Questo eliminerà definitivamente tutte le prenotazioni e i dati. NON verranno generati nuovi dati demo. Continuare?')) {
        localStorage.removeItem(BookingStorage.BOOKINGS_KEY);
        localStorage.removeItem(BookingStorage.STATS_KEY);
        localStorage.removeItem('scheduleOverrides');
        localStorage.setItem('dataClearedByUser', 'true');
        alert('✅ Tutti i dati sono stati eliminati.');
        location.reload();
    }
}

// Admin Calendar Functions
function setupAdminCalendar() {
    renderAdminCalendar();

    document.getElementById('adminPrevWeek').addEventListener('click', () => {
        adminWeekOffset--;
        renderAdminCalendar();
    });

    document.getElementById('adminNextWeek').addEventListener('click', () => {
        adminWeekOffset++;
        renderAdminCalendar();
    });
}

function getAdminWeekDates(offset = 0) {
    const today = new Date();
    const currentDay = today.getDay();
    const diff = currentDay === 0 ? -6 : 1 - currentDay;

    const monday = new Date(today);
    monday.setDate(today.getDate() + diff + (offset * 7));

    const dates = [];
    const dayNames = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];

    for (let i = 0; i < 7; i++) {
        const date = new Date(monday);
        date.setDate(monday.getDate() + i);
        dates.push({
            date: date,
            dayName: dayNames[i],
            formatted: formatAdminDate(date),
            displayDate: `${date.getDate()}/${date.getMonth() + 1}`
        });
    }

    return dates;
}

function formatAdminDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function renderAdminCalendar() {
    const weekDates = getAdminWeekDates(adminWeekOffset);

    // Select today by default (first load), or keep current selection
    if (!selectedAdminDay) {
        const todayFormatted = formatAdminDate(new Date());
        selectedAdminDay = weekDates.find(d => d.formatted === todayFormatted) || weekDates[0];
    } else {
        // Update selected day if it's in the new week
        const matchingDay = weekDates.find(d => d.formatted === selectedAdminDay.formatted);
        selectedAdminDay = matchingDay || weekDates[0];
    }

    renderAdminDaySelector(weekDates);
    renderAdminDayView(selectedAdminDay);

    // Update week display
    const firstDate = weekDates[0].date;
    const lastDate = weekDates[6].date;
    document.getElementById('adminCurrentWeek').textContent =
        `${firstDate.getDate()}/${firstDate.getMonth() + 1} - ${lastDate.getDate()}/${lastDate.getMonth() + 1}/${lastDate.getFullYear()}`;
}

function renderAdminDaySelector(weekDates) {
    const selector = document.getElementById('adminDaySelector');
    selector.innerHTML = '';

    weekDates.forEach(dateInfo => {
        const bookings = BookingStorage.getAllBookings();
        const dayBookingsCount = bookings.filter(b => b.date === dateInfo.formatted).length;

        const dayCard = document.createElement('div');
        dayCard.className = 'admin-day-card';

        if (selectedAdminDay && selectedAdminDay.formatted === dateInfo.formatted) {
            dayCard.classList.add('active');
        }

        dayCard.innerHTML = `
            <div class="admin-day-name">${dateInfo.dayName}</div>
            <div class="admin-day-date">${dateInfo.date.getDate()}</div>
            <div class="admin-day-count">${dayBookingsCount} prenotazioni</div>
        `;

        dayCard.addEventListener('click', () => {
            selectedAdminDay = dateInfo;
            document.querySelectorAll('.admin-day-card').forEach(card => card.classList.remove('active'));
            dayCard.classList.add('active');
            renderAdminDayView(dateInfo);
        });

        selector.appendChild(dayCard);
    });
}

function renderAdminDayView(dateInfo) {
    const dayView = document.getElementById('adminDayView');
    dayView.innerHTML = '';

    // Check for date-specific overrides first
    const overrides = JSON.parse(localStorage.getItem('scheduleOverrides') || '{}');
    let scheduledSlots = overrides[dateInfo.formatted];

    // If no override, use weekly template
    if (!scheduledSlots) {
        scheduledSlots = WEEKLY_SCHEDULE_TEMPLATE[dateInfo.dayName] || [];
    }

    if (scheduledSlots.length === 0) {
        dayView.innerHTML = '<div class="empty-slot">Nessuna lezione programmata per questo giorno</div>';
        return;
    }

    scheduledSlots.forEach(scheduledSlot => {
        const slotCard = createAdminSlotCard(dateInfo, scheduledSlot);
        dayView.appendChild(slotCard);
    });
}

function createAdminSlotCard(dateInfo, scheduledSlot) {
    const slotCard = document.createElement('div');
    slotCard.className = `admin-slot-card ${scheduledSlot.type}`;

    const timeSlot = scheduledSlot.time;
    const slotType = scheduledSlot.type;
    const bookings = BookingStorage.getBookingsForSlot(dateInfo.formatted, timeSlot);
    const maxCapacity = SLOT_MAX_CAPACITY[slotType];
    const remainingSpots = maxCapacity - bookings.length;

    let participantsHTML = '';
    if (bookings.length === 0) {
        participantsHTML = '<div class="empty-slot">Nessuna prenotazione</div>';
    } else {
        participantsHTML = '<div class="admin-participants-grid">';
        bookings.forEach((booking, index) => {
            const isPaid = booking.paid || false;
            const checkboxId = `payment-${booking.id}`;

            // Check if this person has unpaid bookings from previous dates
            const unpaidAmount = getUnpaidAmountForContact(booking.whatsapp, booking.email);
            const hasDebts = unpaidAmount > 0;

            participantsHTML += `
                <div class="admin-participant-card">
                    <button class="btn-delete-booking" onclick="deleteBooking('${booking.id}', '${booking.name.replace(/'/g, "\\'")}')">✕</button>
                    <div class="participant-card-content">
                        <div class="participant-name">${booking.name}</div>
                        <div class="participant-contact">📱 ${booking.whatsapp}</div>
                        ${booking.notes ? `<div class="participant-notes">📝 ${booking.notes}</div>` : ''}
                        ${hasDebts ? `<div class="debt-warning">⚠️ Da pagare: €${unpaidAmount}</div>` : ''}
                        <div class="payment-checkbox">
                            <input type="checkbox" id="${checkboxId}" ${isPaid ? 'checked' : ''}
                                   onchange="togglePayment('${booking.id}', this.checked)">
                            <label for="${checkboxId}">${isPaid ? '✓ Pagato' : 'Non pagato'}</label>
                        </div>
                    </div>
                </div>
            `;
        });
        participantsHTML += '</div>';
    }

    slotCard.innerHTML = `
        <div class="admin-slot-header">
            <div class="admin-slot-time">🕐 ${timeSlot}</div>
            <div class="admin-slot-type">${SLOT_NAMES[slotType]}</div>
            <div class="admin-slot-capacity">
                ${bookings.length}/${maxCapacity} posti occupati
                ${remainingSpots === 0 ? '(COMPLETO)' : `(${remainingSpots} liberi)`}
            </div>
        </div>
        ${participantsHTML}
    `;

    return slotCard;
}

// Payment Management
function togglePayment(bookingId, isPaid) {
    const bookings = BookingStorage.getAllBookings();
    const booking = bookings.find(b => b.id === bookingId);

    if (booking) {
        booking.paid = isPaid;
        localStorage.setItem(BookingStorage.BOOKINGS_KEY, JSON.stringify(bookings));

        // Update label text immediately for better UX
        const checkbox = document.getElementById(`payment-${bookingId}`);
        const label = document.querySelector(`label[for="payment-${bookingId}"]`);
        if (label) {
            label.textContent = isPaid ? '✓ Pagato' : 'Non pagato';
        }

        console.log(`Payment status updated for ${booking.name}: ${isPaid ? 'Paid' : 'Unpaid'}`);

        // Re-render the admin calendar to ensure all data is synchronized
        // This prevents bugs with duplicate IDs or stale data
        setTimeout(() => {
            if (selectedAdminDay) {
                renderAdminDayView(selectedAdminDay);
            }
        }, 100);
    }
}

function deleteBooking(bookingId, bookingName) {
    if (!confirm(`Eliminare la prenotazione di ${bookingName}?\n\nQuesta operazione non può essere annullata.`)) {
        return;
    }

    const bookings = BookingStorage.getAllBookings();
    const index = bookings.findIndex(b => b.id === bookingId);

    if (index !== -1) {
        bookings.splice(index, 1);
        localStorage.setItem(BookingStorage.BOOKINGS_KEY, JSON.stringify(bookings));

        // Re-render the calendar view
        if (selectedAdminDay) {
            renderAdminDayView(selectedAdminDay);
        }
    }
}

// Schedule Manager Functions
let scheduleWeekOffset = 0;
let selectedScheduleDate = null;

function setupScheduleManager() {
    renderScheduleManager();
}

function renderScheduleManager() {
    const manager = document.getElementById('scheduleManager');
    if (!manager) return;

    const weekDates = getScheduleWeekDates(scheduleWeekOffset);

    // Week navigation
    const firstDate = weekDates[0].date;
    const lastDate = weekDates[6].date;

    let html = `
        <div class="admin-calendar-controls" style="margin-bottom: 1.5rem;">
            <button class="btn-control" onclick="changeScheduleWeek(-1)">&larr; Settimana Precedente</button>
            <h4>${firstDate.getDate()}/${firstDate.getMonth() + 1} - ${lastDate.getDate()}/${lastDate.getMonth() + 1}/${lastDate.getFullYear()}</h4>
            <button class="btn-control" onclick="changeScheduleWeek(1)">Settimana Successiva &rarr;</button>
        </div>
    `;

    // Day selector tabs with dates
    html += '<div class="schedule-day-tabs">';
    weekDates.forEach(dateInfo => {
        const isActive = selectedScheduleDate && selectedScheduleDate.formatted === dateInfo.formatted ? 'active' : '';
        html += `<button class="schedule-day-tab ${isActive}" onclick="selectScheduleDate('${dateInfo.formatted}', '${dateInfo.dayName}')">
            ${dateInfo.dayName}<br>
            <small>${dateInfo.date.getDate()}/${dateInfo.date.getMonth() + 1}</small>
        </button>`;
    });
    html += '</div>';

    html += '<div id="scheduleDaySlots"></div>';

    manager.innerHTML = html;

    // Select first day if none selected
    if (!selectedScheduleDate) {
        selectedScheduleDate = weekDates[0];
    }

    renderAllTimeSlots();
}

function getScheduleWeekDates(offset = 0) {
    const today = new Date();
    const currentDay = today.getDay();
    const diff = currentDay === 0 ? -6 : 1 - currentDay;

    const monday = new Date(today);
    monday.setDate(today.getDate() + diff + (offset * 7));

    const dates = [];
    const dayNames = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];

    for (let i = 0; i < 7; i++) {
        const date = new Date(monday);
        date.setDate(monday.getDate() + i);
        dates.push({
            date: date,
            dayName: dayNames[i],
            formatted: formatAdminDate(date)
        });
    }

    return dates;
}

function changeScheduleWeek(direction) {
    scheduleWeekOffset += direction;
    selectedScheduleDate = null; // Reset selection
    renderScheduleManager();
}

function selectScheduleDate(dateFormatted, dayName) {
    const weekDates = getScheduleWeekDates(scheduleWeekOffset);
    selectedScheduleDate = weekDates.find(d => d.formatted === dateFormatted);
    renderScheduleManager();
}

// All possible time slots — 80 min each, 05:20 → 21:20
const ALL_TIME_SLOTS = [
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

// Get schedule for a specific date (uses overrides if exist, otherwise template)
function getScheduleForDate(dateFormatted, dayName) {
    // Check if there's a specific override for this date
    const overrides = JSON.parse(localStorage.getItem('scheduleOverrides') || '{}');

    if (overrides[dateFormatted]) {
        return overrides[dateFormatted];
    }

    // Otherwise use the weekly template
    return WEEKLY_SCHEDULE_TEMPLATE[dayName] || [];
}

// Save schedule override for a specific date
function saveScheduleForDate(dateFormatted, dayName, slots) {
    const overrides = JSON.parse(localStorage.getItem('scheduleOverrides') || '{}');

    if (slots.length === 0) {
        // If empty, remove override (will fall back to template)
        delete overrides[dateFormatted];
    } else {
        overrides[dateFormatted] = slots;
    }

    localStorage.setItem('scheduleOverrides', JSON.stringify(overrides));
}

function renderAllTimeSlots() {
    const container = document.getElementById('scheduleDaySlots');
    if (!container || !selectedScheduleDate) return;

    // Get slots for this specific date
    const daySlots = getScheduleForDate(selectedScheduleDate.formatted, selectedScheduleDate.dayName);

    let html = `<p style="color: #666; margin-bottom: 1rem;">
        <strong>Giorno:</strong> ${selectedScheduleDate.dayName} ${selectedScheduleDate.date.getDate()}/${selectedScheduleDate.date.getMonth() + 1}/${selectedScheduleDate.date.getFullYear()}
    </p>`;

    html += '<div class="schedule-slots-list">';

    ALL_TIME_SLOTS.forEach(timeSlot => {
        // Find if this time slot already has a lesson assigned
        const existingSlot = daySlots.find(slot => slot.time === timeSlot);
        const currentType = existingSlot ? existingSlot.type : '';

        html += `
            <div class="schedule-slot-item-selector">
                <div class="schedule-slot-time">🕐 ${timeSlot}</div>
                <div class="schedule-slot-dropdown">
                    <select onchange="updateSlotType('${timeSlot}', this.value)" class="slot-type-select">
                        <option value="">-- Nessuna lezione --</option>
                        <option value="${SLOT_TYPES.PERSONAL}" ${currentType === SLOT_TYPES.PERSONAL ? 'selected' : ''}>Autonomia</option>
                        <option value="${SLOT_TYPES.SMALL_GROUP}" ${currentType === SLOT_TYPES.SMALL_GROUP ? 'selected' : ''}>Lezione di Gruppo</option>
                        <option value="${SLOT_TYPES.GROUP_CLASS}" ${currentType === SLOT_TYPES.GROUP_CLASS ? 'selected' : ''}>Slot prenotato</option>
                    </select>
                </div>
                ${currentType ? `<div class="current-type-badge ${currentType}">${SLOT_NAMES[currentType]}</div>` : ''}
            </div>
        `;
    });

    html += '</div>';

    container.innerHTML = html;
}

function updateSlotType(timeSlot, newType) {
    if (!selectedScheduleDate) return;

    // Get current slots for this date
    let daySlots = getScheduleForDate(selectedScheduleDate.formatted, selectedScheduleDate.dayName);

    // Make a copy to modify
    daySlots = JSON.parse(JSON.stringify(daySlots));

    // Find existing slot
    const existingSlotIndex = daySlots.findIndex(slot => slot.time === timeSlot);

    if (newType === '') {
        // Remove slot if "Nessuna lezione" is selected
        if (existingSlotIndex !== -1) {
            daySlots.splice(existingSlotIndex, 1);
        }
    } else {
        // Add or update slot
        if (existingSlotIndex !== -1) {
            // Update existing slot
            daySlots[existingSlotIndex].type = newType;
        } else {
            // Add new slot
            daySlots.push({
                time: timeSlot,
                type: newType
            });
        }
    }

    // Sort by time
    daySlots.sort((a, b) => a.time.localeCompare(b.time));

    // Save as override for this specific date
    saveScheduleForDate(selectedScheduleDate.formatted, selectedScheduleDate.dayName, daySlots);

    // Refresh display
    renderAllTimeSlots();

    console.log(`Slot ${timeSlot} per ${selectedScheduleDate.formatted} aggiornato: ${newType || 'rimosso'}`);
}

// Payments Management Functions
let debtorsListVisible = false;

function renderPaymentsTab() {
    const debtors = getDebtors();
    const totalUnpaid = debtors.reduce((sum, debtor) => sum + debtor.totalAmount, 0);

    // Update stats
    document.getElementById('totalUnpaid').textContent = `€${totalUnpaid}`;
    document.getElementById('totalDebtors').textContent = debtors.length;

    // Reset search UI and list visibility
    clearSearch();
    debtorsListVisible = false;
    const debtorsList = document.getElementById('debtorsList');
    debtorsList.style.display = 'none';
    document.getElementById('debtorsToggleHint').textContent = '▼ Mostra lista';

    // Render cards but keep hidden
    if (debtors.length === 0) {
        debtorsList.innerHTML = '<div class="empty-slot">Nessun cliente con pagamenti in sospeso! 🎉</div>';
        return;
    }

    debtorsList.innerHTML = '';
    debtors.forEach((debtor, index) => {
        const debtorCard = createDebtorCard(debtor, `main-${index}`);
        debtorsList.appendChild(debtorCard);
    });
}

function toggleDebtorsList() {
    debtorsListVisible = !debtorsListVisible;
    const debtorsList = document.getElementById('debtorsList');
    const hint = document.getElementById('debtorsToggleHint');
    debtorsList.style.display = debtorsListVisible ? 'flex' : 'none';
    hint.textContent = debtorsListVisible ? '▲ Nascondi lista' : '▼ Mostra lista';
}

function getDebtors() {
    const allBookings = BookingStorage.getAllBookings();
    const debtorsMap = {};

    // Group unpaid bookings by contact (whatsapp + email), only past bookings
    allBookings.forEach(booking => {
        if (!booking.paid && bookingHasPassed(booking)) {
            const key = `${booking.whatsapp}-${booking.email}`;

            if (!debtorsMap[key]) {
                debtorsMap[key] = {
                    name: booking.name,
                    whatsapp: booking.whatsapp,
                    email: booking.email,
                    unpaidBookings: [],
                    totalAmount: 0
                };
            }

            const price = SLOT_PRICES[booking.slotType];
            debtorsMap[key].unpaidBookings.push({
                ...booking,
                price: price
            });
            debtorsMap[key].totalAmount += price;
        }
    });

    // Convert to array and sort by totalAmount (descending)
    return Object.values(debtorsMap).sort((a, b) => b.totalAmount - a.totalAmount);
}

function createDebtorCard(debtor, cardId) {
    const card = document.createElement('div');
    card.className = 'debtor-card';
    card.id = `debtor-card-${cardId}`;

    let bookingsHTML = '<div class="debtor-bookings" style="margin-top: 0.75rem;">';
    debtor.unpaidBookings.forEach(booking => {
        bookingsHTML += `
            <div class="debtor-booking-item">
                <div class="debtor-booking-details">
                    📅 ${booking.date} - 🕐 ${booking.time} - ${SLOT_NAMES[booking.slotType]}
                </div>
                <div class="debtor-booking-price">€${booking.price}</div>
                <button class="btn-mark-paid" onclick="markBookingPaid('${booking.id}')">
                    Segna Pagato
                </button>
            </div>
        `;
    });
    bookingsHTML += '</div>';

    card.innerHTML = `
        <div class="debtor-card-header" onclick="toggleDebtorCard('debtor-card-${cardId}')">
            <div class="debtor-info">
                <div class="debtor-name">${debtor.name}</div>
                <div class="debtor-contact">
                    <span>📱 ${debtor.whatsapp}</span>
                    <span>✉️ ${debtor.email}</span>
                </div>
            </div>
            <div class="debtor-amount">
                Da pagare: €${debtor.totalAmount}
            </div>
            <div class="debtor-toggle">▼</div>
        </div>
        <div class="debtor-card-body">
            ${bookingsHTML}
        </div>
    `;

    return card;
}

function toggleDebtorCard(cardId) {
    const card = document.getElementById(cardId);
    if (card) {
        card.classList.toggle('open');
    }
}

function searchDebtor() {
    const query = document.getElementById('debtorSearchInput').value.trim().toLowerCase();
    if (!query) return;

    const debtors = getDebtors();
    const results = debtors.filter(debtor =>
        debtor.name.toLowerCase().includes(query) ||
        debtor.whatsapp.toLowerCase().includes(query) ||
        debtor.email.toLowerCase().includes(query)
    );

    const resultsContainer = document.getElementById('debtorSearchResults');
    const resultsList = document.getElementById('searchResultsList');

    if (results.length === 0) {
        resultsList.innerHTML = '<p style="color: #666; padding: 0.5rem 0;">Nessun risultato trovato.</p>';
    } else {
        resultsList.innerHTML = '';
        results.forEach((debtor, index) => {
            const card = createDebtorCard(debtor, `search-${index}`);
            card.classList.add('open'); // Show expanded in search results
            resultsList.appendChild(card);
        });
    }

    resultsContainer.style.display = 'block';
    resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function clearSearch() {
    const resultsContainer = document.getElementById('debtorSearchResults');
    const searchInput = document.getElementById('debtorSearchInput');
    if (resultsContainer) resultsContainer.style.display = 'none';
    if (searchInput) searchInput.value = '';
    closeSearchDropdown();
}

function closeSearchDropdown() {
    const dropdown = document.getElementById('debtorSearchDropdown');
    if (dropdown) dropdown.style.display = 'none';
}

function liveSearchDebtor() {
    const query = document.getElementById('debtorSearchInput').value.trim().toLowerCase();
    const dropdown = document.getElementById('debtorSearchDropdown');

    if (!query) {
        dropdown.style.display = 'none';
        return;
    }

    const debtors = getDebtors();
    const matches = debtors.filter(d =>
        d.name.toLowerCase().includes(query) ||
        d.whatsapp.toLowerCase().includes(query) ||
        d.email.toLowerCase().includes(query)
    );

    if (matches.length === 0) {
        dropdown.innerHTML = '<div class="dropdown-no-results">Nessun risultato</div>';
    } else {
        dropdown.innerHTML = matches.map((d, i) => `
            <div class="dropdown-item" onclick="selectDebtorFromDropdown(${i}, '${query}')">
                <span class="dropdown-item-name">${d.name}</span>
                <span class="dropdown-item-debt">€${d.totalAmount}</span>
            </div>
        `).join('');
        // Store matches for selection
        dropdown._matches = matches;
    }

    dropdown.style.display = 'block';
}

function selectDebtorFromDropdown(index, query) {
    const dropdown = document.getElementById('debtorSearchDropdown');
    const matches = dropdown._matches;
    if (!matches || !matches[index]) return;

    const debtor = matches[index];
    const resultsContainer = document.getElementById('debtorSearchResults');
    const resultsList = document.getElementById('searchResultsList');

    resultsList.innerHTML = '';
    const card = createDebtorCard(debtor, `search-sel`);
    card.classList.add('open');
    resultsList.appendChild(card);

    resultsContainer.style.display = 'block';
    closeSearchDropdown();

    // Update input to show selected name
    document.getElementById('debtorSearchInput').value = debtor.name;

    resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function markBookingPaid(bookingId) {
    const bookings = BookingStorage.getAllBookings();
    const booking = bookings.find(b => b.id === bookingId);

    if (booking) {
        booking.paid = true;
        localStorage.setItem(BookingStorage.BOOKINGS_KEY, JSON.stringify(bookings));

        // Refresh payments tab
        renderPaymentsTab();

        // Re-run search if it was active
        const searchInput = document.getElementById('debtorSearchInput');
        if (searchInput && searchInput.value.trim()) {
            searchDebtor();
        }

        // Show success message
        alert(`✅ Pagamento registrato per ${booking.name}`);
    }
}

// Returns true if the booking's end time has already passed
function bookingHasPassed(booking) {
    // time format: "HH:MM - HH:MM"
    const endTimePart = booking.time.split(' - ')[1];
    if (!endTimePart || !booking.date) return false;

    const [endHour, endMin] = endTimePart.trim().split(':').map(Number);
    const [year, month, day] = booking.date.split('-').map(Number);

    const endDateTime = new Date(year, month - 1, day, endHour, endMin, 0);
    return new Date() >= endDateTime;
}

// Get unpaid amount for a specific contact (whatsapp + email), only for past bookings
function getUnpaidAmountForContact(whatsapp, email) {
    const allBookings = BookingStorage.getAllBookings();
    let totalUnpaid = 0;

    allBookings.forEach(booking => {
        if (booking.whatsapp === whatsapp && booking.email === email && !booking.paid && bookingHasPassed(booking)) {
            totalUnpaid += SLOT_PRICES[booking.slotType];
        }
    });

    return totalUnpaid;
}

// Initialize admin when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAdmin);
} else {
    initAdmin();
}
