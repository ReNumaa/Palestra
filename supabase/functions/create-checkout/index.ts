// Edge Function: create-checkout
// Crea una sessione Stripe Checkout per la ricarica credito.
// Chiamata dal client con Authorization: Bearer <JWT>.

import Stripe from "npm:stripe@17";
import { createClient } from "npm:@supabase/supabase-js@2";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") || "sk_test_PLACEHOLDER";
const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL          = Deno.env.get("SITE_URL") || "https://thomasbresciani.com";

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-12-18.acacia" });

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
        // Verify JWT — only authenticated users can create checkout sessions
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
            return new Response(JSON.stringify({ error: "Non autorizzato" }), {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        const token = authHeader.replace("Bearer ", "");
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            return new Response(JSON.stringify({ error: "Sessione non valida" }), {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const { amount, user_email, user_name } = await req.json();

        // Validate amount (minimum €50, integer)
        const amountCents = Math.round(Number(amount) * 100);
        if (!amount || amountCents < 5000) {
            return new Response(JSON.stringify({ error: "Importo minimo: €50" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Create Stripe Checkout session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            mode: "payment",
            line_items: [{
                price_data: {
                    currency: "eur",
                    unit_amount: amountCents,
                    product_data: {
                        name: "Ricarica credito palestra",
                        description: `Ricarica €${amount} — ${user_name || user_email || ""}`.trim(),
                    },
                },
                quantity: 1,
            }],
            customer_email: user_email || user.email,
            metadata: {
                supabase_user_id: user.id,
                amount_eur: String(amount),
            },
            success_url: `${SITE_URL}/prenotazioni.html?topup=success`,
            cancel_url:  `${SITE_URL}/prenotazioni.html?topup=cancel`,
        });

        return new Response(JSON.stringify({ url: session.url }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (e) {
        console.error("[create-checkout] Error:", e);
        return new Response(JSON.stringify({ error: "Errore interno" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
