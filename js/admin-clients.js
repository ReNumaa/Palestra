// Clients Tab State
let openClientIndex = null;
let clientsSearchQuery = '';
let clientCertFilter  = false;
let clientAssicFilter = false;
let clientAnagFilter  = false;
let clientBonusFilter = false;
let clientPrivacyFilter = false;
let clientPushFilter    = false;

function clientHasCertIssue(client) {
    const userRecord = _getUserRecord(client.email, client.whatsapp);
    const certScad = userRecord?.certificatoMedicoScadenza || '';
    if (!certScad) return true;
    return certScad < _localDateStr();
}

function clientHasAssicIssue(client) {
    const userRecord = _getUserRecord(client.email, client.whatsapp);
    const assicScad = userRecord?.assicurazioneScadenza || '';
    if (!assicScad) return true;
    return assicScad < _localDateStr();
}

function _syncFilterButtons() {
    document.getElementById('certFilterBtn')?.classList.toggle('active', clientCertFilter);
    document.getElementById('assicFilterBtn')?.classList.toggle('active', clientAssicFilter);
    document.getElementById('anagFilterBtn')?.classList.toggle('active', clientAnagFilter);
    document.getElementById('bonusFilterBtn')?.classList.toggle('active', clientBonusFilter);
    document.getElementById('privacyFilterBtn')?.classList.toggle('active', clientPrivacyFilter);
    document.getElementById('pushFilterBtn')?.classList.toggle('active', clientPushFilter);
    // Evidenzia toggle se un filtro è attivo
    const toggle = document.getElementById('clientsFilterToggle');
    if (toggle) toggle.classList.toggle('active', clientCertFilter || clientAssicFilter || clientAnagFilter || clientBonusFilter || clientPrivacyFilter || clientPushFilter);
}

function toggleClientsFiltersMenu() {
    const chips = document.getElementById('clientsFilterChips');
    const arrow = document.getElementById('clientsFilterToggleArrow');
    const open  = chips.classList.toggle('open');
    if (arrow) arrow.textContent = open ? '▲' : '▼';
}

function _clearOtherFilters(keep) {
    if (keep !== 'cert')    clientCertFilter = false;
    if (keep !== 'assic')   clientAssicFilter = false;
    if (keep !== 'anag')    clientAnagFilter = false;
    if (keep !== 'bonus')   clientBonusFilter = false;
    if (keep !== 'privacy') clientPrivacyFilter = false;
    if (keep !== 'push')    clientPushFilter = false;
}

function toggleCertFilter() {
    clientCertFilter = !clientCertFilter;
    if (clientCertFilter) _clearOtherFilters('cert');
    _syncFilterButtons();
    renderClientsTab();
}

function toggleAssicFilter() {
    clientAssicFilter = !clientAssicFilter;
    if (clientAssicFilter) _clearOtherFilters('assic');
    _syncFilterButtons();
    renderClientsTab();
}

function clientHasAnagIssue(client) {
    const userRecord = _getUserRecord(client.email, client.whatsapp);
    if (!userRecord) return true;
    const cf   = userRecord.codiceFiscale || '';
    const via  = userRecord.indirizzoVia || '';
    const paese = userRecord.indirizzoPaese || '';
    const cap  = userRecord.indirizzoCap || '';
    return !cf || !via || !paese || !cap;
}

function toggleAnagFilter() {
    clientAnagFilter = !clientAnagFilter;
    if (clientAnagFilter) _clearOtherFilters('anag');
    _syncFilterButtons();
    renderClientsTab();
}

function clientHasBonusIssue(client) {
    return BonusStorage.getBonus(client.whatsapp, client.email, client.userId) === 0;
}

function toggleBonusFilter() {
    clientBonusFilter = !clientBonusFilter;
    if (clientBonusFilter) _clearOtherFilters('bonus');
    _syncFilterButtons();
    renderClientsTab();
}

function clientHasPrivacy(client) {
    const userRecord = _getUserRecord(client.email, client.whatsapp);
    return userRecord?.privacyPrenotazioni === true;
}

function togglePrivacyFilter() {
    clientPrivacyFilter = !clientPrivacyFilter;
    if (clientPrivacyFilter) _clearOtherFilters('privacy');
    _syncFilterButtons();
    renderClientsTab();
}

function clientHasPushDisabled(client) {
    const userRecord = _getUserRecord(client.email, client.whatsapp);
    return !userRecord?.pushEnabled;
}

function togglePushFilter() {
    clientPushFilter = !clientPushFilter;
    if (clientPushFilter) _clearOtherFilters('push');
    _syncFilterButtons();
    renderClientsTab();
}


// ===== Clients Tab =====

function getAllClients() {
    const allBookings = BookingStorage.getAllBookings();
    const clientsMap = {};
    // Indici O(1) per evitare il loop annidato su ogni booking
    const phoneIndex = {};   // normPhone → key in clientsMap
    const emailIndex = {};   // email.lower → key in clientsMap

    function _findKey(normPhone, email) {
        if (normPhone && phoneIndex[normPhone]) return phoneIndex[normPhone];
        const emailLow = email ? email.toLowerCase() : '';
        if (emailLow && emailIndex[emailLow]) return emailIndex[emailLow];
        return null;
    }
    function _registerKey(key, normPhone, email) {
        if (normPhone) phoneIndex[normPhone] = key;
        const emailLow = email ? email.toLowerCase() : '';
        if (emailLow) emailIndex[emailLow] = key;
    }

    allBookings.forEach(booking => {
        const normPhone = normalizePhone(booking.whatsapp);
        let matchedKey = _findKey(normPhone, booking.email);
        if (!matchedKey) {
            matchedKey = normPhone || booking.email;
            clientsMap[matchedKey] = { userId: booking.userId || null, name: booking.name, whatsapp: booking.whatsapp, email: booking.email, bookings: [] };
            _registerKey(matchedKey, normPhone, booking.email);
        } else if (!clientsMap[matchedKey].userId && booking.userId) {
            // Arricchisci con userId se il record esistente non lo aveva
            clientsMap[matchedKey].userId = booking.userId;
        }
        clientsMap[matchedKey].bookings.push(booking);
    });

    // Include registered users even without bookings + arricchisci userId per match esistenti
    UserStorage.getAll().forEach(user => {
        const normPhone = normalizePhone(user.whatsapp);
        const existingKey = _findKey(normPhone, user.email);
        if (existingKey) {
            // Cliente già presente (tramite booking): propaga userId dal profilo se mancante
            if (!clientsMap[existingKey].userId && user.userId) {
                clientsMap[existingKey].userId = user.userId;
            }
        } else {
            const key = normPhone || user.email;
            if (key) {
                clientsMap[key] = { userId: user.userId || null, name: user.name, whatsapp: user.whatsapp || '', email: user.email || '', bookings: [] };
                _registerKey(key, normPhone, user.email);
            }
        }
    });

    Object.values(clientsMap).forEach(c => {
        c.bookings.sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
    });

    return Object.values(clientsMap).sort((a, b) => a.name.localeCompare(b.name));
}

var liveSearchClients = _debounce(function() {
    const query = document.getElementById('clientSearchInput').value.trim();
    const dropdown = document.getElementById('clientsSearchDropdown');
    if (!query) {
        dropdown.style.display = 'none';
        return;
    }
    const q = query.toLowerCase();
    const allClients = getAllClients();
    const matches = allClients.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.whatsapp.toLowerCase().includes(q) ||
        (c.email && c.email.toLowerCase().includes(q))
    );
    if (matches.length === 0) {
        dropdown.innerHTML = '<div class="dropdown-no-results">Nessun risultato</div>';
    } else {
        dropdown.innerHTML = matches.slice(0, 15).map((c, i) => {
            return `<div class="dropdown-item" onclick="selectClientFromDropdown(${i})">
                <span class="dropdown-item-name">${_escHtml(c.name)}</span>
            </div>`;
        }).join('');
        dropdown._matches = matches;
    }
    dropdown.style.display = 'block';
}, 200);

function closeClientsSearchDropdown() {
    const dropdown = document.getElementById('clientsSearchDropdown');
    if (dropdown) dropdown.style.display = 'none';
}

function clearClientsSearch() {
    const searchInput = document.getElementById('clientSearchInput');
    if (searchInput) searchInput.value = '';
    closeClientsSearchDropdown();
    // Ripristina stat cards e filtri
    const statsGrid = document.getElementById('clientsStatsGrid');
    const filterToggle = document.getElementById('clientsFilterToggle');
    if (statsGrid) statsGrid.style.display = '';
    if (filterToggle) filterToggle.style.display = '';
    // Nascondi lista (torna allo stato iniziale)
    const listEl = document.getElementById('clientsList');
    if (listEl) { listEl.innerHTML = ''; listEl.style.display = 'none'; }
    clientsListMode = null;
    _updateClientsHints();
}

function selectClientFromDropdown(index) {
    const dropdown = document.getElementById('clientsSearchDropdown');
    const matches = dropdown._matches;
    if (!matches || !matches[index]) return;
    const client = matches[index];

    // Show only the selected client's card with close button
    const container = document.getElementById('clientsList');
    container.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'search-results-header';
    header.innerHTML = '<h4>Risultato ricerca</h4><button class="btn-clear-search" onclick="clearClientsSearch()">✕ Chiudi</button>';
    container.appendChild(header);
    const card = createClientCard(client, 0);
    card.classList.add('open');
    container.appendChild(card);
    container.style.display = '';

    closeClientsSearchDropdown();
    document.getElementById('clientSearchInput').value = client.name;
    // Nascondi stat cards e filtri durante la ricerca
    const statsGrid = document.getElementById('clientsStatsGrid');
    const filterToggle = document.getElementById('clientsFilterToggle');
    const filterChips = document.getElementById('clientsFilterChips');
    if (statsGrid) statsGrid.style.display = 'none';
    if (filterToggle) filterToggle.style.display = 'none';
    if (filterChips) filterChips.style.display = 'none';
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}


