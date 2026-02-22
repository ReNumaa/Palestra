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
    spotsEl.textContent = `Posti disponibili: ${remainingSpots}`;
    spotsEl.style.color = remainingSpots <= 2 ? 'var(--warning)' : 'var(--success)';

    // Reset form and hide confirmation
    document.getElementById('bookingForm').reset();
    document.getElementById('bookingForm').style.display = 'flex';
    document.getElementById('confirmationMessage').style.display = 'none';

    // Show modal
    document.getElementById('bookingModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Focus first input
    setTimeout(() => document.getElementById('name').focus(), 100);
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

function showConfirmation(booking) {
    // Hide form, show confirmation inside the modal
    document.getElementById('bookingForm').style.display = 'none';
    document.getElementById('modalSlotInfo').style.display = 'none';

    const confirmationDiv = document.getElementById('confirmationMessage');
    confirmationDiv.innerHTML = `
        <h3>✓ Prenotazione Confermata!</h3>
        <p><strong>${booking.name}</strong></p>
        <p>📅 ${booking.dateDisplay} &nbsp;·&nbsp; 🕐 ${booking.time}</p>
        <p>${SLOT_NAMES[booking.slotType]}</p>
        <p style="margin-top: 1rem; font-size: 0.9rem; opacity: 0.9;">Riceverai un promemoria WhatsApp al numero <strong>${booking.whatsapp}</strong></p>
    `;
    confirmationDiv.style.display = 'block';

    // Auto-close modal after 4 seconds
    setTimeout(() => {
        closeBookingModal();
        document.getElementById('modalSlotInfo').style.display = '';
    }, 4000);
}

// Initialize booking form when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBookingForm);
} else {
    initBookingForm();
}
