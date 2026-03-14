// Auth — Supabase Auth
// Sostituisce il vecchio sistema localStorage.
// Mantiene le stesse firme di funzione per compatibilità con il resto dell'app.

// Utente corrente in memoria — popolato da initAuth() all'avvio di ogni pagina
window._currentUser = null;

// ── Phone normalization ───────────────────────────────────────────────────────
// Returns E.164 format (+39XXXXXXXXXX) for WhatsApp API compatibility.
function normalizePhone(raw) {
    if (!raw) return '';
    let n = raw.replace(/[\s\-().]/g, '');
    if      (n.startsWith('0039'))               n = '+39' + n.slice(4);
    else if (n.startsWith('39') && n[0] !== '+') n = '+' + n;
    else if (n.startsWith('0'))                  n = '+39' + n.slice(1);
    else if (!n.startsWith('+'))                 n = '+39' + n;
    return n;
}

// ── Error message mapping ─────────────────────────────────────────────────────
function _authError(error) {
    const msg = error?.message || '';
    if (msg.includes('already registered') || msg.includes('already been registered'))
        return 'Email già registrata.';
    if (msg.includes('Invalid login credentials') || msg.includes('invalid_credentials'))
        return 'Email o password errata.';
    if (msg.includes('Email not confirmed'))
        return 'Controlla la tua email per confermare la registrazione.';
    if (msg.includes('Password should be at least'))
        return 'La password deve essere di almeno 6 caratteri.';
    if (msg.includes('User not found'))
        return 'Email non trovata.';
    return msg || 'Errore sconosciuto. Riprova.';
}

// ── Load profile from Supabase ────────────────────────────────────────────────
// Returns true on success, false on error (does NOT null out _currentUser on error
// to prevent false logouts on transient network failures in PWA).
async function _loadProfile(userId) {
    const { data: profile, error } = await supabaseClient
        .from('profiles')
        .select('id, name, email, whatsapp, medical_cert_expiry, medical_cert_history, insurance_expiry, insurance_history, codice_fiscale, created_at')
        .eq('id', userId)
        .single();

    if (profile && !error) {
        window._currentUser = profile;
        // Auto-fix: capitalizza nomi esistenti con lettere minuscole (es. utenti Gmail)
        if (profile.name) {
            const capitalized = profile.name.trim().replace(/\S+/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
            if (capitalized !== profile.name) {
                supabaseClient.from('profiles').update({ name: capitalized }).eq('id', userId)
                    .then(() => { window._currentUser.name = capitalized; });
            }
        }
        return true;
    }
    if (error) console.error('[Auth] _loadProfile error:', error.message);
    return false;
}

// ── Init: recupera la sessione e carica il profilo ────────────────────────────
// Chiamata su ogni pagina prima di qualsiasi operazione auth.
// Ritorna la sessione Supabase (o null).
// Usa INITIAL_SESSION invece di getSession() per evitare la race condition
// in PWA: getSession() può tornare null mentre il refresh del token è in corso,
// INITIAL_SESSION si risolve solo dopo che il refresh è completato.
let _authListenerActive = false;
async function initAuth() {
    const session = await new Promise((resolve) => {
        let resolved = false;
        const { data: { subscription } } = supabaseClient.auth.onAuthStateChange((event, session) => {
            if (event === 'INITIAL_SESSION' && !resolved) {
                resolved = true;
                subscription.unsubscribe();
                resolve(session);
            }
        });
        // Fallback: se INITIAL_SESSION non arriva entro 6s, usa getSession()
        // (su cold start mobile con token scaduto il refresh può impiegare più tempo)
        setTimeout(async () => {
            if (!resolved) {
                resolved = true;
                subscription.unsubscribe();
                const { data } = await supabaseClient.auth.getSession();
                if (data.session) { resolve(data.session); return; }
                // Ultimo tentativo: forza refresh del token se c'è una sessione scaduta in storage
                try {
                    const { data: refreshed, error } = await supabaseClient.auth.refreshSession();
                    resolve(error ? null : refreshed.session);
                } catch { resolve(null); }
            }
        }, 6000);
    });

    if (session) {
        const ok = await _loadProfile(session.user.id);
        if (!ok && !window._currentUser) {
            // Fallback minimo: non redirigere a login su errori di rete transitori
            window._currentUser = {
                id:      session.user.id,
                email:   session.user.email || session.user.user_metadata?.email || '',
                name:    session.user.user_metadata?.full_name || session.user.email || '',
                whatsapp: session.user.user_metadata?.whatsapp || ''
            };
        }
        // Propaga il claim admin al sessionStorage così updateNavAuth() può mostrare il link
        if (session.user.app_metadata?.role === 'admin') {
            sessionStorage.setItem('adminAuth', 'true');
        } else {
            // Utente loggato ma non admin: pulisce eventuali flag legacy
            sessionStorage.removeItem('adminAuth');
        }
    } else {
        window._currentUser = null;
        sessionStorage.removeItem('adminAuth');
    }
    // Rimuovi sempre il vecchio flag localStorage (era persistente a vita, causa di falsi positivi)
    localStorage.removeItem('adminAuthenticated');

    // Registra il listener persistente una sola volta (evita duplicati su bfcache restore)
    if (!_authListenerActive) {
        _authListenerActive = true;
        supabaseClient.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                if (session) {
                    await _loadProfile(session.user.id);
                    if (session.user.app_metadata?.role === 'admin') {
                        sessionStorage.setItem('adminAuth', 'true');
                    }
                }
            } else if (event === 'SIGNED_OUT') {
                window._currentUser = null;
                sessionStorage.removeItem('adminAuth');
            }
            updateNavAuth();
        });
    }

    // Quando l'app PWA torna in foreground dopo un periodo in background,
    // ri-valida la sessione (il token potrebbe essere scaduto e serve un refresh).
    if (!window._visibilityAuthActive) {
        window._visibilityAuthActive = true;
        document.addEventListener('visibilitychange', async () => {
            if (document.hidden) return;
            // Attendi che il lock Supabase si liberi prima di tentare getSession
            await new Promise(r => setTimeout(r, 1000));
            try {
                const { data, error } = await supabaseClient.auth.getSession();
                if (error) throw error;
                if (data.session) {
                    await _loadProfile(data.session.user.id);
                } else {
                    const { data: refreshed } = await supabaseClient.auth.refreshSession();
                    if (refreshed.session) {
                        await _loadProfile(refreshed.session.user.id);
                    }
                }
            } catch (e) {
                // Lock rotto o errore di rete — riprova con refreshSession
                console.warn('[Auth] visibilitychange recovery:', e.message);
                try {
                    const { data: refreshed } = await supabaseClient.auth.refreshSession();
                    if (refreshed.session) await _loadProfile(refreshed.session.user.id);
                } catch { /* rete assente */ }
            }
            updateNavAuth();
        });
    }

    updateNavAuth();
    return session;
}

