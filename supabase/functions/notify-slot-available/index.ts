// Edge Function: notify-slot-available
// Chiamata dal client quando una prenotazione viene annullata.
// Manda una push notification a tutti gli utenti tranne chi ha annullato.

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
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
    }
    try {
        const { date_display, time, exclude_user_id } = await req.json();

        if (!date_display || !time) {
            return new Response(JSON.stringify({ ok: false, error: "date_display e time sono obbligatori" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Tutte le subscription push tranne quella di chi ha annullato
        let query = supabase.from("push_subscriptions").select("endpoint, p256dh, auth, user_id");
        if (exclude_user_id) {
            query = query.neq("user_id", exclude_user_id);
        }
        const { data: subs, error } = await query;
        if (error) throw error;

        const startTime = time.split(" - ")[0]?.trim() ?? time;
        const payload = JSON.stringify({
            title: "Slot Disponibile!",
            body:  `${date_display} alle ${startTime} — prenota ora`,
            tag:   `slot-available-${date_display}-${startTime}`.replace(/\s/g, "-"),
            url:   "/index.html",
        });

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

        console.log(`[notify-slot-available] ${sent} notifiche inviate per ${date_display} ${startTime}`);
        return new Response(JSON.stringify({ ok: true, sent }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (e: any) {
        console.error("[notify-slot-available] Errore:", e);
        return new Response(JSON.stringify({ ok: false, error: e.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
