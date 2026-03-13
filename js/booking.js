// Booking form / modal functionality
let _confirmedBooking = null; // used by downloadIcs button in showConfirmation

function initBookingForm() {
    const form = document.getElementById('bookingForm');
    form.addEventListener('submit', handleBookingSubmit);

    // Close modal on Escape key
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeBookingModal();
    });

    // Swipe-down to close on mobile (works on form and confirmation screens)
    const box = document.getElementById('bookingModal').querySelector('.modal-box');
    let startY = 0;
    let swipeActive = false;
    box.addEventListener('touchstart', e => {
        // Only activate swipe when starting in the top 40px (drag handle area)
        const boxTop = box.getBoundingClientRect().top;
        swipeActive = (e.touches[0].clientY - boxTop) < 40;
        if (swipeActive) {
            startY = e.touches[0].clientY;
            box.style.transition = 'none';
        }
    }, { passive: true });
    box.addEventListener('touchmove', e => {
        if (!swipeActive) return;
        const dy = e.touches[0].clientY - startY;
        if (dy > 0) box.style.transform = `translateY(${dy}px)`;
    }, { passive: true });
    box.addEventListener('touchend', e => {
        if (!swipeActive) return;
        const dy = e.changedTouches[0].clientY - startY;
        box.style.transition = '';
        if (dy > 80) {
            box.style.transform = `translateY(100%)`;
            setTimeout(closeBookingModal, 200);
        } else {
            box.style.transform = '';
        }
        swipeActive = false;
    });
}

