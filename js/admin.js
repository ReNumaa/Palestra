// Admin dashboard functionality

const ADMIN_SALT = 'tb-admin-2026';
const ADMIN_HASH = '036f86f46401f7c2c915c266c56db12210c784961d783c8efa32532fa7fb4fe5';
async function _checkAdminPassword(password) {
    const buf = await crypto.subtle.digest('SHA-256',
        new TextEncoder().encode(ADMIN_SALT + password));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('') === ADMIN_HASH;
}

// ── Privacy toggle ──────────────────────────────────────────────────────────
const SENSITIVE_IDS = ['totalUnpaid','totalDebtors','totalCreditors','totalCreditAmount','monthlyRevenue','revenueChange'];
let _sensitiveHidden = localStorage.getItem('adminSensitiveHidden') === 'true';

// Scrive il valore nell'elemento e lo salva in dataset; rispetta la modalità privacy
function sensitiveSet(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.dataset.realValue = value;
    el.textContent = _sensitiveHidden ? '***' : value;
}

function _applyPrivacyMask() {
    SENSITIVE_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (_sensitiveHidden) {
            if (!el.dataset.realValue) el.dataset.realValue = el.textContent;
            el.textContent = '***';
        } else {
            if (el.dataset.realValue) el.textContent = el.dataset.realValue;
        }
    });
    // Liste debitori/creditori: nascondile del tutto quando i dati sono nascosti
    const dl = document.getElementById('debtorsList');
    const cl = document.getElementById('creditsList');
    if (_sensitiveHidden) {
        if (dl) dl.style.display = 'none';
        if (cl) cl.style.display = 'none';
    }
    const btn = document.getElementById('btnToggleSensitive');
    if (btn) btn.textContent = _sensitiveHidden ? '👁 Mostra dati' : '👁 Nascondi dati';
}

function toggleSensitiveData() {
    _sensitiveHidden = !_sensitiveHidden;
    localStorage.setItem('adminSensitiveHidden', _sensitiveHidden ? 'true' : 'false');
    _applyPrivacyMask();
}
// ────────────────────────────────────────────────────────────────────────────
let adminWeekOffset = 0;
let selectedAdminDay = null;

// Analytics filter state
let currentFilter = 'this-month';
let customFilterFrom = null;
let customFilterTo = null;
// Cache in memoria per le stats: caricato fresh da Supabase ad ogni loadDashboardData().
// Non finisce in localStorage — bypass del limite di 5MB.
let _statsBookings = null;

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
    // Usa _statsBookings (fetch Supabase) se disponibile, altrimenti localStorage
    const allBookings = _statsBookings ?? BookingStorage.getAllBookings();
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
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const password = document.getElementById('adminPassword').value;

        if (await _checkAdminPassword(password)) {
            sessionStorage.setItem('adminAuth', 'true');
            // Non persistere in localStorage: la sessione admin dura fino alla chiusura del tab
            showDashboard();
        } else {
            alert('Password errata!');
        }
    });
}

async function checkAuth() {
    // 1. Se Supabase è disponibile, verifica che l'utente abbia il claim admin nel JWT
    if (typeof supabaseClient !== 'undefined') {
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            const role = session?.user?.app_metadata?.role;
            if (role === 'admin') {
                // Utente autenticato con claim admin → accesso garantito senza password
                sessionStorage.setItem('adminAuth', 'true');
                localStorage.removeItem('adminAuthenticated'); // pulizia flag legacy
                showDashboard();
                return;
            }
            if (session) {
                // Utente autenticato ma non admin → nega l'accesso anche se ha il flag locale
                sessionStorage.removeItem('adminAuth');
                localStorage.removeItem('adminAuthenticated');
                return; // rimane sulla schermata di login
            }
            // session null = non loggato → cade sul check locale (password fallback)
        } catch (_) { /* supabase non raggiungibile — cade sul check locale */ }
    }

    // 2. Fallback: controlla sessione locale (password hash, solo se Supabase non raggiungibile)
    // NOTA: questo path è meno sicuro — le RPC admin verificano is_admin() server-side comunque
    if (sessionStorage.getItem('adminAuth') === 'true') {
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
    checkWeeklyReportBanner();
}

