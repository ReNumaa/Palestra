// ═══════════════════════════════════════════════════════════════════════════════
// TAB SCHEDE — Gestione schede palestra (workout plans)
// ═══════════════════════════════════════════════════════════════════════════════

// ── Exercise catalog from imported_exercises (Supabase) ─────────────────────
let EXERCISES_DB = [];          // populated by _loadExercisesDB()
let EXERCISES_BY_CAT = {};      // { 'Petto': [...], ... }
let EXERCISE_CATEGORIES = [];   // unique sorted categories
let _exercisesDBLoaded = false;

async function _loadExercisesDB() {
    if (_exercisesDBLoaded) return;
    try {
        const { data, error } = await _queryWithTimeout(supabaseClient
            .from('imported_exercises')
            .select('*')
            .order('categoria')
            .order('nome_it'));
        if (error) throw error;
        // Normalize field names for backward compat with picker
        EXERCISES_DB = (data || []).map(e => ({
            nome_it: e.nome_it,
            nome_en: e.nome_en || '',
            categoria: e.categoria,
            slug: e.slug,
            immagine_url: e.immagine || '',
            immagine_url_small: e.immagine_thumbnail || e.immagine || '',
            video_url: e.video || '',
            popolarita: e.popolarita || 0
        }));
        EXERCISES_BY_CAT = {};
        for (const ex of EXERCISES_DB) {
            if (!EXERCISES_BY_CAT[ex.categoria]) EXERCISES_BY_CAT[ex.categoria] = [];
            EXERCISES_BY_CAT[ex.categoria].push(ex);
        }
        EXERCISE_CATEGORIES = Object.keys(EXERCISES_BY_CAT).sort();
        _exercisesDBLoaded = true;
    } catch (e) { console.error('[Schede] Failed to load exercises DB:', e); }
}

// Refresh after import/remove in Importa tab
function _refreshSchedeFromImported() {
    _exercisesDBLoaded = false;
    _loadExercisesDB();
}

function _findExercise(name) {
    if (!name) return null;
    return EXERCISES_DB.find(e => e.nome_it === name) || null;
}

function _schedeCleanupPickerScroll() {
    document.body.style.overflow = '';
    const backdrop = document.getElementById('schedePickerBackdrop');
    if (backdrop) backdrop.remove();
}

// Close open pickers on outside click
document.addEventListener('click', (e) => {
    if (!e.target.closest('.schede-ex-picker-wrap') && !e.target.closest('.schede-picker-backdrop')) {
        document.querySelectorAll('.schede-ex-picker-dropdown').forEach(d => d.style.display = 'none');
        _schedeCleanupPickerScroll();
    }
});

// ── Exercise picker (replaces old select dropdowns) ──────────────────────────
// Opens a search-panel inline within the exercise row

function _buildExercisePicker(currentValue, exId, muscleGroup) {
    const ex = _findExercise(currentValue);
    const isCustom = currentValue && currentValue !== 'Nuovo esercizio' && !ex;
    const thumbUrl = ex ? ex.immagine_url_small : '';
    const displayName = isCustom ? currentValue : (ex ? ex.nome_it : '');

    let html = '<div class="schede-ex-picker-wrap">';

    // Thumbnail + selected name + buttons
    html += `<div class="schede-ex-selected" data-ex-id="${exId}">`;
    if (thumbUrl) {
        html += `<img src="${thumbUrl}" class="schede-ex-thumb" alt="" loading="lazy" onclick="_schedeShowExDetail('${_escHtml(ex.slug)}')">`;
    } else if (!isCustom) {
        html += `<div class="schede-ex-thumb schede-ex-thumb--empty" onclick="_schedeOpenPicker('${exId}')"></div>`;
    }
    html += `<span class="schede-ex-chosen-name" onclick="_schedeOpenPicker('${exId}')">${displayName ? _escHtml(displayName) : '<em>Seleziona esercizio...</em>'}</span>`;
    if (ex) {
        html += `<button type="button" class="schede-ex-info-btn" onclick="_schedeShowExDetail('${_escHtml(ex.slug)}')" title="Dettaglio esercizio">&#9432;</button>`;
    }
    html += `<button type="button" class="schede-ex-change-btn" onclick="_schedeOpenPicker('${exId}')" title="Cambia esercizio">&#9998;</button>`;
    html += '</div>';

    // Custom input (hidden unless custom)
    if (isCustom) {
        html += `<input type="text" class="schede-ex-custom-name" value="${_escHtml(currentValue)}" placeholder="Nome personalizzato"
                        onchange="_schedeUpdateExField('${exId}','exercise_name',this.value)">`;
    }

    // Picker dropdown (hidden by default)
    html += `<div class="schede-ex-picker-dropdown" id="picker-${exId}" style="display:none;"></div>`;
    html += '</div>';
    return html;
}

