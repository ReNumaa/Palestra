// Edge Function: notify-admin-topup
// Chiamata dal webhook Stripe dopo una ricarica credito confermata.
// Manda una push notification ai due admin con nome cliente e importo.

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

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
    }
    try {
        const { user_id, amount_eur, name: providedName, stripe_session_id } = await req.json();

        const amount = Number(amount_eur);
        if (!user_id || !amount || amount <= 0) {
            return new Response(JSON.stringify({ ok: false, error: "user_id e amount_eur sono obbligatori" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Recupera nome dal profilo se non passato dal caller
        let name = providedName;
        if (!name) {
            const { data: profile } = await supabase
                .from("profiles")
                .select("name")
                .eq("id", user_id)
                .maybeSingle();
            name = profile?.name || "Cliente";
        }

        const amountStr = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
        const title = `💰 ${name}`;
        const body  = `${amountStr}€ caricati`;

        const payload = JSON.stringify({
            title,
            body,
            tag: `admin-topup-${stripe_session_id || user_id}-${amountStr}`.replace(/\s/g, "-"),
            url: `/admin.html`,
        });

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

        await supabase.from("admin_messages").insert({
            type: "topup",
            title,
            body,
            client_name: name,
            sent_count: sent,
        });

        console.log(`[notify-admin-topup] ${sent} notifiche inviate per ${name} — ${amountStr}€`);
        return new Response(JSON.stringify({ ok: true, sent }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (e: any) {
        console.error("[notify-admin-topup] Errore:", e);
        return new Response(JSON.stringify({ ok: false, error: e.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
