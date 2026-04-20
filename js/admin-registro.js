// REGISTRO / LOG DB
// ══════════════════════════════════════════════════════════════════════════════

var _debouncedRegistroFilter = _debounce(() => applyRegistroFilters(), 250);

let _registroState = {
    range:      'all',
    customFrom: null,
    customTo:   null,
    sortField:  'timestamp',
    sortDir:    'desc',
    page:       0,
};
const REGISTRO_PAGE_SIZE = 50;
let _registroFiltered = [];

// ── Aggrega tutti gli eventi da tutte le sorgenti dati ─────────────────────
function buildRegistroEntries() {
    const SLOT_LABEL = {
        'personal-training': 'Autonomia',
        'small-group':       'Lezione di Gruppo',
        'group-class':       'Slot prenotato',
        'cleaning':          'Pulizie',
    };

    const entries = [];

    // Helper: determina se un'azione è stata fatta da admin
    // (created_by/cancelled_by diverso da user_id = qualcun altro ha agito per conto dell'utente)
    const _isAdminAction = (actorId, userId) => {
        if (!actorId) return false;            // sconosciuto (dati vecchi) → non marcare
        if (!userId) return !!actorId;         // booking anonimo ma con attore → admin
        return actorId !== userId;             // attore diverso dal proprietario → admin
    };

    // 1. Prenotazioni → eventi: created, paid, cancellation_requested, cancelled
    // Escludi booking sintetici (_avail_*) — placeholder senza dati personali per slot occupati da altri
    const bookings = BookingStorage.getAllBookings().filter(b => !b.id?.startsWith('_avail_'));
    for (const b of bookings) {
        const base = {
            bookingId:   b.id,
            clientName:  b.name  || '—',
            clientPhone: b.whatsapp || '',
            clientEmail: b.email   || '',
            lessonDate:  b.date    || null,
            lessonTime:  b.time    || null,
            slotType:    b.slotType || null,
            slotLabel:   SLOT_LABEL[b.slotType] || b.slotType || '',
            notes:       b.notes  || '',
        };

        // Evento: prenotazione creata
        const createdAt = b.createdAt
            ? new Date(b.createdAt)
            : new Date((b.date || '2000-01-01') + 'T08:00:00');
        const createdByAdmin   = _isAdminAction(b.createdBy, b.userId);
        const cancelledByAdmin = _isAdminAction(b.cancelledBy, b.userId);

        entries.push({
            ...base,
            eventType:     'booking_created',
            timestamp:     createdAt,
            amount:        getBookingPrice(b),
            paymentMethod: b.paymentMethod || (b.status === 'cancelled' ? b.cancelledPaymentMethod : null) || null,
            bookingStatus: b.status,
            bookingPaid:   b.paid || (b.status === 'cancelled' && !!b.cancelledPaidAt),
            actorType:     createdByAdmin ? 'admin' : 'user',
        });

        // Evento: pagamento ricevuto
        // Per prenotazioni annullate-dopo-pagamento usiamo cancelledPaidAt/cancelledPaymentMethod
        const paidAtTs  = b.paidAt || (b.status === 'cancelled' ? b.cancelledPaidAt  : null);
        const paidMeth  = b.paymentMethod || (b.status === 'cancelled' ? b.cancelledPaymentMethod : null);
        if (paidAtTs) {
            entries.push({
                ...base,
                eventType:     'booking_paid',
                timestamp:     new Date(paidAtTs),
                amount:        getBookingPrice(b),
                paymentMethod: paidMeth,
                bookingStatus: b.status,
                bookingPaid:   true,
                actorType:     createdByAdmin ? 'admin' : 'user',
            });
        }

        // Evento: richiesta annullamento
        if (b.cancellationRequestedAt) {
            entries.push({
                ...base,
                eventType:     'booking_cancellation_req',
                timestamp:     new Date(b.cancellationRequestedAt),
                amount:        null,
                paymentMethod: null,
                bookingStatus: 'cancellation_requested',
                bookingPaid:   b.paid,
                actorType:     cancelledByAdmin ? 'admin' : 'user',
            });
        }

        // Evento: annullamento effettivo
        if (b.status === 'cancelled' && b.cancelledAt) {
            // Se cancelledBy è null ma il booking aveva cancellationRequestedAt,
            // è stato completato dal sistema (fulfill_pending_cancellation)
            const cancelIsSystem = !b.cancelledBy && !!b.cancellationRequestedAt;

            entries.push({
                ...base,
                eventType:     'booking_cancelled',
                timestamp:     new Date(b.cancelledAt),
                amount:        null,
                paymentMethod: null,
                bookingStatus: 'cancelled',
                bookingPaid:   false,
                actorType:     cancelIsSystem ? 'system' : (cancelledByAdmin ? 'admin' : 'user'),
            });

            // Evento: mora trattenuta (annullamento con penalità su booking già pagato)
            // Il rimborso parziale +50% è già nel credit history; qui mostriamo il -50% trattenuto.
            if (b.cancelledWithPenalty && b.cancelledPaidAt) {
                const moraAmount = Math.round((getBookingPrice(b)) * 0.5 * 100) / 100;
                if (moraAmount > 0) {
                    entries.push({
                        ...base,
                        eventType:     'cancellation_mora',
                        timestamp:     new Date(b.cancelledAt),
                        amount:        moraAmount,
                        paymentMethod: null,
                        bookingStatus: 'cancelled',
                        bookingPaid:   false,
                        actorType:     cancelIsSystem ? 'system' : (cancelledByAdmin ? 'admin' : 'user'),
                    });
                }
            }

            // Evento: bonus utilizzato per annullamento gratuito
            if (b.cancelledWithBonus) {
                entries.push({
                    ...base,
                    eventType:     'bonus_used',
                    timestamp:     new Date(b.cancelledAt),
                    amount:        null,
                    paymentMethod: null,
                    bookingStatus: 'cancelled',
                    bookingPaid:   false,
                    actorType:     cancelledByAdmin ? 'admin' : 'user',
                });
            }
        }
    }

    // 2. Storico crediti — solo aggiunte (positive): i consumi di credito sono
    //    già rappresentati come booking_paid con method='credito', quindi
    //    mostrare anche credit_used sarebbe ridondante e confuso.
    const allCredits = CreditStorage._getAll();
    for (const record of Object.values(allCredits)) {
        for (const h of (record.history || [])) {
            if ((h.amount || 0) <= 0) continue; // salta i consumi di credito
            const ts = h.date ? new Date(h.date) : new Date();

            // Retrocompatibilità: vecchi dati incorporavano il metodo nella nota come "(carta)"
            let creditNote   = h.note   || '';
            let creditMethod = h.method || null;
            if (!creditMethod && creditNote) {
                const m = creditNote.match(/\s*\(([^)]+)\)\s*$/);
                if (m) {
                    const raw = m[1].toLowerCase().trim();
                    const methodMap = {
                        'carta': 'carta', 'contanti': 'contanti', 'iban': 'iban',
                        'lezione-gratuita': 'lezione-gratuita', 'lezione gratuita': 'lezione-gratuita',
                    };
                    if (methodMap[raw]) {
                        creditMethod = methodMap[raw];
                        creditNote   = creditNote.replace(/\s*\([^)]+\)\s*$/, '').trim();
                    }
                }
            }

            // Rimborsi da "annullamento soddisfatto" sono azioni di sistema,
            // crediti manuali e altri rimborsi sono azioni admin
            const isRefund = /^Rimborso/i.test(creditNote);
            const isSystemRefund = isRefund && /annullamento soddisfatto/i.test(creditNote);

            entries.push({
                bookingId:     h.bookingRef || null,
                clientName:    record.name     || '—',
                clientPhone:   record.whatsapp || '',
                clientEmail:   record.email    || '',
                lessonDate:    null,
                lessonTime:    null,
                slotType:      null,
                slotLabel:     '',
                notes:         creditNote,
                eventType:     isRefund ? 'booking_refund' : 'credit_added',
                timestamp:     ts,
                amount:        Math.abs(h.displayAmount != null ? h.displayAmount : (h.amount || 0)),
                paymentMethod: creditMethod,
                freeLesson:    h.freeLesson || false,
                bookingStatus: 'credit',
                bookingPaid:   null,
                actorType:     isSystemRefund ? 'system' : 'admin',
            });
        }
    }

    // 3. Storico debiti manuali
    const allDebts = ManualDebtStorage._getAll();
    for (const record of Object.values(allDebts)) {
        const creditCoversDebt = record.balance === 0
            || CreditStorage.getBalance(record.whatsapp, record.email) >= record.balance;
        for (const h of (record.history || [])) {
            const ts     = h.date ? new Date(h.date) : new Date();
            const isDebt = (h.amount || 0) > 0;
            entries.push({
                bookingId:     null,
                clientName:    record.name     || '—',
                clientPhone:   record.whatsapp || '',
                clientEmail:   record.email    || '',
                lessonDate:    null,
                lessonTime:    null,
                slotType:      null,
                slotLabel:     '',
                notes:         h.note || '',
                eventType:     isDebt ? (h.entryType === 'mora' ? 'cancellation_mora' : 'manual_debt') : 'manual_debt_paid',
                timestamp:     ts,
                amount:        Math.abs(h.amount || 0),
                actorType:     'admin',
                paymentMethod: isDebt ? null : (h.method || null),
                bookingStatus: isDebt ? (creditCoversDebt ? 'paid' : 'debt') : 'paid',
                bookingPaid:   isDebt ? (creditCoversDebt ? true : null) : true,
            });
        }
    }

    return entries;
}