let clientsListMode = null; // null = hidden, 'total' | 'active'

function getActiveClients() {
    const allClients = getAllClients();
    const bookings = BookingStorage.getAllBookings();
    const now = new Date();
    const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate());
    const oneMonthAhead = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
    const pad = n => String(n).padStart(2, '0');
    const localDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const cutoffFrom = localDate(twoMonthsAgo);
    const cutoffTo   = localDate(oneMonthAhead);

    const activeEmails = new Set();
    const activePhones = new Set();
    bookings.forEach(b => {
        if (b.status === 'cancelled') return;
        const d = b.date;
        if (d >= cutoffFrom && d <= cutoffTo) {
            if (b.email) activeEmails.add(b.email.toLowerCase());
            if (b.whatsapp) activePhones.add(normalizePhone(b.whatsapp));
        }
    });

    return allClients.filter(c => {
        if (c.email && activeEmails.has(c.email.toLowerCase())) return true;
        if (c.whatsapp && activePhones.has(normalizePhone(c.whatsapp))) return true;
        return false;
    });
}

function renderClientsSummary() {
    const allClients = getAllClients();
    const activeClients = getActiveClients();
    document.getElementById('clientsTotalCount').textContent = allClients.length;
    document.getElementById('clientsActiveCount').textContent = activeClients.length;
    const sub = document.getElementById('clientsPageSub');
    if (sub) sub.textContent = `${allClients.length} totali · ${activeClients.length} attivi`;
}

function toggleClientsTotalList() {
    clientsListMode = clientsListMode === 'total' ? null : 'total';
    _updateClientsHints();
    renderClientsTab();
}

function toggleClientsActiveList() {
    clientsListMode = clientsListMode === 'active' ? null : 'active';
    _updateClientsHints();
    renderClientsTab();
}

function _updateClientsHints() {
    const totalHint = document.getElementById('clientsTotalHint');
    const activeHint = document.getElementById('clientsActiveHint');
    if (totalHint) totalHint.textContent = clientsListMode === 'total' ? 'Nascondi ▲' : 'Dettagli ▼';
    if (activeHint) activeHint.textContent = clientsListMode === 'active' ? 'Nascondi ▲' : 'Dettagli ▼';
}

async function refreshClients() {
    const btn = document.getElementById('refreshClientsBtn');
    if (btn) { btn.textContent = '↻ Caricamento...'; btn.disabled = true; }
    try {
        await UserStorage.syncUsersFromSupabase();
        renderClientsTab();
    } catch (e) {
        console.error('[refreshClients] error:', e);
        if (typeof showToast === 'function') showToast('⚠️ Errore ricarica clienti. Riprova.', 'error', 4000);
    } finally {
        if (btn) { btn.textContent = '↻ Ricarica'; btn.disabled = false; }
    }
}

/**
 * Refreshes only the currently open client card in-place (no full re-render).
 * Works both in "list" mode and "single card from search" mode.
 * Falls back to full renderClientsTab() if the card cannot be found.
 */
function _refreshOpenClientCard(whatsapp, email) {
    renderClientsSummary();

    const normPhone = normalizePhone(whatsapp);
    const emailLow  = (email || '').toLowerCase();

    // Find the open card element in the DOM
    const container = document.getElementById('clientsList');
    if (!container) { renderClientsTab(); return; }
    const openCard = container.querySelector('.client-card.open');
    if (!openCard) { renderClientsTab(); return; }

    // Determine what index the card currently has
    const oldId = openCard.id; // e.g. "client-card-0"

    // Get fresh client data
    const allClients = getAllClients();
    const client = allClients.find(c =>
        (normPhone && normalizePhone(c.whatsapp) === normPhone) ||
        (emailLow && (c.email || '').toLowerCase() === emailLow)
    );
    if (!client) {
        // Client no longer exists (e.g. all bookings deleted) — full re-render
        openClientIndex = null;
        renderClientsTab();
        return;
    }

    // Build a new card with the same index (keeps DOM position)
    const idxMatch = oldId.match(/client-card-(\d+)/);
    const cardIndex = idxMatch ? parseInt(idxMatch[1], 10) : 0;
    const newCard = createClientCard(client, cardIndex);
    newCard.classList.add('open');

    openCard.replaceWith(newCard);
    openClientIndex = cardIndex;
}

function _activeFilterLabel() {
    if (clientCertFilter)    return '🏥 Senza certificato';
    if (clientAssicFilter)   return '📋 Senza assicurazione';
    if (clientAnagFilter)    return '📝 Senza anagrafica';
    if (clientBonusFilter)   return '🎁 Senza bonus';
    if (clientPrivacyFilter) return '🔒 Anonimi';
    if (clientPushFilter)    return '🔕 Notifiche Disattivate';
    return '';
}

function renderClientsTab() {
    renderClientsSummary();
    // Ripristina stat cards e filtri (nascosti durante ricerca)
    const statsGrid = document.getElementById('clientsStatsGrid');
    const filterToggle = document.getElementById('clientsFilterToggle');
    const filterResult = document.getElementById('clientsFilterResult');
    if (filterToggle) filterToggle.style.display = '';
    // Pulisci campo ricerca
    const searchInput = document.getElementById('clientSearchInput');
    if (searchInput) searchInput.value = '';
    closeClientsSearchDropdown();
    const listEl = document.getElementById('clientsList');
    const hasFilter = clientCertFilter || clientAssicFilter || clientAnagFilter || clientBonusFilter || clientPrivacyFilter || clientPushFilter;

    // Nasconde stat cards e mostra conteggio filtrato quando un filtro è attivo
    if (statsGrid) statsGrid.style.display = hasFilter ? 'none' : '';
    if (filterResult) filterResult.style.display = hasFilter ? '' : 'none';

    if (!clientsListMode && !hasFilter) {
        if (listEl) listEl.style.display = 'none';
        return;
    }
    if (listEl) listEl.style.display = '';
    // Se un filtro è attivo senza lista, usa tutti i clienti come base
    const baseClients = clientsListMode === 'active' ? getActiveClients() : getAllClients();
    let filtered = baseClients;
    if (clientCertFilter)  filtered = filtered.filter(clientHasCertIssue);
    if (clientAssicFilter) filtered = filtered.filter(clientHasAssicIssue);
    if (clientAnagFilter)  filtered = filtered.filter(clientHasAnagIssue);
    if (clientBonusFilter) filtered = filtered.filter(clientHasBonusIssue);
    if (clientPrivacyFilter) filtered = filtered.filter(clientHasPrivacy);
    if (clientPushFilter)    filtered = filtered.filter(clientHasPushDisabled);

    // Aggiorna conteggio filtrato
    if (hasFilter && filterResult) {
        filterResult.innerHTML = `<span class="filter-result-label">${_activeFilterLabel()}</span><span class="filter-result-count">${filtered.length}</span>`;
    }

    const container = document.getElementById('clientsList');
    container.innerHTML = '';

    if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-slot">Nessun cliente trovato</div>';
        return;
    }

    filtered.forEach((client, index) => {
        container.appendChild(createClientCard(client, index));
    });

    // Restore previously open card
    if (openClientIndex !== null) {
        const card = document.getElementById(`client-card-${openClientIndex}`);
        if (card) card.classList.add('open');
    }
}

function toggleClientCard(id, idx) {
    const card = document.getElementById(id);
    if (!card) return;
    const isOpen = card.classList.toggle('open');
    openClientIndex = isOpen ? idx : null;
}

