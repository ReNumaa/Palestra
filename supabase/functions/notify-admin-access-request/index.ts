// Edge Function: notify-admin-access-request
// Chiamata dal client per due eventi del flusso "richiesta accesso slot":
//   - event = "new"      → utente ha appena creato una nuova richiesta accesso
//                          (l'admin deve gestirla: offrire posto o ignorare)
//   - event = "accepted" → utente ha confermato un'offerta → nuova prenotazione
//                          effettiva nello slot (info per admin)
//
// In entrambi i casi:
//   1) manda push notification ai 2 admin (ADMIN_IDS, come notify-admin-booking)
//   2) inserisce la riga in admin_messages con sent_count = numero push effettive
//
// Per l'evento "declined" (utente rifiuta offerta) NON c'è push né log: la coda
// scorre da sola al prossimo, l'admin non ha azioni da fare.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const VAPID_PUBLIC_KEY  = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

webpush.setVapidDetails("mailto:palestra@thomasbresciani.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const ADMIN_IDS = [
    "ac72d54b-dea4-4159-9872-2bcb1662c486",
    "cf5f39f3-1581-40be-80e9-15b56acee337",
];

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SLOT_NAMES: Record<string, string> = {
    "small-group":       "Lezione di Gruppo",
    "personal-training": "Personal Training",
    "group-class":       "Slot prenotato",
};

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
    }
    try {
        const { event, name, date, date_display, time, slot_type, offer_source } = await req.json();

        if (!event || !name || !time) {
            return new Response(JSON.stringify({ ok: false, error: "event, name, time sono obbligatori" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }
        if (event !== "new" && event !== "accepted") {
            return new Response(JSON.stringify({ ok: false, error: "event non valido (atteso: new|accepted)" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const startTime = (time as string).split(" - ")[0]?.trim() ?? time;
        // Data sintetica D/M (es. "9/5"). Fallback: date_display o date raw.
        const dParts = (date as string || "").split("-");
        const shortDate = (dParts.length === 3)
            ? `${parseInt(dParts[2], 10)}/${parseInt(dParts[1], 10)}`
            : (date_display || date || "");

        let title: string;
        let body:  string;
        let tag:   string;
        let logType:  string;
        let logTitle: string;
        let logBody:  string;

        if (event === "new") {
            title    = `🔔 ${name}`;
            body     = `Chiede un posto (${shortDate})`;
            tag      = `admin-access-new-${date}-${startTime}-${name}`.replace(/\s/g, "-");
            logType  = "access_request_new";
            logTitle = "Nuova richiesta accesso";
            logBody  = `${name} chiede un posto (${shortDate})`;
        } else { // accepted
            title    = `✔️ ${name}`;
            body     = `Ha confermato (${shortDate})`;
            tag      = `admin-access-acc-${date}-${startTime}-${name}`.replace(/\s/g, "-");
            logType  = "access_request_user_accepted";
            logTitle = "Richiesta accesso confermata";
            logBody  = `${name} ha confermato (${shortDate})`;
        }

        const payload = JSON.stringify({
            title, body, tag,
            url: `/admin.html?date=${date}`,
        });

        // Push subscriptions dei 2 admin
        const { data: subs, error: subsErr } = await supabase
            .from("push_subscriptions")
            .select("endpoint, p256dh, auth, user_id")
            .in("user_id", ADMIN_IDS);
        if (subsErr) throw subsErr;

        let sent = 0;
        for (const sub of subs ?? []) {
            try {
                await webpush.sendNotification(
                    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                    payload,
                );
                sent++;
            } catch (e: any) {
                console.error(`[Push] Errore ${sub.endpoint.slice(-30)}:`, e.message);
                if (e.statusCode === 410 || e.statusCode === 404) {
                    await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
                }
            }
        }

        // Salva nel registro messaggi
        await supabase.from("admin_messages").insert({
            type:        logType,
            title:       logTitle,
            body:        logBody,
            client_name: name,
            date,
            time,
            slot_type,
            sent_count:  sent,
            extra:       offer_source ? { offer_source } : null,
        });

        console.log(`[notify-admin-access-request] event=${event} name=${name} sent=${sent}`);
        return new Response(JSON.stringify({ ok: true, sent }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (e: any) {
        console.error("[notify-admin-access-request] Errore:", e);
        return new Response(JSON.stringify({ ok: false, error: e.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