// ── Session accessors (sync — usa il valore cached da initAuth) ───────────────
function getCurrentUser() {
    return window._currentUser;
}

// ── Register ──────────────────────────────────────────────────────────────────
// Il profilo viene creato automaticamente dal trigger handle_new_user su auth.users.
// Passiamo nome e whatsapp come user_metadata così il trigger li riceve.
async function registerUser(name, email, whatsapp, password, codiceFiscale) {
    // Controlla se il numero WhatsApp è già usato da un altro utente
    if (whatsapp) {
        const { data: taken } = await supabaseClient.rpc('is_whatsapp_taken', { phone: whatsapp });
        if (taken) return { ok: false, error: 'Questo numero WhatsApp è già associato a un altro account.' };
    }

    const capitalized = (name || '').trim().replace(/\S+/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
    const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: { data: { full_name: capitalized, whatsapp, codice_fiscale: (codiceFiscale || '').toUpperCase() || null } }
    });
    if (error) return { ok: false, error: _authError(error) };
    if (!data.user?.id) return { ok: false, error: 'Errore durante la registrazione.' };

    // Il trigger handle_new_user crea il profilo lato server in modo sincrono.
    // onAuthStateChange (SIGNED_IN) caricherà il profilo non appena la sessione è pronta.
    return { ok: true };
}

// ── Login con email + password ────────────────────────────────────────────────
async function loginWithPassword(email, password) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: _authError(error) };
    await _loadProfile(data.user.id);
    return { ok: true };
}

