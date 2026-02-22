// Booking form / modal functionality

function initBookingForm() {
    const form = document.getElementById('bookingForm');
    form.addEventListener('submit', handleBookingSubmit);

    // Close modal on Escape key
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeBookingModal();
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
    document.getElementById('bookingForm').style.display = 'flex';
    document.getElementById('confirmationMessage').style.display = 'none';

    // Pre-fill if user is logged in
    const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    if (user) {
        document.getElementById('name').value    = user.name  || '';
        document.getElementById('email').value   = user.email || '';
    }

    // Show modal
    document.getElementById('bookingModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeBookingModal() {
    document.getElementById('bookingModal').style.display = 'none';
    document.body.style.overflow = '';
    selectedSlot = null;
}

function handleModalOverlayClick(e) {
    if (e.target === document.getElementById('bookingModal')) {
        closeBookingModal();
    }
}

function handleBookingSubmit(e) {
    e.preventDefault();

    if (!selectedSlot) {
        alert('Per favore seleziona uno slot dal calendario prima di prenotare.');
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
        alert('Per favore compila tutti i campi obbligatori.');
        return;
    }

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
        alert('Per favore inserisci un indirizzo email valido.');
        return;
    }

    // Validate phone (basic check)
    const phoneRegex = /[\d\s+()-]{10,}/;
    if (!phoneRegex.test(formData.whatsapp)) {
        alert('Per favore inserisci un numero WhatsApp valido.');
        return;
    }

    // Check if slot is still available
    const remainingSpots = BookingStorage.getRemainingSpots(
        selectedSlot.date,
        selectedSlot.time,
        selectedSlot.slotType
    );

    if (remainingSpots <= 0) {
        alert('Spiacenti, questo slot è ora completo. Per favore seleziona un altro orario.');
        renderCalendar(); // Refresh calendar
        return;
    }

    // Create booking
    const booking = {
        ...formData,
        date: selectedSlot.date,
        time: selectedSlot.time,
        slotType: selectedSlot.slotType,
        dateDisplay: selectedSlot.dateDisplay
    };

    // Save booking
    BookingStorage.saveBooking(booking);

    // Show confirmation
    showConfirmation(booking);

    // Reset form
    document.getElementById('bookingForm').reset();

    // Refresh calendar to show updated availability
    renderCalendar();

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
    confirmationDiv.innerHTML = `
        <h3>✓ Prenotazione ${SLOT_NAMES[booking.slotType]} Confermata!</h3>
        <p><strong>${booking.name}</strong></p>
        <p>📅 ${booking.dateDisplay} &nbsp;·&nbsp; 🕐 ${booking.time}</p>
        <p style="margin-top: 0.75rem; font-size: 0.85rem; opacity: 0.9;">Riceverai un promemoria WhatsApp al numero <strong>${booking.whatsapp}</strong></p>
        <div class="cal-buttons">
            <a href="${googleCalendarUrl(booking)}" target="_blank" rel="noopener" class="cal-btn cal-btn-google">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>
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

// Initialize booking form when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBookingForm);
} else {
    initBookingForm();
}