function _schedeOpenPicker(exId) {
    // Close any other open picker
    document.querySelectorAll('.schede-ex-picker-dropdown').forEach(d => { if (d.id !== 'picker-' + exId) d.style.display = 'none'; });

    const dropdown = document.getElementById('picker-' + exId);
    if (!dropdown) return;
    if (dropdown.style.display === 'flex') { dropdown.style.display = 'none'; _schedeCleanupPickerScroll(); return; }

    // Category → SVG icon map
    const catSvg = {
        'Petto': 'chest', 'Tricipiti': 'triceps', 'Bicipiti': 'biceps', 'Braccia': 'biceps',
        'Spalle': 'shoulders', 'Schiena': 'back', 'Quadricipiti': 'quadriceps',
        'Glutei e Femorali': 'hips', 'Femorali': 'hamstrings', 'Polpacci': 'calves',
        'Addominali': 'waist_abs', 'Avambracci': 'forearms', 'Cardio': 'cardio'
    };

    // Build picker content
    let html = `<div class="schede-picker-topbar">
        <span class="schede-picker-title">Seleziona esercizio</span>
        <button type="button" class="schede-picker-close-btn" onclick="_schedeClosePicker('${exId}')">&times;</button>
    </div>
    <div class="schede-picker-header">
        <input type="text" class="schede-picker-search" placeholder="Cerca esercizio..."
               oninput="_schedeFilterPicker('${exId}', this.value)" autofocus>
    </div>
    <div class="schede-picker-body" id="pickerBody-${exId}">
        <div class="schede-picker-cats" id="pickerCats-${exId}">
            ${EXERCISE_CATEGORIES.map(c => {
                const svg = catSvg[c] || 'chest';
                return `
                <button type="button" class="schede-picker-cat-chip" onclick="_schedePickCat('${exId}','${_escHtml(c)}')" data-cat="${_escHtml(c)}">
                    <img src="icone_muscoli/${svg}.svg" class="schede-picker-cat-icon" alt="">
                    <span class="schede-picker-cat-name">${_escHtml(c)}</span>
                    <span class="schede-picker-cat-count">${(EXERCISES_BY_CAT[c] || []).length}</span>
                </button>`;
            }).join('')}
        </div>
        <div class="schede-picker-list" id="pickerList-${exId}" style="display:none;"></div>
    </div>
    <div class="schede-picker-footer">
        <button type="button" class="schede-picker-custom-btn" onclick="_schedePickCustom('${exId}')">✏️ Personalizzato</button>
    </div>`;
    dropdown.innerHTML = html;
    dropdown.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Add backdrop overlay on desktop
    let backdrop = document.getElementById('schedePickerBackdrop');
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = 'schedePickerBackdrop';
        backdrop.className = 'schede-picker-backdrop';
        backdrop.onclick = () => _schedeClosePicker(exId);
        document.body.appendChild(backdrop);
    }

    // Focus search
    const searchInput = dropdown.querySelector('.schede-picker-search');
    if (searchInput) setTimeout(() => searchInput.focus(), 50);
}

function _schedeClosePicker(exId) {
    const dropdown = document.getElementById('picker-' + exId);
    if (dropdown) dropdown.style.display = 'none';
    _schedeCleanupPickerScroll();
}

// Select a category → show exercises for that category
function _schedePickCat(exId, cat) {
    const dropdown = document.getElementById('picker-' + exId);
    if (!dropdown) return;

    // Highlight active chip
    dropdown.querySelectorAll('.schede-picker-cat-chip').forEach(ch => {
        ch.classList.toggle('active', ch.dataset.cat === cat);
    });

    _schedeRenderExercises(exId, cat, '');
}

