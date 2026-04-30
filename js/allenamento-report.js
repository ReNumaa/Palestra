// Modulo "Report AI" per allenamento.html — lato cliente.
// Gestisce: lista report storici, generazione self-service per OBIETTIVO,
// opt-in GDPR, modal lettura.
// Dipende da supabaseClient (definito in supabase-client.js).

// ═════════════════════════════════════════════════════════════════════
// STATO E CACHE
// ═════════════════════════════════════════════════════════════════════

let _reportCache = null;        // array di report caricati dal DB
let _reportLoading = false;

const REPORT_FN_URL = 'https://ppymuuyoveyyoswcimck.supabase.co/functions/v1/generate-monthly-report';

// ═════════════════════════════════════════════════════════════════════
// HELPER: scroll lock del body quando un modal è aperto
// Evita che la pagina sotto al modal scrolli quando l'utente fa swipe.
// ═════════════════════════════════════════════════════════════════════

const _REPORT_MODAL_IDS = [
    'reportModalOverlay',
    'consentModalOverlay',
    'generatingOverlay',
];

function _lockBodyScroll() {
    document.body.classList.add('all-modal-open');
}

function _unlockBodyScrollIfNoModals() {
    const stillOpen = _REPORT_MODAL_IDS.some(id => document.getElementById(id));
    if (!stillOpen) {
        document.body.classList.remove('all-modal-open');
    }
}

// ═════════════════════════════════════════════════════════════════════
// HELPER: calcolo mese, formattazione
// ═════════════════════════════════════════════════════════════════════

function _getAvailableMonthForGeneration() {
    // Il report di un mese diventa generabile dal 1° del mese successivo:
    // si restituisce sempre il mese precedente a oggi (TZ locale).
    // La regola è applicata anche lato server (Edge Function).
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
}

const MAX_GENERATIONS_PER_MONTH = 3;

function _formatYearMonth(ym) {
    if (!ym) return '';
    const [y, m] = ym.split('-');
    const months = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
                    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
    const idx = parseInt(m, 10) - 1;
    return `${months[idx] || m} ${y}`;
}

