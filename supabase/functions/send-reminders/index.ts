// Edge Function: send-reminders
// Inviata da cron ogni 5 minuti.
// Trova le prenotazioni che iniziano fra ~1h e manda una push notification.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const VAPID_PUBLIC_KEY  = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

webpush.setVapidDetails("mailto:palestra@thomasbresciani.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Estrae i minuti dall'inizio del giorno dall'orario "HH:MM - HH:MM"
function parseStartMin(timeStr: string): number | null {
    const m = timeStr.match(/^(\d{1,2}):(\d{2})/);
    return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : null;
}

// Data e ora corrente in fuso Europe/Rome, spostata di +1 ora
function targetItaly(): { date: string; totalMin: number } {
    const oneHourLater = new Date(Date.now() + 40 * 60 * 1000);
    const fmt = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Rome",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hour12: false,
    });
    const parts = fmt.formatToParts(oneHourLater);
    const pv = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return {
        date:     `${pv("year")}-${pv("month")}-${pv("day")}`,
        totalMin: parseInt(pv("hour")) * 60 + parseInt(pv("minute")),
    };
}

Deno.serve(async (_req) => {
    try {
        const { date: targetDate, totalMin: targetMin } = targetItaly();
        const WINDOW = 12; // ±12 min — copre un'esecuzione del cron ogni 5 min con margine

        // Booking non ancora notificati per la data target
        const { data: bookings, error } = await supabase
            .from("bookings")
            .select("id, user_id, time, date_display")
            .eq("reminder_1h_sent", false)
            .in("status", ["confirmed", "cancellation_requested"])
            .eq("date", targetDate);

        if (error) throw error;

        const toNotify = (bookings ?? []).filter((b) => {
            const start = parseStartMin(b.time);
            return start !== null && Math.abs(start - targetMin) <= WINDOW;
        });

        let sent = 0;
        for (const booking of toNotify) {
            if (!booking.user_id) continue;

            // Trova le subscription push dell'utente
            const { data: subs } = await supabase
                .from("push_subscriptions")
                .select("endpoint, p256dh, auth")
                .eq("user_id", booking.user_id);

            if (!subs?.length) continue;

            const startTime = booking.time.split(" - ")[0]?.trim() ?? booking.time;
            const payload = JSON.stringify({
                title: "Thomas Bresciani Palestra",
                body:  `Promemoria: lezione fra 40 minuti (${startTime})`,
                tag:   `reminder-1h-${booking.id}`,
                url:   "/prenotazioni.html",
            });

            for (const sub of subs) {
                try {
                    await webpush.sendNotification(
                        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                        payload,
                    );
                    sent++;
                } catch (e: any) {
                    console.error(`[Push] Errore ${sub.endpoint.slice(-30)}:`, e.message);
                    // Subscription scaduta o non valida → rimuovi
                    if (e.statusCode === 410 || e.statusCode === 404) {
                        await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
                    }
                }
            }

            // Marca come notificato — non verrà ripreso nelle prossime esecuzioni
            await supabase.from("bookings").update({ reminder_1h_sent: true }).eq("id", booking.id);
        }

        console.log(`[send-reminders] ${sent} notifiche inviate per ${toNotify.length} prenotazioni`);
        return new Response(JSON.stringify({ ok: true, sent, checked: toNotify.length }), {
            headers: { "Content-Type": "application/json" },
        });
    } catch (e: any) {
        console.error("[send-reminders] Errore:", e);
        return new Response(JSON.stringify({ ok: false, error: e.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
});
