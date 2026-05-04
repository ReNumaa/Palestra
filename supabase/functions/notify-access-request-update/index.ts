// Edge Function: notify-access-request-update
// Manda una push notification a UN singolo utente quando:
//   - event = "slot_offered" → si è liberato un posto su uno slot per cui
//     l'utente aveva una richiesta pending; ora deve confermare in app.
//   - event = "approved"     → l'admin ha approvato manualmente la richiesta;
//     l'utente è stato aggiunto allo slot.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const VAPID_PUBLIC_KEY  = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

webpush.setVapidDetails("mailto:palestra@thomasbresciani.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SLOT_NAMES: Record<string, string> = {
    "small-group":       "Lezione di Gruppo",
    "personal-training": "Personal Training",
    "group-class":       "Allenamento di gruppo",
};

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
    }
    try {
        const { user_id, event, date, time, date_display, slot_type, source } = await req.json();

        if (!user_id || !event || !time) {
            return new Response(JSON.stringify({ ok: false, error: "user_id, event, time sono obbligatori" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }
        if (event !== "slot_offered" && event !== "approved") {
            return new Response(JSON.stringify({ ok: false, error: "event non valido" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Subscriptions del solo utente target
        const { data: subs, error } = await supabase
            .from("push_subscriptions")
            .select("endpoint, p256dh, auth, user_id")
            .eq("user_id", user_id);
        if (error) throw error;

        const slotName = SLOT_NAMES[slot_type] || "Lezione";
        const startTime = (time as string).split(" - ")[0]?.trim() ?? time;
        const giorni = ["domenica","lunedì","martedì","mercoledì","giovedì","venerdì","sabato"];
        let dayName = "";
        if (date) {
            const dt = new Date(date + "T00:00:00");
            dayName = giorni[dt.getDay()];
        }
        const whenText = date_display
            ? `${date_display} alle ${startTime}`
            : (dayName ? `${dayName} ${date} alle ${startTime}` : `${date} alle ${startTime}`);

        let title: string;
        let body:  string;
        let tag:   string;
        let url:   string;
        let notifType: string;

        if (event === "slot_offered") {
            if (source === "admin") {
                title = "La tua richiesta è stata approvata!";
                body  = `Conferma per essere aggiunto a ${slotName} · ${whenText}.`;
                notifType = "access_request_admin_offered";
            } else {
                title = "Si è liberato un posto!";
                body  = `${slotName} · ${whenText}. Apri l'app per confermare.`;
                notifType = "access_request_offered";
            }
            tag = `slot-offered-${user_id}-${date}-${startTime}`.replace(/\s/g, "-");
            url = "/prenotazioni.html";
        } else {
            title = "Richiesta approvata";
            body  = `Sei stato aggiunto a ${slotName} · ${whenText}.`;
            tag   = `access-approved-${user_id}-${date}-${startTime}`.replace(/\s/g, "-");
            url   = "/prenotazioni.html";
            notifType = "access_request_approved";
        }

        const payload = JSON.stringify({ title, body, tag, url });

        // Recupera nome/email per il log
        const { data: profile } = await supabase
            .from("profiles")
            .select("name, email")
            .eq("id", user_id)
            .maybeSingle();
        const userName  = (profile?.name  as string) || "";
        const userEmail = (profile?.email as string) || "";

        let sent = 0;
        let lastError = "";
        for (const sub of subs ?? []) {
            try {
                await webpush.sendNotification(
                    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                    payload,
                );
                sent++;
            } catch (e: any) {
                console.error(`[Push] Errore ${sub.endpoint.slice(-30)}:`, e.message);
                lastError = e.message;
                if (e.statusCode === 410 || e.statusCode === 404) {
                    await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
                }
            }
        }

        // Log notifica
        const status = sent > 0
            ? "sent"
            : ((subs?.length ?? 0) === 0 ? "no_subscription" : "failed");
        await supabase.from("client_notifications").insert({
            user_id, user_name: userName, user_email: userEmail,
            type: notifType, title, body,
            status, error: status === "failed" ? lastError : null,
            booking_date: date || null, booking_time: time || null,
        });

        console.log(`[notify-access-request-update] event=${event} user=${user_id} sent=${sent}`);
        return new Response(JSON.stringify({ ok: true, sent }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (e: any) {
        console.error("[notify-access-request-update] Errore:", e);
        return new Response(JSON.stringify({ ok: false, error: e.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
