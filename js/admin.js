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
        if (b.status === 'cancelled') return false;
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
    showDashboard();

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
            localStorage.setItem('adminAuthenticated', 'true');
            showDashboard();
        } else {
            alert('Password errata!');
        }
    });
}

function checkAuth() {
    if (sessionStorage.getItem('adminAuth') === 'true' ||
        localStorage.getItem('adminAuthenticated') === 'true') {
        showDashboard();
    }
}

function showDashboard() {
    document.getElementById('dashboardSection').style.display = 'block';
    // Reconcile credits for all clients so unpaid bookings are auto-marked paid
    CreditStorage.getAllWithBalance().forEach(c => {
        CreditStorage.applyToUnpaidBookings(c.whatsapp, c.email, c.name);
    });
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
    } else if (tabName === 'clients') {
        renderClientsTab();
    } else if (tabName === 'schedule') {
        renderScheduleManager();
    }
}

function hideDashboard() {
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
    BookingStorage.processPendingCancellations();
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

function countGroupClassSlots(from, to) {
    const overrides = BookingStorage.getScheduleOverrides();
    const dayNames = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
    let count = 0;
    const cur = new Date(from); cur.setHours(0, 0, 0, 0);
    const end = new Date(to);   end.setHours(23, 59, 59, 999);
    while (cur <= end) {
        const dateStr = formatAdminDate(cur);
        // Use override if explicitly configured, otherwise fall back to the default template
        // (mirrors how initializeDemoData generates bookings)
        const slots = overrides[dateStr] !== undefined
            ? overrides[dateStr]
            : (WEEKLY_SCHEDULE_TEMPLATE[dayNames[cur.getDay()]] || []);
        count += slots.filter(s => s.type === SLOT_TYPES.GROUP_CLASS).length;
        cur.setDate(cur.getDate() + 1);
    }
    return count;
}

function drawTypeChart(filteredBookings) {
    const canvas = document.getElementById('typeChart');
    const chart = new SimpleChart(canvas);

    const distribution = {};
    filteredBookings.forEach(b => {
        distribution[b.slotType] = (distribution[b.slotType] || 0) + 1;
    });

    const { from, to } = getFilterDateRange(currentFilter);
    const groupClassCount = countGroupClassSlots(from, to);

    chart.drawPieChart({
        labels: ['Autonomia', 'Lezione di Gruppo', 'Slot prenotato'],
        values: [
            distribution[SLOT_TYPES.PERSONAL] || 0,
            distribution[SLOT_TYPES.SMALL_GROUP] || 0,
            groupClassCount
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
            <td><span class="status-badge ${booking.status}">${
                booking.status === 'confirmed'              ? 'Confermata'            :
                booking.status === 'cancellation_requested' ? 'Richiesta annullamento' :
                booking.status === 'cancelled'              ? 'Annullata'              :
                'In attesa'
            }</span></td>
        `;
        tbody.appendChild(row);
    });
}

function updatePopularTimes(bookings) {
    const timeCounts = {};

    bookings.forEach(booking => {
        timeCounts[booking.time] = (timeCounts[booking.time] || 0) + 1;
    });

    const allSorted = Object.entries(timeCounts).sort((a, b) => b[1] - a[1]);
    const popularContainer = document.getElementById('popularTimes');
    const unpopularContainer = document.getElementById('unpopularTimes');
    popularContainer.innerHTML = '';
    unpopularContainer.innerHTML = '';

    if (allSorted.length === 0) {
        popularContainer.innerHTML = '<p style="color: #999;">Nessun dato disponibile</p>';
        unpopularContainer.innerHTML = '<p style="color: #999;">Nessun dato disponibile</p>';
        return;
    }

    const top5 = allSorted.slice(0, 5);
    const bottom5 = [...allSorted].reverse().slice(0, 5);

    // Each card scales to its own local max so bars vary properly within each list
    const maxPopular = top5[0][1];
    const maxUnpopular = bottom5[bottom5.length - 1][1] || 1;

    top5.forEach(([time, count]) => {
        const percentage = (count / maxPopular) * 100;
        popularContainer.innerHTML += `
            <div class="time-bar">
                <div class="time-label">${time}</div>
                <div class="time-progress">
                    <div class="time-progress-fill" style="width: ${percentage}%">
                        ${count} pren.
                    </div>
                </div>
            </div>`;
    });

    bottom5.forEach(([time, count]) => {
        const percentage = (count / maxUnpopular) * 100;
        unpopularContainer.innerHTML += `
            <div class="time-bar">
                <div class="time-label">${time}</div>
                <div class="time-progress">
                    <div class="time-progress-fill time-progress-fill--low" style="width: ${percentage}%">
                        ${count} pren.
                    </div>
                </div>
            </div>`;
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
        localStorage.removeItem(CreditStorage.CREDITS_KEY);
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
        localStorage.removeItem(CreditStorage.CREDITS_KEY);
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
        const dayBookingsCount = bookings.filter(b => b.date === dateInfo.formatted && b.status !== 'cancelled').length;

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
    BookingStorage.processPendingCancellations();
    const dayView = document.getElementById('adminDayView');
    dayView.innerHTML = '';

    const scheduledSlots = getScheduleForDate(dateInfo.formatted, dateInfo.dayName);

    if (scheduledSlots.length === 0) {
        dayView.innerHTML = '<div class="empty-slot">Nessuna lezione programmata per questo giorno</div>';
        return;
    }

    // Auto-apply any available credit for each unique contact with bookings on this day
    const dayBookings = BookingStorage.getAllBookings().filter(b => b.date === dateInfo.formatted);
    const seen = new Set();
    dayBookings.forEach(b => {
        const contactKey = `${b.whatsapp}|${b.email}`;
        if (!seen.has(contactKey)) {
            seen.add(contactKey);
            CreditStorage.applyToUnpaidBookings(b.whatsapp, b.email, b.name);
        }
    });

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
    const confirmedCount = bookings.filter(b => b.status === 'confirmed').length;
    const remainingSpots = maxCapacity - confirmedCount;

    let participantsHTML = '';
    if (bookings.length === 0) {
        participantsHTML = '<div class="empty-slot">Nessuna prenotazione</div>';
    } else {
        participantsHTML = '<div class="admin-participants-grid">';
        bookings.forEach((booking) => {
            const isPaid = booking.paid || false;
            const isCancelPending = booking.status === 'cancellation_requested';

            // Show debt warning for OTHER unpaid bookings even if this one is paid,
            // so the admin can see there are still outstanding debts for this person.
            const unpaidAmount = getUnpaidAmountForContact(booking.whatsapp, booking.email);
            const hasDebts = unpaidAmount > 0;

            const cancelPendingBadge = isCancelPending
                ? `<div class="admin-cancel-pending-badge">⏳ Annullamento richiesto</div>`
                : '';

            participantsHTML += `
                <div class="admin-participant-card${isCancelPending ? ' cancel-pending' : ''}">
                    <button class="btn-delete-booking" onclick="deleteBooking('${booking.id}', '${booking.name.replace(/'/g, "\\'")}')">✕</button>
                    <div class="participant-card-content">
                        <div class="participant-name">${booking.name}</div>
                        <div class="participant-contact">📱 ${booking.whatsapp}</div>
                        ${booking.notes ? `<div class="participant-notes">📝 ${booking.notes}</div>` : ''}
                        ${cancelPendingBadge}
                        ${hasDebts ? `<div class="debt-warning" onclick="openDebtPopup('${booking.whatsapp.replace(/'/g, "\\'")}', '${booking.email.replace(/'/g, "\\'")}', '${booking.name.replace(/'/g, "\\'")}')">⚠️ Da pagare: €${unpaidAmount}</div>` : ''}
                        ${!isCancelPending ? `<div class="payment-status ${isPaid ? 'paid' : 'unpaid'}">${isPaid ? '✓ Pagato' : 'Non pagato'}</div>` : ''}
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
                ${confirmedCount}/${maxCapacity} posti occupati
                ${remainingSpots === 0 ? '(COMPLETO)' : `(${remainingSpots} liberi)`}
            </div>
        </div>
        ${participantsHTML}
    `;

    return slotCard;
}


function deleteBooking(bookingId, bookingName) {
    if (!confirm(`Eliminare la prenotazione di ${bookingName}?\n\nQuesta operazione non può essere annullata.`)) {
        return;
    }

    const bookings = BookingStorage.getAllBookings();
    const index = bookings.findIndex(b => b.id === bookingId);

    if (index !== -1) {
        const booking = bookings[index];

        // Refund credit: full if paid with credit, partial if creditApplied > 0
        const creditToRefund = (booking.paid && booking.paymentMethod === 'credito')
            ? (SLOT_PRICES[booking.slotType] || 0)
            : (booking.creditApplied || 0);
        if (creditToRefund > 0) {
            CreditStorage.addCredit(
                booking.whatsapp,
                booking.email,
                booking.name,
                creditToRefund,
                `Rimborso cancellazione lezione ${booking.date} ${booking.time}`
            );
        }

        bookings.splice(index, 1);
        BookingStorage.replaceAllBookings(bookings);

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

    // Resolve selected date BEFORE building HTML so the active tab gets highlighted.
    // Reset to Monday if no date is selected or the selection belongs to a different week.
    if (!selectedScheduleDate || !weekDates.find(d => d.formatted === selectedScheduleDate.formatted)) {
        selectedScheduleDate = weekDates[0];
    }

    // Week navigation
    const firstDate = weekDates[0].date;
    const lastDate = weekDates[6].date;

    const overrides = BookingStorage.getScheduleOverrides();
    const weekHasAnySlot = weekDates.some(d => overrides[d.formatted] && overrides[d.formatted].length > 0);

    let html = `
        <div class="admin-calendar-controls" style="margin-bottom: 1rem;">
            <button class="btn-control" onclick="changeScheduleWeek(-1)">&larr; Settimana Precedente</button>
            <h4>${firstDate.getDate()}/${firstDate.getMonth() + 1} - ${lastDate.getDate()}/${lastDate.getMonth() + 1}/${lastDate.getFullYear()}</h4>
            <button class="btn-control" onclick="changeScheduleWeek(1)">Settimana Successiva &rarr;</button>
        </div>
        <div class="schedule-import-bar">
            <span class="schedule-week-status ${weekHasAnySlot ? 'has-slots' : 'is-blank'}">
                ${weekHasAnySlot ? '● Settimana configurata' : '○ Settimana vuota'}
            </span>
            <button class="btn-import-week" onclick="importWeekTemplate(${scheduleWeekOffset})">
                📥 Importa settimana standard
            </button>
            ${weekHasAnySlot ? `<button class="btn-clear-week" onclick="clearWeekSchedule(${scheduleWeekOffset})">🗑 Svuota settimana</button>` : ''}
        </div>
    `;

    // Day selector tabs with dates
    const monthNames = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
    html += '<div class="schedule-day-tabs">';
    weekDates.forEach(dateInfo => {
        const isActive = selectedScheduleDate && selectedScheduleDate.formatted === dateInfo.formatted ? 'active' : '';
        const hasSlots = overrides[dateInfo.formatted] && overrides[dateInfo.formatted].length > 0;
        html += `<button class="schedule-day-tab ${isActive} ${hasSlots ? 'has-slots' : ''}" onclick="selectScheduleDate('${dateInfo.formatted}', '${dateInfo.dayName}')">
            <div class="admin-day-name">${dateInfo.dayName}</div>
            <div class="admin-day-date">${dateInfo.date.getDate()}</div>
            <div class="admin-day-count">${monthNames[dateInfo.date.getMonth()]}</div>
        </button>`;
    });
    html += '</div>';

    html += '<div id="scheduleDaySlots"></div>';

    manager.innerHTML = html;

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
    selectedScheduleDate = null;
    renderScheduleManager();
}

function importWeekTemplate(weekOffset) {
    const weekDates = getScheduleWeekDates(weekOffset);
    const overrides = BookingStorage.getScheduleOverrides();
    const dayNames = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];

    weekDates.forEach(dateInfo => {
        const jsDay = dateInfo.date.getDay(); // 0=Dom, 1=Lun, ...
        const templateSlots = WEEKLY_SCHEDULE_TEMPLATE[dayNames[jsDay]] || [];
        if (templateSlots.length > 0) {
            // Don't overwrite days already customized
            if (!overrides[dateInfo.formatted]) {
                overrides[dateInfo.formatted] = templateSlots;
            }
        }
    });

    BookingStorage.saveScheduleOverrides(overrides);
    renderScheduleManager();
}

function clearWeekSchedule(weekOffset) {
    if (!confirm('Svuotare tutti i giorni di questa settimana? Le prenotazioni esistenti non verranno eliminate.')) return;
    const weekDates = getScheduleWeekDates(weekOffset);
    const overrides = BookingStorage.getScheduleOverrides();
    weekDates.forEach(dateInfo => { delete overrides[dateInfo.formatted]; });
    BookingStorage.saveScheduleOverrides(overrides);
    selectedScheduleDate = null;
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
    // Only return slots that have been explicitly configured for this date.
    // Weeks with no override are blank and won't appear in the calendar.
    const overrides = BookingStorage.getScheduleOverrides();
    return overrides[dateFormatted] || [];
}

// Save schedule override for a specific date
function saveScheduleForDate(dateFormatted, dayName, slots) {
    const overrides = BookingStorage.getScheduleOverrides();

    if (slots.length === 0) {
        // If empty, remove override (will fall back to template)
        delete overrides[dateFormatted];
    } else {
        overrides[dateFormatted] = slots;
    }

    BookingStorage.saveScheduleOverrides(overrides);
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
        const isGroupClass = currentType === SLOT_TYPES.GROUP_CLASS;
        const safeId = sanitizeSlotId(timeSlot);

        // Client picker HTML — only for "Slot prenotato"
        let clientPickerHtml = '';
        if (isGroupClass) {
            const client = existingSlot?.client;
            const selectedClientHtml = client
                ? `<div class="slot-client-selected">
                       <span class="slot-client-name">${client.name}</span>
                       <span class="slot-client-sub">${client.whatsapp || client.email}</span>
                       <button class="btn-clear-client" onclick="clearSlotClient('${timeSlot}')" title="Rimuovi cliente">✕</button>
                   </div>`
                : `<div class="slot-client-warning">⚠️ Cliente obbligatorio — cerca e seleziona un iscritto</div>`;

            clientPickerHtml = `
                <div class="slot-client-picker">
                    <div class="slot-client-label">👤 Cliente associato:</div>
                    ${selectedClientHtml}
                    <div class="slot-client-search">
                        <input type="text"
                            class="slot-client-input"
                            id="client-input-${safeId}"
                            placeholder="Cerca per nome, email o telefono..."
                            oninput="searchClientsForSlot('${timeSlot}', this.value)"
                            autocomplete="off">
                        <div class="slot-client-results" id="client-results-${safeId}"></div>
                    </div>
                </div>`;
        }

        if (isGroupClass) {
            // Group-class: column layout with client picker below the row
            html += `
                <div class="schedule-slot-item-selector has-client-picker">
                    <div class="schedule-slot-top-row">
                        <div class="schedule-slot-time">🕐 ${timeSlot}</div>
                        <div class="schedule-slot-dropdown">
                            <select onchange="updateSlotType('${timeSlot}', this.value)" class="slot-type-select">
                                <option value="">-- Nessuna lezione --</option>
                                <option value="${SLOT_TYPES.PERSONAL}">Autonomia</option>
                                <option value="${SLOT_TYPES.SMALL_GROUP}">Lezione di Gruppo</option>
                                <option value="${SLOT_TYPES.GROUP_CLASS}" selected>Slot prenotato</option>
                            </select>
                        </div>
                        <div class="current-type-badge ${SLOT_TYPES.GROUP_CLASS}">${SLOT_NAMES[SLOT_TYPES.GROUP_CLASS]}</div>
                    </div>
                    ${clientPickerHtml}
                </div>
            `;
        } else {
            html += `
                <div class="schedule-slot-item-selector">
                    <div class="schedule-slot-time">🕐 ${timeSlot}</div>
                    <div class="schedule-slot-dropdown">
                        <select onchange="updateSlotType('${timeSlot}', this.value)" class="slot-type-select">
                            <option value="">-- Nessuna lezione --</option>
                            <option value="${SLOT_TYPES.PERSONAL}" ${currentType === SLOT_TYPES.PERSONAL ? 'selected' : ''}>Autonomia</option>
                            <option value="${SLOT_TYPES.SMALL_GROUP}" ${currentType === SLOT_TYPES.SMALL_GROUP ? 'selected' : ''}>Lezione di Gruppo</option>
                            <option value="${SLOT_TYPES.GROUP_CLASS}">Slot prenotato</option>
                        </select>
                    </div>
                    ${currentType ? `<div class="current-type-badge ${currentType}">${SLOT_NAMES[currentType]}</div>` : ''}
                </div>
            `;
        }
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
            // Remove the associated booking if this was a group-class slot
            if (daySlots[existingSlotIndex].bookingId) {
                BookingStorage.removeBookingById(daySlots[existingSlotIndex].bookingId);
            }
            daySlots.splice(existingSlotIndex, 1);
        }
    } else {
        // Add or update slot
        if (existingSlotIndex !== -1) {
            // When switching away from group-class, remove client and booking
            if (daySlots[existingSlotIndex].type === SLOT_TYPES.GROUP_CLASS && newType !== SLOT_TYPES.GROUP_CLASS) {
                if (daySlots[existingSlotIndex].bookingId) {
                    BookingStorage.removeBookingById(daySlots[existingSlotIndex].bookingId);
                }
                delete daySlots[existingSlotIndex].client;
                delete daySlots[existingSlotIndex].bookingId;
            }
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

// ── Client Picker for "Slot prenotato" ────────────────────────────────────────

// Sanitize a time slot string to use as an HTML element ID
function sanitizeSlotId(timeSlot) {
    return timeSlot.replace(/[^a-z0-9]/gi, '_');
}

// Holds last search results per time slot to avoid JSON in onclick attributes
const _clientSearchResults = {};

// Called on input — searches registered users and renders the dropdown list
function searchClientsForSlot(timeSlot, query) {
    const safeId = sanitizeSlotId(timeSlot);
    const resultsDiv = document.getElementById(`client-results-${safeId}`);
    if (!resultsDiv) return;

    if (!query || query.trim().length < 2) {
        resultsDiv.innerHTML = '';
        _clientSearchResults[timeSlot] = [];
        return;
    }

    const results = UserStorage.search(query);
    _clientSearchResults[timeSlot] = results;

    if (results.length === 0) {
        resultsDiv.innerHTML = '<div class="slot-client-no-results">Nessun iscritto trovato</div>';
        return;
    }

    resultsDiv.innerHTML = results.map((user, i) => `
        <div class="slot-client-result" onclick="selectSlotClient('${timeSlot}', ${i})">
            <span class="slot-client-result-name">${user.name}</span>
            <span class="slot-client-result-sub">${user.whatsapp || user.email}</span>
        </div>
    `).join('');
}

// Formats YYYY-MM-DD to display string (e.g. "Lunedì 26 Febbraio 2026")
function formatAdminBookingDate(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    const days = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
    const months = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                    'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
    return `${days[d.getDay()]} ${day} ${months[month - 1]} ${year}`;
}

// Called when a user clicks a result — creates a real booking and links it to the slot
function selectSlotClient(timeSlot, index) {
    const user = (_clientSearchResults[timeSlot] || [])[index];
    if (!user || !selectedScheduleDate) return;

    const overrides = BookingStorage.getScheduleOverrides();
    const dateSlots = overrides[selectedScheduleDate.formatted];
    if (!dateSlots) return;

    const slot = dateSlots.find(s => s.time === timeSlot);
    if (!slot) return;

    // Remove previous booking for this slot (if admin changed the client)
    if (slot.bookingId) {
        BookingStorage.removeBookingById(slot.bookingId);
    }

    // Create the real booking — visible in Prenotazioni, Clienti, Pagamenti, Le mie prenotazioni
    const booking = {
        name: user.name,
        email: user.email,
        whatsapp: user.whatsapp || '',
        date: selectedScheduleDate.formatted,
        time: timeSlot,
        slotType: SLOT_TYPES.GROUP_CLASS,
        notes: '',
        dateDisplay: formatAdminBookingDate(selectedScheduleDate.formatted)
    };
    const savedBooking = BookingStorage.saveBooking(booking);

    // Store client and bookingId in the override for display purposes
    slot.client = { name: user.name, email: user.email, whatsapp: user.whatsapp || '' };
    slot.bookingId = savedBooking.id;
    BookingStorage.saveScheduleOverrides(overrides);
    renderAllTimeSlots();
}

// Removes the associated client and booking from a group-class slot
function clearSlotClient(timeSlot) {
    if (!selectedScheduleDate) return;

    const overrides = BookingStorage.getScheduleOverrides();
    const dateSlots = overrides[selectedScheduleDate.formatted];
    if (!dateSlots) return;

    const slot = dateSlots.find(s => s.time === timeSlot);
    if (slot) {
        if (slot.bookingId) {
            BookingStorage.removeBookingById(slot.bookingId);
        }
        delete slot.client;
        delete slot.bookingId;
        BookingStorage.saveScheduleOverrides(overrides);
    }
    renderAllTimeSlots();
}

// Payments Management Functions
let debtorsListVisible = false;
let creditsListVisible = false;

// Clients Tab State
let openClientIndex = null;
let clientsSearchQuery = '';

function renderPaymentsTab() {
    const debtors = getDebtors();
    const totalUnpaid = debtors.reduce((sum, debtor) => sum + debtor.totalAmount, 0);
    const credits = CreditStorage.getAllWithBalance();
    const totalCredit = CreditStorage.getTotalCredit();

    // Update stats
    document.getElementById('totalUnpaid').textContent = `€${totalUnpaid}`;
    document.getElementById('totalDebtors').textContent = debtors.length;
    document.getElementById('totalCreditors').textContent = credits.length;
    document.getElementById('totalCreditAmount').textContent = `€${totalCredit}`;

    // Reset search UI and list visibility
    clearSearch();
    debtorsListVisible = false;
    creditsListVisible = false;
    const debtorsList = document.getElementById('debtorsList');
    debtorsList.style.display = 'none';
    document.getElementById('debtorsToggleHint').textContent = '▼ Mostra lista';
    const creditsList = document.getElementById('creditsList');
    if (creditsList) {
        creditsList.style.display = 'none';
        document.getElementById('creditorsToggleHint').textContent = '▼ Mostra lista';
    }

    // Render debtors
    if (debtors.length === 0) {
        debtorsList.innerHTML = '<div class="empty-slot">Nessun cliente con pagamenti in sospeso! 🎉</div>';
    } else {
        debtorsList.innerHTML = '';
        debtors.forEach((debtor, index) => {
            const debtorCard = createDebtorCard(debtor, `main-${index}`);
            debtorsList.appendChild(debtorCard);
        });
    }

    // Render credits
    if (creditsList) {
        if (credits.length === 0) {
            creditsList.innerHTML = '<div class="empty-slot">Nessun cliente con credito attivo</div>';
        } else {
            creditsList.innerHTML = '';
            credits.forEach((credit, index) => {
                creditsList.appendChild(createCreditCard(credit, index));
            });
        }
    }
}

function toggleCreditsList() {
    creditsListVisible = !creditsListVisible;
    const creditsList = document.getElementById('creditsList');
    const hint = document.getElementById('creditorsToggleHint');
    if (creditsList) creditsList.style.display = creditsListVisible ? 'flex' : 'none';
    if (hint) hint.textContent = creditsListVisible ? '▲ Nascondi lista' : '▼ Mostra lista';
}

function createCreditCard(credit, index) {
    const card = document.createElement('div');
    card.className = 'debtor-card credit-client-card';
    card.id = `credit-card-${index}`;

    const recentHistory = [...(credit.history || [])].reverse().slice(0, 5);
    let historyHTML = '<div class="debtor-bookings" style="margin-top:0.75rem;">';
    recentHistory.forEach(entry => {
        const d = new Date(entry.date);
        const dateStr = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
        const sign = entry.amount >= 0 ? '+' : '';
        const color = entry.amount >= 0 ? '#22c55e' : '#ef4444';
        historyHTML += `
            <div class="debtor-booking-item">
                <div class="debtor-booking-details">📅 ${dateStr} — ${entry.note || 'Movimento credito'}</div>
                <div class="debtor-booking-price" style="color:${color}">${sign}€${Math.abs(entry.amount)}</div>
            </div>`;
    });
    historyHTML += '</div>';

    card.innerHTML = `
        <div class="debtor-card-header" onclick="toggleDebtorCard('credit-card-${index}')">
            <div class="debtor-info">
                <div class="debtor-name">${credit.name}</div>
                <div class="debtor-contact">
                    <span>📱 ${credit.whatsapp}</span>
                    <span>✉️ ${credit.email}</span>
                </div>
            </div>
            <div class="debtor-amount credit-amount">Credito: €${credit.balance}</div>
            <div class="debtor-toggle">▼</div>
        </div>
        <div class="debtor-card-body">${historyHTML}</div>
    `;
    return card;
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

    // Group unpaid past bookings by contact, matching by phone OR email
    allBookings.forEach(booking => {
        if (!booking.paid && bookingHasPassed(booking)) {
            const normPhone = normalizePhone(booking.whatsapp);

            let matchedKey = null;
            for (const [k, debtor] of Object.entries(debtorsMap)) {
                const phoneMatch = normPhone && normalizePhone(debtor.whatsapp) === normPhone;
                const emailMatch = booking.email && debtor.email &&
                    booking.email.toLowerCase() === debtor.email.toLowerCase();
                if (phoneMatch || emailMatch) { matchedKey = k; break; }
            }

            if (!matchedKey) {
                matchedKey = normPhone || booking.email;
                debtorsMap[matchedKey] = {
                    name: booking.name, whatsapp: booking.whatsapp, email: booking.email,
                    unpaidBookings: [], manualDebt: 0, totalAmount: 0
                };
            }

            const price = SLOT_PRICES[booking.slotType];
            debtorsMap[matchedKey].unpaidBookings.push({ ...booking, price });
            debtorsMap[matchedKey].totalAmount += price;
        }
    });

    // Merge in manual debts (not tied to bookings)
    ManualDebtStorage.getAllWithBalance().forEach(debt => {
        const normPhone = normalizePhone(debt.whatsapp);
        let matchedKey = null;
        for (const [k, debtor] of Object.entries(debtorsMap)) {
            const phoneMatch = normPhone && normalizePhone(debtor.whatsapp) === normPhone;
            const emailMatch = debt.email && debtor.email &&
                debt.email.toLowerCase() === debtor.email.toLowerCase();
            if (phoneMatch || emailMatch) { matchedKey = k; break; }
        }
        if (!matchedKey) {
            matchedKey = normPhone || debt.email;
            debtorsMap[matchedKey] = {
                name: debt.name, whatsapp: debt.whatsapp, email: debt.email,
                unpaidBookings: [], manualDebt: 0, totalAmount: 0
            };
        }
        debtorsMap[matchedKey].manualDebt = debt.balance;
        debtorsMap[matchedKey].totalAmount += debt.balance;
    });

    return Object.values(debtorsMap).sort((a, b) => b.totalAmount - a.totalAmount);
}

function createDebtorCard(debtor, cardId) {
    const card = document.createElement('div');
    card.className = 'debtor-card';
    card.id = `debtor-card-${cardId}`;

    const safeW = debtor.whatsapp.replace(/'/g, "\\'");
    const safeE = debtor.email.replace(/'/g, "\\'");
    const safeN = debtor.name.replace(/'/g, "\\'");

    let bookingsHTML = '<div class="debtor-bookings">';
    debtor.unpaidBookings.forEach(booking => {
        bookingsHTML += `
            <div class="debtor-booking-item">
                <div class="debtor-booking-details">
                    📅 ${booking.date} &nbsp;·&nbsp; 🕐 ${booking.time} &nbsp;·&nbsp; ${SLOT_NAMES[booking.slotType]}
                </div>
                <div class="debtor-booking-price">€${booking.price}</div>
            </div>
        `;
    });
    if (debtor.manualDebt > 0) {
        const record = ManualDebtStorage.getRecord(debtor.whatsapp, debtor.email);
        const recentEntries = record ? [...record.history].reverse().slice(0, 3) : [];
        recentEntries.forEach(entry => {
            if (entry.amount > 0) {
                const d = new Date(entry.date);
                const dateStr = `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`;
                bookingsHTML += `
                    <div class="debtor-booking-item debtor-booking-manual">
                        <div class="debtor-booking-details">✏️ ${dateStr} &nbsp;·&nbsp; ${entry.note || 'Debito manuale'}</div>
                        <div class="debtor-booking-price">€${entry.amount}</div>
                    </div>`;
            }
        });
        if (record && record.history.filter(e => e.amount > 0).length > 3) {
            bookingsHTML += `<div class="debtor-booking-item" style="opacity:0.5;font-size:0.78rem;">… altri movimenti nel storico</div>`;
        }
    }
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
            <div class="debtor-amount">€${debtor.totalAmount}</div>
            <div class="debtor-toggle">▼</div>
        </div>
        <div class="debtor-card-body">
            ${bookingsHTML}
            <div class="debtor-pay-footer">
                <div class="debtor-pay-total">Totale: <strong>€${debtor.totalAmount}</strong></div>
                <div class="debtor-pay-methods">
                    <button class="debt-method-btn active" data-method="contanti" onclick="selectDebtorPayMethod(this)">💵 Contanti</button>
                    <button class="debt-method-btn" data-method="carta" onclick="selectDebtorPayMethod(this)">💳 Carta</button>
                    <button class="debt-method-btn" data-method="iban" onclick="selectDebtorPayMethod(this)">🏦 IBAN</button>
                </div>
                <button class="btn-pay-all" onclick="payAllDebtsInline('${safeW}', '${safeE}', '${safeN}', this)">✓ Incassa tutto</button>
            </div>
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

function selectDebtorPayMethod(btn) {
    btn.closest('.debtor-pay-methods').querySelectorAll('.debt-method-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

function payAllDebtsInline(whatsapp, email, name, btn) {
    const footer = btn.closest('.debtor-pay-footer');
    const activeMethodBtn = footer.querySelector('.debt-method-btn.active');
    const method = activeMethodBtn ? activeMethodBtn.dataset.method : 'contanti';
    const methodLabels = { contanti: '💵 Contanti', carta: '💳 Carta', iban: '🏦 IBAN' };

    const normW = normalizePhone(whatsapp);
    const bookings = BookingStorage.getAllBookings();
    const now = new Date().toISOString();
    let totalPaid = 0;

    bookings.forEach(b => {
        const normB = normalizePhone(b.whatsapp);
        const phoneMatch = normW && normB && normW === normB;
        const emailMatch = email && b.email && b.email.toLowerCase() === email.toLowerCase();
        if ((phoneMatch || emailMatch) && !b.paid && bookingHasPassed(b)) {
            b.paid = true;
            b.paymentMethod = method;
            b.paidAt = now;
            totalPaid += SLOT_PRICES[b.slotType] || 0;
        }
    });

    // Also pay manual debts for this contact
    const manualDebt = ManualDebtStorage.getBalance(whatsapp, email);
    if (manualDebt > 0) {
        ManualDebtStorage.addDebt(whatsapp, email, name, -manualDebt,
            `Saldato (${method})`, method);
        totalPaid += manualDebt;
    }

    if (totalPaid === 0) return;
    BookingStorage.replaceAllBookings(bookings);

    // Update card in-place — keep it visible with paid state
    const card = btn.closest('.debtor-card');

    // Strike through all booking rows
    card.querySelectorAll('.debtor-booking-item').forEach(row => {
        row.classList.add('debtor-booking-paid');
        const priceEl = row.querySelector('.debtor-booking-price');
        if (priceEl) priceEl.style.color = '#22c55e';
    });

    // Replace the pay footer with a success banner
    footer.innerHTML = `
        <div class="debtor-pay-success">
            <span>✓</span>
            <span>€${totalPaid} incassati · ${methodLabels[method] || method}</span>
        </div>
    `;

    // Update the header amount pill to "Saldato"
    const amountBadge = card.querySelector('.debtor-amount');
    if (amountBadge) {
        amountBadge.textContent = '✓ Saldato';
        amountBadge.classList.add('debtor-amount--paid');
    }

    // Refresh only the top stats numbers, not the full list
    const updatedDebtors = getDebtors();
    document.getElementById('totalUnpaid').textContent = `€${updatedDebtors.reduce((s, d) => s + d.totalAmount, 0)}`;
    document.getElementById('totalDebtors').textContent = updatedDebtors.length;
}

function _searchAllContacts(query) {
    const q = query.trim().toLowerCase();
    const debtorMatches = getDebtors()
        .filter(d =>
            d.name.toLowerCase().includes(q) ||
            d.whatsapp.toLowerCase().includes(q) ||
            d.email.toLowerCase().includes(q)
        )
        .map(d => ({ type: 'debtor', data: d }));

    const creditMatches = CreditStorage.getAllWithBalance()
        .filter(c =>
            c.name.toLowerCase().includes(q) ||
            (c.whatsapp || '').toLowerCase().includes(q) ||
            (c.email || '').toLowerCase().includes(q)
        )
        // Don't duplicate contacts already shown as debtors
        .filter(c => !debtorMatches.some(dm =>
            normalizePhone(dm.data.whatsapp) === normalizePhone(c.whatsapp) ||
            (dm.data.email && c.email && dm.data.email.toLowerCase() === c.email.toLowerCase())
        ))
        .map(c => ({ type: 'credit', data: c }));

    return [...debtorMatches, ...creditMatches];
}

function searchDebtor() {
    const query = document.getElementById('debtorSearchInput').value.trim();
    if (!query) return;

    const results = _searchAllContacts(query);
    const resultsContainer = document.getElementById('debtorSearchResults');
    const resultsList = document.getElementById('searchResultsList');

    if (results.length === 0) {
        resultsList.innerHTML = '<p style="color: #666; padding: 0.5rem 0;">Nessun risultato trovato.</p>';
    } else {
        resultsList.innerHTML = '';
        results.forEach((r, index) => {
            const card = r.type === 'debtor'
                ? createDebtorCard(r.data, `search-${index}`)
                : createCreditCard(r.data, `search-${index}`);
            card.classList.add('open');
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
    const query = document.getElementById('debtorSearchInput').value.trim();
    const dropdown = document.getElementById('debtorSearchDropdown');

    if (!query) {
        dropdown.style.display = 'none';
        return;
    }

    const matches = _searchAllContacts(query);

    if (matches.length === 0) {
        dropdown.innerHTML = '<div class="dropdown-no-results">Nessun risultato</div>';
    } else {
        dropdown.innerHTML = matches.map((r, i) => {
            const name = r.data.name;
            const badge = r.type === 'debtor'
                ? `<span class="dropdown-item-debt">Da pagare: €${r.data.totalAmount}</span>`
                : `<span class="dropdown-item-credit">💳 €${r.data.balance}</span>`;
            return `<div class="dropdown-item" onclick="selectDebtorFromDropdown(${i})">
                <span class="dropdown-item-name">${name}</span>
                ${badge}
            </div>`;
        }).join('');
        dropdown._matches = matches;
    }

    dropdown.style.display = 'block';
}

function selectDebtorFromDropdown(index) {
    const dropdown = document.getElementById('debtorSearchDropdown');
    const matches = dropdown._matches;
    if (!matches || !matches[index]) return;

    const r = matches[index];
    const resultsContainer = document.getElementById('debtorSearchResults');
    const resultsList = document.getElementById('searchResultsList');

    resultsList.innerHTML = '';
    const card = r.type === 'debtor'
        ? createDebtorCard(r.data, 'search-sel')
        : createCreditCard(r.data, 'search-sel');
    card.classList.add('open');
    resultsList.appendChild(card);

    resultsContainer.style.display = 'block';
    closeSearchDropdown();
    document.getElementById('debtorSearchInput').value = r.data.name;
    resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function markBookingPaid(bookingId) {
    const bookings = BookingStorage.getAllBookings();
    const booking = bookings.find(b => b.id === bookingId);

    if (booking) {
        booking.paid = true;
        booking.paidAt = new Date().toISOString();
        BookingStorage.replaceAllBookings(bookings);

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

// Strip +39 / 0039 prefix and non-digit chars for phone comparison
function normalizePhone(phone) {
    if (!phone) return '';
    return phone.replace(/^\+39\s*/, '').replace(/^0039\s*/, '').replace(/[\s\-(). ]/g, '');
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

// Get unpaid amount for a specific contact (phone OR email match), only for past bookings
function getUnpaidAmountForContact(whatsapp, email) {
    const normWhatsapp = normalizePhone(whatsapp);
    const allBookings = BookingStorage.getAllBookings();
    let totalUnpaid = 0;

    allBookings.forEach(booking => {
        const phoneMatch = normWhatsapp && normalizePhone(booking.whatsapp) === normWhatsapp;
        const emailMatch = email && booking.email && booking.email.toLowerCase() === email.toLowerCase();
        if ((phoneMatch || emailMatch) && !booking.paid && bookingHasPassed(booking) && booking.status !== 'cancelled') {
            totalUnpaid += (SLOT_PRICES[booking.slotType] || 0) - (booking.creditApplied || 0);
        }
    });

    return totalUnpaid;
}

// ===== Manual Credit/Debt Entry Popup =====
let _manualEntryType = 'debt';
let _manualEntryContact = null;

function openManualEntryPopup(type) {
    _manualEntryType = type;
    _manualEntryContact = null;
    const isDebt = type === 'debt';
    document.getElementById('manualEntryTitle').textContent = isDebt ? 'Aggiungi Debito Manuale' : 'Aggiungi Credito Manuale';
    document.getElementById('manualEntrySubtitle').textContent = isDebt
        ? 'Debito non legato a prenotazioni (es. lezione privata)'
        : 'Ricarica il saldo credito del cliente';
    document.getElementById('manualClientInput').value = '';
    document.getElementById('manualClientDropdown').style.display = 'none';
    document.getElementById('manualClientSelected').style.display = 'none';
    document.getElementById('manualAmountInput').value = '';
    document.getElementById('manualNoteInput').value = '';
    document.querySelectorAll('#manualEntryModal .debt-method-btn').forEach(b => b.classList.remove('active'));
    const defaultBtn = document.querySelector('#manualEntryModal .debt-method-btn[data-method="contanti"]');
    if (defaultBtn) defaultBtn.classList.add('active');
    document.getElementById('manualEntryOverlay').classList.add('open');
    document.getElementById('manualEntryModal').classList.add('open');
    setTimeout(() => document.getElementById('manualClientInput').focus(), 100);
}

function closeManualEntryPopup() {
    document.getElementById('manualEntryOverlay').classList.remove('open');
    document.getElementById('manualEntryModal').classList.remove('open');
    _manualEntryContact = null;
}

function liveSearchManualClient() {
    const q = document.getElementById('manualClientInput').value.trim();
    const dropdown = document.getElementById('manualClientDropdown');
    if (q.length < 2) { dropdown.style.display = 'none'; return; }
    const results = UserStorage.search(q).slice(0, 6);
    if (results.length === 0) { dropdown.style.display = 'none'; return; }
    dropdown.innerHTML = results.map(u => {
        const safeN = u.name.replace(/'/g, "\\'");
        const safeW = (u.whatsapp || '').replace(/'/g, "\\'");
        const safeE = (u.email || '').replace(/'/g, "\\'");
        return `<div class="debtor-search-option" onclick="selectManualClient('${safeN}','${safeW}','${safeE}')">
            <strong>${u.name}</strong>
            <small>${[u.whatsapp, u.email].filter(Boolean).join(' · ')}</small>
        </div>`;
    }).join('');
    dropdown.style.display = 'block';
}

function selectManualClient(name, whatsapp, email) {
    _manualEntryContact = { name, whatsapp, email };
    document.getElementById('manualClientInput').value = '';
    document.getElementById('manualClientDropdown').style.display = 'none';
    const sel = document.getElementById('manualClientSelected');
    sel.style.display = 'flex';
    const initials = name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const sub = [whatsapp, email].filter(Boolean).join(' · ');
    sel.innerHTML = `
        <div class="manual-client-avatar">${initials}</div>
        <div class="manual-client-info">
            <strong>${name}</strong>
            ${sub ? `<small>${sub}</small>` : ''}
        </div>
        <button class="manual-client-clear" onclick="_manualEntryContact=null;
            document.getElementById('manualClientSelected').style.display='none';
            document.getElementById('manualClientInput').value='';">✕</button>`;
}

function selectManualMethod(btn) {
    btn.closest('.debt-method-btns').querySelectorAll('.debt-method-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

function saveManualEntry() {
    if (!_manualEntryContact) {
        alert('Seleziona un cliente dalla lista');
        document.getElementById('manualClientInput').focus();
        return;
    }
    const amount = parseFloat(document.getElementById('manualAmountInput').value);
    if (!amount || amount <= 0) {
        alert('Inserisci un importo valido');
        document.getElementById('manualAmountInput').focus();
        return;
    }
    const note = document.getElementById('manualNoteInput').value.trim();
    const activeMethodBtn = document.querySelector('#manualEntryModal .debt-method-btn.active');
    const method = activeMethodBtn ? activeMethodBtn.dataset.method : 'contanti';
    const { name, whatsapp, email } = _manualEntryContact;

    if (_manualEntryType === 'debt') {
        ManualDebtStorage.addDebt(whatsapp, email, name, amount,
            note || 'Debito manuale', method);
    } else {
        CreditStorage.addCredit(whatsapp, email, name, amount,
            note ? `${note} (${method})` : `Credito manuale (${method})`);
        CreditStorage.applyToUnpaidBookings(whatsapp, email, name);
    }

    const savedType = _manualEntryType;
    closeManualEntryPopup();
    renderPaymentsTab();
    // Reveal the relevant list so user sees the new entry
    if (savedType === 'debt') {
        debtorsListVisible = false;
        toggleDebtorsList();
    } else {
        creditsListVisible = false;
        toggleCreditsList();
    }
}

// ===== Debt Popup =====
let currentDebtContact = null;

function openDebtPopup(whatsapp, email, name) {
    const normWhatsapp = normalizePhone(whatsapp);
    const allBookings = BookingStorage.getAllBookings();
    const unpaid = allBookings
        .filter(b => {
            const phoneMatch = normWhatsapp && normalizePhone(b.whatsapp) === normWhatsapp;
            const emailMatch = email && b.email && b.email.toLowerCase() === email.toLowerCase();
            return (phoneMatch || emailMatch) && !b.paid && bookingHasPassed(b) && b.status !== 'cancelled';
        })
        .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

    if (unpaid.length === 0) return;

    currentDebtContact = { whatsapp, email, name, unpaid };

    document.getElementById('debtPopupName').textContent = name;
    document.getElementById('debtPopupSubtitle').textContent =
        `${unpaid.length} lezione${unpaid.length > 1 ? 'i' : ''} non pagata${unpaid.length > 1 ? 'e' : ''}`;

    // Reset payment method to default
    document.querySelectorAll('.debt-method-btn').forEach(b => b.classList.remove('active'));
    const defaultBtn = document.querySelector('.debt-method-btn[data-method="contanti"]');
    if (defaultBtn) defaultBtn.classList.add('active');

    // Reset amount input
    const amountInput = document.getElementById('debtAmountInput');
    if (amountInput) amountInput.value = 0;

    // Show existing credit if any
    const credit = CreditStorage.getBalance(whatsapp, email);
    const existingCreditRow = document.getElementById('debtExistingCreditRow');
    if (existingCreditRow) {
        if (credit > 0) {
            existingCreditRow.style.display = 'flex';
            document.getElementById('debtExistingCreditAmt').textContent = `€${credit}`;
        } else {
            existingCreditRow.style.display = 'none';
        }
    }
    const creditRow = document.getElementById('debtCreditRow');
    if (creditRow) creditRow.style.display = 'none';

    renderDebtPopupList(unpaid);
    updateDebtTotal();

    document.getElementById('debtPopupOverlay').classList.add('open');
    document.getElementById('debtPopupModal').classList.add('open');
}

function renderDebtPopupList(unpaid) {
    const list = document.getElementById('debtPopupList');
    list.innerHTML = '';

    unpaid.forEach(booking => {
        const [y, m, d] = booking.date.split('-').map(Number);
        const dateDisplay = `${d}/${m}/${y}`;
        const fullPrice = SLOT_PRICES[booking.slotType];
        const creditApplied = booking.creditApplied || 0;
        const price = fullPrice - creditApplied;

        const item = document.createElement('div');
        item.className = 'debt-popup-item';
        item.innerHTML = `
            <label class="debt-item-label">
                <input type="checkbox" class="debt-item-check" data-id="${booking.id}" data-price="${price}" onchange="updateDebtTotal()">
                <div class="debt-item-info">
                    <span class="debt-item-date">📅 ${dateDisplay} &nbsp;·&nbsp; 🕐 ${booking.time}</span>
                    <span class="debt-item-type">${SLOT_NAMES[booking.slotType]}${creditApplied > 0 ? ` <span style="color:#92400e;font-size:0.8em">(💳 €${creditApplied} già applicato)</span>` : ''}</span>
                </div>
                <span class="debt-item-price">€${price}</span>
            </label>
        `;
        list.appendChild(item);
    });
}

function updateDebtTotal() {
    const checked = document.querySelectorAll('.debt-item-check:checked');
    const all = document.querySelectorAll('.debt-item-check');
    const dueTotal = Array.from(checked).reduce((sum, cb) => sum + Number(cb.dataset.price), 0);

    document.getElementById('debtSelectedTotal').textContent = `€${dueTotal}`;

    // Reset amount input to match new selection
    const amountInput = document.getElementById('debtAmountInput');
    if (amountInput) amountInput.value = dueTotal;

    updateCreditPreview();

    const selectAll = document.getElementById('debtSelectAll');
    selectAll.indeterminate = checked.length > 0 && checked.length < all.length;
    selectAll.checked = all.length > 0 && checked.length === all.length;
}

function updateCreditPreview() {
    const checked = document.querySelectorAll('.debt-item-check:checked');
    const dueTotal = Array.from(checked).reduce((sum, cb) => sum + Number(cb.dataset.price), 0);
    const amountInput = document.getElementById('debtAmountInput');
    const amountPaid = amountInput ? (parseFloat(amountInput.value) || 0) : dueTotal;
    const creditDelta = Math.round((amountPaid - dueTotal) * 100) / 100;

    const creditRow = document.getElementById('debtCreditRow');
    const creditMsg = document.getElementById('debtCreditMsg');
    if (creditRow && creditMsg) {
        if (checked.length > 0 && creditDelta > 0) {
            creditRow.style.display = 'flex';
            creditMsg.innerHTML = `✨ Verrà aggiunto <strong>€${creditDelta}</strong> di credito`;
            creditRow.className = 'debt-credit-row debt-credit-row--positive';
        } else if (checked.length > 0 && amountPaid > 0 && creditDelta < 0) {
            creditRow.style.display = 'flex';
            creditMsg.innerHTML = `⚠️ Importo inferiore al dovuto (–€${Math.abs(creditDelta)})`;
            creditRow.className = 'debt-credit-row debt-credit-row--warning';
        } else {
            creditRow.style.display = 'none';
        }
    }

    const payBtn = document.getElementById('debtPayBtn');
    if (payBtn) payBtn.disabled = checked.length === 0 || amountPaid <= 0;
}

function toggleAllDebts(checked) {
    document.querySelectorAll('.debt-item-check').forEach(cb => { cb.checked = checked; });
    updateDebtTotal();
}

function selectPaymentMethod(btn) {
    document.querySelectorAll('.debt-method-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

function paySelectedDebts() {
    const checked = document.querySelectorAll('.debt-item-check:checked');
    if (checked.length === 0) return;

    const dueTotal = Array.from(checked).reduce((sum, cb) => sum + Number(cb.dataset.price), 0);
    const amountInput = document.getElementById('debtAmountInput');
    const amountPaid = amountInput ? (parseFloat(amountInput.value) || dueTotal) : dueTotal;
    const creditDelta = Math.round((amountPaid - dueTotal) * 100) / 100;

    const activeMethodBtn = document.querySelector('.debt-method-btn.active');
    const paymentMethod = activeMethodBtn ? activeMethodBtn.dataset.method : 'contanti';

    const bookings = BookingStorage.getAllBookings();
    const now = new Date().toISOString();
    checked.forEach(cb => {
        const booking = bookings.find(b => b.id === cb.dataset.id);
        if (booking) {
            booking.paid = true;
            booking.paymentMethod = paymentMethod;
            booking.paidAt = now;
        }
    });
    BookingStorage.replaceAllBookings(bookings);

    // Add credit if overpaid, then auto-apply to any remaining unpaid past bookings
    if (creditDelta > 0 && currentDebtContact) {
        CreditStorage.addCredit(
            currentDebtContact.whatsapp,
            currentDebtContact.email,
            currentDebtContact.name,
            creditDelta,
            `Eccedenza pagamento (${paymentMethod})`
        );
        CreditStorage.applyToUnpaidBookings(
            currentDebtContact.whatsapp,
            currentDebtContact.email,
            currentDebtContact.name
        );
    }

    closeDebtPopup();
    if (selectedAdminDay) renderAdminDayView(selectedAdminDay);
    const activeTab = document.querySelector('.admin-tab.active');
    if (activeTab && activeTab.dataset.tab === 'payments') renderPaymentsTab();
}

function closeDebtPopup() {
    document.getElementById('debtPopupOverlay').classList.remove('open');
    document.getElementById('debtPopupModal').classList.remove('open');
    currentDebtContact = null;
}

// ===== Clients Tab =====

function getAllClients() {
    const allBookings = BookingStorage.getAllBookings();
    const clientsMap = {};

    allBookings.forEach(booking => {
        const normPhone = normalizePhone(booking.whatsapp);
        let matchedKey = null;
        for (const [k, client] of Object.entries(clientsMap)) {
            const phoneMatch = normPhone && normalizePhone(client.whatsapp) === normPhone;
            const emailMatch = booking.email && client.email &&
                booking.email.toLowerCase() === client.email.toLowerCase();
            if (phoneMatch || emailMatch) { matchedKey = k; break; }
        }
        if (!matchedKey) {
            matchedKey = normPhone || booking.email;
            clientsMap[matchedKey] = { name: booking.name, whatsapp: booking.whatsapp, email: booking.email, bookings: [] };
        }
        clientsMap[matchedKey].bookings.push(booking);
    });

    Object.values(clientsMap).forEach(c => {
        c.bookings.sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
    });

    return Object.values(clientsMap).sort((a, b) => a.name.localeCompare(b.name));
}

function liveSearchClients() {
    clientsSearchQuery = document.getElementById('clientSearchInput').value;
    renderClientsTab();
}

function renderClientsTab() {
    const allClients = getAllClients();
    const query = clientsSearchQuery.trim().toLowerCase();
    const filtered = query
        ? allClients.filter(c =>
            c.name.toLowerCase().includes(query) ||
            c.whatsapp.toLowerCase().includes(query) ||
            (c.email && c.email.toLowerCase().includes(query)))
        : allClients;

    const container = document.getElementById('clientsList');
    container.innerHTML = '';

    if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-slot">Nessun cliente trovato</div>';
        return;
    }

    filtered.forEach((client, index) => {
        container.appendChild(createClientCard(client, index));
    });

    // Restore previously open card
    if (openClientIndex !== null) {
        const card = document.getElementById(`client-card-${openClientIndex}`);
        if (card) card.classList.add('open');
    }
}

function toggleClientCard(id, idx) {
    const card = document.getElementById(id);
    if (!card) return;
    const isOpen = card.classList.toggle('open');
    openClientIndex = isOpen ? idx : null;
}

function createClientCard(client, index) {
    const card = document.createElement('div');
    card.className = 'client-card';
    card.id = `client-card-${index}`;

    const activeBookings = client.bookings.filter(b => b.status !== 'cancelled');
    const totalBookings = activeBookings.length;
    const totalPaid   = activeBookings.filter(b => b.paid).reduce((s, b) => s + (SLOT_PRICES[b.slotType] || 0), 0);
    const totalUnpaid = activeBookings.filter(b => !b.paid && bookingHasPassed(b) && b.status !== 'cancellation_requested').reduce((s, b) => s + (SLOT_PRICES[b.slotType] || 0) - (b.creditApplied || 0), 0);
    const credit      = CreditStorage.getBalance(client.whatsapp, client.email);

    let statsHTML = `<span class="cstat">${totalBookings} prenotazioni</span>`;
    if (totalPaid   > 0) statsHTML += `<span class="cstat paid">€${totalPaid} pagato</span>`;
    if (totalUnpaid > 0) statsHTML += `<span class="cstat unpaid">€${totalUnpaid} da pagare</span>`;
    if (credit      > 0) statsHTML += `<span class="cstat credit">💳 €${credit}</span>`;

    const methodLabel = m => ({ contanti: '💵 Contanti', carta: '💳 Carta', iban: '🏦 IBAN', credito: '✨ Credito' }[m] || '—');
    const fmtPaidAt = iso => {
        if (!iso) return '<span style="color:#ccc">—</span>';
        const d = new Date(iso);
        return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
    };

    const bookingsHTML = client.bookings.map(b => {
        const dateStr = b.date.split('-').reverse().join('/');
        const isCancelPending  = b.status === 'cancellation_requested';
        const isCancelled      = b.status === 'cancelled';
        const rowClass = [
            bookingHasPassed(b) ? '' : 'future-booking',
            isCancelPending ? 'row-cancel-pending' : '',
            isCancelled     ? 'row-cancelled'      : ''
        ].filter(Boolean).join(' ');
        const nEsc = b.name.replace(/'/g, "\\'");
        const isPartialCredit = !b.paid && (b.creditApplied || 0) > 0;
        const statusCell = isCancelled
            ? `<span class="payment-status" style="background:#f3f4f6;color:#6b7280">✕ Annullata</span>`
            : isCancelPending
                ? `<span class="payment-status" style="background:#fef3c7;color:#92400e">⏳ Annullamento</span>`
                : isPartialCredit
                    ? `<span class="payment-status" style="background:#ede9fe;color:#5b21b6">💳 Parziale (€${(SLOT_PRICES[b.slotType] || 0) - b.creditApplied} da pagare)</span>`
                    : `<span class="payment-status ${b.paid ? 'paid' : 'unpaid'}">${b.paid ? '✓ Pagato' : 'Non pagato'}</span>`;
        return `<tr id="brow-${b.id}" class="${rowClass}">
            <td>${dateStr}</td>
            <td>${b.time}</td>
            <td>${SLOT_NAMES[b.slotType]}</td>
            <td>${statusCell}</td>
            <td>${(isCancelPending || isCancelled) ? '—' : methodLabel(b.paymentMethod)}</td>
            <td class="paidat-cell">${(isCancelPending || isCancelled) ? '—' : fmtPaidAt(b.paidAt)}</td>
            <td class="booking-actions">
                ${!isCancelled ? `<button class="btn-row-edit" onclick="startEditBookingRow('${b.id}', ${index})" title="Modifica">✏️</button>` : ''}
                <button class="btn-row-delete" onclick="deleteBookingFromClients('${b.id}', '${nEsc}')" title="Elimina">🗑️</button>
            </td>
        </tr>`;
    }).join('');

    const creditRecord = CreditStorage.getRecord(client.whatsapp, client.email);
    let creditHTML = '';
    if (creditRecord && creditRecord.history && creditRecord.history.length > 0) {
        const history = [...creditRecord.history].reverse().slice(0, 8);
        creditHTML = `<div class="client-credit-section">
            <h4>💳 Storico credito — saldo: €${credit}
                <button class="btn-clear-credit" onclick="clearClientCredit('${client.whatsapp.replace(/'/g,"\\'")}', '${(client.email||'').replace(/'/g,"\\'")}', ${index})" title="Elimina storico credito">🗑️ Elimina storico</button>
            </h4>
            <div class="client-credit-history">
                ${history.map(e => {
                    const d = new Date(e.date);
                    const ds = `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`;
                    const sign = e.amount >= 0 ? '+' : '';
                    const cls  = e.amount >= 0 ? 'plus' : 'minus';
                    return `<div class="credit-history-row">
                        <span class="credit-history-date">${ds}</span>
                        <span class="credit-history-note">${e.note || 'Movimento'}</span>
                        <span class="credit-history-amount ${cls}">${sign}€${Math.abs(e.amount)}</span>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
    }

    const wEsc  = client.whatsapp.replace(/'/g, "\\'");
    const emEsc = (client.email || '').replace(/'/g, "\\'");
    const nEsc  = client.name.replace(/'/g, "\\'");

    card.innerHTML = `
        <div class="client-card-header" onclick="toggleClientCard('client-card-${index}', ${index})">
            <div class="client-info-block">
                <div class="client-name">${client.name}</div>
                <div class="client-contacts">
                    <span>📱 ${client.whatsapp}</span>
                    ${client.email ? `<span>✉️ ${client.email}</span>` : ''}
                </div>
            </div>
            <div class="client-stats-block">${statsHTML}</div>
            <div class="client-chevron">▼</div>
        </div>
        <div class="client-card-body">
            <div class="client-contact-edit" id="cedit-section-${index}">
                <div class="client-view-mode">
                    <button class="btn-edit-contact" onclick="event.stopPropagation(); startEditClient(${index}, '${wEsc}', '${emEsc}', '${nEsc}')">✏️ Modifica contatto</button>
                </div>
                <div class="client-edit-mode" style="display:none;">
                    <div class="client-edit-fields">
                        <label>Nome<input type="text"  id="cedit-name-${index}"  value="${client.name}"></label>
                        <label>WhatsApp<input type="tel"   id="cedit-phone-${index}" value="${client.whatsapp}"></label>
                        <label>Email<input type="email" id="cedit-email-${index}" value="${client.email || ''}"></label>
                    </div>
                    <div class="client-edit-actions">
                        <button class="btn-save-edit"   onclick="saveClientEdit(${index}, '${wEsc}', '${emEsc}')">✓ Salva</button>
                        <button class="btn-cancel-edit" onclick="cancelClientEdit(${index})">✕ Annulla</button>
                    </div>
                </div>
            </div>
            <div class="client-bookings-section">
                <table class="client-bookings-table">
                    <thead><tr>
                        <th>Data</th><th>Ora</th><th>Tipo</th><th>Stato</th><th>Metodo</th><th>Data Pag.</th><th></th>
                    </tr></thead>
                    <tbody>${bookingsHTML}</tbody>
                </table>
            </div>
            ${creditHTML}
        </div>
    `;

    return card;
}

function startEditClient(index, whatsapp, email, name) {
    const section = document.getElementById(`cedit-section-${index}`);
    if (!section) return;
    section.querySelector('.client-view-mode').style.display = 'none';
    section.querySelector('.client-edit-mode').style.display = 'flex';
}

function cancelClientEdit(index) {
    const section = document.getElementById(`cedit-section-${index}`);
    if (!section) return;
    section.querySelector('.client-view-mode').style.display = 'flex';
    section.querySelector('.client-edit-mode').style.display = 'none';
}

function saveClientEdit(index, oldWhatsapp, oldEmail) {
    const newName     = document.getElementById(`cedit-name-${index}`).value.trim();
    const newWhatsapp = document.getElementById(`cedit-phone-${index}`).value.trim();
    const newEmail    = document.getElementById(`cedit-email-${index}`).value.trim();
    if (!newName || !newWhatsapp) { alert('Nome e WhatsApp sono obbligatori.'); return; }

    const normOld = normalizePhone(oldWhatsapp);
    const bookings = BookingStorage.getAllBookings();
    bookings.forEach(b => {
        const phoneMatch = normOld && normalizePhone(b.whatsapp) === normOld;
        const emailMatch = oldEmail && b.email && b.email.toLowerCase() === oldEmail.toLowerCase();
        if (phoneMatch || emailMatch) {
            b.name = newName;
            b.whatsapp = newWhatsapp;
            b.email = newEmail;
        }
    });
    BookingStorage.replaceAllBookings(bookings);

    // Update stored credit record contact info
    const creditKey = CreditStorage._findKey(oldWhatsapp, oldEmail);
    if (creditKey) {
        const all = CreditStorage._getAll();
        all[creditKey].name = newName;
        all[creditKey].whatsapp = newWhatsapp;
        all[creditKey].email = newEmail;
        CreditStorage._save(all);
    }

    openClientIndex = null; // name sort may shift the card index
    renderClientsTab();
}

function startEditBookingRow(bookingId, clientIndex) {
    const booking = BookingStorage.getAllBookings().find(b => b.id === bookingId);
    if (!booking) return;

    const row = document.getElementById(`brow-${bookingId}`);
    if (!row) return;

    row._origHTML  = row.innerHTML;
    row._origClass = row.className;
    row.classList.add('editing');

    const methods = [
        { v: 'contanti', l: '💵 Contanti' },
        { v: 'carta',    l: '💳 Carta'    },
        { v: 'iban',     l: '🏦 IBAN'     },
        { v: 'credito',  l: '✨ Credito'  }
    ];
    const methodOpts = methods.map(m =>
        `<option value="${m.v}" ${booking.paymentMethod === m.v ? 'selected' : ''}>${m.l}</option>`
    ).join('');

    const dateStr = booking.date.split('-').reverse().join('/');
    const paidAtInput = booking.paidAt
        ? new Date(booking.paidAt).toISOString().split('T')[0]
        : '';

    row.innerHTML = `
        <td>${dateStr}</td>
        <td>${booking.time}</td>
        <td>${SLOT_NAMES[booking.slotType]}</td>
        <td>
            <select id="bedit-paid-${bookingId}">
                <option value="true"  ${booking.paid  ? 'selected' : ''}>✓ Pagato</option>
                <option value="false" ${!booking.paid ? 'selected' : ''}>✗ Non pagato</option>
            </select>
        </td>
        <td>
            <select id="bedit-method-${bookingId}">
                <option value="">—</option>
                ${methodOpts}
            </select>
        </td>
        <td>
            <input type="date" id="bedit-paidat-${bookingId}" value="${paidAtInput}" class="bedit-date-input">
        </td>
        <td class="booking-actions">
            <button class="btn-row-save"   onclick="saveBookingRowEdit('${bookingId}', ${clientIndex})" title="Salva">✓</button>
            <button class="btn-row-cancel" onclick="cancelBookingRowEdit('${bookingId}')" title="Annulla">✕</button>
        </td>
    `;
}

function cancelBookingRowEdit(bookingId) {
    const row = document.getElementById(`brow-${bookingId}`);
    if (!row || !row._origHTML) return;
    row.innerHTML  = row._origHTML;
    row.className  = row._origClass || '';
    delete row._origHTML;
    delete row._origClass;
}

function saveBookingRowEdit(bookingId, clientIndex) {
    const newPaid   = document.getElementById(`bedit-paid-${bookingId}`).value === 'true';
    const newMethod = document.getElementById(`bedit-method-${bookingId}`).value;

    const bookings = BookingStorage.getAllBookings();
    const booking  = bookings.find(b => b.id === bookingId);
    if (!booking) return;

    const oldPaid   = booking.paid;
    const oldMethod = booking.paymentMethod || '';
    const price     = SLOT_PRICES[booking.slotType];

    // Credit adjustments
    if (oldPaid && oldMethod === 'credito' && !newPaid) {
        // Was paid with credit → unpaid: refund
        CreditStorage.addCredit(booking.whatsapp, booking.email, booking.name, price,
            `Rimborso modifica pagamento ${booking.date} ${booking.time}`);
    } else if (!oldPaid && newPaid && newMethod === 'credito') {
        // Unpaid → paid with credit: deduct
        const bal = CreditStorage.getBalance(booking.whatsapp, booking.email);
        if (bal < price) { alert(`Credito insufficiente (€${bal} < €${price})`); return; }
        CreditStorage.addCredit(booking.whatsapp, booking.email, booking.name, -price,
            `Pagamento lezione ${booking.date} ${booking.time} con credito`);
    } else if (oldPaid && oldMethod === 'credito' && newPaid && newMethod !== 'credito') {
        // Credit → other method: refund credit
        CreditStorage.addCredit(booking.whatsapp, booking.email, booking.name, price,
            `Cambio metodo da credito — lezione ${booking.date} ${booking.time}`);
    } else if (oldPaid && oldMethod !== 'credito' && newPaid && newMethod === 'credito') {
        // Other method → credit: deduct credit
        const bal = CreditStorage.getBalance(booking.whatsapp, booking.email);
        if (bal < price) { alert(`Credito insufficiente (€${bal} < €${price})`); return; }
        CreditStorage.addCredit(booking.whatsapp, booking.email, booking.name, -price,
            `Cambio metodo a credito — lezione ${booking.date} ${booking.time}`);
    }

    const newPaidAtRaw = document.getElementById(`bedit-paidat-${bookingId}`)?.value;

    booking.paid          = newPaid;
    booking.paymentMethod = newMethod || undefined;
    if (newPaid) {
        // Use manually entered date if provided, otherwise keep existing or use now
        booking.paidAt = newPaidAtRaw
            ? new Date(newPaidAtRaw + 'T12:00:00').toISOString()
            : (booking.paidAt || new Date().toISOString());
    } else {
        delete booking.paidAt;
    }

    BookingStorage.replaceAllBookings(bookings);
    renderClientsTab();
}

function deleteBookingFromClients(bookingId, bookingName) {
    if (!confirm(`Eliminare la prenotazione di ${bookingName}?\n\nQuesta operazione non può essere annullata.`)) return;

    const bookings = BookingStorage.getAllBookings();
    const idx = bookings.findIndex(b => b.id === bookingId);
    if (idx !== -1) {
        const b = bookings[idx];
        if (b.paid && b.paymentMethod === 'credito') {
            CreditStorage.addCredit(b.whatsapp, b.email, b.name, SLOT_PRICES[b.slotType],
                `Rimborso cancellazione lezione ${b.date} ${b.time}`);
        }
        bookings.splice(idx, 1);
        BookingStorage.replaceAllBookings(bookings);
    }
    renderClientsTab();
}

function clearClientCredit(whatsapp, email, index) {
    if (!confirm('Eliminare tutto lo storico credito di questo cliente?\n\nSaldo e movimenti verranno azzerati.')) return;
    CreditStorage.clearRecord(whatsapp, email);
    renderClientsTab();
    const card = document.getElementById(`client-card-${index}`);
    if (card) { card.classList.add('open'); card.querySelector('.client-card-body').style.display = 'block'; }
}

// Initialize admin when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAdmin);
} else {
    initAdmin();
}
