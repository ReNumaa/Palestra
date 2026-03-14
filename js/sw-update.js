// Auto-update service worker: rileva nuove versioni e ricarica la pagina
(function () {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(reg => {
        // Controlla aggiornamenti ogni 60 secondi
        setInterval(() => reg.update(), 60 * 1000);

        // Nuovo SW trovato (installing o waiting)
        function onNewSW(worker) {
            worker.addEventListener('statechange', () => {
                if (worker.state === 'activated') {
                    window.location.reload();
                }
            });
        }

        if (reg.waiting) onNewSW(reg.waiting);
        reg.addEventListener('updatefound', () => {
            if (reg.installing) onNewSW(reg.installing);
        });
    });

    // Quando un nuovo SW prende il controllo, ricarica
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
    });
})();
