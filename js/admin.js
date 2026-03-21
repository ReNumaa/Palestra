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

    // Load specific data based on tab
    if (tabName === 'analytics') {
        // Aspetta il layout del browser (canvas necessita offsetWidth > 0)
        requestAnimationFrame(() => requestAnimationFrame(() => loadDashboardData()));
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
    } else if (tabName === 'messaggi') {
        renderMessaggiTab();
    }
}

function hideDashboard() {
    document.getElementById('dashboardSection').style.display = 'none';
}


// Aggiorna i dati quando la pagina viene ripristinata dal bfcache (back/forward)
window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    const activeTab = document.querySelector('.admin-tab.active');
    if (activeTab) switchTab(activeTab.dataset.tab);
    _applyPrivacyMask();
});