function openBookingModal(dateInfo, timeSlot, slotType, remainingSpots) {
    // Populate slot info
    const badge = document.getElementById('modalSlotTypeBadge');
    badge.textContent = SLOT_NAMES[slotType];
    badge.className = `modal-slot-badge ${slotType}`;

    document.getElementById('modalSlotDay').textContent = `${dateInfo.dayName} ${dateInfo.displayDate}`;
    document.getElementById('modalSlotTime').textContent = `🕐 ${timeSlot}`;

    const spotsEl = document.getElementById('modalSlotSpots');
    spotsEl.textContent = `${remainingSpots} ${remainingSpots === 1 ? 'disponibile' : 'disponibili'}`;
    spotsEl.className = `modal-spots ${spotsColorClass(remainingSpots)}`;

    // Reset form and hide confirmation
    document.getElementById('bookingForm').reset();
    document.getElementById('confirmationMessage').style.display = 'none';

    // Check login
    const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    const loginPrompt = document.getElementById('loginPrompt');

    // Rimuovi eventuale blocco precedente
    const oldBlock = document.getElementById('bookingBlockMessage');
    if (oldBlock) oldBlock.remove();

    if (!user) {
        // Not logged in: show login prompt, hide form
        loginPrompt.style.display = 'block';
        document.getElementById('bookingForm').style.display = 'none';
    } else {
        loginPrompt.style.display = 'none';

        // Check blocchi certificato/assicurazione PRIMA di mostrare il form
        const _certScad  = user.medical_cert_expiry || '';
        const _assicScad = user.insurance_expiry || '';
        const _today     = _localDateStr();
        let blockMsg = null;
        if (!_certScad && typeof CertBookingStorage !== 'undefined' && CertBookingStorage.getBlockIfNotSet())
            blockMsg = 'Non hai inserito la data di scadenza del certificato medico. Contatta il trainer.';
        else if (_certScad && _certScad < _today && typeof CertBookingStorage !== 'undefined' && CertBookingStorage.getBlockIfExpired())
            blockMsg = 'Il tuo certificato medico è scaduto. Contatta il trainer per aggiornarlo.';
        else if (!_assicScad && typeof AssicBookingStorage !== 'undefined' && AssicBookingStorage.getBlockIfNotSet())
            blockMsg = 'Non hai inserito la data di scadenza dell\'assicurazione. Contatta il trainer.';
        else if (_assicScad && _assicScad < _today && typeof AssicBookingStorage !== 'undefined' && AssicBookingStorage.getBlockIfExpired())
            blockMsg = 'La tua assicurazione è scaduta. Contatta il trainer per aggiornarla.';

        if (blockMsg) {
            document.getElementById('bookingForm').style.display = 'none';
            const blockEl = document.createElement('div');
            blockEl.id = 'bookingBlockMessage';
            blockEl.style.cssText = 'padding:24px;text-align:center;color:#c0392b;font-weight:600;line-height:1.5';
            blockEl.textContent = '⚠️ ' + blockMsg;
            document.getElementById('bookingForm').parentNode.insertBefore(blockEl, document.getElementById('bookingForm'));
        } else {
            // Logged in, nessun blocco: show form, pre-fill fields
            document.getElementById('bookingForm').style.display = 'flex';
            document.getElementById('name').value     = user.name     || '';
            document.getElementById('email').value    = user.email    || '';
            document.getElementById('whatsapp').value = user.whatsapp || '';
        }
    }

    // Show modal
    document.getElementById('bookingModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeBookingModal() {
    const box = document.getElementById('bookingModal').querySelector('.modal-box');
    box.style.transform = '';
    box.style.transition = '';
    document.getElementById('bookingModal').style.display = 'none';
    document.body.style.overflow = '';
    selectedSlot = null;
    // Reset iOS Safari auto-zoom that may have triggered on input focus
    const vp = document.querySelector('meta[name="viewport"]');
    if (vp) {
        vp.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0');
        setTimeout(() => vp.setAttribute('content', 'width=device-width, initial-scale=1.0'), 100);
    }
}

function handleModalOverlayClick(e) {
    if (e.target === document.getElementById('bookingModal')) {
        closeBookingModal();
    }
}

async function handleBookingSubmit(e) {
    e.preventDefault();

    const submitBtn = e.target.querySelector('button[type="submit"]');

    // Previeni doppio click: disabilita subito il bottone
    if (submitBtn.disabled) return;
    submitBtn.disabled = true;

    if (!selectedSlot) {
        showToast('Seleziona uno slot dal calendario prima di prenotare.', 'error');
        submitBtn.disabled = false;
        return;
    }

    // Reject if the lesson ends in less than 30 minutes from now
    const _slotTp = _parseSlotTime(selectedSlot.time);
    const [_eh, _em] = _slotTp ? [_slotTp.endH, _slotTp.endM] : [23, 59]; // fallback non-bloccante
    const _lessonEnd = new Date(selectedSlot.date);
    _lessonEnd.setHours(_eh, _em, 0, 0);
    if ((_lessonEnd - new Date()) < 30 * 60 * 1000) {
        showToast('Non è possibile prenotare: la lezione termina tra meno di 30 minuti.', 'error');
        closeBookingModal();
        return;
    }

    // Validate form
    const formData = {
        name: document.getElementById('name').value.trim().replace(/\S+/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase()),
        email: document.getElementById('email').value.trim(),
        whatsapp: normalizePhone(document.getElementById('whatsapp').value.trim()),
        notes: document.getElementById('notes').value.trim()
    };

    // Basic validation
    if (!formData.name || !formData.email || !formData.whatsapp) {
        showToast('Compila tutti i campi obbligatori.', 'error');
        submitBtn.disabled = false; return;
    }

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
        showToast('Inserisci un indirizzo email valido.', 'error');
        submitBtn.disabled = false; return;
    }

    // Validate phone (basic check)
    const phoneRegex = /[\d\s+()-]{10,}/;
    if (!phoneRegex.test(formData.whatsapp)) {
        showToast('Inserisci un numero WhatsApp valido.', 'error');
        submitBtn.disabled = false; return;
    }

    // Check if slot is still available
    const remainingSpots = BookingStorage.getRemainingSpots(
        selectedSlot.date,
        selectedSlot.time,
        selectedSlot.slotType
    );

    if (remainingSpots <= 0) {
        showToast('Slot completo. Seleziona un altro orario.', 'error');
        renderCalendar();
        submitBtn.disabled = false; return;
    }

    // Check duplicate booking (same user, same date+time, not cancelled)
    const allBookings = BookingStorage.getAllBookings();
    const normPhone = normalizePhone(formData.whatsapp);
    const duplicate = allBookings.find(b =>
        b.date === selectedSlot.date &&
        b.time === selectedSlot.time &&
        b.status !== 'cancelled' &&
        b.status !== 'cancellation_requested' &&
        (
            (b.email && b.email.toLowerCase() === formData.email.toLowerCase()) ||
            (normPhone && normalizePhone(b.whatsapp) === normPhone)
        )
    );
    if (duplicate) {
        showToast('Hai già una prenotazione per questo orario.', 'error');
        submitBtn.disabled = false; return;
    }

    // Check debt threshold — usa RPC Supabase se l'utente è loggato, altrimenti localStorage
    const _threshold = DebtThresholdStorage.get();
    if (_threshold > 0) {
        let _pastDebt = BookingStorage.getUnpaidPastDebt(formData.whatsapp, formData.email);
        const _debtUser = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
        if (_debtUser?.id && typeof supabaseClient !== 'undefined') {
            try {
                const { data: _rpcDebt, error: _rpcErr } = await supabaseClient
                    .rpc('get_unpaid_past_debt', { p_user_id: _debtUser.id });
                if (!_rpcErr && _rpcDebt !== null) _pastDebt = _rpcDebt;
            } catch (_) { /* fallback al valore localStorage già calcolato */ }
        }
        if (_pastDebt > _threshold) {
            showToast(`Prenotazione bloccata: hai un debito di €${_pastDebt} che supera la soglia massima di €${_threshold}. Contatta il trainer per regolarizzare.`, 'error');
            submitBtn.disabled = false; return;
        }
    }

    // Check medical certificate restrictions — usa il profilo Supabase (getCurrentUser è sync)
    const _certUser = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    const _certScad = _certUser?.medical_cert_expiry || '';
    const _today    = _localDateStr();
    if (!_certScad && CertBookingStorage.getBlockIfNotSet()) {
        showToast('Prenotazione bloccata: non hai inserito la data di scadenza del certificato medico. Contatta il trainer.', 'error');
        submitBtn.disabled = false; return;
    }
    if (_certScad && _certScad < _today && CertBookingStorage.getBlockIfExpired()) {
        showToast('Prenotazione bloccata: il tuo certificato medico è scaduto. Contatta il trainer per aggiornarlo.', 'error');
        submitBtn.disabled = false; return;
    }

    // Check assicurazione restrictions
    const _assicScad = _certUser?.insurance_expiry || '';
    if (!_assicScad && AssicBookingStorage.getBlockIfNotSet()) {
        showToast('Prenotazione bloccata: non hai inserito la data di scadenza dell\'assicurazione. Contatta il trainer.', 'error');
        submitBtn.disabled = false; return;
    }
    if (_assicScad && _assicScad < _today && AssicBookingStorage.getBlockIfExpired()) {
        showToast('Prenotazione bloccata: la tua assicurazione è scaduta. Contatta il trainer per aggiornarla.', 'error');
        submitBtn.disabled = false; return;
    }

    setLoading(submitBtn, true, 'Prenotazione in corso...');

    // Create booking
    const booking = {
        ...formData,
        date: selectedSlot.date,
        time: selectedSlot.time,
        slotType: selectedSlot.slotType,
        dateDisplay: selectedSlot.dateDisplay
    };

    // Save booking — attende la conferma server prima di mostrare il risultato
    const result = await BookingStorage.saveBooking(booking);
    if (!result.ok) {
        setLoading(submitBtn, false);
        submitBtn.disabled = false;
        if (result.error === 'slot_full') {
            showToast('Slot non più disponibile. Qualcun altro ha prenotato prima di te.', 'error');
            renderCalendar();
            if (typeof renderMobileSlots === 'function' && selectedMobileDay) renderMobileSlots(selectedMobileDay);
        } else if (result.error === 'server_error' && !navigator.onLine) {
            showToast('Sei offline. Connettiti a internet per prenotare.', 'error');
        } else {
            showToast('Errore durante la prenotazione. Riprova tra qualche secondo.', 'error');
        }
        return;
    }
    const savedBooking = result.booking;
    if (result.offline) {
        showToast('⚠️ Prenotazione salvata localmente. Verrà sincronizzata quando torni online.', 'warning', 5000);
    }

    // Se c'era una richiesta di annullamento per questo slot, è ora soddisfatta
    if (typeof supabaseClient !== 'undefined') {
        try {
            const { data: fcResult, error: fcErr } = await supabaseClient.rpc('fulfill_pending_cancellation', {
                p_date: booking.date,
                p_time: booking.time,
                p_slot_prices: { 'personal-training': 5, 'small-group': 10, 'group-class': 30 },
            });
            if (fcErr) console.error('[Supabase] fulfill_pending_cancellation error:', fcErr.message);
            else if (fcResult?.found) console.log('[fulfill_pending_cancellation] annullamento soddisfatto:', fcResult);
        } catch (e) { console.error('[fulfill_pending_cancellation] exception:', e); }
    } else {
        BookingStorage.fulfillPendingCancellations(booking.date, booking.time);
    }

    // Il credito NON viene scalato alla prenotazione.
    // Verrà applicato automaticamente quando arriva l'ora di inizio lezione
    // (tramite apply_credit_to_past_bookings chiamato al caricamento pagina).

    // Show confirmation
    showConfirmation(savedBooking);
    notificaPrenotazione(savedBooking);

    // Reset form
    document.getElementById('bookingForm').reset();
    setLoading(submitBtn, false);
    submitBtn.disabled = false;

    // Refresh calendar to show updated availability
    renderCalendar();
    if (typeof renderMobileSlots === 'function' && selectedMobileDay) {
        renderMobileSlots(selectedMobileDay);
    }

    // Clear selection
    selectedSlot = null;
}

