// Calendar functionality
let currentWeekOffset = 0;
let selectedSlot = null;
let selectedMobileDay = null;

function spotsColorClass(n) {
    if (n === 1) return 'spots-red';
    if (n === 2) return 'spots-orange';
    return 'spots-dark';
}

function initCalendar() {
    renderCalendar();
    renderMobileCalendar();
    setupCalendarControls();
}

function setupCalendarControls() {
    // Desktop controls
    document.getElementById('prevWeek').addEventListener('click', () => {
        if (currentWeekOffset > 0) {
            currentWeekOffset--;
            renderCalendar();
            renderMobileCalendar();
        }
    });

    document.getElementById('nextWeek').addEventListener('click', () => {
        currentWeekOffset++;
        renderCalendar();
        renderMobileCalendar();
    });

    // Mobile controls
    const mobilePrev = document.getElementById('mobilePrevWeek');
    const mobileNext = document.getElementById('mobileNextWeek');

    if (mobilePrev) {
        mobilePrev.addEventListener('click', () => {
            if (currentWeekOffset > 0) {
                currentWeekOffset--;
                renderCalendar();
                renderMobileCalendar();
            }
        });
    }

    if (mobileNext) {
        mobileNext.addEventListener('click', () => {
            currentWeekOffset++;
            renderCalendar();
            renderMobileCalendar();
        });
    }
}

function getWeekDates(offset = 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Start from today (offset 0 = today, offset 1 = today + 7 days, etc.)
    const startDate = new Date(today);
    startDate.setDate(today.getDate() + offset * 7);

    const allDayNames = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
    const dates = [];

    for (let i = 0; i < 7; i++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + i);
        dates.push({
            date: date,
            dayName: allDayNames[date.getDay()],
            formatted: formatDate(date),
            displayDate: `${date.getDate()}/${date.getMonth() + 1}`
        });
    }

    return dates;
}

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function weekHasSlots(offset) {
    const overrides = BookingStorage.getScheduleOverrides();
    return getWeekDates(offset).some(d => overrides[d.formatted] && overrides[d.formatted].length > 0);
}

function renderCalendar() {
    BookingStorage.processPendingCancellations();
    const weekDates = getWeekDates(currentWeekOffset);
    const calendarGrid = document.getElementById('calendar');
    calendarGrid.innerHTML = '';

    // Disable "previous" button when already showing from today
    const prevBtn = document.getElementById('prevWeek');
    prevBtn.disabled = currentWeekOffset === 0;
    prevBtn.style.opacity = currentWeekOffset === 0 ? '0.3' : '1';
    prevBtn.style.cursor = currentWeekOffset === 0 ? 'not-allowed' : 'pointer';

    // Disable "next" button when the next week has no configured slots
    const nextBtn = document.getElementById('nextWeek');
    const nextHasSlots = weekHasSlots(currentWeekOffset + 1);
    nextBtn.disabled = !nextHasSlots;
    nextBtn.style.opacity = nextHasSlots ? '1' : '0.3';
    nextBtn.style.cursor = nextHasSlots ? 'pointer' : 'not-allowed';

    // Update week display
    const firstDate = weekDates[0].date;
    const lastDate = weekDates[6].date;
    document.getElementById('currentWeek').textContent =
        `${firstDate.getDate()}/${firstDate.getMonth() + 1} - ${lastDate.getDate()}/${lastDate.getMonth() + 1}/${lastDate.getFullYear()}`;

    // Create header row
    const timeHeader = createDiv('calendar-header', '');
    calendarGrid.appendChild(timeHeader);

    weekDates.forEach(dateInfo => {
        const header = createDiv('calendar-header', `
            <div>${dateInfo.dayName}</div>
            <div style="font-size: 0.85rem; opacity: 0.8;">${dateInfo.displayDate}</div>
        `);
        calendarGrid.appendChild(header);
    });

    // Create time slots rows
    TIME_SLOTS.forEach(timeSlot => {
        // Time label
        const timeLabel = createDiv('calendar-time', timeSlot);
        calendarGrid.appendChild(timeLabel);

        // Day slots
        weekDates.forEach(dateInfo => {
            const slot = createSlot(dateInfo, timeSlot);
            calendarGrid.appendChild(slot);
        });
    });
}