// ── Calcola il range di date per il filtro periodo ─────────────────────────
function _registroGetDateRange() {
    const now = new Date();
    const s   = _registroState;
    switch (s.range) {
        case 'all': return null;
        case 'this-month':
            return {
                from: new Date(now.getFullYear(), now.getMonth(), 1),
                to:   new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
            };
        case 'last-month': {
            const m = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
            const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
            return { from: new Date(y, m, 1), to: new Date(y, m + 1, 0, 23, 59, 59, 999) };
        }
        case 'this-year':
            return {
                from: new Date(now.getFullYear(), 0, 1),
                to:   new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999),
            };
        case 'custom':
            return {
                from: s.customFrom ? new Date(s.customFrom + 'T00:00:00') : null,
                to:   s.customTo   ? new Date(s.customTo   + 'T23:59:59') : null,
            };
        default: return null;
    }
}

// ── Toggle singolo pill tipo evento ───────────────────────────────────────
function toggleRegistroType(btn) {
    btn.classList.toggle('active');
    applyRegistroFilters();
}

// ── Applica tutti i filtri e rirenderizza ──────────────────────────────────
function applyRegistroFilters() {
    const all          = buildRegistroEntries();
    const range        = _registroGetDateRange();
    const activeTypes  = Array.from(document.querySelectorAll('.rfilter-type-pills .rfilter-btn.active')).map(b => b.dataset.etype);
    const filterSlot   = document.getElementById('registroFilterSlot')?.value   || 'all';
    const filterMethod = document.getElementById('registroFilterMethod')?.value || 'all';
    const filterStatus = document.getElementById('registroFilterStatus')?.value || 'all';
    const search       = (document.getElementById('registroSearch')?.value || '').toLowerCase().trim();

    let filtered = all.filter(e => {
        // Periodo (su timestamp dell'evento)
        if (range) {
            if (range.from && e.timestamp < range.from) return false;
            if (range.to   && e.timestamp > range.to)   return false;
        }
        // Tipo evento (multi-selezione: nessun bottone attivo = tutti)
        if (activeTypes.length > 0 && !activeTypes.includes(e.eventType)) return false;
        // Tipo lezione
        if (filterSlot !== 'all' && e.slotType !== filterSlot) return false;
        // Metodo pagamento
        if (filterMethod !== 'all' && e.paymentMethod !== filterMethod) return false;
        // Stato
        if (filterStatus !== 'all') {
            if (filterStatus === 'paid' && e.bookingPaid !== true) return false;
            if (filterStatus === 'unpaid') {
                if (e.eventType !== 'booking_created') return false;
                if (e.bookingPaid !== false) return false;
                if (e.bookingStatus === 'cancelled') return false;
            }
            if (filterStatus === 'cancelled' && e.bookingStatus !== 'cancelled') return false;
        }
        // Ricerca cliente
        if (search) {
            const hay = `${e.clientName} ${e.clientPhone} ${e.clientEmail}`.toLowerCase();
            if (!hay.includes(search)) return false;
        }
        return true;
    });

    // Ordinamento
    const dir   = _registroState.sortDir === 'asc' ? 1 : -1;
    const field = _registroState.sortField;
    filtered.sort((a, b) => {
        if (field === 'timestamp')  return dir * (a.timestamp - b.timestamp);
        if (field === 'lessonDate') return dir * (a.lessonDate || '').localeCompare(b.lessonDate || '');
        return 0;
    });

    _registroFiltered        = filtered;
    _registroState.page      = 0;
    _updateRegistroSummary(filtered);
    renderRegistroTable();
}

