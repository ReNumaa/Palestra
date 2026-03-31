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

function _buildExerciseSelect(currentValue, exId) {
    const isCustom = currentValue && !Object.values(EXERCISE_CATALOG).flat().includes(currentValue) && currentValue !== 'Nuovo esercizio';
    let html = `<select class="schede-ex-name" onchange="_schedeExNameChanged('${exId}', this)">`;
    html += `<option value="">— Seleziona esercizio —</option>`;
    for (const [group, exercises] of Object.entries(EXERCISE_CATALOG)) {
        html += `<optgroup label="${group}">`;
        for (const name of exercises) {
            html += `<option value="${_escHtml(name)}" ${currentValue === name ? 'selected' : ''}>${_escHtml(name)}</option>`;
        }
        html += '</optgroup>';
    }
    html += `<optgroup label="───────────"><option value="__custom__" ${isCustom ? 'selected' : ''}>Altro (personalizzato)</option></optgroup>`;
    html += '</select>';
    if (isCustom) {
        html += `<input type="text" class="schede-ex-custom-name" value="${_escHtml(currentValue)}" placeholder="Nome personalizzato"
                        onchange="_schedeUpdateExField('${exId}','exercise_name',this.value)">`;
    }
    return html;
}

function _schedeExNameChanged(exId, selectEl) {
    const value = selectEl.value;
    if (value === '__custom__') {
        // Show custom input, set temporary name
        const container = selectEl.closest('.schede-ex-top-row');
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
        // Remove custom input if present
        const container = selectEl.closest('.schede-ex-top-row');
        const customInput = container.querySelector('.schede-ex-custom-name');
        if (customInput) customInput.remove();
        // Auto-set muscle group based on catalog
        for (const [group, exercises] of Object.entries(EXERCISE_CATALOG)) {
            if (exercises.includes(value)) {
                _schedeUpdateExField(exId, 'muscle_group', group);
                // Update the muscle select in the UI
                const row = selectEl.closest('.schede-exercise-row');
                const muscleSelect = row?.querySelector('.schede-ex-muscle');
                if (muscleSelect) muscleSelect.value = group;
                break;
            }
        }
        _schedeUpdateExField(exId, 'exercise_name', value);
    }
}

// Only registered users (with Supabase UUID) can be assigned plans
function _schedeGetRegisteredUsers() {
    if (typeof UserStorage === 'undefined') return [];
    return UserStorage.getAll().filter(u => u.userId);
}

let _schedeView = 'list';  // 'list' | 'edit' | 'progress'
let _currentPlanId = null;
let _editingPlan = null;    // plan object being edited (or null for new)
let _editDayLabels = [];    // array of day labels in editor
let _editActiveDay = '';    // currently selected day tab

// ── Entry point ──────────────────────────────────────────────────────────────
async function renderSchedeTab() {
    const container = document.getElementById('schedeContainer');
    if (!container) return;
    container.innerHTML = '<div class="schede-loading">Caricamento schede...</div>';
    try {
        await WorkoutPlanStorage.syncFromSupabase({ adminMode: true });
        await WorkoutPlanStorage.loadSuggestions();
    } catch (e) {
        container.innerHTML = '<div class="empty-slot">Errore caricamento schede</div>';
        return;
    }
    if (_schedeView === 'edit') {
        _renderPlanEditor(container);
    } else if (_schedeView === 'progress') {
        await _renderProgressView(container);
    } else {
        _renderSchedeList(container);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LIST VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function _renderSchedeList(container) {
    const plans = WorkoutPlanStorage.getAllPlans();

    // Resolve client names by userId
    const allUsers = _schedeGetRegisteredUsers();
    const nameMap = {};
    for (const u of allUsers) nameMap[u.userId] = u.name || u.email || u.userId;

    let html = `
        <div class="schede-header">
            <h3>Schede Palestra</h3>
            <button class="btn-primary" onclick="_schedeNewPlan()">+ Nuova Scheda</button>
        </div>
        <div class="schede-search-bar">
            <input type="text" id="schedeSearchInput" placeholder="Cerca per nome cliente..."
                   oninput="_schedeFilterList()">
        </div>`;

    if (plans.length === 0) {
        html += '<div class="empty-slot">Nessuna scheda creata. Clicca "Nuova Scheda" per iniziare.</div>';
    } else {
        html += '<div class="schede-plan-list" id="schedePlanList">';
        const sorted = [...plans].sort((a, b) => {
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
            <div class="schede-plan-card" data-client="${clientName.toLowerCase()}">
                <div class="schede-plan-card-header">
                    <div class="schede-plan-card-info">
                        <div class="schede-plan-client">${clientName}</div>
                        <div class="schede-plan-name">${_escHtml(plan.name)} ${badge}</div>
                        <div class="schede-plan-meta">${exCount} esercizi &middot; ${days.length} giorni${dateRange ? ' &middot; ' + dateRange : ''}</div>
                    </div>
                    <div class="schede-plan-actions">
                        <button onclick="_schedeEditPlan('${plan.id}')" title="Modifica">✏️</button>
                        <button onclick="_schedeViewProgress('${plan.id}')" title="Progressi">📊</button>
                        <button onclick="_schedeDuplicatePlan('${plan.id}')" title="Duplica">📋</button>
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
                <label>Cliente</label>
                <div class="schede-client-selector">
                    <input type="text" id="schedeClientSearch" placeholder="Cerca cliente registrato..."
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
                    ${_buildExerciseSelect(ex.exercise_name, ex.id)}
                    <select class="schede-ex-muscle" onchange="_schedeUpdateExField('${ex.id}','muscle_group',this.value)">
                        <option value="">Muscolo</option>
                        ${MUSCLE_GROUPS.map(mg => `<option value="${mg}" ${ex.muscle_group === mg ? 'selected' : ''}>${mg}</option>`).join('')}
                    </select>
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
    const userId = clientInput?.dataset?.userId;
    const planName = nameInput?.value?.trim();

    // Validate UUID — must be a real UUID, not "undefined" string
    if (!userId || userId === 'undefined' || userId.length < 10) {
        if (typeof showToast === 'function') showToast('Seleziona un cliente dal menu a tendina', 'error');
        return;
    }
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
    _schedeView = 'list';
    _editingPlan = null;
    _currentPlanId = null;
    renderSchedeTab();
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLAN ACTIONS (list view)
// ═══════════════════════════════════════════════════════════════════════════════
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
        await WorkoutPlanStorage.duplicatePlan(planId, targetUser.userId, plan.name + ' (copia)');
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