function createSlot(dateInfo, timeSlot) {
    const slot = document.createElement('div');
    slot.className = 'calendar-slot';

    // Only show slots that have been explicitly configured for this date
    const overrides = BookingStorage.getScheduleOverrides();
    const scheduledSlots = overrides[dateInfo.formatted] || [];
    const scheduledSlot = scheduledSlots.find(s => s.time === timeSlot);

    if (scheduledSlot) {
        const slotType = scheduledSlot.type;
        const bookings = BookingStorage.getBookingsForSlot(dateInfo.formatted, timeSlot);
        const remainingSpots = BookingStorage.getRemainingSpots(dateInfo.formatted, timeSlot, slotType);
        const maxCapacity = SLOT_MAX_CAPACITY[slotType];
        const isFull = remainingSpots <= 0;

        slot.classList.add('has-booking', slotType);
        if (isFull) {
            slot.classList.add('slot-full');
        }

        slot.innerHTML = `
            <div class="slot-type">${SLOT_NAMES[slotType]}</div>
            ${slotType !== SLOT_TYPES.GROUP_CLASS && remainingSpots > 0 ? `<div class="slot-spots ${spotsColorClass(remainingSpots)}">${remainingSpots} ${remainingSpots === 1 ? 'disponibile' : 'disponibili'}</div>` : ''}
        `;

        // Only allow booking if not full and not in the past
        const slotDate = new Date(dateInfo.date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (!isFull && slotDate >= today) {
            slot.style.cursor = 'pointer';
            slot.addEventListener('click', () => selectSlot(dateInfo, timeSlot, slotType, remainingSpots));
        } else {
            slot.style.cursor = 'not-allowed';
        }
    } else {
        slot.innerHTML = '<div style="color: #ccc; font-size: 0.85rem;">-</div>';
        slot.style.cursor = 'default';
    }

    return slot;
}

function selectSlot(dateInfo, timeSlot, slotType, remainingSpots) {
    selectedSlot = {
        date: dateInfo.formatted,
        dateDisplay: `${dateInfo.dayName} ${dateInfo.displayDate}`,
        time: timeSlot,
        slotType: slotType,
        remainingSpots: remainingSpots
    };
    openBookingModal(dateInfo, timeSlot, slotType, remainingSpots);
}

function createDiv(className, innerHTML) {
    const div = document.createElement('div');
    div.className = className;
    div.innerHTML = innerHTML;
    return div;
}

// Mobile Calendar Functions
function renderMobileCalendar() {
    const weekDates = getWeekDates(currentWeekOffset);

    // Update mobile week label
    const mobileWeekLabel = document.getElementById('mobileWeekLabel');
    if (mobileWeekLabel) {
        const first = weekDates[0].date;
        const last = weekDates[6].date;
        mobileWeekLabel.textContent = `${first.getDate()}/${first.getMonth() + 1} – ${last.getDate()}/${last.getMonth() + 1}`;
    }

    // Update mobile prev/next button states
    const mobilePrev = document.getElementById('mobilePrevWeek');
    if (mobilePrev) {
        mobilePrev.disabled = currentWeekOffset === 0;
        mobilePrev.style.opacity = currentWeekOffset === 0 ? '0.3' : '1';
        mobilePrev.style.cursor  = currentWeekOffset === 0 ? 'not-allowed' : 'pointer';
    }

    const mobileNext = document.getElementById('mobileNextWeek');
    if (mobileNext) {
        const nextHasSlots = weekHasSlots(currentWeekOffset + 1);
        mobileNext.disabled = !nextHasSlots;
        mobileNext.style.opacity = nextHasSlots ? '1' : '0.3';
        mobileNext.style.cursor  = nextHasSlots ? 'pointer' : 'not-allowed';
    }

    // Set selected day BEFORE rendering the selector so active class is applied correctly
    selectedMobileDay = weekDates[0];
    renderMobileDaySelector(weekDates);
    renderMobileSlots(selectedMobileDay);
}

function renderMobileDaySelector(weekDates) {
    const selector = document.getElementById('mobileDaySelector');
    selector.innerHTML = '';

    const monthNames = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
    // Index by actual JS day (0=Sun,1=Mon,...) so it works regardless of start day
    const dayNamesShort = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];

    weekDates.forEach((dateInfo) => {
        const dayCard = document.createElement('div');
        dayCard.className = 'mobile-day-card';

        if (selectedMobileDay && selectedMobileDay.formatted === dateInfo.formatted) {
            dayCard.classList.add('active');
        }

        dayCard.innerHTML = `
            <div class="mobile-day-name">${dayNamesShort[dateInfo.date.getDay()]}</div>
            <div class="mobile-day-date">${dateInfo.date.getDate()}</div>
            <div class="mobile-day-month">${monthNames[dateInfo.date.getMonth()]}</div>
        `;

        dayCard.addEventListener('click', () => {
            selectedMobileDay = dateInfo;
            document.querySelectorAll('.mobile-day-card').forEach(card => card.classList.remove('active'));
            dayCard.classList.add('active');
            renderMobileSlots(dateInfo);
        });

        selector.appendChild(dayCard);
    });
}