function buildCalendarDates(dateStr, timeStr) {
    const _btp = _parseSlotTime(timeStr);
    if (!_btp) return { start: '', end: '' };
    const [sH, sM] = [String(_btp.startH).padStart(2,'0'), String(_btp.startM).padStart(2,'0')];
    const [eH, eM] = [String(_btp.endH).padStart(2,'0'), String(_btp.endM).padStart(2,'0')];
    const d = dateStr.replace(/-/g, '');
    return { start: `${d}T${sH}${sM}00`, end: `${d}T${eH}${eM}00` };
}

function googleCalendarUrl(booking) {
    const { start, end } = buildCalendarDates(booking.date, booking.time);
    const title = encodeURIComponent(`Allenamento – ${SLOT_NAMES[booking.slotType]}`);
    const details = encodeURIComponent(`Prenotato da ${booking.name}`);
    const location = encodeURIComponent('Via S. Rocco, 1, Sabbio Chiese BS');
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&details=${details}&location=${location}`;
}

function downloadIcs(booking) {
    const { start, end } = buildCalendarDates(booking.date, booking.time);
    const title = `Allenamento – ${SLOT_NAMES[booking.slotType]}`;
    const ics = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Thomas Bresciani PT//IT',
        'BEGIN:VEVENT',
        `DTSTART:${start}`,
        `DTEND:${end}`,
        `SUMMARY:${title}`,
        'LOCATION:Via S. Rocco\\, 1\\, Sabbio Chiese BS',
        `DESCRIPTION:Prenotato da ${booking.name}`,
        'END:VEVENT',
        'END:VCALENDAR'
    ].join('\r\n');

    const blob = new Blob([ics], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'allenamento.ics';
    a.click();
    URL.revokeObjectURL(url);
}

function showConfirmation(booking) {
    _confirmedBooking = booking;
    // Hide form, show confirmation inside the modal
    document.getElementById('bookingForm').style.display = 'none';
    document.getElementById('modalSlotInfo').style.display = 'none';

    const confirmationDiv = document.getElementById('confirmationMessage');
    const creditNotice = '';
    confirmationDiv.innerHTML = `
        <h3>✓ ${SLOT_NAMES[booking.slotType]} Confermata!</h3>
        <p><strong>${_escHtml(booking.name)}</strong></p>
        <p>📅 ${booking.dateDisplay} &nbsp;·&nbsp; 🕐 ${booking.time}</p>
        ${creditNotice}
        <div class="cal-buttons">
            <a href="${googleCalendarUrl(booking)}" target="_blank" rel="noopener" class="cal-btn cal-btn-google">
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#4285F4" d="M19 4h-1V2h-2v2H8V2H6v2H5C3.9 4 3 4.9 3 6v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"/><rect fill="#EA4335" x="7" y="12" width="2" height="2"/><rect fill="#34A853" x="11" y="12" width="2" height="2"/><rect fill="#FBBC04" x="15" y="12" width="2" height="2"/><rect fill="#34A853" x="7" y="16" width="2" height="2"/><rect fill="#4285F4" x="11" y="16" width="2" height="2"/><rect fill="#EA4335" x="15" y="16" width="2" height="2"/></svg>
                Google Calendar
            </a>
            <button onclick="downloadIcs(_confirmedBooking)" class="cal-btn cal-btn-apple">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
                Apple Calendar
            </button>
        </div>
        <div class="confirm-rules">
            <div class="confirm-rule-item">
                <span class="confirm-rule-icon">👟</span>
                <div>
                    <strong>Abbigliamento adeguato</strong>
                    <p>Indossa scarpe di ricambio pulite (da usare solo in palestra). In alternativa, puoi allenarti con calze antiscivolo. Porta sempre una <strong>salvietta</strong> personale da usare sugli attrezzi.</p>
                </div>
            </div>
            <div class="confirm-rule-item">
                <span class="confirm-rule-icon">🚫</span>
                <div>
                    <strong>Alimentazione e digestione</strong>
                    <p>Non mangiare nelle 2–3 ore prima dell'allenamento per evitare fastidi durante l'attività fisica.</p>
                </div>
            </div>
            <div class="confirm-rule-item">
                <span class="confirm-rule-icon">💧</span>
                <div>
                    <strong>Idratazione</strong>
                    <p>Porta sempre con te una borraccia d'acqua per mantenerti idratato durante la sessione.</p>
                </div>
            </div>
        </div>
    `;
    confirmationDiv.style.display = 'block';
}

// Notifica di sistema dopo una prenotazione confermata
async function notificaPrenotazione(booking) {
    if (!('Notification' in window) || !navigator.serviceWorker) return;
    let permission = Notification.permission;
    if (permission === 'denied') return;
    if (permission === 'default') {
        permission = await Notification.requestPermission();
    }
    if (permission !== 'granted') return;
    // Registra push subscription per notifiche future (es. reminder 24h prima)
    if (typeof registerPushSubscription === 'function') registerPushSubscription();
    const reg = await navigator.serviceWorker.ready;
    reg.showNotification('Prenotazione confermata', {
        body: `${SLOT_NAMES[booking.slotType]} · ${booking.dateDisplay} · ${booking.time}`,
        icon: '/Palestra/images/logo-tb---nero.jpg',
        badge: '/Palestra/images/logo-tb---nero.jpg',
        tag: 'prenotazione-' + booking.id,
        renotify: false
    });
}

// Initialize booking form when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBookingForm);
} else {
    initBookingForm();
}
