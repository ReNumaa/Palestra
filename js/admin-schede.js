// ═══════════════════════════════════════════════════════════════════════════════
// TAB SCHEDE — Gestione schede palestra (workout plans)
// ═══════════════════════════════════════════════════════════════════════════════

const MUSCLE_GROUPS = ['Petto','Dorso','Spalle','Bicipiti','Tricipiti','Gambe','Glutei','Addominali','Polpacci','Cardio','Stretching','Altro'];

// Catalogo esercizi raggruppato per muscolo
const EXERCISE_CATALOG = {
    'Petto':       ['Panca piana bilanciere','Panca piana manubri','Panca inclinata bilanciere','Panca inclinata manubri','Panca declinata','Croci manubri','Croci ai cavi','Chest press','Push-up','Dip alle parallele'],
    'Dorso':       ['Lat machine avanti','Lat machine dietro','Pulley basso','Rematore bilanciere','Rematore manubrio','Stacco da terra','Trazioni alla sbarra','Pull-down corda','T-bar row','Hyperextension'],
    'Spalle':      ['Military press bilanciere','Shoulder press manubri','Alzate laterali','Alzate frontali','Face pull','Arnold press','Tirate al mento','Shoulder press macchina','Alzate laterali ai cavi','Shrug'],
    'Bicipiti':    ['Curl bilanciere','Curl manubri','Curl martello','Curl concentrato','Curl panca Scott','Curl ai cavi','Curl con bilanciere EZ'],
    'Tricipiti':   ['Push-down ai cavi','French press','Estensioni manubrio sopra la testa','Dip a presa stretta','Kickback','Skull crusher','Push-down corda'],
    'Gambe':       ['Squat bilanciere','Squat frontale','Leg press','Affondi','Leg extension','Leg curl','Stacco rumeno','Bulgarian split squat','Hack squat','Pressa orizzontale'],
    'Glutei':      ['Hip thrust','Ponte glutei','Abductor machine','Slanci posteriori','Sumo squat','Step-up','Kickback ai cavi'],
    'Addominali':  ['Crunch','Crunch inverso','Plank','Side plank','Russian twist','Leg raise','Ab wheel','Sit-up','Mountain climber','Hollow body hold'],
    'Polpacci':    ['Calf raise in piedi','Calf raise seduto','Calf raise alla leg press','Donkey calf raise'],
    'Cardio':      ['Corsa','Cyclette','Vogatore','Ellittica','Corda','HIIT','Camminata inclinata','Nuoto','Assault bike'],
    'Stretching':  ['Stretching statico','Stretching dinamico','Foam rolling','Yoga','Mobilità articolare'],
};

function _buildExerciseSelect(currentValue, exId, muscleGroup) {
    const isCustom = currentValue && !Object.values(EXERCISE_CATALOG).flat().includes(currentValue) && currentValue !== 'Nuovo esercizio';
    let html = `<select class="schede-ex-name" onchange="_schedeExNameChanged('${exId}', this)">`;
    html += `<option value="">— Seleziona esercizio —</option>`;

    if (muscleGroup && EXERCISE_CATALOG[muscleGroup]) {
        // Show only exercises for the selected muscle group
        for (const name of EXERCISE_CATALOG[muscleGroup]) {
            html += `<option value="${_escHtml(name)}" ${currentValue === name ? 'selected' : ''}>${_escHtml(name)}</option>`;
        }
    } else {
        // No muscle selected: show all grouped by muscle
        for (const [group, exercises] of Object.entries(EXERCISE_CATALOG)) {
            html += `<optgroup label="${group}">`;
            for (const name of exercises) {
                html += `<option value="${_escHtml(name)}" ${currentValue === name ? 'selected' : ''}>${_escHtml(name)}</option>`;
            }
            html += '</optgroup>';
        }
    }
    html += `<option value="__custom__" ${isCustom ? 'selected' : ''}>✏️ Personalizzato</option>`;
    html += '</select>';
    if (isCustom) {
        html += `<input type="text" class="schede-ex-custom-name" value="${_escHtml(currentValue)}" placeholder="Nome personalizzato"
                        onchange="_schedeUpdateExField('${exId}','exercise_name',this.value)">`;
    }
    return html;
}

function _schedeExNameChanged(exId, selectEl) {
    const value = selectEl.value;
    const container = selectEl.closest('.schede-ex-top-row');
    if (value === '__custom__') {
        let customInput = container.querySelector('.schede-ex-custom-name');
        if (!customInput) {
            customInput = document.createElement('input');
            customInput.type = 'text';
            customInput.className = 'schede-ex-custom-name';
            customInput.placeholder = 'Nome personalizzato';
            customInput.onchange = function() { _schedeUpdateExField(exId, 'exercise_name', this.value); };
            selectEl.after(customInput);
        }
        customInput.focus();
    } else if (value) {
        const customInput = container.querySelector('.schede-ex-custom-name');
        if (customInput) customInput.remove();
        _schedeUpdateExField(exId, 'exercise_name', value);
    }
}

// When muscle group changes: update exercise select with filtered options
function _schedeMuscleChanged(exId, muscleSelect) {
    const muscle = muscleSelect.value;
    _schedeUpdateExField(exId, 'muscle_group', muscle);

    // Rebuild exercise select filtered by this muscle
    const row = muscleSelect.closest('.schede-exercise-row');
    const exSelect = row?.querySelector('.schede-ex-name');
    if (!exSelect) return;

    const currentValue = exSelect.value;
    // Check if current exercise belongs to new muscle group
    const muscleExercises = EXERCISE_CATALOG[muscle] || [];
    const keepValue = muscleExercises.includes(currentValue) ? currentValue : '';

    // Replace the exercise select in-place
    const topRow = row.querySelector('.schede-ex-top-row');
    const oldCustom = topRow.querySelector('.schede-ex-custom-name');
    if (oldCustom) oldCustom.remove();

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = _buildExerciseSelect(keepValue, exId, muscle);
    const newSelect = tempDiv.querySelector('.schede-ex-name');
    exSelect.replaceWith(newSelect);

    // If exercise was cleared, update DB
    if (!keepValue && currentValue) {
        _schedeUpdateExField(exId, 'exercise_name', '');
    }
}

