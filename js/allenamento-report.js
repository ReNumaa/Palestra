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
// HELPER: calcolo mese, formattazione
// ═════════════════════════════════════════════════════════════════════

function _getAvailableMonthForGeneration() {
    // Il cliente può generare il mese N-1 (mese precedente già concluso)
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
}

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
        const { data, error } = await supabaseClient
            .from('monthly_reports')
            .select('id, year_month, tone, narrative, scorecard, cost_usd, generated_at, model_used, status')
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
    const alreadyGenerated = reports.some(r => r.year_month === availableMonth);

    let html = '<div class="all-report-section">';

    // Header
    html += `
        <div class="all-report-header">
            <h2 class="all-report-title">📊 I tuoi Report Mensili</h2>
            <p class="all-report-subtitle">Un riassunto AI basato sui tuoi dati di allenamento e presenza. Generato a fine mese.</p>
        </div>
    `;

    // CTA generazione
    if (!alreadyGenerated) {
        html += `
            <div class="all-report-cta">
                <div class="all-report-cta-icon">✨</div>
                <div class="all-report-cta-body">
                    <div class="all-report-cta-title">Report di ${availableMonthLabel} disponibile</div>
                    <div class="all-report-cta-desc">Genera il tuo report AI personalizzato basato sulle tue sessioni del mese scorso.</div>
                    <button class="all-report-cta-btn" onclick="openGenerateReport('${availableMonth}')">Genera ora</button>
                </div>
            </div>
        `;
    } else {
        html += `
            <div class="all-report-cta all-report-cta--done">
                <div class="all-report-cta-icon">✅</div>
                <div class="all-report-cta-body">
                    <div class="all-report-cta-title">Report di ${availableMonthLabel} già generato</div>
                    <div class="all-report-cta-desc">Lo trovi qui sotto nella lista.</div>
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
    const modalHtml = `
        <div class="all-modal-overlay all-report-modal" id="reportModalOverlay" onclick="if(event.target===this) closeReportModal()">
            <div class="all-modal-box all-report-modal-box">
                <button class="all-modal-close" onclick="closeReportModal()" aria-label="Chiudi">&times;</button>
                <div class="all-report-modal-meta">
                    <span class="all-report-modal-month">${_formatYearMonth(report.year_month)}</span>
                    <span class="all-report-modal-tone">${_formatTone(report.tone)}</span>
                </div>
                <div class="all-report-modal-body">${bodyHtml}</div>
            </div>
        </div>
    `;

    document.getElementById('reportModalOverlay')?.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    // Il CSS ha opacity:0 di default — la classe .visible fa partire la transizione
    requestAnimationFrame(() => {
        document.getElementById('reportModalOverlay')?.classList.add('visible');
    });
}

function closeReportModal() {
    document.getElementById('reportModalOverlay')?.remove();
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
                    Per generare il report di <strong>${monthLabel}</strong>, PalestrIA analizza i tuoi dati tramite intelligenza artificiale.
                </p>
                <div class="all-report-consent-details">
                    <p><strong>Dati analizzati:</strong></p>
                    <ul>
                        <li>Prenotazioni (sessioni completate, cancellate, aderenza)</li>
                        <li>Log di allenamento (esercizi, carichi, ripetizioni)</li>
                    </ul>
                    <p><strong>Provider AI:</strong> Anthropic (Claude). Nessun altro terzo riceve i tuoi dati.</p>
                    <p><strong>Conservazione:</strong> il report resta nel tuo profilo PalestrIA. Puoi cancellarlo o revocare il consenso in qualsiasi momento.</p>
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
    requestAnimationFrame(() => {
        document.getElementById('consentModalOverlay')?.classList.add('visible');
    });
}

function closeConsentModal() {
    document.getElementById('consentModalOverlay')?.remove();
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
    requestAnimationFrame(() => {
        document.getElementById('toneModalOverlay')?.classList.add('visible');
    });
}

function closeToneModal() {
    document.getElementById('toneModalOverlay')?.remove();
}

// ── Chiamata Edge Function ──
async function _startGeneration(yearMonth) {
    const selected = document.querySelector('input[name="reportTone"]:checked');
    const tone = selected ? selected.value : 'motivational';

    closeToneModal();

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
            }),
        });

        const data = await res.json();
        document.getElementById('generatingOverlay')?.remove();

        if (!res.ok || !data.success) {
            const msg = data.error || `Errore HTTP ${res.status}`;
            alert('Errore nella generazione:\n' + msg);
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
        alert('Errore: ' + (e.message || 'richiesta fallita'));
    }
}
