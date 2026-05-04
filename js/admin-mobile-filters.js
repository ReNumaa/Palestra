/* ─────────────────────────────────────────────────────────────────────────
 * admin-mobile-filters.js
 * Barra mobile unificata + bottom sheet "Vai a" / "Filtri" (<= 768px).
 * Funziona come proxy: non duplica la logica dei filtri esistenti,
 * si limita a pilotarli via .click() / value+dispatchEvent.
 * ───────────────────────────────────────────────────────────────────────── */
(function () {
    'use strict';

    const MQ = window.matchMedia('(max-width: 768px)');

    // Configurazione bottone filtri per tab.
    // show: false → bottone nascosto (la pagina prende tutta la barra)
    const FILTER_CONFIG = {
        bookings:  { show: false },
        payments:  { show: false },
        clients:   { show: true,  icon: '🔍',  label: 'Filtri'  },
        schedule:  { show: false },
        analytics: { show: true,  icon: '📅',  label: 'Periodo' },
        settings:  { show: false },
        registro:  { show: true,  icon: '🔍',  label: 'Filtri'  },
        messaggi:  { show: false },
        richieste: { show: true,  icon: '📥',  label: 'Stato'   },
        schede:    { show: false },
        importa:   { show: false },
    };

    /* ─── Helper base ─────────────────────────────────────────────────────── */

    // Estrae {icon, label} dal testo di un .admin-tab:
    // - gestisce cluster emoji con skin-tone modifier e variation selector (FE0F)
    // - se il primo char NON e' un'emoji (es. "Oggi"), tutto il testo e' label
    //   (altrimenti mbar renderizzava "O ggi" con "O" come icona separata)
    function splitEmojiLabel(raw) {
        const text = (raw || '').trim();
        if (!text) return { icon: '', label: '' };
        const arr = Array.from(text);
        if (!arr.length) return { icon: '', label: text };
        const firstCp = arr[0].codePointAt(0);
        // Lettere/numeri/punteggiatura stanno sotto U+2000. Le emoji/symbol
        // in uso nel progetto sono tutti >= U+2000 (⚙️ 0x2699, ✅ 0x2705,
        // 📅/💳/🏋 nel piano SMP >= 0x1F300).
        if (firstCp < 0x2000) return { icon: '', label: text };
        let icoEnd = 1;
        // include eventuale modifier tone / variation selector
        while (icoEnd < arr.length) {
            const cp = arr[icoEnd].codePointAt(0);
            const isSkinTone = cp >= 0x1F3FB && cp <= 0x1F3FF;
            const isVS = cp === 0xFE0F || cp === 0x200D;
            if (isSkinTone || isVS) { icoEnd++; continue; }
            break;
        }
        const icon = arr.slice(0, icoEnd).join('');
        const label = arr.slice(icoEnd).join('').trim();
        return { icon, label };
    }

    function $(id) { return document.getElementById(id); }

    function getActiveTab() {
        const el = document.querySelector('.admin-tab.active');
        return el ? el.dataset.tab : null;
    }

    function getActiveRegistroSubtab() {
        const el = document.querySelector('.registro-subtab.active');
        return el ? el.dataset.subtab : null;
    }

    /* ─── Apertura / chiusura sheet ──────────────────────────────────────── */

    function openSheet(sheetId, backdropId, triggerId) {
        const sheet = $(sheetId);
        const backdrop = $(backdropId);
        if (!sheet || !backdrop) return;
        backdrop.hidden = false;
        // forza reflow perché la transizione opacity parta
        void backdrop.offsetWidth;
        backdrop.classList.add('is-open');
        sheet.classList.add('is-open');
        sheet.setAttribute('aria-hidden', 'false');
        if (triggerId) {
            const trig = $(triggerId);
            if (trig) trig.setAttribute('aria-expanded', 'true');
        }
        document.body.classList.add('adm-sheet-open');
    }

    function closeSheet(sheetId, backdropId, triggerId) {
        const sheet = $(sheetId);
        const backdrop = $(backdropId);
        if (!sheet || !backdrop) return;
        sheet.classList.remove('is-open');
        backdrop.classList.remove('is-open');
        sheet.setAttribute('aria-hidden', 'true');
        if (triggerId) {
            const trig = $(triggerId);
            if (trig) trig.setAttribute('aria-expanded', 'false');
        }
        // attendi fine transizione (300ms) prima di nascondere il backdrop
        setTimeout(() => {
            if (!sheet.classList.contains('is-open')) {
                backdrop.hidden = true;
                // rimuovi lock body solo se nessun altro sheet è aperto
                const anyOpen = document.querySelector('.adm-sheet.is-open');
                if (!anyOpen) document.body.classList.remove('adm-sheet-open');
            }
        }, 310);
    }

    function closeAllSheets() {
        closeSheet('admPagesSheet', 'admPagesBackdrop', 'admMbarPage');
        closeSheet('admFiltersSheet', 'admFiltersBackdrop', 'admMbarFilter');
    }

    /* ─── Page switcher (bottom sheet "Vai a") ───────────────────────────── */

    function renderPagesSheet() {
        const list = $('admPagesList');
        if (!list) return;
        list.innerHTML = '';
        const active = getActiveTab();

        const tabs = document.querySelectorAll('.admin-tab[data-tab]');
        tabs.forEach(tab => {
            if (tab.classList.contains('admin-tab--privacy')) return;
            const { icon, label } = splitEmojiLabel(tab.textContent);
            const li = document.createElement('li');
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'adm-sheet-item';
            btn.setAttribute('role', 'option');
            btn.dataset.target = tab.dataset.tab;
            if (tab.dataset.tab === active) {
                btn.classList.add('is-active');
                btn.setAttribute('aria-selected', 'true');
            }
            btn.innerHTML = `
                <span class="adm-sheet-item-ico" aria-hidden="true">${icon || '•'}</span>
                <span class="adm-sheet-item-text">
                    <span class="adm-sheet-item-title">${label || tab.dataset.tab}</span>
                </span>
                <span class="adm-sheet-item-radio" aria-hidden="true"></span>
            `;
            btn.addEventListener('click', () => {
                closeSheet('admPagesSheet', 'admPagesBackdrop', 'admMbarPage');
                // delega al click nativo → usa switchTab esistente
                setTimeout(() => tab.click(), 50);
            });
            li.appendChild(btn);
            list.appendChild(li);
        });

        // Voce speciale: toggle dati sensibili (privacy)
        const sens = $('btnToggleSensitive');
        if (sens) {
            const hidden = sens.classList.contains('active') || sens.dataset.hidden === 'true'
                || document.body.classList.contains('sensitive-hidden');
            const li = document.createElement('li');
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'adm-sheet-item adm-sheet-item--action';
            btn.dataset.action = 'privacy';
            btn.innerHTML = `
                <span class="adm-sheet-item-ico" aria-hidden="true">👁</span>
                <span class="adm-sheet-item-text">
                    <span class="adm-sheet-item-title">Dati sensibili</span>
                    <span class="adm-sheet-item-meta">${hidden ? 'Nascosti — tocca per mostrare' : 'Visibili — tocca per nascondere'}</span>
                </span>
            `;
            btn.addEventListener('click', () => {
                closeSheet('admPagesSheet', 'admPagesBackdrop', 'admMbarPage');
                setTimeout(() => sens.click(), 50);
            });
            li.appendChild(btn);
            list.appendChild(li);
        }
    }

    function updatePageSwitcherLabel() {
        const active = document.querySelector('.admin-tab.active');
        const icoEl = $('admMbarPageIco');
        const lblEl = $('admMbarPageLabel');
        if (!active || !icoEl || !lblEl) return;
        const { icon, label } = splitEmojiLabel(active.textContent);
        icoEl.textContent = icon || '•';
        lblEl.textContent = label || active.dataset.tab || '';
    }

    /* ─── Bottone filtri contestuale ─────────────────────────────────────── */

    function countActiveClientFilters() {
        return document.querySelectorAll('.clients-filter-chip.active').length;
    }

    function countActiveRegistroFilters() {
        let n = 0;
        const range = document.querySelector('.registro-date-btns .rfilter-btn.active');
        if (range && range.dataset.range && range.dataset.range !== 'all') n++;
        n += document.querySelectorAll('.rfilter-type-pills .rfilter-btn.active').length;
        const slot = $('registroFilterSlot');
        if (slot && slot.value && slot.value !== 'all') n++;
        const method = $('registroFilterMethod');
        if (method && method.value && method.value !== 'all') n++;
        const status = $('registroFilterStatus');
        if (status && status.value && status.value !== 'all') n++;
        const search = $('registroSearch');
        if (search && search.value && search.value.trim()) n++;
        return n;
    }

    function updateFilterButton() {
        const tab = getActiveTab();
        const btn = $('admMbarFilter');
        if (!btn || !tab) return;
        const cfg = FILTER_CONFIG[tab];
        if (!cfg || !cfg.show) {
            btn.hidden = true;
            btn.classList.remove('has-active');
            return;
        }
        btn.hidden = false;

        const icoEl = $('admMbarFilterIco');
        const lblEl = $('admMbarFilterLabel');
        let icon = cfg.icon || '🔍';
        let label = cfg.label || 'Filtri';
        let hasActive = false;

        if (tab === 'analytics') {
            const active = document.querySelector('.analytics-filter-bar .filter-btn.active');
            if (active) {
                const { icon: ic, label: lb } = splitEmojiLabel(active.textContent);
                label = lb || active.textContent.trim() || label;
                if (ic) icon = ic;
            }
        } else if (tab === 'richieste') {
            const active = document.querySelector('#richiesteFilterBar .filter-btn.active');
            if (active) {
                label = active.textContent.trim() || label;
            }
        } else if (tab === 'clients') {
            hasActive = countActiveClientFilters() > 0;
        } else if (tab === 'registro') {
            hasActive = countActiveRegistroFilters() > 0;
        }

        if (icoEl) icoEl.textContent = icon;
        if (lblEl) lblEl.textContent = label;
        btn.classList.toggle('has-active', hasActive);
    }

    /* ─── Helper: costruisce pill da <option> di un <select> ─────────────── */

    function buildSelectAsPills(sel) {
        const origSel = $(sel.selectId);
        if (!origSel) return null;
        const group = document.createElement('div');
        group.className = 'adm-filt-group';
        const lbl = document.createElement('span');
        lbl.className = 'adm-filt-label';
        lbl.textContent = sel.label;
        group.appendChild(lbl);
        const pills = document.createElement('div');
        pills.className = 'adm-filt-pills';
        Array.from(origSel.options).forEach(opt => {
            const pill = document.createElement('button');
            pill.type = 'button';
            pill.className = 'adm-filt-pill';
            pill.textContent = opt.textContent;
            pill.dataset.value = opt.value;
            if (opt.value === origSel.value) pill.classList.add('is-active');
            pill.addEventListener('click', () => {
                pills.querySelectorAll('.adm-filt-pill').forEach(p => p.classList.remove('is-active'));
                pill.classList.add('is-active');
                origSel.value = opt.value;
                origSel.dispatchEvent(new Event('change', { bubbles: true }));
            });
            pills.appendChild(pill);
        });
        group.appendChild(pills);
        return group;
    }

    /* ─── Rendering dei filter sheet per tab ─────────────────────────────── */

    function buildAnalyticsFilters(body) {
        const group = document.createElement('div');
        group.className = 'adm-filt-group';
        const lbl = document.createElement('span');
        lbl.className = 'adm-filt-label';
        lbl.textContent = 'Periodo';
        group.appendChild(lbl);

        const pillsWrap = document.createElement('div');
        pillsWrap.className = 'adm-filt-pills';
        const origBtns = document.querySelectorAll('.analytics-filter-bar .filter-btn');
        origBtns.forEach(orig => {
            const pill = document.createElement('button');
            pill.type = 'button';
            pill.className = 'adm-filt-pill';
            pill.textContent = orig.textContent.trim();
            if (orig.classList.contains('active')) pill.classList.add('is-active');
            pill.addEventListener('click', () => {
                pillsWrap.querySelectorAll('.adm-filt-pill').forEach(p => p.classList.remove('is-active'));
                pill.classList.add('is-active');
                orig.click();
                // mostra/nasconde il blocco date custom in base al pulsante scelto
                const isCustom = /personalizzato/i.test(orig.textContent);
                customWrap.style.display = isCustom ? '' : 'none';
                if (!isCustom) {
                    // auto-chiudi lo sheet dopo breve delay
                    setTimeout(() => closeSheet('admFiltersSheet', 'admFiltersBackdrop', 'admMbarFilter'), 150);
                }
            });
            pillsWrap.appendChild(pill);
        });
        group.appendChild(pillsWrap);
        body.appendChild(group);

        // Date custom
        const customWrap = document.createElement('div');
        customWrap.className = 'adm-filt-group';
        const origCustom = $('filterCustomDates');
        const isCustomOn = origCustom && origCustom.style.display !== 'none';
        customWrap.style.display = isCustomOn ? '' : 'none';
        const cLbl = document.createElement('span');
        cLbl.className = 'adm-filt-label';
        cLbl.textContent = 'Intervallo personalizzato';
        customWrap.appendChild(cLbl);
        const row = document.createElement('div');
        row.className = 'adm-filt-row';
        const from = document.createElement('input');
        from.type = 'date';
        from.className = 'adm-filt-date';
        const origFrom = $('filterDateFrom');
        if (origFrom) from.value = origFrom.value || '';
        const sep = document.createElement('span');
        sep.className = 'adm-filt-row-sep';
        sep.textContent = '→';
        const to = document.createElement('input');
        to.type = 'date';
        to.className = 'adm-filt-date';
        const origTo = $('filterDateTo');
        if (origTo) to.value = origTo.value || '';
        row.appendChild(from); row.appendChild(sep); row.appendChild(to);
        customWrap.appendChild(row);
        body.appendChild(customWrap);

        body._apply = () => {
            if (origFrom) origFrom.value = from.value;
            if (origTo) origTo.value = to.value;
            if (typeof window.applyCustomFilter === 'function') window.applyCustomFilter();
        };
        body._reset = () => {
            const first = document.querySelector('.analytics-filter-bar .filter-btn');
            if (first) first.click();
        };
    }

    function buildClientsFilters(body) {
        const group = document.createElement('div');
        group.className = 'adm-filt-group';
        const lbl = document.createElement('span');
        lbl.className = 'adm-filt-label';
        lbl.textContent = 'Filtri clienti';
        group.appendChild(lbl);
        const pillsWrap = document.createElement('div');
        pillsWrap.className = 'adm-filt-pills';

        const origChips = document.querySelectorAll('.clients-filter-chips .clients-filter-chip');
        function syncPills() {
            pillsWrap.querySelectorAll('.adm-filt-pill').forEach((pill, i) => {
                const orig = origChips[i];
                if (!orig) return;
                pill.classList.toggle('is-active', orig.classList.contains('active'));
            });
        }
        origChips.forEach(orig => {
            const pill = document.createElement('button');
            pill.type = 'button';
            pill.className = 'adm-filt-pill';
            pill.textContent = orig.textContent.trim();
            if (orig.classList.contains('active')) pill.classList.add('is-active');
            pill.addEventListener('click', () => {
                orig.click();
                // i filtri sono mutually exclusive via _clearOtherFilters → risincronizza tutto
                setTimeout(syncPills, 10);
            });
            pillsWrap.appendChild(pill);
        });
        group.appendChild(pillsWrap);
        body.appendChild(group);

        body._apply = () => {
            // Nulla da applicare: ogni click aggiorna già la lista.
        };
        body._reset = () => {
            origChips.forEach(c => { if (c.classList.contains('active')) c.click(); });
            setTimeout(syncPills, 10);
        };
    }

    function buildRegistroFilters(body) {
        // 1) Periodo
        const g1 = document.createElement('div');
        g1.className = 'adm-filt-group';
        const g1l = document.createElement('span');
        g1l.className = 'adm-filt-label';
        g1l.textContent = 'Periodo';
        g1.appendChild(g1l);
        const g1p = document.createElement('div');
        g1p.className = 'adm-filt-pills';
        const rangeBtns = document.querySelectorAll('.registro-date-btns .rfilter-btn');
        rangeBtns.forEach(orig => {
            const pill = document.createElement('button');
            pill.type = 'button';
            pill.className = 'adm-filt-pill';
            pill.textContent = orig.textContent.trim();
            if (orig.classList.contains('active')) pill.classList.add('is-active');
            pill.addEventListener('click', () => {
                g1p.querySelectorAll('.adm-filt-pill').forEach(p => p.classList.remove('is-active'));
                pill.classList.add('is-active');
                orig.click();
                const isCustom = orig.dataset.range === 'custom';
                customWrap.style.display = isCustom ? '' : 'none';
            });
            g1p.appendChild(pill);
        });
        g1.appendChild(g1p);
        body.appendChild(g1);

        // Date custom registro
        const customWrap = document.createElement('div');
        customWrap.className = 'adm-filt-group';
        const origCust = $('registroCustomDates');
        const isCustomOn = origCust && origCust.style.display !== 'none';
        customWrap.style.display = isCustomOn ? '' : 'none';
        const cLbl = document.createElement('span');
        cLbl.className = 'adm-filt-label';
        cLbl.textContent = 'Intervallo personalizzato';
        customWrap.appendChild(cLbl);
        const row = document.createElement('div');
        row.className = 'adm-filt-row';
        const rFrom = document.createElement('input');
        rFrom.type = 'date'; rFrom.className = 'adm-filt-date';
        const origFrom = $('registroDateFrom');
        if (origFrom) rFrom.value = origFrom.value || '';
        const rSep = document.createElement('span');
        rSep.className = 'adm-filt-row-sep'; rSep.textContent = '→';
        const rTo = document.createElement('input');
        rTo.type = 'date'; rTo.className = 'adm-filt-date';
        const origTo = $('registroDateTo');
        if (origTo) rTo.value = origTo.value || '';
        row.appendChild(rFrom); row.appendChild(rSep); row.appendChild(rTo);
        customWrap.appendChild(row);
        body.appendChild(customWrap);

        // 2) Tipo evento (multi)
        const g2 = document.createElement('div');
        g2.className = 'adm-filt-group';
        const g2l = document.createElement('span');
        g2l.className = 'adm-filt-label';
        g2l.textContent = 'Tipo evento';
        g2.appendChild(g2l);
        const g2p = document.createElement('div');
        g2p.className = 'adm-filt-pills';
        document.querySelectorAll('.rfilter-type-pills .rfilter-btn').forEach(orig => {
            const pill = document.createElement('button');
            pill.type = 'button';
            pill.className = 'adm-filt-pill';
            pill.textContent = orig.textContent.trim();
            if (orig.classList.contains('active')) pill.classList.add('is-active');
            pill.addEventListener('click', () => {
                orig.click();
                pill.classList.toggle('is-active', orig.classList.contains('active'));
            });
            g2p.appendChild(pill);
        });
        g2.appendChild(g2p);
        body.appendChild(g2);

        // 3) Tipo lezione / Metodo / Stato (come pill da select)
        const slotG = buildSelectAsPills({ selectId: 'registroFilterSlot', label: 'Tipo lezione' });
        if (slotG) body.appendChild(slotG);
        const methodG = buildSelectAsPills({ selectId: 'registroFilterMethod', label: 'Metodo pagamento' });
        if (methodG) body.appendChild(methodG);
        const statusG = buildSelectAsPills({ selectId: 'registroFilterStatus', label: 'Stato' });
        if (statusG) body.appendChild(statusG);

        // 4) Ricerca cliente
        const g4 = document.createElement('div');
        g4.className = 'adm-filt-group';
        const g4l = document.createElement('span');
        g4l.className = 'adm-filt-label';
        g4l.textContent = 'Cerca cliente';
        g4.appendChild(g4l);
        const search = document.createElement('input');
        search.type = 'text';
        search.className = 'adm-filt-input';
        search.placeholder = 'Nome, telefono...';
        const origSearch = $('registroSearch');
        if (origSearch) search.value = origSearch.value || '';
        g4.appendChild(search);
        body.appendChild(g4);

        body._apply = () => {
            if (origFrom) origFrom.value = rFrom.value;
            if (origTo) origTo.value = rTo.value;
            // Se "personalizzato" è attivo, applica il range date
            const active = document.querySelector('.registro-date-btns .rfilter-btn.active');
            if (active && active.dataset.range === 'custom' && typeof window.applyRegistroCustomRange === 'function') {
                window.applyRegistroCustomRange();
            }
            if (origSearch && origSearch.value !== search.value) {
                origSearch.value = search.value;
                origSearch.dispatchEvent(new Event('input', { bubbles: true }));
            }
        };
        body._reset = () => {
            if (typeof window.resetRegistroFilters === 'function') window.resetRegistroFilters();
        };
    }

    function buildNotificheAdminFilters(body) {
        const tG = buildSelectAsPills({ selectId: 'msgFilterType', label: 'Tipo' });
        if (tG) body.appendChild(tG);
        const sG = buildSelectAsPills({ selectId: 'msgFilterStatus', label: 'Stato' });
        if (sG) body.appendChild(sG);

        const dg = document.createElement('div');
        dg.className = 'adm-filt-group';
        const dl = document.createElement('span');
        dl.className = 'adm-filt-label';
        dl.textContent = 'Data';
        dg.appendChild(dl);
        const dInp = document.createElement('input');
        dInp.type = 'date';
        dInp.className = 'adm-filt-date';
        const origD = $('msgFilterDate');
        if (origD) dInp.value = origD.value || '';
        dg.appendChild(dInp);
        body.appendChild(dg);

        body._apply = () => {
            if (origD && origD.value !== dInp.value) {
                origD.value = dInp.value;
                origD.dispatchEvent(new Event('change', { bubbles: true }));
            }
        };
        body._reset = () => {
            const t = $('msgFilterType'); if (t) t.value = '';
            const s = $('msgFilterStatus'); if (s) s.value = '';
            const d = $('msgFilterDate'); if (d) d.value = '';
            if (typeof window.loadMessaggi === 'function') window.loadMessaggi();
        };
    }

    function buildNotificheClientiFilters(body) {
        const tG = buildSelectAsPills({ selectId: 'cnFilterType', label: 'Tipo' });
        if (tG) body.appendChild(tG);
        const sG = buildSelectAsPills({ selectId: 'cnFilterStatus', label: 'Stato' });
        if (sG) body.appendChild(sG);

        const cg = document.createElement('div');
        cg.className = 'adm-filt-group';
        const cl = document.createElement('span');
        cl.className = 'adm-filt-label';
        cl.textContent = 'Cerca cliente';
        cg.appendChild(cl);
        const cInp = document.createElement('input');
        cInp.type = 'text';
        cInp.className = 'adm-filt-input';
        cInp.placeholder = 'Cerca cliente...';
        const origC = $('cnFilterClient');
        if (origC) cInp.value = origC.value || '';
        cg.appendChild(cInp);
        body.appendChild(cg);

        const dg = document.createElement('div');
        dg.className = 'adm-filt-group';
        const dl = document.createElement('span');
        dl.className = 'adm-filt-label';
        dl.textContent = 'Data';
        dg.appendChild(dl);
        const dInp = document.createElement('input');
        dInp.type = 'date';
        dInp.className = 'adm-filt-date';
        const origD = $('cnFilterDate');
        if (origD) dInp.value = origD.value || '';
        dg.appendChild(dInp);
        body.appendChild(dg);

        body._apply = () => {
            if (origC && origC.value !== cInp.value) {
                origC.value = cInp.value;
                origC.dispatchEvent(new Event('input', { bubbles: true }));
            }
            if (origD && origD.value !== dInp.value) {
                origD.value = dInp.value;
                origD.dispatchEvent(new Event('change', { bubbles: true }));
            }
        };
        body._reset = () => {
            const t = $('cnFilterType'); if (t) t.value = '';
            const s = $('cnFilterStatus'); if (s) s.value = '';
            const c = $('cnFilterClient'); if (c) c.value = '';
            const d = $('cnFilterDate'); if (d) d.value = '';
            if (typeof window.renderClientNotifTable === 'function') window.renderClientNotifTable();
        };
    }

    function buildRichiesteFilters(body) {
        const group = document.createElement('div');
        group.className = 'adm-filt-group';
        const lbl = document.createElement('span');
        lbl.className = 'adm-filt-label';
        lbl.textContent = 'Stato';
        group.appendChild(lbl);
        const pillsWrap = document.createElement('div');
        pillsWrap.className = 'adm-filt-pills';
        const origBtns = document.querySelectorAll('#richiesteFilterBar .filter-btn');
        origBtns.forEach(orig => {
            const pill = document.createElement('button');
            pill.type = 'button';
            pill.className = 'adm-filt-pill';
            pill.textContent = orig.textContent.trim();
            if (orig.classList.contains('active')) pill.classList.add('is-active');
            pill.addEventListener('click', () => {
                pillsWrap.querySelectorAll('.adm-filt-pill').forEach(p => p.classList.remove('is-active'));
                pill.classList.add('is-active');
                orig.click();
                setTimeout(() => closeSheet('admFiltersSheet', 'admFiltersBackdrop', 'admMbarFilter'), 150);
            });
            pillsWrap.appendChild(pill);
        });
        group.appendChild(pillsWrap);
        body.appendChild(group);
    }

    function renderFiltersSheet() {
        const body = $('admFiltersBody');
        if (!body) return;
        body.innerHTML = '';
        body._apply = null;
        body._reset = null;
        const tab = getActiveTab();
        const title = $('admFiltersTitle');

        if (tab === 'analytics') {
            if (title) title.textContent = 'Periodo';
            buildAnalyticsFilters(body);
            return;
        }
        if (tab === 'richieste') {
            if (title) title.textContent = 'Stato richieste';
            buildRichiesteFilters(body);
            return;
        }
        if (tab === 'clients') {
            if (title) title.textContent = 'Filtri clienti';
            buildClientsFilters(body);
            return;
        }
        if (tab === 'registro') {
            const sub = getActiveRegistroSubtab();
            if (sub === 'notifiche-admin') {
                if (title) title.textContent = 'Filtri notifiche admin';
                buildNotificheAdminFilters(body);
                return;
            }
            if (sub === 'notifiche-clienti') {
                if (title) title.textContent = 'Filtri notifiche clienti';
                buildNotificheClientiFilters(body);
                return;
            }
            if (title) title.textContent = 'Filtri registro';
            buildRegistroFilters(body);
            return;
        }
        if (title) title.textContent = 'Filtri';
        const empty = document.createElement('div');
        empty.className = 'adm-filt-empty';
        empty.textContent = 'Nessun filtro disponibile per questa sezione.';
        body.appendChild(empty);
    }

    /* ─── Swipe down per chiudere ────────────────────────────────────────── */

    function attachSwipeDown(sheet, onClose) {
        const handles = sheet.querySelectorAll('.adm-sheet-grabber, .adm-sheet-title');
        let startY = null;
        let dy = 0;
        function onStart(e) {
            const t = e.touches ? e.touches[0] : e;
            startY = t.clientY;
            dy = 0;
        }
        function onMove(e) {
            if (startY == null) return;
            const t = e.touches ? e.touches[0] : e;
            dy = t.clientY - startY;
            if (dy > 0) {
                sheet.style.transform = `translateY(${dy}px)`;
            }
        }
        function onEnd() {
            if (startY == null) return;
            sheet.style.transform = '';
            if (dy > 80) onClose();
            startY = null;
            dy = 0;
        }
        handles.forEach(h => {
            h.addEventListener('touchstart', onStart, { passive: true });
            h.addEventListener('touchmove', onMove, { passive: true });
            h.addEventListener('touchend', onEnd);
            h.addEventListener('touchcancel', onEnd);
        });
    }

    /* ─── Wiring ─────────────────────────────────────────────────────────── */

    function wire() {
        const btnPage = $('admMbarPage');
        const btnFilter = $('admMbarFilter');
        const pagesSheet = $('admPagesSheet');
        const filtersSheet = $('admFiltersSheet');
        const pagesBackdrop = $('admPagesBackdrop');
        const filtersBackdrop = $('admFiltersBackdrop');
        const applyBtn = $('admFiltersApply');
        const resetBtn = $('admFiltersReset');

        if (!btnPage || !btnFilter) return;

        btnPage.addEventListener('click', () => {
            renderPagesSheet();
            openSheet('admPagesSheet', 'admPagesBackdrop', 'admMbarPage');
        });
        btnFilter.addEventListener('click', () => {
            renderFiltersSheet();
            openSheet('admFiltersSheet', 'admFiltersBackdrop', 'admMbarFilter');
        });

        if (pagesBackdrop) pagesBackdrop.addEventListener('click', () =>
            closeSheet('admPagesSheet', 'admPagesBackdrop', 'admMbarPage'));
        if (filtersBackdrop) filtersBackdrop.addEventListener('click', () =>
            closeSheet('admFiltersSheet', 'admFiltersBackdrop', 'admMbarFilter'));

        if (pagesSheet) {
            const grab = pagesSheet.querySelector('.adm-sheet-grabber');
            if (grab) grab.addEventListener('click', () =>
                closeSheet('admPagesSheet', 'admPagesBackdrop', 'admMbarPage'));
            attachSwipeDown(pagesSheet, () =>
                closeSheet('admPagesSheet', 'admPagesBackdrop', 'admMbarPage'));
        }
        if (filtersSheet) {
            const grab = filtersSheet.querySelector('.adm-sheet-grabber');
            if (grab) grab.addEventListener('click', () =>
                closeSheet('admFiltersSheet', 'admFiltersBackdrop', 'admMbarFilter'));
            attachSwipeDown(filtersSheet, () =>
                closeSheet('admFiltersSheet', 'admFiltersBackdrop', 'admMbarFilter'));
        }

        if (applyBtn) applyBtn.addEventListener('click', () => {
            const body = $('admFiltersBody');
            if (body && typeof body._apply === 'function') body._apply();
            closeSheet('admFiltersSheet', 'admFiltersBackdrop', 'admMbarFilter');
        });
        if (resetBtn) resetBtn.addEventListener('click', () => {
            const body = $('admFiltersBody');
            if (body && typeof body._reset === 'function') body._reset();
            // Ricostruisce il sheet per riflettere lo stato dopo il reset
            setTimeout(renderFiltersSheet, 30);
        });

        // Escape chiude
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') closeAllSheets();
        });

        // Cambio tab → aggiorna label pagina + bottone filtri
        document.querySelectorAll('.admin-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                setTimeout(() => {
                    updatePageSwitcherLabel();
                    updateFilterButton();
                }, 0);
            });
        });

        // Cambio sub-tab registro
        document.querySelectorAll('.registro-subtab').forEach(sub => {
            sub.addEventListener('click', () => {
                setTimeout(updateFilterButton, 0);
            });
        });

        // Sync colore bottone al variare dei filtri originali
        const syncTargets = [
            '#clientsFilterChips',
            '.analytics-filter-bar',
            '.registro-filters',
        ];
        syncTargets.forEach(sel => {
            const root = document.querySelector(sel);
            if (!root) return;
            root.addEventListener('click', () => setTimeout(updateFilterButton, 10));
            root.addEventListener('change', () => setTimeout(updateFilterButton, 10));
            root.addEventListener('input', () => setTimeout(updateFilterButton, 10));
        });

        // Chiudi sheet al resize oltre 768px
        if (MQ && typeof MQ.addEventListener === 'function') {
            MQ.addEventListener('change', e => {
                if (!e.matches) closeAllSheets();
            });
        } else if (MQ && typeof MQ.addListener === 'function') {
            MQ.addListener(e => { if (!e.matches) closeAllSheets(); });
        }

        // Stato iniziale
        updatePageSwitcherLabel();
        updateFilterButton();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', wire);
    } else {
        wire();
    }
})();