// Only registered users (with Supabase UUID) can be assigned plans
function _schedeGetRegisteredUsers() {
    if (typeof UserStorage === 'undefined') return [];
    return UserStorage.getAll().filter(u => u.userId);
}

let _schedeView = 'list';  // 'list' | 'edit' | 'progress' | 'clients' | 'client-detail'
let _schedeSection = 'schede'; // 'schede' | 'clienti'
let _currentPlanId = null;
let _editingPlan = null;
let _editDayLabels = [];
let _editActiveDay = '';
let _schedeClientUserId = null;  // for client-detail view

// ── Entry point ──────────────────────────────────────────────────────────────
let _schedeRendering = false;   // guard against concurrent calls
let _schedeRenderQueued = false; // re-render after current finishes

async function renderSchedeTab() {
    // If already rendering, queue one re-render and bail
    if (_schedeRendering) {
        _schedeRenderQueued = true;
        return;
    }
    _schedeRendering = true;
    _schedeRenderQueued = false;

    const container = document.getElementById('schedeContainer');
    if (!container) { _schedeRendering = false; return; }
    container.innerHTML = '<div class="schede-loading">Caricamento schede...</div>';
    try {
        await WorkoutPlanStorage.syncFromSupabase({ adminMode: true });
        await WorkoutPlanStorage.loadSuggestions();
    } catch (e) {
        container.innerHTML = '<div class="empty-slot">Errore caricamento schede</div>';
        _schedeRendering = false;
        if (_schedeRenderQueued) renderSchedeTab();
        return;
    }

    // Sub-navigation pills
    let html = `<div class="schede-subnav">
        <button class="schede-subnav-pill ${_schedeSection === 'schede' ? 'active' : ''}" onclick="_schedeSwitchSection('schede')">Schede</button>
        <button class="schede-subnav-pill ${_schedeSection === 'clienti' ? 'active' : ''}" onclick="_schedeSwitchSection('clienti')">Clienti</button>
    </div><div id="schedeInner"></div>`;
    container.innerHTML = html;

    const inner = document.getElementById('schedeInner');
    if (_schedeSection === 'clienti') {
        if (_schedeView === 'client-detail') await _renderClientDetail(inner);
        else _renderClientsList(inner);
    } else {
        if (_schedeView === 'edit') _renderPlanEditor(inner);
        else if (_schedeView === 'progress') await _renderProgressView(inner);
        else _renderSchedeList(inner);
    }

    _schedeRendering = false;
    // If a render was requested while we were busy, do one more pass
    if (_schedeRenderQueued) renderSchedeTab();
}