function createClientCard(client, index) {
    const card = document.createElement('div');
    card.className = 'client-card';
    card.id = `client-card-${index}`;

    const activeBookings = client.bookings.filter(b => b.status !== 'cancelled');
    const totalBookings = activeBookings.length;
    const totalPaid   = activeBookings.filter(b => b.paid && b.paymentMethod !== 'lezione-gratuita').reduce((s, b) => s + getBookingPrice(b), 0);
    const totalFree   = activeBookings.filter(b => b.paid && b.paymentMethod === 'lezione-gratuita').reduce((s, b) => s + getBookingPrice(b), 0);
    const totalUnpaid = activeBookings.filter(b => !b.paid && bookingHasPassed(b) && b.status !== 'cancellation_requested').reduce((s, b) => s + getBookingPrice(b) - (b.creditApplied || 0), 0);
    const credit      = CreditStorage.getBalance(client.whatsapp, client.email);
    const manualDebt  = ManualDebtStorage.getBalance(client.whatsapp, client.email) || 0;
    const netBalance  = Math.round((credit - manualDebt - totalUnpaid) * 100) / 100;

    // Certificato medico e Assicurazione dal profilo utente
    const userRecord  = _getUserRecord(client.email, client.whatsapp);
    const certScad    = userRecord?.certificatoMedicoScadenza || '';
    const assicScad2  = userRecord?.assicurazioneScadenza || '';
    const _wEscBadge  = (client.whatsapp || '').replace(/'/g, "\\'");
    const _emEscBadge = (client.email || '').replace(/'/g, "\\'");
    const _nEscBadge  = client.name.replace(/'/g, "\\'");
    const _mkBadge = (scad, missingLabel, expiredPrefix, expiringPrefix, okPrefix, onClickAttr) => {
        const oc = onClickAttr ? ` onclick="event.stopPropagation(); ${onClickAttr}"` : '';
        const tag = onClickAttr ? 'button' : 'span';
        const tagAttr = onClickAttr ? ' type="button"' : '';
        const clickCls = onClickAttr ? ' cedit-cert-badge--clickable' : '';
        if (!scad) return `<${tag}${tagAttr} class="cedit-cert-badge cedit-cert-expired${clickCls}"${oc}>${missingLabel}</${tag}>`;
        const today = _localDateStr();
        const [y, m, d] = scad.split('-');
        const label = `${d}/${m}/${y}`;
        if (scad < today) return `<${tag}${tagAttr} class="cedit-cert-badge cedit-cert-expired${clickCls}"${oc}>${expiredPrefix} ${label}</${tag}>`;
        const daysLeft = Math.ceil((new Date(scad + 'T00:00:00') - new Date()) / 86400000);
        if (daysLeft <= 30) return `<${tag}${tagAttr} class="cedit-cert-badge cedit-cert-expiring${clickCls}"${oc}>${expiringPrefix} ${label}</${tag}>`;
        return `<${tag}${tagAttr} class="cedit-cert-badge cedit-cert-ok${clickCls}"${oc}>${okPrefix} ${label}</${tag}>`;
    };
    const bonus = BonusStorage.getBonus(client.whatsapp, client.email, client.userId);
    const certDisplay  = BookingBadgesStorage.getShowCert()
        ? _mkBadge(certScad, '🏥 Imposta scadenza certificato medico', '🏥 Cert. scaduto il', '⏳ Cert. scade il', '✅ Cert. valido fino al',
            `openCertModal(this,'${_emEscBadge}','${_wEscBadge}','${_nEscBadge}')`)
        : '';
    const assicDisplay = BookingBadgesStorage.getShowAssic()
        ? _mkBadge(assicScad2, '📋 Imposta scadenza assicurazione', '📋 Assic. scaduta il', '⏳ Assic. scade il', '📋 Assic. valida fino al',
            `openAssicModal(this,'${_emEscBadge}','${_wEscBadge}','${_nEscBadge}')`)
        : '';
    const docFirmato2  = userRecord?.documentoFirmato || false;
    const docDisplay   = BookingBadgesStorage.getShowDoc()
        ? `<button type="button" class="cedit-cert-badge cedit-cert-badge--clickable ${docFirmato2 ? 'cedit-cert-ok' : 'cedit-cert-expired'}" onclick="event.stopPropagation(); openEditClientPopup(${index},'${_wEscBadge}','${_emEscBadge}','${_nEscBadge}')">${docFirmato2 ? '✅ Documento firmato' : '📝 Documento non firmato'}</button>`
        : '';
    // Anagrafica incompleta (CF, indirizzo)
    const hasAnagComplete = userRecord?.codiceFiscale && userRecord?.indirizzoVia && userRecord?.indirizzoPaese && userRecord?.indirizzoCap;
    const anagDisplay = (BookingBadgesStorage.getShowAnag() && !hasAnagComplete)
        ? `<button type="button" class="cedit-cert-badge cedit-cert-badge--clickable cedit-cert-expiring" onclick="event.stopPropagation(); openEditClientPopup(${index},'${_wEscBadge}','${_emEscBadge}','${_nEscBadge}')">📋 Completa anagrafica</button>`
        : '';

    // Unifica: "da pagare" = booking non pagati + debito manuale - credito
    const grossDebt    = Math.round((totalUnpaid + manualDebt) * 100) / 100;
    const displayDebt  = Math.round(Math.max(0, grossDebt - credit) * 100) / 100;
    const displayCredit = Math.round(Math.max(0, credit - grossDebt) * 100) / 100;
    const totalAllPaid = Math.round((totalPaid + Math.min(credit, grossDebt)) * 100) / 100;
    let statsHTML = `<span class="cstat">${totalBookings} prenotazioni</span>`;
    if (totalAllPaid  > 0) statsHTML += `<span class="cstat paid">€${totalAllPaid} pagato</span>`;
    if (totalFree     > 0) statsHTML += `<span class="cstat free">🎁 €${totalFree} regalate</span>`;
    if (displayDebt   > 0) statsHTML += `<span class="cstat unpaid">€${displayDebt} da pagare</span>`;
    if (displayCredit > 0) statsHTML += `<span class="cstat credit">💳 +€${displayCredit}</span>`;

    const methodLabel = m => ({ contanti: '💵 Contanti', 'contanti-report': '🧾 Contanti con Report', carta: '💳 Carta', iban: '🏦 Bonifico', credito: '✨ Credito', stripe: '💳 Stripe', 'lezione-gratuita': '🎁 Gratuita' }[m] || '—');
    const fmtPaidAt = iso => {
        if (!iso) return '<span style="color:#ccc">—</span>';
        const d = new Date(iso);
        return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    };

    const bookingRows = client.bookings.map((b, bIdx) => {
        const dateStr = b.date.split('-').reverse().join('/');
        const isCancelPending  = b.status === 'cancellation_requested';
        const isCancelled      = b.status === 'cancelled';
        const rowClass = [
            'pag-item',
            bookingHasPassed(b) ? '' : 'future-booking',
            isCancelPending ? 'row-cancel-pending' : '',
            isCancelled     ? 'row-cancelled'      : ''
        ].filter(Boolean).join(' ');
        const nEsc = b.name.replace(/'/g, "\\'");
        const isPartialCredit = !b.paid && (b.creditApplied || 0) > 0;
        const statusCell = isCancelled
            ? `<span class="payment-status" style="background:#f3f4f6;color:#6b7280">✕ Annullata</span>`
            : isCancelPending
                ? `<span class="payment-status" style="background:#fef3c7;color:#92400e">⏳ Annullamento</span>`
                : isPartialCredit
                    ? `<span class="payment-status" style="background:#ede9fe;color:#5b21b6">💳 Parziale (€${getBookingPrice(b) - b.creditApplied} da pagare)</span>`
                    : `<span class="payment-status ${b.paid ? 'paid' : 'unpaid'}">${b.paid ? '✓ Pagato' : 'Non pagato'}</span>`;
        return `<tr id="brow-${b.id}" class="${rowClass}"${bIdx >= 5 ? ' style="display:none"' : ''}>
            <td>${dateStr}</td>
            <td>${b.time}</td>
            <td>${SLOT_NAMES[b.slotType]}</td>
            <td>${statusCell}</td>
            <td>${(isCancelPending || isCancelled) ? '—' : methodLabel(b.paymentMethod)}</td>
            <td class="paidat-cell">${(isCancelPending || isCancelled) ? '—' : fmtPaidAt(b.paidAt)}</td>
            <td class="booking-actions">
                ${!isCancelled ? `<button class="btn-row-edit" onclick="startEditBookingRow('${b.id}', ${index})" title="Modifica">✏️</button>` : ''}
                <button class="btn-row-delete" onclick="deleteBookingFromClients('${b.id}', '${nEsc}')" title="Elimina">🗑️</button>
            </td>
        </tr>`;
    });
    const bookingsHTML = bookingRows.join('');
    const tbodyId = `tbody-brows-${index}`;
    const bTotal = bookingRows.length;
    const showMoreBooksBtn = bTotal > 5
        ? `<button class="show-more-btn" onclick="_showMoreItems(this,10)" data-container="${tbodyId}" data-shown="5" data-total="${bTotal}" style="margin-top:0.5rem;">▼ Mostra altri ${Math.min(10, bTotal - 5)}</button>`
        : '';

    // Build full transaction list (same logic as renderTransazioni in prenotazioni.html)
    const normCPhone = normalizePhone(client.whatsapp);
    const matchCli = (w, e) =>
        (normCPhone && normalizePhone(w) === normCPhone) ||
        (client.email && e && e.toLowerCase() === client.email.toLowerCase());
    const txMethodMap = { contanti: '💵 Contanti', 'contanti-report': '🧾 Contanti con Report', carta: '💳 Carta', iban: '🏦 Bonifico', credito: '💳 Credito', stripe: '💳 Stripe', 'lezione-gratuita': '🎁 Gratuita' };
    const txEntries = [];

    // 1. Paid bookings
    BookingStorage.getAllBookings()
        .filter(b => matchCli(b.whatsapp, b.email) && b.paid)
        .forEach(b => {
            const price = getBookingPrice(b);
            if (!price) return;
            const [by, bm, bd] = b.date.split('-');
            const isFree = b.paymentMethod === 'lezione-gratuita';
            txEntries.push({
                date: new Date(b.paidAt || `${b.date}T12:00:00`),
                icon: '🏋️', label: SLOT_NAMES[b.slotType] || b.slotType,
                sub: `${bd}/${bm}/${by} · ${txMethodMap[b.paymentMethod] || b.paymentMethod || ''}`,
                amount: isFree ? 0 : -price,
                freeLesson: isFree,
                txType: 'booking', txId: b.id, txName: b.name
            });
        });

    // 2. Credit entries (positive = credit loads, negative = deductions) + informational payment records (amount=0 with displayAmount)
    //    Escludi rimborsi di cancellazione e auto-pagamenti lezioni (già mostrati come booking al punto 1)
    const creditRec2 = CreditStorage.getRecord(client.whatsapp, client.email);
    (creditRec2?.history || [])
        .filter(e => !e.hiddenRefund && !/^Rimborso (cancellazione|annullamento) lezione/i.test(e.note || '') &&
            !/^(Auto-pagamento|Pagamento automatico|Pagamento lezione)/i.test(e.note || '') &&
            (e.amount !== 0 || (e.displayAmount || 0) > 0))
        .forEach(e => {
            txEntries.push({
                date: new Date(e.date), icon: e.amount < 0 ? '🔻' : '💳',
                label: e.note || (e.amount < 0 ? 'Deduzione credito' : 'Credito aggiunto'),
                sub: '', amount: e.displayAmount !== undefined ? e.displayAmount : e.amount,
                txType: 'credit', txEntryDate: e.date
            });
        });

    // 3. Manual debt history — solo addebiti (amount > 0); i "Saldato" sono nascosti
    //    perché il pagamento cash appare già come entry credito positiva
    const debtRec2 = ManualDebtStorage.getRecord(client.whatsapp, client.email);
    (debtRec2?.history || []).filter(e => e.amount > 0).forEach(e => {
        txEntries.push({
            date: new Date(e.date),
            icon: '✏️',
            label: e.note || 'Addebito',
            sub: '',
            amount: -e.amount,
            txType: 'debt', txEntryDate: e.date
        });
    });

    txEntries.sort((a, b) => b.date - a.date);

    const fmtDTx = d => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;


    // ── Schede assegnate ──────────────────────────────────────────────────
    const clientUserId = userRecord?.id || null;
    const clientPlans = clientUserId ? WorkoutPlanStorage.getPlansByUser(clientUserId) : [];
    let schedeHTML = '';
    if (clientPlans.length > 0) {
        const planRows = clientPlans.map(plan => {
            const badge = plan.active
                ? '<span class="schede-badge-active" style="font-size:0.7rem;padding:1px 6px;margin-left:6px;">Attiva</span>'
                : '<span class="schede-badge-inactive" style="font-size:0.7rem;padding:1px 6px;margin-left:6px;">Inattiva</span>';
            const exCount = (plan.workout_exercises || []).length;
            const days = [...new Set((plan.workout_exercises || []).map(e => e.day_label))];
            return `<div class="client-scheda-row">
                <div class="client-scheda-info">
                    <span class="client-scheda-name">${_escHtml(plan.name)}${badge}</span>
                    <span class="client-scheda-meta">${exCount} esercizi · ${days.length} giorn${days.length === 1 ? 'o' : 'i'}</span>
                </div>
                <div class="client-scheda-actions">
                    <button class="btn-row-edit" onclick="event.stopPropagation(); clientSaveAsTemplate('${plan.id}', '${_escHtml(plan.name).replace(/'/g, "\\'")}')" title="Salva come template">📋</button>
                    <button class="btn-row-edit" onclick="event.stopPropagation(); clientGoToEditScheda('${plan.id}')" title="Modifica scheda">✏️</button>
                    <button class="btn-row-delete" onclick="event.stopPropagation(); clientDeleteScheda('${plan.id}', '${_escHtml(plan.name)}')" title="Rimuovi scheda">🗑️</button>
                </div>
            </div>`;
        }).join('');
        schedeHTML = `<div class="client-schede-section">
            <h4>📋 Schede assegnate</h4>
            ${planRows}
        </div>`;
    }

    const wEsc  = client.whatsapp.replace(/'/g, "\\'");
    const emEsc = (client.email || '').replace(/'/g, "\\'");
    const nEsc  = client.name.replace(/'/g, "\\'");

    // Avatar iniziali (max 2 lettere)
    const initials = (client.name || '?').trim().split(/\s+/).map(w => w[0] || '').join('').toUpperCase().slice(0, 2);
    const phoneRaw = (client.whatsapp || '').replace(/^\+39\s*/, '');
    const phoneTel = (client.whatsapp || '').replace(/\s+/g, '');

    // 3 celle stat: Prenot. Future / Bonus / Saldo
    const futureBookingsCount = activeBookings.filter(b => !bookingHasPassed(b)).length;
    const saldoCls = netBalance > 0 ? 'green' : (netBalance < 0 ? 'red' : '');
    const saldoSign = netBalance > 0 ? '+' : (netBalance < 0 ? '-' : '');
    const saldoVal = `${saldoSign}€${Math.abs(netBalance)}`;
    const bonusCls = bonus > 0 ? '' : 'red';
    const statsGridHTML = `
        <div class="cv2-stat blue"><div class="v">${futureBookingsCount}</div><div class="l">Prenot. Future</div></div>
        <div class="cv2-stat ${bonusCls}"><div class="v">${bonus}</div><div class="l">Bonus</div></div>
        <div class="cv2-stat ${saldoCls}"><div class="v">${saldoVal}</div><div class="l">Saldo</div></div>
    `;

    let creditHTML = '';
    if (txEntries.length > 0) {
        const txTotal = txEntries.length;
        const txShowMoreBtn = txTotal > 5
            ? `<button class="show-more-btn" onclick="_showMoreItems(this,10)" data-container="tx-list-${index}" data-shown="5" data-total="${txTotal}" style="margin-top:0.35rem;">▼ Mostra altri ${Math.min(10, txTotal - 5)}</button>`
            : '';
        creditHTML = `<div class="client-credit-section">
            <h4>📊 Storico transazioni — saldo: ${netBalance >= 0 ? '+' : ''}€${netBalance}</h4>
            <div class="client-credit-history" id="tx-list-${index}">
                ${txEntries.map((e, eTx) => {
                    const pos = e.amount > 0;
                    const sign = e.freeLesson ? '' : ((e.cancelled || e.amount < 0) ? '-' : '+');
                    const cls  = e.freeLesson ? 'free' : (pos ? 'plus' : 'minus');
                    const cleanLabel = (e.label || '')
                        .replace(/^[💵💳🏦✨🎁]\s*/, '')
                        .replace(/\s+ricevuto$/i, '');
                    let delBtn = '';
                    if (e.txType === 'booking') {
                        delBtn = `<button class="btn-tx-delete" onclick="event.stopPropagation(); deleteTxEntry('booking', '${e.txId.replace(/'/g, "\\'")}', '${nEsc}', ${index})" title="Elimina transazione">🗑️</button>`;
                    } else if (e.txType === 'credit') {
                        delBtn = `<button class="btn-tx-delete" onclick="event.stopPropagation(); deleteTxEntry('credit', '${(e.txEntryDate || '').replace(/'/g, "\\'")}', '${wEsc}', ${index}, '${emEsc}')" title="Elimina transazione">🗑️</button>`;
                    } else if (e.txType === 'debt') {
                        delBtn = `<button class="btn-tx-delete" onclick="event.stopPropagation(); deleteTxEntry('debt', '${(e.txEntryDate || '').replace(/'/g, "\\'")}', '${wEsc}', ${index}, '${emEsc}')" title="Elimina transazione">🗑️</button>`;
                    }
                    return `<div class="credit-history-row pag-item"${eTx >= 5 ? ' style="display:none"' : ''}>
                        <span class="credit-history-date">${fmtDTx(e.date)}</span>
                        <span class="credit-history-icon">${e.icon}</span>
                        <span class="credit-history-note">${_escHtml(cleanLabel)}${e.sub ? ` <small style="opacity:0.7">${_escHtml(e.sub)}</small>` : ''}</span>
                        <span class="credit-history-amount ${cls}">${sign}€${Math.abs(e.amount).toFixed(2)}</span>
                        ${delBtn}
                    </div>`;
                }).join('')}
            </div>
            ${txShowMoreBtn}
        </div>`;
    }

    card.innerHTML = `
        <div class="client-card-header" onclick="toggleClientCard('client-card-${index}', ${index})">
            <div class="cv2-avatar" aria-hidden="true">${initials || '?'}</div>
            <div class="client-info-block">
                <div class="client-name">${_escHtml(client.name)} <button class="btn-edit-contact-icon" onclick="event.stopPropagation(); openEditClientPopup(${index}, '${wEsc}', '${emEsc}', '${nEsc}')" title="Modifica contatto">✏️</button></div>
                <div class="client-contacts">
                    ${phoneRaw ? `<a class="cv2-contact-link" href="tel:${_escHtml(phoneTel)}" onclick="event.stopPropagation()">📱 ${_escHtml(phoneRaw)}</a>` : ''}
                    ${client.email ? `<a class="cv2-contact-link" href="mailto:${_escHtml(client.email)}" onclick="event.stopPropagation()">✉️ ${_escHtml(client.email)}</a>` : ''}
                </div>
                <div class="cv2-badges-row">
                    ${certDisplay}${assicDisplay}${anagDisplay}${docDisplay}
                </div>
            </div>
            <div class="client-chevron">▼</div>
        </div>
        <div class="client-stats-block cv2-stats-grid" onclick="toggleClientCard('client-card-${index}', ${index})">${statsGridHTML}</div>
        <div class="client-card-body">
            <div class="client-bookings-section">
                <table class="client-bookings-table">
                    <thead><tr>
                        <th>Data</th><th>Ora</th><th>Tipo</th><th>Stato</th><th>Metodo</th><th>Data Pag.</th><th></th>
                    </tr></thead>
                    <tbody id="${tbodyId}">${bookingsHTML}</tbody>
                </table>
                ${showMoreBooksBtn}
            </div>
            ${schedeHTML}
            ${creditHTML}
        </div>
    `;

    return card;
}

// ── Schede helpers from Clienti tab ──────────────────────────────────────────
function clientGoToEditScheda(planId) {
    if (typeof _schedeEditPlan === 'function' && typeof switchTab === 'function') {
        switchTab('schede');
        _schedeEditPlan(planId);
    }
}

async function clientSaveAsTemplate(planId, planName) {
    const tplName = prompt('Nome del template:', planName);
    if (!tplName) return;
    try {
        await WorkoutPlanStorage.duplicatePlan(planId, null, tplName);
        if (typeof showToast === 'function') showToast('Template creato!', 'success');
    } catch (e) {
        console.error('clientSaveAsTemplate error:', e);
        if (typeof showToast === 'function') showToast('Errore creazione template', 'error');
    }
}

async function clientDeleteScheda(planId, planName) {
    if (!confirm(`Eliminare la scheda "${planName}" e tutti gli esercizi associati?`)) return;
    try {
        await WorkoutPlanStorage.deletePlan(planId);
        if (typeof showToast === 'function') showToast('Scheda eliminata', 'success');
        renderClientsTab();
    } catch (e) {
        console.error('clientDeleteScheda error:', e);
        if (typeof showToast === 'function') showToast('Errore eliminazione scheda', 'error');
    }
}

function openEditClientPopup(index, whatsapp, email, name) {
    // Cerca il client per email/whatsapp (non per indice, che cambia con i filtri attivi)
    const clients = getAllClients();
    const client = clients.find(c =>
        (email && c.email && c.email.toLowerCase() === email.toLowerCase()) ||
        (whatsapp && c.whatsapp && normalizePhone(c.whatsapp) === normalizePhone(whatsapp))
    ) || clients[index];
    if (!client) return;

    const userRecord = _getUserRecord(client.email, client.whatsapp);
    const certScad   = userRecord?.certificatoMedicoScadenza || '';
    const assicScad  = userRecord?.assicurazioneScadenza || '';
    const cf         = userRecord?.codiceFiscale || '';
    const via        = userRecord?.indirizzoVia || '';
    const paese      = userRecord?.indirizzoPaese || '';
    const cap        = userRecord?.indirizzoCap || '';
    const docFirmato = userRecord?.documentoFirmato || false;
    const stripeEn   = userRecord?.stripeEnabled || false;

    // Remove existing popup if any
    document.getElementById('editClientPopupOverlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'editClientPopupOverlay';
    overlay.className = 'edit-client-popup-overlay';
    overlay.innerHTML = `
        <div class="edit-client-popup">
            <div class="edit-client-popup-header">
                <h3>Modifica contatto</h3>
                <button class="edit-client-popup-close" onclick="closeEditClientPopup()">&times;</button>
            </div>
            <div class="edit-client-popup-body">
                <div class="edit-client-popup-section">
                    <h4>Dati personali</h4>
                    <label>Nome<input type="text" id="cedit-name-${index}" value="${_escHtml(client.name)}"></label>
                    <label>WhatsApp<input type="tel" id="cedit-phone-${index}" value="${_escHtml(client.whatsapp)}"></label>
                    <label>Email<input type="email" id="cedit-email-${index}" value="${_escHtml(client.email || '')}"></label>
                </div>
                <div class="edit-client-popup-section">
                    <h4>Dati fiscali</h4>
                    <label>Codice Fiscale<input type="text" id="cedit-cf-${index}" value="${_escHtml(cf)}" maxlength="16" style="text-transform:uppercase"></label>
                </div>
                <div class="edit-client-popup-section">
                    <h4>Indirizzo di residenza</h4>
                    <label>Via/Indirizzo<input type="text" id="cedit-via-${index}" value="${_escHtml(via)}"></label>
                    <div class="edit-client-popup-row">
                        <label class="edit-client-popup-flex2">Comune<input type="text" id="cedit-paese-${index}" value="${_escHtml(paese)}"></label>
                        <label class="edit-client-popup-flex1">CAP<input type="text" id="cedit-cap-${index}" value="${_escHtml(cap)}" maxlength="5"></label>
                    </div>
                </div>
                <div class="edit-client-popup-section">
                    <h4>Documenti</h4>
                    <div class="edit-client-popup-row">
                        <label class="edit-client-popup-flex1">Cert. Medico<input type="date" id="cedit-cert-${index}" value="${certScad}"></label>
                        <label class="edit-client-popup-flex1">Assicurazione<input type="date" id="cedit-assic-${index}" value="${assicScad}"></label>
                    </div>
                    <div class="cedit-toggle-row">
                        <label for="cedit-docfirmato-${index}" class="cedit-toggle-label">Documento firmato</label>
                        <label class="cedit-toggle-switch">
                            <input type="checkbox" id="cedit-docfirmato-${index}" ${docFirmato ? 'checked' : ''}>
                            <span class="cedit-toggle-slider"></span>
                        </label>
                    </div>
                    <div class="cedit-toggle-row">
                        <label for="cedit-stripe-${index}" class="cedit-toggle-label">Abilita Stripe</label>
                        <label class="cedit-toggle-switch">
                            <input type="checkbox" id="cedit-stripe-${index}" ${stripeEn ? 'checked' : ''}>
                            <span class="cedit-toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
            <div class="edit-client-popup-actions">
                <button class="btn-delete-client" onclick="event.stopPropagation(); deleteClientData(${index}, '${_escHtml(whatsapp)}', '${_escHtml(email)}')" title="Elimina tutti i dati del cliente">🗑️ Elimina</button>
                <button class="btn-reset-bonus" onclick="event.stopPropagation(); resetClientBonus('${_escHtml(whatsapp)}', '${_escHtml(email)}', '${_escHtml(client.name)}')" title="Ripristina bonus a 1 se è a 0">🎟️ Reset bonus</button>
                <button class="btn-cancel-edit" onclick="closeEditClientPopup()">Annulla</button>
                <button class="btn-save-edit" onclick="saveClientEdit(${index}, '${_escHtml(whatsapp)}', '${_escHtml(email)}')">Salva</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    // Prevent clicks on overlay from propagating to elements behind
    overlay.addEventListener('click', e => { e.stopPropagation(); });
    setTimeout(() => overlay.classList.add('open'), 10);
}

function closeEditClientPopup() {
    const overlay = document.getElementById('editClientPopupOverlay');
    if (overlay) {
        overlay.classList.remove('open');
        setTimeout(() => overlay.remove(), 200);
    }
}

function resetClientBonus(whatsapp, email, name) {
    const current = BonusStorage.getBonus(whatsapp, email);
    if (current === 1) {
        showToast('Il bonus è già a 1, nessun reset necessario.', 'info');
        return;
    }
    const all = BonusStorage._getAll();
    const key = BonusStorage._findKey(whatsapp, email);
    if (key && all[key]) {
        all[key].bonus = 1;
        all[key].lastResetMonth = BonusStorage._thisMonthStr();
        BonusStorage._save(all);
    } else {
        const normWa = normalizePhone(whatsapp) || '';
        const normEm = (email || '').toLowerCase();
        const newKey = `${normWa}||${normEm}`;
        all[newKey] = { name, whatsapp: normWa, email: normEm, bonus: 1, lastResetMonth: BonusStorage._thisMonthStr() };
        BonusStorage._save(all);
    }
    showToast('🎟️ Bonus ripristinato a 1!', 'success');
    closeEditClientPopup();
    renderClientsTab();
}

// Helper: aggiorna profilo locale (users), cert, assic, CF, indirizzo, sessione dopo rename
async function _saveClientEditLocalProfile(index, oldWhatsapp, oldEmail, newName, newWhatsapp, newEmail, newCert, newAssic, normOld, normNewPhone, extraFields) {
    let _profileSyncFailed = false;
    const users  = _getUsersFull();
    const oldEmailLow = (oldEmail || '').toLowerCase();
    let userIdx = users.findIndex(u => {
        const phoneMatch = normOld && normalizePhone(u.whatsapp) === normOld;
        const emailMatch = oldEmailLow && u.email && u.email.toLowerCase() === oldEmailLow;
        return phoneMatch || emailMatch;
    });

    if (userIdx === -1) {
        users.push({ name: newName, email: newEmail, whatsapp: normNewPhone, createdAt: new Date().toISOString() });
        userIdx = users.length - 1;
    }

    if (userIdx !== -1) {
        users[userIdx].name     = newName;
        users[userIdx].whatsapp = normNewPhone;
        if (newEmail) users[userIdx].email = newEmail;

        const oldCert = users[userIdx].certificatoMedicoScadenza || '';
        if (newCert !== oldCert) {
            users[userIdx].certificatoMedicoScadenza = newCert || null;
            if (!users[userIdx].certificatoMedicoHistory) users[userIdx].certificatoMedicoHistory = [];
            users[userIdx].certificatoMedicoHistory.push({ scadenza: newCert || null, aggiornatoIl: new Date().toISOString() });
        }
        const oldAssic = users[userIdx].assicurazioneScadenza || '';
        if (newAssic !== oldAssic) {
            users[userIdx].assicurazioneScadenza = newAssic || null;
            if (!users[userIdx].assicurazioneHistory) users[userIdx].assicurazioneHistory = [];
            users[userIdx].assicurazioneHistory.push({ scadenza: newAssic || null, aggiornatoIl: new Date().toISOString() });
        }

        // CF e indirizzo
        const ef = extraFields || {};
        if (ef.cf !== undefined)    users[userIdx].codiceFiscale   = ef.cf || null;
        if (ef.via !== undefined)   users[userIdx].indirizzoVia    = ef.via || null;
        if (ef.paese !== undefined) users[userIdx].indirizzoPaese  = ef.paese || null;
        if (ef.cap !== undefined)   users[userIdx].indirizzoCap    = ef.cap || null;
        if (ef.documentoFirmato !== undefined) users[userIdx].documentoFirmato = !!ef.documentoFirmato;
        if (ef.stripeEnabled !== undefined)    users[userIdx].stripeEnabled    = !!ef.stripeEnabled;

        _saveUsers(users);

        const _supaFields = { name: newName };
        if (newEmail) _supaFields.email = newEmail.toLowerCase();
        if (normNewPhone) _supaFields.whatsapp = normNewPhone;
        if (newCert !== oldCert) _supaFields.medical_cert_expiry = newCert || null;
        if (newAssic !== oldAssic) _supaFields.insurance_expiry = newAssic || null;
        if (ef.cf !== undefined)    _supaFields.codice_fiscale   = ef.cf || null;
        if (ef.via !== undefined)   _supaFields.indirizzo_via    = ef.via || null;
        if (ef.paese !== undefined) _supaFields.indirizzo_paese  = ef.paese || null;
        if (ef.cap !== undefined)   _supaFields.indirizzo_cap    = ef.cap || null;
        if (ef.documentoFirmato !== undefined) _supaFields.documento_firmato = !!ef.documentoFirmato;
        if (ef.stripeEnabled !== undefined)    _supaFields.stripe_enabled    = !!ef.stripeEnabled;
        // Usa i VECCHI valori per trovare il record nel DB (non i nuovi che non esistono ancora)
        const profileResult = await _updateSupabaseProfile(oldEmail, normOld, _supaFields);
        if (!profileResult.ok) {
            _profileSyncFailed = true;
            showToast('⚠️ Profilo locale aggiornato, ma errore Supabase: ' + profileResult.error, 'error');
        }

        const current = getCurrentUser();
        if (current) {
            const sessionPhone = normalizePhone(current.whatsapp);
            const sessionEmail = (current.email || '').toLowerCase();
            const isLogged = (normOld && sessionPhone === normOld) || (oldEmailLow && sessionEmail === oldEmailLow);
            if (isLogged) loginUser({ ...current, name: newName, email: newEmail || current.email, whatsapp: normNewPhone });
        }
    }

    openClientIndex = null;
    renderClientsTab();
    // Aggiorna anche la vista giornaliera admin (badge cert/doc/assic)
    if (typeof renderAdminDayView === 'function' && window._currentAdminDate) renderAdminDayView(window._currentAdminDate);
    // Se c'era una ricerca attiva, riesegui con il nome aggiornato
    const searchInput = document.getElementById('clientSearchInput');
    if (searchInput && searchInput.value.trim()) {
        searchInput.value = newName;
        liveSearchClients();
        // Auto-seleziona il cliente appena modificato
        const dropdown = document.getElementById('clientsSearchDropdown');
        if (dropdown && dropdown._matches && dropdown._matches.length > 0) {
            selectClientFromDropdown(0);
        }
    }
    if (!_profileSyncFailed) showToast('Contatto aggiornato.', 'success');
}

async function saveClientEdit(index, oldWhatsapp, oldEmail) {
    const newName     = document.getElementById(`cedit-name-${index}`).value.trim().replace(/\S+/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
    const newWhatsapp = document.getElementById(`cedit-phone-${index}`).value.trim();
    const newEmail    = document.getElementById(`cedit-email-${index}`).value.trim();
    const newCert     = document.getElementById(`cedit-cert-${index}`).value;
    const newAssic    = document.getElementById(`cedit-assic-${index}`).value;
    const newCf       = (document.getElementById(`cedit-cf-${index}`)?.value || '').trim().toUpperCase();
    const newVia      = (document.getElementById(`cedit-via-${index}`)?.value || '').trim();
    const newPaese    = (document.getElementById(`cedit-paese-${index}`)?.value || '').trim();
    const newCap      = (document.getElementById(`cedit-cap-${index}`)?.value || '').trim();
    const newDocFirmato = document.getElementById(`cedit-docfirmato-${index}`)?.checked || false;
    const newStripeEn   = document.getElementById(`cedit-stripe-${index}`)?.checked || false;
    if (!newName) { alert('Il nome è obbligatorio.'); return; }

    const normOld      = normalizePhone(oldWhatsapp);
    const normNewPhone = normalizePhone(newWhatsapp) || newWhatsapp;

    // ── 1-3. bookings + credits + manual_debts: atomico server-side ──
    if (typeof supabaseClient !== 'undefined') {
        // Mostra stato di caricamento sul bottone Salva
        const saveBtn = document.querySelector('#editClientPopupOverlay .btn-save-edit');
        if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Salvataggio...'; }

        try {
            const { data, error } = await _rpcWithTimeout(supabaseClient.rpc('admin_rename_client', {
                p_old_email:    oldEmail || '',
                p_old_whatsapp: normOld || null,
                p_new_name:     newName,
                p_new_email:    newEmail,
                p_new_whatsapp: normNewPhone,
            }));
            if (error) {
                console.error('[Supabase] admin_rename_client error:', error.message);
                alert('⚠️ Errore durante l\'aggiornamento: ' + error.message);
                return;
            }
            console.log('[admin_rename_client]', data);

            await Promise.all([
                BookingStorage.syncFromSupabase(),
                CreditStorage.syncFromSupabase(),
                ManualDebtStorage.syncFromSupabase(),
            ]);
            // Continua con profilo locale + cert/assic (awaited per feedback errori)
            await _saveClientEditLocalProfile(index, oldWhatsapp, oldEmail, newName, newWhatsapp, newEmail, newCert, newAssic, normOld, normNewPhone, { cf: newCf, via: newVia, paese: newPaese, cap: newCap, documentoFirmato: newDocFirmato, stripeEnabled: newStripeEn });
            closeEditClientPopup();
        } catch (e) {
            console.error('[saveClientEdit] exception:', e);
            alert('⚠️ Errore di rete. Riprova.');
        } finally {
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Salva'; }
        }
        return;
    }

    // Fallback client-side (offline)
    const bookings = BookingStorage.getAllBookings();
    bookings.forEach(b => {
        const phoneMatch = normOld && normalizePhone(b.whatsapp) === normOld;
        const emailMatch = oldEmail && b.email && b.email.toLowerCase() === oldEmail.toLowerCase();
        if (phoneMatch || emailMatch) {
            b.name     = newName;
            b.whatsapp = normNewPhone;
            b.email    = newEmail;
        }
    });
    BookingStorage.replaceAllBookings(bookings);

    const creditKey = CreditStorage._findKey(oldWhatsapp, oldEmail);
    if (creditKey) {
        const all = CreditStorage._getAll();
        all[creditKey].name     = newName;
        all[creditKey].whatsapp = normNewPhone;
        all[creditKey].email    = newEmail;
        CreditStorage._save(all);
    }

    const debtKey = ManualDebtStorage._findKey(oldWhatsapp, oldEmail);
    if (debtKey) {
        const all = ManualDebtStorage._getAll();
        all[debtKey].name     = newName;
        all[debtKey].whatsapp = normNewPhone;
        all[debtKey].email    = newEmail;
        ManualDebtStorage._save(all);
    }

    // Profilo locale + cert/assic + sessione
    await _saveClientEditLocalProfile(index, oldWhatsapp, oldEmail, newName, newWhatsapp, newEmail, newCert, newAssic, normOld, normNewPhone, { cf: newCf, via: newVia, paese: newPaese, cap: newCap, documentoFirmato: newDocFirmato, stripeEnabled: newStripeEn });
    closeEditClientPopup();
}

async function deleteClientData(index, whatsapp, email) {
    const pwd = prompt('Inserisci la password per eliminare tutti i dati del cliente:');
    if (pwd !== 'Palestra123') {
        if (pwd !== null) alert('Password errata.');
        return;
    }

    const clients = getAllClients();
    const client = clients.find(c =>
        (email && c.email && c.email.toLowerCase() === email.toLowerCase()) ||
        (whatsapp && c.whatsapp && normalizePhone(c.whatsapp) === normalizePhone(whatsapp))
    ) || clients[index];
    if (!client) return;
    const clientEmail = (client.email || email || '').toLowerCase();
    const clientPhone = normalizePhone(client.whatsapp || whatsapp || '');
    const clientName = client.name || '';

    if (!confirm(`Confermi l'eliminazione di TUTTI i dati di ${clientName}?\n\nPrenotazioni, crediti, debiti e bonus verranno eliminati permanentemente.`)) return;

    // 1. Elimina prenotazioni
    const allBookings = BookingStorage.getAllBookings();
    const kept = allBookings.filter(b => {
        if (clientEmail && b.email?.toLowerCase() === clientEmail) return false;
        if (clientPhone && b.whatsapp && normalizePhone(b.whatsapp) === clientPhone) return false;
        return true;
    });
    const removedBookings = allBookings.length - kept.length;
    BookingStorage.replaceAllBookings(kept);

    // 2. Elimina crediti
    const credits = CreditStorage._getAll();
    let removedCredits = false;
    for (const key of Object.keys(credits)) {
        const c = credits[key];
        if (clientEmail && (c.email || '').toLowerCase() === clientEmail) { delete credits[key]; removedCredits = true; }
        else if (clientPhone && key === clientPhone) { delete credits[key]; removedCredits = true; }
    }
    if (removedCredits) CreditStorage._save(credits);

    // 3. Elimina debiti
    const debts = ManualDebtStorage._getAll();
    let removedDebts = false;
    for (const key of Object.keys(debts)) {
        const d = debts[key];
        if (clientEmail && (d.email || '').toLowerCase() === clientEmail) { delete debts[key]; removedDebts = true; }
        else if (clientPhone && key === clientPhone) { delete debts[key]; removedDebts = true; }
    }
    if (removedDebts) ManualDebtStorage._save(debts);

    // 4. Elimina bonus
    const bonuses = BonusStorage._getAll();
    let removedBonus = false;
    for (const key of Object.keys(bonuses)) {
        const bn = bonuses[key];
        if (clientEmail && (bn.email || '').toLowerCase() === clientEmail) { delete bonuses[key]; removedBonus = true; }
        else if (clientPhone && key === clientPhone) { delete bonuses[key]; removedBonus = true; }
    }
    if (removedBonus) BonusStorage._save(bonuses);

    // 5. Supabase: elimina dati dal DB via RPC admin
    if (typeof supabaseClient !== 'undefined' && clientEmail) {
        try {
            const { data, error } = await _rpcWithTimeout(supabaseClient.rpc('admin_delete_client_data', { p_email: clientEmail }));
            if (error) console.error('[deleteClientData] RPC error:', error.message);
            else console.log('[deleteClientData] Supabase:', data);
        } catch (e) { console.error('[deleteClientData] Supabase error:', e); }
    }

    showToast(`Dati di ${clientName} eliminati (${removedBookings} prenotazioni rimosse).`, 'success');
    renderClientsTab();
}

function startEditBookingRow(bookingId, clientIndex) {
    const booking = BookingStorage.getAllBookings().find(b => b.id === bookingId);
    if (!booking) return;

    const row = document.getElementById(`brow-${bookingId}`);
    if (!row) return;

    row._origHTML  = row.innerHTML;
    row._origClass = row.className;
    row.classList.add('editing');

    const methods = [
        { v: 'contanti',         l: '💵 Contanti'             },
        { v: 'contanti-report',  l: '🧾 Contanti con Report' },
        { v: 'carta',            l: '💳 Carta'                },
        { v: 'iban',             l: '🏦 Bonifico'             },
        { v: 'credito',          l: '✨ Credito'              },
        { v: 'lezione-gratuita', l: '🎁 Gratuita'             }
    ];
    const methodOpts = methods.map(m =>
        `<option value="${m.v}" ${booking.paymentMethod === m.v ? 'selected' : ''}>${m.l}</option>`
    ).join('');

    const dateStr = booking.date.split('-').reverse().join('/');
    const paidAtInput = booking.paidAt
        ? new Date(booking.paidAt).toISOString().slice(0, 16)   // "YYYY-MM-DDTHH:MM" per datetime-local
        : '';

    row.innerHTML = `
        <td>${dateStr}</td>
        <td>${booking.time}</td>
        <td>${SLOT_NAMES[booking.slotType]}</td>
        <td>
            <select id="bedit-paid-${bookingId}">
                <option value="true"  ${booking.paid  ? 'selected' : ''}>✓ Pagato</option>
                <option value="false" ${!booking.paid ? 'selected' : ''}>✗ Non pagato</option>
            </select>
        </td>
        <td>
            <select id="bedit-method-${bookingId}">
                <option value="">—</option>
                ${methodOpts}
            </select>
        </td>
        <td>
            <input type="datetime-local" id="bedit-paidat-${bookingId}" value="${paidAtInput}" class="bedit-date-input">
        </td>
        <td class="booking-actions">
            <button class="btn-row-save"   onclick="saveBookingRowEdit('${bookingId}', ${clientIndex})" title="Salva">✓</button>
            <button class="btn-row-cancel" onclick="cancelBookingRowEdit('${bookingId}')" title="Annulla">✕</button>
        </td>
    `;
}

function cancelBookingRowEdit(bookingId) {
    const row = document.getElementById(`brow-${bookingId}`);
    if (!row || !row._origHTML) return;
    row.innerHTML  = row._origHTML;
    row.className  = row._origClass || '';
    delete row._origHTML;
    delete row._origClass;
}

async function saveBookingRowEdit(bookingId, clientIndex) {
    // Previeni doppio click: disabilita il bottone salva
    const _saveBtn = document.querySelector(`[onclick*="saveBookingRowEdit('${bookingId}'"]`);
    if (_saveBtn) _saveBtn.disabled = true;

    const newPaid   = document.getElementById(`bedit-paid-${bookingId}`).value === 'true';
    const newMethod = document.getElementById(`bedit-method-${bookingId}`).value;

    const bookings = BookingStorage.getAllBookings();
    const booking  = bookings.find(b => b.id === bookingId);
    if (!booking) { if (_saveBtn) _saveBtn.disabled = false; return; }

    // Controllo dati per metodi reportabili (carta/iban/stripe/contanti-report)
    if (['carta', 'iban', 'stripe', 'contanti-report'].includes(newMethod) && newPaid) {
        try { await ensureClientDataForCardPayment(booking.email, booking.whatsapp, booking.name, newMethod); }
        catch (e) { console.error('[Clients] ensureClientDataForCardPayment failed:', e); if (_saveBtn) _saveBtn.disabled = false; return; }
    }

    const oldPaid   = booking.paid;
    const oldMethod = booking.paymentMethod || '';
    const price     = getBookingPrice(booking);

    if (typeof supabaseClient !== 'undefined' && booking._sbId) {
        // ── Percorso Supabase: RPC atomica ────────────────────────────────────
        const slotPrices = { 'personal-training': 5, 'small-group': 10, 'group-class': 30 };
        (async () => {
            try {
                const newPaidAtRaw = document.getElementById(`bedit-paidat-${bookingId}`)?.value;
                const { data, error } = await _rpcWithTimeout(supabaseClient.rpc('admin_change_payment_method', {
                    p_booking_id:  booking._sbId,
                    p_new_paid:    newPaid,
                    p_new_method:  newMethod || null,
                    p_new_paid_at: newPaidAtRaw ? new Date(newPaidAtRaw).toISOString() : null,
                    p_slot_prices: slotPrices,
                }));
                if (error) {
                    if (error.message.includes('insufficient_credit')) {
                        const bal = data?.balance ?? '?';
                        alert(`Credito insufficiente (€${bal} < €${price})`);
                    } else {
                        console.error('[Supabase] admin_change_payment_method error:', error.message);
                        alert('⚠️ Errore: ' + error.message);
                    }
                    return;
                }

                await Promise.all([BookingStorage.syncFromSupabase(), CreditStorage.syncFromSupabase(), ManualDebtStorage.syncFromSupabase()]);
                invalidateStatsCache();
                renderClientsTab();
            } catch (ex) {
                console.error('[saveBookingRowEdit] unexpected error:', ex);
                alert('⚠️ Errore imprevisto. Riprova.');
            } finally {
                if (_saveBtn) _saveBtn.disabled = false;
            }
        })();
        return;
    }

    // ── Fallback: logica client-side ──────────────────────────────────────────
    const _editPayML = { contanti: 'Contanti', 'contanti-report': 'Contanti con Report', carta: 'Carta', iban: 'Bonifico', stripe: 'Stripe' };

    // Helper: offset refunded credit against any manual debt
    const _applyRefundToDebt = () => {
        const dBal = ManualDebtStorage.getBalance(booking.whatsapp, booking.email);
        if (dBal <= 0) return;
        const cBal = CreditStorage.getBalance(booking.whatsapp, booking.email);
        if (cBal <= 0) return;
        const toOff = Math.round(Math.min(dBal, cBal) * 100) / 100;
        ManualDebtStorage.addDebt(booking.whatsapp, booking.email, booking.name, -toOff, 'Compensato con credito');
        CreditStorage.addCredit(booking.whatsapp, booking.email, booking.name, -toOff, 'Applicato a debito manuale');
    };

    // Credit adjustments
    if (oldPaid && oldMethod === 'credito' && !newPaid) {
        // Was paid with credit → unpaid: refund
        CreditStorage.addCredit(booking.whatsapp, booking.email, booking.name, price,
            `Rimborso modifica pagamento ${booking.date} ${booking.time}`);
        _applyRefundToDebt();
    } else if (!oldPaid && newPaid && newMethod === 'credito') {
        // Unpaid → paid with credit: deduct
        const bal = CreditStorage.getBalance(booking.whatsapp, booking.email);
        if (bal < price) { alert(`Credito insufficiente (€${bal} < €${price})`); if (_saveBtn) _saveBtn.disabled = false; return; }
        CreditStorage.addCredit(booking.whatsapp, booking.email, booking.name, -price,
            `Pagamento lezione ${booking.date} ${booking.time} con credito`);
    } else if (oldPaid && oldMethod === 'credito' && newPaid && newMethod !== 'credito') {
        // Credit → other method: refund credit; record payment entry only if not free lesson
        CreditStorage.addCredit(booking.whatsapp, booking.email, booking.name, price,
            `Cambio metodo da credito — lezione ${booking.date} ${booking.time}`);
        _applyRefundToDebt();
        if (newMethod !== 'lezione-gratuita') {
            CreditStorage.addCredit(booking.whatsapp, booking.email, booking.name, 0,
                `${_editPayML[newMethod] || newMethod} ricevuto`,
                price, false, false, bookingId);
        }
    } else if (oldPaid && oldMethod !== 'credito' && oldMethod !== 'lezione-gratuita' && newPaid && newMethod === 'credito') {
        // Cash/card/iban → credit: remove old payment entry + deduct credit
        CreditStorage.hidePaymentEntryByBooking(booking.whatsapp, booking.email, bookingId);
        const bal = CreditStorage.getBalance(booking.whatsapp, booking.email);
        if (bal < price) { alert(`Credito insufficiente (€${bal} < €${price})`); return; }
        CreditStorage.addCredit(booking.whatsapp, booking.email, booking.name, -price,
            `Cambio metodo a credito — lezione ${booking.date} ${booking.time}`);
    } else if (oldPaid && oldMethod === 'lezione-gratuita' && newPaid && newMethod === 'credito') {
        // Free lesson → credit: deduct credit (no old entry to hide)
        const bal = CreditStorage.getBalance(booking.whatsapp, booking.email);
        if (bal < price) { alert(`Credito insufficiente (€${bal} < €${price})`); if (_saveBtn) _saveBtn.disabled = false; return; }
        CreditStorage.addCredit(booking.whatsapp, booking.email, booking.name, -price,
            `Cambio metodo a credito — lezione ${booking.date} ${booking.time}`);
    } else if (!oldPaid && newPaid && newMethod !== 'credito' && newMethod !== 'lezione-gratuita') {
        // Unpaid → paid with cash/card/iban: record incoming payment
        CreditStorage.addCredit(booking.whatsapp, booking.email, booking.name, 0,
            `${_editPayML[newMethod] || newMethod} ricevuto`,
            price, false, false, bookingId);
    } else if (oldPaid && oldMethod !== 'credito' && oldMethod !== 'lezione-gratuita' && !newPaid) {
        // Paid (cash/card/iban) → unpaid: hide the payment entry
        CreditStorage.hidePaymentEntryByBooking(booking.whatsapp, booking.email, bookingId);
    }

    const newPaidAtRaw = document.getElementById(`bedit-paidat-${bookingId}`)?.value;

    booking.paid          = newPaid;
    booking.paymentMethod = newMethod || undefined;
    if (newPaid) {
        // Use manually entered date if provided, otherwise keep existing or use now
        booking.paidAt = newPaidAtRaw
            ? new Date(newPaidAtRaw).toISOString()   // datetime-local già include HH:MM
            : (booking.paidAt || new Date().toISOString());
    } else {
        delete booking.paidAt;
    }

    BookingStorage.replaceAllBookings(bookings);
    renderClientsTab();
}

async function deleteBookingFromClients(bookingId, bookingName) {
    if (!confirm(`Eliminare la prenotazione di ${bookingName}?\n\nQuesta operazione non può essere annullata.`)) return;

    const bookings = BookingStorage.getAllBookings();
    const idx = bookings.findIndex(b => b.id === bookingId);
    if (idx === -1) { renderClientsTab(); return; }

    const b = bookings[idx];
    const clientWhatsapp = b.whatsapp;
    const clientEmail    = b.email;
    // Prezzi a zero: elimina solo il booking, NESSUN rimborso credito automatico.
    // Il credito si gestisce separatamente dallo storico transazioni.
    const zeroPrices = { 'personal-training': 0, 'small-group': 0, 'group-class': 0 };

    if (typeof supabaseClient !== 'undefined' && b._sbId) {
        try {
            const { data, error } = await _rpcWithTimeout(supabaseClient.rpc('admin_delete_booking_with_refund', {
                p_booking_id:  b._sbId,
                p_slot_prices: zeroPrices,
            }));
            if (error) {
                console.error('[Supabase] admin_delete_booking_with_refund error:', error.message);
                showToast('Errore durante l\'eliminazione: ' + error.message, 'error');
                return;
            }
            console.log('[admin_delete_booking_with_refund]', data);

            await BookingStorage.syncFromSupabase();
        } catch (ex) {
            console.error('[deleteBookingFromClients] unexpected error:', ex);
            showToast('Errore imprevisto. Riprova.', 'error');
            return;
        }
    } else {
        // Fallback client-side (offline) — elimina solo il booking, nessun rimborso
        bookings.splice(idx, 1);
        BookingStorage.replaceAllBookings(bookings);
    }

    invalidateStatsCache();
    showToast('Prenotazione eliminata.', 'success');
    _refreshOpenClientCard(clientWhatsapp, clientEmail);
}

// ── Elimina una singola transazione dallo storico (booking / credito / debito) ──
async function deleteTxEntry(type, idOrDate, whatsappOrName, index, email) {
    if (!confirm('Eliminare questa transazione?\n\nQuesta operazione non può essere annullata.')) return;

    // Resolve client identity for card refresh
    let clientWhatsapp = '', clientEmail = '';

    try {
    if (type === 'booking') {
        // Rimuove solo il PAGAMENTO, NON la prenotazione stessa.
        // Il booking torna "non pagato" — stessa logica di admin_change_payment_method.
        const bookings = BookingStorage.getAllBookings();
        const idx = bookings.findIndex(b => b.id === idOrDate);
        if (idx === -1) { showToast('Prenotazione non trovata.', 'error'); return; }
        const b = bookings[idx];
        clientWhatsapp = b.whatsapp;
        clientEmail    = b.email;
        const slotPrices = { 'personal-training': 5, 'small-group': 10, 'group-class': 30 };

        if (typeof supabaseClient !== 'undefined' && b._sbId) {
            // Usa admin_change_payment_method per marcare come non pagato (gestisce rimborso credito)
            const { data, error } = await _rpcWithTimeout(supabaseClient.rpc('admin_change_payment_method', {
                p_booking_id:  b._sbId,
                p_new_paid:    false,
                p_new_method:  null,
                p_new_paid_at: null,
                p_slot_prices: slotPrices,
            }));
            if (error) {
                console.error('[deleteTxEntry] booking payment reset RPC error:', error.message);
                showToast('Errore: ' + error.message, 'error');
                return;
            }
            console.log('[deleteTxEntry] booking payment removed:', data);

            await Promise.all([
                BookingStorage.syncFromSupabase(),
                CreditStorage.syncFromSupabase(),
                ManualDebtStorage.syncFromSupabase(),
            ]);
        } else {
            // Fallback client-side: rimborsa credito se pagato con credito, nascondi entry pagamento
            const oldMethod = b.paymentMethod || '';
            const price = slotPrices[b.slotType] || 0;
            if (oldMethod === 'credito' && price > 0) {
                CreditStorage.addCredit(b.whatsapp, b.email, b.name, price,
                    `Rimborso annullamento pagamento ${b.date} ${b.time}`);
            } else if (oldMethod !== 'lezione-gratuita') {
                CreditStorage.hidePaymentEntryByBooking(b.whatsapp, b.email, b.id);
            }
            b.paid = false;
            b.paymentMethod = undefined;
            delete b.paidAt;
            b.creditApplied = 0;
            BookingStorage.replaceAllBookings(bookings);
        }
        invalidateStatsCache();
        showToast('Pagamento rimosso. La prenotazione resta attiva.', 'success');

    } else if (type === 'credit') {
        clientWhatsapp = whatsappOrName;
        clientEmail    = email;
        if (typeof supabaseClient !== 'undefined') {
            const { data, error } = await _rpcWithTimeout(supabaseClient.rpc('admin_delete_credit_entry', {
                p_email:      (email || '').toLowerCase(),
                p_entry_date: idOrDate,
            }));
            if (error) {
                console.error('[deleteTxEntry] credit RPC error:', error.message);
                showToast('Errore: ' + error.message, 'error');
                return;
            }
            if (!data?.success) {
                showToast('Voce non trovata.', 'error');
                return;
            }
            console.log('[deleteTxEntry] credit entry deleted:', data);
            await CreditStorage.syncFromSupabase();
        } else {
            const ok = CreditStorage.deleteCreditEntry(whatsappOrName, email, idOrDate);
            if (!ok) { showToast('Voce non trovata.', 'error'); return; }
        }
        showToast('Transazione (credito) eliminata.', 'success');

    } else if (type === 'debt') {
        clientWhatsapp = whatsappOrName;
        clientEmail    = email;
        if (typeof supabaseClient !== 'undefined') {
            const { data, error } = await _rpcWithTimeout(supabaseClient.rpc('admin_delete_debt_entry', {
                p_email:      (email || '').toLowerCase(),
                p_entry_date: idOrDate,
            }));
            if (error) {
                console.error('[deleteTxEntry] debt RPC error:', error.message);
                showToast('Errore: ' + error.message, 'error');
                return;
            }
            if (!data?.success) {
                showToast('Voce non trovata.', 'error');
                return;
            }
            console.log('[deleteTxEntry] debt entry deleted:', data);
            await ManualDebtStorage.syncFromSupabase();
        } else {
            const ok = ManualDebtStorage.deleteDebtEntry(whatsappOrName, email, idOrDate);
            if (!ok) { showToast('Voce non trovata.', 'error'); return; }
        }
        showToast('Transazione (debito) eliminata.', 'success');
    }

    _refreshOpenClientCard(clientWhatsapp, clientEmail);
    } catch (e) {
        console.error('[deleteTxEntry] error:', e);
        showToast('⚠️ Errore di rete. Riprova.', 'error', 4000);
    }
}

function clearClientCredit(whatsapp, email, index) {
    if (!confirm('Eliminare tutto lo storico credito di questo cliente?\n\nSaldo e movimenti verranno azzerati.')) return;
    CreditStorage.clearRecord(whatsapp, email);
    showToast('Storico credito eliminato.', 'success');
    _refreshOpenClientCard(whatsapp, email);
}