function _schedeFilterPicker(exId, searchText) {
    const dropdown = document.getElementById('picker-' + exId);
    if (!dropdown) return;
    const search = (searchText ?? dropdown.querySelector('.schede-picker-search')?.value ?? '').toLowerCase();

    // Find active category chip
    const activeChip = dropdown.querySelector('.schede-picker-cat-chip.active');
    const cat = activeChip ? activeChip.dataset.cat : '';

    if (!search && !cat) {
        // No search, no category → show category grid
        const catsEl = document.getElementById('pickerCats-' + exId);
        const listEl = document.getElementById('pickerList-' + exId);
        if (catsEl) catsEl.style.display = '';
        if (listEl) listEl.style.display = 'none';
        return;
    }

    _schedeRenderExercises(exId, cat, search);
}

function _schedeRenderExercises(exId, cat, search) {
    const catsEl = document.getElementById('pickerCats-' + exId);
    const listEl = document.getElementById('pickerList-' + exId);
    if (!listEl) return;

    // Hide categories, show list
    if (catsEl) catsEl.style.display = 'none';
    listEl.style.display = '';

    let exercises = EXERCISES_DB;
    if (cat) exercises = exercises.filter(e => e.categoria === cat);
    if (search) exercises = exercises.filter(e =>
        e.nome_it.toLowerCase().includes(search) || e.nome_en.toLowerCase().includes(search) || e.categoria.toLowerCase().includes(search)
    );

    if (exercises.length === 0) {
        listEl.innerHTML = '<div class="schede-picker-empty">Nessun esercizio trovato</div>';
        return;
    }

    // Limit to 50 for performance
    const shown = exercises.slice(0, 50);
    listEl.innerHTML = shown.map(ex => `
        <div class="schede-picker-item" onclick="_schedePickExercise('${exId}', '${_escHtml(ex.nome_it).replace(/'/g, "\\'")}')">
            <img src="${ex.immagine_url_small}" class="schede-picker-item-img" alt="" loading="lazy">
            <div class="schede-picker-item-info">
                <span class="schede-picker-item-name">${_escHtml(ex.nome_it)}</span>
                <span class="schede-picker-item-cat">${_escHtml(ex.categoria)}</span>
            </div>
        </div>
    `).join('') + (exercises.length > 50 ? `<div class="schede-picker-more">${exercises.length - 50} altri — affina la ricerca</div>` : '');
}

function _schedePickExercise(exId, exerciseName) {
    const ex = _findExercise(exerciseName);
    // Update DB fields
    _schedeUpdateExField(exId, 'exercise_name', exerciseName);
    if (ex) {
        _schedeUpdateExField(exId, 'muscle_group', ex.categoria);
        // Cardio: set time-based defaults
        if ((ex.categoria || '').toLowerCase() === 'cardio') {
            _schedeUpdateExField(exId, 'sets', 1);
            _schedeUpdateExField(exId, 'reps', '20');
            _schedeUpdateExField(exId, 'rest_seconds', 0);
        }
    }

    // Close picker and re-render row
    const dropdown = document.getElementById('picker-' + exId);
    if (dropdown) dropdown.style.display = 'none';
    _schedeCleanupPickerScroll();

    // Full re-render to update params layout (cardio vs strength)
    _schedeRefreshEditor();
}

function _schedePickCustom(exId) {
    const dropdown = document.getElementById('picker-' + exId);
    if (dropdown) dropdown.style.display = 'none';
    _schedeCleanupPickerScroll();

    _schedeUpdateExField(exId, 'exercise_name', '');

    const row = document.querySelector(`.schede-exercise-row[data-ex-id="${exId}"]`);
    if (row) {
        const pickerWrap = row.querySelector('.schede-ex-picker-wrap');
        if (pickerWrap) {
            // Show custom input
            let html = '<div class="schede-ex-picker-wrap">';
            html += `<div class="schede-ex-selected" data-ex-id="${exId}">`;
            html += `<div class="schede-ex-thumb schede-ex-thumb--empty" onclick="_schedeOpenPicker('${exId}')"></div>`;
            html += `<span class="schede-ex-chosen-name" onclick="_schedeOpenPicker('${exId}')"><em>Personalizzato</em></span>`;
            html += `<button type="button" class="schede-ex-change-btn" onclick="_schedeOpenPicker('${exId}')" title="Cambia esercizio">&#9998;</button>`;
            html += '</div>';
            html += `<input type="text" class="schede-ex-custom-name" value="" placeholder="Nome personalizzato"
                            onchange="_schedeUpdateExField('${exId}','exercise_name',this.value)" autofocus>`;
            html += `<div class="schede-ex-picker-dropdown" id="picker-${exId}" style="display:none;"></div>`;
            html += '</div>';
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            pickerWrap.replaceWith(tempDiv.firstElementChild);
            const customInput = row.querySelector('.schede-ex-custom-name');
            if (customInput) setTimeout(() => customInput.focus(), 50);
        }
    }
}

