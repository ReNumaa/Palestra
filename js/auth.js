// Auth - simulated session via localStorage

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
    const user = getCurrentUser();
    const loginLink  = document.getElementById('navLoginLink');
    const userMenu   = document.getElementById('navUserMenu');
    const userName   = document.getElementById('navUserName');

    if (!loginLink || !userMenu) return;

    if (user) {
        loginLink.style.display  = 'none';
        userMenu.style.display   = 'flex';
        if (userName) userName.textContent = user.name.split(' ')[0];
    } else {
        loginLink.style.display  = '';
        userMenu.style.display   = 'none';
    }
}

function getUserBookings() {
    const user = getCurrentUser();
    if (!user) return { upcoming: [], past: [] };

    const allBookings = JSON.parse(localStorage.getItem('bookings') || '[]');
    const today = new Date().toISOString().split('T')[0];

    const mine = allBookings.filter(b => b.email && b.email.toLowerCase() === user.email.toLowerCase());
    return {
        upcoming: mine.filter(b => b.date >= today).sort((a, b) => a.date.localeCompare(b.date)),
        past:     mine.filter(b => b.date <  today).sort((a, b) => b.date.localeCompare(a.date))
    };
}

function openProfileModal() {
    const user = getCurrentUser();
    if (!user) return;

    const { upcoming, past } = getUserBookings();
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

// Init on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    updateNavAuth();

    const logoutBtn = document.getElementById('navLogoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            logoutUser();
            window.location.href = 'index.html';
        });
    }

    const profileBtn = document.getElementById('navUserName');
    if (profileBtn) {
        profileBtn.style.cursor = 'pointer';
        profileBtn.addEventListener('click', openProfileModal);
    }
});