// ── Aggiorna le card summary ───────────────────────────────────────────────
function _updateRegistroSummary(filtered) {
    const totalEvents   = filtered.length;
    const totalPaid     = filtered
        .filter(e =>
            (e.eventType === 'booking_paid'  && e.paymentMethod !== 'lezione-gratuita' && e.paymentMethod !== 'credito')
            || (e.eventType === 'credit_added'    && !e.freeLesson)
            || (e.eventType === 'manual_debt_paid' && e.paymentMethod)
        )
        .reduce((s, e) => s + (e.amount || 0), 0);
    const totalBookings = filtered.filter(e => e.eventType === 'booking_created').length;

    const el = id => document.getElementById(id);
    if (el('registroTotalEvents'))   el('registroTotalEvents').textContent   = totalEvents;
    if (el('registroTotalPaid'))     el('registroTotalPaid').textContent     = `€${totalPaid.toFixed(2)}`;
    if (el('registroTotalBookings')) el('registroTotalBookings').textContent = totalBookings;
}

// ── Renderizza la tabella (pagina corrente) ────────────────────────────────
function renderRegistroTable() {
    const tbody = document.getElementById('registroTableBody');
    if (!tbody) return;

    const total = _registroFiltered.length;
    const page  = _registroState.page;
    const start = page * REGISTRO_PAGE_SIZE;
    const end   = Math.min(start + REGISTRO_PAGE_SIZE, total);
    const slice = _registroFiltered.slice(start, end);

    // Paginazione
    const info = document.getElementById('registroPaginationInfo');
    if (info) info.textContent = total === 0 ? 'Nessun risultato' : `${start + 1}–${end} di ${total}`;
    const prev = document.getElementById('registroPrevBtn');
    const next = document.getElementById('registroNextBtn');
    if (prev) prev.disabled = page === 0;
    if (next) next.disabled = end >= total;

    if (slice.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="registro-empty">Nessun evento trovato con i filtri selezionati.</td></tr>`;
        return;
    }

    const EVENT_CONFIG = {
        booking_created:          { icon: '📅', cls: 'rtype-booking',    label: 'Prenotazione' },
        booking_paid:             { icon: '✅', cls: 'rtype-paid',       label: 'Pagamento' },
        booking_cancelled:        { icon: '❌', cls: 'rtype-cancelled',  label: 'Annullamento' },
        booking_cancellation_req: { icon: '⏳', cls: 'rtype-pending',    label: 'Rich. Annullamento' },
        credit_added:             { icon: '⬆️', cls: 'rtype-credit',     label: 'Credito Manuale' },
        booking_refund:           { icon: '🔄', cls: 'rtype-refund',     label: 'Rimborso' },
        manual_debt:              { icon: '📋', cls: 'rtype-debt',       label: 'Debito Manuale' },
        manual_debt_paid:         { icon: '💰', cls: 'rtype-debtpaid',   label: 'Debito Saldato' },
        cancellation_mora:        { icon: '💸', cls: 'rtype-mora',       label: 'Mora' },
        bonus_used:               { icon: '🎟️', cls: 'rtype-bonus',      label: 'Bonus Utilizzato' },
    };
    const METHOD_ICON  = { contanti: '💵', carta: '💳', iban: '🏦', credito: '🔄', stripe: '💳', 'lezione-gratuita': '🎁' };
    const METHOD_LABEL = { contanti: 'Contanti', carta: 'Carta', iban: 'Bonifico', credito: 'Credito', stripe: 'Stripe', 'lezione-gratuita': 'Gratuita' };

    const statusHTML = (e) => {
        if (e.bookingStatus === 'cancelled')              return `<span class="rstatus-badge rstatus-cancelled">Annullato</span>`;
        if (e.bookingStatus === 'cancellation_requested') return `<span class="rstatus-badge rstatus-pending">In attesa</span>`;
        if (e.bookingStatus === 'credit')                 return `<span class="rstatus-badge rstatus-paid">Pagato</span>`;
        if (e.bookingStatus === 'debt')                   return `<span class="rstatus-badge rstatus-debt">Da pagare</span>`;
        if (e.bookingPaid === true)                       return `<span class="rstatus-badge rstatus-paid">Pagato</span>`;
        if (e.bookingPaid === false)                      return `<span class="rstatus-badge rstatus-unpaid">Non pagato</span>`;
        return '—';
    };

    const fmtTs = d => d
        ? d.toLocaleString('it-IT', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' })
        : '—';
    const fmtDate = str => {
        if (!str) return '—';
        const [y, m, d] = str.split('-');
        return `${d}/${m}/${y}`;
    };

    tbody.innerHTML = slice.map(e => {
        const cfg    = EVENT_CONFIG[e.eventType] || { icon: '•', cls: '', label: e.eventType };
        const mi     = e.paymentMethod ? METHOD_ICON[e.paymentMethod]  || '' : '';
        const ml     = e.paymentMethod ? METHOD_LABEL[e.paymentMethod] || e.paymentMethod : '—';
        const amount = e.amount != null ? `€${Number(e.amount).toFixed(2)}` : '—';
        const rowCls = e.actorType === 'admin' ? 'registro-row registro-admin'
                     : e.actorType === 'system' ? 'registro-row registro-system'
                     : 'registro-row';
        return `<tr class="${rowCls}">
            <td class="registro-ts">${fmtTs(e.timestamp)}</td>
            <td><span class="rtype-badge ${cfg.cls}">${cfg.icon} ${cfg.label}</span></td>
            <td class="registro-client">
                <span class="registro-client-name">${_escHtml(e.clientName)}</span>
            </td>
            <td>${fmtDate(e.lessonDate)}</td>
            <td class="registro-time">${_escHtml(e.lessonTime || '—')}</td>
            <td>${_escHtml(e.slotLabel || '—')}</td>
            <td class="registro-amount">${amount}</td>
            <td class="registro-method">${mi} ${_escHtml(ml)}</td>
            <td>${statusHTML(e)}</td>
            <td class="registro-note" title="${_escHtml(e.notes || '')}">${_escHtml(e.notes || '—')}</td>
        </tr>`;
    }).join('');
}

// _escHtml è definita in ui.js (caricato prima di admin.js su tutte le pagine)

// ── Ordinamento colonne ────────────────────────────────────────────────────
function toggleRegistroSort(field) {
    if (_registroState.sortField === field) {
        _registroState.sortDir = _registroState.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
        _registroState.sortField = field;
        _registroState.sortDir   = 'desc';
    }
    const tsIcon = document.getElementById('registroSortTs');
    const lsIcon = document.getElementById('registroSortLesson');
    if (tsIcon) tsIcon.textContent = field === 'timestamp'  ? (_registroState.sortDir === 'desc' ? '↓' : '↑') : '';
    if (lsIcon) lsIcon.textContent = field === 'lessonDate' ? (_registroState.sortDir === 'desc' ? '↓' : '↑') : '';
    applyRegistroFilters();
}

// ── Filtro periodo ─────────────────────────────────────────────────────────
function setRegistroRange(range, btn) {
    _registroState.range = range;
    document.querySelectorAll('.rfilter-btn[data-range]').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    const customDiv = document.getElementById('registroCustomDates');
    if (range === 'custom') {
        if (customDiv) customDiv.style.display = 'flex';
        return; // attende Applica
    }
    if (customDiv) customDiv.style.display = 'none';
    applyRegistroFilters();
}

function applyRegistroCustomRange() {
    const from = document.getElementById('registroDateFrom')?.value;
    const to   = document.getElementById('registroDateTo')?.value;
    if (!from || !to) { alert('Seleziona entrambe le date.'); return; }
    if (from > to)    { alert('La data di inizio deve essere precedente alla data di fine.'); return; }
    _registroState.customFrom = from;
    _registroState.customTo   = to;
    applyRegistroFilters();
}

// ── Reset filtri ───────────────────────────────────────────────────────────
function resetRegistroFilters() {
    _registroState.range      = 'all';
    _registroState.customFrom = null;
    _registroState.customTo   = null;
    _registroState.sortField  = 'timestamp';
    _registroState.sortDir    = 'desc';
    _registroState.page       = 0;

    document.querySelectorAll('.rfilter-btn[data-range]').forEach(b => {
        b.classList.toggle('active', b.dataset.range === 'all');
    });
    const customDiv = document.getElementById('registroCustomDates');
    if (customDiv) customDiv.style.display = 'none';

    document.querySelectorAll('.rfilter-type-pills .rfilter-btn').forEach(b => b.classList.remove('active'));
    ['registroFilterSlot', 'registroFilterMethod', 'registroFilterStatus'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = 'all';
    });
    const searchEl = document.getElementById('registroSearch');
    if (searchEl) searchEl.value = '';

    const tsIcon = document.getElementById('registroSortTs');
    const lsIcon = document.getElementById('registroSortLesson');
    if (tsIcon) tsIcon.textContent = '↓';
    if (lsIcon) lsIcon.textContent = '';

    applyRegistroFilters();
}

// ── Paginazione ────────────────────────────────────────────────────────────
function registroNextPage() {
    const maxPage = Math.ceil(_registroFiltered.length / REGISTRO_PAGE_SIZE) - 1;
    if (_registroState.page < maxPage) { _registroState.page++; renderRegistroTable(); }
}
function registroPrevPage() {
    if (_registroState.page > 0) { _registroState.page--; renderRegistroTable(); }
}

// ── Toggle pannello filtri (generico, usato da tutti i subtab) ──────────
function toggleRegFilters(btn) {
    const container = btn.parentElement;
    const body = container.querySelector('.reg-filters-collapsible');
    const icon = btn.querySelector('.reg-filters-toggle-icon');
    if (!body) return;
    body.classList.toggle('open');
    if (icon) icon.classList.toggle('open');
}

// Legacy alias
function toggleRegistroFiltersPanel() {
    const btn = document.querySelector('#tab-registro .reg-header-toggle');
    if (btn) toggleRegFilters(btn);
}

// ── Sub-tab switching dentro Registro ────────────────────────────────────
function switchRegistroSubtab(name, btn) {
    document.querySelectorAll('.registro-subtab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.registro-subtab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    const panel = document.getElementById('registroSubtab-' + name);
    if (panel) panel.classList.add('active');

    // Lazy-load dati alla prima apertura
    if (name === 'notifiche-admin' && typeof loadMessaggi === 'function') loadMessaggi();
    if (name === 'notifiche-clienti' && typeof loadClientNotifications === 'function') loadClientNotifications();
}

// ── Refresh mirato dei dati del Registro ──────────────────────────────────
// Sync di Booking + Credit + ManualDebt (le uniche sorgenti lette da
// buildRegistroEntries). Guard doppia: non rifetcha se c'è già un sync in
// corso e non più di 1 fetch ogni REGISTRO_SYNC_COOLDOWN_MS.
// Questa funzione è invocata SOLO da renderRegistroTab() (entrata nel tab):
// i re-render interni dovuti a filtri/ordinamento passano per
// applyRegistroFilters() direttamente e non toccano la rete.
const REGISTRO_SYNC_COOLDOWN_MS = 10_000;
let _registroSyncInFlight = false;
let _registroLastSyncAt   = 0;

async function _registroRefreshData() {
    if (typeof supabaseClient === 'undefined') return;
    if (_registroSyncInFlight) return;
    if (Date.now() - _registroLastSyncAt < REGISTRO_SYNC_COOLDOWN_MS) return;

    _registroSyncInFlight = true;
    try {
        await Promise.all([
            BookingStorage.syncFromSupabase(),
            CreditStorage.syncFromSupabase(),
            ManualDebtStorage.syncFromSupabase(),
        ]);
        _registroLastSyncAt = Date.now();
        // Re-render solo se siamo ancora sul tab Registro: evita lavoro inutile
        // se l'utente ha già cambiato tab mentre il fetch era in volo.
        const active = document.querySelector('.admin-tab.active');
        if (active && active.dataset.tab === 'registro') {
            applyRegistroFilters();
        }
    } catch (e) {
        console.warn('[Registro] refresh error:', e);
    } finally {
        _registroSyncInFlight = false;
    }
}

// ── Entry point chiamato da switchTab ──────────────────────────────────────
function renderRegistroTab() {
    applyRegistroFilters();      // render immediato da cache (no flicker)
    _registroRefreshData();      // fetch in background, guardato
}

// ── Export Excel della vista filtrata ─────────────────────────────────────
function exportRegistro() {
    const data = _registroFiltered;
    if (data.length === 0) {
        alert('Nessun dato da esportare con i filtri correnti.');
        return;
    }

    const EVENT_LABEL = {
        booking_created:          'Prenotazione',
        booking_paid:             'Pagamento',
        booking_cancelled:        'Annullamento',
        booking_cancellation_req: 'Rich. Annullamento',
        credit_added:             'Credito Manuale',
        booking_refund:           'Rimborso',
        manual_debt:              'Debito Manuale',
        manual_debt_paid:         'Debito Saldato',
        cancellation_mora:        'Mora',
        bonus_used:               'Bonus Utilizzato',
    };
    const METHOD_LABEL = {
        contanti: 'Contanti', carta: 'Carta', iban: 'Bonifico',
        credito: 'Credito', 'lezione-gratuita': 'Gratuita',
    };
    const statusLabel = e => {
        if (e.bookingStatus === 'cancelled')              return 'Annullato';
        if (e.bookingStatus === 'cancellation_requested') return 'Rich. Annullamento';
        if (e.bookingStatus === 'credit')                 return 'Credito';
        if (e.bookingStatus === 'debt')                   return 'Debito';
        if (e.bookingPaid === true)                       return 'Pagato';
        if (e.bookingPaid === false)                      return 'Non pagato';
        return '';
    };
    const fmtTs   = d  => d ? d.toLocaleString('it-IT') : '';
    const fmtDate = str => {
        if (!str) return '';
        const [y, m, d] = str.split('-');
        return `${d}/${m}/${y}`;
    };

    const sheetData = [
        ['Data/Ora Evento', 'Tipo Evento', 'Cliente', 'Telefono', 'Email',
         'Data Lezione', 'Ora Lezione', 'Tipo Lezione',
         'Importo (€)', 'Metodo Pagamento', 'Stato', 'Attore', 'Note', 'Booking ID'],
        ...data.map(e => [
            fmtTs(e.timestamp),
            EVENT_LABEL[e.eventType] || e.eventType,
            e.clientName,
            e.clientPhone,
            e.clientEmail,
            fmtDate(e.lessonDate),
            e.lessonTime || '',
            e.slotLabel  || '',
            e.amount != null ? e.amount : '',
            METHOD_LABEL[e.paymentMethod] || e.paymentMethod || '',
            statusLabel(e),
            e.actorType === 'admin' ? 'Admin' : e.actorType === 'system' ? 'Sistema' : 'Utente',
            e.notes     || '',
            e.bookingId || '',
        ]),
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    const colWidths = sheetData[0].map((_, ci) =>
        Math.min(50, Math.max(10, ...sheetData.map(r => String(r[ci] ?? '').length)))
    );
    ws['!cols'] = colWidths.map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, 'Registro');

    const date = _localDateStr();
    XLSX.writeFile(wb, `TB_Registro_${date}.xlsx`);

    const btn = document.getElementById('registroExportBtn');
    if (btn) {
        const orig = btn.innerHTML;
        btn.innerHTML = '✅ Scaricato!';
        setTimeout(() => { btn.innerHTML = orig; }, 2500);
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// STORICO MESSAGGI / NOTIFICHE ADMIN
// ══════════════════════════════════════════════════════════════════════════════

let _messaggiCache = [];
let _messaggiFiltered = [];
let _messaggiPage = 0;
const MESSAGGI_PAGE_SIZE = 50;

const _MSG_TYPE_LABELS = {
    booking:               '✔️ Prenotazione',
    cancellation:          '❌ Annullamento',
    proximity:             '📍 Arrivo',
    proximity_no_booking:  '📍 Senza prenot.',
    new_client:            '🆕 Nuovo iscritto',
    broadcast:             '📢 Broadcast',
    topup:                 '💰 Ricarica',
};

async function loadMessaggi() {
    if (typeof supabaseClient === 'undefined') return;
    try {
        const { data, error } = await _queryWithTimeout(supabaseClient
            .from('admin_messages')
            .select('created_at,type,date,title,body,client_name,sent_count')
            .order('created_at', { ascending: false })
            .limit(500));
        if (error) {
            console.warn('[Messaggi] load error:', error.message);
            const tbody = document.getElementById('messaggiTableBody');
            if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="registro-empty">❌ Errore caricamento messaggi. <a href="#" onclick="loadMessaggi();return false">Riprova</a></td></tr>';
            return;
        }
        _messaggiCache = data || [];
        renderMessaggiTable();
    } catch (e) {
        console.warn('[Messaggi] load exception:', e);
        const tbody = document.getElementById('messaggiTableBody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="registro-empty">❌ Errore caricamento messaggi. <a href="#" onclick="loadMessaggi();return false">Riprova</a></td></tr>';
    }
}

function renderMessaggiTable() {
    const typeFilter = document.getElementById('msgFilterType')?.value || '';
    const statusFilter = document.getElementById('msgFilterStatus')?.value || '';
    const dateFilter = document.getElementById('msgFilterDate')?.value || '';

    _messaggiFiltered = _messaggiCache.filter(m => {
        if (typeFilter && m.type !== typeFilter) return false;
        if (dateFilter && m.date !== dateFilter) return false;
        if (statusFilter) {
            const isSent = (m.sent_count || 0) > 0;
            if (statusFilter === 'sent' && !isSent) return false;
            if (statusFilter === 'failed' && isSent) return false;
        }
        return true;
    });

    _messaggiPage = 0;
    _renderMessaggiPage();
}

function _renderMessaggiPage() {
    const tbody = document.getElementById('messaggiTableBody');
    if (!tbody) return;

    const start = _messaggiPage * MESSAGGI_PAGE_SIZE;
    const page = _messaggiFiltered.slice(start, start + MESSAGGI_PAGE_SIZE);

    if (page.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="registro-empty">Nessun messaggio trovato</td></tr>';
    } else {
        tbody.innerHTML = page.map(m => {
            const dt = new Date(m.created_at);
            const dateStr = `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()}`;
            const timeStr = `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
            const typeLabel = _MSG_TYPE_LABELS[m.type] || m.type;
            const sent = m.sent_count || 0;
            const isSent = sent > 0;
            const statusLabel = isSent ? `✅ Inviata (${sent})` : '❌ Non inviata';
            const statusStyle = isSent ? 'color:#22c55e' : 'color:#ef4444';
            return `<tr>
                <td>${dateStr} ${timeStr}</td>
                <td>${typeLabel}</td>
                <td>${_escHtml(m.title)}</td>
                <td>${_escHtml(m.body)}</td>
                <td>${_escHtml(m.client_name || '')}</td>
                <td style="${statusStyle};font-weight:600">${statusLabel}</td>
            </tr>`;
        }).join('');
    }

    // Pagination
    const total = _messaggiFiltered.length;
    const totalPages = Math.ceil(total / MESSAGGI_PAGE_SIZE) || 1;
    const infoEl = document.getElementById('messaggiPaginationInfo');
    if (infoEl) infoEl.textContent = `${_messaggiPage + 1} / ${totalPages} (${total})`;
    const prevBtn = document.getElementById('messaggiPrevBtn');
    const nextBtn = document.getElementById('messaggiNextBtn');
    if (prevBtn) prevBtn.disabled = _messaggiPage === 0;
    if (nextBtn) nextBtn.disabled = start + MESSAGGI_PAGE_SIZE >= total;
}