function _schedeSwitchSection(section) {
    _schedeSection = section;
    _schedeView = section === 'clienti' ? 'clients' : 'list';
    _schedeClientUserId = null;
    renderSchedeTab();
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENTS LIST (admin → see clients with plans)
// ═══════════════════════════════════════════════════════════════════════════════
function _renderClientsList(container) {
    const plans = WorkoutPlanStorage.getAllPlans();
    const allUsers = _schedeGetRegisteredUsers();
    const nameMap = {};
    for (const u of allUsers) nameMap[u.userId] = u.name || u.email || u.userId;
    const templates = plans.filter(p => !p.user_id);

    // Group plans by user (only assigned plans)
    const byUser = {};
    for (const p of plans) {
        if (!p.user_id) continue;
        if (!byUser[p.user_id]) byUser[p.user_id] = [];
        byUser[p.user_id].push(p);
    }

    const userIds = Object.keys(byUser).sort((a, b) =>
        (nameMap[a] || '').localeCompare(nameMap[b] || '')
    );

    let html = `<div class="schede-header">
        <h3>Clienti</h3>
    </div>`;

    // Quick assign: template + client search
    if (templates.length > 0) {
        html += `<div class="schede-assign-bar">
            <div class="schede-assign-row">
                <select id="schedeQuickTemplate">
                    <option value="">— Template —</option>
                    ${templates.map(t => `<option value="${t.id}">${_escHtml(t.name)}</option>`).join('')}
                </select>
                <div class="schede-client-selector" style="flex:1;">
                    <input type="text" id="schedeQuickClientSearch" placeholder="Cerca cliente..."
                           oninput="_schedeQuickSearchClient()" autocomplete="off">
                    <div id="schedeQuickClientDropdown" class="debtor-search-dropdown" style="display:none;"></div>
                </div>
                <button class="btn-primary" style="white-space:nowrap;" onclick="_schedeQuickAssign()">Assegna</button>
            </div>
        </div>`;
    }

    html += `<div class="schede-search-bar">
        <input type="text" id="schedeClientFilterInput" placeholder="Filtra clienti con schede..."
               oninput="_schedeFilterClientCards()">
    </div>`;

    if (userIds.length === 0) {
        html += '<div class="empty-slot">Nessun cliente con schede assegnate.</div>';
    } else {
        html += '<div class="schede-plan-list">';
        for (const uid of userIds) {
            const clientName = _escHtml(nameMap[uid] || 'Sconosciuto');
            const userPlans = byUser[uid];
            const activePlan = userPlans.find(p => p.active);
            const totalExercises = userPlans.reduce((s, p) => s + (p.workout_exercises || []).length, 0);
            html += `
            <div class="schede-plan-card schede-client-card" data-client="${clientName.toLowerCase()}" onclick="_schedeOpenClientDetail('${uid}')">
                <div class="schede-plan-card-header">
                    <div class="schede-plan-card-info">
                        <div class="schede-plan-client">${clientName}</div>
                        <div class="schede-plan-meta">${userPlans.length} schede &middot; ${totalExercises} esercizi${activePlan ? ' &middot; <span class="schede-badge-active">Attiva: ' + _escHtml(activePlan.name) + '</span>' : ''}</div>
                    </div>
                    <div class="schede-plan-actions"><span style="color:#9ca3af;font-size:1.1rem">→</span></div>
                </div>
            </div>`;
        }
        html += '</div>';
    }

    container.innerHTML = html;
}

function _schedeFilterClientCards() {
    const q = (document.getElementById('schedeClientFilterInput')?.value || '').toLowerCase();
    document.querySelectorAll('.schede-client-card').forEach(card => {
        card.style.display = card.dataset.client.includes(q) ? '' : 'none';
    });
}

// Quick assign: search any registered client
var _schedeQuickSearchClient = _debounce(function() {
    const input = document.getElementById('schedeQuickClientSearch');
    const dropdown = document.getElementById('schedeQuickClientDropdown');
    const q = (input?.value || '').toLowerCase();
    if (!q || q.length < 1) { dropdown.style.display = 'none'; return; }

    const matches = _schedeGetRegisteredUsers().filter(u =>
        (u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q)
    );

    if (matches.length === 0) {
        dropdown.innerHTML = '<div class="dropdown-no-results">Nessun cliente trovato</div>';
    } else {
        dropdown.innerHTML = matches.slice(0, 10).map(u =>
            `<div class="dropdown-item" onclick="_schedeQuickSelectClient('${u.userId}', '${_escHtml(u.name || u.email).replace(/'/g, "\\'")}')">
                <span class="dropdown-item-name">${_escHtml(u.name || 'Senza nome')}</span>
                <span style="color:#888;font-size:0.82rem">${_escHtml(u.email || '')}</span>
            </div>`
        ).join('');
    }
    dropdown.style.display = 'block';
}, 150);

function _schedeQuickSelectClient(userId, name) {
    const input = document.getElementById('schedeQuickClientSearch');
    input.value = name;
    input.dataset.userId = userId;
    document.getElementById('schedeQuickClientDropdown').style.display = 'none';
}

async function _schedeQuickAssign() {
    const templateId = document.getElementById('schedeQuickTemplate')?.value;
    const clientInput = document.getElementById('schedeQuickClientSearch');
    const userId = clientInput?.dataset?.userId;

    if (!templateId) { if (typeof showToast === 'function') showToast('Seleziona un template', 'error'); return; }
    if (!userId || userId === 'undefined') { if (typeof showToast === 'function') showToast('Seleziona un cliente', 'error'); return; }

    try {
        await WorkoutPlanStorage.duplicatePlan(templateId, userId);
        if (typeof showToast === 'function') showToast('Scheda assegnata!', 'success');
        // Reset
        clientInput.value = '';
        delete clientInput.dataset.userId;
        document.getElementById('schedeQuickTemplate').value = '';
        renderSchedeTab();
    } catch (e) {
        console.error('[Schede] quick assign error:', e);
        if (typeof showToast === 'function') showToast('Errore assegnazione', 'error');
    }
}

function _schedeOpenClientDetail(userId) {
    _schedeClientUserId = userId;
    _schedeView = 'client-detail';
    renderSchedeTab();
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENT DETAIL (admin → view a client's plans + charts)
// ═══════════════════════════════════════════════════════════════════════════════
async function _renderClientDetail(container) {
    const userId = _schedeClientUserId;
    const allUsers = _schedeGetRegisteredUsers();
    const clientName = allUsers.find(u => u.userId === userId)?.name || 'Cliente';
    const plans = WorkoutPlanStorage.getAllPlans().filter(p => p.user_id === userId);

    // Templates available for assignment
    const templates = WorkoutPlanStorage.getAllPlans().filter(p => !p.user_id);

    let html = `<div class="schede-editor-topbar">
        <button class="schede-back-btn" onclick="_schedeView='clients';renderSchedeTab()">← Clienti</button>
        <h3>${_escHtml(clientName)}</h3>
    </div>`;

    // Assign template button
    if (templates.length > 0) {
        html += `<div class="schede-assign-bar" style="margin-bottom:0.8rem;">
            <div class="schede-assign-row">
                <select id="schedeAssignTemplate">
                    <option value="">— Scegli template —</option>
                    ${templates.map(t => `<option value="${t.id}">${_escHtml(t.name)} (${(t.workout_exercises||[]).length} esercizi)</option>`).join('')}
                </select>
                <button class="btn-primary" onclick="_schedeAssignTemplate('${userId}')">Assegna</button>
            </div>
        </div>`;
    }

    // Show plans for this client
    html += '<h4 class="schede-section-title">Schede assegnate</h4>';
    for (const plan of plans) {
        const badge = plan.active ? '<span class="schede-badge-active">Attiva</span>' : '<span class="schede-badge-inactive">Inattiva</span>';
        const exCount = (plan.workout_exercises || []).length;
        html += `<div class="schede-plan-card" style="margin-bottom:0.4rem;">
            <div class="schede-plan-card-header">
                <div class="schede-plan-card-info">
                    <div class="schede-plan-name">${_escHtml(plan.name)} ${badge}</div>
                    <div class="schede-plan-meta">${exCount} esercizi${_schedeDateRange(plan) ? ' &middot; ' + _schedeDateRange(plan) : ''}</div>
                </div>
            </div>
        </div>`;
    }

    // Fetch ALL logs for this client's exercises
    const allExercises = plans.flatMap(p => p.workout_exercises || []);
    const allExIds = allExercises.map(e => e.id);

    if (!allExIds.length) {
        html += '<div class="empty-slot">Nessun esercizio nelle schede di questo cliente.</div>';
        container.innerHTML = html;
        return;
    }

    html += '<h4 class="schede-section-title" style="margin-top:1.2rem;">Progressi</h4>';

    container.innerHTML = html + '<div class="schede-loading">Caricamento log...</div>';

    const { data: logs } = await supabaseClient
        .from('workout_logs')
        .select('*')
        .in('exercise_id', allExIds)
        .order('log_date', { ascending: true });

    if (!logs?.length) {
        container.innerHTML = html + '<div class="empty-slot">Nessun log registrato da questo cliente.</div>';
        return;
    }

    // Map exercise_id → { name, muscle_group }
    const idToName = {};
    const nameToMuscle = {};
    for (const ex of allExercises) {
        idToName[ex.id] = ex.exercise_name;
        if (ex.muscle_group && !nameToMuscle[ex.exercise_name]) nameToMuscle[ex.exercise_name] = ex.muscle_group;
    }

    // Group logs by exercise name
    const logsByName = {};
    for (const l of logs) {
        const name = idToName[l.exercise_id] || 'Sconosciuto';
        if (!logsByName[name]) logsByName[name] = [];
        logsByName[name].push(l);
    }

    // Stats
    const totalSessions = new Set(logs.map(l => l.exercise_id + '|' + l.log_date)).size;
    const totalVolume = logs.reduce((s, l) => s + ((l.weight_done || 0) * (l.reps_done || 0)), 0);
    html += `<div class="schede-stats-grid">
        <div class="schede-stat-card">
            <div class="schede-stat-icon">📊</div>
            <div class="schede-stat-label">Sessioni</div>
            <div class="schede-stat-value">${totalSessions}</div>
        </div>
        <div class="schede-stat-card">
            <div class="schede-stat-icon">🏋️</div>
            <div class="schede-stat-label">Serie</div>
            <div class="schede-stat-value">${logs.length}</div>
        </div>
        <div class="schede-stat-card">
            <div class="schede-stat-icon">📈</div>
            <div class="schede-stat-label">Volume</div>
            <div class="schede-stat-value">${totalVolume >= 1000 ? (totalVolume/1000).toFixed(1) + 't' : totalVolume + 'kg'}</div>
        </div>
    </div>`;

    // Charts per exercise name
    const exerciseNames = Object.keys(logsByName).sort();
    let chartIdx = 0;
    for (const exName of exerciseNames) {
        const exLogs = logsByName[exName];
        const sessionMap = {};
        for (const l of exLogs) {
            if (l.weight_done == null) continue;
            const key = l.exercise_id + '|' + l.log_date;
            if (!sessionMap[key] || l.weight_done > sessionMap[key].weight) {
                sessionMap[key] = { date: l.log_date, weight: l.weight_done };
            }
        }
        const sessions = Object.values(sessionMap).sort((a, b) => a.date.localeCompare(b.date));
        if (!sessions.length) continue;

        const values = sessions.map(s => s.weight);
        const labels = sessions.map(s => _fmtDate(s.date));
        const maxW = Math.max(...values);
        const lastW = values[values.length - 1];
        const trend = values.length >= 2 ? lastW - values[0] : 0;
        const trendSign = trend > 0 ? '+' : '';
        const muscle = nameToMuscle[exName] || '';

        const canvasId = 'admin-pchart-' + (chartIdx++);
        html += `<div class="schede-admin-chart-card">
            <div class="schede-chart-header">
                <strong>${_escHtml(exName)}</strong>
                ${muscle ? '<span class="schede-badge-active schede-badge-sm">' + _escHtml(muscle) + '</span>' : ''}
            </div>
            <canvas id="${canvasId}" width="400" height="140" style="width:100%;max-height:140px;"></canvas>
            <div class="schede-chart-stats">
                <span>Max <strong>${maxW}kg</strong></span>
                <span>Ultimo <strong>${lastW}kg</strong></span>
                <span class="${trend >= 0 ? 'schede-trend-up' : 'schede-trend-down'}">Trend <strong>${trendSign}${trend.toFixed(1)}kg</strong></span>
                <span>${sessions.length} sessioni</span>
            </div>
        </div>`;

        setTimeout(((cid, lbl, val) => () => {
            const canvas = document.getElementById(cid);
            if (!canvas) return;
            _drawAdminChart(canvas, lbl, val);
        })(canvasId, labels, values), 50);
    }

    container.innerHTML = html;
}

// Simple line chart for admin (light theme)
function _drawAdminChart(canvas, labels, values) {
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const w = rect.width > 0 ? rect.width : 400;
    const h = 140;
    canvas.width = Math.round(w * 2);
    canvas.height = Math.round(h * 2);
    ctx.scale(2, 2);

    const pad = { top: 16, right: 12, bottom: 28, left: 36 };
    const cw = w - pad.left - pad.right;
    const ch = h - pad.top - pad.bottom;
    if (!values.length) return;

    const minV = Math.min(...values);
    const maxV = Math.max(...values);
    const range = maxV - minV || 1;
    const yMin = Math.max(0, minV - range * 0.1);
    const yMax = maxV + range * 0.1;
    const yRange = yMax - yMin || 1;

    // Grid
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = pad.top + ch - (ch * i / 4);
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cw, y); ctx.stroke();
        ctx.fillStyle = '#9ca3af';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(Math.round(yMin + yRange * i / 4), pad.left - 4, y + 3);
    }

    const pts = values.map((v, i) => ({
        x: pad.left + (values.length === 1 ? cw / 2 : (i / (values.length - 1)) * cw),
        y: pad.top + ch - ((v - yMin) / yRange) * ch,
    }));

    // Fill
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pad.top + ch);
    pts.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length - 1].x, pad.top + ch);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + ch);
    grad.addColorStop(0, 'rgba(0,174,239,0.2)');
    grad.addColorStop(1, 'rgba(0,174,239,0.02)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.strokeStyle = '#00AEEF';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();

    // Dots
    pts.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#00AEEF';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    });

    // X labels
    ctx.fillStyle = '#9ca3af';
    ctx.font = '8px sans-serif';
    ctx.textAlign = 'center';
    const step = Math.max(1, Math.floor(labels.length / 6));
    labels.forEach((lbl, i) => {
        if (i % step === 0 || i === labels.length - 1) ctx.fillText(lbl, pts[i].x, pad.top + ch + 14);
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// LIST VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function _renderSchedeList(container) {
    const plans = WorkoutPlanStorage.getAllPlans();
    const allUsers = _schedeGetRegisteredUsers();
    const nameMap = {};
    for (const u of allUsers) nameMap[u.userId] = u.name || u.email || u.userId;

    // Separate templates (no user_id) from assigned plans
    const templates = plans.filter(p => !p.user_id);
    const assigned = plans.filter(p => p.user_id);

    let html = `
        <div class="schede-header">
            <h3>Schede</h3>
            <button class="btn-primary" onclick="_schedeNewPlan()">+ Nuova Scheda</button>
        </div>
        <div class="schede-search-bar">
            <input type="text" id="schedeSearchInput" placeholder="Cerca scheda..."
                   oninput="_schedeFilterList()">
        </div>`;

    // Templates section
    html += '<h4 class="schede-section-title">Template standard</h4>';
    if (templates.length === 0) {
        html += '<div class="empty-slot" style="padding:0.8rem;">Nessun template. Crea una scheda senza selezionare un cliente.</div>';
    } else {
        html += '<div class="schede-plan-list" id="schedePlanList">';
        for (const plan of templates) {
            const exCount = (plan.workout_exercises || []).length;
            const days = [...new Set((plan.workout_exercises || []).map(e => e.day_label))];
            html += `
            <div class="schede-plan-card" data-client="template ${_escHtml(plan.name).toLowerCase()}">
                <div class="schede-plan-card-header">
                    <div class="schede-plan-card-info">
                        <div class="schede-plan-client"><span class="schede-badge-template">Template</span></div>
                        <div class="schede-plan-name">${_escHtml(plan.name)}</div>
                        <div class="schede-plan-meta">${exCount} esercizi &middot; ${days.length} giorni</div>
                    </div>
                    <div class="schede-plan-actions">
                        <button onclick="_schedeEditPlan('${plan.id}')" title="Modifica">✏️</button>
                        <button onclick="_schedeDeletePlan('${plan.id}')" title="Elimina">🗑️</button>
                    </div>
                </div>
            </div>`;
        }
        html += '</div>';
    }

    // Assigned plans section
    if (assigned.length > 0) {
        html += '<h4 class="schede-section-title" style="margin-top:1rem;">Schede assegnate</h4>';
        html += '<div class="schede-plan-list">';
        const sorted = [...assigned].sort((a, b) => {
            const na = (nameMap[a.user_id] || '').toLowerCase();
            const nb = (nameMap[b.user_id] || '').toLowerCase();
            if (na !== nb) return na.localeCompare(nb);
            return (b.updated_at || '').localeCompare(a.updated_at || '');
        });
        for (const plan of sorted) {
            const clientName = _escHtml(nameMap[plan.user_id] || 'Cliente sconosciuto');
            const exCount = (plan.workout_exercises || []).length;
            const days = [...new Set((plan.workout_exercises || []).map(e => e.day_label))];
            const badge = plan.active
                ? '<span class="schede-badge-active">Attiva</span>'
                : '<span class="schede-badge-inactive">Inattiva</span>';
            const dateRange = _schedeDateRange(plan);
            html += `
            <div class="schede-plan-card" data-client="${clientName.toLowerCase()} ${_escHtml(plan.name).toLowerCase()}">
                <div class="schede-plan-card-header">
                    <div class="schede-plan-card-info">
                        <div class="schede-plan-client">${clientName}</div>
                        <div class="schede-plan-name">${_escHtml(plan.name)} ${badge}</div>
                        <div class="schede-plan-meta">${exCount} esercizi &middot; ${days.length} giorni${dateRange ? ' &middot; ' + dateRange : ''}</div>
                    </div>
                    <div class="schede-plan-actions">
                        <button onclick="_schedeEditPlan('${plan.id}')" title="Modifica">✏️</button>
                        <button onclick="_schedeDeletePlan('${plan.id}')" title="Elimina">🗑️</button>
                    </div>
                </div>
            </div>`;
        }
        html += '</div>';
    }

    container.innerHTML = html;
}

function _schedeDateRange(plan) {
    const parts = [];
    if (plan.start_date) parts.push(_fmtDate(plan.start_date));
    if (plan.end_date) parts.push(_fmtDate(plan.end_date));
    return parts.join(' → ');
}

function _fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
}

function _schedeFilterList() {
    const q = (document.getElementById('schedeSearchInput')?.value || '').toLowerCase();
    document.querySelectorAll('.schede-plan-card').forEach(card => {
        card.style.display = card.dataset.client.includes(q) ? '' : 'none';
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLAN EDITOR
// ═══════════════════════════════════════════════════════════════════════════════
function _schedeNewPlan() {
    _editingPlan = null;
    _currentPlanId = null;
    _editDayLabels = ['Giorno A'];
    _editActiveDay = 'Giorno A';
    _schedeView = 'edit';
    renderSchedeTab();
}

function _schedeEditPlan(planId) {
    const plan = WorkoutPlanStorage.getPlanById(planId);
    if (!plan) return;
    _editingPlan = plan;
    _currentPlanId = planId;
    const days = [...new Set((plan.workout_exercises || []).map(e => e.day_label))];
    _editDayLabels = days.length ? days : ['Giorno A'];
    _editActiveDay = _editDayLabels[0];
    _schedeView = 'edit';
    renderSchedeTab();
}

function _renderPlanEditor(container) {
    const plan = _editingPlan;
    const isNew = !plan;

    // Client selector — only registered users
    const allUsers = _schedeGetRegisteredUsers();
    const selectedUserId = plan?.user_id || '';
    const selectedUserName = selectedUserId ? (allUsers.find(u => u.userId === selectedUserId)?.name || '') : '';

    let html = `
    <div class="schede-editor">
        <div class="schede-editor-topbar">
            <button class="schede-back-btn" onclick="_schedeBackToList()">← Lista</button>
            <h3>${isNew ? 'Nuova Scheda' : 'Modifica Scheda'}</h3>
        </div>
        <div class="schede-editor-form">
            <div class="schede-form-row">
                <label>Cliente <span style="color:#9ca3af;font-weight:400;font-size:0.78rem;">(vuoto = template standard)</span></label>
                <div class="schede-client-selector">
                    <input type="text" id="schedeClientSearch" placeholder="Lascia vuoto per template..."
                           value="${_escHtml(selectedUserName)}"
                           oninput="_schedeSearchClient()" autocomplete="off"
                           onfocus="_schedeSearchClient()"
                           ${selectedUserId ? 'data-user-id="' + selectedUserId + '"' : ''}>
                    <div id="schedeClientDropdown" class="debtor-search-dropdown" style="display:none;"></div>
                </div>
            </div>
            <div class="schede-form-row">
                <label>Nome scheda</label>
                <input type="text" id="schedePlanName" value="${_escHtml(plan?.name || '')}" placeholder="es. Scheda Forza - Settimana 1">
            </div>
            <div class="schede-form-row schede-form-row--inline">
                <div>
                    <label>Data inizio</label>
                    <input type="date" id="schedePlanStart" value="${plan?.start_date || _localDateStr()}">
                </div>
                <div>
                    <label>Data fine</label>
                    <input type="date" id="schedePlanEnd" value="${plan?.end_date || ''}">
                </div>
                <div>
                    <label>Attiva</label>
                    <label class="schede-toggle">
                        <input type="checkbox" id="schedePlanActive" ${!plan || plan.active ? 'checked' : ''}>
                        <span class="schede-toggle-slider"></span>
                    </label>
                </div>
            </div>
            <div class="schede-form-row">
                <label>Note</label>
                <textarea id="schedePlanNotes" rows="2" placeholder="Note generali sulla scheda...">${_escHtml(plan?.notes || '')}</textarea>
            </div>
        </div>

        <div class="schede-day-section">
            <div class="schede-day-tabs" id="schedeDayTabs">
                ${_editDayLabels.map(d => `<button class="schede-day-tab${d === _editActiveDay ? ' active' : ''}" onclick="_schedeSelectDay('${_escHtml(d)}')">${_escHtml(d)}</button>`).join('')}
                <button class="schede-day-tab schede-day-tab--add" onclick="_schedeAddDay()">+</button>
                ${_editDayLabels.length > 1 ? `<button class="schede-day-tab schede-day-tab--remove" onclick="_schedeRemoveDay()" title="Rimuovi giorno corrente">🗑️</button>` : ''}
            </div>
            <div class="schede-day-rename">
                <input type="text" id="schedeDayRename" value="${_escHtml(_editActiveDay)}" onchange="_schedeRenameDay(this.value)" placeholder="Nome giorno">
            </div>
            <div class="schede-exercises-list" id="schedeExercisesList">
                ${_renderExercisesForDay()}
            </div>
            <button class="schede-add-exercise-btn" onclick="_schedeAddExerciseRow()">+ Aggiungi esercizio</button>
        </div>

        <div class="schede-editor-actions">
            <button class="btn-primary schede-save-btn" onclick="_schedeSavePlan()">💾 Salva Scheda</button>
        </div>
    </div>`;

    container.innerHTML = html;
}

function _renderExercisesForDay() {
    const exercises = _editingPlan?.workout_exercises?.filter(e => e.day_label === _editActiveDay) || [];

    if (exercises.length === 0 && _editingPlan) {
        return '<div class="empty-slot">Nessun esercizio per questo giorno. Clicca "+ Aggiungi esercizio".</div>';
    }
    if (exercises.length === 0) {
        return '<div class="empty-slot">Salva la scheda, poi aggiungi esercizi.</div>';
    }

    let html = '';
    exercises.forEach((ex, i) => {
        html += `
        <div class="schede-exercise-row" data-ex-id="${ex.id}">
            <div class="schede-ex-drag">
                ${i > 0 ? `<button onclick="_schedeMoveExercise('${ex.id}', -1)" title="Su">▲</button>` : '<span></span>'}
                ${i < exercises.length - 1 ? `<button onclick="_schedeMoveExercise('${ex.id}', 1)" title="Giù">▼</button>` : '<span></span>'}
            </div>
            <div class="schede-ex-fields">
                <div class="schede-ex-top-row">
                    <select class="schede-ex-muscle" onchange="_schedeMuscleChanged('${ex.id}', this)">
                        <option value="">— Muscolo —</option>
                        ${MUSCLE_GROUPS.map(mg => `<option value="${mg}" ${ex.muscle_group === mg ? 'selected' : ''}>${mg}</option>`).join('')}
                    </select>
                    ${_buildExerciseSelect(ex.exercise_name, ex.id, ex.muscle_group)}
                </div>
                <div class="schede-ex-params">
                    <label>Serie<input type="number" min="1" max="20" value="${ex.sets}" onchange="_schedeUpdateExField('${ex.id}','sets',+this.value)"></label>
                    <label>Reps<input type="text" value="${_escHtml(ex.reps)}" placeholder="10" onchange="_schedeUpdateExField('${ex.id}','reps',this.value)"></label>
                    <label>Kg<input type="number" step="0.5" min="0" value="${ex.weight_kg ?? ''}" placeholder="—" onchange="_schedeUpdateExField('${ex.id}','weight_kg',this.value?+this.value:null)"></label>
                    <label>Rec.<input type="number" min="0" step="15" value="${ex.rest_seconds ?? 90}" onchange="_schedeUpdateExField('${ex.id}','rest_seconds',+this.value)"></label>
                </div>
                <input type="text" class="schede-ex-notes" value="${_escHtml(ex.notes || '')}" placeholder="Note esercizio..."
                       onchange="_schedeUpdateExField('${ex.id}','notes',this.value)">
            </div>
            <button class="schede-ex-delete" onclick="_schedeDeleteExercise('${ex.id}')" title="Elimina esercizio">✕</button>
        </div>`;
    });
    return html;
}

// ── Client search (only registered users with UUID) ──────────────────────────
var _schedeSearchClient = _debounce(function() {
    const input = document.getElementById('schedeClientSearch');
    const dropdown = document.getElementById('schedeClientDropdown');
    const q = (input?.value || '').toLowerCase();
    if (!q || q.length < 1) { dropdown.style.display = 'none'; return; }

    const matches = _schedeGetRegisteredUsers().filter(u =>
        (u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q)
    );

    if (matches.length === 0) {
        dropdown.innerHTML = '<div class="dropdown-no-results">Nessun cliente registrato trovato</div>';
    } else {
        dropdown.innerHTML = matches.slice(0, 10).map(u =>
            `<div class="dropdown-item" onclick="_schedeSelectClient('${u.userId}', '${_escHtml(u.name || u.email).replace(/'/g, "\\'")}')">
                <span class="dropdown-item-name">${_escHtml(u.name || 'Senza nome')}</span>
                <span style="color:#888;font-size:0.82rem">${_escHtml(u.email || '')}</span>
            </div>`
        ).join('');
    }
    dropdown.style.display = 'block';
}, 150);

function _schedeSelectClient(userId, name) {
    const input = document.getElementById('schedeClientSearch');
    input.value = name;
    input.dataset.userId = userId;
    document.getElementById('schedeClientDropdown').style.display = 'none';
}

// ── Day management ───────────────────────────────────────────────────────────
function _schedeSelectDay(day) {
    _editActiveDay = day;
    const container = document.getElementById('schedeContainer');
    if (container) _renderPlanEditor(container);
}

function _schedeAddDay() {
    const nextLetter = String.fromCharCode(65 + _editDayLabels.length);
    const newLabel = 'Giorno ' + nextLetter;
    _editDayLabels.push(newLabel);
    _editActiveDay = newLabel;
    const container = document.getElementById('schedeContainer');
    if (container) _renderPlanEditor(container);
}

function _schedeRemoveDay() {
    if (_editDayLabels.length <= 1) return;
    if (_editingPlan) {
        const toDelete = (_editingPlan.workout_exercises || []).filter(e => e.day_label === _editActiveDay);
        toDelete.forEach(async ex => {
            try { await WorkoutPlanStorage.deleteExercise(ex.id); } catch (_) {}
        });
    }
    _editDayLabels = _editDayLabels.filter(d => d !== _editActiveDay);
    _editActiveDay = _editDayLabels[0];
    const container = document.getElementById('schedeContainer');
    if (container) _renderPlanEditor(container);
}

function _schedeRenameDay(newName) {
    if (!newName.trim()) return;
    const oldName = _editActiveDay;
    if (_editingPlan) {
        (_editingPlan.workout_exercises || []).forEach(ex => {
            if (ex.day_label === oldName) {
                ex.day_label = newName;
                WorkoutPlanStorage.updateExercise(ex.id, { day_label: newName }).catch(() => {});
            }
        });
    }
    const idx = _editDayLabels.indexOf(oldName);
    if (idx >= 0) _editDayLabels[idx] = newName;
    _editActiveDay = newName;
    const container = document.getElementById('schedeContainer');
    if (container) _renderPlanEditor(container);
}

// ── Exercise CRUD ────────────────────────────────────────────────────────────
async function _schedeAddExerciseRow() {
    if (!_editingPlan) {
        await _schedeSavePlan();
        if (!_editingPlan) return;
    }
    try {
        await WorkoutPlanStorage.addExercise(_editingPlan.id, {
            day_label: _editActiveDay,
            exercise_name: 'Nuovo esercizio',
            sets: 3,
            reps: '10',
        });
        const container = document.getElementById('schedeContainer');
        if (container) _renderPlanEditor(container);
    } catch (e) {
        console.error('[Schede] addExercise error:', e);
        if (typeof showToast === 'function') showToast('Errore aggiunta esercizio', 'error');
    }
}

async function _schedeUpdateExField(exId, field, value) {
    try {
        await WorkoutPlanStorage.updateExercise(exId, { [field]: value });
    } catch (e) {
        if (typeof showToast === 'function') showToast('Errore aggiornamento', 'error');
    }
}

async function _schedeDeleteExercise(exId) {
    try {
        await WorkoutPlanStorage.deleteExercise(exId);
        const container = document.getElementById('schedeContainer');
        if (container) _renderPlanEditor(container);
    } catch (e) {
        if (typeof showToast === 'function') showToast('Errore eliminazione', 'error');
    }
}

async function _schedeMoveExercise(exId, direction) {
    if (!_editingPlan) return;
    const dayExercises = (_editingPlan.workout_exercises || []).filter(e => e.day_label === _editActiveDay);
    const idx = dayExercises.findIndex(e => e.id === exId);
    if (idx < 0) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= dayExercises.length) return;
    [dayExercises[idx], dayExercises[newIdx]] = [dayExercises[newIdx], dayExercises[idx]];
    const orderedIds = dayExercises.map(e => e.id);
    try {
        await WorkoutPlanStorage.reorderExercises(_editingPlan.id, orderedIds);
        const container = document.getElementById('schedeContainer');
        if (container) _renderPlanEditor(container);
    } catch (_) {}
}

// ── Save plan ────────────────────────────────────────────────────────────────
async function _schedeSavePlan() {
    const nameInput = document.getElementById('schedePlanName');
    const clientInput = document.getElementById('schedeClientSearch');
    let userId = clientInput?.dataset?.userId || null;
    const planName = nameInput?.value?.trim();

    // If userId looks invalid, treat as template (null)
    if (userId === 'undefined' || (userId && userId.length < 10)) userId = null;

    if (!planName) {
        if (typeof showToast === 'function') showToast('Inserisci un nome per la scheda', 'error');
        return;
    }

    const startDate = document.getElementById('schedePlanStart')?.value || null;
    const endDate = document.getElementById('schedePlanEnd')?.value || null;
    const active = document.getElementById('schedePlanActive')?.checked ?? true;
    const notes = document.getElementById('schedePlanNotes')?.value?.trim() || null;

    try {
        if (_editingPlan) {
            await WorkoutPlanStorage.updatePlan(_editingPlan.id, {
                user_id: userId, name: planName,
                start_date: startDate, end_date: endDate,
                active, notes,
            });
            if (typeof showToast === 'function') showToast('Scheda aggiornata', 'success');
        } else {
            const newPlan = await WorkoutPlanStorage.createPlan({
                user_id: userId, name: planName,
                start_date: startDate, end_date: endDate, notes,
            });
            _editingPlan = newPlan;
            _currentPlanId = newPlan.id;
            if (typeof showToast === 'function') showToast('Scheda creata! Aggiungi esercizi.', 'success');
        }
        const container = document.getElementById('schedeContainer');
        if (container) _renderPlanEditor(container);
    } catch (e) {
        console.error('[Schede] save error:', e);
        if (typeof showToast === 'function') showToast('Errore salvataggio scheda: ' + (e.message || ''), 'error');
    }
}

function _schedeBackToList() {
    _schedeView = _schedeSection === 'clienti' ? 'clients' : 'list';
    _editingPlan = null;
    _currentPlanId = null;
    renderSchedeTab();
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLAN ACTIONS (list view)
// ═══════════════════════════════════════════════════════════════════════════════
async function _schedeAssignTemplate(userId) {
    const sel = document.getElementById('schedeAssignTemplate');
    const templateId = sel?.value;
    if (!templateId) { if (typeof showToast === 'function') showToast('Seleziona un template', 'error'); return; }
    try {
        await WorkoutPlanStorage.duplicatePlan(templateId, userId);
        if (typeof showToast === 'function') showToast('Scheda assegnata!', 'success');
        renderSchedeTab();
    } catch (e) {
        console.error('[Schede] assign error:', e);
        if (typeof showToast === 'function') showToast('Errore assegnazione', 'error');
    }
}

async function _schedeDeletePlan(planId) {
    if (!confirm('Eliminare questa scheda e tutti gli esercizi associati?')) return;
    try {
        await WorkoutPlanStorage.deletePlan(planId);
        if (typeof showToast === 'function') showToast('Scheda eliminata', 'success');
        renderSchedeTab();
    } catch (e) {
        if (typeof showToast === 'function') showToast('Errore eliminazione', 'error');
    }
}

async function _schedeDuplicatePlan(planId) {
    const plan = WorkoutPlanStorage.getPlanById(planId);
    if (!plan) return;

    const allUsers = _schedeGetRegisteredUsers();
    const nameMap = {};
    for (const u of allUsers) nameMap[u.userId] = u.name || u.email;

    const targetName = prompt('Duplicare per quale cliente? (nome)', nameMap[plan.user_id] || '');
    if (!targetName) return;

    const targetUser = allUsers.find(u =>
        (u.name || '').toLowerCase() === targetName.toLowerCase() ||
        (u.email || '').toLowerCase() === targetName.toLowerCase()
    );
    if (!targetUser || !targetUser.userId) {
        if (typeof showToast === 'function') showToast('Cliente registrato non trovato', 'error');
        return;
    }

    try {
        await WorkoutPlanStorage.duplicatePlan(planId, targetUser.userId);
        if (typeof showToast === 'function') showToast('Scheda duplicata', 'success');
        renderSchedeTab();
    } catch (e) {
        if (typeof showToast === 'function') showToast('Errore duplicazione', 'error');
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROGRESS VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function _schedeViewProgress(planId) {
    _currentPlanId = planId;
    _schedeView = 'progress';
    renderSchedeTab();
}

async function _renderProgressView(container) {
    const plan = WorkoutPlanStorage.getPlanById(_currentPlanId);
    if (!plan) { _schedeBackToList(); return; }

    await WorkoutLogStorage.syncForPlan(plan.id);
    const logs = WorkoutLogStorage.getAll();

    const allUsers = _schedeGetRegisteredUsers();
    const clientName = allUsers.find(u => u.userId === plan.user_id)?.name || 'Cliente';

    const days = [...new Set((plan.workout_exercises || []).map(e => e.day_label))];

    let html = `
    <div class="schede-progress">
        <div class="schede-editor-topbar">
            <button class="schede-back-btn" onclick="_schedeBackToList()">← Lista</button>
            <h3>Progressi: ${_escHtml(clientName)} — ${_escHtml(plan.name)}</h3>
        </div>`;

    if (logs.length === 0) {
        html += '<div class="empty-slot">Nessun log registrato per questa scheda.</div>';
    } else {
        for (const day of days) {
            const dayExercises = (plan.workout_exercises || []).filter(e => e.day_label === day);
            html += `<h4 class="schede-progress-day">${_escHtml(day)}</h4>`;
            for (const ex of dayExercises) {
                const exLogs = logs.filter(l => l.exercise_id === ex.id);
                if (exLogs.length === 0) continue;

                const byDate = {};
                for (const l of exLogs) {
                    if (!byDate[l.log_date]) byDate[l.log_date] = [];
                    byDate[l.log_date].push(l);
                }
                const dates = Object.keys(byDate).sort().reverse();

                html += `
                <div class="schede-progress-exercise">
                    <div class="schede-progress-ex-header">
                        <strong>${_escHtml(ex.exercise_name)}</strong>
                        <span class="schede-progress-target">Target: ${ex.sets}×${ex.reps} @ ${ex.weight_kg != null ? ex.weight_kg + 'kg' : '—'}</span>
                    </div>
                    <table class="schede-progress-table">
                        <thead><tr><th>Data</th><th>Serie</th><th>Reps</th><th>Peso</th><th>RPE</th></tr></thead>
                        <tbody>`;
                for (const date of dates.slice(0, 10)) {
                    const setsForDate = byDate[date].sort((a, b) => a.set_number - b.set_number);
                    for (const s of setsForDate) {
                        const repsClass = _progressClass(s.reps_done, _parseRepsTarget(ex.reps));
                        const weightClass = _progressClass(s.weight_done, ex.weight_kg);
                        html += `<tr>
                            <td>${_fmtDate(date)}</td>
                            <td>${s.set_number}</td>
                            <td class="${repsClass}">${s.reps_done ?? '—'}</td>
                            <td class="${weightClass}">${s.weight_done != null ? s.weight_done + 'kg' : '—'}</td>
                            <td>${s.rpe ?? '—'}</td>
                        </tr>`;
                    }
                }
                html += '</tbody></table></div>';
            }
        }
    }

    html += '</div>';
    container.innerHTML = html;
}

function _parseRepsTarget(reps) {
    if (!reps) return null;
    const num = parseInt(reps);
    return isNaN(num) ? null : num;
}

function _progressClass(actual, target) {
    if (actual == null || target == null) return '';
    if (actual >= target) return 'schede-progress-ok';
    if (actual >= target * 0.8) return 'schede-progress-close';
    return 'schede-progress-miss';
}
