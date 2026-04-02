// Payments Management Functions
let debtorsListVisible = false;
let creditsListVisible = false;

/**
 * Dopo salvataggio debito/credito, riapre la card del contatto nella lista
 * mostrando i dati aggiornati senza perdere il contesto.
 */
function _reopenContactCard(name, whatsapp, email) {
    // Simula la ricerca per riaprire la card del contatto
    const dropdown = document.getElementById('debtorSearchDropdown');
    const normPhone = normalizePhone(whatsapp);
    const emailLow = (email || '').toLowerCase();
    const matches = _searchAllContacts(name);
    const match = matches.find(r => {
        const d = r.data;
        return (normPhone && normalizePhone(d.whatsapp) === normPhone) ||
               (emailLow && (d.email || '').toLowerCase() === emailLow);
    });
    if (match) {
        dropdown._matches = [match];
        selectDebtorFromDropdown(0);
    }
}

function _setPaymentCardsLoading(on) {
    document.querySelectorAll('.payment-stat-card').forEach(c =>
        c.classList.toggle('payment-stat-card--loading', on));
}

async function renderPaymentsTab() {
    // Skeleton anti-flicker: mostra solo se il fetch dura >150ms
    let skeletonTimer = setTimeout(() => _setPaymentCardsLoading(true), 150);

    // RPC server-side (veloce, dati freschi), fallback al JS locale se non disponibile
    let debtors;
    if (typeof supabaseClient !== 'undefined') {
        try {
            const { data, error } = await _rpcWithTimeout(supabaseClient.rpc('get_debtors', {
                p_slot_prices: SLOT_PRICES
            }));
            if (!error && data) debtors = data;
        } catch (_) { /* Supabase non raggiungibile — usa fallback JS */ }
    }
    if (!debtors) debtors = getDebtors();

    // Rimuovi skeleton
    if (skeletonTimer) clearTimeout(skeletonTimer);
    _setPaymentCardsLoading(false);

    const totalUnpaid = debtors.reduce((sum, debtor) => sum + debtor.totalAmount, 0);
    // Net debts against credit balance: only show as creditor if credit > debt
    // NB: getUnpaidAmountForContact include GIÀ ManualDebtStorage.getBalance(),
    //     quindi NON sommare manualDebt una seconda volta.
    const credits = CreditStorage.getAllWithBalance()
        .map(c => {
            const totalDebt  = getUnpaidAmountForContact(c.whatsapp, c.email);
            const netBalance = Math.round(Math.max(0, c.balance - totalDebt) * 100) / 100;
            return { ...c, balance: netBalance };
        })
        .filter(c => c.balance > 0);
    const totalCredit = credits.reduce((s, c) => s + c.balance, 0);

    // Update stats
    sensitiveSet('totalUnpaid', `€${totalUnpaid}`);
    sensitiveSet('totalDebtors', debtors.length);
    sensitiveSet('totalCreditors', credits.length);
    sensitiveSet('totalCreditAmount', `€${totalCredit}`);

    // Reset search UI and list visibility
    clearSearch();
    debtorsListVisible = false;
    creditsListVisible = false;
    const debtorsList = document.getElementById('debtorsList');
    debtorsList.style.display = 'none';
    document.getElementById('debtorsToggleHint').textContent = '▼ Mostra lista';
    const creditsList = document.getElementById('creditsList');
    if (creditsList) {
        creditsList.style.display = 'none';
        document.getElementById('creditorsToggleHint').textContent = '▼ Mostra lista';
    }

    // Render debtors
    if (debtors.length === 0) {
        debtorsList.innerHTML = '<div class="empty-slot">Nessun cliente con pagamenti in sospeso! 🎉</div>';
    } else {
        debtorsList.innerHTML = '';
        debtors.forEach((debtor, index) => {
            const debtorCard = createDebtorCard(debtor, `main-${index}`);
            debtorsList.appendChild(debtorCard);
        });
    }

    // Render credits
    if (creditsList) {
        if (credits.length === 0) {
            creditsList.innerHTML = '<div class="empty-slot">Nessun cliente con credito attivo</div>';
        } else {
            creditsList.innerHTML = '';
            credits.forEach((credit, index) => {
                creditsList.appendChild(createCreditCard(credit, index));
            });
        }
    }

}

function deleteManualDebtEntry(whatsapp, email, entryDate) {
    if (!confirm('Eliminare questa voce di debito manuale?')) return;
    if (typeof supabaseClient !== 'undefined') {
        (async () => {
            try {
                const { data, error } = await _rpcWithTimeout(supabaseClient.rpc('admin_delete_debt_entry', {
                    p_email:      (email || '').toLowerCase(),
                    p_entry_date: entryDate,
                }));
                if (error) {
                    console.error('[Supabase] admin_delete_debt_entry error:', error.message);
                    alert('⚠️ Errore: ' + error.message);
                    return;
                }
                if (!data?.success) {
                    alert('⚠️ Voce non trovata.');
                    return;
                }
                console.log('[admin_delete_debt_entry]', data);
                await ManualDebtStorage.syncFromSupabase();
                renderPaymentsTab();
                showToast('Voce eliminata.', 'success');
            } catch (ex) {
                console.error('[deleteManualDebtEntry] unexpected error:', ex);
                alert('⚠️ Errore imprevisto. Riprova.');
            }
        })();
    } else {
        const ok = ManualDebtStorage.deleteDebtEntry(whatsapp, email, entryDate);
        if (ok) {
            renderPaymentsTab();
            showToast('Voce eliminata.', 'success');
        }
    }
}

// ── Edit entry popup ────────────────────────────────────────────────────────
let _editEntryState = {};

