// Action buttons
const BACKUP_KEYS = [
    'gym_bookings', 'gym_stats', 'gym_users', 'gym_credits',
    'gym_manual_debts', 'gym_bonus', 'weeklyScheduleTemplate',
    'scheduleOverrides', 'scheduleVersion', 'gym_debt_threshold',
    'gym_cancellation_mode', 'gym_cert_scadenza_editable',
    'gym_cert_block_expired', 'gym_cert_block_not_set',
    'gym_assic_block_expired', 'gym_assic_block_not_set', 'dataClearedByUser',
    'dataLastCleared', 'gym_week_templates', 'gym_active_week_template'
];

// Converte il formato backup Nextcloud/cron (tabelle Supabase raw) nel formato admin
function _convertCronToAdminFormat(cron) {
    const data = {};
    // Bookings: array Supabase → array locale
    if (Array.isArray(cron.bookings)) {
        data['gym_bookings'] = JSON.stringify(cron.bookings.map(b => ({
            id: b.local_id || b.id,
            userId: b.user_id,
            date: b.date,
            time: b.time,
            slotType: b.slot_type,
            name: b.name,
            email: b.email,
            whatsapp: b.whatsapp,
            notes: b.notes || '',
            status: b.status || 'confirmed',
            paid: b.paid || false,
            paymentMethod: b.payment_method || null,
            paidAt: b.paid_at || null,
            creditApplied: b.credit_applied || 0,
            createdAt: b.created_at,
            dateDisplay: b.date_display || '',
            cancellationRequestedAt: b.cancellation_requested_at || null,
            cancelledAt: b.cancelled_at || null,
            cancelledPaymentMethod: b.cancelled_payment_method || null,
            cancelledPaidAt: b.cancelled_paid_at || null,
            cancelledWithBonus: b.cancelled_with_bonus || false,
            cancelledWithPenalty: b.cancelled_with_penalty || false,
            cancelledRefundPct: b.cancelled_refund_pct ?? null,
        })));
    }
    // Credits: array Supabase → oggetto keyed
    if (Array.isArray(cron.credits)) {
        const credits = {};
        for (const c of cron.credits) {
            const key = `${c.whatsapp || ''}||${c.email}`;
            credits[key] = { name: c.name, whatsapp: c.whatsapp || '', email: c.email, balance: c.balance, freeBalance: c.free_balance || 0, history: [] };
        }
        // Unisci credit_history se presente
        if (Array.isArray(cron.credit_history)) {
            const idToKey = {};
            for (const c of cron.credits) idToKey[c.id] = `${c.whatsapp || ''}||${c.email}`;
            for (const h of cron.credit_history) {
                const key = idToKey[h.credit_id];
                if (key && credits[key]) {
                    credits[key].history.push({ date: h.created_at, amount: h.amount, note: h.note || '' });
                }
            }
        }
        data['gym_credits'] = JSON.stringify(credits);
    }
    // Manual debts
    if (Array.isArray(cron.manual_debts)) {
        const debts = {};
        for (const r of cron.manual_debts) {
            const key = `${r.whatsapp || ''}||${r.email}`;
            debts[key] = { name: r.name, whatsapp: r.whatsapp || '', email: r.email, balance: r.balance, history: r.history || [] };
        }
        data['gym_manual_debts'] = JSON.stringify(debts);
    }
    // Bonuses
    if (Array.isArray(cron.bonuses)) {
        const bonuses = {};
        for (const r of cron.bonuses) {
            const key = `${r.whatsapp || ''}||${r.email}`;
            bonuses[key] = { name: r.name, whatsapp: r.whatsapp || '', email: r.email, bonus: r.bonus, lastResetMonth: r.last_reset_month || null };
        }
        data['gym_bonus'] = JSON.stringify(bonuses);
    }
    // Schedule overrides: array → oggetto per data
    if (Array.isArray(cron.schedule_overrides)) {
        const overrides = {};
        for (const r of cron.schedule_overrides) {
            if (!overrides[r.date]) overrides[r.date] = [];
            const slot = { time: r.time, type: r.slot_type };
            if (r.extras?.length) slot.extras = r.extras;
            overrides[r.date].push(slot);
        }
        data['scheduleOverrides'] = JSON.stringify(overrides);
    }
    // Settings: array {key, value} → chiavi localStorage
    if (Array.isArray(cron.settings)) {
        const sMap = Object.fromEntries(cron.settings.map(r => [r.key, r.value]));
        const mapping = {
            'debt_threshold': 'gym_debt_threshold',
            'cancellation_mode': 'gym_cancellation_mode',
            'cert_scadenza_editable': 'gym_cert_scadenza_editable',
            'cert_block_expired': 'gym_cert_block_expired',
            'cert_block_not_set': 'gym_cert_block_not_set',
            'assic_block_expired': 'gym_assic_block_expired',
            'assic_block_not_set': 'gym_assic_block_not_set',
            'week_templates': 'gym_week_templates',
            'active_week_template': 'gym_active_week_template',
        };
        for (const [dbKey, lsKey] of Object.entries(mapping)) {
            if (sMap[dbKey] != null) data[lsKey] = String(sMap[dbKey]);
        }
    }
    // Profiles → gym_users
    if (Array.isArray(cron.profiles)) {
        data['gym_users'] = JSON.stringify(cron.profiles.map(p => ({
            name: p.name, email: p.email, whatsapp: p.whatsapp || '',
            provider: p.provider || 'email', role: p.role || 'user',
            certificatoMedicoScadenza: p.medical_cert_expiry || null,
            medicalCertHistory: p.medical_cert_history || [],
            assicurazioneScadenza: p.insurance_expiry || null,
            insuranceHistory: p.insurance_history || [],
            codiceFiscale: p.codice_fiscale || null,
            indirizzoVia: p.indirizzo_via || null,
            indirizzoPaese: p.indirizzo_paese || null,
            indirizzoCap: p.indirizzo_cap || null,
            documentoFirmato: p.documento_firmato || false,
        })));
    }
    // Tabelle raw per Supabase restore diretto
    if (Array.isArray(cron.credit_history))     data['_credit_history']     = JSON.stringify(cron.credit_history);
    if (Array.isArray(cron.push_subscriptions)) data['_push_subscriptions'] = JSON.stringify(cron.push_subscriptions);
    if (Array.isArray(cron.admin_audit_log))    data['_admin_audit_log']    = JSON.stringify(cron.admin_audit_log);
    if (Array.isArray(cron.credit_link_clicks)) data['_credit_link_clicks'] = JSON.stringify(cron.credit_link_clicks);
    if (Array.isArray(cron.profiles))           data['_profiles']           = JSON.stringify(cron.profiles);
    if (Array.isArray(cron.app_settings))       data['_app_settings']       = JSON.stringify(cron.app_settings);

    return {
        version: 2,
        exportedAt: cron.generated_at || new Date().toISOString(),
        data
    };
}

