// Edge Function: stripe-webhook
// Riceve i webhook da Stripe e accredita il saldo all'utente
// tramite la RPC stripe_topup_credit (idempotente).
// NON richiede Authorization header — usa la firma Stripe per la verifica.

import Stripe from "npm:stripe@17";
import { createClient } from "npm:@supabase/supabase-js@2";

const STRIPE_SECRET_KEY     = Deno.env.get("STRIPE_SECRET_KEY") || "";
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";
const SUPABASE_URL          = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY          = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204 });
    }

    try {
        if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
            return new Response("Stripe non configurato", { status: 503 });
        }

        const body = await req.text();
        const sig = req.headers.get("stripe-signature");

        if (!sig) {
            return new Response("Missing signature", { status: 400 });
        }

        // Verify Stripe webhook signature
        const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-12-18.acacia" });
        let event: Stripe.Event;
        try {
            event = await stripe.webhooks.constructEventAsync(body, sig, STRIPE_WEBHOOK_SECRET);
        } catch (err) {
            console.error("[stripe-webhook] Signature verification failed:", err);
            return new Response("Invalid signature", { status: 400 });
        }

        // Only handle successful checkout completions
        if (event.type !== "checkout.session.completed") {
            return new Response(JSON.stringify({ received: true }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        }

        const session = event.data.object as Stripe.Checkout.Session;

        // Skip if not paid
        if (session.payment_status !== "paid") {
            console.warn("[stripe-webhook] Session not paid:", session.id);
            return new Response(JSON.stringify({ received: true }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        }

        const userId    = session.metadata?.supabase_user_id;
        const amountEur = parseFloat(session.metadata?.amount_eur || "0");

        if (!userId || amountEur <= 0) {
            console.error("[stripe-webhook] Missing metadata:", { userId, amountEur });
            return new Response("Missing metadata", { status: 400 });
        }

        // Call the idempotent RPC to add credit
        const { data, error } = await supabase.rpc("stripe_topup_credit", {
            p_user_id: userId,
            p_amount: amountEur,
            p_stripe_session_id: session.id,
        });

        if (error) {
            console.error("[stripe-webhook] RPC error:", error);
            return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }

        console.log(`[stripe-webhook] Result for ${userId}:`, data);

        return new Response(JSON.stringify({ received: true, result: data }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (e) {
        console.error("[stripe-webhook] Unhandled error:", e);
        return new Response("Internal error", { status: 500 });
    }
});