function openEditEntryPopup(type, email, entryDate, amount, note, method) {
    _editEntryState = { type, email, entryDate };

    // Remove existing popup if any
    let overlay = document.getElementById('editEntryOverlay');
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.id = 'editEntryOverlay';
    overlay.className = 'edit-entry-overlay';
    overlay.onclick = (e) => { e.stopPropagation(); };

    const isCredit = type === 'credit';
    overlay.innerHTML = `
        <div class="edit-entry-popup">
            <div class="edit-entry-popup-header">
                <h3>Modifica ${isCredit ? 'Credito' : 'Debito'}</h3>
                <button onclick="closeEditEntryPopup()" style="background:none;border:none;font-size:1.3rem;cursor:pointer;color:#999">✕</button>
            </div>
            <div class="edit-entry-popup-body">
                <label>Importo (€)</label>
                <input type="number" id="editEntryAmount" value="${Math.abs(amount)}" step="0.01" min="0">
                <label>Nota</label>
                <input type="text" id="editEntryNote" value="${note}">
                ${isCredit ? `<label>Metodo</label>
                <select id="editEntryMethod">
                    <option value="">-- Nessuno --</option>
                    <option value="contanti" ${method==='contanti'?'selected':''}>💵 Contanti</option>
                    <option value="carta" ${method==='carta'?'selected':''}>💳 Carta</option>
                    <option value="iban" ${method==='iban'?'selected':''}>🏦 Bonifico</option>
                </select>` : ''}
            </div>
            <div class="edit-entry-popup-actions">
                <button class="credit-action-btn credit-action-btn--debt" onclick="closeEditEntryPopup()">Annulla</button>
                <button class="credit-action-btn credit-action-btn--credit" onclick="saveEditEntry()">Salva</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    setTimeout(() => overlay.classList.add('open'), 10);
}

function closeEditEntryPopup() {
    const overlay = document.getElementById('editEntryOverlay');
    if (overlay) {
        overlay.classList.remove('open');
        setTimeout(() => overlay.remove(), 200);
    }
}

async function saveEditEntry() {
    const { type, email, entryDate } = _editEntryState;
    const newAmount = parseFloat(document.getElementById('editEntryAmount').value);
    const newNote = document.getElementById('editEntryNote').value.trim();
    const methodEl = document.getElementById('editEntryMethod');
    const newMethod = methodEl ? methodEl.value : '';

    if (isNaN(newAmount) || newAmount < 0) { showToast('Importo non valido', 'error'); return; }

    if (typeof supabaseClient !== 'undefined') {
        const rpcName = type === 'credit' ? 'admin_edit_credit_entry' : 'admin_edit_debt_entry';
        const params = {
            p_email: (email || '').toLowerCase(),
            p_entry_date: entryDate,
            p_new_amount: newAmount,
            p_new_note: newNote,
        };
        if (type === 'credit') params.p_new_method = newMethod;

        const { data, error } = await _rpcWithTimeout(supabaseClient.rpc(rpcName, params));
        if (error) {
            console.error(`[${rpcName}] error:`, error.message);
            alert('⚠️ Errore: ' + error.message);
            return;
        }
        if (!data?.success) {
            alert('⚠️ Voce non trovata.');
            return;
        }
        await Promise.all([CreditStorage.syncFromSupabase(), ManualDebtStorage.syncFromSupabase()]);
    } else {
        // Fallback locale (senza Supabase)
        if (type === 'credit') {
            CreditStorage.editCreditEntry(email, entryDate, newAmount, newNote, newMethod);
        } else {
            ManualDebtStorage.editDebtEntry(email, entryDate, newAmount, newNote);
        }
    }

    closeEditEntryPopup();
    renderPaymentsTab();
    showToast('Voce modificata.', 'success');
}

function deleteCreditEntryFromCard(whatsapp, email, entryDate) {
    if (!confirm('Eliminare questa voce di credito?')) return;
    if (typeof supabaseClient !== 'undefined') {
        (async () => {
            try {
                const { data, error } = await _rpcWithTimeout(supabaseClient.rpc('admin_delete_credit_entry', {
                    p_email:      (email || '').toLowerCase(),
                    p_entry_date: entryDate,
                }));
                if (error) {
                    console.error('[Supabase] admin_delete_credit_entry error:', error.message);
                    alert('⚠️ Errore: ' + error.message);
                    return;
                }
                if (!data?.success) {
                    alert('⚠️ Voce non trovata.');
                    return;
                }
                console.log('[admin_delete_credit_entry]', data);
                await CreditStorage.syncFromSupabase();
                renderPaymentsTab();
                showToast('Voce di credito eliminata.', 'success');
            } catch (ex) {
                console.error('[deleteCreditEntryFromCard] unexpected error:', ex);
                alert('⚠️ Errore imprevisto. Riprova.');
            }
        })();
    } else {
        const ok = CreditStorage.deleteCreditEntry(whatsapp, email, entryDate);
        if (ok) {
            renderPaymentsTab();
            showToast('Voce di credito eliminata.', 'success');
        }
    }
}

function toggleCreditsList() {
    if (_sensitiveHidden) return;
    creditsListVisible = !creditsListVisible;
    const creditsList = document.getElementById('creditsList');
    const hint = document.getElementById('creditorsToggleHint');
    if (creditsList) creditsList.style.display = creditsListVisible ? 'flex' : 'none';
    if (hint) hint.textContent = creditsListVisible ? '▲ Nascondi lista' : '▼ Mostra lista';
    // Chiudi l'altra lista se questa viene aperta
    if (creditsListVisible && debtorsListVisible) {
        debtorsListVisible = false;
        const dl = document.getElementById('debtorsList');
        const dh = document.getElementById('debtorsToggleHint');
        if (dl) dl.style.display = 'none';
        if (dh) dh.textContent = '▼ Mostra lista';
    }
}

function createCreditCard(credit, index, showActions = false) {
    const card = document.createElement('div');
    card.className = 'debtor-card credit-client-card';
    card.id = `credit-card-${index}`;

    const safeW = (credit.whatsapp || '').replace(/'/g, "\\'");
    const safeE = (credit.email || '').replace(/'/g, "\\'");
    const safeN = (credit.name || '').replace(/'/g, "\\'");

    const allCreditItems = [...(credit.history || [])].reverse().map(entry => {
        const d = new Date(entry.date);
        const dateStr = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
        const sign = entry.amount >= 0 ? '+' : '';
        const color = entry.amount >= 0 ? '#22c55e' : '#ef4444';
        const safeDate = (entry.date || '').replace(/'/g, "\\'");
        const safeNote = _escHtml((entry.note || '').replace(/'/g, "\\'"));
        const safeMethod = _escHtml((entry.method || '').replace(/'/g, "\\'"));
        return `
            <div class="debtor-booking-item">
                <div class="debtor-booking-details">📅 ${dateStr} — ${_escHtml(entry.note || 'Movimento credito')}</div>
                <div style="display:flex;align-items:center;gap:0.35rem;">
                    <div class="debtor-booking-price" style="color:${color}">${sign}€${Math.abs(entry.amount)}</div>
                    <button class="debt-entry-edit-btn" onclick="openEditEntryPopup('credit','${safeE}','${safeDate}',${entry.amount},'${safeNote}','${safeMethod}')" title="Modifica">✏️</button>
                    <button class="debt-entry-delete-btn" onclick="deleteCreditEntryFromCard('${safeW}','${safeE}','${safeDate}')" title="Elimina">✕</button>
                </div>
            </div>`;
    });
    const historyHTML = `<div style="margin-top:0.75rem;">${_buildPaginatedList(allCreditItems, 5, 10)}</div>`;

    card.innerHTML = `
        <div class="debtor-card-header" onclick="toggleDebtorCard('credit-card-${index}')">
            <div class="debtor-info">
                <div class="debtor-name">${_escHtml(credit.name)}${showActions ? `
                    <button class="credit-action-btn credit-action-btn--credit credit-action-btn--header" onclick="event.stopPropagation();openManualEntryPopup('credit','${safeE}','${safeN}','${safeW}')">+ Credito</button>
                    <button class="credit-action-btn credit-action-btn--debt credit-action-btn--header" onclick="event.stopPropagation();openManualEntryPopup('debt','${safeE}','${safeN}','${safeW}')">+ Debito</button>` : ''}
                </div>
                <div class="debtor-contact">
                    <span>📱 ${_escHtml(credit.whatsapp)}</span>
                </div>
            </div>
            <div class="debtor-amount credit-amount">Credito: €${credit.balance}</div>
            <div class="debtor-toggle">▼</div>
        </div>
        <div class="debtor-card-body">
            ${historyHTML}
        </div>
    `;
    return card;
}

function toggleDebtorsList() {
    if (_sensitiveHidden) return;
    debtorsListVisible = !debtorsListVisible;
    const debtorsList = document.getElementById('debtorsList');
    const hint = document.getElementById('debtorsToggleHint');
    if (debtorsList) debtorsList.style.display = debtorsListVisible ? 'flex' : 'none';
    if (hint) hint.textContent = debtorsListVisible ? '▲ Nascondi lista' : '▼ Mostra lista';
    // Chiudi l'altra lista se questa viene aperta
    if (debtorsListVisible && creditsListVisible) {
        creditsListVisible = false;
        const cl = document.getElementById('creditsList');
        const ch = document.getElementById('creditorsToggleHint');
        if (cl) cl.style.display = 'none';
        if (ch) ch.textContent = '▼ Mostra lista';
    }
}

function getDebtors() {
    const allBookings = BookingStorage.getAllBookings();
    const debtorsMap = {};
    // Indici O(1) per evitare il loop annidato su ogni booking
    const phoneIdx = {};
    const emailIdx = {};

    function _findKey(normPhone, email) {
        if (normPhone && phoneIdx[normPhone]) return phoneIdx[normPhone];
        const el = email ? email.toLowerCase() : '';
        if (el && emailIdx[el]) return emailIdx[el];
        return null;
    }
    function _registerKey(key, normPhone, email) {
        if (normPhone) phoneIdx[normPhone] = key;
        const el = email ? email.toLowerCase() : '';
        if (el) emailIdx[el] = key;
    }

    // Group unpaid past bookings by contact, matching by phone OR email
    allBookings.forEach(booking => {
        if (!booking.paid && bookingHasPassed(booking) && booking.status !== 'cancelled') {
            const normPhone = normalizePhone(booking.whatsapp);
            let matchedKey = _findKey(normPhone, booking.email);

            if (!matchedKey) {
                matchedKey = normPhone || booking.email;
                debtorsMap[matchedKey] = {
                    name: booking.name, whatsapp: booking.whatsapp, email: booking.email,
                    unpaidBookings: [], manualDebt: 0, totalAmount: 0
                };
                _registerKey(matchedKey, normPhone, booking.email);
            }

            const price = SLOT_PRICES[booking.slotType];
            debtorsMap[matchedKey].unpaidBookings.push({ ...booking, price });
            debtorsMap[matchedKey].totalAmount += price;
        }
    });

    // Merge in manual debts (not tied to bookings)
    ManualDebtStorage.getAllWithBalance().forEach(debt => {
        const normPhone = normalizePhone(debt.whatsapp);
        let matchedKey = _findKey(normPhone, debt.email);
        if (!matchedKey) {
            matchedKey = normPhone || debt.email;
            debtorsMap[matchedKey] = {
                name: debt.name, whatsapp: debt.whatsapp, email: debt.email,
                unpaidBookings: [], manualDebt: 0, totalAmount: 0
            };
            _registerKey(matchedKey, normPhone, debt.email);
        }
        debtorsMap[matchedKey].manualDebt = debt.balance;
        debtorsMap[matchedKey].totalAmount += debt.balance;
    });

    // Net credit balance against raw debt: only show as debtor if debt > credit
    for (const key in debtorsMap) {
        const d = debtorsMap[key];
        const creditBalance = CreditStorage.getBalance(d.whatsapp, d.email);
        d.totalAmount = Math.round((d.totalAmount - creditBalance) * 100) / 100;
    }
    return Object.values(debtorsMap)
        .filter(d => d.totalAmount > 0)
        .sort((a, b) => b.totalAmount - a.totalAmount);
}

function _buildPaginatedList(itemsHTML, initialCount, stepCount) {
    const total = itemsHTML.length;
    let html = '<div class="debtor-bookings">';
    itemsHTML.forEach((item, i) => {
        html += `<div class="pag-item"${i >= initialCount ? ' style="display:none"' : ''}>${item}</div>`;
    });
    if (total > initialCount) {
        const remaining = total - initialCount;
        html += `<button class="show-more-btn" onclick="_showMoreItems(this,${stepCount})" data-shown="${initialCount}" data-total="${total}">▼ Mostra altri ${Math.min(stepCount, remaining)}</button>`;
    }
    html += '</div>';
    return html;
}

function _showMoreItems(btn, stepCount) {
    const containerId = btn.dataset.container;
    const container = containerId ? document.getElementById(containerId) : btn.parentElement;
    const shown = parseInt(btn.dataset.shown);
    const total = parseInt(btn.dataset.total);
    const items = container.querySelectorAll('.pag-item');
    const newShown = Math.min(shown + stepCount, total);
    for (let i = shown; i < newShown; i++) {
        if (items[i]) items[i].style.display = '';
    }
    btn.dataset.shown = newShown;
    if (newShown >= total) {
        btn.remove();
    } else {
        btn.textContent = `▼ Mostra altri ${Math.min(stepCount, total - newShown)}`;
    }
}

function createDebtorCard(debtor, cardId) {
    const card = document.createElement('div');
    card.className = 'debtor-card';
    card.id = `debtor-card-${cardId}`;

    const safeW = debtor.whatsapp.replace(/'/g, "\\'");
    const safeE = debtor.email.replace(/'/g, "\\'");
    const safeN = debtor.name.replace(/'/g, "\\'");

    const allDebtItems = [];
    debtor.unpaidBookings.forEach(booking => {
        allDebtItems.push(`
            <div class="debtor-booking-item">
                <div class="debtor-booking-details">
                    📅 ${booking.date} &nbsp;·&nbsp; 🕐 ${booking.time} &nbsp;·&nbsp; ${SLOT_NAMES[booking.slotType]}
                </div>
                <div class="debtor-booking-price">€${booking.price}</div>
            </div>
        `);
    });
    if (debtor.manualDebt > 0) {
        // manualDebtHistory dalla RPC server-side; fallback al cache locale
        const historySource = debtor.manualDebtHistory
            || ManualDebtStorage.getRecord(debtor.whatsapp, debtor.email)?.history
            || [];
        const allEntries = [...historySource].reverse().filter(e => e.amount > 0);
        allEntries.forEach(entry => {
            const d = new Date(entry.date);
            const dateStr = `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`;
            const safeDate = entry.date.replace(/'/g, "\\'");
            const safeDebtNote = _escHtml((entry.note || '').replace(/'/g, "\\'"));
            const safeDebtMethod = _escHtml((entry.method || '').replace(/'/g, "\\'"));
            allDebtItems.push(`
                <div class="debtor-booking-item debtor-booking-manual">
                    <div class="debtor-booking-details">✏️ ${dateStr} &nbsp;·&nbsp; ${_escHtml(entry.note || 'Debito manuale')}</div>
                    <div style="display:flex;align-items:center;gap:0.35rem;">
                        <div class="debtor-booking-price">€${entry.amount}</div>
                        <button class="debt-entry-edit-btn" onclick="openEditEntryPopup('debt','${safeE}','${safeDate}',${entry.amount},'${safeDebtNote}','${safeDebtMethod}')" title="Modifica">✏️</button>
                        <button class="debt-entry-delete-btn" onclick="deleteManualDebtEntry('${safeW}','${safeE}','${safeDate}')" title="Elimina">✕</button>
                    </div>
                </div>`);
        });
    }
    const bookingsHTML = _buildPaginatedList(allDebtItems, 5, 10);

    card.innerHTML = `
        <div class="debtor-card-header" onclick="toggleDebtorCard('debtor-card-${cardId}')">
            <div class="debtor-info">
                <div class="debtor-name">${_escHtml(debtor.name)}</div>
                <div class="debtor-contact">
                    <span>📱 ${_escHtml(debtor.whatsapp)}</span>
                </div>
            </div>
            <div class="debtor-amount">Debito: €${debtor.totalAmount}</div>
            <div class="debtor-toggle">▼</div>
        </div>
        <div class="debtor-card-body">
            ${bookingsHTML}
        </div>
    `;

    return card;
}

function toggleDebtorCard(cardId) {
    const card = document.getElementById(cardId);
    if (card) {
        card.classList.toggle('open');
    }
}

function selectDebtorPayMethod(btn) {
    btn.closest('.debtor-pay-methods').querySelectorAll('.debt-method-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

async function payAllDebtsInline(whatsapp, email, name, btn) {
    const footer = btn.closest('.debtor-pay-footer');
    const methodSelect = footer.querySelector('.debtor-method-select');
    const method = methodSelect ? methodSelect.value : '';
    if (!method) { showToast('Seleziona un metodo di pagamento', 'error'); return; }
    const methodLabels = { contanti: '💵 Contanti', carta: '💳 Carta', iban: '🏦 Bonifico' };

    const normW = normalizePhone(whatsapp);
    const bookings = BookingStorage.getAllBookings();
    const now = new Date().toISOString();
    let totalPaid = 0;

    bookings.forEach(b => {
        const normB = normalizePhone(b.whatsapp);
        const phoneMatch = normW && normB && normW === normB;
        const emailMatch = email && b.email && b.email.toLowerCase() === email.toLowerCase();
        if ((phoneMatch || emailMatch) && !b.paid && bookingHasPassed(b)) {
            b.paid = true;
            b.paymentMethod = method;
            b.paidAt = now;
            totalPaid += SLOT_PRICES[b.slotType] || 0;
        }
    });

    // Also pay manual debts for this contact
    const manualDebt = ManualDebtStorage.getBalance(whatsapp, email);
    if (manualDebt > 0) {
        await ManualDebtStorage.addDebt(whatsapp, email, name, -manualDebt,
            `Saldato (${method})`, method);
        totalPaid += manualDebt;
    }

    if (totalPaid === 0) return;
    BookingStorage.replaceAllBookings(bookings);

    // Use existing credit to offset the total, then collect only the net cash
    const existingCredit = CreditStorage.getRecord(whatsapp, email)?.balance || 0;
    const creditToUse = Math.round(Math.min(existingCredit, totalPaid) * 100) / 100;
    if (creditToUse > 0) {
        await CreditStorage.addCredit(whatsapp, email, name, -creditToUse,
            `Credito applicato (${method})`);
    }
    const cashCollected = Math.round((totalPaid - creditToUse) * 100) / 100;
    if (cashCollected > 0) {
        const methodLabel = { contanti: 'Contanti', carta: 'Carta', iban: 'Bonifico' }[method] || method;
        await CreditStorage.addCredit(whatsapp, email, name, 0,
            `${methodLabel} ricevuto`, cashCollected, false, false, null, method);
    }

    // Update card in-place — keep it visible with paid state
    const card = btn.closest('.debtor-card');

    // Strike through all booking rows
    card.querySelectorAll('.debtor-booking-item').forEach(row => {
        row.classList.add('debtor-booking-paid');
        const priceEl = row.querySelector('.debtor-booking-price');
        if (priceEl) priceEl.style.color = '#22c55e';
    });

    // Replace the pay footer with a success banner
    const displayAmount = cashCollected > 0 ? cashCollected : `0 (credito)`;
    footer.innerHTML = `
        <div class="debtor-pay-success">
            <span>✓</span>
            <span>€${displayAmount} incassati · ${methodLabels[method] || method}</span>
        </div>
    `;

    // Update the header amount pill to "Saldato"
    const amountBadge = card.querySelector('.debtor-amount');
    if (amountBadge) {
        amountBadge.textContent = '✓ Saldato';
        amountBadge.classList.add('debtor-amount--paid');
    }

    // Refresh only the top stats numbers, not the full list
    const updatedDebtors = getDebtors();
    sensitiveSet('totalUnpaid', `€${updatedDebtors.reduce((s, d) => s + d.totalAmount, 0)}`);
    sensitiveSet('totalDebtors', updatedDebtors.length);
}

function _searchAllContacts(query) {
    const q = query.trim().toLowerCase();
    const debtorMatches = getDebtors()
        .filter(d =>
            d.name.toLowerCase().includes(q) ||
            d.whatsapp.toLowerCase().includes(q) ||
            d.email.toLowerCase().includes(q)
        )
        .map(d => ({ type: 'debtor', data: d }));

    // Cerca in TUTTI i record credito (anche saldo 0) per mostrare lo storico
    const creditMatches = CreditStorage.getAllWithHistory()
        .filter(c =>
            c.name.toLowerCase().includes(q) ||
            (c.whatsapp || '').toLowerCase().includes(q) ||
            (c.email || '').toLowerCase().includes(q)
        )
        // Don't duplicate contacts already shown as debtors
        .filter(c => !debtorMatches.some(dm =>
            normalizePhone(dm.data.whatsapp) === normalizePhone(c.whatsapp) ||
            (dm.data.email && c.email && dm.data.email.toLowerCase() === c.email.toLowerCase())
        ))
        .map(c => ({ type: 'credit', data: c }));

    // Also search all clients (arricchisci con storico credito se esiste)
    const allClients = UserStorage.getAll();
    const alreadyFound = new Set();
    [...debtorMatches, ...creditMatches].forEach(m => {
        if (m.data.email) alreadyFound.add(m.data.email.toLowerCase());
        if (m.data.whatsapp) alreadyFound.add(normalizePhone(m.data.whatsapp));
    });
    const clientMatches = allClients
        .filter(c =>
            c.name.toLowerCase().includes(q) ||
            (c.whatsapp || '').toLowerCase().includes(q) ||
            (c.email || '').toLowerCase().includes(q)
        )
        .filter(c => {
            if (c.email && alreadyFound.has(c.email.toLowerCase())) return false;
            if (c.whatsapp && alreadyFound.has(normalizePhone(c.whatsapp))) return false;
            return true;
        })
        .map(c => {
            // Cerca storico credito per questo cliente
            const creditRec = CreditStorage.getRecord(c.whatsapp, c.email);
            return { type: 'client', data: {
                name: c.name, email: c.email || '', whatsapp: c.whatsapp || '',
                balance: creditRec?.balance || 0,
                history: creditRec?.history || []
            }};
        });

    return [...debtorMatches, ...creditMatches, ...clientMatches];
}

function searchDebtor() {
    const query = document.getElementById('debtorSearchInput').value.trim();
    if (!query) return;

    const results = _searchAllContacts(query);
    const resultsContainer = document.getElementById('debtorSearchResults');
    const resultsList = document.getElementById('searchResultsList');

    if (results.length === 0) {
        resultsList.innerHTML = '<p style="color: #666; padding: 0.5rem 0;">Nessun risultato trovato.</p>';
    } else {
        resultsList.innerHTML = '';
        results.forEach((r, index) => {
            const card = r.type === 'debtor'
                ? createDebtorCard(r.data, `search-${index}`)
                : createCreditCard(r.data, `search-${index}`, true);
            card.classList.add('open');
            resultsList.appendChild(card);
        });
    }

    resultsContainer.style.display = 'block';
    resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function clearSearch() {
    const resultsContainer = document.getElementById('debtorSearchResults');
    const searchInput = document.getElementById('debtorSearchInput');
    if (resultsContainer) resultsContainer.style.display = 'none';
    if (searchInput) searchInput.value = '';
    closeSearchDropdown();
    // Ripristina stat cards
    const stats = document.querySelector('.payments-stats');
    if (stats) stats.style.display = '';
}

function closeSearchDropdown() {
    const dropdown = document.getElementById('debtorSearchDropdown');
    if (dropdown) dropdown.style.display = 'none';
}

var liveSearchDebtor = _debounce(function() {
    const query = document.getElementById('debtorSearchInput').value.trim();
    const dropdown = document.getElementById('debtorSearchDropdown');

    if (!query) {
        dropdown.style.display = 'none';
        return;
    }

    const matches = _searchAllContacts(query);

    if (matches.length === 0) {
        dropdown.innerHTML = '<div class="dropdown-no-results">Nessun risultato</div>';
    } else {
        dropdown.innerHTML = matches.map((r, i) => {
            const name = r.data.name;
            const badge = r.type === 'debtor'
                ? `<span class="dropdown-item-debt">Da pagare: €${r.data.totalAmount}</span>`
                : r.type === 'client'
                ? `<span class="dropdown-item-client" style="color:#888;font-size:12px">👤 Cliente</span>`
                : `<span class="dropdown-item-credit">💳 €${r.data.balance}</span>`;
            return `<div class="dropdown-item" onclick="selectDebtorFromDropdown(${i})">
                <span class="dropdown-item-name">${name}</span>
                ${badge}
            </div>`;
        }).join('');
        dropdown._matches = matches;
    }

    dropdown.style.display = 'block';
}, 200);

function selectDebtorFromDropdown(index) {
    const dropdown = document.getElementById('debtorSearchDropdown');
    const matches = dropdown._matches;
    if (!matches || !matches[index]) return;

    const r = matches[index];
    const resultsContainer = document.getElementById('debtorSearchResults');
    const resultsList = document.getElementById('searchResultsList');

    resultsList.innerHTML = '';
    const card = r.type === 'debtor'
        ? createDebtorCard(r.data, 'search-sel')
        : createCreditCard(r.data, 'search-sel', true);  // works for 'credit' and 'client' types
    card.classList.add('open');
    resultsList.appendChild(card);

    resultsContainer.style.display = 'block';
    closeSearchDropdown();
    document.getElementById('debtorSearchInput').value = r.data.name;
    // Nascondi stat cards durante la ricerca
    const stats = document.querySelector('.payments-stats');
    if (stats) stats.style.display = 'none';
    resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function markBookingPaid(bookingId) {
    const bookings = BookingStorage.getAllBookings();
    const booking = bookings.find(b => b.id === bookingId);

    if (booking) {
        booking.paid = true;
        booking.paidAt = new Date().toISOString();
        BookingStorage.replaceAllBookings(bookings);

        // Refresh payments tab
        renderPaymentsTab();

        // Re-run search if it was active
        const searchInput = document.getElementById('debtorSearchInput');
        if (searchInput && searchInput.value.trim()) {
            searchDebtor();
        }

        // Show success message
        alert(`✅ Pagamento registrato per ${booking.name}`);
    }
}

// Strip +39 / 0039 prefix and non-digit chars for phone comparison
function normalizePhone(phone) {
    if (!phone) return '';
    return phone.replace(/^\+39\s*/, '').replace(/^0039\s*/, '').replace(/[\s\-(). ]/g, '');
}

// Returns true if the booking's start time has already passed
function bookingHasPassed(booking) {
    // time format: "HH:MM - HH:MM"
    const startTimePart = booking.time.split(' - ')[0];
    if (!startTimePart || !booking.date) return false;

    const [startHour, startMin] = startTimePart.trim().split(':').map(Number);
    const [year, month, day] = booking.date.split('-').map(Number);

    const startDateTime = new Date(year, month - 1, day, startHour, startMin, 0);
    return new Date() >= startDateTime;
}

// Get unpaid amount for a specific contact (phone OR email match), only for past bookings
function getUnpaidAmountForContact(whatsapp, email) {
    const normWhatsapp = normalizePhone(whatsapp);
    const allBookings = BookingStorage.getAllBookings();
    let totalUnpaid = 0;

    allBookings.forEach(booking => {
        const phoneMatch = normWhatsapp && normalizePhone(booking.whatsapp) === normWhatsapp;
        const emailMatch = email && booking.email && booking.email.toLowerCase() === email.toLowerCase();
        if ((phoneMatch || emailMatch) && !booking.paid && bookingHasPassed(booking) && booking.status !== 'cancelled') {
            totalUnpaid += (SLOT_PRICES[booking.slotType] || 0) - (booking.creditApplied || 0);
        }
    });

    totalUnpaid += ManualDebtStorage.getBalance(whatsapp, email);
    return totalUnpaid;
}

// ===== Manual Credit/Debt Entry Popup =====
let _manualEntryType = 'debt';
let _manualEntryContact = null;

function openManualEntryPopup(type, prefillEmail, prefillName, prefillWhatsapp) {
    _manualEntryType = type;
    _manualEntryContact = null;
    const isDebt = type === 'debt';
    document.getElementById('manualEntryTitle').textContent = isDebt ? 'Aggiungi Debito Manuale' : 'Aggiungi Credito Manuale';
    document.getElementById('manualEntrySubtitle').textContent = isDebt
        ? 'Debito non legato a prenotazioni (es. lezione privata)'
        : 'Ricarica il saldo credito del cliente';
    document.getElementById('manualClientInput').value = '';
    document.getElementById('manualClientDropdown').style.display = 'none';
    document.getElementById('manualClientSelected').style.display = 'none';
    document.getElementById('manualAmountInput').value = '';
    document.getElementById('manualNoteInput').value = '';
    const manualSelect = document.getElementById('manualMethodSelect');
    if (manualSelect) manualSelect.value = '';
    document.getElementById('manualMethodField').style.display = isDebt ? 'none' : '';
    const modal = document.getElementById('manualEntryModal');
    modal.classList.remove('manual-entry--debt', 'manual-entry--credit');
    modal.classList.add(isDebt ? 'manual-entry--debt' : 'manual-entry--credit');
    document.getElementById('manualEntryOverlay').classList.add('open');
    modal.classList.add('open');

    if (prefillName && prefillEmail) {
        selectManualClient(prefillName, prefillWhatsapp || '', prefillEmail);
    } else {
        setTimeout(() => document.getElementById('manualClientInput').focus(), 100);
    }
}

function closeManualEntryPopup() {
    document.getElementById('manualEntryOverlay').classList.remove('open');
    document.getElementById('manualEntryModal').classList.remove('open');
    _manualEntryContact = null;
}

function liveSearchManualClient() {
    const q = document.getElementById('manualClientInput').value.trim();
    const dropdown = document.getElementById('manualClientDropdown');
    if (q.length < 2) { dropdown.style.display = 'none'; return; }
    const results = UserStorage.search(q).slice(0, 6);
    if (results.length === 0) { dropdown.style.display = 'none'; return; }
    dropdown.innerHTML = results.map(u => {
        const safeN = u.name.replace(/'/g, "\\'");
        const safeW = (u.whatsapp || '').replace(/'/g, "\\'");
        const safeE = (u.email || '').replace(/'/g, "\\'");
        return `<div class="debtor-search-option" onclick="selectManualClient('${safeN}','${safeW}','${safeE}')">
            <strong>${u.name}</strong>
        </div>`;
    }).join('');
    dropdown.style.display = 'block';
}

function selectManualClient(name, whatsapp, email) {
    _manualEntryContact = { name, whatsapp, email };
    document.getElementById('manualClientInput').value = '';
    document.getElementById('manualClientDropdown').style.display = 'none';
    const sel = document.getElementById('manualClientSelected');
    sel.style.display = 'flex';
    const initials = name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const sub = [whatsapp, email].filter(Boolean).join(' · ');
    sel.innerHTML = `
        <div class="manual-client-avatar">${initials}</div>
        <div class="manual-client-info">
            <strong>${name}</strong>
            ${sub ? `<small>${sub}</small>` : ''}
        </div>
        <button class="manual-client-clear" onclick="_manualEntryContact=null;
            document.getElementById('manualClientSelected').style.display='none';
            document.getElementById('manualClientInput').value='';">✕</button>`;
}