// Tab Management
function setupTabs() {
    const tabs = document.querySelectorAll('.admin-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            if (!tabName) return;
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
    } else if (tabName === 'settings') {
        renderSettingsTab();
    } else if (tabName === 'registro') {
        renderRegistroTab();
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

async function loadDashboardData() {
    BookingStorage.processPendingCancellations();

    // Fetch stats fresh da Supabase: periodo corrente + precedente + prossimi 90 gg.
    // Non usa localStorage — bypassa il limite di 5MB per dataset grandi.
    if (typeof BookingStorage !== 'undefined' && typeof supabaseClient !== 'undefined') {
        const { from, to } = getFilterDateRange(currentFilter);
        const prevRange = getPreviousFilterDateRange(currentFilter);
        const extFrom = prevRange
            ? new Date(Math.min(prevRange.from.getTime(), from.getTime()))
            : from;
        const extTo = new Date(Math.max(
            to.getTime(),
            Date.now() + 90 * 24 * 60 * 60 * 1000  // includi prossimi 90 gg per contesto
        ));
        _statsBookings = await BookingStorage.fetchForAdmin(
            _localDateStr(extFrom),
            _localDateStr(extTo)
        );
    }

    const filteredBookings = getFilteredBookings(currentFilter);
    const allBookings = _statsBookings ?? BookingStorage.getAllBookings();

    updateStatsCards(filteredBookings, allBookings);
    drawBookingsChart(filteredBookings);
    drawTypeChart(filteredBookings);
    updateBookingsTable(filteredBookings);
    updatePopularTimes(filteredBookings);

    // Aggiorna il pannello dettaglio se è aperto
    if (_currentStatDetail) {
        const panel = document.getElementById('statsDetailPanel');
        if (panel && panel.style.display !== 'none') {
            switch (_currentStatDetail) {
                case 'fatturato':    renderFatturatoDetail(panel);    break;
                case 'prenotazioni': renderPrenotazioniDetail(panel); break;
                case 'clienti':      renderClientiDetail(panel);      break;
                case 'occupancy':    renderOccupancyDetail(panel);    break;
            }
        }
    }
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

    // Revenue — exclude free lessons (lezione-gratuita) from revenue stats
    const revenue = filteredBookings
        .filter(b => b.paymentMethod !== 'lezione-gratuita')
        .reduce((t, b) => t + (SLOT_PRICES[b.slotType] || 0), 0);
    sensitiveSet('monthlyRevenue', `€${revenue}`);
    const prevRevBookings = prevRange ? allBookings.filter(b => {
        const d = new Date(b.date + 'T00:00:00');
        return d >= prevRange.from && d <= prevRange.to && b.paymentMethod !== 'lezione-gratuita';
    }) : [];
    const prevAllBookings = prevRange ? allBookings.filter(b => {
        if (b.status === 'cancelled') return false;
        const d = new Date(b.date + 'T00:00:00');
        return d >= prevRange.from && d <= prevRange.to;
    }) : [];
    const prevRev = prevRevBookings.reduce((t, b) => t + (SLOT_PRICES[b.slotType] || 0), 0);
    calcChange(revenue, prevRev, document.getElementById('revenueChange'));
    sensitiveSet('revenueChange', document.getElementById('revenueChange').textContent);

    // Total bookings
    document.getElementById('totalBookings').textContent = filteredBookings.length;
    calcChange(filteredBookings.length, prevAllBookings.length, document.getElementById('bookingsChange'));

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
        slots.forEach(s => { totalSlots += SLOT_MAX_CAPACITY[s.type] || 0; });
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
    if (!canvas) return;
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
    if (!canvas) return;
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
    if (!tbody) return;
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
            <td>${_escHtml(booking.name)}</td>
            <td>${SLOT_NAMES[booking.slotType]}</td>
            <td>${_escHtml(booking.whatsapp)}</td>
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
    if (!document.getElementById('popularTimes')) return;
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
const BACKUP_KEYS = [
    'gym_bookings', 'gym_stats', 'gym_users', 'gym_credits',
    'gym_manual_debts', 'gym_bonus', 'weeklyScheduleTemplate',
    'scheduleOverrides', 'scheduleVersion', 'gym_debt_threshold',
    'gym_cancellation_mode', 'gym_cert_scadenza_editable',
    'gym_cert_block_expired', 'gym_cert_block_not_set',
    'gym_assic_block_expired', 'gym_assic_block_not_set', 'dataClearedByUser',
    'dataLastCleared'
];

function exportBackup() {
    const backup = {
        version: 1,
        exportedAt: new Date().toISOString(),
        data: {}
    };
    BACKUP_KEYS.forEach(key => {
        const val = localStorage.getItem(key);
        if (val !== null) backup.data[key] = val;
    });
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gym-backup-${_localDateStr()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    const s = document.getElementById('backupStatus');
    if (s) s.textContent = `✅ Backup esportato il ${new Date().toLocaleString('it-IT')}`;
}

function importBackup(input) {
    const file = input.files[0];
    if (!file) return;
    const pw = prompt('Inserisci la password per importare il backup:');
    if (pw !== 'Palestra123') {
        alert('Password errata');
        input.value = '';
        return;
    }
    const reader = new FileReader();
    reader.onload = async e => {
        try {
            const backup = JSON.parse(e.target.result);
            if (!backup?.data || typeof backup.data !== 'object') throw new Error('Formato non valido');
            const keyCount = Object.keys(backup.data).length;
            const exportDate = backup.exportedAt
                ? new Date(backup.exportedAt).toLocaleString('it-IT')
                : 'data sconosciuta';
            if (!confirm(`Ripristinare il backup del ${exportDate}?\n\nConterrà ${keyCount} sezioni di dati.\n\n⚠️ ATTENZIONE: tutti i dati attuali verranno sovrascritti.`)) {
                input.value = '';
                return;
            }
            BACKUP_KEYS.forEach(key => {
                if (backup.data[key] !== undefined) {
                    localStorage.setItem(key, backup.data[key]);
                }
            });
            const s = document.getElementById('backupStatus');
            if (s) s.textContent = '⏳ Ripristino su Supabase in corso...';

            // ── Push dati ripristinati su Supabase ──────────────
            if (typeof supabaseClient !== 'undefined') {
                try {
                    const promises = [];

                    // 1. Bookings — upsert completo
                    const bookings = JSON.parse(backup.data.gym_bookings || '[]');
                    if (Array.isArray(bookings) && bookings.length > 0) {
                        const bRows = bookings
                            .filter(b => b.id && !b.id.startsWith('demo-') && !b.id.startsWith('_avail_'))
                            .map(b => ({
                                local_id:                  b.id,
                                user_id:                   b.userId || null,
                                date:                      b.date,
                                time:                      b.time,
                                slot_type:                 b.slotType,
                                name:                      b.name,
                                email:                     b.email,
                                whatsapp:                  b.whatsapp,
                                notes:                     b.notes || '',
                                status:                    b.status || 'confirmed',
                                paid:                      b.paid || false,
                                payment_method:            b.paymentMethod || null,
                                paid_at:                   b.paidAt || null,
                                credit_applied:            b.creditApplied || 0,
                                created_at:                b.createdAt,
                                date_display:              b.dateDisplay || '',
                                cancellation_requested_at: b.cancellationRequestedAt || null,
                                cancelled_at:              b.cancelledAt || null,
                                cancelled_payment_method:  b.cancelledPaymentMethod || null,
                                cancelled_paid_at:         b.cancelledPaidAt || null,
                                cancelled_with_bonus:      b.cancelledWithBonus || false,
                                cancelled_with_penalty:    b.cancelledWithPenalty || false,
                                cancelled_refund_pct:      b.cancelledRefundPct ?? null,
                            }));
                        if (bRows.length > 0) {
                            promises.push(supabaseClient.from('bookings').upsert(bRows, { onConflict: 'local_id' }));
                        }
                    }

                    // 2. Credits
                    const credits = JSON.parse(backup.data.gym_credits || '{}');
                    const cRows = Object.values(credits).map(r => ({
                        name:         r.name,
                        whatsapp:     r.whatsapp || null,
                        email:        (r.email || '').toLowerCase(),
                        balance:      r.balance || 0,
                        free_balance: r.freeBalance || 0,
                    })).filter(r => r.email);
                    if (cRows.length > 0) {
                        promises.push(supabaseClient.from('credits').upsert(cRows, { onConflict: 'email' }));
                    }

                    // 3. Manual debts
                    const debts = JSON.parse(backup.data.gym_manual_debts || '{}');
                    const dRows = Object.values(debts).map(r => ({
                        name:     r.name,
                        whatsapp: r.whatsapp || null,
                        email:    (r.email || '').toLowerCase(),
                        balance:  r.balance || 0,
                        history:  r.history || [],
                    })).filter(r => r.email);
                    if (dRows.length > 0) {
                        promises.push(supabaseClient.from('manual_debts').upsert(dRows, { onConflict: 'email' }));
                    }

                    // 4. Bonuses
                    const bonus = JSON.parse(backup.data.gym_bonus || '{}');
                    const bonRows = Object.values(bonus).map(r => ({
                        name:             r.name,
                        whatsapp:         r.whatsapp || null,
                        email:            (r.email || '').toLowerCase(),
                        bonus:            r.bonus ?? 1,
                        last_reset_month: r.lastResetMonth || null,
                    })).filter(r => r.email);
                    if (bonRows.length > 0) {
                        promises.push(supabaseClient.from('bonuses').upsert(bonRows, { onConflict: 'email' }));
                    }

                    // 5. Schedule overrides
                    const overrides = JSON.parse(backup.data.scheduleOverrides || '{}');
                    const oRows = [];
                    for (const [dateStr, slots] of Object.entries(overrides)) {
                        for (const slot of (Array.isArray(slots) ? slots : [])) {
                            oRows.push({ date: dateStr, time: slot.time, slot_type: slot.type, extras: slot.extras || [] });
                        }
                    }
                    if (oRows.length > 0) {
                        promises.push(supabaseClient.from('schedule_overrides').upsert(oRows, { onConflict: 'date,time' }));
                    }

                    // 6. Credit history (only offline-added entries from viewer emergency export)
                    if (backup.data._credit_history) {
                        const chRows = JSON.parse(backup.data._credit_history || '[]');
                        if (chRows.length > 0) {
                            // Wait for credits upsert to complete first so IDs exist
                            await Promise.allSettled(promises);
                            promises.length = 0;
                            // Link to credit IDs
                            const creditsRes = await supabaseClient.from('credits').select('id,email');
                            const emailToId = {};
                            if (creditsRes.data) creditsRes.data.forEach(c => { emailToId[c.email] = c.id; });
                            const histRows = chRows.filter(h => emailToId[h.email]).map(h => ({
                                credit_id: emailToId[h.email],
                                amount: h.amount || 0,
                                display_amount: h.display_amount ?? h.amount,
                                note: h.note || '',
                                created_at: h.created_at,
                            }));
                            if (histRows.length > 0) {
                                promises.push(supabaseClient.from('credit_history').insert(histRows));
                            }
                        }
                    }

                    const results = await Promise.allSettled(promises);
                    const errors = results.filter(r => r.status === 'fulfilled' && r.value?.error);
                    if (errors.length > 0) {
                        console.warn('[Backup] Alcuni upsert con errore:', errors.map(r => r.value.error.message));
                    }
                    console.log('[Backup] Ripristino Supabase completato:', results.length, 'operazioni');
                } catch (e) {
                    console.error('[Backup] Errore ripristino Supabase:', e);
                }
            }

            if (s) s.textContent = '✅ Backup ripristinato. Ricarico...';
            setTimeout(() => location.reload(), 1200);
        } catch (err) {
            alert('Errore durante l\'importazione: ' + err.message);
            const s = document.getElementById('backupStatus');
            if (s) s.textContent = '❌ Importazione fallita: ' + err.message;
        } finally {
            input.value = '';
        }
    };
    reader.readAsText(file);
}

async function exportData() {
    const date = _localDateStr();

    // Mostra loading sul bottone durante il fetch
    const btn = document.querySelector('[onclick="exportData()"]');
    const origLabel = btn?.innerHTML;
    if (btn) { btn.innerHTML = '⏳ Caricamento...'; btn.disabled = true; }

    // ── Helpers ───────────────────────────────────────────────────
    function fmtDate(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        return isNaN(d) ? iso : d.toLocaleDateString('it-IT');
    }
    function fmtDateTime(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        return isNaN(d) ? iso : d.toLocaleString('it-IT');
    }

    const SLOT_LABEL = {
        'personal-training': 'Personal Training',
        'small-group':       'Small Group',
        'group-class':       'Lezione di Gruppo'
    };
    const STATUS_LABEL = {
        'confirmed':              'Confermata',
        'cancelled':              'Annullata',
        'cancellation_requested': 'Annullamento richiesto'
    };
    const METHOD_LABEL = {
        contanti: 'Contanti', carta: 'Carta', iban: 'Bonifico', credito: 'Credito', 'lezione-gratuita': 'Gratuita'
    };
    const DAYS = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];

    // ── Fonti dati ─────────────────────────────────────────────────
    // Fetch tutti i booking direttamente da Supabase (bypass localStorage size limit)
    const allBookings  = (await BookingStorage.fetchForAdmin(null, null))
                            .sort((a, b) => b.date.localeCompare(a.date));
    const allUsers     = UserStorage.getAll();
    const allCredits   = CreditStorage._getAll();
    const allDebts     = ManualDebtStorage._getAll();
    const allOverrides = BookingStorage.getScheduleOverrides() || {};

    // ── 1. CLIENTI ─────────────────────────────────────────────────
    const clientMap = {};
    allUsers.forEach(u => {
        const key = (u.email || u.whatsapp || '').toLowerCase();
        clientMap[key] = {
            nome:      u.name,
            email:     u.email || '',
            whatsapp:  u.whatsapp || '',
            cert_scad: u.certificatoMedicoScadenza || '',
            tipo:      u.provider === 'google' ? 'Google OAuth'
                     : u.passwordHash          ? 'Email/Password'
                                               : 'Profilo admin',
            creato_il: fmtDate(u.createdAt)
        };
    });
    allBookings.forEach(b => {
        const key = (b.email || normalizePhone(b.whatsapp) || '').toLowerCase();
        if (!clientMap[key]) {
            clientMap[key] = {
                nome: b.name, email: b.email || '', whatsapp: b.whatsapp || '',
                cert_scad: '', tipo: 'Solo prenotazioni', creato_il: fmtDate(b.createdAt)
            };
        }
    });
    const sheetClienti = [
        ['Nome','Email','WhatsApp','Scadenza Cert. Medico','Tipo Account','Creato Il'],
        ...Object.values(clientMap)
            .sort((a, b) => a.nome.localeCompare(b.nome))
            .map(c => [c.nome, c.email, c.whatsapp, c.cert_scad, c.tipo, c.creato_il])
    ];

    // ── 2. PRENOTAZIONI ────────────────────────────────────────────
    const sheetPrenotazioni = [
        ['ID','Data','Orario','Tipo Lezione','Nome','Email','WhatsApp','Note',
         'Stato','Pagato','Metodo Pagamento','Data Pagamento','Credito Applicato (€)','Creato Il'],
        ...allBookings.map(b => [
            b.id,
            fmtDate(b.date + 'T12:00:00'),
            b.time,
            SLOT_LABEL[b.slotType] || b.slotType,
            b.name, b.email, b.whatsapp,
            b.notes || '',
            STATUS_LABEL[b.status] || 'Confermata',
            b.paid ? 'Sì' : 'No',
            METHOD_LABEL[b.paymentMethod] || '',
            fmtDateTime(b.paidAt),
            b.creditApplied || 0,
            fmtDateTime(b.createdAt)
        ])
    ];

    // ── 3. PAGAMENTI ───────────────────────────────────────────────
    const pagRows = [];
    allBookings.filter(b => b.paid || (b.creditApplied || 0) > 0).forEach(b => {
        pagRows.push([
            fmtDateTime(b.paidAt || b.date + 'T12:00:00'),
            b.name, b.email, b.whatsapp,
            SLOT_LABEL[b.slotType] || b.slotType,
            SLOT_PRICES[b.slotType] || 0,
            METHOD_LABEL[b.paymentMethod] || '',
            b.paidAt || b.date, ''
        ]);
    });
    Object.values(allCredits).forEach(c => {
        (c.history || []).forEach(h => {
            pagRows.push([
                fmtDateTime(h.date),
                c.name, c.email, c.whatsapp,
                'Credito', h.displayAmount ?? h.amount,
                'Credito', h.date, h.note || ''
            ]);
        });
    });
    Object.values(allDebts).forEach(d => {
        (d.history || []).filter(h => h.amount < 0).forEach(h => {
            pagRows.push([
                fmtDateTime(h.date),
                d.name, d.email, d.whatsapp,
                'Saldo debito manuale', Math.abs(h.amount),
                METHOD_LABEL[h.method] || h.method || '',
                h.date, h.note || ''
            ]);
        });
    });
    pagRows.sort((a, b) => (b[7] || '').localeCompare(a[7] || ''));
    pagRows.forEach(r => r.splice(7, 1)); // rimuovi colonna ts interna
    const sheetPagamenti = [
        ['Data','Nome','Email','WhatsApp','Descrizione','Importo (€)','Metodo','Nota'],
        ...pagRows
    ];

    // ── 4. CREDITI ─────────────────────────────────────────────────
    const sheetCrediti = [
        ['Nome','Email','WhatsApp','Saldo Attuale (€)','Data Movimento','Variazione (€)','Nota'],
        ...Object.values(allCredits)
            .sort((a, b) => a.name.localeCompare(b.name))
            .flatMap(c => (c.history || []).map(h => [
                c.name, c.email, c.whatsapp, c.balance,
                fmtDateTime(h.date), h.amount, h.note || ''
            ]))
    ];

    // ── 5. DEBITI MANUALI ──────────────────────────────────────────
    const sheetDebiti = [
        ['Nome','Email','WhatsApp','Saldo Attuale (€)','Data Movimento','Variazione (€)','Nota','Metodo'],
        ...Object.values(allDebts)
            .sort((a, b) => a.name.localeCompare(b.name))
            .flatMap(d => (d.history || []).map(h => [
                d.name, d.email, d.whatsapp, d.balance,
                fmtDateTime(h.date), h.amount, h.note || '',
                METHOD_LABEL[h.method] || h.method || ''
            ]))
    ];

    // ── 6. GESTIONE ORARI ──────────────────────────────────────────
    const sheetOrari = [
        ['Data','Giorno','Orario','Tipo Lezione','Cliente Assegnato','Booking ID'],
        ...Object.entries(allOverrides)
            .sort(([a], [b]) => a.localeCompare(b))
            .flatMap(([dateStr, slots]) => {
                const d = new Date(dateStr + 'T12:00:00');
                return (slots || []).map(s => [
                    fmtDate(dateStr + 'T12:00:00'),
                    DAYS[d.getDay()],
                    s.time,
                    SLOT_LABEL[s.type] || s.type,
                    s.client || '',
                    s.bookingId || ''
                ]);
            })
    ];

    // ── Crea workbook Excel con SheetJS ───────────────────────────
    const wb = XLSX.utils.book_new();
    const sheets = [
        ['Clienti',        sheetClienti],
        ['Prenotazioni',   sheetPrenotazioni],
        ['Pagamenti',      sheetPagamenti],
        ['Crediti',        sheetCrediti],
        ['Debiti Manuali', sheetDebiti],
        ['Gestione Orari', sheetOrari],
    ];

    sheets.forEach(([name, data]) => {
        const ws = XLSX.utils.aoa_to_sheet(data);
        // Larghezza colonne automatica (stima dal contenuto)
        const colWidths = data[0].map((_, ci) =>
            Math.min(50, Math.max(10, ...data.map(r => String(r[ci] ?? '').length)))
        );
        ws['!cols'] = colWidths.map(w => ({ wch: w }));
        XLSX.utils.book_append_sheet(wb, ws, name);
    });

    const filename = `TB_Training_export_${date}.xlsx`;
    XLSX.writeFile(wb, filename);

    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '✅ Scaricato!';
        setTimeout(() => { btn.innerHTML = origLabel; }, 2500);
    }
}

function resetDemoData() {
    if (confirm('⚠️ ATTENZIONE: Questo cancellerà tutti i dati esistenti e genererà nuovi dati demo da Gennaio al 15 Marzo. Continuare?')) {
        localStorage.removeItem(BookingStorage.BOOKINGS_KEY);
        localStorage.removeItem(BookingStorage.STATS_KEY);
        localStorage.removeItem(CreditStorage.CREDITS_KEY);
        localStorage.removeItem(ManualDebtStorage.DEBTS_KEY);
        localStorage.removeItem(BonusStorage.BONUS_KEY);
        localStorage.removeItem('scheduleOverrides');
        localStorage.removeItem('dataClearedByUser');
        BookingStorage.initializeDemoData();
        alert('✅ Dati demo rigenerati con successo!');
        location.reload();
    }
}

async function clearAllData() {
    if (!confirm('⚠️ ATTENZIONE: Questo eliminerà definitivamente tutte le prenotazioni e i dati sia localmente che su Supabase. NON verranno generati nuovi dati demo. Continuare?')) return;

    // 1. Cancella Supabase PRIMA del localStorage — così il sync post-reload
    //    non riscarica dati che stiamo per eliminare.
    if (typeof supabaseClient !== 'undefined') {
        // Disiscriviti dai canali Realtime per evitare che un evento
        // postgres_changes faccia syncFromSupabase() prima che il clear sia completo
        try { supabaseClient.removeAllChannels(); } catch (_) {}

        const { error: rpcErr } = await supabaseClient.rpc('admin_clear_all_data');
        if (rpcErr) {
            console.error('[Supabase] admin_clear_all_data RPC error:', rpcErr.message, rpcErr.code);
            alert('⚠️ Errore durante la cancellazione su Supabase: ' + rpcErr.message);
            return;
        }
        const now = new Date().toISOString();
        const { error: settingsErr } = await supabaseClient.from('app_settings').upsert([
            { key: 'data_cleared_at', value: { ts: now }, updated_at: now },
        ]);
        if (settingsErr) console.error('[Supabase] clearAllData - upsert app_settings error:', settingsErr.message);
        localStorage.setItem('dataLastCleared', now);
    }

    // 2. Cancella localStorage DOPO che Supabase è vuoto
    localStorage.removeItem(BookingStorage.BOOKINGS_KEY);
    localStorage.removeItem(BookingStorage.STATS_KEY);
    localStorage.removeItem(CreditStorage.CREDITS_KEY);
    localStorage.removeItem(ManualDebtStorage.DEBTS_KEY);
    localStorage.removeItem(BonusStorage.BONUS_KEY);
    localStorage.removeItem('scheduleOverrides');
    localStorage.removeItem(UserStorage.USERS_KEY);
    localStorage.setItem('dataClearedByUser', 'true');

    // 3. Svuota cache PWA — previene dati fantasma dal service worker
    if ('caches' in window) {
        try {
            const keys = await caches.keys();
            await Promise.all(keys.map(k => caches.delete(k)));
        } catch (_) {}
    }

    alert('✅ Tutti i dati sono stati eliminati (localStorage + Supabase).');
    location.reload();
}

function pruneOldData() {
    const months = parseInt(prompt(
        'Eliminare dati demo e prenotazioni più vecchie di quanti mesi?\n(es. 6 = tutto ciò che precede 6 mesi fa)',
        '12'
    ));
    if (!months || isNaN(months) || months <= 0) return;

    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    const cutoffStr = _localDateStr(cutoff);

    if (!confirm(`⚠️ Verranno eliminati definitivamente:\n• Tutte le prenotazioni DEMO\n• Prenotazioni reali con data precedente al ${cutoff.toLocaleDateString('it-IT')}\n• Voci di credito/transazioni precedenti a tale data\n\nI saldi credito rimangono invariati. Continuare?`)) return;

    // 1. Rimuovi prenotazioni demo (sempre) + prenotazioni reali più vecchie del cutoff
    const bookings = BookingStorage.getAllBookings();
    BookingStorage.replaceAllBookings(
        bookings.filter(b => !b.id?.startsWith('demo-') && b.date >= cutoffStr)
    );
    // Impedisci che initializeDemoData rigeneri i dati al prossimo reload
    localStorage.setItem('dataClearedByUser', 'true');

    // 2. Pruning storico crediti (mantieni il saldo, rimuovi solo le voci vecchie)
    const allCredits = JSON.parse(localStorage.getItem(CreditStorage.CREDITS_KEY) || '{}');
    Object.values(allCredits).forEach(rec => {
        if (rec.history) {
            rec.history = rec.history.filter(e => new Date(e.date) >= cutoff);
        }
    });
    localStorage.setItem(CreditStorage.CREDITS_KEY, JSON.stringify(allCredits));

    // 3. Pruning storico debiti manuali (mantieni il saldo, rimuovi solo le voci vecchie)
    const allDebts = JSON.parse(localStorage.getItem(ManualDebtStorage.DEBTS_KEY) || '{}');
    Object.values(allDebts).forEach(rec => {
        if (rec.history) {
            rec.history = rec.history.filter(e => new Date(e.date) >= cutoff);
        }
    });
    localStorage.setItem(ManualDebtStorage.DEBTS_KEY, JSON.stringify(allDebts));

    alert('✅ Dati storici e demo eliminati. I saldi credito sono rimasti invariati.');
    location.reload();
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

// ── Extra spot management ──────────────────────────────────────────────────

function toggleExtraPicker(date, time) {
    const id = 'xpick-' + date + '-' + time.replace(/[: -]/g, '');
    const el = document.getElementById(id);
    if (el) el.style.display = el.style.display === 'none' ? 'flex' : 'none';
}

function addExtraSpotToSlot(date, time, extraType) {
    BookingStorage.addExtraSpot(date, time, extraType);
    toggleExtraPicker(date, time); // chiudi picker
    if (window._currentAdminDate) renderAdminDayView(window._currentAdminDate);
}

// ── Admin: prenota per un cliente specifico ────────────────────────────────
// Stato picker (evita JSON inline negli onclick che causa SyntaxError)
let _clientPickerState = { date: '', time: '', client: null };

function openClientBookingPicker(date, time, pickerId) {
    const picker = document.getElementById(pickerId);
    if (!picker) return;
    _clientPickerState.date = date;
    _clientPickerState.time = time;
    _clientPickerState.client = null;

    picker.innerHTML = `
        <div style="width:100%;padding:8px 0 4px;display:flex;flex-direction:column;gap:8px">
            <div style="display:flex;gap:8px;align-items:center">
                <input id="clientSearchInput" type="text" placeholder="Cerca cliente…"
                    autocomplete="off"
                    style="flex:1;padding:7px 10px;border:1px solid #ddd;border-radius:8px;font-size:13px">
                <button onclick="toggleExtraPicker('${date}','${time}')"
                    style="background:none;border:none;color:#999;cursor:pointer;font-size:18px;padding:0 4px">✕</button>
            </div>
            <div id="clientSearchResults" style="display:flex;flex-direction:column;gap:4px;max-height:180px;overflow-y:auto"></div>
            <div id="clientBookingConfirm" style="display:none"></div>
        </div>
    `;

    document.getElementById('clientSearchInput').addEventListener('input', function() {
        _filterClientList(this.value);
    });
}

function _filterClientList(query) {
    const resultsEl = document.getElementById('clientSearchResults');
    if (!resultsEl) return;
    const q = query.toLowerCase().trim();
    if (!q) { resultsEl.innerHTML = ''; return; }
    const clients = UserStorage.getAll().filter(c =>
        c.name.toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q)
    );
    if (!clients.length) {
        resultsEl.innerHTML = `<div style="font-size:12px;color:#999;padding:4px 8px">Nessun cliente trovato</div>`;
        return;
    }
    resultsEl.innerHTML = '';
    clients.slice(0, 10).forEach((c, idx) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:6px 10px;border:1px solid #eee;border-radius:8px;cursor:pointer;background:#fff;font-size:13px';
        row.innerHTML = `
            <div>
                <div style="font-weight:600">${_escHtml(c.name)}</div>
                <div style="font-size:11px;color:#888">${_escHtml(c.email || c.whatsapp || '')}</div>
            </div>
            <span style="font-size:11px;color:#aaa">›</span>
        `;
        row.addEventListener('click', () => _selectClientForBooking(c));
        resultsEl.appendChild(row);
    });
}

function _selectClientForBooking(client) {
    _clientPickerState.client = client;
    const confirmEl = document.getElementById('clientBookingConfirm');
    const resultsEl = document.getElementById('clientSearchResults');
    const inputEl   = document.getElementById('clientSearchInput');
    if (!confirmEl || !resultsEl) return;
    resultsEl.style.display = 'none';
    if (inputEl) inputEl.style.display = 'none';
    confirmEl.style.display = 'block';

    const btnBack = document.createElement('button');
    btnBack.textContent = '← Indietro';
    btnBack.style.cssText = 'background:none;border:1px solid #ddd;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:12px;color:#666';
    btnBack.addEventListener('click', () => {
        _clientPickerState.client = null;
        resultsEl.style.display = 'flex';
        if (inputEl) { inputEl.style.display = ''; inputEl.value = ''; }
        confirmEl.style.display = 'none';
        _filterClientList('');
    });

    const btnAut = document.createElement('button');
    btnAut.className = 'extra-picker-btn personal-training';
    btnAut.textContent = 'Autonomia';
    btnAut.addEventListener('click', () => bookForClient('personal-training'));

    const btnGrp = document.createElement('button');
    btnGrp.className = 'extra-picker-btn small-group';
    btnGrp.textContent = 'Lezione di Gruppo';
    btnGrp.addEventListener('click', () => bookForClient('small-group'));

    confirmEl.innerHTML = `
        <div style="font-size:13px;margin-bottom:8px">
            <strong>${_escHtml(client.name)}</strong>
            <span style="color:#888;font-size:11px"> · ${_escHtml(client.email || client.whatsapp || '')}</span>
        </div>
    `;
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
    btnRow.appendChild(btnAut);
    btnRow.appendChild(btnGrp);
    btnRow.appendChild(btnBack);
    confirmEl.appendChild(btnRow);
}

async function bookForClient(slotType) {
    // Guard: sessione admin deve essere attiva (il backend verifica is_admin() sulle RPC)
    if (sessionStorage.getItem('adminAuth') !== 'true') {
        showToast('Sessione admin scaduta. Ricarica la pagina e accedi di nuovo.', 'error');
        return;
    }
    const { date, time, client } = _clientPickerState;
    if (!client) return;

    // Cerca user_id del cliente in Supabase (per reminders push)
    let clientUserId = null;
    if (typeof supabaseClient !== 'undefined' && client.email) {
        try {
            const { data: prof } = await supabaseClient
                .from('profiles').select('id').eq('email', client.email).maybeSingle();
            clientUserId = prof?.id || null;
        } catch {}
    }

    // Calcola dateDisplay
    const [y, m, d] = date.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const days = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
    const months = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
    const dateDisplay = `${days[dt.getDay()]} ${d} ${months[m - 1]}`;

    const booking = {
        name:        client.name,
        email:       client.email || '',
        whatsapp:    client.whatsapp || '',
        notes:       '',
        date,
        time,
        slotType,
        dateDisplay,
    };

    // Aggiungi slot extra solo se lo slot è pieno (altrimenti usa posti già disponibili)
    const remaining = BookingStorage.getRemainingSpots(date, time, slotType);
    if (remaining <= 0) BookingStorage.addExtraSpot(date, time, slotType);
    const result = await BookingStorage.saveBookingForClient(booking, clientUserId);
    if (!result.ok) {
        if (result.error === 'slot_full') showToast('Slot pieno — qualcun altro ha prenotato prima.', 'error');
        else showToast('⚠️ Errore: prenotazione non riuscita. Riprova.', 'error');
        if (window._currentAdminDate) renderAdminDayView(window._currentAdminDate);
        return;
    }
    BookingStorage.fulfillPendingCancellations(date, time);

    showToast(`Prenotazione aggiunta per ${client.name}`, 'success');
    if (window._currentAdminDate) renderAdminDayView(window._currentAdminDate);
}

function removeExtraSpotFromSlot(date, time, extraType) {
    if (!BookingStorage.removeExtraSpot(date, time, extraType)) {
        showToast('Prima cancella la prenotazione in corso, poi potrai rimuovere lo slot extra.', 'error');
        return;
    }
    if (window._currentAdminDate) renderAdminDayView(window._currentAdminDate);
}

// Helper: HTML di una singola card partecipante
function _buildParticipantCard(booking) {
    const isPaid = booking.paid || false;
    const isCancelPending = booking.status === 'cancellation_requested';
    const unpaidAmount = getUnpaidAmountForContact(booking.whatsapp, booking.email);
    const hasDebts = unpaidAmount > 0;
    const cancelPendingBadge = isCancelPending
        ? `<div class="admin-cancel-pending-badge">⏳ Annullamento richiesto</div>` : '';
    const userRecord = _getUserRecord(booking.email, booking.whatsapp);
    const certScad  = userRecord?.certificatoMedicoScadenza;
    const assicScad = userRecord?.assicurazioneScadenza;
    const hasCF     = !!userRecord?.codiceFiscale;
    const emE = (booking.email || '').replace(/'/g, "\\'");
    const waE = (booking.whatsapp || '').replace(/'/g, "\\'");
    const nmE2 = booking.name.replace(/'/g, "\\'");
    const _todayStr   = _localDateStr();
    const _today30    = new Date(); _today30.setDate(_today30.getDate() + 30);
    const _today30Str = _localDateStr(_today30);

    // Cert medico + codice fiscale: combinati se entrambi mancanti
    let certBadge = '';
    const certMissing = !certScad;
    const cfMissing   = !hasCF;
    if (certMissing && cfMissing) {
        certBadge = `<div class="cert-expired-badge cert-expired-badge--clickable" onclick="openCertModal(this,'${emE}','${waE}','${nmE2}')">🏥 Imposta Cert. Med + Codice Fiscale</div>`;
    } else if (certMissing) {
        certBadge = `<div class="cert-expired-badge cert-expired-badge--clickable" onclick="openCertModal(this,'${emE}','${waE}','${nmE2}')">🏥 Imposta scadenza Cert. Med</div>`;
    } else if (certScad < _todayStr) {
        const [cy, cm, cd] = certScad.split('-');
        certBadge = `<div class="cert-expired-badge cert-expired-badge--clickable" onclick="openCertModal(this,'${emE}','${waE}','${nmE2}')">🏥 Cert. scaduto il ${cd}/${cm}/${cy}</div>`;
    } else if (certScad <= _today30Str) {
        const [cy, cm, cd] = certScad.split('-');
        certBadge = `<div class="cert-expired-badge cert-expired-badge--clickable" style="background:#fffbeb;border-color:#fde68a;color:#92400e;border-left:3px solid #f59e0b" onclick="openCertModal(this,'${emE}','${waE}','${nmE2}')">⏳ Cert. Med scade il ${cd}/${cm}/${cy}</div>`;
    }

    // Codice fiscale warning (solo se cert è presente ma CF manca)
    let cfBadge = '';
    if (cfMissing && !certMissing) {
        cfBadge = `<div class="cert-expired-badge cert-expired-badge--clickable" style="background:#fef3c7;border-color:#fde68a;color:#92400e;border-left:3px solid #f59e0b">🏥 Imposta Codice Fiscale</div>`;
    }

    let assicBadge = '';
    if (!assicScad) {
        assicBadge = `<div class="cert-expired-badge cert-expired-badge--clickable" style="background:#fef3c7;border-color:#fde68a;color:#92400e;border-left:3px solid #f59e0b" onclick="openAssicModal(this,'${emE}','${waE}','${nmE2}')">📋 Imposta Assicurazione</div>`;
    } else if (assicScad < _todayStr) {
        const [ay, am, ad] = assicScad.split('-');
        assicBadge = `<div class="cert-expired-badge cert-expired-badge--clickable" onclick="openAssicModal(this,'${emE}','${waE}','${nmE2}')">📋 Assic. scaduta il ${ad}/${am}/${ay}</div>`;
    } else if (assicScad <= _today30Str) {
        const [ay, am, ad] = assicScad.split('-');
        assicBadge = `<div class="cert-expired-badge cert-expired-badge--clickable" style="background:#fffbeb;border-color:#fde68a;color:#92400e;border-left:3px solid #f59e0b" onclick="openAssicModal(this,'${emE}','${waE}','${nmE2}')">⏳ Assic. scade il ${ad}/${am}/${ay}</div>`;
    }
    const wa  = booking.whatsapp.replace(/'/g, "\\'");
    const em  = booking.email.replace(/'/g, "\\'");
    const nm  = booking.name.replace(/'/g, "\\'");
    return `
        <div class="admin-participant-card${isCancelPending ? ' cancel-pending' : ''}">
            <button class="btn-delete-booking" onclick="deleteBooking('${booking.id}','${nm}')">✕</button>
            <div class="participant-card-content">
                <div class="participant-name">${_escHtml(booking.name)}</div>
                <div class="participant-contact">📱 ${_escHtml(booking.whatsapp)}</div>
                ${booking.notes ? `<div class="participant-notes">📝 ${_escHtml(booking.notes)}</div>` : ''}
                ${cancelPendingBadge}${certBadge}${cfBadge}${assicBadge}
                ${hasDebts ? `<div class="debt-warning" onclick="openDebtPopup('${wa}','${em}','${nm}')">⚠️ Da pagare: €${unpaidAmount}</div>` : ''}
                ${!isCancelPending ? (isPaid
                    ? `<div class="payment-status paid">✓ Pagato</div>`
                    : (!hasDebts ? `<div class="payment-status unpaid" onclick="openDebtPopup('${wa}','${em}','${nm}')">⊕ Segna pagato</div>` : '')) : ''}
            </div>
        </div>`;
}

// Helper: griglia partecipanti per una lista di booking
function _buildParticipantsSection(bookings) {
    if (!bookings || bookings.length === 0)
        return '<div class="empty-slot">Nessuna prenotazione</div>';
    return '<div class="admin-participants-grid">' + bookings.map(_buildParticipantCard).join('') + '</div>';
}

// ────────────────────────────────────────────────────────────────────────────

function renderAdminDayView(dateInfo) {
    window._currentAdminDate = dateInfo;
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

    const date     = dateInfo.formatted;
    const timeSlot = scheduledSlot.time;
    const mainType = scheduledSlot.type;
    const extras   = scheduledSlot.extras || [];

    // Escape per uso in onclick inline
    const dE = date.replace(/'/g, "\\'");
    const tE = timeSlot.replace(/'/g, "\\'");

    // Tutti i booking per questa data+ora (tutti i tipi)
    const allBookings = BookingStorage.getBookingsForSlot(date, timeSlot);

    // Info slot principale
    const mainEffCap   = BookingStorage.getEffectiveCapacity(date, timeSlot, mainType);
    const mainConfirmed = allBookings.filter(b => b.status === 'confirmed' && (!b.slotType || b.slotType === mainType)).length;
    const mainRemaining = mainEffCap - mainConfirmed;

    // Tipi extra diversi dal principale
    const extraTypes = [...new Set(extras.map(e => e.type).filter(t => t !== mainType))];
    const hasMixedExtras = extraTypes.length > 0;

    // ── Header ──────────────────────────────────────────────────────────────
    const capStr = mainType !== 'group-class'
        ? `${mainConfirmed}/${mainEffCap} posti (${mainRemaining > 0 ? mainRemaining + ' liberi' : 'COMPLETO'})`
        : '';
    const pickerId = 'xpick-' + date + '-' + timeSlot.replace(/[: -]/g, '');

    const headerHTML = `
        <div class="admin-slot-header">
            <div class="admin-slot-time">🕐 ${timeSlot}</div>
            <div class="admin-slot-type">${SLOT_NAMES[mainType]}</div>
            ${capStr ? `<div class="admin-slot-capacity">${capStr}</div>` : ''}
            <button class="btn-add-extra" onclick="toggleExtraPicker('${dE}','${tE}')" title="Aggiungi posto extra">＋</button>
        </div>
        <div id="${pickerId}" class="extra-picker" style="display:none;">
            <span class="extra-picker-label">Aggiungi 1 posto:</span>
            <button class="extra-picker-btn personal-training" onclick="addExtraSpotToSlot('${dE}','${tE}','personal-training')">Autonomia</button>
            <button class="extra-picker-btn small-group" onclick="addExtraSpotToSlot('${dE}','${tE}','small-group')">Lezione di Gruppo</button>
            <button class="extra-picker-btn" style="background:#6c5ce7;color:#fff" onclick="openClientBookingPicker('${dE}','${tE}','${pickerId}')">Persona</button>
        </div>`;

    // ── Extras bar ──────────────────────────────────────────────────────────
    let extrasBarHTML = '';
    if (extras.length > 0) {
        const allExtraTypes = [...new Set(extras.map(e => e.type))];
        const badges = allExtraTypes.map(t => {
            const cnt = extras.filter(e => e.type === t).length;
            return `<span class="extra-badge ${t}">${SLOT_NAMES[t]} ×${cnt}
                <button class="btn-remove-extra" onclick="removeExtraSpotFromSlot('${dE}','${tE}','${t}')" title="Rimuovi un posto">−</button>
            </span>`;
        }).join('');
        extrasBarHTML = `<div class="admin-extras-bar">Extra: ${badges}</div>`;
    }

    // ── Participants ─────────────────────────────────────────────────────────
    let participantsHTML;
    if (!hasMixedExtras) {
        // Vista unificata (nessun extra o solo extra dello stesso tipo)
        const mainBookings = allBookings.filter(b => !b.slotType || b.slotType === mainType);
        participantsHTML = _buildParticipantsSection(mainBookings);
    } else {
        // Vista divisa in colonne
        const mainBookings = allBookings.filter(b => !b.slotType || b.slotType === mainType);
        const leftCol = `
            <div class="split-column">
                <div class="split-col-title ${mainType}">${SLOT_NAMES[mainType]}</div>
                ${_buildParticipantsSection(mainBookings)}
            </div>`;
        const rightCols = extraTypes.map(t => {
            const eb = allBookings.filter(b => b.slotType === t);
            const ec = BookingStorage.getEffectiveCapacity(date, timeSlot, t);
            const eConf = eb.filter(b => b.status === 'confirmed').length;
            const eRem  = ec - eConf;
            return `
                <div class="split-col-divider-v"></div>
                <div class="split-column">
                    <div class="split-col-title ${t}">${SLOT_NAMES[t]} ${eConf}/${ec}${eRem > 0 ? ` · ${eRem} liberi` : ' · COMPLETO'}</div>
                    ${_buildParticipantsSection(eb)}
                </div>`;
        }).join('');
        participantsHTML = `<div class="admin-slot-split">${leftCol}${rightCols}</div>`;
    }

    slotCard.innerHTML = headerHTML + extrasBarHTML + participantsHTML;
    return slotCard;
}


function deleteBooking(bookingId, bookingName) {
    const bookings = BookingStorage.getAllBookings();
    const index = bookings.findIndex(b => b.id === bookingId);
    if (index === -1) return;

    const booking = bookings[index];
    const price = SLOT_PRICES[booking.slotType] || 0;
    const hasBonus = BonusStorage.getBonus(booking.whatsapp, booking.email) > 0;

    // Build cancel popup
    const overlay = document.createElement('div');
    overlay.className = 'cancel-popup-overlay';
    overlay.innerHTML = `
        <div class="cancel-popup">
            <div class="cancel-popup-header">Annulla prenotazione</div>
            <div class="cancel-popup-body">
                <p class="cancel-popup-name">${bookingName}</p>
                <p class="cancel-popup-detail">${booking.date} · ${booking.time} · €${price}</p>

                <label class="cancel-popup-label">Utilizza bonus</label>
                <div class="cancel-popup-toggle-row">
                    <button class="cancel-toggle-btn${hasBonus ? '' : ' disabled'}" data-val="false" data-group="bonus" ${!hasBonus ? 'disabled' : ''}>No</button>
                    <button class="cancel-toggle-btn${hasBonus ? '' : ' disabled'}" data-val="true" data-group="bonus" ${!hasBonus ? 'disabled' : ''}>Sì</button>
                </div>
                ${!hasBonus ? '<p class="cancel-popup-hint">Nessun bonus disponibile</p>' : ''}

                <label class="cancel-popup-label">Rimborso</label>
                <div class="cancel-popup-toggle-row">
                    <button class="cancel-toggle-btn" data-val="0" data-group="refund">0%</button>
                    <button class="cancel-toggle-btn" data-val="50" data-group="refund">50%</button>
                    <button class="cancel-toggle-btn" data-val="100" data-group="refund">100%</button>
                </div>

                <div class="cancel-popup-actions">
                    <button class="cancel-popup-btn cancel-popup-btn--cancel">Annulla</button>
                    <button class="cancel-popup-btn cancel-popup-btn--confirm" disabled>Conferma</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));

    // Toggle selection logic
    let selectedBonus = hasBonus ? null : false;  // auto-select No if no bonus available
    let selectedRefund = null;

    if (!hasBonus) {
        // Pre-select "No" for bonus when unavailable
        const noBonusBtn = overlay.querySelector('[data-group="bonus"][data-val="false"]');
        if (noBonusBtn) noBonusBtn.classList.add('active');
        selectedBonus = false;
    }

    overlay.querySelectorAll('.cancel-toggle-btn:not(.disabled)').forEach(btn => {
        btn.addEventListener('click', () => {
            const group = btn.dataset.group;
            overlay.querySelectorAll(`[data-group="${group}"]`).forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (group === 'bonus') selectedBonus = btn.dataset.val === 'true';
            if (group === 'refund') selectedRefund = parseInt(btn.dataset.val);
            // Enable confirm when both selections made
            const confirmBtn = overlay.querySelector('.cancel-popup-btn--confirm');
            confirmBtn.disabled = (selectedBonus === null || selectedRefund === null);
        });
    });

    // Close
    const closePopup = () => {
        overlay.classList.remove('visible');
        setTimeout(() => overlay.remove(), 250);
    };
    overlay.querySelector('.cancel-popup-btn--cancel').addEventListener('click', closePopup);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closePopup(); });

    // Confirm
    overlay.querySelector('.cancel-popup-btn--confirm').addEventListener('click', () => {
        const useBonus = selectedBonus;
        const refundPct = selectedRefund;

        if (useBonus) {
            BonusStorage.useBonus(booking.whatsapp, booking.email, booking.name);
        }

        // Calculate refund based on percentage
        const isCancellationPending = booking.status === 'cancellation_requested';
        const wasPaid = !isCancellationPending && (booking.paid || (booking.creditApplied || 0) > 0);
        const creditToRefund = wasPaid ? Math.round(price * refundPct / 100 * 100) / 100 : 0;

        if (creditToRefund > 0) {
            const refundLabel = refundPct < 100
                ? `Rimborso ${refundPct}% lezione ${booking.date}`
                : `Rimborso lezione ${booking.date}`;
            CreditStorage.addCredit(
                booking.whatsapp,
                booking.email,
                booking.name,
                creditToRefund,
                refundLabel,
                null, false, false, null, booking.paymentMethod || ''
            );
        }

        // If partial refund (50%) and paid, add penalty debt for the remaining 50%
        if (wasPaid && refundPct === 0) {
            // No refund, no debt — the money is simply kept
        }

        // Mark as cancelled
        bookings[index].cancelledPaymentMethod = booking.paymentMethod;
        bookings[index].cancelledPaidAt = booking.paidAt;
        bookings[index].status = 'cancelled';
        bookings[index].cancelledAt = new Date().toISOString();
        bookings[index].cancelledWithBonus = useBonus;
        bookings[index].cancelledRefundPct = refundPct;
        bookings[index].paid = false;
        bookings[index].paymentMethod = null;
        bookings[index].paidAt = null;
        bookings[index].creditApplied = 0;
        BookingStorage.replaceAllBookings(bookings);

        // Notifica slot disponibile
        if (typeof notifySlotAvailable === 'function') notifySlotAvailable(booking);

        // Re-render
        if (selectedAdminDay) renderAdminDayView(selectedAdminDay);

        closePopup();
    });
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
        const daySlots = overrides[dateInfo.formatted] || [];
        const hasSlots = daySlots.length > 0;
        const hasMissingClient = daySlots.some(s => s.type === SLOT_TYPES.GROUP_CLASS && !s.client);
        html += `<button class="schedule-day-tab ${isActive} ${hasSlots ? 'has-slots' : ''} ${hasMissingClient ? 'missing-client' : ''}" onclick="selectScheduleDate('${dateInfo.formatted}', '${dateInfo.dayName}')">
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
                       <span class="slot-client-name">${_escHtml(client.name)}</span>
                       <span class="slot-client-sub">${_escHtml(client.whatsapp || client.email)}</span>
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
async function selectSlotClient(timeSlot, index) {
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
    const result = await BookingStorage.saveBooking(booking);
    if (!result.ok) {
        showToast('⚠️ Errore: prenotazione non riuscita. Riprova.', 'error');
        renderAllTimeSlots();
        return;
    }

    // Store client and bookingId in the override for display purposes
    slot.client = { name: user.name, email: user.email, whatsapp: user.whatsapp || '' };
    slot.bookingId = result.booking.id;
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
let clientCertFilter  = false;
let clientAssicFilter = false;

function clientHasCertIssue(client) {
    const userRecord = _getUserRecord(client.email, client.whatsapp);
    const certScad = userRecord?.certificatoMedicoScadenza || '';
    if (!certScad) return true;
    return certScad < _localDateStr();
}

function clientHasAssicIssue(client) {
    const userRecord = _getUserRecord(client.email, client.whatsapp);
    const assicScad = userRecord?.assicurazioneScadenza || '';
    if (!assicScad) return true;
    return assicScad < _localDateStr();
}

function toggleCertFilter() {
    clientCertFilter = !clientCertFilter;
    if (clientCertFilter) clientAssicFilter = false;
    document.getElementById('certFilterBtn')?.classList.toggle('active', clientCertFilter);
    document.getElementById('assicFilterBtn')?.classList.toggle('active', false);
    renderClientsTab();
}

function toggleAssicFilter() {
    clientAssicFilter = !clientAssicFilter;
    if (clientAssicFilter) clientCertFilter = false;
    document.getElementById('assicFilterBtn')?.classList.toggle('active', clientAssicFilter);
    document.getElementById('certFilterBtn')?.classList.toggle('active', false);
    renderClientsTab();
}

// ── Settings Tab ──────────────────────────────────────────────────────────────

function renderSettingsTab() {
    const mode = CancellationModeStorage.get();
    document.querySelectorAll('input[name="cancellationMode"]').forEach(radio => {
        radio.checked = radio.value === mode;
    });
    renderDebtThresholdUI();
    renderCertEditableUI();
    renderCertBlockUI();
    renderAssicBlockUI();
}

function saveCancellationMode(mode) {
    CancellationModeStorage.set(mode);
}

function renderCertEditableUI() {
    const editable = CertEditableStorage.get();
    const toggle = document.getElementById('certEditableToggle');
    const text   = document.getElementById('certEditableText');
    if (toggle) toggle.checked = editable;
    if (text)   text.textContent = editable ? 'Modificabile dal cliente' : 'Non modificabile';
}

function saveCertEditable(val) {
    CertEditableStorage.set(val);
    const text = document.getElementById('certEditableText');
    if (text) text.textContent = val ? 'Modificabile dal cliente' : 'Non modificabile';
}

function renderCertBlockUI() {
    const expiredToggle = document.getElementById('certBlockExpiredToggle');
    const expiredText   = document.getElementById('certBlockExpiredText');
    const notSetToggle  = document.getElementById('certBlockNotSetToggle');
    const notSetText    = document.getElementById('certBlockNotSetText');
    if (expiredToggle) expiredToggle.checked = CertBookingStorage.getBlockIfExpired();
    if (expiredText)   expiredText.textContent = CertBookingStorage.getBlockIfExpired() ? 'Bloccato' : 'Non bloccato';
    if (notSetToggle)  notSetToggle.checked = CertBookingStorage.getBlockIfNotSet();
    if (notSetText)    notSetText.textContent = CertBookingStorage.getBlockIfNotSet() ? 'Bloccato' : 'Non bloccato';
}

function saveCertBlockExpired(val) {
    CertBookingStorage.setBlockIfExpired(val);
    const text = document.getElementById('certBlockExpiredText');
    if (text) text.textContent = val ? 'Bloccato' : 'Non bloccato';
}

function saveCertBlockNotSet(val) {
    CertBookingStorage.setBlockIfNotSet(val);
    const text = document.getElementById('certBlockNotSetText');
    if (text) text.textContent = val ? 'Bloccato' : 'Non bloccato';
}

function renderAssicBlockUI() {
    const expiredToggle = document.getElementById('assicBlockExpiredToggle');
    const expiredText   = document.getElementById('assicBlockExpiredText');
    const notSetToggle  = document.getElementById('assicBlockNotSetToggle');
    const notSetText    = document.getElementById('assicBlockNotSetText');
    if (expiredToggle) expiredToggle.checked = AssicBookingStorage.getBlockIfExpired();
    if (expiredText)   expiredText.textContent = AssicBookingStorage.getBlockIfExpired() ? 'Bloccato' : 'Non bloccato';
    if (notSetToggle)  notSetToggle.checked = AssicBookingStorage.getBlockIfNotSet();
    if (notSetText)    notSetText.textContent = AssicBookingStorage.getBlockIfNotSet() ? 'Bloccato' : 'Non bloccato';
}

function saveAssicBlockExpired(val) {
    AssicBookingStorage.setBlockIfExpired(val);
    const text = document.getElementById('assicBlockExpiredText');
    if (text) text.textContent = val ? 'Bloccato' : 'Non bloccato';
}

function saveAssicBlockNotSet(val) {
    AssicBookingStorage.setBlockIfNotSet(val);
    const text = document.getElementById('assicBlockNotSetText');
    if (text) text.textContent = val ? 'Bloccato' : 'Non bloccato';
}

function renderDebtThresholdUI() {
    const input = document.getElementById('debtThresholdInput');
    if (input) {
        const val = DebtThresholdStorage.get();
        input.value = val > 0 ? val : '';
    }
}

function saveDebtThreshold() {
    const input = document.getElementById('debtThresholdInput');
    const val = parseFloat(input.value) || 0;
    DebtThresholdStorage.set(val);
    const msg = document.getElementById('debtThresholdSavedMsg');
    if (msg) {
        msg.style.display = 'block';
        setTimeout(() => { msg.style.display = 'none'; }, 2000);
    }
}

function renderPaymentsTab() {
    const debtors = getDebtors();
    const totalUnpaid = debtors.reduce((sum, debtor) => sum + debtor.totalAmount, 0);
    // Net debts against credit balance: only show as creditor if credit > debt
    // NB: getUnpaidAmountForContact include GIÀ ManualDebtStorage.getBalance(),
    //     quindi NON sommare manualDebt una seconda volta.
    const credits = CreditStorage.getAllWithBalance()
        .map(c => {
            const totalDebt  = getUnpaidAmountForContact(c.whatsapp, c.email);
            const netBalance = Math.round(Math.max(0, c.balance - totalDebt) * 100) / 100;
            return { ...c, balance: netBalance };
        })
        .filter(c => c.balance > 0);
    const totalCredit = credits.reduce((s, c) => s + c.balance, 0);

    // Update stats
    sensitiveSet('totalUnpaid', `€${totalUnpaid}`);
    sensitiveSet('totalDebtors', debtors.length);
    sensitiveSet('totalCreditors', credits.length);
    sensitiveSet('totalCreditAmount', `€${totalCredit}`);

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

function deleteManualDebtEntry(whatsapp, email, entryDate) {
    if (!confirm('Eliminare questa voce di debito manuale?')) return;
    if (typeof supabaseClient !== 'undefined') {
        (async () => {
            const { data, error } = await supabaseClient.rpc('admin_delete_debt_entry', {
                p_email:      (email || '').toLowerCase(),
                p_entry_date: entryDate,
            });
            if (error) {
                console.error('[Supabase] admin_delete_debt_entry error:', error.message);
                alert('⚠️ Errore: ' + error.message);
                return;
            }
            if (!data?.success) {
                alert('⚠️ Voce non trovata.');
                return;
            }
            console.log('[admin_delete_debt_entry]', data);
            await ManualDebtStorage.syncFromSupabase();
            renderPaymentsTab();
            showToast('Voce eliminata.', 'success');
        })();
    } else {
        const ok = ManualDebtStorage.deleteDebtEntry(whatsapp, email, entryDate);
        if (ok) {
            renderPaymentsTab();
            showToast('Voce eliminata.', 'success');
        }
    }
}

function toggleCreditsList() {
    if (_sensitiveHidden) return;
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
                <div class="debtor-booking-details">📅 ${dateStr} — ${_escHtml(entry.note || 'Movimento credito')}</div>
                <div class="debtor-booking-price" style="color:${color}">${sign}€${Math.abs(entry.amount)}</div>
            </div>`;
    });
    historyHTML += '</div>';

    card.innerHTML = `
        <div class="debtor-card-header" onclick="toggleDebtorCard('credit-card-${index}')">
            <div class="debtor-info">
                <div class="debtor-name">${_escHtml(credit.name)}</div>
                <div class="debtor-contact">
                    <span>📱 ${_escHtml(credit.whatsapp)}</span>
                    <span>✉️ ${_escHtml(credit.email)}</span>
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
    if (_sensitiveHidden) return;
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
        if (!booking.paid && bookingHasPassed(booking) && booking.status !== 'cancelled') {
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

    // Net credit balance against raw debt: only show as debtor if debt > credit
    for (const key in debtorsMap) {
        const d = debtorsMap[key];
        const creditBalance = CreditStorage.getBalance(d.whatsapp, d.email);
        d.totalAmount = Math.round((d.totalAmount - creditBalance) * 100) / 100;
    }
    return Object.values(debtorsMap)
        .filter(d => d.totalAmount > 0)
        .sort((a, b) => b.totalAmount - a.totalAmount);
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
        const allEntries = record ? [...record.history].reverse().filter(e => e.amount > 0) : [];
        allEntries.forEach(entry => {
            const d = new Date(entry.date);
            const dateStr = `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`;
            const safeDate = entry.date.replace(/'/g, "\\'");
            bookingsHTML += `
                <div class="debtor-booking-item debtor-booking-manual">
                    <div class="debtor-booking-details">✏️ ${dateStr} &nbsp;·&nbsp; ${_escHtml(entry.note || 'Debito manuale')}</div>
                    <div style="display:flex;align-items:center;gap:0.5rem;">
                        <div class="debtor-booking-price">€${entry.amount}</div>
                        <button class="debt-entry-delete-btn" onclick="deleteManualDebtEntry('${safeW}','${safeE}','${safeDate}')" title="Elimina questa voce">✕</button>
                    </div>
                </div>`;
        });
    }
    bookingsHTML += '</div>';

    card.innerHTML = `
        <div class="debtor-card-header" onclick="toggleDebtorCard('debtor-card-${cardId}')">
            <div class="debtor-info">
                <div class="debtor-name">${_escHtml(debtor.name)}</div>
                <div class="debtor-contact">
                    <span>📱 ${_escHtml(debtor.whatsapp)}</span>
                    <span>✉️ ${_escHtml(debtor.email)}</span>
                </div>
            </div>
            <div class="debtor-amount">€${debtor.totalAmount}</div>
            <div class="debtor-toggle">▼</div>
        </div>
        <div class="debtor-card-body">
            ${bookingsHTML}
            <div class="debtor-pay-footer">
                <div class="debtor-pay-total">Totale: <strong>€${debtor.totalAmount}</strong></div>
                <select class="debt-method-select debtor-method-select">
                    <option value="" disabled selected>Seleziona…</option>
                    <option value="contanti">💵 Contanti</option>
                    <option value="carta">💳 Carta</option>
                    <option value="iban">🏦 Bonifico</option>
                    <option value="lezione-gratuita">🎁 Gratuita</option>
                </select>
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
    const methodSelect = footer.querySelector('.debtor-method-select');
    const method = methodSelect ? methodSelect.value : '';
    if (!method) { showToast('Seleziona un metodo di pagamento', 'error'); return; }
    const methodLabels = { contanti: '💵 Contanti', carta: '💳 Carta', iban: '🏦 Bonifico' };

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

    // Use existing credit to offset the total, then collect only the net cash
    const existingCredit = CreditStorage.getRecord(whatsapp, email)?.balance || 0;
    const creditToUse = Math.round(Math.min(existingCredit, totalPaid) * 100) / 100;
    if (creditToUse > 0) {
        CreditStorage.addCredit(whatsapp, email, name, -creditToUse,
            `Credito applicato (${method})`);
    }
    const cashCollected = Math.round((totalPaid - creditToUse) * 100) / 100;
    if (cashCollected > 0) {
        const methodLabel = { contanti: 'Contanti', carta: 'Carta', iban: 'Bonifico' }[method] || method;
        CreditStorage.addCredit(whatsapp, email, name, 0,
            `${methodLabel} ricevuto`, cashCollected);
    }

    // Update card in-place — keep it visible with paid state
    const card = btn.closest('.debtor-card');

    // Strike through all booking rows
    card.querySelectorAll('.debtor-booking-item').forEach(row => {
        row.classList.add('debtor-booking-paid');
        const priceEl = row.querySelector('.debtor-booking-price');
        if (priceEl) priceEl.style.color = '#22c55e';
    });

    // Replace the pay footer with a success banner
    const displayAmount = cashCollected > 0 ? cashCollected : `0 (credito)`;
    footer.innerHTML = `
        <div class="debtor-pay-success">
            <span>✓</span>
            <span>€${displayAmount} incassati · ${methodLabels[method] || method}</span>
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
    sensitiveSet('totalUnpaid', `€${updatedDebtors.reduce((s, d) => s + d.totalAmount, 0)}`);
    sensitiveSet('totalDebtors', updatedDebtors.length);
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

    totalUnpaid += ManualDebtStorage.getBalance(whatsapp, email);
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
    const manualSelect = document.getElementById('manualMethodSelect');
    if (manualSelect) manualSelect.value = '';
    document.getElementById('manualMethodField').style.display = isDebt ? 'none' : '';
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
    // Legacy button handler (kept for safety)
    btn.closest('.debt-method-btns')?.querySelectorAll('.debt-method-btn').forEach(b => b.classList.remove('active'));
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
    const manualSelect = document.getElementById('manualMethodSelect');
    const method = manualSelect ? manualSelect.value : '';
    if (!method && _manualEntryType !== 'debt') { showToast('Seleziona un metodo di pagamento', 'error'); return; }
    const { name, whatsapp, email } = _manualEntryContact;

    const savedType = _manualEntryType;
    closeManualEntryPopup();

    if (_manualEntryType === 'debt') {
        // Debito: operazione atomica server-side via RPC
        (async () => {
            if (typeof supabaseClient !== 'undefined') {
                const { data, error } = await supabaseClient.rpc('admin_add_debt', {
                    p_email:      email.toLowerCase(),
                    p_whatsapp:   whatsapp || null,
                    p_name:       name,
                    p_amount:     amount,
                    p_note:       note || 'Debito manuale',
                    p_method:     method,
                });
                if (error) {
                    console.error('[Supabase] admin_add_debt error:', error.message, error.code);
                    alert('⚠️ Errore durante l\'aggiunta del debito: ' + error.message);
                    return;
                }
                console.log('[admin_add_debt]', data);
                await ManualDebtStorage.syncFromSupabase();
            } else {
                ManualDebtStorage.addDebt(whatsapp, email, name, amount,
                    note || 'Debito manuale', method);
            }
            renderPaymentsTab();
            debtorsListVisible = false;
            toggleDebtorsList();
        })();
    } else {
        // Credito: operazione atomica server-side via RPC
        const isFreeLesson = method === 'lezione-gratuita';
        const slotPrices = { 'personal-training': 5, 'small-group': 10, 'group-class': 30 };

        (async () => {
            const { data, error } = await supabaseClient.rpc('admin_add_credit', {
                p_email:       email.toLowerCase(),
                p_whatsapp:    whatsapp || null,
                p_name:        name,
                p_amount:      amount,
                p_note:        note || (isFreeLesson ? 'Lezione gratuita' : 'Credito manuale'),
                p_method:      method,
                p_free_lesson: isFreeLesson,
                p_slot_prices: slotPrices,
            });

            if (error) {
                console.error('[Supabase] admin_add_credit error:', error.message, error.code);
                alert('⚠️ Errore durante l\'aggiunta del credito: ' + error.message);
                return;
            }

            console.log('[admin_add_credit]', data);

            // Cancella il debounce pendente (RPC ha già scritto i dati corretti)
            clearTimeout(CreditStorage._supabaseSaveTimer);

            // Risincronizza tutto da Supabase
            await Promise.all([
                BookingStorage.syncFromSupabase(),
                CreditStorage.syncFromSupabase(),
                ManualDebtStorage.syncFromSupabase(),
            ]);

            renderPaymentsTab();
            creditsListVisible = false;
            toggleCreditsList();
        })();
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
            return (phoneMatch || emailMatch) && !b.paid && b.status !== 'cancelled' && b.status !== 'cancellation_requested';
        })
        .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

    const debtRecord  = ManualDebtStorage.getRecord(whatsapp, email);
    const debtBalance = debtRecord?.balance || 0;
    const oldestDebt  = debtRecord?.history?.find(h => h.amount > 0);
    const debtInfo    = debtBalance > 0 ? { balance: debtBalance, date: oldestDebt?.date || null } : null;
    if (unpaid.length === 0 && !debtInfo) return;

    currentDebtContact = { whatsapp, email, name, unpaid };

    document.getElementById('debtPopupName').textContent = name;
    const pastCount   = unpaid.filter(b => bookingHasPassed(b)).length;
    const futureCount = unpaid.length - pastCount;
    const parts = [];
    if (pastCount   > 0) parts.push(`${pastCount} passata${pastCount   > 1 ? 'e' : ''}`);
    if (futureCount > 0) parts.push(`${futureCount} futura${futureCount > 1 ? 'e' : ''}`);
    let subtitle = unpaid.length > 0
        ? `${unpaid.length} lezione${unpaid.length > 1 ? 'i' : ''} non pagata${unpaid.length > 1 ? 'e' : ''} (${parts.join(', ')})`
        : '';
    if (debtBalance > 0) subtitle = subtitle ? `${subtitle} · Debito manuale: €${debtBalance.toFixed(2)}` : `Debito manuale: €${debtBalance.toFixed(2)}`;
    document.getElementById('debtPopupSubtitle').textContent = subtitle;

    // Reset payment method to placeholder
    const debtSelect = document.getElementById('debtMethodSelect');
    if (debtSelect) debtSelect.value = '';

    // Reset amount input & show amount row (in case previous selection was 'gratuita')
    const amountRow = document.querySelector('#debtPopupModal .debt-payment-amount-row');
    if (amountRow) amountRow.style.display = '';
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

    renderDebtPopupList(unpaid, debtInfo);
    updateDebtTotal();

    document.getElementById('debtPopupOverlay').classList.add('open');
    document.getElementById('debtPopupModal').classList.add('open');
}

function renderDebtPopupList(unpaid, debtInfo = null) {
    const list = document.getElementById('debtPopupList');
    list.innerHTML = '';

    // Costruisce lista unificata con sortDate per ordinamento
    const items = unpaid.map(b => {
        const startTime = (b.time || '').split(' - ')[0] || '00:00';
        return { type: 'booking', sortDate: new Date(`${b.date}T${startTime}`), booking: b };
    });
    if (debtInfo) {
        items.push({ type: 'manual-debt', sortDate: debtInfo.date ? new Date(debtInfo.date) : new Date(0), debtInfo });
    }
    items.sort((a, b) => a.sortDate - b.sortDate); // più vecchio → più nuovo

    items.forEach(it => {
        const el = document.createElement('div');
        el.className = 'debt-popup-item';

        if (it.type === 'booking') {
            const { booking } = it;
            const [y, m, d] = booking.date.split('-').map(Number);
            const dateDisplay = `${d}/${m}/${y}`;
            const fullPrice   = SLOT_PRICES[booking.slotType];
            const creditApplied = booking.creditApplied || 0;
            const price = fullPrice - creditApplied;
            if (bookingHasPassed(booking)) el.classList.add('debt-popup-item--past');
            el.innerHTML = `
                <label class="debt-item-label">
                    <input type="checkbox" class="debt-item-check" data-id="${booking.id}" data-price="${price}" onchange="updateDebtTotal()">
                    <div class="debt-item-info">
                        <span class="debt-item-date">📅 ${dateDisplay} &nbsp;·&nbsp; 🕐 ${booking.time}</span>
                        <span class="debt-item-type">${SLOT_NAMES[booking.slotType]}${creditApplied > 0 ? ` <span style="color:#92400e;font-size:0.8em">(💳 €${creditApplied} già applicato)</span>` : ''}</span>
                    </div>
                    <span class="debt-item-price">€${Number(price).toFixed(2).replace('.', ',')}</span>
                </label>`;
        } else {
            const { balance, date } = it.debtInfo;
            const dateDisplay = date
                ? (() => { const dt = new Date(date); return `${dt.getDate()}/${dt.getMonth()+1}/${dt.getFullYear()}`; })()
                : '—';
            el.innerHTML = `
                <label class="debt-item-label">
                    <input type="checkbox" class="debt-item-check" data-id="manual-debt" data-price="${balance}" onchange="updateDebtTotal()">
                    <div class="debt-item-info">
                        <span class="debt-item-date">📋 ${dateDisplay}</span>
                        <span class="debt-item-type">Debito manuale</span>
                    </div>
                    <span class="debt-item-price">€${balance.toFixed(2).replace('.', ',')}</span>
                </label>`;
        }
        list.appendChild(el);
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

    const activeMethodBtn = document.querySelector('#debtPopupModal .debt-method-btn.active');
    const isFreeLessonMethod = activeMethodBtn?.dataset.method === 'lezione-gratuita';
    const payBtn = document.getElementById('debtPayBtn');
    if (payBtn) payBtn.disabled = checked.length === 0 || (!isFreeLessonMethod && amountPaid <= 0);
}

function toggleAllDebts(checked) {
    document.querySelectorAll('.debt-item-check').forEach(cb => { cb.checked = checked; });
    updateDebtTotal();
}

function selectPaymentMethod(btn) {
    // Legacy button handler (kept for safety)
    document.querySelectorAll('#debtPopupModal .debt-method-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const isFree = btn.dataset.method === 'lezione-gratuita';
    const amountRow = document.querySelector('#debtPopupModal .debt-payment-amount-row');
    if (amountRow) amountRow.style.display = isFree ? 'none' : '';
    updateCreditPreview();
}

function onPaymentMethodChange(select) {
    const isFree = select.value === 'lezione-gratuita';
    const amountRow = document.querySelector('#debtPopupModal .debt-payment-amount-row');
    if (amountRow) amountRow.style.display = isFree ? 'none' : '';
    updateCreditPreview();
}

function paySelectedDebts() {
    const checked = document.querySelectorAll('.debt-item-check:checked');
    if (checked.length === 0) return;

    const methodSelect = document.getElementById('debtMethodSelect');
    const paymentMethod = methodSelect ? methodSelect.value : '';
    if (!paymentMethod) { showToast('Seleziona un metodo di pagamento', 'error'); return; }
    const isFreeLesson = paymentMethod === 'lezione-gratuita';
    const amountInput = document.getElementById('debtAmountInput');
    const amountPaid = isFreeLesson ? 0 : (amountInput ? (parseFloat(amountInput.value) || 0) : 0);

    // Separa checkbox debito manuale da checkbox prenotazioni
    const bookings = BookingStorage.getAllBookings();
    const bookingCbs = Array.from(checked).filter(cb => cb.dataset.id !== 'manual-debt');
    const sbIds = bookingCbs.map(cb => {
        const b = bookings.find(bk => bk.id === cb.dataset.id);
        return b?._sbId;
    }).filter(Boolean);

    const manualDebtCb = document.querySelector('.debt-item-check[data-id="manual-debt"]:checked');
    const manualDebtOffset = manualDebtCb ? Number(manualDebtCb.dataset.price) : 0;

    // Cattura il contatto prima di closeDebtPopup (che lo azzera)
    const contact = currentDebtContact;

    if (!sbIds.length) {
        // Fallback: logica client-side (nessuna prenotazione Supabase selezionata)
        const dueTotal = Array.from(checked).reduce((sum, cb) => sum + Number(cb.dataset.price), 0);
        const creditDelta = Math.round((amountPaid - dueTotal) * 100) / 100;
        const now = new Date().toISOString();
        bookingCbs.forEach(cb => {
            const booking = bookings.find(b => b.id === cb.dataset.id);
            if (booking) { booking.paid = true; booking.paymentMethod = paymentMethod; booking.paidAt = now; }
        });
        BookingStorage.replaceAllBookings(bookings);
        if (manualDebtCb && contact) {
            ManualDebtStorage.addDebt(contact.whatsapp, contact.email, contact.name, -manualDebtOffset, 'Saldo debito manuale', paymentMethod);
        }
        if (!isFreeLesson && amountPaid > 0 && contact) {
            const methodLabel = { contanti: 'Contanti', carta: 'Carta', iban: 'Bonifico' }[paymentMethod] || paymentMethod;
            if (creditDelta > 0) {
                CreditStorage.addCredit(contact.whatsapp, contact.email, contact.name, creditDelta, `Pagamento in acconto di €${amountPaid}`, amountPaid, false, false, null, paymentMethod);
                CreditStorage.applyToUnpaidBookings(contact.whatsapp, contact.email, contact.name);
            } else {
                CreditStorage.addCredit(contact.whatsapp, contact.email, contact.name, 0, `${methodLabel} ricevuto`, amountPaid, false, false, null, paymentMethod);
            }
        }
        closeDebtPopup();
        if (selectedAdminDay) renderAdminDayView(selectedAdminDay);
        const activeTab = document.querySelector('.admin-tab.active');
        if (activeTab && activeTab.dataset.tab === 'payments') renderPaymentsTab();
        return;
    }

    closeDebtPopup();

    (async () => {
        const { data, error } = await supabaseClient.rpc('admin_pay_bookings', {
            p_booking_sb_ids:     sbIds,
            p_email:              contact.email.toLowerCase(),
            p_whatsapp:           contact.whatsapp || null,
            p_name:               contact.name,
            p_payment_method:     paymentMethod,
            p_amount_paid:        amountPaid,
            p_manual_debt_offset: manualDebtOffset,
            p_slot_prices:        { 'personal-training': 5, 'small-group': 10, 'group-class': 30 },
        });
        if (error) {
            console.error('[Supabase] admin_pay_bookings error:', error.message);
            alert('⚠️ Errore: ' + error.message);
            return;
        }
        console.log('[admin_pay_bookings]', data);
        clearTimeout(CreditStorage._supabaseSaveTimer);
        await Promise.all([BookingStorage.syncFromSupabase(), CreditStorage.syncFromSupabase(), ManualDebtStorage.syncFromSupabase()]);
        if (selectedAdminDay) renderAdminDayView(selectedAdminDay);
        const activeTab = document.querySelector('.admin-tab.active');
        if (activeTab && activeTab.dataset.tab === 'payments') renderPaymentsTab();
    })();
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

    // Include registered users even without bookings
    UserStorage.getAll().forEach(user => {
        const normPhone = normalizePhone(user.whatsapp);
        let found = false;
        for (const client of Object.values(clientsMap)) {
            const phoneMatch = normPhone && normalizePhone(client.whatsapp) === normPhone;
            const emailMatch = user.email && client.email &&
                user.email.toLowerCase() === client.email.toLowerCase();
            if (phoneMatch || emailMatch) { found = true; break; }
        }
        if (!found) {
            const key = normPhone || user.email;
            if (key) clientsMap[key] = { name: user.name, whatsapp: user.whatsapp || '', email: user.email || '', bookings: [] };
        }
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

function filterClientTx(cardIndex, days, btn) {
    const card = document.getElementById(`client-card-${cardIndex}`);
    if (!card) return;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    card.querySelectorAll('.credit-history-row, tr[data-ts]').forEach(row => {
        row.style.display = parseInt(row.dataset.ts) >= cutoff ? '' : 'none';
    });
    btn.closest('.tx-filter-bar').querySelectorAll('.tx-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

async function refreshClients() {
    const btn = document.getElementById('refreshClientsBtn');
    if (btn) { btn.textContent = '↻ Caricamento...'; btn.disabled = true; }
    await UserStorage.syncUsersFromSupabase();
    renderClientsTab();
    if (btn) { btn.textContent = '↻ Ricarica'; btn.disabled = false; }
}

function renderClientsTab() {
    const allClients = getAllClients();
    const query = clientsSearchQuery.trim().toLowerCase();
    let filtered = query
        ? allClients.filter(c =>
            c.name.toLowerCase().includes(query) ||
            c.whatsapp.toLowerCase().includes(query) ||
            (c.email && c.email.toLowerCase().includes(query)))
        : allClients;
    if (clientCertFilter)  filtered = filtered.filter(clientHasCertIssue);
    if (clientAssicFilter) filtered = filtered.filter(clientHasAssicIssue);

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

    const cutoff30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const activeBookings = client.bookings.filter(b => b.status !== 'cancelled');
    const totalBookings = activeBookings.length;
    const totalPaid   = activeBookings.filter(b => b.paid && b.paymentMethod !== 'lezione-gratuita').reduce((s, b) => s + (SLOT_PRICES[b.slotType] || 0), 0);
    const totalFree   = activeBookings.filter(b => b.paid && b.paymentMethod === 'lezione-gratuita').reduce((s, b) => s + (SLOT_PRICES[b.slotType] || 0), 0);
    const totalUnpaid = activeBookings.filter(b => !b.paid && bookingHasPassed(b) && b.status !== 'cancellation_requested').reduce((s, b) => s + (SLOT_PRICES[b.slotType] || 0) - (b.creditApplied || 0), 0);
    const credit      = CreditStorage.getBalance(client.whatsapp, client.email);
    const manualDebt  = ManualDebtStorage.getBalance(client.whatsapp, client.email) || 0;
    const netBalance  = Math.round((credit - manualDebt) * 100) / 100;

    // Certificato medico e Assicurazione dal profilo utente
    const userRecord  = _getUserRecord(client.email, client.whatsapp);
    const certScad    = userRecord?.certificatoMedicoScadenza || '';
    const assicScad2  = userRecord?.assicurazioneScadenza || '';
    const _mkBadge = (scad, missingLabel, expiredPrefix, expiringPrefix, okPrefix) => {
        if (!scad) return `<span class="cedit-cert-badge cedit-cert-expired">${missingLabel}</span>`;
        const today = _localDateStr();
        const [y, m, d] = scad.split('-');
        const label = `${d}/${m}/${y}`;
        if (scad < today) return `<span class="cedit-cert-badge cedit-cert-expired">${expiredPrefix} ${label}</span>`;
        const daysLeft = Math.ceil((new Date(scad + 'T00:00:00') - new Date()) / 86400000);
        if (daysLeft <= 30) return `<span class="cedit-cert-badge cedit-cert-expiring">${expiringPrefix} ${label}</span>`;
        return `<span class="cedit-cert-badge cedit-cert-ok">${okPrefix} ${label}</span>`;
    };
    const bonus = BonusStorage.getBonus(client.whatsapp, client.email);
    const bonusDisplay = `<span class="cedit-cert-badge ${bonus > 0 ? 'cedit-cert-ok' : 'cedit-cert-expiring'}">🎟️ Bonus ${bonus}/1</span>`;
    const certDisplay  = _mkBadge(certScad,  '🏥 Imposta scadenza certificato medico', '🏥 Cert. scaduto il', '⏳ Cert. scade il', '✅ Cert. valido fino al');
    const assicDisplay = _mkBadge(assicScad2, '📋 Imposta scadenza assicurazione',      '📋 Assic. scaduta il', '⏳ Assic. scade il', '📋 Assic. valida fino al');

    const totalAllPaid = Math.round((totalPaid + credit) * 100) / 100;
    let statsHTML = `<span class="cstat">${totalBookings} prenotazioni</span>`;
    if (totalAllPaid > 0) statsHTML += `<span class="cstat paid">€${totalAllPaid} pagato</span>`;
    if (totalFree    > 0) statsHTML += `<span class="cstat free">🎁 €${totalFree} regalate</span>`;
    if (totalUnpaid  > 0) statsHTML += `<span class="cstat unpaid">€${totalUnpaid} da pagare</span>`;
    if (netBalance  !== 0) statsHTML += `<span class="cstat ${netBalance > 0 ? 'credit' : 'unpaid'}">💳 ${netBalance > 0 ? '+' : ''}€${netBalance}</span>`;

    const methodLabel = m => ({ contanti: '💵 Contanti', carta: '💳 Carta', iban: '🏦 Bonifico', credito: '✨ Credito', 'lezione-gratuita': '🎁 Gratuita' }[m] || '—');
    const fmtPaidAt = iso => {
        if (!iso) return '<span style="color:#ccc">—</span>';
        const d = new Date(iso);
        return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
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
        const bTs = new Date(b.date + 'T12:00:00').getTime();
        return `<tr id="brow-${b.id}" class="${rowClass}" data-ts="${bTs}"${bTs < cutoff30 ? ' style="display:none"' : ''}>
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

    // Build full transaction list (same logic as renderTransazioni in prenotazioni.html)
    const normCPhone = normalizePhone(client.whatsapp);
    const matchCli = (w, e) =>
        (normCPhone && normalizePhone(w) === normCPhone) ||
        (client.email && e && e.toLowerCase() === client.email.toLowerCase());
    const txMethodMap = { contanti: '💵 Contanti', carta: '💳 Carta', iban: '🏦 Bonifico', credito: '💳 Credito', 'lezione-gratuita': '🎁 Gratuita' };
    const txEntries = [];

    // 1. Paid bookings
    BookingStorage.getAllBookings()
        .filter(b => matchCli(b.whatsapp, b.email) && b.paid)
        .forEach(b => {
            const price = SLOT_PRICES[b.slotType] || 0;
            if (!price) return;
            const [by, bm, bd] = b.date.split('-');
            const isFree = b.paymentMethod === 'lezione-gratuita';
            txEntries.push({
                date: new Date(b.paidAt || `${b.date}T12:00:00`),
                icon: '🏋️', label: SLOT_NAMES[b.slotType] || b.slotType,
                sub: `${bd}/${bm}/${by} · ${txMethodMap[b.paymentMethod] || b.paymentMethod || ''}`,
                amount: isFree ? 0 : -price,
                freeLesson: isFree,
                txType: 'booking', txId: b.id, txName: b.name
            });
        });

    // 2. Credit entries (positive = credit loads, negative = deductions) + informational payment records (amount=0 with displayAmount)
    //    Escludi rimborsi di cancellazione (hiddenRefund o nota corrispondente)
    const creditRec2 = CreditStorage.getRecord(client.whatsapp, client.email);
    (creditRec2?.history || [])
        .filter(e => !e.hiddenRefund && !/^Rimborso (cancellazione|annullamento) lezione/i.test(e.note || '') &&
            (e.amount !== 0 || (e.displayAmount || 0) > 0))
        .forEach(e => {
            txEntries.push({
                date: new Date(e.date), icon: e.amount < 0 ? '🔻' : '💳',
                label: e.note || (e.amount < 0 ? 'Deduzione credito' : 'Credito aggiunto'),
                sub: '', amount: e.displayAmount !== undefined ? e.displayAmount : e.amount,
                txType: 'credit', txEntryDate: e.date
            });
        });

    // 3. Manual debt history — solo addebiti (amount > 0); i "Saldato" sono nascosti
    //    perché il pagamento cash appare già come entry credito positiva
    const debtRec2 = ManualDebtStorage.getRecord(client.whatsapp, client.email);
    (debtRec2?.history || []).filter(e => e.amount > 0).forEach(e => {
        txEntries.push({
            date: new Date(e.date),
            icon: '✏️',
            label: e.note || 'Addebito',
            sub: '',
            amount: -e.amount,
            txType: 'debt', txEntryDate: e.date
        });
    });

    txEntries.sort((a, b) => b.date - a.date);

    const fmtDTx = d => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;

    const filterBarHTML = `<div class="tx-filter-bar">
        <button class="tx-filter-btn" onclick="filterClientTx(${index}, 7, this)">Settimana</button>
        <button class="tx-filter-btn active" onclick="filterClientTx(${index}, 30, this)">Mese</button>
        <button class="tx-filter-btn" onclick="filterClientTx(${index}, 180, this)">6 mesi</button>
        <button class="tx-filter-btn" onclick="filterClientTx(${index}, 365, this)">1 anno</button>
    </div>`;

    const wEsc  = client.whatsapp.replace(/'/g, "\\'");
    const emEsc = (client.email || '').replace(/'/g, "\\'");
    const nEsc  = client.name.replace(/'/g, "\\'");

    let creditHTML = '';
    if (txEntries.length > 0) {
        creditHTML = `<div class="client-credit-section">
            <h4>📊 Storico transazioni — saldo: ${netBalance >= 0 ? '+' : ''}€${netBalance}</h4>
            <div class="client-credit-history" id="tx-list-${index}">
                ${txEntries.map(e => {
                    const pos = e.amount > 0;
                    const sign = e.freeLesson ? '' : ((e.cancelled || e.amount < 0) ? '-' : '+');
                    const cls  = e.freeLesson ? 'free' : (pos ? 'plus' : 'minus');
                    const cleanLabel = (e.label || '')
                        .replace(/^[💵💳🏦✨🎁]\s*/, '')
                        .replace(/\s+ricevuto$/i, '');
                    const eTs = e.date.getTime();
                    let delBtn = '';
                    if (e.txType === 'booking') {
                        delBtn = `<button class="btn-tx-delete" onclick="event.stopPropagation(); deleteTxEntry('booking', '${e.txId.replace(/'/g, "\\'")}', '${nEsc}', ${index})" title="Elimina transazione">🗑️</button>`;
                    } else if (e.txType === 'credit') {
                        delBtn = `<button class="btn-tx-delete" onclick="event.stopPropagation(); deleteTxEntry('credit', '${(e.txEntryDate || '').replace(/'/g, "\\'")}', '${wEsc}', ${index}, '${emEsc}')" title="Elimina transazione">🗑️</button>`;
                    } else if (e.txType === 'debt') {
                        delBtn = `<button class="btn-tx-delete" onclick="event.stopPropagation(); deleteTxEntry('debt', '${(e.txEntryDate || '').replace(/'/g, "\\'")}', '${wEsc}', ${index}, '${emEsc}')" title="Elimina transazione">🗑️</button>`;
                    }
                    return `<div class="credit-history-row" data-ts="${eTs}"${eTs < cutoff30 ? ' style="display:none"' : ''}>
                        <span class="credit-history-date">${fmtDTx(e.date)}</span>
                        <span class="credit-history-icon">${e.icon}</span>
                        <span class="credit-history-note">${_escHtml(cleanLabel)}${e.sub ? ` <small style="opacity:0.7">${_escHtml(e.sub)}</small>` : ''}</span>
                        <span class="credit-history-amount ${cls}">${sign}€${Math.abs(e.amount).toFixed(2)}</span>
                        ${delBtn}
                    </div>`;
                }).join('')}
            </div>
        </div>`;
    }

    card.innerHTML = `
        <div class="client-card-header" onclick="toggleClientCard('client-card-${index}', ${index})">
            <div class="client-info-block">
                <div class="client-name">${_escHtml(client.name)}</div>
                <div class="client-contacts">
                    <span>📱 ${_escHtml(client.whatsapp)}</span>
                    ${client.email ? `<span>✉️ ${_escHtml(client.email)}</span>` : ''}
                    ${certDisplay}${assicDisplay}${bonusDisplay}
                </div>
            </div>
            <div class="client-stats-block">${statsHTML}</div>
            <div class="client-chevron">▼</div>
        </div>
        <div class="client-card-body">
            ${filterBarHTML}
            <div class="client-contact-edit" id="cedit-section-${index}">
                <div class="client-view-mode">
                    <button class="btn-edit-contact" onclick="event.stopPropagation(); startEditClient(${index}, '${wEsc}', '${emEsc}', '${nEsc}')">✏️ Modifica contatto</button>
                </div>
                <div class="client-edit-mode" style="display:none;">
                    <div class="client-edit-fields">
                        <label>Nome<input type="text"  id="cedit-name-${index}"  value="${_escHtml(client.name)}"></label>
                        <label>WhatsApp<input type="tel"   id="cedit-phone-${index}" value="${_escHtml(client.whatsapp)}"></label>
                        <label>Email<input type="email" id="cedit-email-${index}" value="${_escHtml(client.email || '')}"></label>
                        <label>Cert. Medico<input type="date" id="cedit-cert-${index}" value="${certScad}"></label>
                        <label>Assicurazione<input type="date" id="cedit-assic-${index}" value="${assicScad2}"></label>
                    </div>
                    <div class="client-edit-actions">
                        <button class="btn-save-edit"   onclick="saveClientEdit(${index}, '${wEsc}', '${emEsc}')">✓ Salva</button>
                        <button class="btn-cancel-edit" onclick="cancelClientEdit(${index})">✕ Annulla</button>
                        <button class="btn-delete-client" onclick="deleteClientData(${index}, '${wEsc}', '${emEsc}')" title="Elimina tutti i dati del cliente">🗑️</button>
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

// Helper: aggiorna profilo locale (users), cert, assic, sessione dopo rename
function _saveClientEditLocalProfile(index, oldWhatsapp, oldEmail, newName, newWhatsapp, newEmail, newCert, newAssic, normOld, normNewPhone) {
    const users  = _getUsersFull();
    const oldEmailLow = (oldEmail || '').toLowerCase();
    let userIdx = users.findIndex(u => {
        const phoneMatch = normOld && normalizePhone(u.whatsapp) === normOld;
        const emailMatch = oldEmailLow && u.email && u.email.toLowerCase() === oldEmailLow;
        return phoneMatch || emailMatch;
    });

    if (userIdx === -1 && (newCert || newAssic)) {
        users.push({ name: newName, email: newEmail, whatsapp: normNewPhone, createdAt: new Date().toISOString() });
        userIdx = users.length - 1;
    }

    if (userIdx !== -1) {
        users[userIdx].name     = newName;
        users[userIdx].whatsapp = normNewPhone;
        if (newEmail) users[userIdx].email = newEmail;

        const oldCert = users[userIdx].certificatoMedicoScadenza || '';
        if (newCert !== oldCert) {
            users[userIdx].certificatoMedicoScadenza = newCert || null;
            if (!users[userIdx].certificatoMedicoHistory) users[userIdx].certificatoMedicoHistory = [];
            users[userIdx].certificatoMedicoHistory.push({ scadenza: newCert || null, aggiornatoIl: new Date().toISOString() });
        }
        const oldAssic = users[userIdx].assicurazioneScadenza || '';
        if (newAssic !== oldAssic) {
            users[userIdx].assicurazioneScadenza = newAssic || null;
            if (!users[userIdx].assicurazioneHistory) users[userIdx].assicurazioneHistory = [];
            users[userIdx].assicurazioneHistory.push({ scadenza: newAssic || null, aggiornatoIl: new Date().toISOString() });
        }
        _saveUsers(users);

        const _supaFields = {};
        if (newCert !== oldCert) _supaFields.medical_cert_expiry = newCert || null;
        if (newAssic !== oldAssic) _supaFields.insurance_expiry = newAssic || null;
        if (Object.keys(_supaFields).length > 0)
            _updateSupabaseProfile(newEmail || oldEmail, normNewPhone, _supaFields);

        const current = getCurrentUser();
        if (current) {
            const sessionPhone = normalizePhone(current.whatsapp);
            const sessionEmail = (current.email || '').toLowerCase();
            const isLogged = (normOld && sessionPhone === normOld) || (oldEmailLow && sessionEmail === oldEmailLow);
            if (isLogged) loginUser({ ...current, name: newName, email: newEmail || current.email, whatsapp: normNewPhone });
        }
    }

    openClientIndex = null;
    renderClientsTab();
    showToast('Contatto aggiornato.', 'success');
}

function saveClientEdit(index, oldWhatsapp, oldEmail) {
    const newName     = document.getElementById(`cedit-name-${index}`).value.trim().replace(/\S+/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
    const newWhatsapp = document.getElementById(`cedit-phone-${index}`).value.trim();
    const newEmail    = document.getElementById(`cedit-email-${index}`).value.trim();
    const newCert     = document.getElementById(`cedit-cert-${index}`).value;
    const newAssic    = document.getElementById(`cedit-assic-${index}`).value;
    if (!newName || !newWhatsapp) { alert('Nome e WhatsApp sono obbligatori.'); return; }

    const normOld      = normalizePhone(oldWhatsapp);
    const normNewPhone = normalizePhone(newWhatsapp) || newWhatsapp;

    // ── 1-3. bookings + credits + manual_debts: atomico server-side ──
    if (typeof supabaseClient !== 'undefined') {
        (async () => {
            const { data, error } = await supabaseClient.rpc('admin_rename_client', {
                p_old_email:    oldEmail || '',
                p_old_whatsapp: normOld || null,
                p_new_name:     newName,
                p_new_email:    newEmail,
                p_new_whatsapp: normNewPhone,
            });
            if (error) {
                console.error('[Supabase] admin_rename_client error:', error.message);
                alert('⚠️ Errore durante l\'aggiornamento: ' + error.message);
                return;
            }
            console.log('[admin_rename_client]', data);
            clearTimeout(CreditStorage._supabaseSaveTimer);
            await Promise.all([
                BookingStorage.syncFromSupabase(),
                CreditStorage.syncFromSupabase(),
                ManualDebtStorage.syncFromSupabase(),
            ]);
            // Continua con profilo locale + cert/assic (sotto)
            _saveClientEditLocalProfile(index, oldWhatsapp, oldEmail, newName, newWhatsapp, newEmail, newCert, newAssic, normOld, normNewPhone);
        })();
        return; // il resto è gestito nella callback async
    }

    // Fallback client-side (offline)
    const bookings = BookingStorage.getAllBookings();
    bookings.forEach(b => {
        const phoneMatch = normOld && normalizePhone(b.whatsapp) === normOld;
        const emailMatch = oldEmail && b.email && b.email.toLowerCase() === oldEmail.toLowerCase();
        if (phoneMatch || emailMatch) {
            b.name     = newName;
            b.whatsapp = normNewPhone;
            b.email    = newEmail;
        }
    });
    BookingStorage.replaceAllBookings(bookings);

    const creditKey = CreditStorage._findKey(oldWhatsapp, oldEmail);
    if (creditKey) {
        const all = CreditStorage._getAll();
        all[creditKey].name     = newName;
        all[creditKey].whatsapp = normNewPhone;
        all[creditKey].email    = newEmail;
        CreditStorage._save(all);
    }

    const debtKey = ManualDebtStorage._findKey(oldWhatsapp, oldEmail);
    if (debtKey) {
        const all = ManualDebtStorage._getAll();
        all[debtKey].name     = newName;
        all[debtKey].whatsapp = normNewPhone;
        all[debtKey].email    = newEmail;
        ManualDebtStorage._save(all);
    }

    // Profilo locale + cert/assic + sessione
    _saveClientEditLocalProfile(index, oldWhatsapp, oldEmail, newName, newWhatsapp, newEmail, newCert, newAssic, normOld, normNewPhone);
}

async function deleteClientData(index, whatsapp, email) {
    const pwd = prompt('Inserisci la password per eliminare tutti i dati del cliente:');
    if (pwd !== 'Palestra123') {
        if (pwd !== null) alert('Password errata.');
        return;
    }

    const clients = getAllClients();
    const client = clients[index];
    if (!client) return;
    const clientEmail = (client.email || email || '').toLowerCase();
    const clientPhone = normalizePhone(client.whatsapp || whatsapp || '');
    const clientName = client.name || '';

    if (!confirm(`Confermi l'eliminazione di TUTTI i dati di ${clientName}?\n\nPrenotazioni, crediti, debiti e bonus verranno eliminati permanentemente.`)) return;

    // 1. Elimina prenotazioni
    const allBookings = BookingStorage.getAllBookings();
    const kept = allBookings.filter(b => {
        if (clientEmail && b.email?.toLowerCase() === clientEmail) return false;
        if (clientPhone && b.whatsapp && normalizePhone(b.whatsapp) === clientPhone) return false;
        return true;
    });
    const removedBookings = allBookings.length - kept.length;
    BookingStorage.replaceAllBookings(kept);

    // 2. Elimina crediti
    const credits = CreditStorage._getAll();
    let removedCredits = false;
    for (const key of Object.keys(credits)) {
        const c = credits[key];
        if (clientEmail && (c.email || '').toLowerCase() === clientEmail) { delete credits[key]; removedCredits = true; }
        else if (clientPhone && key === clientPhone) { delete credits[key]; removedCredits = true; }
    }
    if (removedCredits) localStorage.setItem(CreditStorage.CREDITS_KEY, JSON.stringify(credits));

    // 3. Elimina debiti
    const debts = ManualDebtStorage._getAll();
    let removedDebts = false;
    for (const key of Object.keys(debts)) {
        const d = debts[key];
        if (clientEmail && (d.email || '').toLowerCase() === clientEmail) { delete debts[key]; removedDebts = true; }
        else if (clientPhone && key === clientPhone) { delete debts[key]; removedDebts = true; }
    }
    if (removedDebts) localStorage.setItem(ManualDebtStorage.DEBTS_KEY, JSON.stringify(debts));

    // 4. Elimina bonus
    const bonuses = BonusStorage._getAll();
    let removedBonus = false;
    for (const key of Object.keys(bonuses)) {
        const bn = bonuses[key];
        if (clientEmail && (bn.email || '').toLowerCase() === clientEmail) { delete bonuses[key]; removedBonus = true; }
        else if (clientPhone && key === clientPhone) { delete bonuses[key]; removedBonus = true; }
    }
    if (removedBonus) localStorage.setItem(BonusStorage.BONUS_KEY, JSON.stringify(bonuses));

    // 5. Supabase: elimina dati dal DB via RPC admin
    if (typeof supabaseClient !== 'undefined' && clientEmail) {
        try {
            const { data, error } = await supabaseClient.rpc('admin_delete_client_data', { p_email: clientEmail });
            if (error) console.error('[deleteClientData] RPC error:', error.message);
            else console.log('[deleteClientData] Supabase:', data);
        } catch (e) { console.error('[deleteClientData] Supabase error:', e); }
    }

    showToast(`Dati di ${clientName} eliminati (${removedBookings} prenotazioni rimosse).`, 'success');
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
        { v: 'contanti',         l: '💵 Contanti'  },
        { v: 'carta',            l: '💳 Carta'     },
        { v: 'iban',             l: '🏦 Bonifico'      },
        { v: 'credito',          l: '✨ Credito'   },
        { v: 'lezione-gratuita', l: '🎁 Gratuita'  }
    ];
    const methodOpts = methods.map(m =>
        `<option value="${m.v}" ${booking.paymentMethod === m.v ? 'selected' : ''}>${m.l}</option>`
    ).join('');

    const dateStr = booking.date.split('-').reverse().join('/');
    const paidAtInput = booking.paidAt
        ? new Date(booking.paidAt).toISOString().slice(0, 16)   // "YYYY-MM-DDTHH:MM" per datetime-local
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
            <input type="datetime-local" id="bedit-paidat-${bookingId}" value="${paidAtInput}" class="bedit-date-input">
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

    if (typeof supabaseClient !== 'undefined' && booking._sbId) {
        // ── Percorso Supabase: RPC atomica ────────────────────────────────────
        const slotPrices = { 'personal-training': 5, 'small-group': 10, 'group-class': 30 };
        (async () => {
            const newPaidAtRaw = document.getElementById(`bedit-paidat-${bookingId}`)?.value;
            const { data, error } = await supabaseClient.rpc('admin_change_payment_method', {
                p_booking_id:  booking._sbId,
                p_new_paid:    newPaid,
                p_new_method:  newMethod || null,
                p_new_paid_at: newPaidAtRaw ? new Date(newPaidAtRaw).toISOString() : null,
                p_slot_prices: slotPrices,
            });
            if (error) {
                if (error.message.includes('insufficient_credit')) {
                    const bal = data?.balance ?? '?';
                    alert(`Credito insufficiente (€${bal} < €${price})`);
                } else {
                    console.error('[Supabase] admin_change_payment_method error:', error.message);
                    alert('⚠️ Errore: ' + error.message);
                }
                return;
            }
            clearTimeout(CreditStorage._supabaseSaveTimer);
            await Promise.all([BookingStorage.syncFromSupabase(), CreditStorage.syncFromSupabase(), ManualDebtStorage.syncFromSupabase()]);
            renderClientsTab();
        })();
        return;
    }

    // ── Fallback: logica client-side ──────────────────────────────────────────
    const _editPayML = { contanti: 'Contanti', carta: 'Carta', iban: 'Bonifico' };

    // Helper: offset refunded credit against any manual debt
    const _applyRefundToDebt = () => {
        const dBal = ManualDebtStorage.getBalance(booking.whatsapp, booking.email);
        if (dBal <= 0) return;
        const cBal = CreditStorage.getBalance(booking.whatsapp, booking.email);
        if (cBal <= 0) return;
        const toOff = Math.round(Math.min(dBal, cBal) * 100) / 100;
        ManualDebtStorage.addDebt(booking.whatsapp, booking.email, booking.name, -toOff, 'Compensato con credito');
        CreditStorage.addCredit(booking.whatsapp, booking.email, booking.name, -toOff, 'Applicato a debito manuale');
    };

    // Credit adjustments
    if (oldPaid && oldMethod === 'credito' && !newPaid) {
        // Was paid with credit → unpaid: refund
        CreditStorage.addCredit(booking.whatsapp, booking.email, booking.name, price,
            `Rimborso modifica pagamento ${booking.date} ${booking.time}`);
        _applyRefundToDebt();
    } else if (!oldPaid && newPaid && newMethod === 'credito') {
        // Unpaid → paid with credit: deduct
        const bal = CreditStorage.getBalance(booking.whatsapp, booking.email);
        if (bal < price) { alert(`Credito insufficiente (€${bal} < €${price})`); return; }
        CreditStorage.addCredit(booking.whatsapp, booking.email, booking.name, -price,
            `Pagamento lezione ${booking.date} ${booking.time} con credito`);
    } else if (oldPaid && oldMethod === 'credito' && newPaid && newMethod !== 'credito') {
        // Credit → other method: refund credit; record payment entry only if not free lesson
        CreditStorage.addCredit(booking.whatsapp, booking.email, booking.name, price,
            `Cambio metodo da credito — lezione ${booking.date} ${booking.time}`);
        _applyRefundToDebt();
        if (newMethod !== 'lezione-gratuita') {
            CreditStorage.addCredit(booking.whatsapp, booking.email, booking.name, 0,
                `${_editPayML[newMethod] || newMethod} ricevuto`,
                price, false, false, bookingId);
        }
    } else if (oldPaid && oldMethod !== 'credito' && oldMethod !== 'lezione-gratuita' && newPaid && newMethod === 'credito') {
        // Cash/card/iban → credit: remove old payment entry + deduct credit
        CreditStorage.hidePaymentEntryByBooking(booking.whatsapp, booking.email, bookingId);
        const bal = CreditStorage.getBalance(booking.whatsapp, booking.email);
        if (bal < price) { alert(`Credito insufficiente (€${bal} < €${price})`); return; }
        CreditStorage.addCredit(booking.whatsapp, booking.email, booking.name, -price,
            `Cambio metodo a credito — lezione ${booking.date} ${booking.time}`);
    } else if (oldPaid && oldMethod === 'lezione-gratuita' && newPaid && newMethod === 'credito') {
        // Free lesson → credit: deduct credit (no old entry to hide)
        const bal = CreditStorage.getBalance(booking.whatsapp, booking.email);
        if (bal < price) { alert(`Credito insufficiente (€${bal} < €${price})`); return; }
        CreditStorage.addCredit(booking.whatsapp, booking.email, booking.name, -price,
            `Cambio metodo a credito — lezione ${booking.date} ${booking.time}`);
    } else if (!oldPaid && newPaid && newMethod !== 'credito' && newMethod !== 'lezione-gratuita') {
        // Unpaid → paid with cash/card/iban: record incoming payment
        CreditStorage.addCredit(booking.whatsapp, booking.email, booking.name, 0,
            `${_editPayML[newMethod] || newMethod} ricevuto`,
            price, false, false, bookingId);
    } else if (oldPaid && oldMethod !== 'credito' && oldMethod !== 'lezione-gratuita' && !newPaid) {
        // Paid (cash/card/iban) → unpaid: hide the payment entry
        CreditStorage.hidePaymentEntryByBooking(booking.whatsapp, booking.email, bookingId);
    }

    const newPaidAtRaw = document.getElementById(`bedit-paidat-${bookingId}`)?.value;

    booking.paid          = newPaid;
    booking.paymentMethod = newMethod || undefined;
    if (newPaid) {
        // Use manually entered date if provided, otherwise keep existing or use now
        booking.paidAt = newPaidAtRaw
            ? new Date(newPaidAtRaw).toISOString()   // datetime-local già include HH:MM
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
    if (idx === -1) { renderClientsTab(); return; }

    const b = bookings[idx];
    const slotPrices = { 'personal-training': 5, 'small-group': 10, 'group-class': 30 };

    if (typeof supabaseClient !== 'undefined' && b._sbId) {
        // Operazione atomica server-side: delete + rimborso in una transazione
        (async () => {
            const { data, error } = await supabaseClient.rpc('admin_delete_booking_with_refund', {
                p_booking_id:  b._sbId,
                p_slot_prices: slotPrices,
            });
            if (error) {
                console.error('[Supabase] admin_delete_booking_with_refund error:', error.message);
                alert('⚠️ Errore durante l\'eliminazione: ' + error.message);
                return;
            }
            console.log('[admin_delete_booking_with_refund]', data);
            clearTimeout(CreditStorage._supabaseSaveTimer);
            await Promise.all([
                BookingStorage.syncFromSupabase(),
                CreditStorage.syncFromSupabase(),
            ]);
            renderClientsTab();
        })();
    } else {
        // Fallback client-side (offline)
        if (b.paid) {
            CreditStorage.addCredit(b.whatsapp, b.email, b.name, SLOT_PRICES[b.slotType],
                `Rimborso lezione ${b.date}`,
                null, false, false, null, b.paymentMethod || '');
        }
        bookings.splice(idx, 1);
        BookingStorage.replaceAllBookings(bookings);
        renderClientsTab();
    }
}

// ── Elimina una singola transazione dallo storico (booking / credito / debito) ──
async function deleteTxEntry(type, idOrDate, whatsappOrName, index, email) {
    if (!confirm('Eliminare questa transazione?\n\nQuesta operazione non può essere annullata.')) return;

    const _reopenCard = () => {
        renderClientsTab();
        setTimeout(() => {
            const card = document.getElementById(`client-card-${index}`);
            if (card) { card.classList.add('open'); card.querySelector('.client-card-body').style.display = 'block'; }
        }, 50);
    };

    if (type === 'booking') {
        // idOrDate = bookingId, whatsappOrName = clientName
        const bookings = BookingStorage.getAllBookings();
        const idx = bookings.findIndex(b => b.id === idOrDate);
        if (idx === -1) { _reopenCard(); return; }
        const b = bookings[idx];
        const slotPrices = { 'personal-training': 5, 'small-group': 10, 'group-class': 30 };

        if (typeof supabaseClient !== 'undefined' && b._sbId) {
            const { data, error } = await supabaseClient.rpc('admin_delete_booking_with_refund', {
                p_booking_id:  b._sbId,
                p_slot_prices: slotPrices,
            });
            if (error) {
                console.error('[deleteTxEntry] booking RPC error:', error.message);
                alert('⚠️ Errore: ' + error.message);
                return;
            }
            console.log('[deleteTxEntry] booking deleted:', data);
            clearTimeout(CreditStorage._supabaseSaveTimer);
            await Promise.all([
                BookingStorage.syncFromSupabase(),
                CreditStorage.syncFromSupabase(),
            ]);
        } else {
            if (b.paid) {
                CreditStorage.addCredit(b.whatsapp, b.email, b.name, SLOT_PRICES[b.slotType],
                    `Rimborso lezione ${b.date}`, null, false, false, null, b.paymentMethod || '');
            }
            bookings.splice(idx, 1);
            BookingStorage.replaceAllBookings(bookings);
        }
        showToast('Transazione (prenotazione) eliminata.', 'success');
        _reopenCard();

    } else if (type === 'credit') {
        // idOrDate = entryDate ISO, whatsappOrName = whatsapp, email = email
        if (typeof supabaseClient !== 'undefined') {
            const { data, error } = await supabaseClient.rpc('admin_delete_credit_entry', {
                p_email:      (email || '').toLowerCase(),
                p_entry_date: idOrDate,
            });
            if (error) {
                console.error('[deleteTxEntry] credit RPC error:', error.message);
                alert('⚠️ Errore: ' + error.message);
                return;
            }
            if (!data?.success) {
                alert('⚠️ Voce non trovata.');
                return;
            }
            console.log('[deleteTxEntry] credit entry deleted:', data);
            await CreditStorage.syncFromSupabase();
        } else {
            const ok = CreditStorage.deleteCreditEntry(whatsappOrName, email, idOrDate);
            if (!ok) { alert('⚠️ Voce non trovata.'); return; }
        }
        showToast('Transazione (credito) eliminata.', 'success');
        _reopenCard();

    } else if (type === 'debt') {
        // idOrDate = entryDate ISO, whatsappOrName = whatsapp, email = email
        if (typeof supabaseClient !== 'undefined') {
            const { data, error } = await supabaseClient.rpc('admin_delete_debt_entry', {
                p_email:      (email || '').toLowerCase(),
                p_entry_date: idOrDate,
            });
            if (error) {
                console.error('[deleteTxEntry] debt RPC error:', error.message);
                alert('⚠️ Errore: ' + error.message);
                return;
            }
            if (!data?.success) {
                alert('⚠️ Voce non trovata.');
                return;
            }
            console.log('[deleteTxEntry] debt entry deleted:', data);
            await ManualDebtStorage.syncFromSupabase();
        } else {
            const ok = ManualDebtStorage.deleteDebtEntry(whatsappOrName, email, idOrDate);
            if (!ok) { alert('⚠️ Voce non trovata.'); return; }
        }
        showToast('Transazione (debito) eliminata.', 'success');
        _reopenCard();
    }
}

function clearClientCredit(whatsapp, email, index) {
    if (!confirm('Eliminare tutto lo storico credito di questo cliente?\n\nSaldo e movimenti verranno azzerati.')) return;
    CreditStorage.clearRecord(whatsapp, email);
    renderClientsTab();
    const card = document.getElementById(`client-card-${index}`);
    if (card) { card.classList.add('open'); card.querySelector('.client-card-body').style.display = 'block'; }
}

// Initialize admin when DOM is loaded
// ══════════════════════════════════════════════════════════════════════════════
// REGISTRO / LOG DB
// ══════════════════════════════════════════════════════════════════════════════

let _registroState = {
    range:      'all',
    customFrom: null,
    customTo:   null,
    sortField:  'timestamp',
    sortDir:    'desc',
    page:       0,
};
const REGISTRO_PAGE_SIZE = 50;
let _registroFiltered = [];

// ── Aggrega tutti gli eventi da tutte le sorgenti dati ─────────────────────
function buildRegistroEntries() {
    const SLOT_LABEL = {
        'personal-training': 'Autonomia',
        'small-group':       'Lezione di Gruppo',
        'group-class':       'Slot prenotato',
    };

    const entries = [];

    // 1. Prenotazioni → eventi: created, paid, cancellation_requested, cancelled
    const bookings = BookingStorage.getAllBookings();
    for (const b of bookings) {
        const base = {
            bookingId:   b.id,
            clientName:  b.name  || '—',
            clientPhone: b.whatsapp || '',
            clientEmail: b.email   || '',
            lessonDate:  b.date    || null,
            lessonTime:  b.time    || null,
            slotType:    b.slotType || null,
            slotLabel:   SLOT_LABEL[b.slotType] || b.slotType || '',
            notes:       b.notes  || '',
        };

        // Evento: prenotazione creata
        const createdAt = b.createdAt
            ? new Date(b.createdAt)
            : new Date((b.date || '2000-01-01') + 'T08:00:00');
        entries.push({
            ...base,
            eventType:     'booking_created',
            timestamp:     createdAt,
            amount:        SLOT_PRICES[b.slotType] || 0,
            paymentMethod: b.paymentMethod || (b.status === 'cancelled' ? b.cancelledPaymentMethod : null) || null,
            bookingStatus: b.status,
            bookingPaid:   b.paid || (b.status === 'cancelled' && !!b.cancelledPaidAt),
        });

        // Evento: pagamento ricevuto
        // Per prenotazioni annullate-dopo-pagamento usiamo cancelledPaidAt/cancelledPaymentMethod
        const paidAtTs  = b.paidAt || (b.status === 'cancelled' ? b.cancelledPaidAt  : null);
        const paidMeth  = b.paymentMethod || (b.status === 'cancelled' ? b.cancelledPaymentMethod : null);
        if (paidAtTs) {
            entries.push({
                ...base,
                eventType:     'booking_paid',
                timestamp:     new Date(paidAtTs),
                amount:        SLOT_PRICES[b.slotType] || 0,
                paymentMethod: paidMeth,
                bookingStatus: b.status,
                bookingPaid:   true,
            });
        }

        // Evento: richiesta annullamento
        if (b.cancellationRequestedAt) {
            entries.push({
                ...base,
                eventType:     'booking_cancellation_req',
                timestamp:     new Date(b.cancellationRequestedAt),
                amount:        null,
                paymentMethod: null,
                bookingStatus: 'cancellation_requested',
                bookingPaid:   b.paid,
            });
        }

        // Evento: annullamento effettivo
        if (b.status === 'cancelled' && b.cancelledAt) {
            entries.push({
                ...base,
                eventType:     'booking_cancelled',
                timestamp:     new Date(b.cancelledAt),
                amount:        null,
                paymentMethod: null,
                bookingStatus: 'cancelled',
                bookingPaid:   false,
            });

            // Evento: mora trattenuta (annullamento con penalità su booking già pagato)
            // Il rimborso parziale +50% è già nel credit history; qui mostriamo il -50% trattenuto.
            if (b.cancelledWithPenalty && b.cancelledPaidAt) {
                const moraAmount = Math.round((SLOT_PRICES[b.slotType] || 0) * 0.5 * 100) / 100;
                if (moraAmount > 0) {
                    entries.push({
                        ...base,
                        eventType:     'cancellation_mora',
                        timestamp:     new Date(b.cancelledAt),
                        amount:        moraAmount,
                        paymentMethod: null,
                        bookingStatus: 'cancelled',
                        bookingPaid:   false,
                    });
                }
            }

            // Evento: bonus utilizzato per annullamento gratuito
            if (b.cancelledWithBonus) {
                entries.push({
                    ...base,
                    eventType:     'bonus_used',
                    timestamp:     new Date(b.cancelledAt),
                    amount:        null,
                    paymentMethod: null,
                    bookingStatus: 'cancelled',
                    bookingPaid:   false,
                });
            }
        }
    }

    // 2. Storico crediti — solo aggiunte (positive): i consumi di credito sono
    //    già rappresentati come booking_paid con method='credito', quindi
    //    mostrare anche credit_used sarebbe ridondante e confuso.
    const allCredits = CreditStorage._getAll();
    for (const record of Object.values(allCredits)) {
        for (const h of (record.history || [])) {
            if ((h.amount || 0) <= 0) continue; // salta i consumi di credito
            const ts = h.date ? new Date(h.date) : new Date();

            // Retrocompatibilità: vecchi dati incorporavano il metodo nella nota come "(carta)"
            let creditNote   = h.note   || '';
            let creditMethod = h.method || null;
            if (!creditMethod && creditNote) {
                const m = creditNote.match(/\s*\(([^)]+)\)\s*$/);
                if (m) {
                    const raw = m[1].toLowerCase().trim();
                    const methodMap = {
                        'carta': 'carta', 'contanti': 'contanti', 'iban': 'iban',
                        'lezione-gratuita': 'lezione-gratuita', 'lezione gratuita': 'lezione-gratuita',
                    };
                    if (methodMap[raw]) {
                        creditMethod = methodMap[raw];
                        creditNote   = creditNote.replace(/\s*\([^)]+\)\s*$/, '').trim();
                    }
                }
            }

            entries.push({
                bookingId:     h.bookingRef || null,
                clientName:    record.name     || '—',
                clientPhone:   record.whatsapp || '',
                clientEmail:   record.email    || '',
                lessonDate:    null,
                lessonTime:    null,
                slotType:      null,
                slotLabel:     '',
                notes:         creditNote,
                eventType:     /^Rimborso/i.test(creditNote) ? 'booking_refund' : 'credit_added',
                timestamp:     ts,
                amount:        Math.abs(h.amount || 0),
                paymentMethod: creditMethod,
                freeLesson:    h.freeLesson || false,
                bookingStatus: 'credit',
                bookingPaid:   null,
            });
        }
    }

    // 3. Storico debiti manuali
    const allDebts = ManualDebtStorage._getAll();
    for (const record of Object.values(allDebts)) {
        for (const h of (record.history || [])) {
            const ts     = h.date ? new Date(h.date) : new Date();
            const isDebt = (h.amount || 0) > 0;
            entries.push({
                bookingId:     null,
                clientName:    record.name     || '—',
                clientPhone:   record.whatsapp || '',
                clientEmail:   record.email    || '',
                lessonDate:    null,
                lessonTime:    null,
                slotType:      null,
                slotLabel:     '',
                notes:         h.note || '',
                eventType:     isDebt ? (h.entryType === 'mora' ? 'cancellation_mora' : 'manual_debt') : 'manual_debt_paid',
                timestamp:     ts,
                amount:        Math.abs(h.amount || 0),
                paymentMethod: isDebt ? null : (h.method || null),
                bookingStatus: isDebt ? (record.balance === 0 ? 'paid' : 'debt') : 'paid',
                bookingPaid:   isDebt ? (record.balance === 0 ? true : null) : true,
            });
        }
    }

    return entries;
}

// ── Calcola il range di date per il filtro periodo ─────────────────────────
function _registroGetDateRange() {
    const now = new Date();
    const s   = _registroState;
    switch (s.range) {
        case 'all': return null;
        case 'this-month':
            return {
                from: new Date(now.getFullYear(), now.getMonth(), 1),
                to:   new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
            };
        case 'last-month': {
            const m = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
            const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
            return { from: new Date(y, m, 1), to: new Date(y, m + 1, 0, 23, 59, 59, 999) };
        }
        case 'this-year':
            return {
                from: new Date(now.getFullYear(), 0, 1),
                to:   new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999),
            };
        case 'custom':
            return {
                from: s.customFrom ? new Date(s.customFrom + 'T00:00:00') : null,
                to:   s.customTo   ? new Date(s.customTo   + 'T23:59:59') : null,
            };
        default: return null;
    }
}

// ── Toggle singolo pill tipo evento ───────────────────────────────────────
function toggleRegistroType(btn) {
    btn.classList.toggle('active');
    applyRegistroFilters();
}

// ── Applica tutti i filtri e rirenderizza ──────────────────────────────────
function applyRegistroFilters() {
    const all          = buildRegistroEntries();
    const range        = _registroGetDateRange();
    const activeTypes  = Array.from(document.querySelectorAll('.rfilter-type-pills .rfilter-btn.active')).map(b => b.dataset.etype);
    const filterSlot   = document.getElementById('registroFilterSlot')?.value   || 'all';
    const filterMethod = document.getElementById('registroFilterMethod')?.value || 'all';
    const filterStatus = document.getElementById('registroFilterStatus')?.value || 'all';
    const search       = (document.getElementById('registroSearch')?.value || '').toLowerCase().trim();

    let filtered = all.filter(e => {
        // Periodo (su timestamp dell'evento)
        if (range) {
            if (range.from && e.timestamp < range.from) return false;
            if (range.to   && e.timestamp > range.to)   return false;
        }
        // Tipo evento (multi-selezione: nessun bottone attivo = tutti)
        if (activeTypes.length > 0 && !activeTypes.includes(e.eventType)) return false;
        // Tipo lezione
        if (filterSlot !== 'all' && e.slotType !== filterSlot) return false;
        // Metodo pagamento
        if (filterMethod !== 'all' && e.paymentMethod !== filterMethod) return false;
        // Stato
        if (filterStatus !== 'all') {
            if (filterStatus === 'paid' && e.bookingPaid !== true) return false;
            if (filterStatus === 'unpaid') {
                if (e.eventType !== 'booking_created') return false;
                if (e.bookingPaid !== false) return false;
                if (e.bookingStatus === 'cancelled') return false;
            }
            if (filterStatus === 'cancelled' && e.bookingStatus !== 'cancelled') return false;
        }
        // Ricerca cliente
        if (search) {
            const hay = `${e.clientName} ${e.clientPhone} ${e.clientEmail}`.toLowerCase();
            if (!hay.includes(search)) return false;
        }
        return true;
    });

    // Ordinamento
    const dir   = _registroState.sortDir === 'asc' ? 1 : -1;
    const field = _registroState.sortField;
    filtered.sort((a, b) => {
        if (field === 'timestamp')  return dir * (a.timestamp - b.timestamp);
        if (field === 'lessonDate') return dir * (a.lessonDate || '').localeCompare(b.lessonDate || '');
        return 0;
    });

    _registroFiltered        = filtered;
    _registroState.page      = 0;
    _updateRegistroSummary(filtered);
    renderRegistroTable();
}

// ── Aggiorna le card summary ───────────────────────────────────────────────
function _updateRegistroSummary(filtered) {
    const totalEvents   = filtered.length;
    const totalPaid     = filtered
        .filter(e =>
            (e.eventType === 'booking_paid'  && e.paymentMethod !== 'lezione-gratuita' && e.paymentMethod !== 'credito')
            || (e.eventType === 'credit_added'    && !e.freeLesson)
            || (e.eventType === 'manual_debt_paid' && e.paymentMethod)
        )
        .reduce((s, e) => s + (e.amount || 0), 0);
    const totalBookings = filtered.filter(e => e.eventType === 'booking_created').length;

    const el = id => document.getElementById(id);
    if (el('registroTotalEvents'))   el('registroTotalEvents').textContent   = totalEvents;
    if (el('registroTotalPaid'))     el('registroTotalPaid').textContent     = `€${totalPaid.toFixed(2)}`;
    if (el('registroTotalBookings')) el('registroTotalBookings').textContent = totalBookings;
}

// ── Renderizza la tabella (pagina corrente) ────────────────────────────────
function renderRegistroTable() {
    const tbody = document.getElementById('registroTableBody');
    if (!tbody) return;

    const total = _registroFiltered.length;
    const page  = _registroState.page;
    const start = page * REGISTRO_PAGE_SIZE;
    const end   = Math.min(start + REGISTRO_PAGE_SIZE, total);
    const slice = _registroFiltered.slice(start, end);

    // Paginazione
    const info = document.getElementById('registroPaginationInfo');
    if (info) info.textContent = total === 0 ? 'Nessun risultato' : `${start + 1}–${end} di ${total}`;
    const prev = document.getElementById('registroPrevBtn');
    const next = document.getElementById('registroNextBtn');
    if (prev) prev.disabled = page === 0;
    if (next) next.disabled = end >= total;

    if (slice.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="registro-empty">Nessun evento trovato con i filtri selezionati.</td></tr>`;
        return;
    }

    const EVENT_CONFIG = {
        booking_created:          { icon: '📅', cls: 'rtype-booking',    label: 'Prenotazione' },
        booking_paid:             { icon: '✅', cls: 'rtype-paid',       label: 'Pagamento' },
        booking_cancelled:        { icon: '❌', cls: 'rtype-cancelled',  label: 'Annullamento' },
        booking_cancellation_req: { icon: '⏳', cls: 'rtype-pending',    label: 'Rich. Annullamento' },
        credit_added:             { icon: '⬆️', cls: 'rtype-credit',     label: 'Credito Manuale' },
        booking_refund:           { icon: '🔄', cls: 'rtype-refund',     label: 'Rimborso' },
        manual_debt:              { icon: '📋', cls: 'rtype-debt',       label: 'Debito Manuale' },
        manual_debt_paid:         { icon: '💰', cls: 'rtype-debtpaid',   label: 'Debito Saldato' },
        cancellation_mora:        { icon: '💸', cls: 'rtype-mora',       label: 'Mora' },
        bonus_used:               { icon: '🎟️', cls: 'rtype-bonus',      label: 'Bonus Utilizzato' },
    };
    const METHOD_ICON  = { contanti: '💵', carta: '💳', iban: '🏦', credito: '🔄', 'lezione-gratuita': '🎁' };
    const METHOD_LABEL = { contanti: 'Contanti', carta: 'Carta', iban: 'Bonifico', credito: 'Credito', 'lezione-gratuita': 'Gratuita' };

    const statusHTML = (e) => {
        if (e.bookingStatus === 'cancelled')              return `<span class="rstatus-badge rstatus-cancelled">Annullato</span>`;
        if (e.bookingStatus === 'cancellation_requested') return `<span class="rstatus-badge rstatus-pending">In attesa</span>`;
        if (e.bookingStatus === 'credit')                 return `<span class="rstatus-badge rstatus-paid">Pagato</span>`;
        if (e.bookingStatus === 'debt')                   return `<span class="rstatus-badge rstatus-debt">Da pagare</span>`;
        if (e.bookingPaid === true)                       return `<span class="rstatus-badge rstatus-paid">Pagato</span>`;
        if (e.bookingPaid === false)                      return `<span class="rstatus-badge rstatus-unpaid">Non pagato</span>`;
        return '—';
    };

    const fmtTs = d => d
        ? d.toLocaleString('it-IT', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' })
        : '—';
    const fmtDate = str => {
        if (!str) return '—';
        const [y, m, d] = str.split('-');
        return `${d}/${m}/${y}`;
    };

    tbody.innerHTML = slice.map(e => {
        const cfg    = EVENT_CONFIG[e.eventType] || { icon: '•', cls: '', label: e.eventType };
        const mi     = e.paymentMethod ? METHOD_ICON[e.paymentMethod]  || '' : '';
        const ml     = e.paymentMethod ? METHOD_LABEL[e.paymentMethod] || e.paymentMethod : '—';
        const amount = e.amount != null ? `€${Number(e.amount).toFixed(2)}` : '—';
        return `<tr class="registro-row">
            <td class="registro-ts">${fmtTs(e.timestamp)}</td>
            <td><span class="rtype-badge ${cfg.cls}">${cfg.icon} ${cfg.label}</span></td>
            <td class="registro-client">
                <span class="registro-client-name">${_escHtml(e.clientName)}</span>
                ${e.clientPhone ? `<span class="registro-client-phone">${_escHtml(e.clientPhone)}</span>` : ''}
            </td>
            <td>${fmtDate(e.lessonDate)}</td>
            <td class="registro-time">${_escHtml(e.lessonTime || '—')}</td>
            <td>${_escHtml(e.slotLabel || '—')}</td>
            <td class="registro-amount">${amount}</td>
            <td class="registro-method">${mi} ${_escHtml(ml)}</td>
            <td>${statusHTML(e)}</td>
            <td class="registro-note" title="${_escHtml(e.notes || '')}">${_escHtml(e.notes || '—')}</td>
        </tr>`;
    }).join('');
}

// _escHtml è definita in ui.js (caricato prima di admin.js su tutte le pagine)

// ── Ordinamento colonne ────────────────────────────────────────────────────
function toggleRegistroSort(field) {
    if (_registroState.sortField === field) {
        _registroState.sortDir = _registroState.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
        _registroState.sortField = field;
        _registroState.sortDir   = 'desc';
    }
    const tsIcon = document.getElementById('registroSortTs');
    const lsIcon = document.getElementById('registroSortLesson');
    if (tsIcon) tsIcon.textContent = field === 'timestamp'  ? (_registroState.sortDir === 'desc' ? '↓' : '↑') : '';
    if (lsIcon) lsIcon.textContent = field === 'lessonDate' ? (_registroState.sortDir === 'desc' ? '↓' : '↑') : '';
    applyRegistroFilters();
}

// ── Filtro periodo ─────────────────────────────────────────────────────────
function setRegistroRange(range, btn) {
    _registroState.range = range;
    document.querySelectorAll('.rfilter-btn[data-range]').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    const customDiv = document.getElementById('registroCustomDates');
    if (range === 'custom') {
        if (customDiv) customDiv.style.display = 'flex';
        return; // attende Applica
    }
    if (customDiv) customDiv.style.display = 'none';
    applyRegistroFilters();
}

function applyRegistroCustomRange() {
    const from = document.getElementById('registroDateFrom')?.value;
    const to   = document.getElementById('registroDateTo')?.value;
    if (!from || !to) { alert('Seleziona entrambe le date.'); return; }
    if (from > to)    { alert('La data di inizio deve essere precedente alla data di fine.'); return; }
    _registroState.customFrom = from;
    _registroState.customTo   = to;
    applyRegistroFilters();
}

// ── Reset filtri ───────────────────────────────────────────────────────────
function resetRegistroFilters() {
    _registroState.range      = 'all';
    _registroState.customFrom = null;
    _registroState.customTo   = null;
    _registroState.sortField  = 'timestamp';
    _registroState.sortDir    = 'desc';
    _registroState.page       = 0;

    document.querySelectorAll('.rfilter-btn[data-range]').forEach(b => {
        b.classList.toggle('active', b.dataset.range === 'all');
    });
    const customDiv = document.getElementById('registroCustomDates');
    if (customDiv) customDiv.style.display = 'none';

    document.querySelectorAll('.rfilter-type-pills .rfilter-btn').forEach(b => b.classList.remove('active'));
    ['registroFilterSlot', 'registroFilterMethod', 'registroFilterStatus'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = 'all';
    });
    const searchEl = document.getElementById('registroSearch');
    if (searchEl) searchEl.value = '';

    const tsIcon = document.getElementById('registroSortTs');
    const lsIcon = document.getElementById('registroSortLesson');
    if (tsIcon) tsIcon.textContent = '↓';
    if (lsIcon) lsIcon.textContent = '';

    applyRegistroFilters();
}

// ── Paginazione ────────────────────────────────────────────────────────────
function registroNextPage() {
    const maxPage = Math.ceil(_registroFiltered.length / REGISTRO_PAGE_SIZE) - 1;
    if (_registroState.page < maxPage) { _registroState.page++; renderRegistroTable(); }
}
function registroPrevPage() {
    if (_registroState.page > 0) { _registroState.page--; renderRegistroTable(); }
}

// ── Entry point chiamato da switchTab ──────────────────────────────────────
function renderRegistroTab() {
    applyRegistroFilters();
}

// ── Export Excel della vista filtrata ─────────────────────────────────────
function exportRegistro() {
    const data = _registroFiltered;
    if (data.length === 0) {
        alert('Nessun dato da esportare con i filtri correnti.');
        return;
    }

    const EVENT_LABEL = {
        booking_created:          'Prenotazione',
        booking_paid:             'Pagamento',
        booking_cancelled:        'Annullamento',
        booking_cancellation_req: 'Rich. Annullamento',
        credit_added:             'Credito Manuale',
        booking_refund:           'Rimborso',
        manual_debt:              'Debito Manuale',
        manual_debt_paid:         'Debito Saldato',
        cancellation_mora:        'Mora',
        bonus_used:               'Bonus Utilizzato',
    };
    const METHOD_LABEL = {
        contanti: 'Contanti', carta: 'Carta', iban: 'Bonifico',
        credito: 'Credito', 'lezione-gratuita': 'Gratuita',
    };
    const statusLabel = e => {
        if (e.bookingStatus === 'cancelled')              return 'Annullato';
        if (e.bookingStatus === 'cancellation_requested') return 'Rich. Annullamento';
        if (e.bookingStatus === 'credit')                 return 'Credito';
        if (e.bookingStatus === 'debt')                   return 'Debito';
        if (e.bookingPaid === true)                       return 'Pagato';
        if (e.bookingPaid === false)                      return 'Non pagato';
        return '';
    };
    const fmtTs   = d  => d ? d.toLocaleString('it-IT') : '';
    const fmtDate = str => {
        if (!str) return '';
        const [y, m, d] = str.split('-');
        return `${d}/${m}/${y}`;
    };

    const sheetData = [
        ['Data/Ora Evento', 'Tipo Evento', 'Cliente', 'Telefono', 'Email',
         'Data Lezione', 'Ora Lezione', 'Tipo Lezione',
         'Importo (€)', 'Metodo Pagamento', 'Stato', 'Note', 'Booking ID'],
        ...data.map(e => [
            fmtTs(e.timestamp),
            EVENT_LABEL[e.eventType] || e.eventType,
            e.clientName,
            e.clientPhone,
            e.clientEmail,
            fmtDate(e.lessonDate),
            e.lessonTime || '',
            e.slotLabel  || '',
            e.amount != null ? e.amount : '',
            METHOD_LABEL[e.paymentMethod] || e.paymentMethod || '',
            statusLabel(e),
            e.notes     || '',
            e.bookingId || '',
        ]),
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    const colWidths = sheetData[0].map((_, ci) =>
        Math.min(50, Math.max(10, ...sheetData.map(r => String(r[ci] ?? '').length)))
    );
    ws['!cols'] = colWidths.map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, 'Registro');

    const date = _localDateStr();
    XLSX.writeFile(wb, `TB_Registro_${date}.xlsx`);

    const btn = document.getElementById('registroExportBtn');
    if (btn) {
        const orig = btn.innerHTML;
        btn.innerHTML = '✅ Scaricato!';
        setTimeout(() => { btn.innerHTML = orig; }, 2500);
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Statistics Detail Panel ──────────────────────────────────────────────────

let _currentStatDetail = null;

function toggleStatDetail(type) {
    const panel = document.getElementById('statsDetailPanel');
    const card  = document.getElementById('statcard-' + type);
    if (!panel || !card) return;

    if (_currentStatDetail === type) {
        panel.style.display = 'none';
        panel.innerHTML = '';
        card.classList.remove('active');
        _currentStatDetail = null;
        return;
    }

    if (_currentStatDetail) {
        const prev = document.getElementById('statcard-' + _currentStatDetail);
        if (prev) prev.classList.remove('active');
    }

    card.classList.add('active');
    _currentStatDetail = type;
    panel.style.display = 'block';

    switch (type) {
        case 'fatturato':     renderFatturatoDetail(panel);     break;
        case 'prenotazioni':  renderPrenotazioniDetail(panel);  break;
        case 'clienti':       renderClientiDetail(panel);       break;
        case 'occupancy':     renderOccupancyDetail(panel);     break;
        default:
            panel.innerHTML = `<div class="stat-detail-header"><h3>Dettaglio ${type}</h3></div><p style="color:#9ca3af;text-align:center;padding:1.5rem 0">Prossimamente</p>`;
    }
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderFatturatoDetail(panel) {
    const allBookings = BookingStorage.getAllBookings()
        .filter(b => b.status !== 'cancelled' && b.paymentMethod !== 'lezione-gratuita');
    const { from, to } = getFilterDateRange(currentFilter);
    const now   = new Date();
    const today = new Date(now); today.setHours(0, 0, 0, 0);

    // Bookings in current filter period
    const periodBookings = allBookings.filter(b => {
        const d = new Date(b.date + 'T00:00:00');
        return d >= from && d <= to;
    });

    // Past bookings (before today) — per-competenza revenue
    const pastBookings   = periodBookings.filter(b => new Date(b.date + 'T00:00:00') < today);
    const pastRevenue    = pastBookings.reduce((s, b) => s + (SLOT_PRICES[b.slotType] || 0), 0);

    // Future confirmed bookings in period
    const futureBookings = periodBookings.filter(b => new Date(b.date + 'T00:00:00') >= today);
    const futureRevenue  = futureBookings.reduce((s, b) => s + (SLOT_PRICES[b.slotType] || 0), 0);

    // Linear projection for remaining days (based on past daily rate)
    const periodStart    = from.getTime();
    const yesterday      = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayCap   = Math.min(yesterday.getTime(), to.getTime());
    const daysElapsed    = today <= from ? 1 : Math.max(1, Math.round((yesterdayCap - periodStart) / 86400000) + 1);
    const totalDays      = Math.max(1, Math.round((to.getTime() - periodStart) / 86400000) + 1);
    const daysRemaining  = Math.max(0, totalDays - daysElapsed);
    const dailyRate      = pastRevenue / daysElapsed;
    const linearExtra    = Math.round(dailyRate * daysRemaining);
    // Best estimate: use whichever is higher — confirmed future or linear projection
    const totalEstimate  = pastRevenue + Math.max(futureRevenue, linearExtra);
    // Weekly average based on all confirmed data in the period
    const weeklyAvg      = Math.round((pastRevenue + futureRevenue) / totalDays * 7);

    // ── 12-month bar chart ────────────────────────────────────────────────────
    const MONTH_NAMES = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
    const barLabels = [], barValues = [], barHighlight = [], barProjected = [];

    // Current-month projection for dashed extension
    const cmFrom    = new Date(now.getFullYear(), now.getMonth(), 1);
    const cmTo      = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const cmActual  = allBookings.filter(b => { const d = new Date(b.date + 'T00:00:00'); return d >= cmFrom && d < today; }).reduce((s, b) => s + (SLOT_PRICES[b.slotType] || 0), 0);
    const cmFuture  = allBookings.filter(b => { const d = new Date(b.date + 'T00:00:00'); return d >= today && d <= cmTo; }).reduce((s, b) => s + (SLOT_PRICES[b.slotType] || 0), 0);
    const cmElapsed = Math.max(1, Math.round((Math.min(yesterday.getTime(), cmTo.getTime()) - cmFrom.getTime()) / 86400000) + 1);
    const cmDays    = Math.round((cmTo.getTime() - cmFrom.getTime()) / 86400000) + 1;
    const cmRate    = cmActual / cmElapsed;
    const cmLinear  = Math.round(cmRate * Math.max(0, cmDays - cmElapsed));
    const cmEstimate = cmActual + Math.max(cmFuture, cmLinear);

    for (let i = 11; i >= 0; i--) {
        const d     = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const mFrom = new Date(d.getFullYear(), d.getMonth(), 1);
        const mTo   = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
        const isCurrent = i === 0;
        // For current month: solid = past only; for past months: all occurred
        const rev = allBookings
            .filter(b => { const bd = new Date(b.date + 'T00:00:00'); return isCurrent ? bd >= mFrom && bd < today : bd >= mFrom && bd <= mTo; })
            .reduce((s, b) => s + (SLOT_PRICES[b.slotType] || 0), 0);
        barLabels.push(MONTH_NAMES[d.getMonth()]);
        barValues.push(rev);
        barHighlight.push(isCurrent);
        barProjected.push(isCurrent ? Math.max(0, cmEstimate - rev) : 0);
    }

    // ── Forecast chart: actual (past) + confirmed future as cumulative ────────
    const useWeekly  = totalDays > 60;
    const groupDays  = useWeekly ? 7 : 1;
    const groups     = Math.ceil(totalDays / groupDays);
    const fActual = [], fForecast = [], fLabels = [];

    const todayGroupIdx = (today >= from && today <= to)
        ? Math.floor((today.getTime() - periodStart) / (86400000 * groupDays))
        : null;

    // Revenue maps by date
    const revByDate = {};
    const futureRevByDate = {};
    allBookings.forEach(b => {
        const d = new Date(b.date + 'T00:00:00');
        if (d >= from && d < today)  revByDate[b.date]       = (revByDate[b.date] || 0)       + (SLOT_PRICES[b.slotType] || 0);
        if (d >= today && d >= from && d <= to) futureRevByDate[b.date] = (futureRevByDate[b.date] || 0) + (SLOT_PRICES[b.slotType] || 0);
    });

    let cumRev = 0, cumFuture = 0;
    for (let g = 0; g < groups; g++) {
        const gStart = new Date(periodStart + g * groupDays * 86400000);
        const gEnd   = new Date(periodStart + (g + 1) * groupDays * 86400000 - 1);
        fLabels.push(`${gStart.getDate()}/${gStart.getMonth() + 1}`);

        if (gEnd < today) {
            // Fully past — actual only
            let gRev = 0;
            for (let dd = 0; dd < groupDays; dd++) {
                const day = new Date(periodStart + (g * groupDays + dd) * 86400000);
                gRev += revByDate[day.toISOString().split('T')[0]] || 0;
            }
            cumRev += gRev;
            fActual.push(cumRev);
            fForecast.push(null);
        } else if (gStart >= today) {
            // Fully future — confirmed bookings cumulative
            let gFutureRev = 0;
            for (let dd = 0; dd < groupDays; dd++) {
                const day = new Date(periodStart + (g * groupDays + dd) * 86400000);
                gFutureRev += futureRevByDate[day.toISOString().split('T')[0]] || 0;
            }
            cumFuture += gFutureRev;
            fActual.push(null);
            fForecast.push(pastRevenue + cumFuture);
        } else {
            // Straddles today — partial actual + start of forecast (connect both lines)
            let gRev = 0, gFutureRev = 0;
            for (let dd = 0; dd < groupDays; dd++) {
                const day = new Date(periodStart + (g * groupDays + dd) * 86400000);
                if (day < today) gRev       += revByDate[day.toISOString().split('T')[0]] || 0;
                else             gFutureRev += futureRevByDate[day.toISOString().split('T')[0]] || 0;
            }
            cumRev    += gRev;
            cumFuture += gFutureRev;
            fActual.push(cumRev);
            fForecast.push(cumRev + cumFuture);
        }
    }

    // ── Fatturato per tipo di lezione ─────────────────────────────────────────
    const typeConfig = [
        { key: 'personal-training', label: 'Autonomia' },
        { key: 'small-group',       label: 'Lez. Gruppo' },
        { key: 'group-class',       label: 'Slot prenotato' },
    ];
    const typeStats = typeConfig.map(({ key, label }) => {
        const pastB   = pastBookings.filter(b => b.slotType === key);
        const futureB = futureBookings.filter(b => b.slotType === key);
        return {
            label,
            pastCount:    pastB.length,
            pastRev:      pastB.reduce((s, b) => s + (SLOT_PRICES[b.slotType] || 0), 0),
            futureCount:  futureB.length,
            futureRev:    futureB.reduce((s, b) => s + (SLOT_PRICES[b.slotType] || 0), 0),
        };
    }).filter(t => t.pastCount + t.futureCount > 0);

    const typeTotal = typeStats.reduce((s, t) => s + t.pastRev + t.futureRev, 0);
    const typePieData = {
        labels: typeStats.map(t => `${t.label} €${t.pastRev + t.futureRev}`),
        values: typeStats.map(t => t.pastRev + t.futureRev),
    };

    // ── Render ────────────────────────────────────────────────────────────────
    panel.innerHTML = `
        <div class="stat-detail-header">
            <h3>💰 Fatturato — Dettaglio</h3>
            <span class="stat-detail-period">${getFilterLabel(currentFilter)}</span>
        </div>
        <div class="stat-detail-kpis">
            <div class="stat-detail-kpi">
                <div class="stat-detail-kpi-value">€${pastRevenue}</div>
                <div class="stat-detail-kpi-label">Incassato</div>
            </div>
            <div class="stat-detail-kpi stat-detail-kpi--future">
                <div class="stat-detail-kpi-value">€${futureRevenue}</div>
                <div class="stat-detail-kpi-label">Prenotato futuro</div>
            </div>
            <div class="stat-detail-kpi stat-detail-kpi--projected">
                <div class="stat-detail-kpi-value">€${totalEstimate}</div>
                <div class="stat-detail-kpi-label">Stima periodo</div>
            </div>
            <div class="stat-detail-kpi">
                <div class="stat-detail-kpi-value">€${weeklyAvg}</div>
                <div class="stat-detail-kpi-label">Media settimanale</div>
            </div>
        </div>
        <div class="stat-detail-charts">
            <div class="stat-detail-chart-block">
                <h4>Fatturato mensile (ultimi 12 mesi)</h4>
                <canvas id="detailBarChart" style="width:100%;display:block;"></canvas>
            </div>
            <div class="stat-detail-chart-block">
                <h4>Andamento e proiezione — ${getFilterLabel(currentFilter)}</h4>
                <canvas id="detailForecastChart" style="width:100%;display:block;"></canvas>
            </div>
        </div>
        <div class="stat-detail-breakdown">
            <h4>Prenotazioni nel periodo</h4>
            <div class="sdb-rows">
                <div class="sdb-row">
                    <span class="sdb-label">Lezioni passate (${pastBookings.length})</span>
                    <span class="sdb-value">€${pastRevenue}</span>
                </div>
                <div class="sdb-row">
                    <span class="sdb-label">Lezioni future confermate (${futureBookings.length})</span>
                    <span class="sdb-value sdb-future">€${futureRevenue}</span>
                </div>
                <div class="sdb-row sdb-row--total">
                    <span class="sdb-label">Totale confermato</span>
                    <span class="sdb-value">€${pastRevenue + futureRevenue}</span>
                </div>
                <div class="sdb-row sdb-row--projected">
                    <span class="sdb-label">Stima al ${to.getDate()}/${to.getMonth() + 1}/${to.getFullYear()} (confermato + proiezione)</span>
                    <span class="sdb-value">€${totalEstimate}</span>
                </div>
            </div>
        </div>

        <div class="stat-detail-chart-block stat-detail-type-section">
            <h4>Fatturato per tipo di lezione</h4>
            <canvas id="detailTypeChart" style="width:100%;display:block;"></canvas>
        </div>
    `;

    requestAnimationFrame(() => {
        const barCanvas = document.getElementById('detailBarChart');
        if (barCanvas) new SimpleChart(barCanvas).drawBarChart({ labels: barLabels, values: barValues, highlight: barHighlight, projected: barProjected });

        const fcCanvas = document.getElementById('detailForecastChart');
        if (fcCanvas) new SimpleChart(fcCanvas).drawForecastChart({ actual: fActual, forecast: fForecast, labels: fLabels, todayIndex: todayGroupIdx });

        const typeCanvas = document.getElementById('detailTypeChart');
        if (typeCanvas && typeStats.length > 0) new SimpleChart(typeCanvas).drawPieChart(typePieData, { colors: ['#3b82f6', '#f59e0b', '#22c55e'] });
    });
}

function renderPrenotazioniDetail(panel) {
    const allBookings = BookingStorage.getAllBookings();
    const { from, to } = getFilterDateRange(currentFilter);
    const now   = new Date();
    const today = new Date(now); today.setHours(0, 0, 0, 0);

    const periodBookings = allBookings.filter(b => {
        if (b.status === 'cancelled') return false;
        const d = new Date(b.date + 'T00:00:00');
        return d >= from && d <= to;
    });
    const pastBookings   = periodBookings.filter(b => new Date(b.date + 'T00:00:00') < today);
    const futureBookings = periodBookings
        .filter(b => new Date(b.date + 'T00:00:00') >= today)
        .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

    const cancelledInPeriod = allBookings.filter(b => {
        if (b.status !== 'cancelled') return false;
        const d = new Date(b.date + 'T00:00:00');
        return d >= from && d <= to;
    });

    // ── KPIs ─────────────────────────────────────────────────────────────────
    const totalDays  = Math.max(1, Math.round((to - from) / 86400000) + 1);
    const weeklyAvg  = (periodBookings.length / totalDays * 7).toFixed(1);
    const cancelRate = cancelledInPeriod.length > 0
        ? Math.round(cancelledInPeriod.length / (periodBookings.length + cancelledInPeriod.length) * 100)
        : 0;

    // ── Trend mensile (ultimi 12 mesi) ────────────────────────────────────────
    const MONTH_NAMES = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
    const trendLabels = [], trendValues = [], trendHighlight = [], trendProjected = [];
    const cmFrom = new Date(now.getFullYear(), now.getMonth(), 1);
    const cmDaysTotal = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const cmDaysElapsed = Math.max(today.getDate() - 1, 1);
    for (let i = 11; i >= 0; i--) {
        const d     = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const mFrom = new Date(d.getFullYear(), d.getMonth(), 1);
        const mTo   = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
        trendLabels.push(MONTH_NAMES[d.getMonth()]);
        const isCurrent = i === 0;
        const count = allBookings.filter(b => {
            if (b.status === 'cancelled') return false;
            const bd = new Date(b.date + 'T00:00:00');
            return bd >= mFrom && (isCurrent ? bd < today : bd <= mTo);
        }).length;
        trendValues.push(count);
        trendHighlight.push(isCurrent);
        if (isCurrent) {
            const cmFuture = allBookings.filter(b => {
                if (b.status === 'cancelled') return false;
                const bd = new Date(b.date + 'T00:00:00');
                return bd >= today && bd <= mTo;
            }).length;
            const cmLinear = Math.round(count * cmDaysTotal / cmDaysElapsed);
            trendProjected.push(Math.max(cmFuture, cmLinear - count, 0));
        } else {
            trendProjected.push(0);
        }
    }

    // ── Per tipo ──────────────────────────────────────────────────────────────
    const typeConfig = [
        { key: 'personal-training', label: 'Autonomia' },
        { key: 'small-group',       label: 'Lez. Gruppo' },
        { key: 'group-class',       label: 'Slot prenotato' },
    ];
    const typeLabels = [], typeValues = [];
    typeConfig.forEach(({ key, label }) => {
        const c = periodBookings.filter(b => b.slotType === key).length;
        if (c > 0) { typeLabels.push(label); typeValues.push(c); }
    });

    // ── Per giorno della settimana ────────────────────────────────────────────
    const dayCounts = [0,0,0,0,0,0,0];
    pastBookings.forEach(b => { dayCounts[new Date(b.date + 'T00:00:00').getDay()]++; });
    const DAY_ORDER = [1,2,3,4,5,6,0];
    const DAY_NAMES = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];
    const dayLabels = DAY_ORDER.map(d => DAY_NAMES[d]);
    const dayValues = DAY_ORDER.map(d => dayCounts[d]);

    // ── Per fascia oraria ─────────────────────────────────────────────────────
    const timeMap = {};
    pastBookings.forEach(b => {
        const t = b.time ? b.time.split(' - ')[0] : '?';
        timeMap[t] = (timeMap[t] || 0) + 1;
    });
    const timeSorted = Object.entries(timeMap).sort((a, b) => a[0].localeCompare(b[0]));
    const timeLabels = timeSorted.map(([t]) => t);
    const timeValues = timeSorted.map(([, c]) => c);

    // ── Fascia oraria / giorno più popolare ──────────────────────────────────
    const peakTime  = timeSorted.length ? timeSorted.reduce((a, b) => b[1] > a[1] ? b : a)[0] : '—';
    const peakDay   = dayValues.reduce((mi, v, i, a) => v > a[mi] ? i : mi, 0);

    // ── Render ────────────────────────────────────────────────────────────────
    panel.innerHTML = `
        <div class="stat-detail-header">
            <h3>📅 Prenotazioni — Dettaglio</h3>
            <span class="stat-detail-period">${getFilterLabel(currentFilter)}</span>
        </div>
        <div class="stat-detail-kpis">
            <div class="stat-detail-kpi">
                <div class="stat-detail-kpi-value">${periodBookings.length}</div>
                <div class="stat-detail-kpi-label">Totale periodo</div>
            </div>
            <div class="stat-detail-kpi stat-detail-kpi--future">
                <div class="stat-detail-kpi-value">${futureBookings.length}</div>
                <div class="stat-detail-kpi-label">Future</div>
            </div>
            <div class="stat-detail-kpi">
                <div class="stat-detail-kpi-value">${weeklyAvg}</div>
                <div class="stat-detail-kpi-label">Media sett.</div>
            </div>
            <div class="stat-detail-kpi ${cancelRate > 5 ? 'stat-detail-kpi--warn' : ''}">
                <div class="stat-detail-kpi-value">${cancelRate}%</div>
                <div class="stat-detail-kpi-label">Cancellazioni</div>
            </div>
        </div>

        <div class="stat-detail-charts">
            <div class="stat-detail-chart-block">
                <h4>Trend mensile (ultimi 12 mesi)</h4>
                <canvas id="detailTrendChart" style="width:100%;display:block;"></canvas>
            </div>
            <div class="stat-detail-chart-block">
                <h4>Per tipo di lezione</h4>
                <canvas id="detailTypeBookChart" style="width:100%;display:block;"></canvas>
            </div>
        </div>

        <div class="stat-detail-charts">
            <div class="stat-detail-chart-block">
                <h4>Per giorno della settimana</h4>
                <canvas id="detailDayChart" style="width:100%;display:block;"></canvas>
            </div>
            <div class="stat-detail-chart-block">
                <h4>Per fascia oraria</h4>
                <canvas id="detailTimeChart" style="width:100%;display:block;"></canvas>
            </div>
        </div>

        <div class="stat-detail-breakdown" style="margin-bottom:0.25rem">
            <div class="sdb-rows">
                <div class="sdb-row">
                    <span class="sdb-label" style="color:#6b7280">Fascia oraria più popolare</span>
                    <span class="sdb-value sdb-bold">${peakTime}</span>
                </div>
                <div class="sdb-row">
                    <span class="sdb-label" style="color:#6b7280">Giorno più popolare</span>
                    <span class="sdb-value sdb-bold">${dayLabels[peakDay]}</span>
                </div>
            </div>
        </div>
    `;

    requestAnimationFrame(() => {
        const trendCanvas = document.getElementById('detailTrendChart');
        if (trendCanvas) new SimpleChart(trendCanvas).drawBarChart(
            { labels: trendLabels, values: trendValues, highlight: trendHighlight, projected: trendProjected },
            { colors: ['#8b5cf6'], prefix: '' }
        );
        const typeBookCanvas = document.getElementById('detailTypeBookChart');
        if (typeBookCanvas && typeLabels.length > 0)
            new SimpleChart(typeBookCanvas).drawPieChart(
                { labels: typeLabels, values: typeValues },
                { colors: ['#3b82f6', '#f59e0b', '#22c55e'] }
            );
        const dayCanvas = document.getElementById('detailDayChart');
        if (dayCanvas) new SimpleChart(dayCanvas).drawBarChart(
            { labels: dayLabels, values: dayValues },
            { colors: ['#06b6d4'], prefix: '' }
        );
        const timeCanvas = document.getElementById('detailTimeChart');
        if (timeCanvas && timeLabels.length > 0)
            new SimpleChart(timeCanvas).drawBarChart(
                { labels: timeLabels, values: timeValues },
                { colors: ['#f97316'], prefix: '' }
            );
    });
}

function renderClientiDetail(panel) {
    const allBookings = BookingStorage.getAllBookings();
    const { from, to } = getFilterDateRange(currentFilter);
    const periodFrom = from || new Date(0);
    const periodTo   = to   || new Date(9e15);
    const now  = new Date();
    const today = new Date(now); today.setHours(0, 0, 0, 0);

    // Build client map (all bookings in period, incluse cancellate)
    const clientMap = {};
    allBookings.forEach(b => {
        const bd = new Date(b.date + 'T00:00:00');
        if (bd < periodFrom || bd > periodTo) return;
        const key = b.email || b.whatsapp || b.name;
        if (!clientMap[key]) clientMap[key] = { name: b.name, total: 0, cancelled: 0, future: 0 };
        if (b.status === 'cancelled') {
            clientMap[key].cancelled++;
        } else {
            clientMap[key].total++;
            if (bd >= today) clientMap[key].future++;
        }
    });

    const clients = Object.values(clientMap);
    const activeClients = clients.filter(c => c.total > 0);
    const totalUnique = clients.length;
    const totalBookings = activeClients.reduce((s, c) => s + c.total, 0);
    const avgBookings = activeClients.length ? (totalBookings / activeClients.length).toFixed(1) : '0';
    const withCancellations = clients.filter(c => c.cancelled > 0).length;
    const cancelClientsRate = totalUnique ? Math.round(withCancellations / totalUnique * 100) : 0;

    // Nuovi clienti: prima prenotazione in assoluto cade nel periodo
    const firstBookingByKey = {};
    allBookings.forEach(b => {
        if (b.status === 'cancelled') return;
        const key = b.email || b.whatsapp || b.name;
        const bd  = new Date(b.date + 'T00:00:00');
        if (!firstBookingByKey[key] || bd < firstBookingByKey[key].date)
            firstBookingByKey[key] = { date: bd, name: b.name };
    });
    const newClients = Object.values(firstBookingByKey)
        .filter(c => c.date >= periodFrom && c.date <= periodTo)
        .sort((a, b) => a.date - b.date);

    const topActive    = [...activeClients].sort((a, b) => b.total - a.total).slice(0, 5);
    const leastActive  = [...activeClients].sort((a, b) => a.total - b.total).slice(0, 5);
    const topCancellers = clients.filter(c => c.cancelled > 0).sort((a, b) => b.cancelled - a.cancelled).slice(0, 5);
    const mostLoyal    = [...activeClients].filter(c => c.cancelled === 0).sort((a, b) => b.total - a.total).slice(0, 5);

    const _emptyRow = '<div class="sdb-row"><span class="sdb-label" style="color:#9ca3af">Nessun dato</span></div>';
    const _clientRows = (list, valueFn) => list.length === 0 ? _emptyRow :
        list.map((c, i) => `
            <div class="sdb-row">
                <span class="sdb-label">${i + 1}. ${c.name}</span>
                <span class="sdb-value">${valueFn(c)}</span>
            </div>`).join('');

    panel.innerHTML = `
        <div class="stat-detail-header">
            <h3>👥 Clienti — Dettaglio</h3>
            <span class="stat-detail-period">${getFilterLabel(currentFilter)}</span>
        </div>
        <div class="stat-detail-kpis">
            <div class="stat-detail-kpi">
                <div class="stat-detail-kpi-value">${totalUnique}</div>
                <div class="stat-detail-kpi-label">Clienti unici</div>
            </div>
            <div class="stat-detail-kpi stat-detail-kpi--projected">
                <div class="stat-detail-kpi-value">${newClients.length}</div>
                <div class="stat-detail-kpi-label">Nuovi clienti</div>
            </div>
            <div class="stat-detail-kpi">
                <div class="stat-detail-kpi-value">${avgBookings}</div>
                <div class="stat-detail-kpi-label">Media lezioni/cliente</div>
            </div>
            <div class="stat-detail-kpi ${cancelClientsRate > 20 ? 'stat-detail-kpi--warn' : ''}">
                <div class="stat-detail-kpi-value">${cancelClientsRate}%</div>
                <div class="stat-detail-kpi-label">Con cancellazioni</div>
            </div>
        </div>

        <div class="stat-detail-charts">
            <div class="stat-detail-breakdown">
                <h4>🏆 Più attivi nel periodo</h4>
                <div class="sdb-rows">
                    ${_clientRows(topActive, c => `${c.total} lezioni`)}
                </div>
            </div>
            <div class="stat-detail-breakdown">
                <h4>💤 Meno attivi nel periodo</h4>
                <div class="sdb-rows">
                    ${_clientRows(leastActive, c => `${c.total} lezioni`)}
                </div>
            </div>
        </div>

        <div class="stat-detail-charts">
            <div class="stat-detail-breakdown" style="grid-column:1/-1">
                <h4>🆕 Nuovi clienti nel periodo (${newClients.length})</h4>
                <div class="sdb-rows">
                    ${newClients.length === 0
                        ? '<div class="sdb-row"><span class="sdb-label" style="color:#9ca3af">Nessun nuovo cliente nel periodo</span></div>'
                        : newClients.map((c, i) => `
                            <div class="sdb-row">
                                <span class="sdb-label">${i + 1}. ${c.name}</span>
                                <span class="sdb-value" style="color:#9ca3af;font-size:0.8rem">${c.date.getDate()}/${c.date.getMonth()+1}/${c.date.getFullYear()}</span>
                            </div>`).join('')
                    }
                </div>
            </div>
        </div>

        <div class="stat-detail-charts">
            <div class="stat-detail-breakdown">
                <h4>❌ Top annullatori</h4>
                <div class="sdb-rows">
                    ${_clientRows(topCancellers, c => `${c.cancelled} cancellaz.`)}
                </div>
            </div>
            <div class="stat-detail-breakdown">
                <h4>⭐ Più fedeli (0 cancellazioni)</h4>
                <div class="sdb-rows">
                    ${_clientRows(mostLoyal, c => `${c.total} lezioni`)}
                </div>
            </div>
        </div>
    `;
}

let _certModalEmail    = null;
let _certModalWhatsapp = null;
let _certModalName2    = null;
let _certModalBadgeEl  = null;

// ── Raw gym_users helpers (con tutti i campi, inclusi cert) ──────────────────
function _getUsersFull() {
    try { return JSON.parse(localStorage.getItem('gym_users') || '[]'); } catch { return []; }
}
function _saveUsers(users) {
    localStorage.setItem('gym_users', JSON.stringify(users));
}
async function _updateSupabaseProfile(email, whatsapp, fields) {
    if (typeof supabaseClient === 'undefined') return;
    try {
        let query = supabaseClient.from('profiles').update(fields);
        if (email) {
            query = query.eq('email', email.toLowerCase());
        } else if (whatsapp) {
            query = query.eq('whatsapp', normalizePhone(whatsapp));
        } else {
            return;
        }
        await query;
    } catch (e) {
        console.warn('Supabase profile sync failed:', e);
    }
}
function _getUserRecord(email, whatsapp) {
    const users = _getUsersFull();
    const idx = _findUserIdx(users, email, whatsapp);
    return idx !== -1 ? users[idx] : null;
}

function _findUserIdx(users, email, whatsapp) {
    // Cerca prima per email, poi per telefono normalizzato
    if (email) {
        const i = users.findIndex(u => u.email?.toLowerCase() === email.toLowerCase());
        if (i !== -1) return i;
    }
    if (whatsapp) {
        const normWa = normalizePhone(whatsapp);
        const i = users.findIndex(u => normalizePhone(u.whatsapp || '') === normWa);
        if (i !== -1) return i;
    }
    return -1;
}

function openCertModal(badgeEl, email, whatsapp, name) {
    _certModalEmail    = email;
    _certModalWhatsapp = whatsapp;
    _certModalName2    = name;
    _certModalBadgeEl  = badgeEl;

    const users = _getUsersFull();
    const idx   = _findUserIdx(users, email, whatsapp);
    const existing = idx !== -1 ? (users[idx].certificatoMedicoScadenza || '') : '';
    const existingCF = idx !== -1 ? (users[idx].codiceFiscale || '') : '';

    document.getElementById('certModalName').textContent = name;
    document.getElementById('certModalDate').value = existing;
    document.getElementById('certModalCF').value = existingCF;
    document.getElementById('certModalCFError').style.display = 'none';
    document.getElementById('certModalOverlay').style.display = 'block';
    document.getElementById('certModal').style.display = 'flex';
    setTimeout(() => document.getElementById('certModalDate').focus(), 50);
}

function closeCertModal() {
    document.getElementById('certModalOverlay').style.display = 'none';
    document.getElementById('certModal').style.display = 'none';
    _certModalEmail = _certModalWhatsapp = _certModalName2 = _certModalBadgeEl = null;
}

function saveCertDate() {
    const val = document.getElementById('certModalDate').value;
    const cfVal = document.getElementById('certModalCF').value.trim().toUpperCase();
    const cfErrEl = document.getElementById('certModalCFError');
    cfErrEl.style.display = 'none';

    // Valida CF se compilato
    if (cfVal && !/^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/i.test(cfVal)) {
        cfErrEl.style.display = 'block';
        return;
    }

    const users = _getUsersFull();
    let idx = _findUserIdx(users, _certModalEmail, _certModalWhatsapp);

    if (idx === -1) {
        // Crea utente minimo se non esiste
        users.push({
            name: _certModalName2 || '',
            email: _certModalEmail || null,
            whatsapp: _certModalWhatsapp || null,
            createdAt: new Date().toISOString(),
            certificatoMedicoScadenza: val || null,
            certificatoMedicoHistory: [{ scadenza: val || null, aggiornatoIl: new Date().toISOString() }],
            codiceFiscale: cfVal || null
        });
    } else {
        const oldCert = users[idx].certificatoMedicoScadenza || '';
        if (val !== oldCert) {
            users[idx].certificatoMedicoScadenza = val || null;
            if (!users[idx].certificatoMedicoHistory) users[idx].certificatoMedicoHistory = [];
            users[idx].certificatoMedicoHistory.push({ scadenza: val || null, aggiornatoIl: new Date().toISOString() });
        }
        users[idx].codiceFiscale = cfVal || null;
    }
    _saveUsers(users);
    const supaFields = { medical_cert_expiry: val || null };
    if (cfVal || cfVal === '') supaFields.codice_fiscale = cfVal || null;
    _updateSupabaseProfile(_certModalEmail, _certModalWhatsapp, supaFields);

    // Aggiorna sessione se è il cliente loggato
    const session = getCurrentUser();
    if (session && (
        (_certModalEmail    && session.email?.toLowerCase()    === _certModalEmail.toLowerCase()) ||
        (_certModalWhatsapp && normalizePhone(session.whatsapp) === normalizePhone(_certModalWhatsapp))
    )) {
        loginUser({ ...session, certificatoMedicoScadenza: val || null });
    }

    // Aggiorna il badge in-place
    if (_certModalBadgeEl) {
        const today = _localDateStr();
        const stillNoCF = !cfVal;
        if (!val && stillNoCF) {
            _certModalBadgeEl.textContent = '🏥 Imposta Cert. Med + Codice Fiscale';
            _certModalBadgeEl.removeAttribute('style');
        } else if (!val) {
            _certModalBadgeEl.textContent = '🏥 Imposta scadenza Cert. Med';
            _certModalBadgeEl.removeAttribute('style');
        } else if (val < today) {
            const [y, m, d] = val.split('-');
            _certModalBadgeEl.textContent = `🏥 Cert. scaduto il ${d}/${m}/${y}`;
            _certModalBadgeEl.removeAttribute('style');
        } else {
            const [y, m, d] = val.split('-');
            _certModalBadgeEl.textContent = `🏥 Cert. Med valido fino al ${d}/${m}/${y}`;
            _certModalBadgeEl.style.cssText = 'background:#f0fdf4;border-color:#bbf7d0;color:#166534;border-left:3px solid #16a34a';
        }
    }

    closeCertModal();
    showToast('Certificato medico aggiornato.', 'success');
}

let _assicModalEmail    = null;
let _assicModalWhatsapp = null;
let _assicModalName2    = null;
let _assicModalBadgeEl  = null;

function openAssicModal(badgeEl, email, whatsapp, name) {
    _assicModalEmail    = email;
    _assicModalWhatsapp = whatsapp;
    _assicModalName2    = name;
    _assicModalBadgeEl  = badgeEl;

    const users = _getUsersFull();
    const idx   = _findUserIdx(users, email, whatsapp);
    const existing = idx !== -1 ? (users[idx].assicurazioneScadenza || '') : '';

    document.getElementById('assicModalName').textContent = name;
    document.getElementById('assicModalDate').value = existing;
    document.getElementById('assicModalOverlay').style.display = 'block';
    document.getElementById('assicModal').style.display = 'flex';
    setTimeout(() => document.getElementById('assicModalDate').focus(), 50);
}

function closeAssicModal() {
    document.getElementById('assicModalOverlay').style.display = 'none';
    document.getElementById('assicModal').style.display = 'none';
    _assicModalEmail = _assicModalWhatsapp = _assicModalName2 = _assicModalBadgeEl = null;
}

function saveAssicDate() {
    const val = document.getElementById('assicModalDate').value;
    const users = _getUsersFull();
    let idx = _findUserIdx(users, _assicModalEmail, _assicModalWhatsapp);

    if (idx === -1) {
        users.push({
            name: _assicModalName2 || '',
            email: _assicModalEmail || null,
            whatsapp: _assicModalWhatsapp || null,
            createdAt: new Date().toISOString(),
            assicurazioneScadenza: val || null,
            assicurazioneHistory: [{ scadenza: val || null, aggiornatoIl: new Date().toISOString() }]
        });
    } else {
        const oldAssic = users[idx].assicurazioneScadenza || '';
        if (val !== oldAssic) {
            users[idx].assicurazioneScadenza = val || null;
            if (!users[idx].assicurazioneHistory) users[idx].assicurazioneHistory = [];
            users[idx].assicurazioneHistory.push({ scadenza: val || null, aggiornatoIl: new Date().toISOString() });
        }
    }
    _saveUsers(users);
    _updateSupabaseProfile(_assicModalEmail, _assicModalWhatsapp, { insurance_expiry: val || null });

    // Aggiorna sessione se è il cliente loggato
    const session = getCurrentUser();
    if (session && (
        (_assicModalEmail    && session.email?.toLowerCase()    === _assicModalEmail.toLowerCase()) ||
        (_assicModalWhatsapp && normalizePhone(session.whatsapp) === normalizePhone(_assicModalWhatsapp))
    )) {
        loginUser({ ...session, assicurazioneScadenza: val || null });
    }

    // Aggiorna il badge in-place
    if (_assicModalBadgeEl) {
        const today = _localDateStr();
        const t30 = new Date(); t30.setDate(t30.getDate() + 30);
        const today30 = _localDateStr(t30);
        if (!val) {
            _assicModalBadgeEl.textContent = '📋 Imposta scadenza Assicurazione';
            _assicModalBadgeEl.style.cssText = 'background:#fef3c7;border-color:#fde68a;color:#92400e;border-left:3px solid #f59e0b';
        } else if (val < today) {
            const [y, m, d] = val.split('-');
            _assicModalBadgeEl.textContent = `📋 Assic. scaduta il ${d}/${m}/${y}`;
            _assicModalBadgeEl.removeAttribute('style');
        } else if (val <= today30) {
            const [y, m, d] = val.split('-');
            _assicModalBadgeEl.textContent = `⏳ Assic. scade il ${d}/${m}/${y}`;
            _assicModalBadgeEl.style.cssText = 'background:#fffbeb;border-color:#fde68a;color:#92400e;border-left:3px solid #f59e0b';
        } else {
            const [y, m, d] = val.split('-');
            _assicModalBadgeEl.textContent = `📋 Assic. valida fino al ${d}/${m}/${y}`;
            _assicModalBadgeEl.style.cssText = 'background:#f0fdf4;border-color:#bbf7d0;color:#166534;border-left:3px solid #16a34a';
        }
    }

    closeAssicModal();
    showToast('Assicurazione aggiornata.', 'success');
}

function renderOccupancyDetail(panel) {
    const allBookings = BookingStorage.getAllBookings().filter(b => b.status !== 'cancelled');
    const { from, to } = getFilterDateRange(currentFilter);
    const now   = new Date();
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const MONTHS = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
    const DAY_NAMES = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];

    // ── Calcola capacità e prenotazioni per tipo per ogni mese (ultimi 12) ────
    const trendLabels = [], ptTrend = [], sgTrend = [];
    for (let i = 11; i >= 0; i--) {
        const mFrom = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const mTo   = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
        trendLabels.push(MONTHS[mFrom.getMonth()]);
        let ptCap = 0, sgCap = 0;
        const c = new Date(mFrom);
        while (c <= mTo) {
            (WEEKLY_SCHEDULE_TEMPLATE[DAY_NAMES[c.getDay()]] || []).forEach(s => {
                if (s.type === 'personal-training') ptCap += SLOT_MAX_CAPACITY['personal-training'] || 0;
                else if (s.type === 'small-group')  sgCap += SLOT_MAX_CAPACITY['small-group'] || 0;
            });
            c.setDate(c.getDate() + 1);
        }
        const ptB = allBookings.filter(b => { const d = new Date(b.date+'T00:00:00'); return b.slotType==='personal-training' && d>=mFrom && d<=mTo; }).length;
        const sgB = allBookings.filter(b => { const d = new Date(b.date+'T00:00:00'); return b.slotType==='small-group'        && d>=mFrom && d<=mTo; }).length;
        ptTrend.push(ptCap > 0 ? Math.round(ptB / ptCap * 100) : 0);
        sgTrend.push(sgCap > 0 ? Math.round(sgB / sgCap * 100) : 0);
    }

    // ── Calcola capacità e prenotazioni per tipo nel periodo filtro ──────────
    let ptSlots = 0, sgSlots = 0;
    const c2 = new Date(from); c2.setHours(0,0,0,0);
    const e2 = new Date(to);   e2.setHours(23,59,59,999);
    while (c2 <= e2) {
        (WEEKLY_SCHEDULE_TEMPLATE[DAY_NAMES[c2.getDay()]] || []).forEach(s => {
            if (s.type === 'personal-training') ptSlots += SLOT_MAX_CAPACITY['personal-training'] || 0;
            else if (s.type === 'small-group')  sgSlots += SLOT_MAX_CAPACITY['small-group'] || 0;
        });
        c2.setDate(c2.getDate() + 1);
    }
    const periodBookings = allBookings.filter(b => { const d = new Date(b.date+'T00:00:00'); return d >= from && d <= to; });
    const ptB = periodBookings.filter(b => b.slotType === 'personal-training').length;
    const sgB = periodBookings.filter(b => b.slotType === 'small-group').length;
    const ptRate = ptSlots > 0 ? Math.round(ptB / ptSlots * 100) : 0;
    const sgRate = sgSlots > 0 ? Math.round(sgB / sgSlots * 100) : 0;
    const totSlots = ptSlots + sgSlots;
    const totRate  = totSlots > 0 ? Math.round((ptB + sgB) / totSlots * 100) : 0;

    // ── Occupancy per giorno della settimana ─────────────────────────────────
    const DOW_ORDER = [1,2,3,4,5,6,0];
    const DOW_NAMES = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];
    const dowLabels = DOW_ORDER.map(d => DOW_NAMES[d]);
    // Conta occorrenze reali di ogni giorno della settimana nel periodo
    const dowOccurrences = [0,0,0,0,0,0,0];
    const tmp = new Date(from); tmp.setHours(0,0,0,0);
    while (tmp <= e2) { dowOccurrences[tmp.getDay()]++; tmp.setDate(tmp.getDate()+1); }
    const CAP_TYPES = Object.keys(SLOT_MAX_CAPACITY).filter(t => SLOT_MAX_CAPACITY[t] > 0);
    const dowRates = DOW_ORDER.map(dow => {
        const dayName  = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'][dow];
        const daySlots = WEEKLY_SCHEDULE_TEMPLATE[dayName] || [];
        const capPerDay = daySlots.reduce((s, sl) => s + (SLOT_MAX_CAPACITY[sl.type] || 0), 0);
        const cap = capPerDay * dowOccurrences[dow];
        const bk  = periodBookings.filter(b =>
            new Date(b.date+'T00:00:00').getDay() === dow && CAP_TYPES.includes(b.slotType)
        ).length;
        return cap > 0 ? Math.min(100, Math.round(bk / cap * 100)) : 0;
    });

    panel.innerHTML = `
        <div class="stat-detail-header">
            <h3>📊 Occupazione — Dettaglio</h3>
            <span class="stat-detail-period">${getFilterLabel(currentFilter)}</span>
        </div>
        <div class="stat-detail-kpis">
            <div class="stat-detail-kpi">
                <div class="stat-detail-kpi-value">${totRate}%</div>
                <div class="stat-detail-kpi-label">Totale</div>
            </div>
            <div class="stat-detail-kpi stat-detail-kpi--future">
                <div class="stat-detail-kpi-value">${ptRate}%</div>
                <div class="stat-detail-kpi-label">Autonomia</div>
            </div>
            <div class="stat-detail-kpi stat-detail-kpi--projected">
                <div class="stat-detail-kpi-value">${sgRate}%</div>
                <div class="stat-detail-kpi-label">Lez. Gruppo</div>
            </div>
            <div class="stat-detail-kpi">
                <div class="stat-detail-kpi-value">${ptB + sgB}</div>
                <div class="stat-detail-kpi-label">Prenotazioni</div>
            </div>
        </div>

        <div class="stat-detail-charts">
            <div class="stat-detail-chart-block">
                <h4>Autonomia — ultimi 12 mesi</h4>
                <canvas id="occPtChart" style="width:100%;display:block;"></canvas>
            </div>
            <div class="stat-detail-chart-block">
                <h4>Lezioni di Gruppo — ultimi 12 mesi</h4>
                <canvas id="occSgChart" style="width:100%;display:block;"></canvas>
            </div>
        </div>

        <div class="stat-detail-charts">
            <div class="stat-detail-chart-block" style="grid-column:1/-1">
                <h4>Occupazione per giorno della settimana</h4>
                <canvas id="occDowChart" style="width:100%;display:block;"></canvas>
            </div>
        </div>
    `;

    requestAnimationFrame(() => {
        const ptCanvas = document.getElementById('occPtChart');
        if (ptCanvas) new SimpleChart(ptCanvas).drawBarChart(
            { labels: trendLabels, values: ptTrend, highlight: trendLabels.map((_, i) => i === 11) },
            { colors: ['#3b82f6'], prefix: '', suffix: '%' }
        );
        const sgCanvas = document.getElementById('occSgChart');
        if (sgCanvas) new SimpleChart(sgCanvas).drawBarChart(
            { labels: trendLabels, values: sgTrend, highlight: trendLabels.map((_, i) => i === 11) },
            { colors: ['#22c55e'], prefix: '', suffix: '%' }
        );
        const dowCanvas = document.getElementById('occDowChart');
        if (dowCanvas) new SimpleChart(dowCanvas).drawBarChart(
            { labels: dowLabels, values: dowRates },
            { colors: ['#f59e0b'], prefix: '', suffix: '%' }
        );
    });
}

// ── End Statistics Detail Panel ───────────────────────────────────────────────

// ── Weekly Card-Payment Report ───────────────────────────────────────────────

// Returns {from: Date, to: Date, label: string} for the previous Monday–Sunday week
function _getPreviousWeekRange() {
    const now = new Date();
    // JavaScript: 0=Sun, 1=Mon, …, 6=Sat
    const day = now.getDay();
    // Days since last Monday (if today is Monday day=1 → 7 days back to previous Mon)
    const daysSinceMonday = day === 0 ? 6 : day - 1;
    const thisMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday);
    const prevMonday = new Date(thisMonday);
    prevMonday.setDate(prevMonday.getDate() - 7);
    const prevSunday = new Date(prevMonday);
    prevSunday.setDate(prevSunday.getDate() + 6);

    const fmt = d => d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return {
        from: prevMonday,
        to: prevSunday,
        label: `${fmt(prevMonday)} – ${fmt(prevSunday)}`
    };
}

// Key for localStorage to track dismissed banner per week
function _weeklyReportKey() {
    const { from } = _getPreviousWeekRange();
    return `weeklyReportDismissed_${from.toISOString().slice(0, 10)}`;
}

function checkWeeklyReportBanner() {
    const banner = document.getElementById('weeklyReportBanner');
    if (!banner) return;

    const today = new Date().getDay(); // 0=Sun, 1=Mon
    const dismissed = localStorage.getItem(_weeklyReportKey()) === 'true';

    // Show banner on Monday (day=1) if not dismissed for this week
    if (today === 1 && !dismissed) {
        const { label } = _getPreviousWeekRange();
        const periodEl = document.getElementById('weeklyReportPeriod');
        if (periodEl) periodEl.textContent = `Pagamenti carta e bonifico: ${label}`;
        banner.style.display = 'block';
    } else {
        banner.style.display = 'none';
    }
}

function dismissWeeklyReport() {
    localStorage.setItem(_weeklyReportKey(), 'true');
    const banner = document.getElementById('weeklyReportBanner');
    if (banner) banner.style.display = 'none';
}

async function downloadWeeklyReport() {
    const { from, to, label } = _getPreviousWeekRange();
    const fromStr = from.toISOString().slice(0, 10);
    const toStr   = to.toISOString().slice(0, 10);

    // Show loading
    const btn = document.querySelector('.weekly-report-banner-btn');
    const origLabel = btn?.innerHTML;
    if (btn) { btn.innerHTML = '⏳ Generazione...'; btn.disabled = true; }

    try {
        // Fetch bookings paid with carta or bonifico in the date range
        const REPORT_METHODS = new Set(['carta', 'iban']);
        const METHOD_LABEL_REPORT = { carta: 'Carta', iban: 'Bonifico' };
        const allBookings = await BookingStorage.fetchForAdmin(fromStr, toStr);
        const cardBookings = allBookings.filter(b =>
            b.paid && REPORT_METHODS.has(b.paymentMethod) && b.status !== 'cancelled'
        );

        // Also check manual debts paid with carta/iban in this period
        const allDebts = ManualDebtStorage._getAll();
        const manualCardPayments = [];
        Object.values(allDebts).forEach(d => {
            (d.history || []).filter(h => {
                if (h.amount >= 0) return false; // only payments (negative = paid)
                if (!REPORT_METHODS.has(h.method || '')) return false;
                const hDate = h.date ? h.date.slice(0, 10) : '';
                return hDate >= fromStr && hDate <= toStr;
            }).forEach(h => {
                manualCardPayments.push({
                    name: d.name,
                    email: d.email,
                    date: h.date,
                    type: 'Saldo debito manuale',
                    amount: Math.abs(h.amount),
                    method: h.method,
                    note: h.note || ''
                });
            });
        });

        // Build user map for codice_fiscale lookup
        const allUsers = UserStorage.getAll();
        const userMap = {};
        allUsers.forEach(u => {
            if (u.email) userMap[u.email.toLowerCase()] = u;
        });

        const SLOT_LABEL = {
            'personal-training': 'Personal Training',
            'small-group':       'Small Group',
            'group-class':       'Lezione di Gruppo'
        };

        function splitName(fullName) {
            if (!fullName) return { nome: '', cognome: '' };
            const parts = (fullName || '').trim().split(/\s+/);
            if (parts.length <= 1) return { nome: parts[0] || '', cognome: '' };
            return { nome: parts[0], cognome: parts.slice(1).join(' ') };
        }

        function fmtDateTime(iso) {
            if (!iso) return '';
            const d = new Date(iso);
            return isNaN(d) ? iso : d.toLocaleString('it-IT');
        }

        // Build rows
        const rows = [];

        cardBookings.forEach(b => {
            const user = userMap[(b.email || '').toLowerCase()];
            const { nome, cognome } = splitName(b.name);
            rows.push({
                nome,
                cognome,
                cf: user?.codiceFiscale || '',
                data: fmtDateTime(b.paidAt || b.date + 'T12:00:00'),
                sortKey: b.paidAt || b.date,
                tipo: SLOT_LABEL[b.slotType] || b.slotType || '',
                metodo: METHOD_LABEL_REPORT[b.paymentMethod] || b.paymentMethod,
                importo: SLOT_PRICES[b.slotType] || 0
            });
        });

        manualCardPayments.forEach(p => {
            const user = userMap[(p.email || '').toLowerCase()];
            const { nome, cognome } = splitName(p.name);
            rows.push({
                nome,
                cognome,
                cf: user?.codiceFiscale || '',
                data: fmtDateTime(p.date),
                sortKey: p.date || '',
                tipo: p.type,
                metodo: METHOD_LABEL_REPORT[p.method] || p.method,
                importo: p.amount
            });
        });

        // Sort by date ascending
        rows.sort((a, b) => (a.sortKey || '').localeCompare(b.sortKey || ''));

        // Build XLSX
        const sheetData = [
            ['Nome', 'Cognome', 'Codice Fiscale', 'Data e Ora Pagamento', 'Tipo di Pagamento', 'Metodo Pagamento', 'Importo (€)'],
            ...rows.map(r => [r.nome, r.cognome, r.cf, r.data, r.tipo, r.metodo, r.importo])
        ];

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(sheetData);
        ws['!cols'] = [
            { wch: 18 }, { wch: 20 }, { wch: 20 }, { wch: 22 }, { wch: 22 }, { wch: 18 }, { wch: 12 }
        ];
        XLSX.utils.book_append_sheet(wb, ws, 'Pagamenti Carta e Bonifico');

        const fromFmt = fromStr.split('-').reverse().join('-');
        const toFmt   = toStr.split('-').reverse().join('-');
        XLSX.writeFile(wb, `TB_Report_Carta_Bonifico_${fromFmt}_${toFmt}.xlsx`);

        // Dismiss the banner after successful download
        dismissWeeklyReport();

        if (typeof showToast === 'function') {
            showToast(`Report scaricato: ${rows.length} pagamenti carta/bonifico`, 'success');
        }
    } catch (err) {
        console.error('[WeeklyReport] Error:', err);
        if (typeof showToast === 'function') {
            showToast('Errore durante la generazione del report', 'error');
        }
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = origLabel || '📥 Scarica report'; }
    }
}

// ── End Weekly Report ────────────────────────────────────────────────────────

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAdmin);
} else {
    initAdmin();
}

// Aggiorna i dati quando la pagina viene ripristinata dal bfcache (back/forward)
window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    const activeTab = document.querySelector('.admin-tab.active');
    if (activeTab) switchTab(activeTab.dataset.tab);
    _applyPrivacyMask();
});
