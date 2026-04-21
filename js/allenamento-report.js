// Modulo "Report AI" per allenamento.html — lato cliente.
// Gestisce: lista report storici, generazione self-service, opt-in GDPR, modal lettura.
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

function _lockBodyScroll() {
    document.body.classList.add('all-modal-open');
}

function _unlockBodyScrollIfNoModals() {
    // Rimuovi la classe solo se non ci sono più modal aperti (modal multipli overlappati)
    if (!document.querySelector('.all-modal-overlay')) {
        document.body.classList.remove('all-modal-open');
    }
}

// ═════════════════════════════════════════════════════════════════════
// HELPER: calcolo mese, formattazione
// ═════════════════════════════════════════════════════════════════════

function _getAvailableMonthForGeneration() {
    // ⚠️ TEMPORANEAMENTE: restituisce il mese CORRENTE per permettere test su Aprile.
    // RIATTIVARE comportamento "mese precedente" prima del rilascio in produzione,
    // e riattivare anche il controllo corrispondente nell'Edge Function.
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// Limite massimo di rigenerazioni per (utente, mese). Deve coincidere con il
// valore nell'Edge Function.
const MAX_GENERATIONS_PER_MONTH = 3;

function _formatYearMonth(ym) {
    if (!ym) return '';
    const [y, m] = ym.split('-');
    const months = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
                    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
    const idx = parseInt(m, 10) - 1;
    return `${months[idx] || m} ${y}`;
}

function _formatTone(tone) {
    return { serious: 'Serio', motivational: 'Motivazionale', ironic: 'Ironico' }[tone] || tone;
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
    // Prima scappo HTML potenzialmente pericoloso
    let html = _escapeHtml(md);

    // Headers
    html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');

    // Bold (**testo**)
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Italic (*testo*) — escluso **
    html = html.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');

    // Paragrafi: separo su doppio newline, wrappo in <p> (tranne headers)
    html = html.split(/\n{2,}/).map(block => {
        const trimmed = block.trim();
        if (!trimmed) return '';
        if (/^<h[2-4]>/.test(trimmed)) return trimmed;
        return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
    }).filter(Boolean).join('\n');

    return html;
}

// ═════════════════════════════════════════════════════════════════════
// FETCH REPORT STORICI (RLS filtra per user_id=auth.uid())
// ═════════════════════════════════════════════════════════════════════

async function _fetchReports() {
    if (_reportLoading) return _reportCache || [];
    _reportLoading = true;
    try {
        if (typeof supabaseClient === 'undefined') return [];
        // Filtro ESPLICITO per user_id: questa vista è per il cliente ("i MIEI report").
        // Non ci affidiamo solo alla RLS perché se l'utente è admin la policy
        // monthly_reports_admin_all gli mostrerebbe TUTTI i report di tutti gli utenti.
        const { data: authRes } = await supabaseClient.auth.getUser();
        const userId = authRes?.user?.id;
        if (!userId) { _reportCache = []; return _reportCache; }

        const { data, error } = await supabaseClient
            .from('monthly_reports')
            .select('id, user_id, year_month, tone, narrative, scorecard, cost_usd, generated_at, model_used, status')
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

    // Carica report in parallelo al profilo
    const [reports, profileRes] = await Promise.all([
        _fetchReports(),
        supabaseClient.from('profiles')
            .select('report_ai_consent, report_tone_preference')
            .eq('id', user.id)
            .maybeSingle(),
    ]);

    const availableMonth = _getAvailableMonthForGeneration();
    const availableMonthLabel = _formatYearMonth(availableMonth);
    const availableMonthReports = reports.filter(r => r.year_month === availableMonth);
    const alreadyGenerated = availableMonthReports.length > 0;

    let html = '<div class="all-report-section">';

    // Header
    html += `
        <div class="all-report-header">
            <h2 class="all-report-title">📊 I tuoi Report Mensili</h2>
            <p class="all-report-subtitle">Un riassunto AI basato sui tuoi dati di allenamento e presenza.</p>
        </div>
    `;

    // CTA generazione
    if (!alreadyGenerated) {
        html += `
            <div class="all-report-cta">
                <div class="all-report-cta-icon">✨</div>
                <div class="all-report-cta-body">
                    <div class="all-report-cta-title">Report di ${availableMonthLabel} disponibile</div>
                    <div class="all-report-cta-desc">Genera il tuo report AI personalizzato basato sulle tue sessioni di allenamento.</div>
                    <button class="all-report-cta-btn" onclick="openGenerateReport('${availableMonth}')">Genera ora</button>
                </div>
            </div>
        `;
    } else {
        const count = availableMonthReports.length;
        const remaining = MAX_GENERATIONS_PER_MONTH - count;
        html += `
            <div class="all-report-cta all-report-cta--done">
                <div class="all-report-cta-icon">✅</div>
                <div class="all-report-cta-body">
                    <div class="all-report-cta-title">Report di ${availableMonthLabel} generato (${count}/${MAX_GENERATIONS_PER_MONTH})</div>
                    <div class="all-report-cta-desc">${remaining > 0
                        ? `Puoi rigenerarlo ${remaining} volte in più aprendo un report e scegliendo un altro tono.`
                        : 'Hai raggiunto il limite di generazioni per questo mese.'}</div>
                </div>
            </div>
        `;
    }

    // Lista
    html += '<div class="all-report-list">';
    if (reports.length === 0) {
        html += `
            <div class="all-empty-state">
                <p>Non hai ancora report generati. Appena finisce un mese, tornerai qui per generare il tuo primo.</p>
            </div>
        `;
    } else {
        html += '<h3 class="all-report-list-title">Archivio</h3>';
        reports.forEach(r => {
            const stripped = (r.narrative || '').replace(/[#*`]/g, '').replace(/\n+/g, ' ').trim();
            const preview = stripped.length > 140 ? stripped.substring(0, 140) + '...' : stripped;
            const dateStr = r.generated_at ? new Date(r.generated_at).toLocaleDateString('it-IT') : '';
            html += `
                <div class="all-report-card" onclick="openReportDetail('${r.id}')" role="button" tabindex="0">
                    <div class="all-report-card-header">
                        <div class="all-report-card-month">${_formatYearMonth(r.year_month)}</div>
                        <div class="all-report-card-tone">${_formatTone(r.tone)}</div>
                    </div>
                    <div class="all-report-card-preview">${_escapeHtml(preview)}</div>
                    <div class="all-report-card-footer">Generato il ${dateStr}</div>
                </div>
            `;
        });
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

    // Conta quante generazioni esistono già per questo (user, year_month)
    const monthCount = (_reportCache || []).filter(r => r.year_month === report.year_month).length;
    const remaining = MAX_GENERATIONS_PER_MONTH - monthCount;

    // Bottoni "Rigenera in [altro tono]" per i toni diversi da quello corrente
    const allTones = [
        { value: 'serious',      label: 'Serio',        icon: '🎯' },
        { value: 'motivational', label: 'Motivazionale', icon: '💪' },
        { value: 'ironic',       label: 'Ironico',      icon: '😏' },
    ];
    const otherTones = allTones.filter(t => t.value !== report.tone);

    let regenHtml = '';
    if (remaining > 0) {
        regenHtml = `
            <div class="all-report-regen-section">
                <div class="all-report-regen-title">Rigenera in un altro tono (${remaining} rimaste)</div>
                <div class="all-report-regen-buttons">
                    ${otherTones.map(t => `
                        <button class="all-report-regen-btn" onclick="_regenerateInTone('${report.year_month}', '${t.value}')">
                            <span>${t.icon}</span>
                            <span>${t.label}</span>
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
    } else {
        regenHtml = `
            <div class="all-report-regen-section all-report-regen-section--limit">
                <div class="all-report-regen-limit">
                    ⚠️ Hai raggiunto il limite di ${MAX_GENERATIONS_PER_MONTH} generazioni per questo mese.
                </div>
            </div>
        `;
    }

    const modalHtml = `
        <div class="all-modal-overlay all-report-modal" id="reportModalOverlay" onclick="if(event.target===this) closeReportModal()">
            <div class="all-modal-box all-report-modal-box">
                <button class="all-modal-close" onclick="closeReportModal()" aria-label="Chiudi">&times;</button>
                <div class="all-report-modal-meta">
                    <span class="all-report-modal-month">${_formatYearMonth(report.year_month)}</span>
                    <span class="all-report-modal-tone">${_formatTone(report.tone)}</span>
                </div>
                <div class="all-report-modal-body">${bodyHtml}</div>
                ${regenHtml}
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

// Helper: rigenera il report dello stesso mese ma con tono diverso.
// Chiude il modal corrente e lancia _startGeneration con force_regenerate.
async function _regenerateInTone(yearMonth, tone) {
    closeReportModal();
    _startGenerationInternal(yearMonth, tone, /* force */ true);
}

function closeReportModal() {
    document.getElementById('reportModalOverlay')?.remove();
    _unlockBodyScrollIfNoModals();
}

// ═════════════════════════════════════════════════════════════════════
// FLUSSO: GENERAZIONE NUOVO REPORT
// 1. Check consenso GDPR → se manca, chiedi opt-in
// 2. Show tone selector
// 3. Chiama Edge Function
// 4. Ricarica lista + apri dettaglio nuovo report
// ═════════════════════════════════════════════════════════════════════

async function openGenerateReport(yearMonth) {
    const { data: authRes } = await supabaseClient.auth.getUser();
    const user = authRes?.user;
    if (!user) { alert('Non sei loggato'); return; }

    const { data: profile } = await supabaseClient.from('profiles')
        .select('report_ai_consent, report_tone_preference')
        .eq('id', user.id)
        .maybeSingle();

    if (!profile) { alert('Profilo non trovato'); return; }

    const currentTone = profile.report_tone_preference || 'motivational';

    if (!profile.report_ai_consent) {
        _showConsentModal(yearMonth, currentTone);
        return;
    }

    _showToneSelectModal(yearMonth, currentTone);
}

// ── Modal consenso GDPR ──
function _showConsentModal(yearMonth, currentTone) {
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
                    <button class="all-modal-btn" onclick="_acceptConsentAndContinue('${yearMonth}', '${currentTone}')">Accetta e continua</button>
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

async function _acceptConsentAndContinue(yearMonth, currentTone) {
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
    _showToneSelectModal(yearMonth, currentTone);
}

// ── Modal selezione tono + conferma ──
function _showToneSelectModal(yearMonth, currentTone) {
    const monthLabel = _formatYearMonth(yearMonth);
    const radio = (value, title, desc, icon) => `
        <label class="all-tone-option">
            <input type="radio" name="reportTone" value="${value}" ${currentTone === value ? 'checked' : ''}>
            <div class="all-tone-option-body">
                <div class="all-tone-title">${icon} ${title}</div>
                <div class="all-tone-desc">${desc}</div>
            </div>
        </label>
    `;

    const modalHtml = `
        <div class="all-modal-overlay" id="toneModalOverlay" onclick="if(event.target===this) closeToneModal()">
            <div class="all-modal-box all-report-tone-box">
                <button class="all-modal-close" onclick="closeToneModal()" aria-label="Chiudi">&times;</button>
                <h3 class="all-modal-title">Genera Report ${monthLabel}</h3>
                <p class="all-report-tone-intro">Scegli il tono del tuo report:</p>
                <div class="all-tone-options">
                    ${radio('serious', 'Serio', 'Analitico, professionale, misurato', '🎯')}
                    ${radio('motivational', 'Motivazionale', 'Caloroso, orientato al risultato', '💪')}
                    ${radio('ironic', 'Ironico', 'Umorismo dry e self-aware', '😏')}
                </div>
                <div class="all-modal-actions">
                    <button class="all-modal-btn all-modal-btn--secondary" onclick="closeToneModal()">Annulla</button>
                    <button class="all-modal-btn" onclick="_startGeneration('${yearMonth}')">Genera</button>
                </div>
                <p class="all-report-tone-hint">La generazione richiede 5-10 secondi.</p>
            </div>
        </div>
    `;

    document.getElementById('toneModalOverlay')?.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    _lockBodyScroll();
    requestAnimationFrame(() => {
        document.getElementById('toneModalOverlay')?.classList.add('visible');
    });
}

function closeToneModal() {
    document.getElementById('toneModalOverlay')?.remove();
    _unlockBodyScrollIfNoModals();
}

// ── Chiamata Edge Function (entry point dal modal tone selection) ──
async function _startGeneration(yearMonth) {
    const selected = document.querySelector('input[name="reportTone"]:checked');
    const tone = selected ? selected.value : 'motivational';
    closeToneModal();
    _startGenerationInternal(yearMonth, tone, /* force */ false);
}

// ── Chiamata Edge Function interna (usata anche da _regenerateInTone) ──
async function _startGenerationInternal(yearMonth, tone, force) {
    // Loading overlay
    const loadingHtml = `
        <div class="all-modal-overlay" id="generatingOverlay">
            <div class="all-modal-box all-report-loading-box">
                <div class="all-report-loading-spinner"></div>
                <h3 class="all-report-loading-title">${force ? 'Rigenerazione' : 'Generazione'} in corso...</h3>
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
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) throw new Error('Sessione scaduta, ricarica la pagina');

        const res = await fetch(REPORT_FN_URL, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + session.access_token,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                user_id: session.user.id,
                year_month: yearMonth,
                tone: tone,
                force_regenerate: !!force,
            }),
        });

        const data = await res.json();
        document.getElementById('generatingOverlay')?.remove();
        _unlockBodyScrollIfNoModals();

        if (!res.ok || !data.success) {
            if (data.code === 'REGEN_LIMIT_REACHED') {
                alert(`Hai raggiunto il limite di ${data.limit} generazioni per questo mese. Non puoi rigenerare ulteriormente.`);
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
