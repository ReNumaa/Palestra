// Auth - simulated session via localStorage

// ── Phone normalization ───────────────────────────────────────────────────
// Returns E.164 format (+39XXXXXXXXXX) for future WhatsApp API compatibility.
// Strips spaces/dashes, handles 0039 / 39 / 0 prefixes, defaults to +39.
function normalizePhone(raw) {
    if (!raw) return '';
    let n = raw.replace(/[\s\-().]/g, '');
    if      (n.startsWith('0039'))                 n = '+39' + n.slice(4);
    else if (n.startsWith('39') && n[0] !== '+')   n = '+' + n;
    else if (n.startsWith('0'))                    n = '+39' + n.slice(1);
    else if (!n.startsWith('+'))                   n = '+39' + n;
    return n;
}

// ── User storage helpers ──────────────────────────────────────────────────
const USERS_KEY = 'gym_users';

function _getAllUsers() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY) || '[]'); } catch { return []; }
}

function _saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function getUserByEmail(email) {
    return _getAllUsers().find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
}

// Update user profile — returns { ok: true } or { ok: false, error: string }
function updateUserProfile(currentEmail, updates, newPassword) {
    const users = _getAllUsers();
    const idx = users.findIndex(u => u.email.toLowerCase() === currentEmail.toLowerCase());
    if (idx === -1) return { ok: false, error: 'Utente non trovato.' };

    const user     = users[idx];
    const newEmail = (updates.email || currentEmail).toLowerCase();

    // Controlla unicità email
    if (newEmail !== currentEmail.toLowerCase()) {
        const taken = users.some((u, i) => i !== idx && u.email.toLowerCase() === newEmail);
        if (taken) return { ok: false, error: 'Email già in uso da un altro account.' };
    }

    if (updates.name     !== undefined) user.name     = updates.name;
    if (updates.email    !== undefined) user.email    = newEmail;
    if (updates.whatsapp !== undefined) user.whatsapp = updates.whatsapp;

    // Certificato medico: aggiorna scadenza e mantieni storico completo
    if (updates.certificatoMedicoScadenza !== undefined) {
        const newScad = updates.certificatoMedicoScadenza || null;
        if (newScad !== (user.certificatoMedicoScadenza || null)) {
            user.certificatoMedicoScadenza = newScad;
            if (!user.certificatoMedicoHistory) user.certificatoMedicoHistory = [];
            user.certificatoMedicoHistory.push({
                scadenza: newScad,
                aggiornatoIl: new Date().toISOString()
            });
        }
    }

    if (newPassword) user.passwordHash = _hashPassword(newPassword);

    _saveUsers(users);

    // Se l'email è cambiata, aggiorna tutte le prenotazioni collegate
    if (newEmail !== currentEmail.toLowerCase()) {
        try {
            const bookings = JSON.parse(localStorage.getItem('gym_bookings') || '[]');
            bookings.forEach(b => {
                if (b.email && b.email.toLowerCase() === currentEmail.toLowerCase()) b.email = newEmail;
            });
            localStorage.setItem('gym_bookings', JSON.stringify(bookings));
        } catch {}
    }

    // Aggiorna la sessione corrente
    const current = getCurrentUser();
    if (current) {
        loginUser({ ...current, name: user.name, email: user.email, whatsapp: user.whatsapp });
    }

    return { ok: true };
}

// Synchronous password hash — works on all platforms without crypto.subtle
function _hashPassword(password) {
    const str = password + '|gym-tb|' + password.length;
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
        h = (Math.imul(h, 33) ^ str.charCodeAt(i)) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
}

// Register a new user — returns { ok: true } or { ok: false, error: string }
function registerUser(name, email, whatsapp, password) {
    if (getUserByEmail(email)) return { ok: false, error: 'Email già registrata.' };
    const passwordHash = _hashPassword(password);
    const users = _getAllUsers();
    users.push({ name, email, whatsapp, passwordHash, createdAt: new Date().toISOString() });
    _saveUsers(users);
    loginUser({ name, email, whatsapp });
    return { ok: true };
}

