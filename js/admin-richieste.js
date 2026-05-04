// ══════════════════════════════════════════════════════════════════════════
// ██  TAB RICHIESTE — Gestione richieste accesso a slot small-group full
// ══════════════════════════════════════════════════════════════════════════

// Filtri stato: 'pending' (default) | 'active' (pending+offered) | 'offered' | 'history'
let _richiesteFilter = 'pending';

function setRichiesteFilter(value, btnEl) {
    _richiesteFilter = value;
    document.querySelectorAll('#richiesteFilterBar .filter-btn').forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
    renderRichiesteList();
}

function _richFormatDate(isoDate) {
    if (!isoDate) return '';
    const d = new Date(isoDate + 'T00:00:00');
    if (isNaN(d.getTime())) return isoDate;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(2);
    const giorni = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];
    return `${giorni[d.getDay()]} ${dd}/${mm}/${yy}`;
}

function _richFormatRelative(isoTs) {
    if (!isoTs) return '';
    const d = new Date(isoTs);
    if (isNaN(d.getTime())) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm} ${hh}:${min}`;
}

function updateRichiesteBadge() {
    const badge = document.getElementById('richiesteBadge');
    if (!badge) return;
    const count = (typeof SlotAccessRequestStorage !== 'undefined')
        ? SlotAccessRequestStorage.getAllActive().filter(r => r.status === 'pending' || r.status === 'offered').length
        : 0;
    badge.textContent = count > 0 ? String(count) : '';
}

async function renderRichiesteTab() {
    const container = document.getElementById('richiesteContainer');
    if (!container) return;
    container.innerHTML = '<div class="richieste-loading">Caricamento richieste...</div>';
    if (typeof SlotAccessRequestStorage === 'undefined') {
        container.innerHTML = '<div class="richieste-empty">Modulo richieste non disponibile.</div>';
        return;
    }
    try {
        await SlotAccessRequestStorage.syncFromSupabase();
        SlotAccessRequestStorage.expireStarted().catch(() => {});
    } catch (e) { /* ignore */ }
    renderRichiesteList();
    updateRichiesteBadge();
}

function renderRichiesteList() {
    const container = document.getElementById('richiesteContainer');
    if (!container) return;

    const all = SlotAccessRequestStorage.getAll();
    const counts = {
        active:  all.filter(r => r.status === 'pending' || r.status === 'offered').length,
        pending: all.filter(r => r.status === 'pending').length,
        offered: all.filter(r => r.status === 'offered').length,
        history: all.filter(r => r.status !== 'pending' && r.status !== 'offered').length,
    };

    // Applica il filtro corrente
    const list = all.filter(r => {
        switch (_richiesteFilter) {
            case 'pending': return r.status === 'pending';
            case 'offered': return r.status === 'offered';
            case 'history': return r.status !== 'pending' && r.status !== 'offered';
            case 'active':
            default:        return r.status === 'pending' || r.status === 'offered';
        }
    });

    // Raggruppa per (date, time, slot_type)
    const groups = {};
    list.forEach(r => {
        const key = `${r.date}||${r.time}||${r.slotType}`;
        if (!groups[key]) groups[key] = { date: r.date, time: r.time, slotType: r.slotType, dateDisplay: r.dateDisplay, items: [] };
        groups[key].items.push(r);
    });

    const groupKeys = Object.keys(groups).sort((a, b) => {
        const ga = groups[a], gb = groups[b];
        if (ga.date !== gb.date) return ga.date.localeCompare(gb.date);
        return ga.time.localeCompare(gb.time);
    });

    // Refresh button (icon-only) — sostituisce il vecchio "🔄 Aggiorna"
    const ICON_REFRESH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><polyline points="21 3 21 8 16 8"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><polyline points="3 21 3 16 8 16"/></svg>';
    const ICON_USERS   = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="8" r="4"/><path d="M9 14c-3.3 0-6 1.8-6 4v2h12v-2c0-2.2-2.7-4-6-4z"/><circle cx="17.5" cy="8.5" r="3"/><path d="M17.5 13.5c-1 0-1.9.2-2.6.5 1.3 1 2.1 2.4 2.1 4v2H22v-2c0-2.2-2-4.5-4.5-4.5z"/></svg>';
    const ICON_CHECK   = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';

    let html = `
        <div class="rich-toolbar">
            <div class="rich-counts">
                <b>${counts.active}</b> attive · <b>${counts.pending}</b> in attesa · <b>${counts.offered}</b> offerte · <b>${counts.history}</b> storico
            </div>
            <button class="rich-refresh" type="button" onclick="renderRichiesteTab()" title="Aggiorna" aria-label="Aggiorna">${ICON_REFRESH}</button>
        </div>
    `;

    const sectionLabel = ({
        pending: 'In attesa di approvazione',
        offered: 'Posto offerto · in attesa conferma utente',
        history: 'Storico',
        active:  'Attive',
    })[_richiesteFilter] || 'Richieste';
    html += `<div class="rich-section-h">${sectionLabel}</div>`;

    const emptyMsg = ({
        pending: 'Nessuna richiesta in attesa.',
        offered: 'Nessuna offerta in attesa di conferma utente.',
        history: 'Nessuna richiesta nello storico.',
        active:  'Nessuna richiesta attiva al momento.',
    })[_richiesteFilter] || 'Nessuna richiesta da mostrare.';
    if (groupKeys.length === 0) {
        html += `<div class="rich-empty">${emptyMsg}</div>`;
        container.innerHTML = html;
        return;
    }

    const allBookings = (typeof BookingStorage !== 'undefined') ? BookingStorage.getAllBookings() : [];

    html += '<div class="rich-cards">';
    for (const key of groupKeys) {
        const g = groups[key];
        const slotName = (typeof SLOT_NAMES !== 'undefined' && SLOT_NAMES[g.slotType]) || g.slotType;
        const dateLabel = g.dateDisplay || _richFormatDate(g.date);
        const activeItems = g.items.filter(r => r.status === 'pending' || r.status === 'offered');

        // Occupazione attuale + impatto se approvi tutte le richieste attive
        const currentCount = allBookings.filter(b =>
            b.date === g.date && b.time === g.time && b.slotType === g.slotType &&
            (b.status === 'confirmed' || b.status === 'cancellation_requested')
        ).length;
        const maxCapacity = (typeof SLOT_MAX_CAPACITY !== 'undefined' && SLOT_MAX_CAPACITY[g.slotType]) || 5;
        const proposedCount = currentCount + activeItems.length;
        const overBy = Math.max(0, proposedCount - maxCapacity);
        const showStrip = activeItems.length > 0;

        html += `<div class="rich-card">`;
        html += `  <div class="rich-card-head">`;
        html += `    <div class="rich-head-row">`;
        html += `      <div class="rich-ic">${ICON_USERS}</div>`;
        html += `      <div class="rich-titles">`;
        html += `        <div class="rich-t">${slotName}</div>`;
        html += `        <div class="rich-s">${dateLabel} · ${g.time}</div>`;
        html += `      </div>`;
        html += `    </div>`;
        if (showStrip) {
            html += `    <div class="rich-strip${overBy > 0 ? ' rich-strip--over' : ''}">`;
            html += `      <span class="rich-strip-lbl">Posti</span>`;
            html += `      <span class="rich-strip-now">${currentCount}/${maxCapacity}</span>`;
            html += `      <span class="rich-strip-arr" aria-hidden="true">→</span>`;
            html += `      <span class="rich-strip-next">${proposedCount}/${maxCapacity}</span>`;
            if (overBy > 0) {
                html += `      <span class="rich-strip-over">+${overBy} oltre il limite</span>`;
            }
            html += `    </div>`;
        }
        html += `  </div>`;

        const sorted = [...g.items].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
        sorted.forEach((r, idx) => {
            const isActive = r.status === 'pending' || r.status === 'offered';
            const positionLabel = isActive ? `#${idx + 1}` : '';
            const initials = _richInitials(r.userName);
            // Status pill: pending=arancio, offered=blu, altri=neutro
            let statusPillClass = 'rich-status--neutral';
            let statusPillText = 'Storico';
            if (r.status === 'pending')        { statusPillClass = 'rich-status--pending';  statusPillText = 'In attesa'; }
            else if (r.status === 'offered')   {
                statusPillClass = 'rich-status--offered';
                statusPillText = (r.offerSource === 'admin') ? 'Offerto · attende conferma' : 'Auto-offerto · attende conferma';
            }
            else if (r.status === 'approved')      { statusPillClass = 'rich-status--ok';        statusPillText = 'Confermata'; }
            else if (r.status === 'declined_user') { statusPillClass = 'rich-status--declined';  statusPillText = 'Rifiutata dall\'utente'; }
            else if (r.status === 'expired')       { statusPillClass = 'rich-status--neutral';   statusPillText = 'Scaduta'; }

            html += `<div class="rich-req">`;
            html += `  <div class="rich-av" aria-hidden="true">${initials}</div>`;
            html += `  <div class="rich-rb">`;
            html += `    <div class="rich-name-row">`;
            html += `      <span class="rich-name">${_richEscape(r.userName || '—')}</span>`;
            if (positionLabel) html += `<span class="rich-pos">${positionLabel}</span>`;
            html += `    </div>`;
            html += `    <div class="rich-time">richiesta ${_richFormatRelative(r.createdAt)}${r.offeredAt ? ' · offerta ' + _richFormatRelative(r.offeredAt) : ''}</div>`;
            html += `    <span class="rich-status-pill ${statusPillClass}"><span class="rich-status-dot"></span>${statusPillText}</span>`;
            html += `  </div>`;
            html += `</div>`;

            if (r.status === 'pending' || r.status === 'offered') {
                html += `<div class="rich-actions">`;
                if (r.status === 'pending') {
                    html += `  <button class="rich-btn rich-btn--primary richieste-approve-btn" data-rid="${r.id}" type="button">${ICON_CHECK}<span>Offri posto</span></button>`;
                } else {
                    html += `  <button class="rich-btn rich-btn--primary richieste-approve-btn" data-rid="${r.id}" type="button" title="Re-invia notifica all'utente">${ICON_REFRESH}<span>Re-invia notifica</span></button>`;
                }
                html += `</div>`;
            }
        });
        html += `</div>`;
    }
    html += '</div>';

    container.innerHTML = html;

    container.querySelectorAll('.richieste-approve-btn').forEach(btn => {
        btn.addEventListener('click', () => approveAccessRequest(btn.dataset.rid, btn));
    });
}

