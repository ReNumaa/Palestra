// Admin dashboard functionality


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
    if (btn) btn.textContent = _sensitiveHidden ? '🙈' : '👁';
}

function toggleSensitiveData() {
    _sensitiveHidden = !_sensitiveHidden;
    localStorage.setItem('adminSensitiveHidden', _sensitiveHidden ? 'true' : 'false');
    _applyPrivacyMask();
}
// ────────────────────────────────────────────────────────────────────────────

let _adminStickyResizeHandler = null;
let _adminScrollHandler = null;
function setupAdminStickyOffsets() {
    const navbar = document.querySelector('.navbar');
    const tabs = document.querySelector('.admin-tabs');
    const controls = document.querySelector('.admin-calendar-controls');
    const daySelector = document.querySelector('.admin-day-selector');
    if (!navbar || !tabs) return;

    const _apply = () => {
        const navH = navbar.offsetHeight - 1;
        tabs.style.top = navH + 'px';
        if (window.innerWidth <= 768) {
            if (controls) controls.style.top = '';
            if (daySelector) daySelector.style.top = '';
        } else {
            const tabsBottom = navH + tabs.offsetHeight;
            if (controls) controls.style.top = tabsBottom + 'px';
            if (daySelector && controls) daySelector.style.top = (tabsBottom + controls.offsetHeight) + 'px';
        }
    };
    _apply();
    if (_adminStickyResizeHandler) window.removeEventListener('resize', _adminStickyResizeHandler);
    _adminStickyResizeHandler = _apply;
    window.addEventListener('resize', _adminStickyResizeHandler);

    // Hide week nav once scrolled past threshold, show only at top
    if (_adminScrollHandler) window.removeEventListener('scroll', _adminScrollHandler);
    _adminScrollHandler = () => {
        if (!controls) return;
        const sy = window.scrollY;
        if (sy > 120 && !controls.classList.contains('scroll-hidden')) {
            controls.classList.add('scroll-hidden');
            if (daySelector && window.innerWidth > 768) {
                const tabsBottom = (navbar.offsetHeight - 1) + tabs.offsetHeight;
                daySelector.style.top = tabsBottom + 'px';
            }
        } else if (sy <= 10 && controls.classList.contains('scroll-hidden')) {
            controls.classList.remove('scroll-hidden');
            _apply();
        }
    };
    window.addEventListener('scroll', _adminScrollHandler, { passive: true });
}

function initAdmin() {
    showDashboard();
    setupAdminStickyOffsets();

    // Close search dropdown when clicking outside
    document.addEventListener('click', (e) => {
        const search = document.querySelector('.payment-search');
        if (search && !search.contains(e.target)) {
            closeSearchDropdown();
        }
    });
}


function showDashboard() {
    document.getElementById('dashboardSection').style.display = 'block';
    setupTabs();
    setupAdminCalendar();
    setupScheduleManager();
    updateNonChartData();
    checkWeeklyReportBanner();
    // Ripristina il tab attivo dal refresh (default: bookings)
    const savedTab = sessionStorage.getItem('adminActiveTab');
    if (savedTab && document.getElementById(`tab-${savedTab}`)) {
        switchTab(savedTab);
    }
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
    // Persisti il tab attivo per il refresh
    try { sessionStorage.setItem('adminActiveTab', tabName); } catch {}

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

    // Scroll to top per tutti i tab tranne Prenotazioni (che ha l'auto-scroll allo slot corrente)
    if (tabName !== 'bookings') {
        window.scrollTo({ top: 0 });
    }

    // Carica i dati del tab in modo asincrono: il browser renderizza prima il tab
    // (mostra il contenuto/spinner) e poi esegue il lavoro pesante senza congelare la UI.
    const loader = {
        analytics: () => requestAnimationFrame(() => requestAnimationFrame(() => loadDashboardData())),
        bookings:  () => { renderAdminCalendar(); _adminScrollIfFirstOpen(); },
        payments:  () => renderPaymentsTab(),
        clients:   () => renderClientsTab(),
        schedule:  () => renderScheduleManager(),
        settings:  () => renderSettingsTab(),
        registro:  () => renderRegistroTab(),
        messaggi:  () => renderMessaggiTab(),
        schede:    () => renderSchedeTab(),
    }[tabName];
    if (loader) setTimeout(loader, 0);
}

function hideDashboard() {
    document.getElementById('dashboardSection').style.display = 'none';
}