// Login with email + password — returns { ok: true } or { ok: false, error: string }
function loginWithPassword(email, password) {
    const user = getUserByEmail(email);
    if (!user) return { ok: false, error: 'Email non trovata.' };
    const hash = _hashPassword(password);
    if (hash !== user.passwordHash) return { ok: false, error: 'Password errata.' };
    loginUser({ name: user.name, email: user.email, whatsapp: user.whatsapp });
    return { ok: true };
}

// ── Session helpers ───────────────────────────────────────────────────────
function getCurrentUser() {
    try { return JSON.parse(localStorage.getItem('currentUser')); } catch { return null; }
}

function loginUser(user) {
    localStorage.setItem('currentUser', JSON.stringify(user));
}

function logoutUser() {
    localStorage.removeItem('currentUser');
}

function updateNavAuth() {
    const user    = getCurrentUser();
    const isAdmin = localStorage.getItem('adminAuthenticated') === 'true';
    const loginLink = document.getElementById('navLoginLink');
    const userMenu  = document.getElementById('navUserMenu');
    const userName  = document.getElementById('navUserName');

    _removeDynamicNavLinks();

    if (user) {
        if (loginLink) loginLink.style.display = 'none';
        if (userMenu)  userMenu.style.display  = 'flex';
        if (userName)  userName.textContent    = user.name.split(' ')[0];
        _injectNavLinkFirst('prenotazioni.html', 'Le mie prenotazioni', 'nav-prenotazioni-link');
        _injectSidebarLogout();
    } else if (isAdmin) {
        if (loginLink) loginLink.style.display = 'none';
        if (userMenu)  userMenu.style.display  = 'flex';
        if (userName)  userName.textContent    = 'Thomas';
        _injectSidebarLogout();
    } else {
        if (loginLink) loginLink.style.display = 'flex';
        if (userMenu)  userMenu.style.display  = 'none';
    }
}

function _injectNavLinkFirst(href, label, cssClass) {
    ['.nav-desktop-links', '.nav-sidebar-links'].forEach(sel => {
        const nav = document.querySelector(sel);
        if (!nav || nav.querySelector('.' + cssClass)) return;
        const li = document.createElement('li');
        li.innerHTML = `<a href="${href}" class="${cssClass}">${label}</a>`;
        nav.prepend(li);
    });
}

function _injectNavLinkLast(href, label, cssClass) {
    ['.nav-desktop-links', '.nav-sidebar-links'].forEach(sel => {
        const nav = document.querySelector(sel);
        if (!nav || nav.querySelector('.' + cssClass)) return;
        const li = document.createElement('li');
        li.innerHTML = `<a href="${href}" class="${cssClass}">${label}</a>`;
        nav.append(li);
    });
}

function _removeDynamicNavLinks() {
    document.querySelectorAll('.nav-prenotazioni-link, .nav-admin-link').forEach(el => el.closest('li')?.remove());
    document.querySelectorAll('.nav-sidebar-logout-item').forEach(el => el.remove());
}

function _injectSidebarLogout() {
    const sidebar = document.querySelector('.nav-sidebar-links');
    if (!sidebar || sidebar.querySelector('.nav-sidebar-logout')) return;
    const li = document.createElement('li');
    li.className = 'nav-sidebar-logout-item';
    const btn = document.createElement('button');
    btn.className = 'nav-sidebar-logout';
    btn.textContent = 'Esci';
    btn.addEventListener('click', () => {
        logoutUser();
        localStorage.removeItem('adminAuthenticated');
        sessionStorage.removeItem('adminAuth');
        window.location.href = 'index.html';
    });
    li.appendChild(btn);
    sidebar.append(li);
}

function _injectPrenotazioniLink() {
    _injectNavLinkFirst('prenotazioni.html', 'Le mie prenotazioni', 'nav-prenotazioni-link');
}