// ── Exercise detail popup (video + image) ────────────────────────────────────
function _schedeShowExDetail(slug) {
    const ex = EXERCISES_DB.find(e => e.slug === slug);
    if (!ex) return;

    // Remove existing popup if any
    const existing = document.getElementById('schedeExDetailOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'schedeExDetailOverlay';
    overlay.className = 'schede-ex-detail-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    // Build header + media container via innerHTML
    overlay.innerHTML = `
    <div class="schede-ex-detail-panel">
        <div class="schede-ex-detail-header">
            <div>
                <h3>${_escHtml(ex.nome_it)}</h3>
                <span class="schede-ex-detail-cat">${_escHtml(ex.categoria)}</span>
                <span class="schede-ex-detail-en">${_escHtml(ex.nome_en)}</span>
            </div>
            <button class="schede-ex-detail-close" onclick="document.getElementById('schedeExDetailOverlay').remove()">&times;</button>
        </div>
        <div class="schede-ex-detail-body">
            <div class="schede-ex-detail-media" id="schedeExDetailMedia"></div>
        </div>
    </div>`;

    document.body.appendChild(overlay);

    // Create video programmatically (more reliable than innerHTML for media)
    const mediaContainer = document.getElementById('schedeExDetailMedia');
    if (ex.video_url && mediaContainer) {
        const video = document.createElement('video');
        video.className = 'schede-ex-detail-video';
        video.controls = true;
        video.autoplay = true;
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.src = ex.video_url;
        mediaContainer.appendChild(video);
        video.load();
        video.play().catch(() => {});
    } else if (mediaContainer) {
        const img = document.createElement('img');
        img.className = 'schede-ex-detail-img';
        img.src = ex.immagine_url_small;
        img.alt = ex.nome_it;
        mediaContainer.appendChild(img);
    }

    requestAnimationFrame(() => overlay.classList.add('visible'));
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
let _schedeLastSync = 0;        // timestamp of last successful sync
const _SCHEDE_SYNC_INTERVAL = 10000; // skip re-sync if < 10s ago

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

    // Only show loading spinner on first render (no cached data yet)
    const hasData = WorkoutPlanStorage.getAllPlans().length > 0 || _schedeLastSync > 0;
    if (!hasData) {
        container.innerHTML = '<div class="schede-loading">Caricamento schede...</div>';
    }

    try {
        await _loadExercisesDB();

        // Skip sync if we synced recently (avoids double-load on tab switch + realtime)
        const now = Date.now();
        if (now - _schedeLastSync > _SCHEDE_SYNC_INTERVAL) {
            await WorkoutPlanStorage.syncFromSupabase({ adminMode: true });
            await WorkoutPlanStorage.loadSuggestions();
            _schedeLastSync = now;
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
    } catch (e) {
        console.error('[Schede] renderSchedeTab error:', e);
        const errTarget = document.getElementById('schedeInner') || container;
        errTarget.innerHTML = '<div class="empty-slot">Errore caricamento schede. Cambia tab e riprova.</div>';
    } finally {
        _schedeRendering = false;
        if (_schedeRenderQueued) renderSchedeTab();
    }
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

    let html = `<div class="schede-editor-topbar">
        <button class="schede-back-btn" onclick="_schedeView='clients';renderSchedeTab()">← Clienti</button>
        <h3>${_escHtml(clientName)}</h3>
    </div>`;

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
                <div class="schede-plan-actions">
                    <button onclick="_schedeSaveAsTemplate('${plan.id}', '${_escHtml(plan.name).replace(/'/g, "\\'")}')" title="Salva come template">📋</button>
                    <button onclick="_schedeEditPlan('${plan.id}')" title="Modifica">✏️</button>
                    <button onclick="_schedeDeletePlanFromDetail('${plan.id}')" title="Elimina">🗑️</button>
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

    let logs;
    try {
        const { data, error } = await _queryWithTimeout(supabaseClient
            .from('workout_logs')
            .select('*')
            .in('exercise_id', allExIds)
            .order('log_date', { ascending: true }));
        if (error) throw error;
        logs = data;
    } catch (e) {
        console.error('[Schede] _renderClientDetail log fetch error:', e);
        container.innerHTML = html + '<div class="empty-slot">Errore caricamento log. Riprova.</div>';
        return;
    }

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
            <div class="schede-stat-value">${totalSessions}</div>
            <div class="schede-stat-label">Sessioni</div>
        </div>
        <div class="schede-stat-card">
            <div class="schede-stat-icon">🏋️</div>
            <div class="schede-stat-value">${logs.length}</div>
            <div class="schede-stat-label">Serie totali</div>
        </div>
        <div class="schede-stat-card">
            <div class="schede-stat-icon">📈</div>
            <div class="schede-stat-value">${totalVolume >= 1000 ? (totalVolume/1000).toFixed(1) + 't' : totalVolume + 'kg'}</div>
            <div class="schede-stat-label">Volume</div>
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

// Premium line chart for admin dashboard
function _drawAdminChart(canvas, labels, values) {
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const w = rect.width > 0 ? rect.width : 400;
    const h = 150;
    canvas.width = Math.round(w * 2);
    canvas.height = Math.round(h * 2);
    ctx.scale(2, 2);

    // Background
    ctx.fillStyle = '#f8fafc';
    const r = 10;
    ctx.beginPath();
    ctx.moveTo(r, 0); ctx.lineTo(w - r, 0); ctx.quadraticCurveTo(w, 0, w, r);
    ctx.lineTo(w, h - r); ctx.quadraticCurveTo(w, h, w - r, h);
    ctx.lineTo(r, h); ctx.quadraticCurveTo(0, h, 0, h - r);
    ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.fill();

    const pad = { top: 22, right: 14, bottom: 30, left: 42 };
    const cw = w - pad.left - pad.right;
    const ch = h - pad.top - pad.bottom;
    if (!values.length) return;

    const minV = Math.min(...values);
    const maxV = Math.max(...values);
    const range = maxV - minV || 1;
    const yMin = Math.max(0, minV - range * 0.1);
    const yMax = maxV + range * 0.1;
    const yRange = yMax - yMin || 1;

    // Grid lines — dashed, subtle
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 0.8;
    ctx.setLineDash([3, 3]);
    for (let i = 0; i <= 4; i++) {
        const y = pad.top + ch - (ch * i / 4);
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cw, y); ctx.stroke();
        ctx.fillStyle = '#94a3b8';
        ctx.font = '500 8.5px system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(Math.round(yMin + yRange * i / 4), pad.left - 6, y + 3);
    }
    ctx.setLineDash([]);

    const pts = values.map((v, i) => ({
        x: pad.left + (values.length === 1 ? cw / 2 : (i / (values.length - 1)) * cw),
        y: pad.top + ch - ((v - yMin) / yRange) * ch,
        v,
    }));

    // Area fill — smooth gradient
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pad.top + ch);
    pts.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length - 1].x, pad.top + ch);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + ch);
    grad.addColorStop(0, 'rgba(0,174,239,0.22)');
    grad.addColorStop(0.6, 'rgba(0,174,239,0.08)');
    grad.addColorStop(1, 'rgba(0,174,239,0.01)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Line — thicker, rounded
    ctx.strokeStyle = '#00AEEF';
    ctx.lineWidth = 2.8;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();

    // Dots
    pts.forEach((p, i) => {
        const isLast = i === pts.length - 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, isLast ? 4.5 : 3, 0, Math.PI * 2);
        ctx.fillStyle = isLast ? '#00AEEF' : '#fff';
        ctx.fill();
        ctx.strokeStyle = isLast ? '#fff' : '#00AEEF';
        ctx.lineWidth = isLast ? 2 : 1.5;
        ctx.stroke();
        if (isLast) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(0,174,239,0.2)';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    });

    // X labels
    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 7.5px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const step = Math.max(1, Math.floor(labels.length / 6));
    labels.forEach((lbl, i) => {
        if (i % step === 0 || i === labels.length - 1) ctx.fillText(lbl, pts[i].x, pad.top + ch + 14);
    });

    // Value badge on last point
    if (pts.length > 0) {
        const last = pts[pts.length - 1];
        const label = last.v + 'kg';
        ctx.font = 'bold 9.5px system-ui, sans-serif';
        const tw = ctx.measureText(label).width;
        const bx = Math.min(last.x, w - pad.right - tw / 2 - 6);
        const by = last.y - 14;
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        const br = 4;
        ctx.moveTo(bx - tw/2 - 5 + br, by - 8);
        ctx.lineTo(bx + tw/2 + 5 - br, by - 8);
        ctx.quadraticCurveTo(bx + tw/2 + 5, by - 8, bx + tw/2 + 5, by - 8 + br);
        ctx.lineTo(bx + tw/2 + 5, by + 2 - br);
        ctx.quadraticCurveTo(bx + tw/2 + 5, by + 2, bx + tw/2 + 5 - br, by + 2);
        ctx.lineTo(bx - tw/2 - 5 + br, by + 2);
        ctx.quadraticCurveTo(bx - tw/2 - 5, by + 2, bx - tw/2 - 5, by + 2 - br);
        ctx.lineTo(bx - tw/2 - 5, by - 8 + br);
        ctx.quadraticCurveTo(bx - tw/2 - 5, by - 8, bx - tw/2 - 5 + br, by - 8);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText(label, bx, by - 1);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LIST VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function _renderSchedeList(container) {
    const plans = WorkoutPlanStorage.getAllPlans();
    const allUsers = _schedeGetRegisteredUsers();
    const nameMap = {};
    for (const u of allUsers) nameMap[u.userId] = u.name || u.email || u.userId;

    // Templates (no user_id)
    const templates = plans.filter(p => !p.user_id);

    let html = `
        <div class="schede-header">
            <h3>Schede</h3>
            <button class="btn-primary" onclick="_schedeNewPlan()">+ Nuova Scheda</button>
        </div>`;

    // Assign template to client bar (top)
    if (templates.length > 0) {
        html += `<div class="schede-assign-bar schede-assign-bar--schede">
            <div class="schede-assign-row schede-assign-row--schede">
                <div class="schede-assign-field">
                    <label class="schede-assign-label">Template</label>
                    <select id="schedeQuickTemplate">
                        <option value="">— Seleziona template —</option>
                        ${templates.map(t => {
                            const exC = (t.workout_exercises || []).length;
                            const dayC = [...new Set((t.workout_exercises || []).map(e => e.day_label))].length;
                            return `<option value="${t.id}">${_escHtml(t.name)} (${exC} es. · ${dayC} gg)</option>`;
                        }).join('')}
                    </select>
                </div>
                <div class="schede-assign-field schede-assign-field--client">
                    <label class="schede-assign-label">Cliente</label>
                    <div class="schede-client-selector" style="position:relative;">
                        <input type="text" id="schedeQuickClientSearch" placeholder="Cerca cliente..."
                               oninput="_schedeQuickSearchClient()" autocomplete="off">
                        <div id="schedeQuickClientDropdown" class="debtor-search-dropdown" style="display:none;"></div>
                    </div>
                </div>
                <button class="btn-primary schede-assign-btn" onclick="_schedeQuickAssign()">Assegna</button>
            </div>
        </div>`;
    }

    html += `<div class="schede-search-bar">
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
    _schedeSection = 'schede';
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

    const hasNotes = !!(plan?.notes);
    let html = `
    <div class="schede-editor">
        <div class="schede-editor-topbar">
            <button class="schede-back-btn" onclick="_schedeBackToList()">←</button>
            <h3>${isNew ? 'Nuova Scheda' : _escHtml(plan?.name || 'Modifica Scheda')}</h3>
            <label class="schede-toggle schede-toggle--topbar" title="${!plan || plan.active ? 'Attiva' : 'Inattiva'}">
                <input type="checkbox" id="schedePlanActive" ${!plan || plan.active ? 'checked' : ''}>
                <span class="schede-toggle-slider"></span>
            </label>
        </div>
        <div class="schede-editor-form schede-editor-form--compact">
            <div class="schede-form-grid">
                <div class="schede-form-row schede-form-cell--name">
                    <label>Nome</label>
                    <input type="text" id="schedePlanName" value="${_escHtml(plan?.name || '')}" placeholder="es. Scheda Forza">
                </div>
                <div class="schede-form-row schede-form-cell--client">
                    <label>Cliente</label>
                    <div class="schede-client-selector">
                        <input type="text" id="schedeClientSearch" placeholder="Template..."
                               value="${_escHtml(selectedUserName)}"
                               oninput="_schedeSearchClient()" autocomplete="off"
                               onfocus="_schedeSearchClient()"
                               ${selectedUserId ? 'data-user-id="' + selectedUserId + '"' : ''}>
                        <div id="schedeClientDropdown" class="debtor-search-dropdown" style="display:none;"></div>
                    </div>
                </div>
                <div class="schede-form-row schede-form-cell--date">
                    <label>Inizio</label>
                    <input type="date" id="schedePlanStart" value="${plan?.start_date || _localDateStr()}">
                </div>
                <div class="schede-form-row schede-form-cell--date">
                    <label>Fine</label>
                    <input type="date" id="schedePlanEnd" value="${plan?.end_date || ''}">
                </div>
            </div>
            <details class="schede-notes-details"${hasNotes ? ' open' : ''}>
                <summary>Note</summary>
                <textarea id="schedePlanNotes" rows="2" placeholder="Note generali...">${_escHtml(plan?.notes || '')}</textarea>
            </details>
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
        const dbEx = _findExercise(ex.exercise_name);
        const catLabel = dbEx ? dbEx.categoria : (ex.muscle_group || '');
        const _isCardio = (ex.muscle_group || '').toLowerCase() === 'cardio';
        html += `
        <div class="schede-exercise-row" data-ex-id="${ex.id}">
            <div class="schede-ex-drag">
                ${i > 0 ? `<button onclick="_schedeMoveExercise('${ex.id}', -1)" title="Su">▲</button>` : '<span></span>'}
                ${i < exercises.length - 1 ? `<button onclick="_schedeMoveExercise('${ex.id}', 1)" title="Giù">▼</button>` : '<span></span>'}
            </div>
            <div class="schede-ex-fields">
                <div class="schede-ex-top-row">
                    ${catLabel ? `<span class="schede-ex-muscle-badge">${_escHtml(catLabel)}</span>` : ''}
                    ${_buildExercisePicker(ex.exercise_name, ex.id, ex.muscle_group)}
                </div>
                <div class="schede-ex-params">
                    ${_isCardio ? `
                    <label>Min<input type="text" value="${_escHtml(ex.reps)}" placeholder="20" onchange="_schedeUpdateExField('${ex.id}','reps',this.value)"></label>
                    ` : `
                    <label>Serie<input type="number" min="1" max="20" value="${ex.sets}" onchange="_schedeUpdateExField('${ex.id}','sets',+this.value)"></label>
                    <label>Reps<input type="text" value="${_escHtml(ex.reps)}" placeholder="10" onchange="_schedeUpdateExField('${ex.id}','reps',this.value)"></label>
                    <label>Kg<input type="number" step="0.5" min="0" value="${ex.weight_kg ?? ''}" placeholder="—" onchange="_schedeUpdateExField('${ex.id}','weight_kg',this.value?+this.value:null)"></label>
                    <label>Rec.<input type="number" min="0" step="15" value="${ex.rest_seconds ?? 90}" onchange="_schedeUpdateExField('${ex.id}','rest_seconds',+this.value)"></label>
                    `}
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

// ── Editor refresh helper ────────────────────────────────────────────────────
function _schedeRefreshEditor() {
    const inner = document.getElementById('schedeInner') || document.getElementById('schedeContainer');
    if (inner) _renderPlanEditor(inner);
}

// ── Day management ───────────────────────────────────────────────────────────
function _schedeSelectDay(day) {
    _editActiveDay = day;
    _schedeRefreshEditor();
}

function _schedeAddDay() {
    const nextLetter = String.fromCharCode(65 + _editDayLabels.length);
    const newLabel = 'Giorno ' + nextLetter;
    _editDayLabels.push(newLabel);
    _editActiveDay = newLabel;
    _schedeRefreshEditor();
}

async function _schedeRemoveDay() {
    if (_editDayLabels.length <= 1) return;
    if (_editingPlan) {
        const toDelete = (_editingPlan.workout_exercises || []).filter(e => e.day_label === _editActiveDay);
        for (const ex of toDelete) {
            try { await WorkoutPlanStorage.deleteExercise(ex.id); } catch (e) { console.error('[Schede] deleteExercise failed:', ex.id, e); }
        }
    }
    _editDayLabels = _editDayLabels.filter(d => d !== _editActiveDay);
    _editActiveDay = _editDayLabels[0];
    _schedeRefreshEditor();
}

function _schedeRenameDay(newName) {
    if (!newName.trim()) return;
    const oldName = _editActiveDay;
    if (_editingPlan) {
        (_editingPlan.workout_exercises || []).forEach(ex => {
            if (ex.day_label === oldName) {
                ex.day_label = newName;
                WorkoutPlanStorage.updateExercise(ex.id, { day_label: newName }).catch(e => { console.error('[Schede] renameDay failed:', ex.id, e); });
            }
        });
    }
    const idx = _editDayLabels.indexOf(oldName);
    if (idx >= 0) _editDayLabels[idx] = newName;
    _editActiveDay = newName;
    _schedeRefreshEditor();
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
        _schedeRefreshEditor();
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
        _schedeRefreshEditor();
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
        _schedeRefreshEditor();
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
        _schedeRefreshEditor();
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

async function _schedeSaveAsTemplate(planId, planName) {
    const tplName = prompt('Nome del template:', planName);
    if (!tplName) return;
    try {
        await WorkoutPlanStorage.duplicatePlan(planId, null, tplName);
        if (typeof showToast === 'function') showToast('Template creato!', 'success');
    } catch (e) {
        console.error('_schedeSaveAsTemplate error:', e);
        if (typeof showToast === 'function') showToast('Errore creazione template', 'error');
    }
}

async function _schedeDeletePlanFromDetail(planId) {
    if (!confirm('Eliminare questa scheda e tutti gli esercizi associati?')) return;
    try {
        await WorkoutPlanStorage.deletePlan(planId);
        if (typeof showToast === 'function') showToast('Scheda eliminata', 'success');
        // Stay on client detail view
        _schedeView = 'client-detail';
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
                        <span class="schede-progress-target">Target: ${(ex.muscle_group || '').toLowerCase() === 'cardio' ? ex.reps + ' min' : ex.sets + '×' + ex.reps + ' @ ' + (ex.weight_kg != null ? ex.weight_kg + 'kg' : '—')}</span>
                    </div>
                    <table class="schede-progress-table">
                        <thead><tr><th>Data</th>${(ex.muscle_group || '').toLowerCase() === 'cardio' ? '<th>Min</th>' : '<th>Serie</th><th>Reps</th><th>Peso</th>'}<th>RPE</th></tr></thead>
                        <tbody>`;
                const _exIsCardio = (ex.muscle_group || '').toLowerCase() === 'cardio';
                for (const date of dates.slice(0, 10)) {
                    const setsForDate = byDate[date].sort((a, b) => a.set_number - b.set_number);
                    for (const s of setsForDate) {
                        const repsClass = _progressClass(s.reps_done, _parseRepsTarget(ex.reps));
                        const weightClass = _progressClass(s.weight_done, ex.weight_kg);
                        if (_exIsCardio) {
                            html += `<tr>
                                <td>${_fmtDate(date)}</td>
                                <td class="${repsClass}">${s.reps_done != null ? s.reps_done + ' min' : '—'}</td>
                                <td>${s.rpe ?? '—'}</td>
                            </tr>`;
                        } else {
                            html += `<tr>
                                <td>${_fmtDate(date)}</td>
                                <td>${s.set_number}</td>
                                <td class="${repsClass}">${s.reps_done ?? '—'}</td>
                                <td class="${weightClass}">${s.weight_done != null ? s.weight_done + 'kg' : '—'}</td>
                                <td>${s.rpe ?? '—'}</td>
                            </tr>`;
                        }
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