// ── Logout ────────────────────────────────────────────────────────────────────
async function logoutUser() {
    // Pulisce stato locale PRIMA di attendere Supabase — così l'UX non si blocca
    // se il token è scaduto o la rete è lenta
    window._currentUser = null;
    localStorage.removeItem('adminAuthenticated');
    sessionStorage.removeItem('adminAuth');
    localStorage.removeItem('gym_bookings');
    localStorage.removeItem('gym_credits');
    localStorage.removeItem('gym_manual_debts');
    localStorage.removeItem('gym_bonus');
    localStorage.removeItem('gym_registered_users');
    // signOut con timeout: se Supabase non risponde entro 3s, procedi comunque
    try {
        await Promise.race([
            supabaseClient.auth.signOut({ scope: 'local' }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
        ]);
    } catch { /* sessione locale già pulita, il token scadrà da solo */ }
}

// ── Aggiorna profilo ──────────────────────────────────────────────────────────
// updates: { name?, email?, whatsapp?, certificatoMedicoScadenza?, assicurazioneScadenza? }
// newPassword: stringa opzionale
async function updateUserProfile(currentEmail, updates, newPassword) {
    const user = getCurrentUser();
    if (!user) return { ok: false, error: 'Non autenticato.' };

    const profileUpdate = {};
    let emailPendingConfirmation = false;

    if (updates.name     !== undefined) profileUpdate.name     = (updates.name || '').trim().replace(/\S+/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
    if (updates.whatsapp !== undefined) {
        profileUpdate.whatsapp = updates.whatsapp;
        // Controlla che il numero non sia già usato da un altro utente
        if (updates.whatsapp && updates.whatsapp !== (user.whatsapp || '')) {
            const { data: taken } = await supabaseClient.rpc('is_whatsapp_taken', { phone: updates.whatsapp, exclude_user_id: user.id });
            if (taken) return { ok: false, error: 'Questo numero WhatsApp è già associato a un altro account.' };
        }
    }
    // Email: aggiorna nel profilo SOLO se non è cambiata (altrimenti aspettiamo la conferma)
    if (updates.email !== undefined && updates.email.toLowerCase() === currentEmail.toLowerCase()) {
        profileUpdate.email = updates.email.toLowerCase();
    }

    // Codice fiscale
    if (updates.codiceFiscale !== undefined) {
        profileUpdate.codice_fiscale = (updates.codiceFiscale || '').toUpperCase() || null;
    }

    // Certificato medico: aggiorna scadenza e mantieni storico
    if (updates.certificatoMedicoScadenza !== undefined) {
        const newScad = updates.certificatoMedicoScadenza || null;
        if (newScad !== (user.medical_cert_expiry || null)) {
            profileUpdate.medical_cert_expiry = newScad;
            const history = Array.isArray(user.medical_cert_history) ? [...user.medical_cert_history] : [];
            history.push({ scadenza: newScad, aggiornatoIl: new Date().toISOString() });
            profileUpdate.medical_cert_history = history;
        }
    }

    // Assicurazione: aggiorna scadenza e mantieni storico
    if (updates.assicurazioneScadenza !== undefined) {
        const newScad = updates.assicurazioneScadenza || null;
        if (newScad !== (user.insurance_expiry || null)) {
            profileUpdate.insurance_expiry = newScad;
            const history = Array.isArray(user.insurance_history) ? [...user.insurance_history] : [];
            history.push({ scadenza: newScad, aggiornatoIl: new Date().toISOString() });
            profileUpdate.insurance_history = history;
        }
    }

    // Aggiorna profilo su Supabase
    if (Object.keys(profileUpdate).length > 0) {
        const { error } = await supabaseClient
            .from('profiles')
            .update(profileUpdate)
            .eq('id', user.id);
        if (error) return { ok: false, error: error.message };
    }

    // Cambio email su Supabase Auth (richiede conferma via email — NON aggiorniamo il profilo subito)
    if (updates.email && updates.email.toLowerCase() !== currentEmail.toLowerCase()) {
        const { error } = await supabaseClient.auth.updateUser({ email: updates.email });
        if (error) return { ok: false, error: error.message };
        emailPendingConfirmation = true;
    }

    // Cambio password su Supabase Auth
    if (newPassword) {
        const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
        if (error) return { ok: false, error: error.message };
    }

    // Ricarica profilo in memoria
    await _loadProfile(user.id);

    // Sincronizza cert/assic in gym_users localStorage (letto da admin.js)
    if (profileUpdate.medical_cert_expiry !== undefined || profileUpdate.insurance_expiry !== undefined) {
        try {
            const gymUsers = JSON.parse(localStorage.getItem('gym_users') || '[]');
            const email = (updates.email || user.email || '').toLowerCase();
            let idx = gymUsers.findIndex(u => u.email?.toLowerCase() === email);
            if (idx === -1 && user.whatsapp) {
                const normWa = user.whatsapp;
                idx = gymUsers.findIndex(u => u.whatsapp === normWa);
            }
            if (idx !== -1) {
                if (profileUpdate.medical_cert_expiry !== undefined)
                    gymUsers[idx].certificatoMedicoScadenza = profileUpdate.medical_cert_expiry;
                if (profileUpdate.insurance_expiry !== undefined)
                    gymUsers[idx].assicurazioneScadenza = profileUpdate.insurance_expiry;
                localStorage.setItem('gym_users', JSON.stringify(gymUsers));
            }
        } catch {}
    }

    return { ok: true, emailPendingConfirmation };
}

// ── Lookup per email (usato nell'OAuth callback) ──────────────────────────────
async function getUserByEmail(email) {
    const { data } = await supabaseClient
        .from('profiles')
        .select('id, name, email, whatsapp')
        .eq('email', email.toLowerCase())
        .single();
    return data || null;
}

// ── Le mie prenotazioni ───────────────────────────────────────────────────────
// Legge ancora da localStorage finché non migriamo bookings (Fase 3).
function getUserBookings() {
    const user = getCurrentUser();
    if (!user) return { upcoming: [], past: [] };

    const allBookings = BookingStorage.getAllBookings();
    const now   = new Date();
    const today = _localDateStr();

    const myPhone = user.whatsapp ? normalizePhone(user.whatsapp) : '';
    const mine = allBookings.filter(b => {
        if (b.id && b.id.startsWith('demo-')) return false;
        if (!user.email || !b.email) return false;
        if (b.email.toLowerCase() !== user.email.toLowerCase()) return false;
        if (myPhone && b.whatsapp && normalizePhone(b.whatsapp) !== myPhone) return false;
        return true;
    });

    function isBookingPast(b) {
        if (b.date < today) return true;
        if (b.date > today) return false;
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

// ── Navbar ────────────────────────────────────────────────────────────────────
function updateNavAuth() {
    document.body.classList.add('auth-loaded');
    const user    = getCurrentUser();
    const isAdmin = sessionStorage.getItem('adminAuth') === 'true';
    const loginLink = document.getElementById('navLoginLink');
    const userMenu  = document.getElementById('navUserMenu');
    const userName  = document.getElementById('navUserName');

    _removeDynamicNavLinks();

    if (user || isAdmin) {
        if (loginLink) loginLink.style.display = 'none';
        if (userMenu)  userMenu.style.display  = 'flex';
        if (userName)  userName.textContent    = user ? (user.name || user.email).split(' ')[0] : 'Thomas';
        if (user) _injectNavLinkFirst('prenotazioni.html', 'Le mie prenotazioni', 'nav-prenotazioni-link');
        if (isAdmin) _injectNavLinkLast('admin.html', 'Amministrazione', 'nav-admin-link');
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
        li.setAttribute('data-nav-dynamic', '');
        li.innerHTML = `<a href="${href}" class="${cssClass}">${label}</a>`;
        nav.prepend(li);
    });
}

function _injectNavLinkLast(href, label, cssClass) {
    ['.nav-desktop-links', '.nav-sidebar-links'].forEach(sel => {
        const nav = document.querySelector(sel);
        if (!nav || nav.querySelector('.' + cssClass)) return;
        const li = document.createElement('li');
        li.setAttribute('data-nav-dynamic', '');
        li.innerHTML = `<a href="${href}" class="${cssClass}">${label}</a>`;
        nav.append(li);
    });
}

function _removeDynamicNavLinks() {
    document.querySelectorAll('[data-nav-dynamic]').forEach(el => el.remove());
    // Nascondi invece di rimuovere — preserva l'event listener del bottone Esci
    document.querySelectorAll('.nav-sidebar-logout-item').forEach(el => el.style.display = 'none');
}

function _injectSidebarLogout() {
    const sidebar = document.querySelector('.nav-sidebar-links');
    if (!sidebar) return;
    // Riusa il bottone esistente invece di ricrearlo (evita perdita event listener)
    const existing = sidebar.querySelector('.nav-sidebar-logout');
    if (existing) {
        const li = existing.closest('.nav-sidebar-logout-item');
        li.style.display = '';
        // Sposta in fondo per garantire che sia sempre l'ultimo elemento
        sidebar.append(li);
        return;
    }
    const li = document.createElement('li');
    li.className = 'nav-sidebar-logout-item';
    const btn = document.createElement('button');
    btn.className = 'nav-sidebar-logout';
    btn.textContent = 'Esci';
    btn.addEventListener('click', async () => {
        await logoutUser();
        window.location.href = '/';
    });
    li.appendChild(btn);
    sidebar.append(li);
}

// ── Hamburger sidebar ─────────────────────────────────────────────────────────
function toggleNavMenu() {
    const sidebar = document.getElementById('navSidebar');
    const overlay = document.getElementById('navSidebarOverlay');
    if (!sidebar) return;
    const isOpen = sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('open', isOpen);
    document.body.classList.toggle('nav-open', isOpen);
}

// ── Profile modal ─────────────────────────────────────────────────────────────
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

// ── Init on DOM ready ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const hamburger = document.getElementById('navHamburger');
    if (hamburger) hamburger.addEventListener('click', toggleNavMenu);

    const logoutBtn = document.getElementById('navLogoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await logoutUser();
            window.location.href = '/';
        });
    }

    const profileBtn = document.getElementById('navUserName');
    if (profileBtn) {
        profileBtn.style.cursor = 'pointer';
        profileBtn.addEventListener('click', () => {
            window.location.href = 'prenotazioni.html';
        });
    }
});