function _removePrenotazioniLink() {
    _removeDynamicNavLinks();
}

function getUserBookings() {
    const user = getCurrentUser();
    if (!user) return { upcoming: [], past: [] };

    const allBookings = JSON.parse(localStorage.getItem('gym_bookings') || '[]');
    const now   = new Date();
    const today = now.toISOString().split('T')[0];

    const myPhone = user.whatsapp ? normalizePhone(user.whatsapp) : '';
    const mine = allBookings.filter(b => {
        if (b.id && b.id.startsWith('demo-')) return false;
        const emailMatch = user.email && b.email &&
            b.email.toLowerCase() === user.email.toLowerCase();
        const phoneMatch = myPhone && b.whatsapp &&
            normalizePhone(b.whatsapp) === myPhone;
        return emailMatch || phoneMatch;
    });

    function isBookingPast(b) {
        if (b.date < today) return true;
        if (b.date > today) return false;
        // Stesso giorno: controlla l'orario di fine
        const endTimeStr = b.time ? b.time.split(' - ')[1]?.trim() : null;
        if (!endTimeStr) return false;
        const [h, m] = endTimeStr.split(':').map(Number);
        const endDt = new Date(`${b.date}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`);
        return endDt <= now;
    }

    return {
        upcoming: mine.filter(b => !isBookingPast(b)).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)),
        past:     mine.filter(b =>  isBookingPast(b)).sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time))
    };
}

// ── Profile modal (kept for backward compat on pages that still have it) ──
function openProfileModal() {
    const user = getCurrentUser();
    if (!user) return;
    const modal = document.getElementById('profileModal');
    if (!modal) return;
    document.getElementById('profileUserName').textContent = user.name;
    renderProfileTab('upcoming');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeProfileModal() {
    const modal = document.getElementById('profileModal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
}

function renderProfileTab(tab) {
    const { upcoming, past } = getUserBookings();
    const list = tab === 'upcoming' ? upcoming : past;

    document.querySelectorAll('.profile-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));

    const container = document.getElementById('profileBookingsList');
    if (!container) return;
    if (!list.length) {
        container.innerHTML = `<p class="profile-empty">${tab === 'upcoming' ? 'Nessuna prenotazione futura.' : 'Nessuna prenotazione passata.'}</p>`;
        return;
    }

    container.innerHTML = list.map(b => `
        <div class="profile-booking-card ${b.slotType}">
            <div class="profile-booking-date">📅 ${b.dateDisplay || b.date}</div>
            <div class="profile-booking-time">🕐 ${b.time}</div>
            <div class="profile-booking-type">${(window.SLOT_NAMES && window.SLOT_NAMES[b.slotType]) || b.slotType}</div>
        </div>
    `).join('');
}

// ── Hamburger sidebar toggle ──────────────────────────────────────────────
function toggleNavMenu() {
    const sidebar = document.getElementById('navSidebar');
    const overlay = document.getElementById('navSidebarOverlay');
    if (!sidebar) return;
    const isOpen = sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('open', isOpen);
    document.body.classList.toggle('nav-open', isOpen);
}

// ── Init on DOM ready ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    updateNavAuth();

    const hamburger = document.getElementById('navHamburger');
    if (hamburger) hamburger.addEventListener('click', toggleNavMenu);

    const logoutBtn = document.getElementById('navLogoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            logoutUser();
            localStorage.removeItem('adminAuthenticated');
            sessionStorage.removeItem('adminAuth');
            window.location.href = 'index.html';
        });
    }

    // Username click → Le mie prenotazioni (user) or admin page (admin)
    const profileBtn = document.getElementById('navUserName');
    if (profileBtn) {
        profileBtn.style.cursor = 'pointer';
        profileBtn.addEventListener('click', () => {
            const isAdmin = localStorage.getItem('adminAuthenticated') === 'true';
            window.location.href = isAdmin ? 'admin.html' : 'prenotazioni.html';
        });
    }
});
