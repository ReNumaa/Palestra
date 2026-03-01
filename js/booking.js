// Booking form / modal functionality

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

    if (!user) {
        // Not logged in: show login prompt, hide form
        loginPrompt.style.display = 'block';
        document.getElementById('bookingForm').style.display = 'none';
    } else {
        // Logged in: show form, pre-fill fields
        loginPrompt.style.display = 'none';
        document.getElementById('bookingForm').style.display = 'flex';
        document.getElementById('name').value     = user.name     || '';
        document.getElementById('email').value    = user.email    || '';
        document.getElementById('whatsapp').value = user.whatsapp || '';
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

function handleBookingSubmit(e) {
    e.preventDefault();

    const submitBtn = e.target.querySelector('button[type="submit"]');

    if (!selectedSlot) {
        showToast('Seleziona uno slot dal calendario prima di prenotare.', 'error');
        return;
    }

    // Reject if the lesson ends in less than 30 minutes from now
    const [_eh, _em] = selectedSlot.time.split(' - ')[1].trim().split(':').map(Number);
    const _lessonEnd = new Date(selectedSlot.date);
    _lessonEnd.setHours(_eh, _em, 0, 0);
    if ((_lessonEnd - new Date()) < 30 * 60 * 1000) {
        showToast('Non è possibile prenotare: la lezione termina tra meno di 30 minuti.', 'error');
        closeBookingModal();
        return;
    }

    // Validate form
    const formData = {
        name: document.getElementById('name').value.trim(),
        email: document.getElementById('email').value.trim(),
        whatsapp: document.getElementById('whatsapp').value.trim(),
        notes: document.getElementById('notes').value.trim()
    };

    // Basic validation
    if (!formData.name || !formData.email || !formData.whatsapp) {
        showToast('Compila tutti i campi obbligatori.', 'error');
        return;
    }

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
        showToast('Inserisci un indirizzo email valido.', 'error');
        return;
    }

    // Validate phone (basic check)
    const phoneRegex = /[\d\s+()-]{10,}/;
    if (!phoneRegex.test(formData.whatsapp)) {
        showToast('Inserisci un numero WhatsApp valido.', 'error');
        return;
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
        return;
    }

    // Check duplicate booking (same user, same date+time, not cancelled)
    const allBookings = BookingStorage.getAllBookings();
    const normPhone = normalizePhone(formData.whatsapp);
    const duplicate = allBookings.find(b =>
        b.date === selectedSlot.date &&
        b.time === selectedSlot.time &&
        b.status !== 'cancelled' &&
        (
            (b.email && b.email.toLowerCase() === formData.email.toLowerCase()) ||
            (normPhone && normalizePhone(b.whatsapp) === normPhone)
        )
    );
    if (duplicate) {
        showToast('Hai già una prenotazione per questo orario.', 'error');
        return;
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

    // Save booking
    const savedBooking = BookingStorage.saveBooking(booking);

    // Se c'era una richiesta di annullamento per questo slot, è ora soddisfatta
    BookingStorage.fulfillPendingCancellations(booking.date, booking.time);

    // Auto-apply credit (full or partial)
    const price = SLOT_PRICES[savedBooking.slotType];
    const creditBalance = CreditStorage.getBalance(savedBooking.whatsapp, savedBooking.email);
    if (creditBalance >= price) {
        // Full payment with credit
        const allBookings = BookingStorage.getAllBookings();
        const stored = allBookings.find(b => b.id === savedBooking.id);
        if (stored) {
            stored.paid = true;
            stored.paymentMethod = 'credito';
            stored.paidAt = new Date().toISOString();
            BookingStorage.replaceAllBookings(allBookings);
        }
        CreditStorage.addCredit(
            savedBooking.whatsapp,
            savedBooking.email,
            savedBooking.name,
            -price,
            `Lezione ${savedBooking.date} ${savedBooking.time} — pagata con credito`
        );
        savedBooking.paid = true;
        savedBooking.paidWithCredit = true;
        savedBooking.remainingCredit = Math.round((creditBalance - price) * 100) / 100;
        // Apply any remaining credit to existing unpaid bookings
        if (savedBooking.remainingCredit > 0) {
            CreditStorage.applyToUnpaidBookings(savedBooking.whatsapp, savedBooking.email, savedBooking.name);
        }
    } else if (creditBalance > 0) {
        // Partial payment: use all available credit, rest remains to be paid
        const allBookings = BookingStorage.getAllBookings();
        const stored = allBookings.find(b => b.id === savedBooking.id);
        if (stored) {
            stored.creditApplied = Math.round(creditBalance * 100) / 100;
            BookingStorage.replaceAllBookings(allBookings);
        }
        CreditStorage.addCredit(
            savedBooking.whatsapp,
            savedBooking.email,
            savedBooking.name,
            -creditBalance,
            `Credito parziale lezione ${savedBooking.date} ${savedBooking.time} (€${creditBalance} su €${price})`
        );
        savedBooking.creditApplied = Math.round(creditBalance * 100) / 100;
        savedBooking.remainingCredit = 0;
    }

    // Show confirmation
    showConfirmation(savedBooking);
    notificaPrenotazione(savedBooking);

    // Reset form
    document.getElementById('bookingForm').reset();
    setLoading(submitBtn, false);

    // Refresh calendar to show updated availability
    renderCalendar();
    if (typeof renderMobileSlots === 'function' && selectedMobileDay) {
        renderMobileSlots(selectedMobileDay);
    }

    // Clear selection
    selectedSlot = null;
}

function buildCalendarDates(dateStr, timeStr) {
    const [startTime, endTime] = timeStr.split(' - ').map(t => t.trim());
    const [sH, sM] = startTime.split(':');
    const [eH, eM] = endTime.split(':');
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
    // Hide form, show confirmation inside the modal
    document.getElementById('bookingForm').style.display = 'none';
    document.getElementById('modalSlotInfo').style.display = 'none';

    const confirmationDiv = document.getElementById('confirmationMessage');
    const creditNotice = booking.paidWithCredit
        ? `<p class="credit-used-notice">💳 Pagamento coperto dal tuo credito (residuo: €${booking.remainingCredit})</p>`
        : '';
    confirmationDiv.innerHTML = `
        <h3>✓ Prenotazione ${SLOT_NAMES[booking.slotType]} Confermata!</h3>
        <p><strong>${booking.name}</strong></p>
        <p>📅 ${booking.dateDisplay} &nbsp;·&nbsp; 🕐 ${booking.time}</p>
        ${creditNotice}
        <p style="margin-top: 0.75rem; font-size: 0.85rem; opacity: 0.9;">Riceverai un promemoria WhatsApp al numero <strong>${booking.whatsapp}</strong></p>
        <div class="cal-buttons">
            <a href="${googleCalendarUrl(booking)}" target="_blank" rel="noopener" class="cal-btn cal-btn-google">
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#4285F4" d="M19 4h-1V2h-2v2H8V2H6v2H5C3.9 4 3 4.9 3 6v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"/><rect fill="#EA4335" x="7" y="12" width="2" height="2"/><rect fill="#34A853" x="11" y="12" width="2" height="2"/><rect fill="#FBBC04" x="15" y="12" width="2" height="2"/><rect fill="#34A853" x="7" y="16" width="2" height="2"/><rect fill="#4285F4" x="11" y="16" width="2" height="2"/><rect fill="#EA4335" x="15" y="16" width="2" height="2"/></svg>
                Google Calendar
            </a>
            <button onclick="downloadIcs(${JSON.stringify(booking).replace(/"/g, '&quot;')})" class="cal-btn cal-btn-apple">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
                Apple Calendar
            </button>
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
