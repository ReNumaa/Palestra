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

    // Sticky: navbar → admin-tabs → week-bar, senza gap
    _updateStickyOffsets();
    window.addEventListener('resize', _updateStickyOffsets);
}

function _updateStickyOffsets() {
    const navbar = document.querySelector('.navbar');
    const tabs = document.querySelector('.admin-tabs');
    const root = document.documentElement;
    const navH = navbar ? navbar.offsetHeight : 0;
    root.style.setProperty('--admin-tabs-top', navH + 'px');
    if (tabs) {
        root.style.setProperty('--bookings-bar-top', (navH + tabs.offsetHeight) + 'px');
    }
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
        const dayBookingsCount = bookings.filter(b => b.date === dateInfo.formatted && b.status !== 'cancelled' && !b.id?.startsWith('_avail_')).length;

        const dayCard = document.createElement('div');
        dayCard.className = 'admin-day-card';

        if (selectedAdminDay && selectedAdminDay.formatted === dateInfo.formatted) {
            dayCard.classList.add('active');
        }

        const shortName = dateInfo.dayName.slice(0, 3);
        dayCard.innerHTML = `
            <div class="admin-day-name"><span class="day-full">${dateInfo.dayName}</span><span class="day-short">${shortName}</span></div>
            <div class="admin-day-date">${dateInfo.date.getDate()}</div>
            <div class="admin-day-count">${dayBookingsCount} pren.</div>
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
                .from('profiles').select('id').eq('email', (client.email || '').toLowerCase()).maybeSingle();
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
    invalidateStatsCache();
    if (window._currentAdminDate) renderAdminDayView(window._currentAdminDate);
}

function removeExtraSpotFromSlot(date, time, extraType) {
    if (!BookingStorage.removeExtraSpot(date, time, extraType)) {
        showToast('Prima cancella la prenotazione in corso, poi potrai rimuovere lo slot extra.', 'error');
        return;
    }
    if (window._currentAdminDate) renderAdminDayView(window._currentAdminDate);
}

// Helper: icona notifiche push (solo se disattivate)
function _pushIcon(userRecord) {
    if (userRecord?.pushEnabled) return '';
    return '<span title="Notifiche non attive" style="font-size:13px">🔕</span>';
}


// Helper: HTML di una singola card partecipante
function _buildParticipantCard(booking) {
    const isPaid = booking.paid || false;
    const isCancelPending = booking.status === 'cancellation_requested';
    const grossDebt = getUnpaidAmountForContact(booking.whatsapp, booking.email);
    const creditBalance = CreditStorage.getBalance(booking.whatsapp, booking.email);
    const unpaidAmount = Math.round(Math.max(0, grossDebt - creditBalance) * 100) / 100;
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

    // Cert medico
    let certBadge = '';
    const certMissing = !certScad;
    if (certMissing) {
        certBadge = `<div class="cert-expired-badge cert-expired-badge--clickable" onclick="openCertModal(this,'${emE}','${waE}','${nmE2}')">🏥 Imposta Cert. Med</div>`;
    } else if (certScad < _todayStr) {
        const [cy, cm, cd] = certScad.split('-');
        certBadge = `<div class="cert-expired-badge cert-expired-badge--clickable" onclick="openCertModal(this,'${emE}','${waE}','${nmE2}')">🏥 Cert. scaduto il ${cd}/${cm}/${cy}</div>`;
    } else if (certScad <= _today30Str) {
        const [cy, cm, cd] = certScad.split('-');
        certBadge = `<div class="cert-expired-badge cert-expired-badge--clickable" style="background:#fffbeb;border-color:#fde68a;color:#92400e;border-left:3px solid #f59e0b" onclick="openCertModal(this,'${emE}','${waE}','${nmE2}')">⏳ Cert. Med scade il ${cd}/${cm}/${cy}</div>`;
    }

    // Anagrafica incompleta (CF, indirizzo)
    let cfBadge = '';
    const anagMissing = !hasCF || !userRecord?.indirizzoVia || !userRecord?.indirizzoPaese || !userRecord?.indirizzoCap;
    if (anagMissing) {
        cfBadge = `<div class="cert-expired-badge cert-expired-badge--clickable" style="background:#fef3c7;border-color:#fde68a;color:#92400e;border-left:3px solid #f59e0b" onclick="openEditClientPopup(0,'${waE}','${emE}','${nmE2}')">📋 Completa anagrafica</div>`;
    }

    // Documento firmato
    let docBadge = '';
    if (!userRecord?.documentoFirmato) {
        docBadge = `<div class="cert-expired-badge cert-expired-badge--clickable" onclick="openEditClientPopup(0,'${waE}','${emE}','${nmE2}')">📝 Documento non firmato</div>`;
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
                <div class="participant-name">${_escHtml(booking.name)} ${_pushIcon(userRecord)}</div>
                <div class="participant-contact">📱 ${_escHtml(booking.whatsapp)}</div>
                ${booking.notes ? `<div class="participant-notes">📝 ${_escHtml(booking.notes)}</div>` : ''}
                ${cancelPendingBadge}${certBadge}${cfBadge}${assicBadge}${docBadge}
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
    // Reconcile crediti via RPC (non client-side) per evitare loop realtime
    if (typeof supabaseClient !== 'undefined') {
        const dayBookings = BookingStorage.getAllBookings().filter(b => b.date === dateInfo.formatted);
        const seen = new Set();
        const _slotPrices = { 'personal-training': 5, 'small-group': 10, 'group-class': 30 };
        dayBookings.forEach(b => {
            if (b.email && !seen.has(b.email.toLowerCase())) {
                seen.add(b.email.toLowerCase());
                supabaseClient.rpc('apply_credit_to_past_bookings', {
                    p_email: b.email, p_slot_prices: _slotPrices
                }).then(() => {}, () => {});
            }
        });
    }

    scheduledSlots.forEach(scheduledSlot => {
        const slotCard = createAdminSlotCard(dateInfo, scheduledSlot);
        dayView.appendChild(slotCard);
    });

}

function _adminScrollIfFirstOpen() {
    if (_adminInitialScrollDone) return;
    const dayView = document.getElementById('adminDayView');
    if (!dayView) return;
    const todayStr = _localDateStr();
    if (window._currentAdminDate && window._currentAdminDate.formatted === todayStr) {
        _adminInitialScrollDone = true;
        _scrollToCurrentAdminSlot(dayView);
    }
}

function _scrollToCurrentAdminSlot(container) {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const cards = container.querySelectorAll('.admin-slot-card');
    for (const card of cards) {
        const timeEl = card.querySelector('.admin-slot-time');
        if (!timeEl) continue;
        const text = timeEl.textContent.replace('🕐', '').trim();
        const parsed = _parseSlotTime(text);
        if (!parsed) continue;
        const slotEnd = parsed.endH * 60 + parsed.endM;
        if (slotEnd > nowMinutes) {
            setTimeout(() => {
                const y = card.getBoundingClientRect().top + window.pageYOffset - window.innerHeight * 0.35;
                window.scrollTo({ top: y, behavior: 'smooth' });
            }, 100);
            return;
        }
    }
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
    // Booking reali (escludi sintetici _avail_ per la visualizzazione partecipanti)
    const realBookings = allBookings.filter(b => !b.id?.startsWith('_avail_'));

    // Info slot principale (usa allBookings per conteggio corretto posti occupati)
    const mainEffCap   = BookingStorage.getEffectiveCapacity(date, timeSlot, mainType);
    const mainConfirmed = allBookings.filter(b => b.status === 'confirmed' && (!b.slotType || b.slotType === mainType)).length;
    const mainRemaining = mainEffCap - mainConfirmed;

    // Tipi extra diversi dal principale
    const extraTypes = [...new Set(extras.map(e => e.type).filter(t => t !== mainType))];
    const hasMixedExtras = extraTypes.length > 0;

    // ── Header ──────────────────────────────────────────────────────────────
    const capStr = mainType !== 'group-class' && mainType !== 'cleaning'
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
        const mainBookings = realBookings.filter(b => !b.slotType || b.slotType === mainType);
        participantsHTML = _buildParticipantsSection(mainBookings);
    } else {
        // Vista divisa in colonne
        const mainBookings = realBookings.filter(b => !b.slotType || b.slotType === mainType);
        const leftCol = `
            <div class="split-column">
                <div class="split-col-title ${mainType}">${SLOT_NAMES[mainType]}</div>
                ${_buildParticipantsSection(mainBookings)}
            </div>`;
        const rightCols = extraTypes.map(t => {
            const eb = realBookings.filter(b => b.slotType === t);
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
    const bookings = [...BookingStorage.getAllBookings()];
    const index = bookings.findIndex(b => b.id === bookingId);
    if (index === -1) return;

    const booking = bookings[index];
    const price = SLOT_PRICES[booking.slotType] || 0;
    const hasBonus = BonusStorage.getBonus(booking.whatsapp, booking.email, booking.userId) > 0;

    // Calcola distanza dalla lezione
    const _tp = _parseSlotTime(booking.time);
    const [_yr, _mo, _dy] = booking.date.split('-').map(Number);
    const lessonStart = _tp ? new Date(_yr, _mo - 1, _dy, _tp.startH, _tp.startM, 0) : null;
    const msToLesson = lessonStart ? lessonStart - new Date() : Infinity;
    const ONE_DAY = 24 * 60 * 60 * 1000;
    const isWithin24h = msToLesson <= ONE_DAY;

    // Helper: esegue la cancellazione via RPC Supabase (atomica) e aggiorna UI
    async function _cancelViaRpc(opts = {}) {
        const { useBonus = false, withMora = false } = opts;
        const isCancellationPending = booking.status === 'cancellation_requested';
        const wasPaid = !isCancellationPending && (booking.paid || (booking.creditApplied || 0) > 0);

        let creditAmount = 0;
        let creditNote = '';
        let moraDebtAmount = 0;
        let moraDebtNote = '';

        if (withMora) {
            if (wasPaid) {
                creditAmount = Math.round(price * 0.5 * 100) / 100;
                creditNote = `Rimborso parziale 50% — annullamento con mora ${booking.date} ${booking.time}`;
            } else {
                moraDebtAmount = Math.round(price * 0.5 * 100) / 100;
                moraDebtNote = `Mora 50% annullamento tardivo ${booking.date} ${booking.time}`;
            }
        } else {
            if (wasPaid) {
                creditAmount = (booking.creditApplied || 0) > 0 ? booking.creditApplied : price;
                creditNote = `Rimborso lezione ${booking.date}`;
            }
        }

        const { data, error } = await _rpcWithTimeout(supabaseClient.rpc('cancel_booking_with_refund', {
            p_booking_id:       booking._sbId,
            p_credit_amount:    creditAmount,
            p_credit_note:      creditNote,
            p_use_bonus:        useBonus,
            p_with_bonus:       useBonus,
            p_with_penalty:     withMora,
            p_mora_debt_amount: moraDebtAmount,
            p_mora_debt_note:   moraDebtNote,
        }));

        if (error) throw new Error(error.message);
        if (data && !data.success) throw new Error(data.error || 'Errore sconosciuto');

        // Sync per riallineare cache locale con Supabase
        await Promise.all([
            BookingStorage.syncFromSupabase(),
            creditAmount > 0 ? CreditStorage.syncFromSupabase() : Promise.resolve(),
            moraDebtAmount > 0 ? ManualDebtStorage.syncFromSupabase() : Promise.resolve(),
            useBonus ? BonusStorage.syncFromSupabase() : Promise.resolve(),
        ]);

        if (typeof notifySlotAvailable === 'function') notifySlotAvailable(booking);
        invalidateStatsCache();
        if (selectedAdminDay) renderAdminDayView(selectedAdminDay);
        if (typeof showToast === 'function') showToast('✅ Prenotazione annullata con successo.', 'success', 4000);
    }

    // Helper: fallback locale (offline / senza _sbId)
    function _cancelLocal(opts = {}) {
        const { useBonus = false, withMora = false, refundPct = 100 } = opts;
        const isCancellationPending = booking.status === 'cancellation_requested';
        const wasPaid = !isCancellationPending && (booking.paid || (booking.creditApplied || 0) > 0);

        if (useBonus) {
            BonusStorage.useBonus(booking.whatsapp, booking.email, booking.name, booking.userId || null);
        }

        if (withMora) {
            if (wasPaid) {
                const refund = Math.round(price * 0.5 * 100) / 100;
                CreditStorage.addCredit(booking.whatsapp, booking.email, booking.name,
                    refund, `Rimborso parziale 50% — annullamento con mora ${booking.date} ${booking.time}`,
                    null, false, false, null, booking.paymentMethod || '');
            } else {
                ManualDebtStorage.addDebt(booking.whatsapp, booking.email, booking.name,
                    Math.round(price * 0.5 * 100) / 100,
                    `Mora 50% annullamento tardivo ${booking.date} ${booking.time}`);
            }
        } else {
            if (wasPaid) {
                const creditToRefund = (booking.creditApplied || 0) > 0 ? booking.creditApplied : price;
                CreditStorage.addCredit(booking.whatsapp, booking.email, booking.name,
                    creditToRefund, `Rimborso lezione ${booking.date}`,
                    null, false, false, null, booking.paymentMethod || '');
            }
        }

        bookings[index] = {
            ...bookings[index],
            cancelledPaymentMethod: booking.paymentMethod,
            cancelledPaidAt: booking.paidAt,
            status: 'cancelled',
            cancelledAt: new Date().toISOString(),
            cancelledWithBonus: useBonus,
            cancelledRefundPct: refundPct,
            paid: false,
            paymentMethod: null,
            paidAt: null,
            creditApplied: 0,
        };
        BookingStorage.replaceAllBookings(bookings);
        if (typeof notifySlotAvailable === 'function') notifySlotAvailable(booking);
        invalidateStatsCache();
        if (selectedAdminDay) renderAdminDayView(selectedAdminDay);
        if (typeof showToast === 'function') showToast('✅ Prenotazione annullata con successo.', 'success', 4000);
    }

    const useSupabase = typeof supabaseClient !== 'undefined' && booking._sbId;

    // > 24h: semplice conferma
    if (!isWithin24h) {
        if (!confirm(`Confermare l'annullamento della prenotazione di ${bookingName}?`)) return;

        if (useSupabase) {
            _cancelViaRpc({ useBonus: false, withMora: false, refundPct: 100 }).catch(err => {
                console.error('[deleteBooking] RPC error:', err);
                if (typeof showToast === 'function') showToast('⚠️ Errore: ' + err.message, 'error', 5000);
            });
        } else {
            _cancelLocal({ useBonus: false, withMora: false, refundPct: 100 });
        }
        return;
    }

    // < 24h: popup con opzioni
    const mora = Math.round(price * 0.5 * 100) / 100;

    const overlay = document.createElement('div');
    overlay.className = 'cancel-popup-overlay';
    overlay.innerHTML = `
        <div class="cancel-popup">
            <div class="cancel-popup-header">Annulla prenotazione</div>
            <div class="cancel-popup-body">
                <p class="cancel-popup-name">${bookingName}</p>
                <p class="cancel-popup-detail">${booking.date} · ${booking.time} · €${price}</p>
                <p class="cancel-popup-hint" style="color:var(--danger,#e74c3c);margin-bottom:0.5rem">⚠️ Entro 24h dall'inizio della lezione</p>

                ${hasBonus ? `
                <label class="cancel-popup-label">Utilizza bonus</label>
                <div class="cancel-popup-toggle-row">
                    <button class="cancel-toggle-btn" data-val="false" data-group="bonus">No</button>
                    <button class="cancel-toggle-btn" data-val="true" data-group="bonus">Sì</button>
                </div>
                ` : ''}

                <label class="cancel-popup-label">Modalità annullamento</label>
                <div class="cancel-popup-toggle-row">
                    <button class="cancel-toggle-btn" data-val="mora" data-group="mode">Con mora (€${mora})</button>
                    <button class="cancel-toggle-btn" data-val="senza" data-group="mode">Senza mora</button>
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

    let selectedBonus = hasBonus ? null : false;
    let selectedMode = null;

    overlay.querySelectorAll('.cancel-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const group = btn.dataset.group;
            overlay.querySelectorAll(`[data-group="${group}"]`).forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (group === 'bonus') {
                selectedBonus = btn.dataset.val === 'true';
                // Se seleziona "Sì" al bonus → auto-seleziona "Senza mora"
                if (selectedBonus) {
                    const senzaBtn = overlay.querySelector('[data-group="mode"][data-val="senza"]');
                    if (senzaBtn) {
                        overlay.querySelectorAll('[data-group="mode"]').forEach(b => b.classList.remove('active'));
                        senzaBtn.classList.add('active');
                        selectedMode = 'senza';
                    }
                }
            }
            if (group === 'mode') selectedMode = btn.dataset.val;
            const confirmBtn = overlay.querySelector('.cancel-popup-btn--confirm');
            confirmBtn.disabled = (selectedBonus === null || selectedMode === null);
        });
    });

    const closePopup = () => {
        overlay.classList.remove('visible');
        setTimeout(() => overlay.remove(), 250);
    };
    overlay.querySelector('.cancel-popup-btn--cancel').addEventListener('click', closePopup);
    overlay.addEventListener('click', e => { e.stopPropagation(); });

    overlay.querySelector('.cancel-popup-btn--confirm').addEventListener('click', async () => {
        const useBonus = selectedBonus;
        const withMora = selectedMode === 'mora';
        const isCancellationPending = booking.status === 'cancellation_requested';
        const wasPaid = !isCancellationPending && (booking.paid || (booking.creditApplied || 0) > 0);
        const refundPct = withMora ? (wasPaid ? 50 : 0) : 100;

        // Disabilita bottoni durante il salvataggio
        const confirmBtn = overlay.querySelector('.cancel-popup-btn--confirm');
        const cancelBtn = overlay.querySelector('.cancel-popup-btn--cancel');
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Salvataggio...';
        cancelBtn.disabled = true;

        if (useSupabase) {
            try {
                await _cancelViaRpc({ useBonus, withMora, refundPct });
                closePopup();
            } catch (err) {
                console.error('[deleteBooking] RPC error:', err);
                if (typeof showToast === 'function') showToast('⚠️ Errore: ' + err.message, 'error', 5000);
                // Riabilita bottoni per riprovare
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Conferma';
                cancelBtn.disabled = false;
            }
        } else {
            _cancelLocal({ useBonus, withMora, refundPct });
            closePopup();
        }
    });
}

