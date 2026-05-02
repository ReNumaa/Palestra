// Admin Calendar Functions
function setupAdminCalendar() {
    renderAdminCalendar();

    document.getElementById('adminPrevWeek').addEventListener('click', () => {
        adminWeekOffset--;
        if (adminWeekOffset === 0) selectedAdminDay = null;
        renderAdminCalendar();
    });

    document.getElementById('adminNextWeek').addEventListener('click', () => {
        adminWeekOffset++;
        if (adminWeekOffset === 0) selectedAdminDay = null;
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

    // Update week display: "27 apr — 3 mag" + sotto "MAGGIO 2026"
    const firstDate = weekDates[0].date;
    const lastDate = weekDates[6].date;
    const M_SHORT = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
    const M_FULL  = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
    const range = `${firstDate.getDate()} ${M_SHORT[firstDate.getMonth()]} — ${lastDate.getDate()} ${M_SHORT[lastDate.getMonth()]}`;
    document.getElementById('adminCurrentWeek').textContent = range;
    const monthEl = document.getElementById('adminCurrentMonth');
    if (monthEl) {
        // Sottotitolo: usa il mese del giorno selezionato (o ultimo della settimana)
        const refDate = selectedAdminDay?.date || lastDate;
        monthEl.textContent = `${M_FULL[refDate.getMonth()].toUpperCase()} ${refDate.getFullYear()}`;
    }
}

// Capacità giornaliera totale (somma dei posti effettivi di tutti gli slot
// programmati per il giorno) → usata per il riempimento della barra occupazione
// nelle day-card. Conservativo: restituisce 0 se non riusciamo a calcolarlo.
function _adminDayCapacity(dateInfo) {
    try {
        if (typeof getScheduleForDate !== 'function' || typeof BookingStorage?.getEffectiveCapacity !== 'function') return 0;
        const slots = getScheduleForDate(dateInfo.formatted, dateInfo.dayName) || [];
        let total = 0;
        for (const s of slots) {
            const cap = BookingStorage.getEffectiveCapacity(dateInfo.formatted, s.time, s.type) || 0;
            total += cap;
        }
        return total;
    } catch { return 0; }
}

function renderAdminDaySelector(_weekDates) {
    const selector = document.getElementById('adminDaySelector');
    selector.innerHTML = '';
    const todayFormatted = formatAdminDate(new Date());

    // Render 3 settimane: prev / current / next centrate sull'offset attuale.
    // Lo scroll-snap orizzontale permette swipe destra/sinistra per cambiare
    // settimana; quando lo snap atterra su una pagina esterna aggiorniamo
    // adminWeekOffset e ri-renderiamo (la nuova settimana torna al centro).
    [-1, 0, 1].forEach(off => {
        const weekDates = getAdminWeekDates(adminWeekOffset + off);
        const pageEl = document.createElement('div');
        pageEl.className = 'admin-week-page';
        pageEl.dataset.relOffset = String(off);

        weekDates.forEach(dateInfo => {
            const bookings = BookingStorage.getAllBookings();
            const dayBookings = bookings.filter(b => b.date === dateInfo.formatted && b.status !== 'cancelled' && !b.id?.startsWith('_avail_'));
            const dayBookingsCount = dayBookings.length;
            const dayCapacity = _adminDayCapacity(dateInfo);
            const fillPct = dayCapacity > 0 ? Math.min(100, Math.round(dayBookingsCount * 100 / dayCapacity)) : 0;

            const dayCard = document.createElement('div');
            dayCard.className = 'admin-day-card';

            if (dateInfo.formatted === todayFormatted) {
                dayCard.classList.add('is-today');
            }
            if (selectedAdminDay && selectedAdminDay.formatted === dateInfo.formatted) {
                dayCard.classList.add('active');
            }

            const shortName = dateInfo.dayName.slice(0, 3);
            dayCard.innerHTML = `
                <div class="admin-day-name"><span class="day-full">${dateInfo.dayName}</span><span class="day-short">${shortName}</span></div>
                <div class="admin-day-date">${dateInfo.date.getDate()}</div>
                <div class="admin-day-occ" aria-hidden="true"><div class="admin-day-occ-fill" style="width:${fillPct}%"></div></div>
            `;

            dayCard.addEventListener('click', () => {
                selectedAdminDay = dateInfo;
                document.querySelectorAll('.admin-day-card').forEach(card => card.classList.remove('active'));
                dayCard.classList.add('active');
                renderAdminDayView(dateInfo);
            });

            pageEl.appendChild(dayCard);
        });

        selector.appendChild(pageEl);
    });

    // Centra la pagina corrente (middle) e attacca handler swipe una sola volta.
    requestAnimationFrame(() => {
        const w = selector.clientWidth;
        if (w > 0) {
            // Disabilita lo smooth scroll su questo reset programmatico
            const prev = selector.style.scrollBehavior;
            selector.style.scrollBehavior = 'auto';
            selector.scrollLeft = w;
            selector.style.scrollBehavior = prev || '';
        }
    });

    if (!selector._swipeHandlerAttached) {
        selector._swipeHandlerAttached = true;
        let scrollTimer = null;
        selector.addEventListener('scroll', () => {
            clearTimeout(scrollTimer);
            scrollTimer = setTimeout(() => {
                const pageWidth = selector.clientWidth;
                if (!pageWidth) return;
                const idx = Math.round(selector.scrollLeft / pageWidth);
                if (idx === 1) return; // gia' centrato
                const delta = idx - 1; // -1 prev, +1 next
                adminWeekOffset += delta;
                if (adminWeekOffset === 0) selectedAdminDay = null;
                renderAdminCalendar();
            }, 180);
        });
    }
}

// ── Extra spot management ──────────────────────────────────────────────────

function toggleExtraPicker(date, time) {
    const id = 'xpick-' + date + '-' + time.replace(/[: -]/g, '');
    const el = document.getElementById(id);
    if (!el) return;
    const opening = el.style.display === 'none' || el.style.display === '';
    if (opening && el._initialHtml) {
        // Ripristina il contenuto iniziale (bottoni) se prima era in modalita'
        // ricerca cliente — cosi' alla riapertura mostra sempre la lista bottoni.
        el.innerHTML = el._initialHtml;
    }
    el.style.display = opening ? 'flex' : 'none';
    document.body.classList.toggle('extra-picker-open', opening);
}

function addExtraSpotToSlot(date, time, extraType) {
    BookingStorage.addExtraSpot(date, time, extraType);
    toggleExtraPicker(date, time); // chiudi picker
    if (window._currentAdminDate) renderAdminDayView(window._currentAdminDate);
}

// ── Admin: prenota per un cliente specifico ────────────────────────────────
// Stato picker (evita JSON inline negli onclick che causa SyntaxError).
// forcedSlotType: se settato (es. 'group-class'), salta la scelta tra tipi
// e conferma direttamente quel tipo (usato da "Slot prenotato").
let _clientPickerState = { date: '', time: '', client: null, forcedSlotType: null };

function openClientBookingPicker(date, time, pickerId) {
    const picker = document.getElementById(pickerId);
    if (!picker) return;
    _clientPickerState.date = date;
    _clientPickerState.time = time;
    _clientPickerState.client = null;
    _clientPickerState.forcedSlotType = null;

    picker.innerHTML = `
        <div class="extra-picker-content" onclick="event.stopPropagation()">
            <div class="extra-picker-title">Aggiungi una prenotazione</div>
            <div style="display:flex;gap:8px;align-items:center">
                <input id="clientSearchInput" type="text" placeholder="Cerca cliente…"
                    autocomplete="off"
                    style="flex:1;padding:9px 12px;border:1px solid #e2e8f0;border-radius:10px;font-size:14px">
                <button onclick="toggleExtraPicker('${date}','${time}')"
                    style="background:#f1f5f9;border:none;color:#475569;cursor:pointer;font-size:18px;padding:6px 10px;border-radius:8px;line-height:1">✕</button>
            </div>
            <div id="clientSearchResults" style="display:flex;flex-direction:column;gap:6px;max-height:240px;overflow-y:auto"></div>
            <div id="clientBookingConfirm" style="display:none"></div>
        </div>
    `;

    document.getElementById('clientSearchInput').addEventListener('input', function() {
        _filterClientList(this.value);
    });
}

// Apre lo stesso picker cliente forzando "Slot prenotato" (group-class):
// dopo la selezione cliente mostrerà direttamente "Conferma", senza chiedere
// il tipo lezione. Se lo slot ha già 1 persona, creerà il 2° booking e
// imposterà custom_price=15 su entrambi (slot condiviso).
function openClientBookingPickerForSlotPrenotato(date, time, pickerId) {
    openClientBookingPicker(date, time, pickerId);
    _clientPickerState.forcedSlotType = SLOT_TYPES.GROUP_CLASS;
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

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';

    const forced = _clientPickerState.forcedSlotType;
    if (forced === SLOT_TYPES.GROUP_CLASS) {
        // Flusso "Slot prenotato": un solo bottone Conferma (rosso come il badge)
        const btnOK = document.createElement('button');
        btnOK.className = 'extra-picker-btn';
        btnOK.style.cssText = 'background:#ef4444;color:#fff;border-color:#ef4444';
        btnOK.textContent = 'Conferma Slot prenotato';
        btnOK.addEventListener('click', () => bookForClient(SLOT_TYPES.GROUP_CLASS));
        btnRow.appendChild(btnOK);
    } else {
        const btnAut = document.createElement('button');
        btnAut.className = 'extra-picker-btn personal-training';
        btnAut.textContent = 'Autonomia';
        btnAut.addEventListener('click', () => bookForClient('personal-training'));

        const btnGrp = document.createElement('button');
        btnGrp.className = 'extra-picker-btn small-group';
        btnGrp.textContent = 'Lezione di Gruppo';
        btnGrp.addEventListener('click', () => bookForClient('small-group'));

        btnRow.appendChild(btnAut);
        btnRow.appendChild(btnGrp);
    }
    btnRow.appendChild(btnBack);

    confirmEl.innerHTML = `
        <div style="font-size:13px;margin-bottom:8px">
            <strong>${_escHtml(client.name)}</strong>
            <span style="color:#888;font-size:11px"> · ${_escHtml(client.email || client.whatsapp || '')}</span>
        </div>
    `;
    confirmEl.appendChild(btnRow);
}

async function bookForClient(slotType) {
    console.log('[bookForClient] start', { slotType, state: _clientPickerState });
    // Guard: sessione admin deve essere attiva (il backend verifica is_admin() sulle RPC)
    if (sessionStorage.getItem('adminAuth') !== 'true') {
        console.warn('[bookForClient] admin session expired');
        showToast('Sessione admin scaduta. Ricarica la pagina e accedi di nuovo.', 'error');
        return;
    }
    const { date, time, client } = _clientPickerState;
    if (!client) {
        console.warn('[bookForClient] no client in picker state');
        showToast('Seleziona prima un cliente dalla lista.', 'error');
        return;
    }

    // Cerca user_id del cliente in Supabase (per reminders push)
    let clientUserId = null;
    if (typeof supabaseClient !== 'undefined' && client.email) {
        try {
            const { data: prof } = await _queryWithTimeout(supabaseClient
                .from('profiles').select('id').eq('email', (client.email || '').toLowerCase()).maybeSingle());
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

    // ── Caso speciale: "Slot prenotato" con 1 cliente già presente → slot condiviso ─
    // Creiamo il 2° booking bypassando addExtraSpot (la base di group-class resta 0)
    // e impostiamo custom_price=15 su entrambi. Con nessuno prenotato il flusso è
    // quello standard (group-class a 30€).
    // IMPORTANTE: includiamo anche 'cancellation_requested' perché la RPC
    // book_slot_atomic li conta nella capacità (count < p_max_capacity).
    const existingGC = slotType === SLOT_TYPES.GROUP_CLASS
        ? BookingStorage.getBookingsForSlot(date, time)
              .filter(b => (b.status === 'confirmed' || b.status === 'cancellation_requested')
                         && b.slotType === SLOT_TYPES.GROUP_CLASS)
        : [];
    const isSharedFlow = slotType === SLOT_TYPES.GROUP_CLASS && existingGC.length >= 1;
    console.log('[bookForClient] existingGC.length =', existingGC.length, 'isSharedFlow =', isSharedFlow);

    if (isSharedFlow) {
        if (existingGC.length >= 2) {
            console.warn('[bookForClient] slot già pieno con 2 persone');
            showToast('Slot pieno: già 2 persone prenotate.', 'error');
            return;
        }
        if (typeof supabaseClient === 'undefined') {
            showToast('Offline — impossibile creare la prenotazione ora.', 'error');
            return;
        }
        const other = existingGC[0];
        booking.id        = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        booking.createdAt = new Date().toISOString();
        booking.status    = 'confirmed';

        const rpcArgs = {
            p_local_id:     booking.id,
            p_user_id:      clientUserId || null,
            p_date:         booking.date,
            p_time:         booking.time,
            p_slot_type:    booking.slotType,
            p_max_capacity: existingGC.length + 1,
            p_name:         booking.name,
            p_email:        booking.email,
            p_whatsapp:     booking.whatsapp,
            p_notes:        booking.notes || '',
            p_created_at:   booking.createdAt,
            p_date_display: booking.dateDisplay || ''
        };
        console.log('[bookForClient shared] RPC book_slot_atomic args:', rpcArgs);
        let data, error;
        try {
            const res = await _rpcWithTimeout(supabaseClient.rpc('book_slot_atomic', rpcArgs));
            data  = res.data;
            error = res.error;
        } catch (e) {
            console.error('[bookForClient shared] RPC timeout/throw:', e);
            showToast('⚠️ Server non risponde (timeout). Riprova o ricarica la pagina.', 'error', 6000);
            return;
        }
        console.log('[bookForClient shared] RPC result:', { data, error });
        if (error || !data || !data.success) {
            const msg = (data && data.error) || (error && error.message) || 'Errore sconosciuto';
            console.error('[bookForClient shared] RPC failure:', msg);
            showToast('⚠️ Prenotazione non riuscita: ' + msg, 'error');
            return;
        }
        booking._sbId       = data.booking_id || null;
        booking.customPrice = 15;
        BookingStorage._cache.push(booking);
        BookingStorage.updateStats(booking);

        // Imposta custom_price=15 su entrambi (nuovo + esistente) via RPC admin
        // (necessario: la tabella bookings non ha policy UPDATE per authenticated).
        // Se l'esistente era già pagato con denaro/credito, gli rimborsa €15
        // sul balance con entry credit_history hidden=true (silenzioso: nessuna
        // riga in registro; il booking_paid mostrerà €15 grazie a custom_price).
        try {
            const rpcs = [];
            if (booking._sbId) {
                rpcs.push(_rpcWithTimeout(supabaseClient.rpc('admin_set_booking_custom_price', {
                    p_booking_id: booking._sbId, p_price: 15
                })));
            }
            if (other._sbId) {
                rpcs.push(_rpcWithTimeout(supabaseClient.rpc('admin_set_booking_custom_price', {
                    p_booking_id: other._sbId, p_price: 15
                })));
            }
            const results = await Promise.all(rpcs);
            const failed = results.find(r => r.error || (r.data && r.data.success === false));
            if (failed) throw new Error(failed.error?.message || 'RPC fallita');
            // Allinea cache locale
            const oIdx = BookingStorage._cache.findIndex(b => b.id === other.id);
            if (oIdx !== -1) BookingStorage._cache[oIdx].customPrice = 15;

            // Rimborso silenzioso €15 all'esistente se aveva già pagato (non gratis)
            const otherWasPaid = other.paid
                && other._sbId
                && (other.paymentMethod || '') !== 'lezione-gratuita'
                && (other.paymentMethod || '') !== '';
            if (otherWasPaid) {
                const { data: rd, error: re } = await _rpcWithTimeout(
                    supabaseClient.rpc('admin_refund_shared_slot_hidden', {
                        p_booking_id: other._sbId, p_amount: 15
                    })
                );
                if (re || (rd && !rd.success)) {
                    console.warn('[bookForClient shared] rimborso silenzioso fallito:', re || rd);
                } else if (Number(rd?.refunded || 0) > 0 && typeof CreditStorage?.syncFromSupabase === 'function') {
                    await CreditStorage.syncFromSupabase();
                }
            }
        } catch (e) {
            console.warn('[bookForClient shared] update custom_price fallito:', e);
            showToast('⚠️ Prenotazione creata ma prezzo condiviso non applicato: verifica.', 'error', 6000);
        }

        BookingStorage.fulfillPendingCancellations(date, time);
        showToast(`Slot condiviso: ${client.name} + ${other.name} · 15€ cad.`, 'success');
        invalidateStatsCache();
        if (window._currentAdminDate) renderAdminDayView(window._currentAdminDate);
        return;
    }

    // ── Flusso standard (Autonomia / Lezione di Gruppo / 1° cliente group-class) ──
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
    if (BookingBadgesStorage.getShowCert()) {
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
    }

    // Anagrafica incompleta (CF, indirizzo)
    let cfBadge = '';
    if (BookingBadgesStorage.getShowAnag()) {
        const anagMissing = !hasCF || !userRecord?.indirizzoVia || !userRecord?.indirizzoPaese || !userRecord?.indirizzoCap;
        if (anagMissing) {
            cfBadge = `<div class="cert-expired-badge cert-expired-badge--clickable" style="background:#fef3c7;border-color:#fde68a;color:#92400e;border-left:3px solid #f59e0b" onclick="openEditClientPopup(0,'${waE}','${emE}','${nmE2}')">📋 Completa anagrafica</div>`;
        }
    }

    // Documento firmato
    let docBadge = '';
    if (BookingBadgesStorage.getShowDoc() && !userRecord?.documentoFirmato) {
        docBadge = `<div class="cert-expired-badge cert-expired-badge--clickable" onclick="openEditClientPopup(0,'${waE}','${emE}','${nmE2}')">📝 Documento non firmato</div>`;
    }

    let assicBadge = '';
    if (BookingBadgesStorage.getShowAssic()) {
        if (!assicScad) {
            assicBadge = `<div class="cert-expired-badge cert-expired-badge--clickable" style="background:#fef3c7;border-color:#fde68a;color:#92400e;border-left:3px solid #f59e0b" onclick="openAssicModal(this,'${emE}','${waE}','${nmE2}')">📋 Imposta Assicurazione</div>`;
        } else if (assicScad < _todayStr) {
            const [ay, am, ad] = assicScad.split('-');
            assicBadge = `<div class="cert-expired-badge cert-expired-badge--clickable" onclick="openAssicModal(this,'${emE}','${waE}','${nmE2}')">📋 Assic. scaduta il ${ad}/${am}/${ay}</div>`;
        } else if (assicScad <= _today30Str) {
            const [ay, am, ad] = assicScad.split('-');
            assicBadge = `<div class="cert-expired-badge cert-expired-badge--clickable" style="background:#fffbeb;border-color:#fde68a;color:#92400e;border-left:3px solid #f59e0b" onclick="openAssicModal(this,'${emE}','${waE}','${nmE2}')">⏳ Assic. scade il ${ad}/${am}/${ay}</div>`;
        }
    }
    const wa  = booking.whatsapp.replace(/'/g, "\\'");
    const em  = booking.email.replace(/'/g, "\\'");
    const nm  = booking.name.replace(/'/g, "\\'");
    const initials = _participantInitials(booking.name);
    const avatarHue = _participantAvatarHue(booking.name);
    return `
        <div class="admin-participant-card${isCancelPending ? ' cancel-pending' : ''}">
            <button class="btn-delete-booking" onclick="deleteBooking('${booking.id}','${nm}')">✕</button>
            <div class="participant-card-content">
                <div class="participant-row">
                    <div class="participant-avatar" data-hue="${avatarHue}">${initials}</div>
                    <div class="participant-row-main">
                        <div class="participant-name">${_escHtml(booking.name)} ${_pushIcon(userRecord)}</div>
                        ${cancelPendingBadge}
                        ${hasDebts ? `<div class="debt-warning" onclick="openDebtPopup('${wa}','${em}','${nm}')">⚠️ Da pagare: €${unpaidAmount}</div>` : ''}
                        ${!isCancelPending && isPaid ? `<div class="payment-status paid">✓ Pagato</div>` : ''}
                    </div>
                </div>
                ${certBadge}${cfBadge}${assicBadge}${docBadge}
                ${booking.notes ? `<div class="participant-notes">📝 ${_escHtml(booking.notes)}</div>` : ''}
            </div>
        </div>`;
}

// Helper: iniziali per avatar partecipante (max 2 lettere maiuscole)
function _participantInitials(name) {
    if (!name) return '?';
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Helper: hue stabile dal nome → 6 varianti colore avatar
function _participantAvatarHue(name) {
    const s = String(name || '');
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h % 6;
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

    // Reconcile crediti: gestito da pg_cron (ogni minuto) + wrapper on-load in admin.html.
    // Nessuna RPC qui per evitare fan-out N-chiamate ad ogni click giorno.

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
            // Espandi lo slot corrente + persisti lo stato (sopravvive ai re-render)
            card.classList.add('is-expanded');
            const dateInfo = window._currentAdminDate;
            if (dateInfo?.formatted && text && typeof _expandedAdminSlots !== 'undefined') {
                _expandedAdminSlots.add(`${dateInfo.formatted}|${text}`);
            }
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
    // capStr (testo "X/Y posti") e showPips (barre colorate): tutti i tipi
    // tranne 'cleaning'. Group-class: base capacity=0 → mostra almeno 1 posto
    // quando vuoto, e per uno shared (2 prenotazioni) sempre 2 pips rossi
    // anche se l'extra capacity non riflette ancora il count effettivo.
    const showPips = mainType !== 'cleaning';
    let displayCap;
    if (mainType === 'group-class') {
        displayCap = Math.max(mainEffCap, mainConfirmed, 1);
    } else {
        displayCap = mainEffCap;
    }

    // Capacita' e prenotati TOTALI dello slot (main + tutti gli extra di
    // tipo diverso). Es. shared (2 group-class) + 1 autonomia → 3/3.
    let totalCap = displayCap;
    for (const t of extraTypes) {
        totalCap += BookingStorage.getEffectiveCapacity(date, timeSlot, t) || 0;
    }
    const totalConfirmed = realBookings.filter(b => b.status === 'confirmed').length;

    const slotsLabel = totalCap === 1 ? 'posto' : 'posti';
    const capStr = (mainType !== 'cleaning' && totalCap > 0)
        ? `${totalConfirmed}/${totalCap} ${slotsLabel}`
        : '';

    // Pips: prima quelli del tipo principale (colore del tipo), poi quelli
    // di ogni tipo extra (es. small-group con +1 Autonomia → 5 gialli + 1 verde).
    const pipParts = [];
    if (showPips && displayCap > 0) {
        for (let i = 0; i < displayCap; i++) {
            pipParts.push(`<span class="pip ${_pipTypeClass(mainType)}${i < mainConfirmed ? '' : ' empty'}"></span>`);
        }
    }
    for (const t of extraTypes) {
        const ec = BookingStorage.getEffectiveCapacity(date, timeSlot, t);
        const eConf = realBookings.filter(b => b.slotType === t && b.status === 'confirmed').length;
        for (let i = 0; i < ec; i++) {
            pipParts.push(`<span class="pip ${_pipTypeClass(t)}${i < eConf ? '' : ' empty'}"></span>`);
        }
    }
    const capPipsHTML = pipParts.length > 0 && pipParts.length <= 12
        ? `<div class="admin-slot-pips" aria-hidden="true">${pipParts.join('')}</div>`
        : '';
    const pickerId = 'xpick-' + date + '-' + timeSlot.replace(/[: -]/g, '');

    // Conteggio booking "slot prenotato" attivi → opzione disponibile solo
    // quando lo slot è group-class e c'è già 1 o 0 persone (max 2 totale).
    const groupClassActiveCount = allBookings.filter(b =>
        (b.status === 'confirmed' || b.status === 'cancellation_requested')
        && b.slotType === SLOT_TYPES.GROUP_CLASS
    ).length;
    const isSharedSlot    = mainType === SLOT_TYPES.GROUP_CLASS && groupClassActiveCount >= 2;
    const canAddSlotPren  = mainType === SLOT_TYPES.GROUP_CLASS && groupClassActiveCount === 1;
    // In split view il "Slot condiviso · 15€ cad." sostituisce il titolo
    // della colonna group-class, quindi non mostriamo anche il badge in alto.
    const sharedBadgeHTML = (isSharedSlot && !hasMixedExtras)
        ? `<div class="admin-shared-badge">Slot condiviso · 15€ cad.</div>`
        : '';
    const slotPrenBtnHTML = canAddSlotPren
        ? `<button class="extra-picker-btn" style="background:#ef4444;color:#fff;border-color:#ef4444" onclick="openClientBookingPickerForSlotPrenotato('${dE}','${tE}','${pickerId}')">Slot prenotato</button>`
        : '';

    const headerHTML = `
        <div class="admin-slot-header">
            <div class="admin-slot-time">🕐 ${timeSlot}</div>
            ${capStr ? `<div class="admin-slot-capacity">${capStr}</div>` : ''}
            ${capPipsHTML}
            <span class="admin-slot-chev" aria-hidden="true"></span>
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

    // Riga "info": extras-bar (se presente) + bottone "+" sulla stessa riga,
    // con il "+" sempre allineato a destra. Quando non ci sono extras, il "+"
    // resta da solo a destra.
    const infoRowHTML = `
        <div class="admin-slot-info-row">
            ${extrasBarHTML}
            <button class="btn-add-extra" onclick="event.stopPropagation(); toggleExtraPicker('${dE}','${tE}')" title="Aggiungi posto extra" aria-label="Aggiungi posto">＋</button>
        </div>`;

    // Picker modal: posizionato fixed → la posizione DOM non conta.
    const pickerHTML = `
        <div id="${pickerId}" class="extra-picker" style="display:none;" onclick="toggleExtraPicker('${dE}','${tE}')">
            <div class="extra-picker-content" onclick="event.stopPropagation()">
                <div class="extra-picker-title">Aggiungi posto allo slot</div>
                <button class="extra-picker-btn personal-training" onclick="addExtraSpotToSlot('${dE}','${tE}','personal-training')">Autonomia</button>
                <button class="extra-picker-btn small-group" onclick="addExtraSpotToSlot('${dE}','${tE}','small-group')">Lezione di Gruppo</button>
                ${slotPrenBtnHTML}
                <button class="extra-picker-btn" style="background:#6c5ce7;color:#fff" onclick="openClientBookingPicker('${dE}','${tE}','${pickerId}')">Persona</button>
                <button class="extra-picker-cancel" onclick="toggleExtraPicker('${dE}','${tE}')">Annulla</button>
            </div>
        </div>`;

    // ── Participants ─────────────────────────────────────────────────────────
    let participantsHTML;
    if (!hasMixedExtras) {
        // Vista unificata (nessun extra o solo extra dello stesso tipo)
        const mainBookings = realBookings.filter(b => !b.slotType || b.slotType === mainType);
        participantsHTML = _buildParticipantsSection(mainBookings);
    } else {
        // Vista divisa in colonne
        const mainBookings = realBookings.filter(b => !b.slotType || b.slotType === mainType);
        // Per group-class shared, il titolo della colonna sostituisce sia
        // "Slot prenotato" sia il badge separato "Slot condiviso · 15€ cad."
        const leftColLabel = (isSharedSlot && mainType === SLOT_TYPES.GROUP_CLASS)
            ? 'Slot condiviso · 15€ cad.'
            : SLOT_NAMES[mainType];
        const leftCol = `
            <div class="split-column">
                <div class="split-col-title ${mainType}">${leftColLabel}</div>
                ${_buildParticipantsSection(mainBookings)}
            </div>`;
        const rightCols = extraTypes.map(t => {
            const eb = realBookings.filter(b => b.slotType === t);
            const ec = BookingStorage.getEffectiveCapacity(date, timeSlot, t);
            const eConf = eb.filter(b => b.status === 'confirmed').length;
            return `
                <div class="split-col-divider-v"></div>
                <div class="split-column">
                    <div class="split-col-title ${t}">${SLOT_NAMES[t]} ${eConf}/${ec}</div>
                    ${_buildParticipantsSection(eb)}
                </div>`;
        }).join('');
        participantsHTML = `<div class="admin-slot-split">${leftCol}${rightCols}</div>`;
    }

    slotCard.innerHTML = headerHTML
        + `<div class="admin-slot-body">${sharedBadgeHTML}${infoRowHTML}${pickerHTML}${participantsHTML}</div>`;

    // Salva il contenuto iniziale del picker (modal con bottoni) per poterlo
    // ripristinare quando la modalita' "ricerca cliente" viene chiusa.
    const pickerEl = slotCard.querySelector('.extra-picker');
    if (pickerEl) pickerEl._initialHtml = pickerEl.innerHTML;

    // Stato collapse/expand: ripristina dallo stato globale (sopravvive ai re-render)
    const slotKey = `${date}|${timeSlot}`;
    if (_expandedAdminSlots.has(slotKey)) slotCard.classList.add('is-expanded');

    // Toggle on header click — escludi click su bottoni e pickers
    const headerEl = slotCard.querySelector('.admin-slot-header');
    if (headerEl) {
        headerEl.addEventListener('click', (e) => {
            if (e.target.closest('button, .extra-picker, input, select, textarea, a')) return;
            const expanded = slotCard.classList.toggle('is-expanded');
            if (expanded) _expandedAdminSlots.add(slotKey);
            else _expandedAdminSlots.delete(slotKey);
        });
    }
    return slotCard;
}

// Stato globale degli slot espansi (chiave: "YYYY-MM-DD|HH:MM - HH:MM").
// Sopravvive ai re-render di renderAdminDayView.
const _expandedAdminSlots = (window._expandedAdminSlots = window._expandedAdminSlots || new Set());

// Helper: classe CSS colore per pip in base al tipo slot.
// pt = personal-training (verde), sg = small-group (giallo),
// gc = group-class (rosso), cl = cleaning (ciano).
function _pipTypeClass(slotType) {
    switch (slotType) {
        case 'personal-training': return 'pip-pt';
        case 'small-group':       return 'pip-sg';
        case 'group-class':       return 'pip-gc';
        case 'cleaning':          return 'pip-cl';
        default:                  return 'pip-pt';
    }
}

// Helper: forza l'espansione dello slot che contiene l'elemento dato.
// Usato dal "+" per mostrare il picker insieme alla lista partecipanti
// quando si aggiunge un posto extra.
function _ensureSlotExpanded(el) {
    const card = el?.closest?.('.admin-slot-card');
    if (!card) return;
    card.classList.add('is-expanded');
    // Persisti lo stato cosi' resta espanso anche dopo i re-render.
    const headerTime = card.querySelector('.admin-slot-time')?.textContent
        ?.replace('🕐', '').trim();
    const dateInfo = window._currentAdminDate;
    if (headerTime && dateInfo?.formatted) {
        _expandedAdminSlots.add(`${dateInfo.formatted}|${headerTime}`);
    }
}


function deleteBooking(bookingId, bookingName) {
    const bookings = [...BookingStorage.getAllBookings()];
    const index = bookings.findIndex(b => b.id === bookingId);
    if (index === -1) return;

    const booking = bookings[index];
    const price = getBookingPrice(booking);
    const hasBonus = BonusStorage.getBonus(booking.whatsapp, booking.email, booking.userId) > 0;

    // Se il booking è uno "Slot prenotato condiviso" (group-class con customPrice),
    // recuperiamo l'altro partecipante: dopo il cancel reimposteremo il suo prezzo
    // al valore standard (custom_price=NULL → 30€).
    const isShared = booking.slotType === SLOT_TYPES.GROUP_CLASS
        && booking.customPrice != null;
    const otherGC = isShared
        ? bookings.find(b =>
              b.id !== booking.id
              && b.date === booking.date
              && b.time === booking.time
              && b.slotType === SLOT_TYPES.GROUP_CLASS
              && (b.status === 'confirmed' || b.status === 'cancellation_requested')
          )
        : null;

    // Reset customPrice sul booking rimasto (locale + Supabase) → torna a 30€.
    // Va via RPC admin: bookings non ha policy UPDATE per authenticated.
    async function _resetSharedPrice(other) {
        if (!other) return;
        const cacheIdx = BookingStorage._cache.findIndex(b => b.id === other.id);
        if (cacheIdx !== -1) BookingStorage._cache[cacheIdx].customPrice = null;
        if (other._sbId && typeof supabaseClient !== 'undefined') {
            try {
                await _rpcWithTimeout(supabaseClient.rpc('admin_set_booking_custom_price', {
                    p_booking_id: other._sbId, p_price: null
                }));
            } catch (e) {
                console.warn('[_resetSharedPrice] update Supabase fallito:', e);
            }
        }
    }

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

        // Se era uno slot condiviso, resetta customPrice sul booking rimasto (torna a 30€)
        if (isShared && otherGC) {
            await _resetSharedPrice(otherGC);
            await BookingStorage.syncFromSupabase();
        }

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

        // Se era uno slot condiviso, reset customPrice sul rimasto (fire-and-forget)
        if (isShared && otherGC) {
            _resetSharedPrice(otherGC).catch(err =>
                console.warn('[deleteBooking local] reset customPrice fallito:', err)
            );
        }

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