function selectManualMethod(btn) {
    // Legacy button handler (kept for safety)
    btn.closest('.debt-method-btns')?.querySelectorAll('.debt-method-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

let _savingManualEntry = false;
async function saveManualEntry() {
    if (_savingManualEntry) return;
    if (!_manualEntryContact) {
        alert('Seleziona un cliente dalla lista');
        document.getElementById('manualClientInput').focus();
        return;
    }
    const amount = parseFloat(document.getElementById('manualAmountInput').value);
    if (!amount || amount <= 0) {
        alert('Inserisci un importo valido');
        document.getElementById('manualAmountInput').focus();
        return;
    }
    const note = document.getElementById('manualNoteInput').value.trim();
    const manualSelect = document.getElementById('manualMethodSelect');
    const method = manualSelect ? manualSelect.value : '';
    if (!method && _manualEntryType !== 'debt') { showToast('Seleziona un metodo di pagamento', 'error'); return; }
    const { name, whatsapp, email } = _manualEntryContact;

    // Controllo dati per carta/bonifico
    if (method === 'carta' || method === 'iban') {
        try { await ensureClientDataForCardPayment(email, whatsapp, name, method); }
        catch { return; }
    }

    const savedType = _manualEntryType;

    // Blocca doppio click e mostra stato di caricamento
    _savingManualEntry = true;
    const saveBtn = document.getElementById('manualEntrySaveBtn');
    const origBtnText = saveBtn ? saveBtn.textContent : '';
    if (saveBtn) { saveBtn.textContent = 'Salvataggio...'; saveBtn.disabled = true; }

    try {
        if (savedType === 'debt') {
            // Debito: operazione atomica server-side via RPC
            if (typeof supabaseClient !== 'undefined') {
                const { data, error } = await _rpcWithTimeout(supabaseClient.rpc('admin_add_debt', {
                    p_email:      email.toLowerCase(),
                    p_whatsapp:   whatsapp || null,
                    p_name:       name,
                    p_amount:     amount,
                    p_note:       note || 'Debito manuale',
                    p_method:     method,
                }));
                if (error) {
                    console.error('[Supabase] admin_add_debt error:', error.message, error.code);
                    showToast('Errore: ' + error.message, 'error');
                    return;
                }
                console.log('[admin_add_debt]', data);
                await ManualDebtStorage.syncFromSupabase();
            } else {
                await ManualDebtStorage.addDebt(whatsapp, email, name, amount,
                    note || 'Debito manuale', method);
            }
            closeManualEntryPopup();
            showToast('Debito aggiunto con successo', 'success');
            await renderPaymentsTab();
            _reopenContactCard(name, whatsapp, email);
        } else {
            // Credito: operazione atomica server-side via RPC
            const isFreeLesson = method === 'lezione-gratuita';
            const slotPrices = { 'personal-training': 5, 'small-group': 10, 'group-class': 30 };

            const { data, error } = await _rpcWithTimeout(supabaseClient.rpc('admin_add_credit', {
                p_email:       email.toLowerCase(),
                p_whatsapp:    whatsapp || null,
                p_name:        name,
                p_amount:      amount,
                p_note:        note || (isFreeLesson ? 'Lezione gratuita' : 'Credito manuale'),
                p_method:      method,
                p_free_lesson: isFreeLesson,
                p_slot_prices: slotPrices,
            }));

            if (error) {
                console.error('[Supabase] admin_add_credit error:', error.message, error.code);
                showToast('Errore: ' + error.message, 'error');
                return;
            }

            console.log('[admin_add_credit]', data);

            // Risincronizza tutto da Supabase
            await Promise.all([
                BookingStorage.syncFromSupabase(),
                CreditStorage.syncFromSupabase(),
                ManualDebtStorage.syncFromSupabase(),
            ]);

            closeManualEntryPopup();
            showToast('Credito aggiunto con successo', 'success');
            await renderPaymentsTab();
            _reopenContactCard(name, whatsapp, email);
        }
    } catch (err) {
        console.error('[saveManualEntry] unexpected error:', err);
        showToast('Errore di rete o timeout. Riprova.', 'error');
    } finally {
        _savingManualEntry = false;
        if (saveBtn) { saveBtn.textContent = origBtnText; saveBtn.disabled = false; }
    }
}

// ===== Debt Popup =====
let currentDebtContact = null;

function openDebtPopup(whatsapp, email, name) {
    const normWhatsapp = normalizePhone(whatsapp);
    const allBookings = BookingStorage.getAllBookings();
    const unpaid = allBookings
        .filter(b => {
            const phoneMatch = normWhatsapp && normalizePhone(b.whatsapp) === normWhatsapp;
            const emailMatch = email && b.email && b.email.toLowerCase() === email.toLowerCase();
            return (phoneMatch || emailMatch) && !b.paid && b.status !== 'cancelled' && b.status !== 'cancellation_requested';
        })
        .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

    const debtRecord  = ManualDebtStorage.getRecord(whatsapp, email);
    const debtBalance = debtRecord?.balance || 0;
    const oldestDebt  = debtRecord?.history?.find(h => h.amount > 0);
    const debtInfo    = debtBalance > 0 ? { balance: debtBalance, date: oldestDebt?.date || null } : null;
    if (unpaid.length === 0 && !debtInfo) return;

    currentDebtContact = { whatsapp, email, name, unpaid };

    document.getElementById('debtPopupName').textContent = name;
    const pastCount   = unpaid.filter(b => bookingHasPassed(b)).length;
    const futureCount = unpaid.length - pastCount;
    const parts = [];
    if (pastCount   > 0) parts.push(`${pastCount} passata${pastCount   > 1 ? 'e' : ''}`);
    if (futureCount > 0) parts.push(`${futureCount} futura${futureCount > 1 ? 'e' : ''}`);
    let subtitle = unpaid.length > 0
        ? `${unpaid.length} lezione${unpaid.length > 1 ? 'i' : ''} non pagata${unpaid.length > 1 ? 'e' : ''} (${parts.join(', ')})`
        : '';
    if (debtBalance > 0) subtitle = subtitle ? `${subtitle} · Debito manuale: €${debtBalance.toFixed(2)}` : `Debito manuale: €${debtBalance.toFixed(2)}`;
    document.getElementById('debtPopupSubtitle').textContent = subtitle;

    // Reset payment method to placeholder
    const debtSelect = document.getElementById('debtMethodSelect');
    if (debtSelect) debtSelect.value = '';

    // Reset amount input & show amount row (in case previous selection was 'gratuita')
    const amountRow = document.querySelector('#debtPopupModal .debt-payment-amount-row');
    if (amountRow) amountRow.style.display = '';
    const amountInput = document.getElementById('debtAmountInput');
    if (amountInput) amountInput.value = 0;

    // Show existing credit if any
    const credit = CreditStorage.getBalance(whatsapp, email);
    const existingCreditRow = document.getElementById('debtExistingCreditRow');
    if (existingCreditRow) {
        if (credit > 0) {
            existingCreditRow.style.display = 'flex';
            document.getElementById('debtExistingCreditAmt').textContent = `€${credit}`;
        } else {
            existingCreditRow.style.display = 'none';
        }
    }
    const creditRow = document.getElementById('debtCreditRow');
    if (creditRow) creditRow.style.display = 'none';

    renderDebtPopupList(unpaid, debtInfo);
    updateDebtTotal();

    document.getElementById('debtPopupOverlay').classList.add('open');
    document.getElementById('debtPopupModal').classList.add('open');
}

function renderDebtPopupList(unpaid, debtInfo = null) {
    const list = document.getElementById('debtPopupList');
    list.innerHTML = '';

    // Costruisce lista unificata con sortDate per ordinamento
    const items = unpaid.map(b => {
        const startTime = (b.time || '').split(' - ')[0] || '00:00';
        return { type: 'booking', sortDate: new Date(`${b.date}T${startTime}`), booking: b };
    });
    if (debtInfo) {
        items.push({ type: 'manual-debt', sortDate: debtInfo.date ? new Date(debtInfo.date) : new Date(0), debtInfo });
    }
    items.sort((a, b) => a.sortDate - b.sortDate); // più vecchio → più nuovo

    items.forEach(it => {
        const el = document.createElement('div');
        el.className = 'debt-popup-item';

        if (it.type === 'booking') {
            const { booking } = it;
            const [y, m, d] = booking.date.split('-').map(Number);
            const dateDisplay = `${d}/${m}/${y}`;
            const fullPrice   = SLOT_PRICES[booking.slotType];
            const creditApplied = booking.creditApplied || 0;
            const price = fullPrice - creditApplied;
            if (bookingHasPassed(booking)) el.classList.add('debt-popup-item--past');
            el.innerHTML = `
                <label class="debt-item-label">
                    <input type="checkbox" class="debt-item-check" data-id="${booking.id}" data-price="${price}" onchange="updateDebtTotal()">
                    <div class="debt-item-info">
                        <span class="debt-item-date">📅 ${dateDisplay} &nbsp;·&nbsp; 🕐 ${booking.time}</span>
                        <span class="debt-item-type">${SLOT_NAMES[booking.slotType]}${creditApplied > 0 ? ` <span style="color:#92400e;font-size:0.8em">(💳 €${creditApplied} già applicato)</span>` : ''}</span>
                    </div>
                    <span class="debt-item-price">€${Number(price).toFixed(2).replace('.', ',')}</span>
                </label>`;
        } else {
            const { balance, date } = it.debtInfo;
            el.classList.add('debt-popup-item--past');
            const dateDisplay = date
                ? (() => { const dt = new Date(date); return `${dt.getDate()}/${dt.getMonth()+1}/${dt.getFullYear()}`; })()
                : '—';
            el.innerHTML = `
                <label class="debt-item-label">
                    <input type="checkbox" class="debt-item-check" data-id="manual-debt" data-price="${balance}" onchange="updateDebtTotal()">
                    <div class="debt-item-info">
                        <span class="debt-item-date">📋 ${dateDisplay}</span>
                        <span class="debt-item-type">Debito manuale</span>
                    </div>
                    <span class="debt-item-price">€${balance.toFixed(2).replace('.', ',')}</span>
                </label>`;
        }
        list.appendChild(el);
    });
}

function updateDebtTotal() {
    const checked = document.querySelectorAll('.debt-item-check:checked');
    const all = document.querySelectorAll('.debt-item-check');
    const dueTotal = Array.from(checked).reduce((sum, cb) => sum + Number(cb.dataset.price), 0);

    document.getElementById('debtSelectedTotal').textContent = `€${dueTotal}`;

    // Reset amount input to match new selection
    const amountInput = document.getElementById('debtAmountInput');
    if (amountInput) amountInput.value = dueTotal;

    updateCreditPreview();

    const selectAll = document.getElementById('debtSelectAll');
    selectAll.indeterminate = checked.length > 0 && checked.length < all.length;
    selectAll.checked = all.length > 0 && checked.length === all.length;
}

function onAmountInput() {
    const amountInput = document.getElementById('debtAmountInput');
    const amountPaid = parseFloat(amountInput.value) || 0;

    // Calcola disponibilità = importo inserito + credito esistente
    const existingCredit = currentDebtContact
        ? (CreditStorage.getBalance(currentDebtContact.whatsapp, currentDebtContact.email) || 0)
        : 0;
    let available = Math.round((amountPaid + existingCredit) * 100) / 100;

    // Auto-seleziona lezioni passate (rosso chiaro) dalla più vecchia alla più recente
    const allItems = document.querySelectorAll('#debtPopupList .debt-popup-item');
    allItems.forEach(item => {
        const cb = item.querySelector('.debt-item-check');
        if (!cb) return;
        const isPast = item.classList.contains('debt-popup-item--past');
        if (isPast) {
            const price = Number(cb.dataset.price);
            if (available >= price && amountPaid > 0) {
                cb.checked = true;
                available = Math.round((available - price) * 100) / 100;
            } else {
                cb.checked = false;
            }
        }
    });

    // Aggiorna totali senza resettare l'importo
    const checked = document.querySelectorAll('.debt-item-check:checked');
    const all = document.querySelectorAll('.debt-item-check');
    const dueTotal = Array.from(checked).reduce((sum, cb) => sum + Number(cb.dataset.price), 0);
    document.getElementById('debtSelectedTotal').textContent = `€${dueTotal}`;

    const selectAll = document.getElementById('debtSelectAll');
    selectAll.indeterminate = checked.length > 0 && checked.length < all.length;
    selectAll.checked = all.length > 0 && checked.length === all.length;

    updateCreditPreview();
}

function updateCreditPreview() {
    const checked = document.querySelectorAll('.debt-item-check:checked');
    const dueTotal = Array.from(checked).reduce((sum, cb) => sum + Number(cb.dataset.price), 0);
    const amountInput = document.getElementById('debtAmountInput');
    const amountPaid = amountInput ? (parseFloat(amountInput.value) || 0) : dueTotal;

    // Allineato alla RPC: credit_delta = amount_paid - due_total
    const excessCredit = Math.round((amountPaid - dueTotal) * 100) / 100;
    const cashNeeded = dueTotal;

    const creditRow = document.getElementById('debtCreditRow');
    const creditMsg = document.getElementById('debtCreditMsg');
    if (creditRow && creditMsg) {
        if (amountPaid > 0 && checked.length === 0) {
            // Credito puro: nessuna lezione selezionata, importo inserito
            creditRow.style.display = 'flex';
            creditMsg.innerHTML = `✨ Verrà aggiunto <strong>€${amountPaid}</strong> di credito`;
            creditRow.className = 'debt-credit-row debt-credit-row--positive';
        } else if (checked.length > 0 && excessCredit > 0) {
            creditRow.style.display = 'flex';
            creditMsg.innerHTML = `✨ Verrà aggiunto <strong>€${excessCredit}</strong> di credito`;
            creditRow.className = 'debt-credit-row debt-credit-row--positive';
        } else if (checked.length > 0 && amountPaid > 0 && amountPaid < cashNeeded) {
            const shortage = Math.round((cashNeeded - amountPaid) * 100) / 100;
            creditRow.style.display = 'flex';
            creditMsg.innerHTML = `⚠️ Importo inferiore al dovuto (–€${shortage})`;
            creditRow.className = 'debt-credit-row debt-credit-row--warning';
        } else {
            creditRow.style.display = 'none';
        }
    }

    const methodSelect = document.getElementById('debtMethodSelect');
    const isFreeLessonMethod = methodSelect && methodSelect.value === 'lezione-gratuita';
    const payBtn = document.getElementById('debtPayBtn');
    if (payBtn) {
        if (isFreeLessonMethod) {
            payBtn.disabled = checked.length === 0;
        } else {
            payBtn.disabled = amountPaid <= 0;
        }
    }
}

function toggleAllDebts(checked) {
    document.querySelectorAll('.debt-item-check').forEach(cb => { cb.checked = checked; });
    updateDebtTotal();
}

function selectPaymentMethod(btn) {
    // Legacy button handler (kept for safety)
    document.querySelectorAll('#debtPopupModal .debt-method-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const isFree = btn.dataset.method === 'lezione-gratuita';
    const amountRow = document.querySelector('#debtPopupModal .debt-payment-amount-row');
    if (amountRow) amountRow.style.display = isFree ? 'none' : '';
    updateCreditPreview();
}

function onPaymentMethodChange(select) {
    const isFree = select.value === 'lezione-gratuita';
    const amountRow = document.querySelector('#debtPopupModal .debt-payment-amount-row');
    if (amountRow) amountRow.style.display = isFree ? 'none' : '';
    updateCreditPreview();
}

async function paySelectedDebts() {
    const checked = document.querySelectorAll('.debt-item-check:checked');
    const methodSelect = document.getElementById('debtMethodSelect');
    const paymentMethod = methodSelect ? methodSelect.value : '';
    if (!paymentMethod) { showToast('Seleziona un metodo di pagamento', 'error'); return; }

    const isFreeLesson = paymentMethod === 'lezione-gratuita';
    const amountInput = document.getElementById('debtAmountInput');
    const amountPaid = isFreeLesson ? 0 : (amountInput ? (parseFloat(amountInput.value) || 0) : 0);

    // Nessuna lezione selezionata e nessun importo: niente da fare
    if (checked.length === 0 && amountPaid <= 0) return;

    // Controllo dati per carta/bonifico
    if (paymentMethod === 'carta' || paymentMethod === 'iban') {
        const contact = currentDebtContact;
        if (contact) {
            try { await ensureClientDataForCardPayment(contact.email, contact.whatsapp, contact.name, paymentMethod); }
            catch { return; }
        }
    }

    // Separa checkbox debito manuale da checkbox prenotazioni
    const bookings = BookingStorage.getAllBookings();
    const bookingCbs = Array.from(checked).filter(cb => cb.dataset.id !== 'manual-debt');
    const sbIds = bookingCbs.map(cb => {
        const b = bookings.find(bk => bk.id === cb.dataset.id);
        return b?._sbId;
    }).filter(Boolean);

    const manualDebtCb = document.querySelector('.debt-item-check[data-id="manual-debt"]:checked');
    const manualDebtOffset = manualDebtCb ? Number(manualDebtCb.dataset.price) : 0;

    // Cattura il contatto prima di closeDebtPopup (che lo azzera)
    const contact = currentDebtContact;

    if (!sbIds.length) {
        // Fallback: logica client-side (nessuna prenotazione Supabase selezionata)
        const dueTotal = Array.from(checked).reduce((sum, cb) => sum + Number(cb.dataset.price), 0);
        const creditDelta = Math.round((amountPaid - dueTotal) * 100) / 100;
        const now = new Date().toISOString();
        bookingCbs.forEach(cb => {
            const booking = bookings.find(b => b.id === cb.dataset.id);
            if (booking) { booking.paid = true; booking.paymentMethod = paymentMethod; booking.paidAt = now; }
        });
        BookingStorage.replaceAllBookings(bookings);
        if (manualDebtCb && contact) {
            await ManualDebtStorage.addDebt(contact.whatsapp, contact.email, contact.name, -manualDebtOffset, 'Saldo debito manuale', paymentMethod);
        }
        if (!isFreeLesson && amountPaid > 0 && contact) {
            const methodLabel = { contanti: 'Contanti', carta: 'Carta', iban: 'Bonifico' }[paymentMethod] || paymentMethod;
            if (creditDelta > 0) {
                const creditNote = dueTotal > 0 ? `Pagamento in acconto di €${amountPaid}` : `Credito aggiunto`;
                await CreditStorage.addCredit(contact.whatsapp, contact.email, contact.name, creditDelta, creditNote, amountPaid, false, false, null, paymentMethod);
                // Reconcile via RPC dopo aggiunta credito
                if (typeof supabaseClient !== 'undefined' && contact.email) {
                    await _rpcWithTimeout(supabaseClient.rpc('apply_credit_to_past_bookings', {
                        p_email: contact.email,
                        p_slot_prices: { 'personal-training': 5, 'small-group': 10, 'group-class': 30 }
                    }));
                }
            } else {
                await CreditStorage.addCredit(contact.whatsapp, contact.email, contact.name, 0, `${methodLabel} ricevuto`, amountPaid, false, false, null, paymentMethod);
            }
        }
        closeDebtPopup();
        if (selectedAdminDay) renderAdminDayView(selectedAdminDay);
        const activeTab = document.querySelector('.admin-tab.active');
        if (activeTab && activeTab.dataset.tab === 'payments') renderPaymentsTab();
        return;
    }

    closeDebtPopup();

    (async () => {
        const { data, error } = await _rpcWithTimeout(supabaseClient.rpc('admin_pay_bookings', {
            p_booking_sb_ids:     sbIds,
            p_email:              contact.email.toLowerCase(),
            p_whatsapp:           contact.whatsapp || null,
            p_name:               contact.name,
            p_payment_method:     paymentMethod,
            p_amount_paid:        amountPaid,
            p_manual_debt_offset: manualDebtOffset,
            p_slot_prices:        { 'personal-training': 5, 'small-group': 10, 'group-class': 30 },
        }));
        if (error) {
            console.error('[Supabase] admin_pay_bookings error:', error.message);
            alert('⚠️ Errore: ' + error.message);
            return;
        }
        console.log('[admin_pay_bookings]', data);
        await Promise.all([BookingStorage.syncFromSupabase(), CreditStorage.syncFromSupabase(), ManualDebtStorage.syncFromSupabase()]);
        if (selectedAdminDay) renderAdminDayView(selectedAdminDay);
        const activeTab = document.querySelector('.admin-tab.active');
        if (activeTab && activeTab.dataset.tab === 'payments') renderPaymentsTab();
    })();
}

function closeDebtPopup() {
    document.getElementById('debtPopupOverlay').classList.remove('open');
    document.getElementById('debtPopupModal').classList.remove('open');
    currentDebtContact = null;
}
