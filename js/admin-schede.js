// ═══════════════════════════════════════════════════════════════════════════════
// TAB SCHEDE — Gestione schede palestra (workout plans)
// ═══════════════════════════════════════════════════════════════════════════════

// ── Exercise catalog from imported_exercises (Supabase) ─────────────────────
let EXERCISES_DB = [];          // populated by _loadExercisesDB()
let EXERCISES_BY_CAT = {};      // { 'Petto': [...], ... }
let EXERCISE_CATEGORIES = [];   // unique sorted categories
let _exercisesDBLoaded = false;
let _loadExercisesDBPromise = null; // singleton: evita query concorrenti

// localStorage cache: imported_exercises cambia raramente (solo da tab Importa).
// TTL 6h — se admin apre/chiude admin.html più volte nella sessione lavorativa,
// non rifacciamo mai la query da 30s. Invalidazione esplicita su import/remove.
const _EXDB_LS_KEY = 'schede_exercises_db_v1';
const _EXDB_LS_TTL_MS = 6 * 60 * 60 * 1000;

function _populateExercisesFromRaw(rawData) {
    EXERCISES_DB = rawData.map(e => ({
        nome_it: e.nome_it,
        nome_original: e.nome_original || '',
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
}

async function _loadExercisesDB() {
    if (_exercisesDBLoaded) return;
    if (_loadExercisesDBPromise) return _loadExercisesDBPromise;
    _loadExercisesDBPromise = (async () => {
        try {
            // 1. Prima cache in-memory dalla tab Importa (se già caricata)
            let rawData = null;
            if (typeof _importaImportedLoaded !== 'undefined' && _importaImportedLoaded) {
                rawData = _importaImported;
            }
            // 2. Poi cache localStorage (evita 30s di query su admin.html quando
            //    la rete è satura dagli altri sync iniziali)
            let fromLocalStorage = false;
            if (!rawData) {
                try {
                    const raw = localStorage.getItem(_EXDB_LS_KEY);
                    if (raw) {
                        const parsed = JSON.parse(raw);
                        if (parsed && parsed.ts && Date.now() - parsed.ts < _EXDB_LS_TTL_MS && Array.isArray(parsed.data)) {
                            rawData = parsed.data;
                            fromLocalStorage = true;
                            console.log(`[Schede] _loadExercisesDB: da localStorage (${rawData.length} esercizi, ${Math.round((Date.now()-parsed.ts)/60000)}min fa)`);
                        }
                    }
                } catch (e) { /* cache corrotta: ignora */ }
            }
            // 3. Infine fetch da Supabase
            if (!rawData) {
                const { data, error } = await _queryWithTimeout(supabaseClient
                    .from('imported_exercises')
                    .select('slug, nome_it, nome_original, nome_en, categoria, immagine, immagine_thumbnail, video, popolarita')
                    .order('categoria')
                    .order('nome_it'), 30000);
                if (error) throw error;
                rawData = data || [];
                try { localStorage.setItem(_EXDB_LS_KEY, JSON.stringify({ ts: Date.now(), data: rawData })); } catch (e) { /* quota: ignora */ }
            }
            // Propaga anche alla cache di Importa se non è ancora popolata: così
            // aprire la tab Importa dopo aver aperto Schede non rifà la query.
            if (typeof _importaImportedLoaded !== 'undefined' && !_importaImportedLoaded) {
                _importaImported = rawData;
                _importaImportedSlugs = new Set(rawData.map(e => e.slug));
                _importaImportedLoaded = true;
            }
            _populateExercisesFromRaw(rawData);
            _exercisesDBLoaded = true;
        } catch (e) { console.error('[Schede] Failed to load exercises DB:', e); }
    })();
    try { await _loadExercisesDBPromise; } finally { _loadExercisesDBPromise = null; }
}

// Refresh after import/remove in Importa tab
async function _refreshSchedeFromImported() {
    _exercisesDBLoaded = false;
    try { localStorage.removeItem(_EXDB_LS_KEY); } catch (e) { /* noop */ }
    await _loadExercisesDB();
}

function _findExercise(name) {
    if (!name) return null;
    return EXERCISES_DB.find(e => e.nome_it === name)
        || EXERCISES_DB.find(e => e.nome_original === name)
        || null;
}

function _findExerciseForCard(ex) {
    if (ex.exercise_slug) {
        const bySlug = EXERCISES_DB.find(e => e.slug === ex.exercise_slug);
        if (bySlug) return bySlug;
    }
    return _findExercise(ex.exercise_name);
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

function _buildExercisePicker(currentValue, exId, muscleGroup, exerciseSlug = null) {
    let ex = null;
    if (exerciseSlug) ex = EXERCISES_DB.find(e => e.slug === exerciseSlug) || _findExercise(currentValue);
    else ex = _findExercise(currentValue);
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
                    <img src="images/icone_muscoli/${svg}.svg" class="schede-picker-cat-icon" alt="">
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
        <div class="schede-picker-item">
            <img src="${ex.immagine_url_small}" class="schede-picker-item-img" alt="" loading="lazy">
            <div class="schede-picker-item-info" onclick="_schedePickExercise('${exId}', '${_escHtml(ex.nome_it).replace(/'/g, "\\'")}')">
                <span class="schede-picker-item-name">${_escHtml(ex.nome_it)}</span>
                <span class="schede-picker-item-cat">${_escHtml(ex.categoria)}</span>
            </div>
            ${ex.video_url ? `<button class="schede-picker-item-video" onclick="event.stopPropagation();_schedeShowExDetail('${_escHtml(ex.slug)}')" title="Video">&#9654;</button>` : ''}
        </div>
    `).join('') + (exercises.length > 50 ? `<div class="schede-picker-more">${exercises.length - 50} altri — affina la ricerca</div>` : '');
}

async function _schedePickExercise(exId, exerciseName) {
    const ex = _findExercise(exerciseName);
    // Build all updates in one batch
    const updates = { exercise_name: exerciseName };
    if (ex) {
        updates.exercise_slug = ex.slug;
        updates.muscle_group = ex.categoria;
        // Cardio: set time-based defaults
        if ((ex.categoria || '').toLowerCase() === 'cardio') {
            updates.sets = 1;
            updates.reps = '20';
            updates.rest_seconds = 0;
        }
    }
    try {
        await WorkoutPlanStorage.updateExercise(exId, updates);
    } catch (e) {
        if (typeof showToast === 'function') showToast('Errore aggiornamento', 'error');
    }

    // Close picker and re-render row
    const dropdown = document.getElementById('picker-' + exId);
    if (dropdown) dropdown.style.display = 'none';
    _schedeCleanupPickerScroll();

    // Full re-render to update params layout (cardio vs strength)
    _schedeRefreshEditor();
}

async function _schedePickCustom(exId) {
    const dropdown = document.getElementById('picker-' + exId);
    if (dropdown) dropdown.style.display = 'none';
    _schedeCleanupPickerScroll();

    try {
        await WorkoutPlanStorage.updateExercise(exId, { exercise_name: '', exercise_slug: null });
    } catch (e) {
        if (typeof showToast === 'function') showToast('Errore aggiornamento', 'error');
    }

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

let _schedeView = 'list';  // 'list' | 'edit' | 'progress' | 'clients' | 'client-detail' | 'actual'
let _schedeSection = (function() {
    // Persisti l'ultima sub-sezione attiva (subnav della tab Schede) — sopravvive ai reload.
    try { return sessionStorage.getItem('adminSchedeSection') || 'actual'; } catch (e) { return 'actual'; }
})(); // 'actual' | 'schede' | 'clienti' | 'importa'
let _currentPlanId = null;
let _editingPlan = null;
let _editDayLabels = [];
let _editActiveDay = '';
let _schedeClientUserId = null;  // for client-detail view
let _schedeClientDetailTab = 'schede'; // 'progressi' | 'schede' | 'report' (tab attivo nella client-detail)
let _schedeClientDetailLogsCache = { userId: null, logs: null }; // cache workout_logs per evitare refetch a ogni switch tab

// ── Entry point ──────────────────────────────────────────────────────────────
let _schedeRendering = false;   // guard against concurrent calls
let _schedeRenderQueued = false; // re-render after current finishes
let _schedeLastSync = 0;        // timestamp of last successful sync
const _SCHEDE_SYNC_INTERVAL = 10000; // skip re-sync if < 10s ago
const _SCHEDE_EXDB_TIMEOUT_MS = 35000;   // safety net oltre il timeout interno 30s
const _SCHEDE_SYNC_TIMEOUT_MS = 35000;   // idem per syncFromSupabase

// Safety-timeout wrapper: garantisce che il render non resti appeso anche se
// la query sottostante non onora il proprio timeout (race, fetch sospeso, ecc.).
function _schedeWithTimeout(promise, ms, label) {
    return Promise.race([
        Promise.resolve(promise),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`[Schede] timeout:${label}`)), ms)
        )
    ]);
}

function _schedeRenderShell(container, { loading }) {
    const loaderHtml = loading ? '<div class="schede-loading">Caricamento schede...</div>' : '';
    container.innerHTML = `<div class="schede-subnav">
        <button class="schede-subnav-pill ${_schedeSection === 'actual' ? 'active' : ''}" onclick="_schedeSwitchSection('actual')">Live</button>
        <button class="schede-subnav-pill ${_schedeSection === 'schede' ? 'active' : ''}" onclick="_schedeSwitchSection('schede')">Schede</button>
        <button class="schede-subnav-pill ${_schedeSection === 'clienti' ? 'active' : ''}" onclick="_schedeSwitchSection('clienti')">Clienti</button>
        <button class="schede-subnav-pill ${_schedeSection === 'importa' ? 'active' : ''}" onclick="_schedeSwitchSection('importa')">💪🏻 Importa</button>
    </div><div id="schedeInner">${loaderHtml}</div>`;
}

async function renderSchedeTab() {
    // If already rendering, queue one re-render and bail
    if (_schedeRendering) {
        _schedeRenderQueued = true;
        console.debug('[Schede] renderSchedeTab: queued (render gia in corso)');
        return;
    }
    _schedeRendering = true;
    _schedeRenderQueued = false;
    const _t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    console.log('[Schede] renderSchedeTab: start');

    try {
        const container = document.getElementById('schedeContainer');
        if (!container) return;

        // Idrata da localStorage se cache in-memory vuota (primo render del tab
        // dopo reload). Così renderizziamo subito l'ultima lista nota invece di
        // mostrare il loader per 30s mentre la query va in timeout.
        if (typeof WorkoutPlanStorage !== 'undefined' && typeof WorkoutPlanStorage._loadFromLocalStorage === 'function') {
            WorkoutPlanStorage._loadFromLocalStorage(true);
        }
        const cachedPlans = (typeof WorkoutPlanStorage !== 'undefined')
            ? (WorkoutPlanStorage.getAllPlans() || []) : [];
        const hasData = cachedPlans.length > 0 || _schedeLastSync > 0;

        // Shell UI subito: subnav sempre visibile, loader solo se cache vuota.
        // Cosi' se il sync si blocca l'utente vede comunque il tab e puo' navigare.
        _schedeRenderShell(container, { loading: !hasData });

        // ── Sub-sezione "Importa" ────────────────────────────────────────────
        // Render isolato dal resto del tab: non serve sync workout_plans, non
        // serve _loadExercisesDB (quel cache lo riempie admin-importa.js stesso).
        // Inietta il container e delega tutto a renderImportaTab().
        if (_schedeSection === 'importa') {
            _schedeActualStopAutoRefresh();
            const inner = document.getElementById('schedeInner');
            if (inner) {
                inner.innerHTML = '<div class="dashboard-card" id="importaContainer"><div class="importa-loading">Caricamento catalogo esercizi...</div></div>';
                if (typeof renderImportaTab === 'function') renderImportaTab();
            }
            return;
        }

        // ── Exercise DB: serve SOLO per editor e picker. Le view list/actual/
        // clienti/progress NON lo usano (renderano solo WorkoutPlanStorage), quindi
        // non blocchiamo il render. In edit mode invece è necessario (picker esercizi).
        // Fire-and-forget per le altre view → la query si scalda in background.
        if (_schedeView === 'edit') {
            const _tEx = (typeof performance !== 'undefined' ? performance.now() : Date.now());
            console.log('[Schede] _loadExercisesDB: start (edit mode — blocking)');
            try {
                await _schedeWithTimeout(_loadExercisesDB(), _SCHEDE_EXDB_TIMEOUT_MS, 'load_exercises_db');
                const ms = Math.round(((typeof performance !== 'undefined' ? performance.now() : Date.now())) - _tEx);
                console.log(`[Schede] _loadExercisesDB: done (${ms}ms, ${EXERCISES_DB.length} esercizi)`);
            } catch (e) {
                console.warn('[Schede] _loadExercisesDB: timeout/failed, proseguo senza catalogo', e);
            }
        } else if (!_exercisesDBLoaded && !_loadExercisesDBPromise) {
            // Background: prealloca cache per quando l'utente aprirà un editor
            console.log('[Schede] _loadExercisesDB: background (non-blocking)');
            _loadExercisesDB().catch(e => console.warn('[Schede] background _loadExercisesDB failed', e));
        }

        // ── Sync workout_plans ───────────────────────────────────────────────
        // Bloccante SOLO al primo load (cache vuota). Se abbiamo gia' dati,
        // sync in background — i CRUD aggiornano _cache direttamente, la stale
        // data e' al massimo di pochi secondi. Motivo: il re-sync mid-sessione
        // a volte va in rpc_timeout (auth lock contention?) e bloccava il tab.
        const now = Date.now();
        if (now - _schedeLastSync > _SCHEDE_SYNC_INTERVAL) {
            if (hasData) {
                _schedeLastSync = now; // ottimistico, evita retry concorrenti
                console.log('[Schede] syncFromSupabase: background start');
                const _tBg = (typeof performance !== 'undefined' ? performance.now() : Date.now());
                WorkoutPlanStorage.syncFromSupabase({ adminMode: true }).then(() => {
                    const ms = Math.round(((typeof performance !== 'undefined' ? performance.now() : Date.now())) - _tBg);
                    console.log(`[Schede] syncFromSupabase: background done (${ms}ms)`);
                }).catch(e => {
                    console.warn('[Schede] Background sync failed:', e);
                    _schedeLastSync = 0; // permetti retry alla prossima render
                });
            } else {
                console.log('[Schede] syncFromSupabase: blocking start (cache vuota)');
                const _tSync = (typeof performance !== 'undefined' ? performance.now() : Date.now());
                try {
                    await _schedeWithTimeout(
                        WorkoutPlanStorage.syncFromSupabase({ adminMode: true }),
                        _SCHEDE_SYNC_TIMEOUT_MS,
                        'sync_workout_plans'
                    );
                    _schedeLastSync = now;
                    const ms = Math.round(((typeof performance !== 'undefined' ? performance.now() : Date.now())) - _tSync);
                    console.log(`[Schede] syncFromSupabase: blocking done (${ms}ms)`);
                } catch (e) {
                    console.error('[Schede] syncFromSupabase: timeout/failed — mostro fallback', e);
                    const inner = document.getElementById('schedeInner');
                    if (inner) {
                        inner.innerHTML = `<div class="empty-slot">
                            Impossibile caricare le schede (timeout).<br>
                            <button class="btn-primary" onclick="renderSchedeTab()" style="margin-top:8px">Riprova</button>
                        </div>`;
                    }
                    return; // esce dal try; finally rilascia il lock
                }
            }
        }

        const inner = document.getElementById('schedeInner');
        if (!inner) return;

        // Actual section has its own auto-refresh (60s) for live slot rotation;
        // keep the interval running only while the view is on 'actual/list'.
        _schedeActualStopAutoRefresh();

        if (_schedeView === 'edit') _renderPlanEditor(inner);
        else if (_schedeView === 'progress') await _renderProgressView(inner);
        else if (_schedeSection === 'clienti') {
            if (_schedeView === 'client-detail') await _renderClientDetail(inner);
            else _renderClientsList(inner);
        } else if (_schedeSection === 'actual') {
            _renderActualView(inner);
            _schedeActualStartAutoRefresh();
        } else {
            _renderSchedeList(inner);
        }
    } catch (e) {
        console.error('[Schede] renderSchedeTab error:', e);
        const errTarget = document.getElementById('schedeInner') || document.getElementById('schedeContainer');
        if (errTarget) errTarget.innerHTML = '<div class="empty-slot">Errore caricamento schede. Cambia tab e riprova.</div>';
    } finally {
        const ms = Math.round(((typeof performance !== 'undefined' ? performance.now() : Date.now())) - _t0);
        console.log(`[Schede] renderSchedeTab: end (${ms}ms) — release lock`);
        _schedeRendering = false;
        if (_schedeRenderQueued) {
            console.debug('[Schede] renderSchedeTab: eseguo re-render in coda');
            renderSchedeTab();
        }
    }
}

function _schedeSwitchSection(section) {
    _schedeSection = section;
    _schedeView = section === 'clienti' ? 'clients' : 'list';
    _schedeClientUserId = null;
    try { sessionStorage.setItem('adminSchedeSection', section); } catch (e) { /* noop */ }
    renderSchedeTab();
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTUAL (slot precedente / attuale / successivo — live view)
// ═══════════════════════════════════════════════════════════════════════════════
let _schedeActualIntervalId = null;

// Set di user_id che hanno almeno un workout_log per la data corrente.
// Popolato in background da _schedeActualFetchLoggedToday e usato per mostrare
// i badge V/X accanto ai nomi nello slot precedente e attuale.
let _schedeActualLoggedTodayDate = null;
let _schedeActualLoggedTodaySet = new Set();
let _schedeActualLoggedTodayInflight = false;
let _schedeActualLoggedTodayFetchedAt = 0;

// Set di user_id che hanno almeno un monthly_report per il mese scorso (year_month
// = mese precedente a quello corrente). Popolato in background da
// _schedeActualFetchReportsLastMonth e usato per mostrare l'emoji 📊 accanto al
// badge V/X nello slot precedente e attuale.
let _schedeActualReportLastMonthYM = null;
let _schedeActualReportLastMonthSet = new Set();
let _schedeActualReportLastMonthInflight = false;
let _schedeActualReportLastMonthFetchedAt = 0;

async function _schedeActualFetchLoggedToday(todayFormatted) {
    if (_schedeActualLoggedTodayInflight) return;
    const fresh = _schedeActualLoggedTodayDate === todayFormatted
        && (Date.now() - _schedeActualLoggedTodayFetchedAt) < 60000;
    if (fresh) return;
    if (typeof supabaseClient === 'undefined') return;
    _schedeActualLoggedTodayInflight = true;
    try {
        const { data, error } = await _queryWithTimeout(supabaseClient
            .from('workout_logs')
            .select('user_id')
            .eq('log_date', todayFormatted));
        if (error) {
            console.warn('[Schede Actual] fetch logged today error:', error.message);
            return;
        }
        const set = new Set();
        for (const r of (data || [])) if (r.user_id) set.add(r.user_id);
        _schedeActualLoggedTodaySet = set;
        _schedeActualLoggedTodayDate = todayFormatted;
        _schedeActualLoggedTodayFetchedAt = Date.now();
        // Re-render se siamo ancora sull'Actual: la guardia "fresh" sopra evita
        // il loop infinito (il rerender richiama fetch che vede cache fresca).
        if (_schedeSection === 'actual' && _schedeView === 'list') {
            const inner = document.getElementById('schedeInner');
            if (inner) _renderActualView(inner);
        }
    } catch (e) {
        console.warn('[Schede Actual] fetch logged today exception:', e);
    } finally {
        _schedeActualLoggedTodayInflight = false;
    }
}

// "YYYY-MM" del mese precedente a oggi (TZ locale). Allineato con
// _getAvailableMonthForGeneration di allenamento-report.js.
function _schedeActualLastMonthYM() {
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
}

async function _schedeActualFetchReportsLastMonth(yearMonth) {
    if (_schedeActualReportLastMonthInflight) return;
    const fresh = _schedeActualReportLastMonthYM === yearMonth
        && (Date.now() - _schedeActualReportLastMonthFetchedAt) < 60000;
    if (fresh) return;
    if (typeof supabaseClient === 'undefined') return;
    _schedeActualReportLastMonthInflight = true;
    try {
        const { data, error } = await _queryWithTimeout(supabaseClient
            .from('monthly_reports')
            .select('user_id')
            .eq('year_month', yearMonth));
        if (error) {
            console.warn('[Schede Actual] fetch reports last month error:', error.message);
            return;
        }
        const set = new Set();
        for (const r of (data || [])) if (r.user_id) set.add(r.user_id);
        _schedeActualReportLastMonthSet = set;
        _schedeActualReportLastMonthYM = yearMonth;
        _schedeActualReportLastMonthFetchedAt = Date.now();
        // Re-render se siamo ancora sull'Actual (la guardia "fresh" sopra
        // evita il loop infinito sul rerender che richiama il fetch).
        if (_schedeSection === 'actual' && _schedeView === 'list') {
            const inner = document.getElementById('schedeInner');
            if (inner) _renderActualView(inner);
        }
    } catch (e) {
        console.warn('[Schede Actual] fetch reports last month exception:', e);
    } finally {
        _schedeActualReportLastMonthInflight = false;
    }
}

function _schedeActualStartAutoRefresh() {
    if (_schedeActualIntervalId) return;
    _schedeActualIntervalId = setInterval(() => {
        // Re-render solo se siamo ancora sul tab Actual e non c'e' un popup aperto.
        // Il popup e' fuori da #schedeInner quindi non viene distrutto, ma evitiamo
        // comunque di riallineare la UI sotto l'utente mentre decide.
        if (_schedeSection !== 'actual' || _schedeView !== 'list') {
            _schedeActualStopAutoRefresh();
            return;
        }
        const inner = document.getElementById('schedeInner');
        if (inner) _renderActualView(inner);
    }, 60000);
}

function _schedeActualStopAutoRefresh() {
    if (_schedeActualIntervalId) {
        clearInterval(_schedeActualIntervalId);
        _schedeActualIntervalId = null;
    }
}

function _schedeActualParseSlot(slotStr) {
    // "HH:MM - HH:MM" → { startMin, endMin }
    const m = slotStr.match(/(\d{2}):(\d{2})\s*-\s*(\d{2}):(\d{2})/);
    if (!m) return null;
    return {
        startMin: parseInt(m[1], 10) * 60 + parseInt(m[2], 10),
        endMin:   parseInt(m[3], 10) * 60 + parseInt(m[4], 10)
    };
}

function _schedeActualPickSlots(now) {
    // Return { prev, current, next } indices into TIME_SLOTS (or null each).
    const nowMin = now.getHours() * 60 + now.getMinutes();
    let currentIdx = -1;
    for (let i = 0; i < TIME_SLOTS.length; i++) {
        const r = _schedeActualParseSlot(TIME_SLOTS[i]);
        if (!r) continue;
        if (nowMin >= r.startMin && nowMin < r.endMin) { currentIdx = i; break; }
    }
    let prevIdx = -1, nextIdx = -1;
    if (currentIdx === -1) {
        // Prima del primo slot o dopo l'ultimo
        const first = _schedeActualParseSlot(TIME_SLOTS[0]);
        if (first && nowMin < first.startMin) {
            nextIdx = 0;
        } else {
            prevIdx = TIME_SLOTS.length - 1;
        }
    } else {
        if (currentIdx > 0) prevIdx = currentIdx - 1;
        if (currentIdx < TIME_SLOTS.length - 1) nextIdx = currentIdx + 1;
    }
    return { prevIdx, currentIdx, nextIdx };
}

function _schedeActualSlotTypeForDate(dateFormatted, slotTime) {
    // Determine slot type from schedule overrides, fallback to default weekly schedule.
    try {
        if (typeof BookingStorage !== 'undefined' && BookingStorage.getScheduleOverrides) {
            const overrides = BookingStorage.getScheduleOverrides();
            const daySlots = overrides[dateFormatted];
            if (daySlots) {
                const hit = daySlots.find(s => s.time === slotTime);
                if (hit) return hit.type;
            }
        }
    } catch (e) { /* ignore, fallback below */ }
    // Fallback: DEFAULT_WEEKLY_SCHEDULE by day name
    try {
        const d = new Date(dateFormatted + 'T00:00:00');
        const dayNames = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
        const dayName = dayNames[d.getDay()];
        const week = (typeof DEFAULT_WEEKLY_SCHEDULE !== 'undefined') ? DEFAULT_WEEKLY_SCHEDULE[dayName] : null;
        if (week) {
            const hit = week.find(s => s.time === slotTime);
            if (hit) return hit.type;
        }
    } catch (e) { /* ignore */ }
    return null;
}

function _schedeActualSlotTypeLabel(type) {
    if (typeof SLOT_NAMES !== 'undefined' && SLOT_NAMES[type]) return SLOT_NAMES[type];
    return '';
}

function _schedeActualSlotTypeClass(type) {
    if (type === 'personal-training') return 'schede-actual-type--personal';
    if (type === 'small-group')       return 'schede-actual-type--group';
    if (type === 'group-class')       return 'schede-actual-type--private';
    if (type === 'cleaning')          return 'schede-actual-type--cleaning';
    return '';
}

// Avatar helpers — colore stabile (hash del nome) + iniziali
function _saAvatarColor(name) {
    const palette = ['blue', 'green', 'amber', 'purple', 'pink'];
    const s = String(name || '');
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return palette[Math.abs(h) % palette.length];
}
function _saInitials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    const a = parts[0][0] || '';
    const b = parts.length > 1 ? (parts[parts.length - 1][0] || '') : '';
    return (a + b).toUpperCase();
}

function _renderActualView(container) {
    const now = new Date();
    const todayFormatted = (typeof formatAdminDate === 'function')
        ? formatAdminDate(now)
        : `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const { prevIdx, currentIdx, nextIdx } = _schedeActualPickSlots(now);

    const allUsers = _schedeGetRegisteredUsers();
    const userById = {};
    for (const u of allUsers) userById[u.userId] = u;

    // Precalcolo: user_ids con almeno una scheda attiva. Chi non e' nel set
    // viene marcato "no-plan" (rosso tenue) → l'admin vede subito chi non
    // ha scheda da seguire e deve assegnargliene una.
    const usersWithActivePlan = new Set();
    try {
        if (typeof WorkoutPlanStorage !== 'undefined') {
            for (const p of (WorkoutPlanStorage.getAllPlans() || [])) {
                if (p.user_id && p.active) usersWithActivePlan.add(p.user_id);
            }
        }
    } catch (e) { /* ignore: se fallisce, nessuno viene marcato no-plan */ }

    // Set user_id che hanno loggato oggi: usato per il badge V/X (solo prev/current).
    // Se la cache e' di un'altra data usiamo set vuoto (tutti X) finche' il fetch
    // in background non aggiorna e ri-renderizza.
    _schedeActualFetchLoggedToday(todayFormatted);
    const loggedSet = (_schedeActualLoggedTodayDate === todayFormatted)
        ? _schedeActualLoggedTodaySet
        : new Set();

    // Set user_id con monthly_report del mese scorso: usato per l'emoji 📊
    // accanto al badge V/X (solo prev/current). Stessa logica di cache.
    const lastMonthYM = _schedeActualLastMonthYM();
    _schedeActualFetchReportsLastMonth(lastMonthYM);
    const reportSet = (_schedeActualReportLastMonthYM === lastMonthYM)
        ? _schedeActualReportLastMonthSet
        : new Set();

    const ctx = { now, todayFormatted, usersWithActivePlan, loggedSet, reportSet };

    let html = '<div class="schede-actual-carousel">';
    html +=   '<div class="schede-actual-track">';
    html +=     _schedeActualRenderSlot('prev',    prevIdx,    ctx);
    html +=     _schedeActualRenderSlot('current', currentIdx, ctx);
    html +=     _schedeActualRenderSlot('next',    nextIdx,    ctx);
    html +=   '</div>';
    html +=   '<div class="sa-dots"><span></span><span class="active"></span><span></span></div>';
    html += '</div>';

    container.innerHTML = html;

    // Carosello mobile: posiziona scroll sullo slot LIVE al primo render e
    // tieni allineati i puntini all'indice piu' centrato. Su desktop il
    // grid non scrolla orizzontalmente quindi i listener restano dormienti.
    requestAnimationFrame(() => {
        const carousel = container.querySelector('.schede-actual-carousel');
        if (!carousel) return;
        const track = carousel.querySelector('.schede-actual-track');
        if (!track) return;
        const slots = track.querySelectorAll('.schede-actual-slot');
        const dots = carousel.querySelectorAll('.sa-dots span');

        if (track.scrollWidth > track.clientWidth + 1) {
            const live = track.querySelector('.schede-actual-slot--current');
            if (live) {
                const offset = live.offsetLeft - (track.clientWidth - live.clientWidth) / 2;
                track.scrollLeft = Math.max(0, offset);
            }
        }

        const syncDots = () => {
            if (!slots.length || !dots.length) return;
            let nearest = 0, best = Infinity;
            const center = track.scrollLeft + track.clientWidth / 2;
            slots.forEach((s, i) => {
                const c = s.offsetLeft + s.clientWidth / 2;
                const d = Math.abs(c - center);
                if (d < best) { best = d; nearest = i; }
            });
            dots.forEach((d, i) => d.classList.toggle('active', i === nearest));
        };
        track.addEventListener('scroll', syncDots, { passive: true });
        syncDots();
    });
}

function _schedeActualRenderSlot(position, slotIdx, ctx) {
    // Pill in alto a sinistra dell'hero scuro: cambia label/colore per posizione.
    const pillLabel = position === 'prev'    ? 'CONCLUSO'
                    : position === 'current' ? 'LIVE'
                    : 'PROSSIMO';
    const pillHtml  = position === 'current'
        ? '<span class="sa-pill sa-pill--live"><span class="sa-pulse"></span>LIVE</span>'
        : `<span class="sa-pill sa-pill--${position}">${pillLabel}</span>`;

    if (slotIdx < 0 || slotIdx >= TIME_SLOTS.length) {
        const emptyMsg = position === 'prev'    ? 'Nessuno slot prima'
                       : position === 'current' ? 'Nessuno slot attivo'
                       : 'Giornata terminata';
        return `<div class="schede-actual-slot schede-actual-slot--${position} schede-actual-slot--empty">
            <div class="sa-hero">
                <div class="sa-hero-top">${pillHtml}</div>
                <div class="sa-empty-msg">${_escHtml(emptyMsg)}</div>
            </div>
        </div>`;
    }

    const slotTime  = TIME_SLOTS[slotIdx];
    const slotRange = _schedeActualParseSlot(slotTime);
    const slotType  = _schedeActualSlotTypeForDate(ctx.todayFormatted, slotTime);
    const typeLabel = _schedeActualSlotTypeLabel(slotType);
    const typeClass = _schedeActualSlotTypeClass(slotType);
    const startTime = slotTime.split(' - ')[0] || '';
    const endTime   = slotTime.split(' - ')[1] || '';

    let bookings = [];
    try {
        bookings = (typeof BookingStorage !== 'undefined')
            ? BookingStorage.getBookingsForSlot(ctx.todayFormatted, slotTime).filter(b => b.status !== 'cancelled' && !b.id?.startsWith('_avail_'))
            : [];
    } catch (e) { console.warn('[Schede Actual] getBookingsForSlot failed:', e); }

    // Capienza: capacita' del tipo principale dello slot per "X / Y posti".
    let cap = 0;
    try {
        if (typeof BookingStorage !== 'undefined' && slotType) {
            cap = BookingStorage.getEffectiveCapacity(ctx.todayFormatted, slotTime, slotType) || 0;
        }
    } catch (e) { /* ignore */ }
    const capHtml = cap > 0
        ? `<span class="sa-cap">${bookings.length} / ${cap} posti</span>`
        : '';

    // Progress bar: 100% se concluso, % corrente se LIVE, 0% se futuro.
    const totalMin = (slotRange && slotRange.endMin > slotRange.startMin)
        ? (slotRange.endMin - slotRange.startMin) : 80;
    const nowMin = ctx.now.getHours() * 60 + ctx.now.getMinutes();
    let progressPct = 0, footMid = '';
    if (position === 'prev') {
        progressPct = 100;
        footMid = 'completato';
    } else if (position === 'current') {
        const elapsed = Math.max(0, Math.min(totalMin, nowMin - (slotRange ? slotRange.startMin : 0)));
        progressPct = Math.round((elapsed / totalMin) * 100);
        footMid = `${elapsed} min · ${progressPct}%`;
    } else {
        progressPct = 0;
        const minutesUntil = Math.max(0, (slotRange ? slotRange.startMin : 0) - nowMin);
        footMid = minutesUntil >= 60
            ? `tra ${Math.round(minutesUntil/60)}h`
            : (minutesUntil > 0 ? `tra ${minutesUntil} min` : 'in arrivo');
    }

    // Lista persone (rimane dentro alla card per posizione: cosi' resta visibile
    // anche per slot prev/next, non solo per LIVE come nel mockup statico).
    let peopleHtml = '';
    if (bookings.length === 0) {
        peopleHtml = '<div class="sa-empty-msg sa-empty-msg--inline">Nessuno in questo slot</div>';
    } else {
        // Badge V/X solo per slot precedente e attuale: nello slot successivo
        // la sessione non e' ancora iniziata, quindi non ha senso mostrarlo.
        const showLogBadge = position === 'prev' || position === 'current';
        peopleHtml = '<div class="sa-people">';
        for (const b of bookings) {
            const uid  = b.userId || b.user_id || '';
            const name = b.name || b.clientName || 'Sconosciuto';
            const hasUid = !!uid;
            const noPlan = hasUid && ctx.usersWithActivePlan && !ctx.usersWithActivePlan.has(uid);
            const avColor  = _saAvatarColor(name);
            const initials = _saInitials(name);

            let logBadgeHtml = '';
            let reportBadgeHtml = '';
            if (showLogBadge) {
                const logged = hasUid && ctx.loggedSet && ctx.loggedSet.has(uid);
                const cls = logged ? 'sa-status sa-status--ok' : 'sa-status sa-status--ko';
                const title = logged ? 'Ha registrato log oggi' : 'Nessun log registrato oggi';
                logBadgeHtml = `<span class="${cls}" title="${title}" aria-label="${title}">${logged ? '✓' : '✗'}</span>`;
                if (hasUid && ctx.reportSet && ctx.reportSet.has(uid)) {
                    const rTitle = 'Ha generato il report del mese scorso';
                    reportBadgeHtml = `<span class="sa-report" title="${rTitle}" aria-label="${rTitle}">📊</span>`;
                }
            }

            const personClasses = ['sa-person'];
            if (!hasUid) personClasses.push('sa-person--guest');
            if (noPlan)  personClasses.push('sa-person--no-plan');
            const titleAttr = !hasUid
                ? 'title="Cliente senza profilo registrato"'
                : (noPlan ? 'title="Nessuna scheda attiva assegnata"' : '');
            const onClickAttr = hasUid
                ? `onclick="_schedeActualOpenClientPopup('${_escJs(uid)}','${_escJs(name)}')"`
                : 'disabled';

            peopleHtml += `<button class="${personClasses.join(' ')}" ${onClickAttr} ${titleAttr}>
                <span class="sa-av sa-av--${avColor}">${_escHtml(initials)}</span>
                <span class="sa-person-info">
                    <span class="sa-person-name">${_escHtml(name)}</span>
                    ${noPlan ? '<span class="sa-person-meta sa-person-meta--warn">Nessuna scheda attiva</span>' : ''}
                </span>
                ${reportBadgeHtml}
                ${logBadgeHtml}
                ${hasUid ? '<span class="sa-chev">›</span>' : ''}
            </button>`;
        }
        peopleHtml += '</div>';
    }

    return `<div class="schede-actual-slot schede-actual-slot--${position}">
        <div class="sa-hero">
            <div class="sa-hero-top">
                ${pillHtml}
                ${capHtml}
            </div>
            <div class="sa-time-row">
                <div class="sa-time-now">${_escHtml(startTime)}</div>
                <div class="sa-time-end">→ ${_escHtml(endTime)}</div>
            </div>
            ${typeLabel ? `<div class="sa-tag-row"><span class="sa-type ${typeClass}">${_escHtml(typeLabel)}</span></div>` : ''}
            <div class="sa-progress"><div class="sa-progress-fill" style="width:${progressPct}%;"></div></div>
            <div class="sa-progress-foot">
                <span>${_escHtml(startTime)}</span>
                <span>${_escHtml(footMid)}</span>
                <span>${_escHtml(endTime)}</span>
            </div>
        </div>
        <div class="sa-body">${peopleHtml}</div>
    </div>`;
}

function _escJs(s) {
    return String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
}

// ── Popup: scelta Carichi / Scheda ────────────────────────────────────────────
function _schedeActualOpenClientPopup(userId, name) {
    // Rimuovi eventuale popup precedente
    _schedeActualCloseClientPopup();

    const plans = (typeof WorkoutPlanStorage !== 'undefined')
        ? WorkoutPlanStorage.getAllPlans().filter(p => p.user_id === userId)
        : [];
    const activePlans = plans.filter(p => p.active);

    const overlay = document.createElement('div');
    overlay.id = 'schedeActualPopupOverlay';
    overlay.className = 'schede-actual-popup-overlay';
    overlay.onclick = function(e) { if (e.target === overlay) _schedeActualCloseClientPopup(); };

    const schedaDisabled = activePlans.length === 0;
    const schedaSubtitle = activePlans.length === 0
        ? 'Nessuna scheda attiva'
        : (activePlans.length === 1 ? activePlans[0].name : `${activePlans.length} schede attive`);

    overlay.innerHTML = `<div class="schede-actual-popup" role="dialog" aria-modal="true">
        <div class="schede-actual-popup-head">
            <div>
                <div class="schede-actual-popup-eyebrow">Cliente</div>
                <h3 class="schede-actual-popup-title">${_escHtml(name)}</h3>
            </div>
            <button class="schede-actual-popup-close" onclick="_schedeActualCloseClientPopup()" aria-label="Chiudi">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        </div>
        <div class="schede-actual-popup-actions">
            <button class="schede-actual-popup-btn" onclick="_schedeActualPickCarichi('${_escJs(userId)}')">
                <div class="schede-actual-popup-btn-icon">📊</div>
                <div class="schede-actual-popup-btn-body">
                    <div class="schede-actual-popup-btn-title">Carichi</div>
                    <div class="schede-actual-popup-btn-sub">Grafici e log delle sessioni precedenti</div>
                </div>
                <div class="schede-actual-popup-btn-chev">›</div>
            </button>
            <button class="schede-actual-popup-btn" onclick="_schedeActualPickReport('${_escJs(userId)}')">
                <div class="schede-actual-popup-btn-icon">📅</div>
                <div class="schede-actual-popup-btn-body">
                    <div class="schede-actual-popup-btn-title">Report</div>
                    <div class="schede-actual-popup-btn-sub">Report AI mensili generati dal cliente</div>
                </div>
                <div class="schede-actual-popup-btn-chev">›</div>
            </button>
            <div class="schede-actual-popup-row">
                <button class="schede-actual-popup-btn ${schedaDisabled ? 'schede-actual-popup-btn--disabled' : ''}"
                    ${schedaDisabled ? 'disabled' : `onclick="_schedeActualPickScheda('${_escJs(userId)}')"`}>
                    <div class="schede-actual-popup-btn-icon">📝</div>
                    <div class="schede-actual-popup-btn-body">
                        <div class="schede-actual-popup-btn-title">Scheda</div>
                        <div class="schede-actual-popup-btn-sub">${_escHtml(schedaSubtitle)}</div>
                    </div>
                    ${schedaDisabled ? '' : '<div class="schede-actual-popup-btn-chev">›</div>'}
                </button>
                ${schedaDisabled ? `<button class="schede-actual-popup-add" onclick="_schedeActualAddPlan('${_escJs(userId)}','${_escJs(name)}')" title="Crea nuova scheda per ${_escHtml(name)}">
                    <span class="schede-actual-popup-add-plus">+</span>
                    <span class="schede-actual-popup-add-label">Aggiungi</span>
                </button>` : ''}
            </div>
        </div>
    </div>`;

    document.body.appendChild(overlay);
    document.addEventListener('keydown', _schedeActualPopupKeyHandler);
    requestAnimationFrame(() => overlay.classList.add('visible'));
}

function _schedeActualCloseClientPopup() {
    const overlay = document.getElementById('schedeActualPopupOverlay');
    if (overlay) overlay.remove();
    document.removeEventListener('keydown', _schedeActualPopupKeyHandler);
}

function _schedeActualPopupKeyHandler(e) {
    if (e.key === 'Escape') _schedeActualCloseClientPopup();
}

function _schedeActualPickCarichi(userId) {
    _schedeActualCloseClientPopup();
    _schedeClientUserId = userId;
    _schedeClientDetailTab = 'progressi';
    _schedeSection = 'clienti';
    _schedeView = 'client-detail';
    renderSchedeTab();
}

function _schedeActualPickScheda(userId) {
    _schedeActualCloseClientPopup();
    const plans = WorkoutPlanStorage.getAllPlans().filter(p => p.user_id === userId);
    const activePlans = plans.filter(p => p.active);
    if (activePlans.length === 1) {
        // Apri direttamente l'editor della scheda attiva
        _schedeEditPlan(activePlans[0].id);
    } else {
        _schedeClientUserId = userId;
        _schedeClientDetailTab = 'schede';
        _schedeSection = 'clienti';
        _schedeView = 'client-detail';
        renderSchedeTab();
    }
}

// Pending prefill per la creazione di una nuova scheda: applicato da
// _renderPlanEditor subito dopo aver scritto il DOM.
let _schedePendingNewPlanPrefill = null;

function _schedeActualAddPlan(userId, clientName) {
    const planName = prompt(`Nome della nuova scheda per ${clientName}:`, '');
    if (planName === null) return; // annullato
    const trimmed = (planName || '').trim();
    if (!trimmed) {
        if (typeof showToast === 'function') showToast('Nome scheda richiesto', 'error');
        return;
    }
    _schedeActualCloseClientPopup();

    // Imposta prefill + apri editor in modalita' "nuova scheda"
    _schedePendingNewPlanPrefill = { userId: userId, clientName: clientName, planName: trimmed };
    _editingPlan = null;
    _currentPlanId = null;
    _editDayLabels = ['Giorno A'];
    _editActiveDay = 'Giorno A';
    _schedeView = 'edit';
    renderSchedeTab();
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT AI (lettura admin dei monthly_reports generati dai clienti)
// ═══════════════════════════════════════════════════════════════════════════════
// Obiettivi correnti — devono restare allineati a _GOALS in allenamento-report.js
// e al CHECK del DB (vedi 20260430000000_monthly_reports_goal.sql).
const _SCHEDE_REPORT_GOALS = {
    dimagrimento:  { label: 'Dimagrimento',  icon: '🔥' },
    massa:         { label: 'Aumento Massa', icon: '💪' },
    tonificazione: { label: 'Tonificazione', icon: '✨' },
    forza:         { label: 'Forza',         icon: '🏋️' },
    salute:        { label: 'Salute',        icon: '❤️' },
    recupero:      { label: 'Recupero',      icon: '🧘' },
};

// Toni legacy: i report generati prima del refactor toni->obiettivi (cc6c2b3)
// hanno solo r.tone valorizzato, non r.goal. Tenuti per leggere lo storico.
const _SCHEDE_REPORT_TONES = {
    serious:      { label: 'Serio',         icon: '🎯' },
    motivational: { label: 'Motivazionale', icon: '💪' },
    ironic:       { label: 'Ironico',       icon: '😏' }
};

function _schedeReportLabel(r) {
    if (r.goal && _SCHEDE_REPORT_GOALS[r.goal]) return _SCHEDE_REPORT_GOALS[r.goal];
    if (r.tone && _SCHEDE_REPORT_TONES[r.tone]) return _SCHEDE_REPORT_TONES[r.tone];
    return { label: r.goal || r.tone || '—', icon: '📝' };
}

// Cache: userId → array di report (caricati al primo open)
const _schedeReportsCache = {};

function _schedeFormatYearMonth(ym) {
    if (!ym) return '';
    const [y, m] = ym.split('-');
    const months = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
                    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
    const idx = parseInt(m, 10) - 1;
    return `${months[idx] || m} ${y}`;
}

function _schedeReportMarkdownToHtml(md) {
    if (!md) return '';
    let html = _escHtml(md);
    html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^## (.+)$/gm,  '<h3>$1</h3>');
    html = html.replace(/^# (.+)$/gm,   '<h2>$1</h2>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
    html = html.split(/\n{2,}/).map(block => {
        const trimmed = block.trim();
        if (!trimmed) return '';
        if (/^<h[2-4]>/.test(trimmed)) return trimmed;
        return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
    }).filter(Boolean).join('\n');
    return html;
}

async function _schedeFetchClientReports(userId, { force = false } = {}) {
    if (!force && _schedeReportsCache[userId]) return _schedeReportsCache[userId];
    if (typeof supabaseClient === 'undefined') return [];
    try {
        const { data, error } = await _queryWithTimeout(supabaseClient
            .from('monthly_reports')
            .select('id, user_id, year_month, goal, tone, narrative, generated_at, status')
            .eq('user_id', userId)
            .eq('status', 'generated')
            .order('year_month', { ascending: false })
            .order('generated_at', { ascending: false }), 15000);
        if (error) throw error;
        _schedeReportsCache[userId] = data || [];
        return _schedeReportsCache[userId];
    } catch (e) {
        console.error('[Schede] fetch reports error:', e);
        return [];
    }
}

function _schedeActualPickReport(userId) {
    _schedeActualCloseClientPopup();
    _schedeClientUserId = userId;
    _schedeClientDetailTab = 'report';
    _schedeSection = 'clienti';
    _schedeView = 'client-detail';
    renderSchedeTab();
}

function _schedeRenderReportCard(r) {
    const info = _schedeReportLabel(r);
    const monthLabel = _schedeFormatYearMonth(r.year_month);
    const dateStr = r.generated_at ? new Date(r.generated_at).toLocaleDateString('it-IT') : '';
    return `<button class="schede-report-item" onclick="_schedeOpenReportModal('${_escJs(r.id)}','${_escJs(r.user_id)}')">
        <span class="schede-report-item-icon">${info.icon}</span>
        <span class="schede-report-item-body">
            <span class="schede-report-item-title">${_escHtml(monthLabel)}</span>
            <span class="schede-report-item-meta">${_escHtml(info.label)}${dateStr ? ' &middot; generato ' + _escHtml(dateStr) : ''}</span>
        </span>
        <span class="schede-report-item-chev">›</span>
    </button>`;
}

async function _schedeRenderReportsSection(userId) {
    const section = document.getElementById('schedeReportsSection');
    if (!section) return;
    section.innerHTML = '<div class="schede-loading">Caricamento report...</div>';

    const reports = await _schedeFetchClientReports(userId);
    if (!reports || reports.length === 0) {
        section.innerHTML = `<h4 class="schede-section-title" id="schedeReportsAnchor">Report Mensili</h4>
            <div class="empty-slot">Nessun report generato da questo cliente.</div>`;
        return;
    }

    // Raggruppa per mese
    const byMonth = {};
    for (const r of reports) {
        (byMonth[r.year_month] = byMonth[r.year_month] || []).push(r);
    }
    const months = Object.keys(byMonth).sort().reverse();

    let html = `<h4 class="schede-section-title" id="schedeReportsAnchor">Report Mensili
        <span class="schede-section-count">${reports.length}</span>
    </h4>`;
    html += '<div class="schede-report-list">';
    for (const ym of months) {
        html += `<div class="schede-report-month">
            <div class="schede-report-month-label">${_escHtml(_schedeFormatYearMonth(ym))}</div>
            <div class="schede-report-month-items">`;
        for (const r of byMonth[ym]) html += _schedeRenderReportCard(r);
        html += '</div></div>';
    }
    html += '</div>';

    section.innerHTML = html;
}

function _schedeOpenReportModal(reportId, userId) {
    const reports = _schedeReportsCache[userId] || [];
    const report = reports.find(r => r.id === reportId);
    if (!report) return;

    _schedeCloseReportModal();

    const info = _schedeReportLabel(report);
    const bodyHtml = _schedeReportMarkdownToHtml(report.narrative);
    const monthLabel = _schedeFormatYearMonth(report.year_month);
    const dateStr = report.generated_at
        ? new Date(report.generated_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
        : '';

    const overlay = document.createElement('div');
    overlay.id = 'schedeReportModalOverlay';
    overlay.className = 'schede-report-modal-overlay';
    overlay.onclick = function(e) { if (e.target === overlay) _schedeCloseReportModal(); };

    overlay.innerHTML = `<div class="schede-report-modal" role="dialog" aria-modal="true">
        <div class="schede-report-modal-head">
            <div>
                <div class="schede-report-modal-eyebrow">Report ${_escHtml(monthLabel)}</div>
                <div class="schede-report-modal-tone">${info.icon} ${_escHtml(info.label)}${dateStr ? ' &middot; ' + _escHtml(dateStr) : ''}</div>
            </div>
            <button class="schede-report-modal-close" onclick="_schedeCloseReportModal()" aria-label="Chiudi">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        </div>
        <div class="schede-report-modal-body">${bodyHtml || '<p><em>Report vuoto.</em></p>'}</div>
    </div>`;

    document.body.appendChild(overlay);
    document.addEventListener('keydown', _schedeReportModalKeyHandler);
    requestAnimationFrame(() => overlay.classList.add('visible'));
}

function _schedeCloseReportModal() {
    const overlay = document.getElementById('schedeReportModalOverlay');
    if (overlay) overlay.remove();
    document.removeEventListener('keydown', _schedeReportModalKeyHandler);
}

function _schedeReportModalKeyHandler(e) {
    if (e.key === 'Escape') _schedeCloseReportModal();
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

    let html = '';

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
            const activePlans = userPlans.filter(p => p.active);
            const activeCount = activePlans.length;
            const inactiveCount = userPlans.length - activeCount;
            const totalExercises = userPlans.reduce((s, p) => s + (p.workout_exercises || []).length, 0);

            // Distinct training days (day_label) across active plans
            const activeDayLabels = new Set();
            for (const p of activePlans) {
                for (const ex of (p.workout_exercises || [])) {
                    if (ex.day_label) activeDayLabels.add(ex.day_label);
                }
            }
            const activeDaysCount = activeDayLabels.size;
            const daysSuffix = activeDaysCount
                ? ' &middot; ' + activeDaysCount + ' ' + (activeDaysCount === 1 ? 'giorno' : 'giorni')
                : '';

            let badgesHtml = '';
            if (activeCount === 1) {
                badgesHtml += '<span class="schede-badge-active">1 scheda attiva: '
                    + _escHtml(activePlans[0].name) + daysSuffix + '</span>';
            } else if (activeCount > 1) {
                badgesHtml += '<span class="schede-badge-active">' + activeCount
                    + ' schede attive' + daysSuffix + '</span>';
            }
            if (inactiveCount > 0) {
                const inactiveLabel = inactiveCount === 1
                    ? '1 scheda non attiva'
                    : inactiveCount + ' schede non attive';
                badgesHtml += '<span class="schede-badge-inactive">' + inactiveLabel + '</span>';
            }

            html += `
            <div class="schede-plan-card schede-client-card" data-client="${clientName.toLowerCase()}" onclick="_schedeOpenClientDetail('${uid}')">
                <div class="schede-plan-card-header">
                    <div class="schede-plan-card-info">
                        <div class="schede-plan-client">${clientName}</div>
                        <div class="schede-plan-meta">${userPlans.length} schede &middot; ${totalExercises} esercizi${badgesHtml ? ' &middot; ' + badgesHtml : ''}</div>
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
    _schedeClientDetailTab = 'schede'; // default da Clienti
    _schedeView = 'client-detail';
    renderSchedeTab();
}

function _schedeClientSwitchTab(tab) {
    if (_schedeClientDetailTab === tab) return;
    _schedeClientDetailTab = tab;
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
    const tab = _schedeClientDetailTab || 'schede';

    // Shell: topbar + tab nav + tab-content placeholder
    const shell = `<div class="schede-editor-topbar">
        <button class="schede-back-btn" onclick="_schedeView='clients';renderSchedeTab()">← Clienti</button>
        <h3>${_escHtml(clientName)}</h3>
    </div>
    <div class="schede-client-tabs" role="tablist">
        <button class="schede-client-tab ${tab === 'progressi' ? 'active' : ''}" role="tab" onclick="_schedeClientSwitchTab('progressi')">
            <span class="schede-client-tab-icon">📈</span>Progressi
        </button>
        <button class="schede-client-tab ${tab === 'schede' ? 'active' : ''}" role="tab" onclick="_schedeClientSwitchTab('schede')">
            <span class="schede-client-tab-icon">🏋</span>Schede
            <span class="schede-client-tab-count">${plans.length}</span>
        </button>
        <button class="schede-client-tab ${tab === 'report' ? 'active' : ''}" role="tab" onclick="_schedeClientSwitchTab('report')">
            <span class="schede-client-tab-icon">📅</span>Report
        </button>
    </div>
    <div id="schedeClientTabContent" class="schede-client-tab-content"></div>`;
    container.innerHTML = shell;

    const tabContainer = document.getElementById('schedeClientTabContent');
    if (!tabContainer) return;

    if (tab === 'report') {
        await _schedeClientRenderReport(tabContainer, userId);
    } else if (tab === 'progressi') {
        await _schedeClientRenderProgressi(tabContainer, userId, plans);
    } else {
        await _schedeClientRenderSchede(tabContainer, userId, plans);
    }
}

// ── Fetch workout_logs con cache per userId (condiviso tra tab Progressi e Schede) ──
async function _schedeClientDetailLoadLogs(userId, plans) {
    if (_schedeClientDetailLogsCache.userId === userId && _schedeClientDetailLogsCache.logs !== null) {
        return _schedeClientDetailLogsCache.logs;
    }
    const allExercises = plans.flatMap(p => p.workout_exercises || []);
    const allExIds = allExercises.map(e => e.id);
    if (!allExIds.length) {
        _schedeClientDetailLogsCache = { userId, logs: [] };
        return [];
    }
    try {
        const { data, error } = await _queryWithTimeout(supabaseClient
            .from('workout_logs')
            .select('exercise_id, log_date, weight_done, reps_done')
            .in('exercise_id', allExIds)
            .order('log_date', { ascending: true }));
        if (error) throw error;
        _schedeClientDetailLogsCache = { userId, logs: data || [] };
        return _schedeClientDetailLogsCache.logs;
    } catch (e) {
        console.error('[Schede] logs fetch error:', e);
        return null; // null = errore, distinto da [] = vuoto
    }
}

// ── Tab Schede ───────────────────────────────────────────────────────────────
async function _schedeClientRenderSchede(container, userId, plans) {
    container.innerHTML = '<div class="schede-loading">Caricamento schede...</div>';
    const logs = await _schedeClientDetailLoadLogs(userId, plans);

    if (logs === null) {
        container.innerHTML = '<div class="empty-slot">Errore caricamento. Riprova.</div>';
        return;
    }

    // Mappa plan.id → date range (primo-ultimo log)
    const _exIdToPlan = {};
    for (const plan of plans) {
        for (const ex of (plan.workout_exercises || [])) _exIdToPlan[ex.id] = plan.id;
    }
    const _planLogDates = {};
    for (const l of logs) {
        const pid = _exIdToPlan[l.exercise_id];
        if (!pid) continue;
        if (!_planLogDates[pid]) _planLogDates[pid] = [];
        _planLogDates[pid].push(l.log_date);
    }

    let html = '<h4 class="schede-section-title">Schede assegnate</h4>';
    if (plans.length === 0) {
        html += '<div class="empty-slot">Nessuna scheda assegnata a questo cliente.</div>';
        container.innerHTML = html;
        return;
    }
    for (const plan of plans) {
        const badge = plan.active ? '<span class="schede-badge-active">Attiva</span>' : '<span class="schede-badge-inactive">Inattiva</span>';
        const exCount = (plan.workout_exercises || []).length;
        const planDates = _planLogDates[plan.id];
        const dateRange = planDates?.length
            ? _fmtDate(planDates[0]) + ' → ' + _fmtDate(planDates[planDates.length - 1])
            : '';
        html += `<div class="schede-plan-card" style="margin-bottom:0.4rem;">
            <div class="schede-plan-card-header">
                <div class="schede-plan-card-info">
                    <div class="schede-plan-name">${_escHtml(plan.name)} ${badge}</div>
                    <div class="schede-plan-meta">${exCount} esercizi${dateRange ? ' &middot; ' + dateRange : ''}</div>
                </div>
                <div class="schede-plan-actions">
                    <button onclick="_schedeSaveAsTemplate('${plan.id}', '${_escHtml(plan.name).replace(/'/g, "\\'")}')" title="Salva come template">📋</button>
                    <button onclick="_schedeEditPlan('${plan.id}')" title="Modifica">✏️</button>
                    <button onclick="_schedeDeletePlanFromDetail('${plan.id}')" title="Elimina">🗑️</button>
                </div>
            </div>
        </div>`;
    }
    container.innerHTML = html;
}

// ── Tab Progressi ────────────────────────────────────────────────────────────
async function _schedeClientRenderProgressi(container, userId, plans) {
    container.innerHTML = '<div class="schede-loading">Caricamento progressi...</div>';
    const logs = await _schedeClientDetailLoadLogs(userId, plans);

    if (logs === null) {
        container.innerHTML = '<div class="empty-slot">Errore caricamento log. Riprova.</div>';
        return;
    }
    if (!logs.length) {
        container.innerHTML = '<div class="empty-slot">Nessun log registrato da questo cliente.</div>';
        return;
    }

    const allExercises = plans.flatMap(p => p.workout_exercises || []);
    const idToName = {};
    const nameToMuscle = {};
    for (const ex of allExercises) {
        idToName[ex.id] = ex.exercise_name;
        if (ex.muscle_group && !nameToMuscle[ex.exercise_name]) nameToMuscle[ex.exercise_name] = ex.muscle_group;
    }

    const logsByName = {};
    for (const l of logs) {
        const name = idToName[l.exercise_id] || 'Sconosciuto';
        if (!logsByName[name]) logsByName[name] = [];
        logsByName[name].push(l);
    }

    const totalSessions = new Set(logs.map(l => l.exercise_id + '|' + l.log_date)).size;
    const totalVolume = logs.reduce((s, l) => s + ((l.weight_done || 0) * (l.reps_done || 0)), 0);
    let html = `<div class="schede-stats-grid">
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

    const exerciseNames = Object.keys(logsByName).sort();
    let chartIdx = 0;
    const pendingCharts = [];
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
        const dbEx = _findExercise(exName);
        const imgUrl = dbEx ? (dbEx.immagine_url_small || dbEx.immagine_url || '') : '';
        const imgHtml = imgUrl
            ? `<img src="${_escHtml(imgUrl)}" alt="${_escHtml(exName)}" loading="lazy">`
            : '<div class="schede-admin-chart-img-placeholder">🏋️</div>';
        html += `<div class="schede-admin-chart-card">
            <div class="schede-admin-chart-img">${imgHtml}</div>
            <div class="schede-admin-chart-main">
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
            </div>
        </div>`;
        pendingCharts.push({ canvasId, labels, values });
    }

    container.innerHTML = html;

    // Draw charts dopo aver scritto il DOM
    for (const { canvasId, labels, values } of pendingCharts) {
        setTimeout(() => {
            const canvas = document.getElementById(canvasId);
            if (canvas) _drawAdminChart(canvas, labels, values);
        }, 50);
    }
}

// ── Tab Report ───────────────────────────────────────────────────────────────
async function _schedeClientRenderReport(container, userId) {
    container.innerHTML = '<div id="schedeReportsSection" class="schede-reports-section"></div>';
    await _schedeRenderReportsSection(userId);
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

    let html = '';

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

    // FAB rotondo "+" in basso a destra: apre _schedeNewPlan(). Posizionato
    // fixed via CSS, sopra al dock/menu mobile (bottom: 84px su <=768px).
    html += `<button class="schede-fab" onclick="_schedeNewPlan()" aria-label="Nuova scheda" title="Nuova scheda">+</button>`;

    container.innerHTML = html;
}

function _fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
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
                <div class="schede-form-row schede-form-cell--client" ${!isNew && !selectedUserId ? 'style="display:none"' : ''}>
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
            <div class="schede-add-btns">
                <button class="schede-add-exercise-btn" onclick="_schedeAddExerciseRow()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Esercizio
                </button>
                <button class="schede-add-ss-btn" onclick="_schedeAddSupersetRow()">
                    <span class="schede-add-ss-icon">SS</span>
                    Super Serie
                </button>
            </div>
        </div>

        <div class="schede-editor-actions">
            <button class="btn-primary schede-save-btn" onclick="_schedeSavePlan()">💾 Salva Scheda</button>
        </div>
    </div>`;

    container.innerHTML = html;

    // Applica prefill di una nuova scheda creata da "Actual → Aggiungi"
    if (isNew && _schedePendingNewPlanPrefill) {
        const pref = _schedePendingNewPlanPrefill;
        _schedePendingNewPlanPrefill = null;
        const nameInput = container.querySelector('#schedePlanName');
        if (nameInput) nameInput.value = pref.planName || '';
        const clientInput = container.querySelector('#schedeClientSearch');
        if (clientInput) {
            clientInput.value = pref.clientName || '';
            if (pref.userId) clientInput.dataset.userId = pref.userId;
        }
    }
}

function _renderExercisesForDay() {
    const exercises = _editingPlan?.workout_exercises?.filter(e => e.day_label === _editActiveDay) || [];

    if (exercises.length === 0 && _editingPlan) {
        return '<div class="empty-slot">Nessun esercizio per questo giorno. Clicca "+ Aggiungi esercizio".</div>';
    }
    if (exercises.length === 0) {
        return '<div class="empty-slot">Salva la scheda, poi aggiungi esercizi.</div>';
    }

    // Build superset group map
    const ssRendered = new Set();
    const ssMap = {};
    for (const ex of exercises) {
        if (ex.superset_group) {
            if (!ssMap[ex.superset_group]) ssMap[ex.superset_group] = [];
            ssMap[ex.superset_group].push(ex);
        }
    }

    // Build logical "blocks" list: each block is either a single exercise or
    // a whole super serie group. Up/Down arrows move exercises at block level
    // (a normal exercise hops OVER a full SS block, not one member at a time).
    const blocks = _schedeBuildDayBlocks(exercises);
    const totalBlocks = blocks.length;

    let html = '';
    exercises.forEach((ex) => {
        // ── Superset block ──────────────────────────────────────
        if (ex.superset_group && !ssRendered.has(ex.superset_group)) {
            ssRendered.add(ex.superset_group);
            const pair = ssMap[ex.superset_group] || [ex];
            const bIdx = blocks.findIndex(b => b.type === 'superset' && b.groupId === ex.superset_group);
            const ssUp = bIdx > 0;
            const ssDown = bIdx >= 0 && bIdx < totalBlocks - 1;
            html += `<div class="schede-ss-block">
                <span class="schede-ss-badge">SUPER SERIE</span>
                <div class="schede-ss-move">
                    ${ssUp ? `<button onclick="_schedeMoveSuperset('${ex.superset_group}', -1)" title="Su">▲</button>` : ''}
                    ${ssDown ? `<button onclick="_schedeMoveSuperset('${ex.superset_group}', 1)" title="Giù">▼</button>` : ''}
                </div>
                <button class="schede-ss-delete" onclick="_schedeDeleteSuperset('${ex.superset_group}')" title="Elimina super serie">✕ SS</button>`;
            pair.forEach(ssEx => {
                const dbEx = _findExerciseForCard(ssEx);
                const catLabel = dbEx ? dbEx.categoria : (ssEx.muscle_group || '');
                const _isCardio = (ssEx.muscle_group || '').toLowerCase() === 'cardio';
                html += `
                <div class="schede-exercise-row" data-ex-id="${ssEx.id}">
                    <div class="schede-ex-drag"></div>
                    <div class="schede-ex-fields">
                        <div class="schede-ex-top-row">
                            ${catLabel ? `<span class="schede-ex-muscle-badge">${_escHtml(catLabel)}</span>` : ''}
                            ${_buildExercisePicker(ssEx.exercise_name, ssEx.id, ssEx.muscle_group, ssEx.exercise_slug)}
                        </div>
                        <div class="schede-ex-params">
                            ${_isCardio ? `
                            <label>Min<input type="text" value="${_escHtml(ssEx.reps)}" placeholder="20" onchange="_schedeUpdateExField('${ssEx.id}','reps',this.value)"></label>
                            ` : `
                            <label>Serie<input type="number" min="1" max="20" value="${ssEx.sets}" onchange="_schedeUpdateExField('${ssEx.id}','sets',+this.value)"></label>
                            <label>Reps<input type="text" value="${_escHtml(ssEx.reps)}" placeholder="10" onchange="_schedeUpdateExField('${ssEx.id}','reps',this.value)"></label>
                            <label>Kg<input type="number" step="0.5" min="0" value="${ssEx.weight_kg ?? ''}" placeholder="\u2014" onchange="_schedeUpdateExField('${ssEx.id}','weight_kg',this.value?+this.value:null)"></label>
                            <label>Rec.<input type="number" min="0" step="15" value="${ssEx.rest_seconds ?? 0}" onchange="_schedeUpdateExField('${ssEx.id}','rest_seconds',+this.value)"></label>
                            `}
                        </div>
                        <input type="text" class="schede-ex-notes" value="${_escHtml(ssEx.notes || '')}" placeholder="Note esercizio..."
                               onchange="_schedeUpdateExField('${ssEx.id}','notes',this.value)">
                    </div>
                </div>`;
            });
            html += '</div>';
            return;
        }
        // Skip second exercise in superset
        if (ex.superset_group && ssRendered.has(ex.superset_group)) return;

        // ── Normal exercise row ─────────────────────────────────
        const dbEx = _findExerciseForCard(ex);
        const catLabel = dbEx ? dbEx.categoria : (ex.muscle_group || '');
        const _isCardio = (ex.muscle_group || '').toLowerCase() === 'cardio';
        const bIdxN = blocks.findIndex(b => b.type === 'single' && b.ids[0] === ex.id);
        const nUp = bIdxN > 0;
        const nDown = bIdxN >= 0 && bIdxN < totalBlocks - 1;
        html += `
        <div class="schede-exercise-row" data-ex-id="${ex.id}">
            <div class="schede-ex-drag">
                ${nUp ? `<button onclick="_schedeMoveExercise('${ex.id}', -1)" title="Su">▲</button>` : '<span></span>'}
                ${nDown ? `<button onclick="_schedeMoveExercise('${ex.id}', 1)" title="Gi\u00f9">▼</button>` : '<span></span>'}
            </div>
            <div class="schede-ex-fields">
                <div class="schede-ex-top-row">
                    ${catLabel ? `<span class="schede-ex-muscle-badge">${_escHtml(catLabel)}</span>` : ''}
                    ${_buildExercisePicker(ex.exercise_name, ex.id, ex.muscle_group, ex.exercise_slug)}
                </div>
                <div class="schede-ex-params">
                    ${_isCardio ? `
                    <label>Min<input type="text" value="${_escHtml(ex.reps)}" placeholder="20" onchange="_schedeUpdateExField('${ex.id}','reps',this.value)"></label>
                    ` : `
                    <label>Serie<input type="number" min="1" max="20" value="${ex.sets}" onchange="_schedeUpdateExField('${ex.id}','sets',+this.value)"></label>
                    <label>Reps<input type="text" value="${_escHtml(ex.reps)}" placeholder="10" onchange="_schedeUpdateExField('${ex.id}','reps',this.value)"></label>
                    <label>Kg<input type="number" step="0.5" min="0" value="${ex.weight_kg ?? ''}" placeholder="\u2014" onchange="_schedeUpdateExField('${ex.id}','weight_kg',this.value?+this.value:null)"></label>
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
// Riallinea _editingPlan con la cache corrente: syncFromSupabase (background
// o realtime) sostituisce WorkoutPlanStorage._cache con nuovi oggetti, mentre
// i CRUD mutano la cache fresca via getPlanById. Senza rebind, _editingPlan
// resta un riferimento detached e l'editor renderizza (o mutea) dati stantii.
function _schedeSyncEditingPlan() {
    if (_currentPlanId) {
        const fresh = WorkoutPlanStorage.getPlanById(_currentPlanId);
        if (fresh) _editingPlan = fresh;
    }
}

function _schedeRefreshEditor() {
    _schedeSyncEditingPlan();
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
    _schedeSyncEditingPlan();
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
    _schedeSyncEditingPlan();
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

async function _schedeAddSupersetRow() {
    if (!_editingPlan) {
        await _schedeSavePlan();
        if (!_editingPlan) return;
    }
    try {
        await WorkoutPlanStorage.addSuperset(_editingPlan.id, {
            day_label: _editActiveDay,
            exercise_name: 'Esercizio 1',
            sets: 3, reps: '10',
        }, {
            day_label: _editActiveDay,
            exercise_name: 'Esercizio 2',
            sets: 3, reps: '10',
            rest_seconds: 90,
        });
        _schedeRefreshEditor();
        if (typeof showToast === 'function') showToast('Super Serie aggiunta!', 'success');
    } catch (e) {
        console.error('[Schede] addSuperset error:', e);
        if (typeof showToast === 'function') showToast('Errore aggiunta super serie', 'error');
    }
}

async function _schedeDeleteSuperset(groupId) {
    _schedeSyncEditingPlan();
    if (!_editingPlan) return;
    const toDelete = (_editingPlan.workout_exercises || []).filter(e => e.superset_group === groupId);
    try {
        for (const ex of toDelete) {
            await WorkoutPlanStorage.deleteExercise(ex.id);
        }
        _schedeRefreshEditor();
    } catch (e) {
        if (typeof showToast === 'function') showToast('Errore eliminazione super serie', 'error');
    }
}

// Groups a day's exercises into "blocks": a single exercise or an entire
// super serie. Block ordering follows the first occurrence of each group
// in sort_order. Used by the block-level move arrows.
function _schedeBuildDayBlocks(dayExercises) {
    const blocks = [];
    const seen = new Set();
    for (const ex of dayExercises) {
        if (ex.superset_group) {
            if (seen.has(ex.superset_group)) continue;
            seen.add(ex.superset_group);
            const members = dayExercises.filter(e => e.superset_group === ex.superset_group);
            blocks.push({ type: 'superset', groupId: ex.superset_group, ids: members.map(m => m.id) });
        } else {
            blocks.push({ type: 'single', ids: [ex.id] });
        }
    }
    return blocks;
}

async function _schedeMoveSuperset(groupId, direction) {
    _schedeSyncEditingPlan();
    if (!_editingPlan) return;
    const dayExercises = (_editingPlan.workout_exercises || []).filter(e => e.day_label === _editActiveDay);
    const blocks = _schedeBuildDayBlocks(dayExercises);
    const idx = blocks.findIndex(b => b.type === 'superset' && b.groupId === groupId);
    if (idx < 0) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= blocks.length) return;
    [blocks[idx], blocks[newIdx]] = [blocks[newIdx], blocks[idx]];
    const orderedIds = blocks.flatMap(b => b.ids);
    try {
        await WorkoutPlanStorage.reorderExercises(_editingPlan.id, orderedIds);
        _schedeRefreshEditor();
    } catch (_) {}
}

async function _schedeMoveExercise(exId, direction) {
    _schedeSyncEditingPlan();
    if (!_editingPlan) return;
    const dayExercises = (_editingPlan.workout_exercises || []).filter(e => e.day_label === _editActiveDay);
    const blocks = _schedeBuildDayBlocks(dayExercises);
    const idx = blocks.findIndex(b => b.type === 'single' && b.ids[0] === exId);
    if (idx < 0) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= blocks.length) return;
    [blocks[idx], blocks[newIdx]] = [blocks[newIdx], blocks[idx]];
    const orderedIds = blocks.flatMap(b => b.ids);
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

    const active = document.getElementById('schedePlanActive')?.checked ?? true;
    const notes = document.getElementById('schedePlanNotes')?.value?.trim() || null;

    try {
        if (_editingPlan) {
            await WorkoutPlanStorage.updatePlan(_editingPlan.id, {
                user_id: userId, name: planName,
                active, notes,
            });
            if (typeof showToast === 'function') showToast('Scheda aggiornata', 'success');
        } else {
            const newPlan = await WorkoutPlanStorage.createPlan({
                user_id: userId, name: planName, notes,
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
    if (_schedeSection === 'clienti' && _schedeClientUserId) {
        _schedeView = 'client-detail';
    } else {
        _schedeView = _schedeSection === 'clienti' ? 'clients' : 'list';
    }
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

                const _dbExProg = _findExerciseForCard(ex);
                html += `
                <div class="schede-progress-exercise">
                    <div class="schede-progress-ex-header">
                        <strong>${_escHtml(_dbExProg ? _dbExProg.nome_it : ex.exercise_name)}</strong>
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