async function exportBackup(format = 'json') {
    const s = document.getElementById('backupStatus');
    if (s) s.textContent = '⏳ Esportazione in corso...';

    // ── Raccogli dati grezzi da Supabase ─────────────────────────────────────
    const tables = {};
    if (typeof supabaseClient !== 'undefined') {
        try {
            const [bookingsRes, creditsRes, creditHistRes, debtsRes, bonusesRes,
                   overridesRes, profilesRes, settingsRes, pushSubsRes,
                   auditRes, clicksRes, appSettingsRes] = await Promise.all([
                supabaseClient.from('bookings').select('*').order('created_at', { ascending: true }),
                supabaseClient.from('credits').select('*').order('created_at', { ascending: true }),
                supabaseClient.from('credit_history').select('*').order('created_at', { ascending: true }),
                supabaseClient.from('manual_debts').select('*').order('created_at', { ascending: true }),
                supabaseClient.from('bonuses').select('*').order('created_at', { ascending: true }),
                supabaseClient.from('schedule_overrides').select('*').order('date', { ascending: true }),
                supabaseClient.rpc('get_all_profiles'),
                supabaseClient.from('settings').select('*'),
                supabaseClient.from('push_subscriptions').select('*'),
                supabaseClient.from('admin_audit_log').select('*').order('created_at', { ascending: true }),
                supabaseClient.from('credit_link_clicks').select('*'),
                supabaseClient.from('app_settings').select('*'),
            ]);
            if (bookingsRes.data)    tables.bookings            = bookingsRes.data;
            if (creditsRes.data)     tables.credits             = creditsRes.data;
            if (creditHistRes.data)  tables.credit_history      = creditHistRes.data;
            if (debtsRes.data)       tables.manual_debts        = debtsRes.data;
            if (bonusesRes.data)     tables.bonuses             = bonusesRes.data;
            if (overridesRes.data)   tables.schedule_overrides  = overridesRes.data;
            if (profilesRes.data)    tables.profiles            = profilesRes.data;
            if (settingsRes.data)    tables.settings            = settingsRes.data;
            if (pushSubsRes.data)    tables.push_subscriptions  = pushSubsRes.data;
            if (auditRes.data)       tables.admin_audit_log     = auditRes.data;
            if (clicksRes.data)      tables.credit_link_clicks  = clicksRes.data;
            if (appSettingsRes.data) tables.app_settings        = appSettingsRes.data;
        } catch (e) {
            console.warn('[Backup] Errore fetch Supabase:', e.message);
        }
    }

    if (format === 'csv') {
        // ── Export CSV (uno ZIP con un CSV per tabella) ───────────────────────
        _exportBackupCSV(tables, s);
        return;
    }

    // ── Export JSON — stesso formato del backup auto-cron di Nextcloud ───────
    const backup = {
        generated_at: new Date().toISOString(),
        source: 'admin-export',
        ...tables
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gym-backup-${_localDateStr()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    if (s) s.textContent = `✅ Backup JSON esportato il ${new Date().toLocaleString('it-IT')}`;
}

function _exportBackupCSV(tables, statusEl) {
    const dateStr = _localDateStr();

    // Converte un array di oggetti in stringa CSV
    function toCsv(rows) {
        if (!rows || rows.length === 0) return '';
        const headers = Object.keys(rows[0]);
        const escape = v => {
            if (v == null) return '';
            const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
            return s.includes(',') || s.includes('"') || s.includes('\n')
                ? '"' + s.replace(/"/g, '""') + '"' : s;
        };
        return [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n');
    }

    // Genera un CSV per ogni tabella e scarica come file singoli in uno ZIP
    // Senza librerie ZIP, scarichiamo un singolo CSV multi-foglio separato da intestazioni
    const sections = [];
    for (const [name, rows] of Object.entries(tables)) {
        if (!Array.isArray(rows) || rows.length === 0) continue;
        sections.push(`\n### TABELLA: ${name.toUpperCase()} (${rows.length} righe) ###\n` + toCsv(rows));
    }

    if (sections.length === 0) {
        if (statusEl) statusEl.textContent = '❌ Nessun dato da esportare';
        return;
    }

    const content = `# Backup TB Training — ${dateStr}\n# Generato il ${new Date().toLocaleString('it-IT')}\n` + sections.join('\n\n');
    const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gym-backup-${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    if (statusEl) statusEl.textContent = `✅ Backup CSV esportato il ${new Date().toLocaleString('it-IT')}`;
}

function importBackup(input) {
    const file = input.files[0];
    if (!file) return;
    const pw = prompt('Inserisci la password per importare il backup:');
    if (pw !== 'Palestra123') {
        alert('Password errata');
        input.value = '';
        return;
    }
    const reader = new FileReader();
    reader.onload = async e => {
        try {
            let backup = JSON.parse(e.target.result);
            console.log('[Backup] Chiavi trovate nel file:', Object.keys(backup));

            // ── Rileva e normalizza formato Nextcloud/cron ──────────────
            // Formato A: { generated_at, bookings: [...], credits: [...], ... }
            // Formato B: { exportedAt, source, tables: { bookings: [...], ... } }
            // Formato admin: { version, exportedAt, data: { gym_bookings: "...", ... } }

            // Formato B (tables wrapper): appiattisci in formato A
            if (!backup.data && backup.tables && typeof backup.tables === 'object') {
                const flat = { generated_at: backup.exportedAt || backup.generated_at, ...backup.tables };
                console.log('[Backup] Rilevato formato Nextcloud con tables wrapper, appiattisco...');
                backup = flat;
            }

            if (!backup.data && (backup.bookings || backup.credits || backup.generated_at)) {
                console.log('[Backup] Rilevato formato Nextcloud/cron, converto...');
                backup = _convertCronToAdminFormat(backup);
                console.log('[Backup] Conversione completata, chiavi data:', Object.keys(backup.data || {}));
            }

            if (!backup?.data || typeof backup.data !== 'object') {
                console.error('[Backup] Formato non riconosciuto. Struttura:', JSON.stringify(backup).substring(0, 500));
                throw new Error('Formato non valido');
            }
            const keyCount = Object.keys(backup.data).length;
            const exportDate = (backup.exportedAt || backup.generated_at)
                ? new Date(backup.exportedAt || backup.generated_at).toLocaleString('it-IT')
                : 'data sconosciuta';
            if (!confirm(`Ripristinare il backup del ${exportDate}?\n\nConterrà ${keyCount} sezioni di dati.\n\n⚠️ ATTENZIONE: tutti i dati attuali verranno sovrascritti.`)) {
                input.value = '';
                return;
            }
            BACKUP_KEYS.forEach(key => {
                if (backup.data[key] !== undefined) {
                    localStorage.setItem(key, backup.data[key]);
                }
            });
            const s = document.getElementById('backupStatus');
            if (s) s.textContent = '⏳ Ripristino su Supabase in corso...';

            // ── Push dati ripristinati su Supabase ──────────────
            if (typeof supabaseClient !== 'undefined') {
                try {
                    const promises = [];

                    // 1. Bookings — upsert completo
                    const bookings = JSON.parse(backup.data.gym_bookings || '[]');
                    if (Array.isArray(bookings) && bookings.length > 0) {
                        const bRows = bookings
                            .filter(b => b.id && !b.id.startsWith('demo-') && !b.id.startsWith('_avail_'))
                            .map(b => ({
                                local_id:                  b.id,
                                user_id:                   b.userId || null,
                                date:                      b.date,
                                time:                      b.time,
                                slot_type:                 b.slotType,
                                name:                      b.name,
                                email:                     b.email,
                                whatsapp:                  b.whatsapp,
                                notes:                     b.notes || '',
                                status:                    b.status || 'confirmed',
                                paid:                      b.paid || false,
                                payment_method:            b.paymentMethod || null,
                                paid_at:                   b.paidAt || null,
                                credit_applied:            b.creditApplied || 0,
                                created_at:                b.createdAt,
                                date_display:              b.dateDisplay || '',
                                cancellation_requested_at: b.cancellationRequestedAt || null,
                                cancelled_at:              b.cancelledAt || null,
                                cancelled_payment_method:  b.cancelledPaymentMethod || null,
                                cancelled_paid_at:         b.cancelledPaidAt || null,
                                cancelled_with_bonus:      b.cancelledWithBonus || false,
                                cancelled_with_penalty:    b.cancelledWithPenalty || false,
                                cancelled_refund_pct:      b.cancelledRefundPct ?? null,
                            }));
                        if (bRows.length > 0) {
                            promises.push(supabaseClient.from('bookings').upsert(bRows, { onConflict: 'local_id' }));
                        }
                    }

                    // 2. Credits
                    const credits = JSON.parse(backup.data.gym_credits || '{}');
                    const cRows = Object.values(credits).map(r => ({
                        name:         r.name,
                        whatsapp:     r.whatsapp || null,
                        email:        (r.email || '').toLowerCase(),
                        balance:      r.balance || 0,
                        free_balance: r.freeBalance || 0,
                    })).filter(r => r.email);
                    if (cRows.length > 0) {
                        promises.push(supabaseClient.from('credits').upsert(cRows, { onConflict: 'email' }));
                    }

                    // 3. Manual debts
                    const debts = JSON.parse(backup.data.gym_manual_debts || '{}');
                    const dRows = Object.values(debts).map(r => ({
                        name:     r.name,
                        whatsapp: r.whatsapp || null,
                        email:    (r.email || '').toLowerCase(),
                        balance:  r.balance || 0,
                        history:  r.history || [],
                    })).filter(r => r.email);
                    if (dRows.length > 0) {
                        promises.push(supabaseClient.from('manual_debts').upsert(dRows, { onConflict: 'email' }));
                    }

                    // 4. Bonuses
                    const bonus = JSON.parse(backup.data.gym_bonus || '{}');
                    const bonRows = Object.values(bonus).map(r => ({
                        name:             r.name,
                        whatsapp:         r.whatsapp || null,
                        email:            (r.email || '').toLowerCase(),
                        bonus:            r.bonus ?? 1,
                        last_reset_month: r.lastResetMonth || null,
                    })).filter(r => r.email);
                    if (bonRows.length > 0) {
                        promises.push(supabaseClient.from('bonuses').upsert(bonRows, { onConflict: 'email' }));
                    }

                    // 5. Schedule overrides
                    const overrides = JSON.parse(backup.data.scheduleOverrides || '{}');
                    const oRows = [];
                    for (const [dateStr, slots] of Object.entries(overrides)) {
                        for (const slot of (Array.isArray(slots) ? slots : [])) {
                            oRows.push({ date: dateStr, time: slot.time, slot_type: slot.type, extras: slot.extras || [] });
                        }
                    }
                    if (oRows.length > 0) {
                        promises.push(supabaseClient.from('schedule_overrides').upsert(oRows, { onConflict: 'date,time' }));
                    }

                    // 6. Credit history — ripristino completo
                    if (backup.data._credit_history) {
                        const chRows = JSON.parse(backup.data._credit_history || '[]');
                        if (chRows.length > 0) {
                            // Wait for credits upsert to complete first so IDs exist
                            await Promise.allSettled(promises);
                            promises.length = 0;
                            const creditsRes = await supabaseClient.from('credits').select('id,email');
                            const emailToId = {};
                            if (creditsRes.data) creditsRes.data.forEach(c => { emailToId[c.email] = c.id; });
                            const histRows = chRows
                                .filter(h => h.credit_id ? true : emailToId[h.email])
                                .map(h => ({
                                    credit_id: h.credit_id || emailToId[h.email],
                                    amount: h.amount || 0,
                                    display_amount: h.display_amount ?? h.amount,
                                    note: h.note || '',
                                    created_at: h.created_at,
                                    booking_ref: h.booking_ref || null,
                                    hidden: h.hidden || false,
                                }));
                            if (histRows.length > 0) {
                                // Cancella storico esistente e re-inserisci per evitare duplicati
                                await supabaseClient.from('credit_history').delete().neq('id', '00000000-0000-0000-0000-000000000000');
                                promises.push(supabaseClient.from('credit_history').insert(histRows));
                            }
                        }
                    }

                    // 7. Settings (tabella Supabase)
                    if (backup.data._settings) {
                        const sRows = JSON.parse(backup.data._settings || '[]');
                        if (sRows.length > 0) {
                            promises.push(supabaseClient.from('settings').upsert(sRows, { onConflict: 'key' }));
                        }
                    }

                    // 8. App settings
                    if (backup.data._app_settings) {
                        const asRows = JSON.parse(backup.data._app_settings || '[]');
                        if (asRows.length > 0) {
                            promises.push(supabaseClient.from('app_settings').upsert(asRows, { onConflict: 'key' }));
                        }
                    }

                    // 9. Profiles — ripristino su Supabase
                    if (backup.data._profiles) {
                        const pRows = JSON.parse(backup.data._profiles || '[]');
                        if (pRows.length > 0) {
                            for (const p of pRows) {
                                // Update solo campi dati (non toccare id/auth)
                                promises.push(supabaseClient.from('profiles').update({
                                    name: p.name,
                                    whatsapp: p.whatsapp || null,
                                    medical_cert_expiry: p.medical_cert_expiry || null,
                                    medical_cert_history: p.medical_cert_history || [],
                                    insurance_expiry: p.insurance_expiry || null,
                                    insurance_history: p.insurance_history || [],
                                    codice_fiscale: p.codice_fiscale || null,
                                    indirizzo_via: p.indirizzo_via || null,
                                    indirizzo_paese: p.indirizzo_paese || null,
                                    indirizzo_cap: p.indirizzo_cap || null,
                                    documento_firmato: p.documento_firmato || false,
                                }).eq('email', (p.email || '').toLowerCase()));
                            }
                        }
                    }

                    // 10. Push subscriptions
                    if (backup.data._push_subscriptions) {
                        const psRows = JSON.parse(backup.data._push_subscriptions || '[]');
                        if (psRows.length > 0) {
                            for (const ps of psRows) {
                                promises.push(supabaseClient.from('push_subscriptions').upsert({
                                    user_id: ps.user_id,
                                    endpoint: ps.endpoint,
                                    p256dh: ps.p256dh,
                                    auth: ps.auth,
                                }, { onConflict: 'endpoint' }));
                            }
                        }
                    }

                    // 11. Admin audit log
                    if (backup.data._admin_audit_log) {
                        const alRows = JSON.parse(backup.data._admin_audit_log || '[]');
                        if (alRows.length > 0) {
                            // Cancella e re-inserisci per evitare duplicati
                            await supabaseClient.from('admin_audit_log').delete().neq('id', '00000000-0000-0000-0000-000000000000');
                            promises.push(supabaseClient.from('admin_audit_log').insert(alRows));
                        }
                    }

                    // 12. Credit link clicks
                    if (backup.data._credit_link_clicks) {
                        const clRows = JSON.parse(backup.data._credit_link_clicks || '[]');
                        if (clRows.length > 0) {
                            await supabaseClient.from('credit_link_clicks').delete().neq('id', '00000000-0000-0000-0000-000000000000');
                            promises.push(supabaseClient.from('credit_link_clicks').insert(clRows));
                        }
                    }

                    const results = await Promise.allSettled(promises);
                    const errors = results.filter(r => r.status === 'fulfilled' && r.value?.error);
                    if (errors.length > 0) {
                        console.warn('[Backup] Alcuni upsert con errore:', errors.map(r => r.value.error.message));
                    }
                    console.log('[Backup] Ripristino Supabase completato:', results.length, 'operazioni');
                } catch (e) {
                    console.error('[Backup] Errore ripristino Supabase:', e);
                }
            }

            if (s) s.textContent = '✅ Backup ripristinato. Ricarico...';
            setTimeout(() => location.reload(), 1200);
        } catch (err) {
            alert('Errore durante l\'importazione: ' + err.message);
            const s = document.getElementById('backupStatus');
            if (s) s.textContent = '❌ Importazione fallita: ' + err.message;
        } finally {
            input.value = '';
        }
    };
    reader.readAsText(file);
}

async function exportData() {
    const date = _localDateStr();

    // Mostra loading sul bottone durante il fetch
    const btn = document.querySelector('[onclick="exportData()"]');
    const origLabel = btn?.innerHTML;
    if (btn) { btn.innerHTML = '⏳ Caricamento...'; btn.disabled = true; }

    // ── Helpers ───────────────────────────────────────────────────
    function fmtDate(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        return isNaN(d) ? iso : d.toLocaleDateString('it-IT');
    }
    function fmtDateTime(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        return isNaN(d) ? iso : d.toLocaleString('it-IT');
    }

    const SLOT_LABEL = {
        'personal-training': 'Personal Training',
        'small-group':       'Small Group',
        'group-class':       'Lezione di Gruppo',
        'cleaning':          'Pulizie'
    };
    const STATUS_LABEL = {
        'confirmed':              'Confermata',
        'cancelled':              'Annullata',
        'cancellation_requested': 'Annullamento richiesto'
    };
    const METHOD_LABEL = {
        contanti: 'Contanti', carta: 'Carta', iban: 'Bonifico', credito: 'Credito', stripe: 'Stripe', 'lezione-gratuita': 'Gratuita'
    };
    const DAYS = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];

    // ── Fonti dati ─────────────────────────────────────────────────
    // Fetch tutti i booking direttamente da Supabase (bypass localStorage size limit)
    const allBookings  = (await BookingStorage.fetchForAdmin(null, null))
                            .sort((a, b) => b.date.localeCompare(a.date));
    const allUsers     = UserStorage.getAll();
    const allCredits   = CreditStorage._getAll();
    const allDebts     = ManualDebtStorage._getAll();
    const allOverrides = BookingStorage.getScheduleOverrides() || {};

    // ── 1. CLIENTI ─────────────────────────────────────────────────
    const clientMap = {};
    allUsers.forEach(u => {
        const key = (u.email || u.whatsapp || '').toLowerCase();
        clientMap[key] = {
            nome:      u.name,
            email:     u.email || '',
            whatsapp:  u.whatsapp || '',
            cert_scad: u.certificatoMedicoScadenza || '',
            tipo:      u.provider === 'google' ? 'Google OAuth'
                     : u.passwordHash          ? 'Email/Password'
                                               : 'Profilo admin',
            creato_il: fmtDate(u.createdAt)
        };
    });
    allBookings.forEach(b => {
        const key = (b.email || normalizePhone(b.whatsapp) || '').toLowerCase();
        if (!clientMap[key]) {
            clientMap[key] = {
                nome: b.name, email: b.email || '', whatsapp: b.whatsapp || '',
                cert_scad: '', tipo: 'Solo prenotazioni', creato_il: fmtDate(b.createdAt)
            };
        }
    });
    const sheetClienti = [
        ['Nome','Email','WhatsApp','Scadenza Cert. Medico','Tipo Account','Creato Il'],
        ...Object.values(clientMap)
            .sort((a, b) => a.nome.localeCompare(b.nome))
            .map(c => [c.nome, c.email, c.whatsapp, c.cert_scad, c.tipo, c.creato_il])
    ];

    // ── 2. PRENOTAZIONI ────────────────────────────────────────────
    const sheetPrenotazioni = [
        ['ID','Data','Orario','Tipo Lezione','Nome','Email','WhatsApp','Note',
         'Stato','Pagato','Metodo Pagamento','Data Pagamento','Credito Applicato (€)','Creato Il'],
        ...allBookings.map(b => [
            b.id,
            fmtDate(b.date + 'T12:00:00'),
            b.time,
            SLOT_LABEL[b.slotType] || b.slotType,
            b.name, b.email, b.whatsapp,
            b.notes || '',
            STATUS_LABEL[b.status] || 'Confermata',
            b.paid ? 'Sì' : 'No',
            METHOD_LABEL[b.paymentMethod] || '',
            fmtDateTime(b.paidAt),
            b.creditApplied || 0,
            fmtDateTime(b.createdAt)
        ])
    ];

    // ── 3. PAGAMENTI ───────────────────────────────────────────────
    const pagRows = [];
    allBookings.filter(b => b.paid || (b.creditApplied || 0) > 0).forEach(b => {
        pagRows.push([
            fmtDateTime(b.paidAt || b.date + 'T12:00:00'),
            b.name, b.email, b.whatsapp,
            SLOT_LABEL[b.slotType] || b.slotType,
            SLOT_PRICES[b.slotType] || 0,
            METHOD_LABEL[b.paymentMethod] || '',
            b.paidAt || b.date, ''
        ]);
    });
    Object.values(allCredits).forEach(c => {
        (c.history || []).forEach(h => {
            pagRows.push([
                fmtDateTime(h.date),
                c.name, c.email, c.whatsapp,
                'Credito', h.displayAmount ?? h.amount,
                'Credito', h.date, h.note || ''
            ]);
        });
    });
    Object.values(allDebts).forEach(d => {
        (d.history || []).filter(h => h.amount < 0).forEach(h => {
            pagRows.push([
                fmtDateTime(h.date),
                d.name, d.email, d.whatsapp,
                'Saldo debito manuale', Math.abs(h.amount),
                METHOD_LABEL[h.method] || h.method || '',
                h.date, h.note || ''
            ]);
        });
    });
    pagRows.sort((a, b) => (b[7] || '').localeCompare(a[7] || ''));
    pagRows.forEach(r => r.splice(7, 1)); // rimuovi colonna ts interna
    const sheetPagamenti = [
        ['Data','Nome','Email','WhatsApp','Descrizione','Importo (€)','Metodo','Nota'],
        ...pagRows
    ];

    // ── 4. CREDITI ─────────────────────────────────────────────────
    const sheetCrediti = [
        ['Nome','Email','WhatsApp','Saldo Attuale (€)','Data Movimento','Variazione (€)','Nota'],
        ...Object.values(allCredits)
            .sort((a, b) => a.name.localeCompare(b.name))
            .flatMap(c => (c.history || []).map(h => [
                c.name, c.email, c.whatsapp, c.balance,
                fmtDateTime(h.date), h.amount, h.note || ''
            ]))
    ];

    // ── 5. DEBITI MANUALI ──────────────────────────────────────────
    const sheetDebiti = [
        ['Nome','Email','WhatsApp','Saldo Attuale (€)','Data Movimento','Variazione (€)','Nota','Metodo'],
        ...Object.values(allDebts)
            .sort((a, b) => a.name.localeCompare(b.name))
            .flatMap(d => (d.history || []).map(h => [
                d.name, d.email, d.whatsapp, d.balance,
                fmtDateTime(h.date), h.amount, h.note || '',
                METHOD_LABEL[h.method] || h.method || ''
            ]))
    ];

    // ── 6. GESTIONE ORARI ──────────────────────────────────────────
    const sheetOrari = [
        ['Data','Giorno','Orario','Tipo Lezione','Cliente Assegnato','Booking ID'],
        ...Object.entries(allOverrides)
            .sort(([a], [b]) => a.localeCompare(b))
            .flatMap(([dateStr, slots]) => {
                const d = new Date(dateStr + 'T12:00:00');
                return (slots || []).map(s => [
                    fmtDate(dateStr + 'T12:00:00'),
                    DAYS[d.getDay()],
                    s.time,
                    SLOT_LABEL[s.type] || s.type,
                    s.client || '',
                    s.bookingId || ''
                ]);
            })
    ];

    // ── Crea workbook Excel con SheetJS ───────────────────────────
    const wb = XLSX.utils.book_new();
    const sheets = [
        ['Clienti',        sheetClienti],
        ['Prenotazioni',   sheetPrenotazioni],
        ['Pagamenti',      sheetPagamenti],
        ['Crediti',        sheetCrediti],
        ['Debiti Manuali', sheetDebiti],
        ['Gestione Orari', sheetOrari],
    ];

    sheets.forEach(([name, data]) => {
        const ws = XLSX.utils.aoa_to_sheet(data);
        // Larghezza colonne automatica (stima dal contenuto)
        const colWidths = data[0].map((_, ci) =>
            Math.min(50, Math.max(10, ...data.map(r => String(r[ci] ?? '').length)))
        );
        ws['!cols'] = colWidths.map(w => ({ wch: w }));
        XLSX.utils.book_append_sheet(wb, ws, name);
    });

    const filename = `TB_Training_export_${date}.xlsx`;
    XLSX.writeFile(wb, filename);

    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '✅ Scaricato!';
        setTimeout(() => { btn.innerHTML = origLabel; }, 2500);
    }
}

function resetDemoData() {
    if (confirm('⚠️ ATTENZIONE: Questo cancellerà tutti i dati esistenti e genererà nuovi dati demo da Gennaio al 15 Marzo. Continuare?')) {
        BookingStorage._cache = [];
        CreditStorage._cache = {};
        ManualDebtStorage._cache = {};
        BonusStorage._cache = {};
        localStorage.removeItem(BookingStorage.STATS_KEY);
        localStorage.removeItem('scheduleOverrides');
        localStorage.removeItem('dataClearedByUser');
        BookingStorage.initializeDemoData();
        alert('✅ Dati demo rigenerati con successo!');
        location.reload();
    }
}

async function clearAllData() {
    if (!confirm('⚠️ ATTENZIONE: Questo eliminerà definitivamente tutte le prenotazioni e i dati sia localmente che su Supabase. NON verranno generati nuovi dati demo. Continuare?')) return;

    // 1. Cancella Supabase PRIMA del localStorage — così il sync post-reload
    //    non riscarica dati che stiamo per eliminare.
    if (typeof supabaseClient !== 'undefined') {
        // Disiscriviti dai canali Realtime per evitare che un evento
        // postgres_changes faccia syncFromSupabase() prima che il clear sia completo
        try { supabaseClient.removeAllChannels(); } catch (_) {}

        const { error: rpcErr } = await supabaseClient.rpc('admin_clear_all_data');
        if (rpcErr) {
            console.error('[Supabase] admin_clear_all_data RPC error:', rpcErr.message, rpcErr.code);
            alert('⚠️ Errore durante la cancellazione su Supabase: ' + rpcErr.message);
            return;
        }
        const now = new Date().toISOString();
        const { error: settingsErr } = await supabaseClient.from('app_settings').upsert([
            { key: 'data_cleared_at', value: { ts: now }, updated_at: now },
        ]);
        if (settingsErr) console.error('[Supabase] clearAllData - upsert app_settings error:', settingsErr.message);
        localStorage.setItem('dataLastCleared', now);
    }

    // 2. Svuota cache in memoria + localStorage settings
    BookingStorage._cache = [];
    CreditStorage._cache = {};
    ManualDebtStorage._cache = {};
    BonusStorage._cache = {};
    UserStorage._cache = [];
    localStorage.removeItem(BookingStorage.STATS_KEY);
    localStorage.removeItem('scheduleOverrides');
    localStorage.setItem('dataClearedByUser', 'true');

    // 3. Svuota cache PWA — previene dati fantasma dal service worker
    if ('caches' in window) {
        try {
            const keys = await caches.keys();
            await Promise.all(keys.map(k => caches.delete(k)));
        } catch (_) {}
    }

    alert('✅ Tutti i dati sono stati eliminati (localStorage + Supabase).');
    location.reload();
}

function pruneOldData() {
    const months = parseInt(prompt(
        'Eliminare dati demo e prenotazioni più vecchie di quanti mesi?\n(es. 6 = tutto ciò che precede 6 mesi fa)',
        '12'
    ));
    if (!months || isNaN(months) || months <= 0) return;

    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    const cutoffStr = _localDateStr(cutoff);

    if (!confirm(`⚠️ Verranno eliminati definitivamente:\n• Tutte le prenotazioni DEMO\n• Prenotazioni reali con data precedente al ${cutoff.toLocaleDateString('it-IT')}\n• Voci di credito/transazioni precedenti a tale data\n\nI saldi credito rimangono invariati. Continuare?`)) return;

    // 1. Rimuovi prenotazioni demo (sempre) + prenotazioni reali più vecchie del cutoff
    const bookings = BookingStorage.getAllBookings();
    BookingStorage.replaceAllBookings(
        bookings.filter(b => !b.id?.startsWith('demo-') && b.date >= cutoffStr)
    );
    // Impedisci che initializeDemoData rigeneri i dati al prossimo reload
    localStorage.setItem('dataClearedByUser', 'true');

    // 2. Pruning storico crediti (mantieni il saldo, rimuovi solo le voci vecchie)
    const allCredits = CreditStorage._getAll();
    Object.values(allCredits).forEach(rec => {
        if (rec.history) {
            rec.history = rec.history.filter(e => new Date(e.date) >= cutoff);
        }
    });
    CreditStorage._save(allCredits);

    // 3. Pruning storico debiti manuali (mantieni il saldo, rimuovi solo le voci vecchie)
    const allDebts = ManualDebtStorage._getAll();
    Object.values(allDebts).forEach(rec => {
        if (rec.history) {
            rec.history = rec.history.filter(e => new Date(e.date) >= cutoff);
        }
    });
    ManualDebtStorage._save(allDebts);

    alert('✅ Dati storici e demo eliminati. I saldi credito sono rimasti invariati.');
    location.reload();
}