function _escapeHtml(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ═════════════════════════════════════════════════════════════════════
// MARKDOWN → HTML (minimale e safe)
// Supporta: # ## ### headers, **bold**, *italic*, paragrafi
// ═════════════════════════════════════════════════════════════════════

function _markdownToHtml(md) {
    if (!md) return '';
    let html = _escapeHtml(md);

    html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');

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

// ═════════════════════════════════════════════════════════════════════
// OBIETTIVI — definizione canonica dei 6 obiettivi selezionabili.
// Deve essere allineata ai valori accettati dall'Edge Function e dal
// CHECK del DB (vedi 20260430000000_monthly_reports_goal.sql).
// ═════════════════════════════════════════════════════════════════════

const _GOALS = [
    { value: 'dimagrimento',  label: 'Dimagrimento',     icon: '🔥', desc: 'Riduci la massa grassa' },
    { value: 'massa',         label: 'Aumento Massa',    icon: '💪', desc: 'Cresci muscolarmente' },
    { value: 'tonificazione', label: 'Tonificazione',    icon: '✨', desc: 'Ricomposizione corporea' },
    { value: 'forza',         label: 'Forza',            icon: '🏋️', desc: 'Aumenta i carichi' },
    { value: 'salute',        label: 'Salute',           icon: '❤️', desc: 'Benessere e abitudine' },
    { value: 'recupero',      label: 'Recupero',         icon: '🧘', desc: 'Postura e funzionalità' },
];

function _formatGoal(goalId) {
    const g = _GOALS.find(x => x.value === goalId);
    return g ? `${g.icon} ${g.label}` : (goalId || '—');
}

// ═════════════════════════════════════════════════════════════════════
// FETCH REPORT STORICI (RLS filtra per user_id=auth.uid())
// ═════════════════════════════════════════════════════════════════════

async function _fetchReports() {
    if (_reportLoading) return _reportCache || [];
    _reportLoading = true;
    try {
        if (typeof supabaseClient === 'undefined') return [];
        // Filtro ESPLICITO per user_id: questa vista è per il cliente.
        // Non ci affidiamo solo alla RLS perché se l'utente è admin la policy
        // monthly_reports_admin_all gli mostrerebbe TUTTI i report di tutti
        // gli utenti.
        const { data: authRes } = await supabaseClient.auth.getUser();
        const userId = authRes?.user?.id;
        if (!userId) { _reportCache = []; return _reportCache; }

        const { data, error } = await supabaseClient
            .from('monthly_reports')
            .select('id, user_id, year_month, goal, tone, narrative, scorecard, cost_usd, generated_at, model_used, status')
            .eq('user_id', userId)
            .eq('status', 'generated')
            .order('year_month', { ascending: false });
        if (error) {
            console.error('[Report] fetch error:', error.message);
            return [];
        }
        _reportCache = data || [];
        return _reportCache;
    } finally {
        _reportLoading = false;
    }
}

// ═════════════════════════════════════════════════════════════════════
// RENDER VISTA PRINCIPALE (tab "Report")
// ═════════════════════════════════════════════════════════════════════

async function renderReport() {
    const container = document.getElementById('allContent');
    if (!container) return;

    container.innerHTML = '<div class="all-loading" role="status">Caricamento report...</div>';

    // Auth check
    const { data: authRes } = await supabaseClient.auth.getUser();
    const user = authRes?.user;
    if (!user) {
        container.innerHTML = '<div class="all-empty-state"><p>Devi essere loggato per vedere i report.</p></div>';
        return;
    }

    const reports = await _fetchReports();
    const availableMonth = _getAvailableMonthForGeneration();
    const availableMonthLabel = _formatYearMonth(availableMonth);
    const availableMonthReports = reports.filter(r => r.year_month === availableMonth);

    // Quali obiettivi sono già stati generati per il mese disponibile
    const goalsGenerated = new Set(availableMonthReports.map(r => r.goal).filter(Boolean));
    // Limite totale di generazioni per mese (indipendente dal goal: 1 ufficiale
    // + max 2 cambi di idea).
    const reachedRegenLimit = availableMonthReports.length >= MAX_GENERATIONS_PER_MONTH;

    // Raggruppa tutti i report per mese (per la lista archivio)
    const reportsByMonth = reports.reduce((acc, r) => {
        (acc[r.year_month] = acc[r.year_month] || []).push(r);
        return acc;
    }, {});
    const sortedMonths = Object.keys(reportsByMonth).sort().reverse();

    let html = '<div class="all-report-section">';

    // Header
    html += `
        <div class="all-report-header">
            <h2 class="all-report-title">📊 I tuoi Report Mensili</h2>
        </div>
    `;

    // CTA: 6 card obiettivo (3x2). Click → genera il report di quel mese
    // sull'obiettivo scelto. Se l'obiettivo è già stato generato per quel
    // mese, la card è in stato "fatto" (cliccabile per riaprire).
    html += `
        <div class="all-report-generate-card">
            <div class="all-report-generate-title">Genera il report di ${availableMonthLabel}</div>
            <div class="all-report-generate-desc">Scegli l'obiettivo del mese: il report verrà costruito intorno a quello.</div>
            <div class="all-report-goal-grid">
                ${_GOALS.map(g => {
                    const alreadyGenerated = goalsGenerated.has(g.value);
                    const blockedByLimit = reachedRegenLimit && !alreadyGenerated;
                    const disabled = blockedByLimit;
                    let onclick = '';
                    if (alreadyGenerated) {
                        const existingId = availableMonthReports.find(r => r.goal === g.value)?.id;
                        onclick = existingId ? `openReportDetail('${existingId}')` : '';
                    } else if (!disabled) {
                        onclick = `_generateGoal('${availableMonth}', '${g.value}')`;
                    }
                    const stateClass = alreadyGenerated
                        ? 'all-report-goal-card--done'
                        : (disabled ? 'all-report-goal-card--disabled' : '');
                    return `
                        <button class="all-report-goal-card ${stateClass}"
                                ${disabled ? 'disabled aria-disabled="true"' : ''}
                                onclick="${onclick}">
                            <div class="all-report-goal-card-icon">${g.icon}</div>
                            <div class="all-report-goal-card-label">${g.label}</div>
                            <div class="all-report-goal-card-desc">${alreadyGenerated ? '✓ Generato — apri' : g.desc}</div>
                        </button>
                    `;
                }).join('')}
            </div>
            ${reachedRegenLimit
                ? `<div class="all-report-generate-limit">Hai usato tutte e ${MAX_GENERATIONS_PER_MONTH} le generazioni per ${availableMonthLabel}.</div>`
                : ''}
        </div>
    `;

    // Lista report raggruppata per mese
    html += '<div class="all-report-list">';
    if (reports.length === 0) {
        html += `
            <div class="all-empty-state">
                <p>Non hai ancora report generati. Scegli un obiettivo qui sopra per generare il primo.</p>
            </div>
        `;
    } else {
        html += '<h3 class="all-report-list-title">Archivio</h3>';
        for (const ym of sortedMonths) {
            const monthReports = reportsByMonth[ym];
            const monthLabel = _formatYearMonth(ym);
            html += `<div class="all-report-month-group">
                <div class="all-report-month-group-title">${monthLabel}</div>
                <div class="all-report-month-group-list">`;
            monthReports.sort((a, b) =>
                (new Date(b.generated_at).getTime() || 0) - (new Date(a.generated_at).getTime() || 0)
            );
            for (const r of monthReports) {
                const goalInfo = _GOALS.find(g => g.value === r.goal);
                const dateStr = r.generated_at ? new Date(r.generated_at).toLocaleDateString('it-IT') : '';
                const icon = goalInfo?.icon ?? '📝';
                const label = goalInfo?.label ?? (r.goal || '—');
                html += `
                    <button class="all-report-variant" onclick="openReportDetail('${r.id}')">
                        <span class="all-report-variant-icon">${icon}</span>
                        <span class="all-report-variant-label">${label}</span>
                        <span class="all-report-variant-date">${dateStr}</span>
                        <span class="all-report-variant-arrow">›</span>
                    </button>
                `;
            }
            html += '</div></div>';
        }
    }
    html += '</div>'; // .all-report-list

    html += '</div>'; // .all-report-section

    container.innerHTML = html;
}

// ═════════════════════════════════════════════════════════════════════
// MODAL: DETTAGLIO REPORT
// ═════════════════════════════════════════════════════════════════════

function openReportDetail(reportId) {
    const report = (_reportCache || []).find(r => r.id === reportId);
    if (!report) return;

    const bodyHtml = _markdownToHtml(report.narrative);
    const goalLabel = _formatGoal(report.goal);

    const modalHtml = `
        <div class="all-modal-overlay all-report-modal" id="reportModalOverlay" onclick="if(event.target===this) closeReportModal()">
            <div class="all-modal-box all-report-modal-box">
                <button class="all-modal-close" onclick="closeReportModal()" aria-label="Chiudi">&times;</button>
                <div class="all-report-modal-meta">
                    <span class="all-report-modal-month">${_formatYearMonth(report.year_month)}</span>
                    <span class="all-report-modal-tone">${goalLabel}</span>
                </div>
                <div class="all-report-modal-body">${bodyHtml}</div>
            </div>
        </div>
    `;

    document.getElementById('reportModalOverlay')?.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    _lockBodyScroll();
    requestAnimationFrame(() => {
        document.getElementById('reportModalOverlay')?.classList.add('visible');
    });
}

function closeReportModal() {
    document.getElementById('reportModalOverlay')?.remove();
    _unlockBodyScrollIfNoModals();
}

// ═════════════════════════════════════════════════════════════════════
// FLUSSO: GENERAZIONE NUOVO REPORT
// Entry point chiamato cliccando su una delle 6 card obiettivo.
// 1. Check consenso GDPR → se manca, mostra modal di consenso
// 2. Chiama Edge Function direttamente (force=true: ogni click è esplicito,
//    il rate limit lato server impedisce abusi).
// ═════════════════════════════════════════════════════════════════════

async function _generateGoal(yearMonth, goal) {
    const { data: authRes } = await supabaseClient.auth.getUser();
    const user = authRes?.user;
    if (!user) { alert('Non sei loggato'); return; }

    const { data: profile } = await supabaseClient.from('profiles')
        .select('report_ai_consent')
        .eq('id', user.id)
        .maybeSingle();

    if (!profile) { alert('Profilo non trovato'); return; }

    if (!profile.report_ai_consent) {
        _showConsentModal(yearMonth, goal);
        return;
    }

    _startGenerationInternal(yearMonth, goal, /* force */ true);
}

// ── Modal consenso GDPR ──
function _showConsentModal(yearMonth, currentGoal) {
    const monthLabel = _formatYearMonth(yearMonth);
    const modalHtml = `
        <div class="all-modal-overlay" id="consentModalOverlay" onclick="if(event.target===this) closeConsentModal()">
            <div class="all-modal-box all-report-consent-box">
                <button class="all-modal-close" onclick="closeConsentModal()" aria-label="Chiudi">&times;</button>
                <h3 class="all-modal-title">Consenso al trattamento AI</h3>
                <p class="all-report-consent-intro">
                    Per generare il report di <strong>${monthLabel}</strong>, l'app analizza i tuoi dati tramite intelligenza artificiale.
                </p>
                <div class="all-report-consent-details">
                    <p><strong>Dati analizzati:</strong></p>
                    <ul>
                        <li>Prenotazioni (sessioni completate, cancellate, aderenza)</li>
                        <li>Log di allenamento (esercizi, carichi, ripetizioni)</li>
                    </ul>
                    <p><strong>Provider AI:</strong> Anthropic (Claude). Nessun altro terzo riceve i tuoi dati.</p>
                    <p><strong>Conservazione:</strong> il report resta nel tuo profilo. Puoi cancellarlo o revocare il consenso in qualsiasi momento.</p>
                </div>
                <label class="all-report-consent-checkbox">
                    <input type="checkbox" id="consentCheckbox">
                    <span>Acconsento al trattamento AI dei miei dati per generare i report mensili.</span>
                </label>
                <div class="all-modal-actions">
                    <button class="all-modal-btn all-modal-btn--secondary" onclick="closeConsentModal()">Annulla</button>
                    <button class="all-modal-btn" onclick="_acceptConsentAndContinue('${yearMonth}', '${currentGoal}')">Accetta e continua</button>
                </div>
            </div>
        </div>
    `;

    document.getElementById('consentModalOverlay')?.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    _lockBodyScroll();
    requestAnimationFrame(() => {
        document.getElementById('consentModalOverlay')?.classList.add('visible');
    });
}

function closeConsentModal() {
    document.getElementById('consentModalOverlay')?.remove();
    _unlockBodyScrollIfNoModals();
}

async function _acceptConsentAndContinue(yearMonth, goal) {
    const checkbox = document.getElementById('consentCheckbox');
    if (!checkbox?.checked) {
        alert('Devi spuntare la casella per procedere.');
        return;
    }

    const { error } = await supabaseClient.rpc('set_report_ai_consent', { p_consent: true });
    if (error) {
        alert('Errore nel salvare il consenso: ' + error.message);
        return;
    }

    closeConsentModal();
    _startGenerationInternal(yearMonth, goal, /* force */ true);
}

// ── Chiamata Edge Function interna ──
async function _startGenerationInternal(yearMonth, goal, force) {
    // Loading overlay
    const loadingHtml = `
        <div class="all-modal-overlay" id="generatingOverlay">
            <div class="all-modal-box all-report-loading-box">
                <div class="all-report-loading-spinner"></div>
                <h3 class="all-report-loading-title">Generazione in corso...</h3>
                <p class="all-report-loading-desc">Sto analizzando i tuoi dati e scrivendo il report.</p>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', loadingHtml);
    _lockBodyScroll();
    requestAnimationFrame(() => {
        document.getElementById('generatingOverlay')?.classList.add('visible');
    });

    try {
        // Forza refresh sessione: dopo il passaggio da legacy JWT a publishable
        // key, la sessione cached può avere un access_token "vecchio formato"
        // → la piattaforma Supabase la rifiuta con UNAUTHORIZED_NO_AUTH_HEADER.
        // Il refresh ne emette uno nuovo allineato alla chiave attuale.
        let session = null;
        const sessRes = await supabaseClient.auth.getSession();
        session = sessRes?.data?.session ?? null;
        if (!session?.access_token) {
            const refreshRes = await supabaseClient.auth.refreshSession();
            session = refreshRes?.data?.session ?? null;
        }
        if (!session?.access_token) {
            throw new Error('Sessione non valida. Esci e rientra dall\'app.');
        }

        // Log diagnostico: stampa solo il prefisso del token (debug temporaneo).
        console.log('[Report] sending request', {
            tokenPrefix: session.access_token.slice(0, 12) + '...',
            tokenLen: session.access_token.length,
            apikeyPrefix: (typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY.slice(0, 18) : 'MISSING'),
        });

        // apikey è obbligatoria per la pre-validazione lato Supabase platform
        // davanti alle Edge Functions (anche se Authorization Bearer è già un
        // JWT firmato). Senza questo header alcune configurazioni rispondono
        // 401 PRIMA che la nostra funzione giri (body vuoto o non-JSON).
        // SUPABASE_ANON_KEY è esposta globalmente da supabase-client.js.
        const res = await fetch(REPORT_FN_URL, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + session.access_token,
                'apikey': (typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY : ''),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                user_id: session.user.id,
                year_month: yearMonth,
                goal: goal,
                force_regenerate: !!force,
            }),
        });

        const data = await res.json();
        document.getElementById('generatingOverlay')?.remove();
        _unlockBodyScrollIfNoModals();

        if (!res.ok || !data.success) {
            if (data.code === 'REGEN_LIMIT_REACHED') {
                alert(`Hai raggiunto il limite di ${data.limit} generazioni per questo mese. Non puoi rigenerare ulteriormente.`);
            } else if (data.code === 'MONTH_NOT_YET_AVAILABLE') {
                alert('Il report di questo mese sarà disponibile dal 1° del mese successivo.');
            } else {
                const msg = data.error || `Errore HTTP ${res.status}`;
                alert('Errore nella generazione:\n' + msg);
            }
            return;
        }

        // Ricarica lista e apri dettaglio
        _reportCache = null;
        await renderReport();
        if (data.report_id) {
            setTimeout(() => openReportDetail(data.report_id), 150);
        }
    } catch (e) {
        document.getElementById('generatingOverlay')?.remove();
        _unlockBodyScrollIfNoModals();
        alert('Errore: ' + (e.message || 'richiesta fallita'));
    }
}
