// Edge Function: reconcile-stripe
// Endpoint admin-only per riconciliare top-up Stripe non arrivati in DB
// (webhook fallito o evento mai ricevuto).
// Interroga Stripe per le checkout session completate negli ultimi N giorni,
// confronta con credit_history.stripe_session_id e chiama la RPC idempotente
// stripe_topup_credit per quelle mancanti.

import Stripe from "npm:stripe@17";
import { createClient } from "npm:@supabase/supabase-js@2";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") || "";
const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-12-18.acacia" });

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(
    JSON.stringify(body),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
);

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
        // ─── Auth: solo admin ────────────────────────────────────────────────
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) return json({ error: "Non autorizzato" }, 401);

        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        const token = authHeader.replace("Bearer ", "");
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) return json({ error: "Sessione non valida" }, 401);

        const role = (user.app_metadata as Record<string, unknown> | null)?.role;
        if (role !== "admin") return json({ error: "Accesso negato" }, 403);

        // ─── Parametri ───────────────────────────────────────────────────────
        // days: finestra temporale da controllare (default 7, max 30)
        // dryRun: se true, ritorna solo l'elenco delle mancanti senza riconciliare
        let days = 7;
        let dryRun = false;
        try {
            const body = await req.json();
            if (Number.isFinite(body?.days)) days = Math.min(30, Math.max(1, Number(body.days)));
            if (body?.dryRun === true) dryRun = true;
        } catch { /* body opzionale */ }

        const sinceTs = Math.floor(Date.now() / 1000) - days * 86400;

        // ─── Query Stripe: checkout sessions recenti ─────────────────────────
        const candidates: Array<{
            id: string;
            user_id: string;
            amount_eur: number;
            created: number;
        }> = [];

        let startingAfter: string | undefined;
        // Safety cap: max 500 session per chiamata (Stripe pagina a 100).
        for (let page = 0; page < 5; page++) {
            const list: Stripe.ApiList<Stripe.Checkout.Session> = await stripe.checkout.sessions.list({
                created: { gte: sinceTs },
                limit: 100,
                starting_after: startingAfter,
            });
            for (const s of list.data) {
                if (s.status !== "complete") continue;
                if (s.payment_status !== "paid") continue;
                const uid    = s.metadata?.supabase_user_id;
                const amount = parseFloat(s.metadata?.amount_eur ?? "0");
                if (!uid || !(amount > 0)) continue;
                candidates.push({ id: s.id, user_id: uid, amount_eur: amount, created: s.created });
            }
            if (!list.has_more) break;
            startingAfter = list.data[list.data.length - 1]?.id;
            if (!startingAfter) break;
        }

        if (candidates.length === 0) {
            return json({ ok: true, checked: 0, reconciled: [], already_ok: [], errors: [] });
        }

        // ─── DB: quali session_id risultano gia' registrati? ─────────────────
        const ids = candidates.map(c => c.id);
        const { data: existing, error: selErr } = await supabase
            .from("credit_history")
            .select("stripe_session_id")
            .in("stripe_session_id", ids);
        if (selErr) return json({ error: "Errore DB: " + selErr.message }, 500);

        const known = new Set((existing ?? []).map(r => r.stripe_session_id).filter(Boolean) as string[]);
        const missing = candidates.filter(c => !known.has(c.id));

        if (dryRun) {
            return json({
                ok: true,
                dryRun: true,
                checked: candidates.length,
                missing: missing.map(m => ({
                    session_id: m.id,
                    user_id: m.user_id,
                    amount_eur: m.amount_eur,
                    created_at: new Date(m.created * 1000).toISOString(),
                })),
                already_ok: candidates.length - missing.length,
            });
        }

        // ─── Riconciliazione: chiama la RPC idempotente per ogni mancante ────
        const reconciled: Array<{ session_id: string; user_id: string; amount_eur: number }> = [];
        const errors:     Array<{ session_id: string; error: string }> = [];

        for (const m of missing) {
            const { error: rpcErr } = await supabase.rpc("stripe_topup_credit", {
                p_user_id: m.user_id,
                p_amount:  m.amount_eur,
                p_stripe_session_id: m.id,
            });
            if (rpcErr) {
                errors.push({ session_id: m.id, error: rpcErr.message });
            } else {
                reconciled.push({ session_id: m.id, user_id: m.user_id, amount_eur: m.amount_eur });
            }
        }

        return json({
            ok: true,
            checked: candidates.length,
            reconciled,
            already_ok: candidates.length - missing.length,
            errors,
        });
    } catch (e) {
        console.error("[reconcile-stripe] Error:", e);
        return json({ error: "Errore interno: " + (e as Error).message }, 500);
    }
});