function messaggiPrevPage() {
    if (_messaggiPage > 0) { _messaggiPage--; _renderMessaggiPage(); }
}
function messaggiNextPage() {
    if ((_messaggiPage + 1) * MESSAGGI_PAGE_SIZE < _messaggiFiltered.length) { _messaggiPage++; _renderMessaggiPage(); }
}

// ══════════════════════════════════════════════════════════════════════════════
// NOTIFICHE AI CLIENTI
// ══════════════════════════════════════════════════════════════════════════════

let _cnCache = [];
let _cnFiltered = [];
let _cnPage = 0;
const CN_PAGE_SIZE = 50;

var _debouncedCnFilter = _debounce(() => renderClientNotifTable(), 250);

const _CN_TYPE_LABELS = {
    reminder_24h:    '⏰ Promemoria 24h',
    reminder_1h:     '⏰ Promemoria 1h',
    slot_available:  '🟢 Slot disponibile',
    broadcast:       '📢 Broadcast',
};

const _CN_STATUS_LABELS = {
    sent:            '✅ Inviata',
    failed:          '❌ Fallita',
    no_subscription: '⚠️ No sub',
};

async function loadClientNotifications() {
    if (typeof supabaseClient === 'undefined') return;
    try {
        const { data, error } = await _queryWithTimeout(supabaseClient
            .from('client_notifications')
            .select('created_at,type,status,user_name,user_email,title,body,error,booking_date')
            .order('created_at', { ascending: false })
            .limit(1000));
        if (error) {
            console.warn('[ClientNotif] load error:', error.message);
            const tbody = document.getElementById('clientNotifTableBody');
            if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="registro-empty">❌ Errore caricamento notifiche. <a href="#" onclick="loadClientNotifications();return false">Riprova</a></td></tr>';
            return;
        }
        _cnCache = data || [];
        renderClientNotifTable();
    } catch (e) {
        console.warn('[ClientNotif] load exception:', e);
        const tbody = document.getElementById('clientNotifTableBody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="registro-empty">❌ Errore caricamento notifiche. <a href="#" onclick="loadClientNotifications();return false">Riprova</a></td></tr>';
    }
}

function renderClientNotifTable() {
    const typeFilter = document.getElementById('cnFilterType')?.value || '';
    const statusFilter = document.getElementById('cnFilterStatus')?.value || '';
    const clientFilter = (document.getElementById('cnFilterClient')?.value || '').toLowerCase().trim();
    const dateFilter = document.getElementById('cnFilterDate')?.value || '';

    _cnFiltered = _cnCache.filter(n => {
        if (typeFilter && n.type !== typeFilter) return false;
        if (statusFilter && n.status !== statusFilter) return false;
        if (dateFilter && n.booking_date !== dateFilter) return false;
        if (clientFilter) {
            const name = (n.user_name || '').toLowerCase();
            const email = (n.user_email || '').toLowerCase();
            if (!name.includes(clientFilter) && !email.includes(clientFilter)) return false;
        }
        return true;
    });

    _cnPage = 0;
    _renderCnPage();
}

function _renderCnPage() {
    const tbody = document.getElementById('clientNotifTableBody');
    if (!tbody) return;

    const start = _cnPage * CN_PAGE_SIZE;
    const page = _cnFiltered.slice(start, start + CN_PAGE_SIZE);

    if (page.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="registro-empty">Nessuna notifica trovata</td></tr>';
    } else {
        tbody.innerHTML = page.map(n => {
            const dt = new Date(n.created_at);
            const dateStr = `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()}`;
            const timeStr = `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
            const typeLabel = _CN_TYPE_LABELS[n.type] || n.type;
            const statusLabel = _CN_STATUS_LABELS[n.status] || n.status;
            const statusStyle = n.status === 'sent' ? 'color:#22c55e' : n.status === 'failed' ? 'color:#ef4444' : 'color:#eab308';
            return `<tr>
                <td>${dateStr} ${timeStr}</td>
                <td>${typeLabel}</td>
                <td>${_escHtml(n.user_name || '')}</td>
                <td>${_escHtml(n.title)}</td>
                <td>${_escHtml(n.body)}${n.error ? `<br><small style="color:#ef4444">${_escHtml(n.error)}</small>` : ''}</td>
                <td style="${statusStyle};font-weight:600">${statusLabel}</td>
            </tr>`;
        }).join('');
    }

    const total = _cnFiltered.length;
    const totalPages = Math.ceil(total / CN_PAGE_SIZE) || 1;
    const infoEl = document.getElementById('cnPaginationInfo');
    if (infoEl) infoEl.textContent = `${_cnPage + 1} / ${totalPages} (${total})`;
    const prevBtn = document.getElementById('cnPrevBtn');
    const nextBtn = document.getElementById('cnNextBtn');
    if (prevBtn) prevBtn.disabled = _cnPage === 0;
    if (nextBtn) nextBtn.disabled = start + CN_PAGE_SIZE >= total;
}

function cnPrevPage() {
    if (_cnPage > 0) { _cnPage--; _renderCnPage(); }
}
function cnNextPage() {
    if ((_cnPage + 1) * CN_PAGE_SIZE < _cnFiltered.length) { _cnPage++; _renderCnPage(); }
}