function renderMobileSlots(dateInfo) {
    const slotsList = document.getElementById('mobileSlotsList');
    slotsList.innerHTML = '';

    const overrides = BookingStorage.getScheduleOverrides();
    const scheduledSlots = overrides[dateInfo.formatted] || [];

    if (scheduledSlots.length === 0) {
        slotsList.innerHTML = '<div style="text-align: center; color: #999; padding: 2rem;">Nessuna lezione programmata per questo giorno</div>';
        return;
    }

    scheduledSlots.forEach(scheduledSlot => {
        const remainingSpots = BookingStorage.getRemainingSpots(dateInfo.formatted, scheduledSlot.time, scheduledSlot.type);
        if (remainingSpots <= 0) return;
        const slotCard = createMobileSlotCard(dateInfo, scheduledSlot);
        slotsList.appendChild(slotCard);
    });
}

function createMobileSlotCard(dateInfo, scheduledSlot) {
    const slotCard = document.createElement('div');
    slotCard.className = `mobile-slot-card ${scheduledSlot.type}`;

    const timeSlot = scheduledSlot.time;
    const slotType = scheduledSlot.type;
    const bookings = BookingStorage.getBookingsForSlot(dateInfo.formatted, timeSlot);
    const remainingSpots = BookingStorage.getRemainingSpots(dateInfo.formatted, timeSlot, slotType);
    const maxCapacity = SLOT_MAX_CAPACITY[slotType];
    const isFull = remainingSpots <= 0;

    if (isFull) {
        slotCard.classList.add('slot-full');
    }

    slotCard.innerHTML = `
        <div class="mobile-slot-header">
            <span class="mobile-slot-time">🕐 ${timeSlot}</span>
            ${slotType !== SLOT_TYPES.GROUP_CLASS ? `<span class="mobile-slot-available ${spotsColorClass(remainingSpots)}">${remainingSpots} ${remainingSpots === 1 ? 'disponibile' : 'disponibili'}</span>` : ''}
        </div>
        <div class="mobile-slot-type">${SLOT_NAMES[slotType]}</div>
    `;

    // Check if slot is in the past
    const slotDate = new Date(dateInfo.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!isFull && slotDate >= today) {
        slotCard.addEventListener('click', () => {
            selectMobileSlot(dateInfo, timeSlot, slotType, remainingSpots, slotCard);
        });
    } else {
        slotCard.style.cursor = 'not-allowed';
    }

    return slotCard;
}

function selectMobileSlot(dateInfo, timeSlot, slotType, remainingSpots, slotCard) {
    selectedSlot = {
        date: dateInfo.formatted,
        dateDisplay: `${dateInfo.dayName} ${dateInfo.displayDate}`,
        time: timeSlot,
        slotType: slotType,
        remainingSpots: remainingSpots
    };
    openBookingModal(dateInfo, timeSlot, slotType, remainingSpots);
}

// Initialize calendar when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCalendar);
} else {
    initCalendar();
}
