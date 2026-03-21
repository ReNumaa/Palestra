// ══════════════════════════════════════════════════════════════════════════
// ██  TAB MESSAGGI — Invio notifiche push dall'admin
// ══════════════════════════════════════════════════════════════════════════

function showMsgResultPopup(recipients, failed) {
    // Rimuovi popup precedente se esiste
    const old = document.getElementById('msgResultPopup');
    if (old) old.remove();
    const oldOverlay = document.getElementById('msgResultOverlay');
    if (oldOverlay) oldOverlay.remove();

    let html = '';
    if (recipients.length > 0) {
        html += `<div style="margin-bottom:${failed.length > 0 ? '1rem' : '0'}">`;
        html += `<div style="font-weight:600; color:#16a34a; margin-bottom:0.5rem;">✅ Notifica inviata a (${recipients.length}):</div>`;
        html += '<ul style="margin:0; padding-left:1.2rem; list-style:none;">';
        recipients.forEach(name => {
            html += `<li style="padding:0.25rem 0; font-size:0.95rem;">👤 ${name}</li>`;
        });
        html += '</ul></div>';
    }
    if (failed.length > 0) {
        html += '<div>';
        html += `<div style="font-weight:600; color:#dc2626; margin-bottom:0.5rem;">❌ Non recapitate (${failed.length}):</div>`;
        html += '<ul style="margin:0; padding-left:1.2rem; list-style:none;">';
        failed.forEach(name => {
            html += `<li style="padding:0.25rem 0; font-size:0.95rem;">👤 ${name}</li>`;
        });
        html += '</ul></div>';
    }
    if (recipients.length === 0 && failed.length === 0) {
        html = '<div style="color:#6b7280; text-align:center;">Nessun destinatario trovato.</div>';
    }

    const overlay = document.createElement('div');
    overlay.id = 'msgResultOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:9998;';
    overlay.onclick = (e) => { e.stopPropagation(); };

    const popup = document.createElement('div');
    popup.id = 'msgResultPopup';
    popup.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border-radius:16px;padding:1.5rem;max-width:400px;width:90%;max-height:70vh;overflow-y:auto;z-index:9999;box-shadow:0 20px 60px rgba(0,0,0,0.3);';
    popup.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
            <h3 style="margin:0; font-size:1.1rem;">📩 Risultato invio</h3>
            <button onclick="document.getElementById('msgResultOverlay').remove();document.getElementById('msgResultPopup').remove();" style="background:none;border:none;font-size:1.3rem;cursor:pointer;padding:0.25rem;">✕</button>
        </div>
        ${html}
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(popup);
}

function renderMessaggiTab() {
    const dateInput = document.getElementById('msgDate');
    if (dateInput && !dateInput.value) {
        const today = new Date();
        dateInput.value = today.toISOString().split('T')[0];
    }
}

function onMsgRecipientModeChange(mode) {
    const datePicker = document.getElementById('msgDatePicker');
    const timePicker = document.getElementById('msgTimePicker');
    datePicker.style.display = (mode === 'giorno' || mode === 'ora') ? 'block' : 'none';
    timePicker.style.display = mode === 'ora' ? 'block' : 'none';
    if (mode === 'giorno' || mode === 'ora') {
        const dateInput = document.getElementById('msgDate');
        if (!dateInput.value) {
            dateInput.value = new Date().toISOString().split('T')[0];
        }
        if (mode === 'ora') onMsgDateChange(dateInput.value);
    }
}

function onMsgDateChange(dateStr) {
    const select = document.getElementById('msgTimeSlot');
    select.innerHTML = '';
    if (!dateStr) {
        select.innerHTML = '<option value="">Seleziona una data</option>';
        return;
    }
    const d = new Date(dateStr + 'T00:00:00');
    const dayNames = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
    const dayName = dayNames[d.getDay()];
    const formatted = dateStr; // already YYYY-MM-DD
    const slots = getScheduleForDate(formatted, dayName);
    if (!slots || slots.length === 0) {
        select.innerHTML = '<option value="">Nessuno slot in questo giorno</option>';
        return;
    }
    slots.forEach(slot => {
        const opt = document.createElement('option');
        opt.value = slot.time;
        opt.textContent = slot.time + ' — ' + (slot.type === 'personal-training' ? 'Autonomia' : slot.type === 'small-group' ? 'Lezione di Gruppo' : 'Slot prenotato');
        select.appendChild(opt);
    });
}

async function sendAdminMessage() {
    const title = document.getElementById('msgTitle').value.trim();
    const body = document.getElementById('msgBody').value.trim();
    const mode = document.querySelector('input[name="msgRecipientMode"]:checked')?.value || 'tutti';
    const date = document.getElementById('msgDate')?.value || '';
    const time = document.getElementById('msgTimeSlot')?.value || '';
    const status = document.getElementById('msgStatus');

    if (!title || !body) {
        status.textContent = '⚠️ Inserisci titolo e messaggio.';
        status.style.color = '#dc2626';
        return;
    }
    if ((mode === 'giorno' || mode === 'ora') && !date) {
        status.textContent = '⚠️ Seleziona una data.';
        status.style.color = '#dc2626';
        return;
    }
    if (mode === 'ora' && !time) {
        status.textContent = '⚠️ Seleziona un orario.';
        status.style.color = '#dc2626';
        return;
    }

    const modeLabel = mode === 'tutti' ? 'tutti gli utenti' : mode === 'giorno' ? `iscritti del ${date}` : `iscritti ${date} alle ${time}`;
    if (!confirm(`Inviare la notifica a ${modeLabel}?`)) return;

    status.textContent = '⏳ Invio in corso...';
    status.style.color = '#6b7280';

    try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/send-admin-message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, body, mode, date, time })
        });
        const data = await res.json();
        if (data.ok) {
            status.textContent = `✅ Inviate ${data.sent} notifiche.`;
            status.style.color = '#16a34a';
            document.getElementById('msgTitle').value = '';
            document.getElementById('msgBody').value = '';
            showMsgResultPopup(data.recipients || [], data.failed || []);
        } else {
            status.textContent = `❌ Errore: ${data.error}`;
            status.style.color = '#dc2626';
        }
    } catch (e) {
        status.textContent = `❌ Errore di rete: ${e.message}`;
        status.style.color = '#dc2626';
    }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
// Questo è l'ultimo modulo admin-*.js a caricarsi: tutte le funzioni sono disponibili.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAdmin);
} else {
    initAdmin();
}

// Aggiorna i dati quando la pagina viene ripristinata dal bfcache (back/forward)
window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    const activeTab = document.querySelector('.admin-tab.active');
    if (activeTab) switchTab(activeTab.dataset.tab);
    _applyPrivacyMask();
});