function _richInitials(name) {
    if (!name) return '?';
    const parts = String(name).trim().split(/\s+/);
    const a = (parts[0] && parts[0][0]) || '';
    const b = (parts[1] && parts[1][0]) || '';
    return (a + b).toUpperCase() || '?';
}

function _richEscape(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
}

// Mantenuto per compat retroattiva (non più usato dall'UI)
function toggleRichiesteHistory(show) {
    _richiesteFilter = show ? 'history' : 'active';
    renderRichiesteList();
}

async function approveAccessRequest(requestId, btnEl) {
    if (!requestId) return;
    const req = SlotAccessRequestStorage.getAll().find(r => r.id === requestId);
    if (!req) {
        if (typeof showToast === 'function') showToast('Richiesta non trovata. Aggiorna.', 'error');
        return;
    }
    const slotName = (typeof SLOT_NAMES !== 'undefined' && SLOT_NAMES[req.slotType]) || req.slotType;
    const dateLabel = req.dateDisplay || _richFormatDate(req.date);
    const ok = confirm(
        `Inviare offerta a ${req.userName} per ${slotName} ${dateLabel} ${req.time}?\n\n` +
        `L'utente riceverà una notifica e dovrà confermare in app per essere effettivamente aggiunto. ` +
        `Lo slot accetterà 1 posto extra (over-capacity).`
    );
    if (!ok) return;

    if (btnEl) { btnEl.disabled = true; btnEl.textContent = 'Invio…'; }

    const r = await SlotAccessRequestStorage.adminApprove(requestId);
    if (!r.ok) {
        const errMap = {
            already_resolved:  'La richiesta è già stata risolta.',
            request_not_found: 'Richiesta non trovata.',
            unauthorized:      'Non sei admin.',
        };
        if (typeof showToast === 'function') showToast(errMap[r.error] || 'Errore: ' + (r.error || 'sconosciuto'), 'error');
        if (btnEl) { btnEl.disabled = false; btnEl.textContent = 'Offri posto'; }
        return;
    }

    // Manda push all'utente con source='admin' (titolo banner/notifica diverso)
    if (typeof notifyAccessRequestUpdate === 'function') {
        try {
            await notifyAccessRequestUpdate({
                user_id:      req.userId,
                date:         req.date,
                time:         req.time,
                slot_type:    req.slotType,
                date_display: req.dateDisplay || '',
                offer_source: 'admin',
            }, 'slot_offered');
        } catch (e) { console.warn('[admin-richieste] push offered error:', e); }
    }

    if (typeof showToast === 'function') showToast('Offerta inviata: l\'utente deve ora confermare in app.', 'success', 4500);
    renderRichiesteList();
    updateRichiesteBadge();
}
