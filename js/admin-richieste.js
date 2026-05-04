// ══════════════════════════════════════════════════════════════════════════
// ██  TAB RICHIESTE — Gestione richieste accesso a slot small-group full
// ══════════════════════════════════════════════════════════════════════════

let _richiesteShowHistory = false;

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
    const active = all.filter(r => r.status === 'pending' || r.status === 'offered');
    const history = all.filter(r => r.status !== 'pending' && r.status !== 'offered');

    // Raggruppa per (date, time, slot_type)
    const groups = {};
    const list = _richiesteShowHistory ? all : active;
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

    let html = `
        <div class="richieste-header">
            <h3 class="richieste-title">📥 Richieste accesso slot</h3>
            <div class="richieste-controls">
                <label class="richieste-toggle">
                    <input type="checkbox" ${_richiesteShowHistory ? 'checked' : ''} onchange="toggleRichiesteHistory(this.checked)">
                    <span>Mostra storico</span>
                </label>
                <button class="richieste-refresh-btn" onclick="renderRichiesteTab()">🔄 Aggiorna</button>
            </div>
        </div>
    `;

    html += `<div class="richieste-summary">`;
    html += `<span><b>${active.length}</b> attive · <b>${history.length}</b> storico</span>`;
    html += `</div>`;

    if (groupKeys.length === 0) {
        html += `<div class="richieste-empty">${_richiesteShowHistory ? 'Nessuna richiesta nello storico.' : 'Nessuna richiesta attiva al momento.'}</div>`;
        container.innerHTML = html;
        return;
    }

    html += '<div class="richieste-groups">';
    for (const key of groupKeys) {
        const g = groups[key];
        const slotName = (typeof SLOT_NAMES !== 'undefined' && SLOT_NAMES[g.slotType]) || g.slotType;
        const dateLabel = g.dateDisplay || _richFormatDate(g.date);
        const activeItems = g.items.filter(r => r.status === 'pending' || r.status === 'offered');
        html += `<div class="richieste-group">`;
        html += `<div class="richieste-group-header">`;
        html += `  <div class="richieste-group-slot">🟡 ${slotName}</div>`;
        html += `  <div class="richieste-group-when">${dateLabel} · ${g.time}</div>`;
        html += `  <div class="richieste-group-count">${activeItems.length} in coda</div>`;
        html += `</div>`;
        html += `<div class="richieste-group-list">`;
        const sorted = [...g.items].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
        sorted.forEach((r, idx) => {
            const isActive = r.status === 'pending' || r.status === 'offered';
            const offeredSrcSuffix = r.status === 'offered'
                ? (r.offerSource === 'admin' ? ' (offerta admin, attesa conferma)' : ' (auto, attesa conferma)')
                : '';
            const statusLabel = ({
                pending:       '🟠 In attesa',
                offered:       '🔵 Posto offerto' + offeredSrcSuffix,
                approved:      '✅ Confermata',
                declined_user: '🚫 Rifiutata dall\'utente',
                expired:       '⏱ Scaduta',
            }[r.status]) || r.status;
            const positionLabel = isActive ? `#${idx + 1}` : '';
            html += `<div class="richieste-item richieste-item--${r.status}">`;
            html += `  <div class="richieste-item-pos">${positionLabel}</div>`;
            html += `  <div class="richieste-item-user">`;
            html += `    <div class="richieste-item-name">${_richEscape(r.userName || '—')}</div>`;
            html += `    <div class="richieste-item-meta">${_richEscape(r.userEmail || '')}${r.userWhatsapp ? ' · ' + _richEscape(r.userWhatsapp) : ''}</div>`;
            html += `    <div class="richieste-item-meta">richiesta: ${_richFormatRelative(r.createdAt)}${r.offeredAt ? ' · offerta: ' + _richFormatRelative(r.offeredAt) : ''}</div>`;
            html += `  </div>`;
            html += `  <div class="richieste-item-status">${statusLabel}</div>`;
            if (r.status === 'pending') {
                html += `  <div class="richieste-item-actions">`;
                html += `    <button class="btn-primary richieste-approve-btn" data-rid="${r.id}">Offri posto</button>`;
                html += `  </div>`;
            } else if (r.status === 'offered') {
                html += `  <div class="richieste-item-actions">`;
                html += `    <button class="btn-primary richieste-approve-btn" data-rid="${r.id}" title="Re-invia notifica all'utente">Re-invia</button>`;
                html += `  </div>`;
            }
            html += `</div>`;
        });
        html += `</div></div>`;
    }
    html += '</div>';

    container.innerHTML = html;

    container.querySelectorAll('.richieste-approve-btn').forEach(btn => {
        btn.addEventListener('click', () => approveAccessRequest(btn.dataset.rid, btn));
    });
}

function _richEscape(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
}

function toggleRichiesteHistory(show) {
    _richiesteShowHistory = !!show;
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
