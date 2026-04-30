// Edge Function: generate-monthly-report
// Genera un report mensile AI personalizzato per un cliente, basato sui dati
// aggregati da generate_monthly_scorecard() e passati a Claude Haiku.
//
// Modello mentale:
// - Il cliente sceglie 1 dei 6 OBIETTIVI (dimagrimento, massa, tonificazione,
//   forza, salute, recupero). L'obiettivo determina:
//     · tono e registro del report
//     · soglia di frequenza minima per "fare risultati"
//     · enfasi sul piano alimentare come moltiplicatore
//     · cosa il report deve guardare nei log
// - I dati provengono ESCLUSIVAMENTE da bookings + workout_logs. Nessuna
//   metrica antropometrica (peso, BF%, kcal): non l'abbiamo, non si menziona.
// - Output strutturato in 3 sezioni fisse (markdown):
//     · "Numeri del mese"
//     · "Cosa dicono i dati"
//     · "Obiettivo del mese prossimo"

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

// ─────────────────────────────────────────────────────────────────────
// OBIETTIVI — blocchi operativi distillati dai .md di "Obiettivi Palestra".
// Ogni blocco contiene SOLO ciò che può essere collegato ai dati reali
// (frequenza, log esercizi, costanza). Tutto il resto (BF%, kcal, esami)
// resta knowledge interna e NON va nel prompt.
// ─────────────────────────────────────────────────────────────────────

interface GoalSpec {
    id: string;
    label: string;
    minWeeklyFreq: number; // soglia sotto la quale "i risultati non si vedono"
    nutritionEmphasis: "primary" | "secondary" | "minimal"; // quanto insistere
    spec: string; // testo che entra nel prompt
}

const GOALS: Record<string, GoalSpec> = {
    dimagrimento: {
        id: "dimagrimento",
        label: "Dimagrimento",
        minWeeklyFreq: 3,
        nutritionEmphasis: "primary",
        spec: `OBIETTIVO: Dimagrimento (riduzione massa grassa preservando muscolo)
Frequenza minima per risultati visibili: 3-4 allenamenti registrati/settimana.
Cosa guardare nei log:
  · costanza settimanale di allenamenti registrati (la leva n.1)
  · presenza di multiarticolari (squat, stacchi, panca, trazioni, rematori, military)
  · mantenimento dei carichi (in deficit non si pretende progresso, mantenere è già successo)
Tono richiesto: caloroso, orientato al fare. NON moralista sul peso.
NON menzionare mai numeri su peso, kcal, % grasso, dieta specifica: non li abbiamo.
ALIMENTAZIONE — leva PRIMARIA: il dimagrimento è 80% alimentazione.
  Inserire SEMPRE nel report una frase sul piano alimentare come moltiplicatore
  ("senza un piano alimentare strutturato in deficit moderato i progressi
  restano marginali, anche con allenamento perfetto").`,
    },

    massa: {
        id: "massa",
        label: "Aumento Massa",
        minWeeklyFreq: 3,
        nutritionEmphasis: "primary",
        spec: `OBIETTIVO: Aumento Massa Muscolare (ipertrofia)
Frequenza minima: 3 sessioni/settimana, idealmente 4-5 per intermedi.
Ogni gruppo muscolare va stimolato 2 volte/settimana.
Cosa guardare nei log:
  · progressive overload sui multiarticolari (carico in salita nel mese)
  · volume per gruppo muscolare (set settimanali, 10-20 set/muscolo è il sweet spot)
  · presenza di esercizi su tutti i pattern (push, pull, gambe, core)
  · esercizi solo "1 volta nel mese" → segnalare come gap (no progresso possibile)
Tono richiesto: tecnico ma stimolante, orientato alla crescita.
ALIMENTAZIONE — leva PRIMARIA: senza surplus calorico controllato + proteine
  adeguate non c'è ipertrofia. Insistere SEMPRE: "il muscolo si costruisce
  in cucina almeno quanto in palestra".`,
    },

    tonificazione: {
        id: "tonificazione",
        label: "Tonificazione",
        minWeeklyFreq: 3,
        nutritionEmphasis: "primary",
        spec: `OBIETTIVO: Tonificazione e Ricomposizione Corporea
La "tonificazione" significa: lieve aumento massa magra + riduzione massa grassa,
peso quasi invariato. Richiede pesi, NON solo cardio.
Frequenza minima: 3-4 sessioni/settimana di pesistica.
Cosa guardare nei log:
  · costanza (è il driver principale di una ricomposizione)
  · mix multiarticolari + isolamento (specie core, glutei, spalle posteriori)
  · varietà dei gruppi stimolati (full-body coverage)
  · stabilità dei carichi (mai cali significativi)
Tono richiesto: rassicurante, orientato al cambiamento progressivo e visibile.
Smonta esplicitamente il mito "solo cardio per tonificare".
ALIMENTAZIONE — leva PRIMARIA: ricomposizione = mantenimento o lieve deficit
  CON proteine alte (1,8-2 g/kg). Insistere SEMPRE: senza un piano alimentare
  i pesi da soli non bastano.`,
    },

    forza: {
        id: "forza",
        label: "Forza",
        minWeeklyFreq: 2,
        nutritionEmphasis: "secondary",
        spec: `OBIETTIVO: Forza e Performance
Aumento dei carichi massimali sui movimenti fondamentali.
Frequenza minima: 2-3 sessioni/settimana (la forza tollera meno volume ma più intensità).
Cosa guardare nei log:
  · 1RM stimato o carichi top set sui fondamentali (squat, panca, stacco, military, trazione)
  · progressione carico nel mese (anche +2,5kg/+5kg sono progresso reale)
  · presenza di set a carichi alti sui fondamentali
  · recuperi adeguati tra le sessioni dei main lift (no due squat pesanti consecutivi)
Tono richiesto: diretto, tecnico, da coach esperto. Nessun fronzolo.
Numeri sempre puntuali, mai vaghi.
ALIMENTAZIONE — leva SECONDARIA: forza tollera deficit minimi e mantenimento.
  Menzionare l'alimentazione 1 volta su 2 report, focalizzata su recupero
  (proteine, carboidrati pre-workout, sonno).`,
    },

    salute: {
        id: "salute",
        label: "Salute e Benessere",
        minWeeklyFreq: 2,
        nutritionEmphasis: "secondary",
        spec: `OBIETTIVO: Benessere e Salute Generale
Migliorare marker metabolici, cardiovascolari, posturali. Costruire abitudine.
Frequenza minima OMS: 2 sessioni/settimana di forza + 150 min/sett aerobica
moderata. Per chi parte da sedentarietà: 2/sett è già una vittoria.
Cosa guardare nei log:
  · semplicemente: c'è costanza? Quanti allenamenti?
  · varietà di pattern (cardiovascolare + forza + mobilità)
  · presenza di multiarticolari basici (movimenti naturali per la vita quotidiana)
Tono richiesto: incoraggiante, accessibile, nessun gergo da palestra.
Valorizzare anche piccoli risultati (es. "sei passato da 0 a 2/sett").
ALIMENTAZIONE — leva SECONDARIA: stile mediterraneo come framework.
  Menzionare 1 volta ogni 2 report, in chiave di benessere generale,
  non di performance.`,
    },

    recupero: {
        id: "recupero",
        label: "Recupero Funzionale",
        minWeeklyFreq: 2,
        nutritionEmphasis: "minimal",
        spec: `OBIETTIVO: Recupero Funzionale e Postura
Ripristinare ROM, riequilibrare tonicità muscolare, ridurre dolore.
Frequenza minima: 2 sessioni/settimana di lavoro mirato.
Cosa guardare nei log:
  · costanza (in riabilitazione la regolarità conta più dell'intensità)
  · progressione DOLCE (mai picchi di carico)
  · presenza di lavoro su mobilità, core, attivazione (non solo "alzata di pesi")
Tono richiesto: paziente, rassicurante. Nessuna competitività, nessuna
ironia sui carichi bassi (sono volutamente bassi). Valorizza precisione
tecnica e costanza.
ALIMENTAZIONE — leva MINIMA: NON menzionare l'alimentazione in questo report
salvo si tratti di un cenno breve su recupero (proteine, idratazione).
NON dare consigli medici, mai.`,
    },
};

// ─────────────────────────────────────────────────────────────────────
// PROMPT BUILDING
// Strategia: il system prompt è (quasi) statico — viene messo in cache
// Anthropic. La parte specifica per goal/tipo è breve in coda.
// ─────────────────────────────────────────────────────────────────────

const TYPE_INSTRUCTIONS: Record<string, string> = {
    no_data: `REPORT TYPE: NO DATA.
Il cliente ha ZERO allenamenti registrati nel mese.
Produci un messaggio BREVE (80-120 parole) che:
  · riconosca il mese senza giudizio (niente colpe, niente "dove sei stato?")
  · proponga di ripartire con 1 solo allenamento la settimana entrante
  · chiuda in modo rispettoso
NON scrivere un vero report. NON menzionare esercizi che non esistono.`,

    encouragement: `REPORT TYPE: ENCOURAGEMENT (pochi dati).
Il cliente ha 1-2 allenamenti registrati — sotto la soglia minima per un report pieno.
Produci un report BREVE (150-220 parole) che:
  · valorizzi gli allenamenti fatti e gli esercizi eseguiti (citali per nome)
  · NON faccia confronti statistici (base troppo piccola, sarebbero fuorvianti)
  · spieghi che con questa frequenza i risultati legati all'obiettivo non possono
    ancora manifestarsi: serve raggiungere almeno la soglia minima del goal
  · chiuda con un obiettivo minimo e raggiungibile per il mese successivo`,

    first_month: `REPORT TYPE: FIRST MONTH.
Primo mese del cliente con dati di allenamento utili.
Nessun confronto possibile col mese precedente.
Produci un report (250-350 parole) che:
  · apra riconoscendo che è la baseline ufficiale
  · descriva i pattern emersi: gruppi muscolari lavorati, esercizi, distribuzione
    carichi vs corpo libero, varietà
  · valorizzi la costanza su esercizi ripetuti 2+ volte
  · tratti con cautela esercizi fatti 1 sola volta (mai "stai progredendo",
    piuttosto "hai testato")
  · chiuda con un obiettivo SEMPLICE per il mese successivo, allineato al goal
NON usare le parole "progressione" o "regressione": non c'è confronto possibile.`,

    full: `REPORT TYPE: FULL.
Il cliente ha dati sia nel mese corrente che nel precedente.
Produci un report completo (300-400 parole) che:
  · apra citando 2-3 progressi concreti dal blocco DELTA con numeri esatti
  · identifichi 1-2 pattern interessanti (volume per gruppo muscolare,
    distribuzione del lavoro, costanza)
  · segnali 1 area di attenzione (stallo, regressione, esercizi fatti
    una volta sola)
  · commenti l'andamento della frequenza degli allenamenti registrati
    rispetto al mese precedente, se entrambi i mesi hanno almeno 3 log
  · chiuda con 1-2 obiettivi concreti e misurabili per il mese successivo
Ogni progresso/stallo/regressione citato deve usare i numeri esatti dal DELTA.`,
};

// La parte STATICA del system prompt (cacheable, ~stabile).
const BASE_SYSTEM_STATIC = `Sei l'assistente AI di Thomas Bresciani Personal Training.
Compito: scrivere un report mensile personalizzato per un cliente, basato
ESCLUSIVAMENTE sui dati JSON forniti nel blocco [SCORECARD] del messaggio.

═══════════════════════════════════════════════════════════════════════
REGOLE ASSOLUTE (mai violare)
═══════════════════════════════════════════════════════════════════════
1. Ogni affermazione concreta deve essere ancorata a un numero o un fatto
   presente nei dati. Vietate frasi vaghe ("stai andando bene", "ottimo
   lavoro in generale").
2. Se un dato NON è presente, NON menzionarlo. Mai inventare esercizi,
   carichi, RPE, note del trainer, progressi, peso, BF%, calorie.
3. NON dare consigli medici, nutrizionali specifici, integrazione,
   gestione infortuni.
4. NON citare nomi di altri clienti, trainer, persone non presenti nei dati.
5. Italiano. Apri SEMPRE rivolgendoti al cliente per nome (è nei dati).

═══════════════════════════════════════════════════════════════════════
INTERPRETAZIONE DEI DATI — FONTE UNICA: I LOG
═══════════════════════════════════════════════════════════════════════
Il dato di riferimento di TUTTO il report sono gli "allenamenti registrati"
(workout_logs): le sessioni in cui il cliente ha INSERITO i carichi nello
scheda. Le prenotazioni / annullamenti delle lezioni NON entrano nel
report (sono fuorvianti — un annullamento può avere mille motivi).

- TERMINOLOGIA per il cliente: "allenamenti registrati" (NON "sessioni
  loggate"). Il campo JSON è sessions_logged_count, in italiano si
  scrive "allenamenti registrati / segnati".
- Frequenza (avg_sessions_per_week) e categoria frequenza
  (frequency_category) sono CALCOLATE SUI LOG, non sulle prenotazioni.
- NON parlare MAI di: aderenza, sessioni completate, sessioni cancellate,
  prenotazioni, percentuali di presenza. Quei dati non ci sono e non
  vanno menzionati nemmeno come ipotesi.
- NON parlare MAI di "ripetizioni" o "reps totali": il numero di reps
  non viene fornito. Parla di carichi, set, costanza, varietà.
- Esercizio con max_weight = null o 0 → CORPO LIBERO. NON dire "carico
  fermo a 0kg". Parla di volume (set), costanza, presenza nel mese.
- Esercizio con sessions_logged = 1 → TEST SINGOLO, non progressione.
- delta.trend = "new" → esercizio NUOVO. Non è progressione, è inserimento.
- delta.trend = "stable" con weight_change = 0 → STALLO, non regressione.

═══════════════════════════════════════════════════════════════════════
FREQUENZA E "FAR VENIRE DI PIÙ" (priorità del business)
═══════════════════════════════════════════════════════════════════════
Il valore "frequency_category" indica la fascia di allenamenti registrati
per settimana. "freq_gap_vs_goal" è la distanza dalla soglia minima del
goal (es. -1.5 = 1,5 allenamenti/sett sotto soglia).

Se frequency_category = BASSA o MEDIA-BASSA → il messaggio centrale del
report deve essere: aumentare la frequenza degli allenamenti registrati
è la singola leva più efficace per vedere risultati legati al goal.
Non moralista, non colpevolizzante, ma esplicito.

Esempi (adatta al tono del goal):
  · "I tuoi 1,2 allenamenti registrati/settimana stanno costruendo
    abitudine, ma per vedere il dimagrimento muoversi davvero servono
    almeno 3."
  · "Sopra i 2 allenamenti registrati/settimana il corpo inizia a
    rispondere in modo visibile: oggi sei a 1,5."

Se frequency_category = MEDIA o ALTA → NON spingere ulteriormente.
Valorizza la costanza e parla di qualità (carichi, varietà, recupero).

═══════════════════════════════════════════════════════════════════════
CONTESTUALIZZAZIONE DALLA SCHEDA
═══════════════════════════════════════════════════════════════════════
Il blocco scorecard può contenere "plans_used" con il nome delle schede
attive. Il nome rivela il contesto. Adatta tono e aspettative:
  · scheda con "recupero", "post infortunio", "rehab", "mobilità" → fase
    riabilitativa, non parlare di progressione carichi come obiettivo
    primario
  · scheda con "preparazione gara", "peak", "agonismo" → fase performance
  · scheda con "base", "introduzione", "principiante" → fase apprendimento,
    nessuna pressione su carichi
  · nome generico → tono standard del goal
Se più schede sono presenti, contesto = scheda con più sessioni.
NON citare LETTERALMENTE i nomi delle schede nel report (sono tecnici).
Usa il contesto per modulare il REGISTRO.

═══════════════════════════════════════════════════════════════════════
FORMATTAZIONE — STRUTTURA OBBLIGATORIA
═══════════════════════════════════════════════════════════════════════
Il report deve seguire ESATTAMENTE questa struttura markdown:

  Apertura: 1-2 frasi di saluto al cliente per nome (NO heading).

  ## Numeri del mese
  3-5 righe con i dati salienti (allenamenti registrati nel mese,
  frequenza media settimanale calcolata sui log, eventuale delta del
  numero di allenamenti registrati vs mese precedente). Pesa solo i
  numeri rilevanti per il goal: per dimagrimento = costanza dei log;
  per forza = carichi top + costanza; per massa = volume e progressi;
  per salute = costanza; per recupero = costanza e varietà del lavoro.
  NON menzionare aderenza, prenotazioni, cancellazioni, ripetizioni.

  ## Cosa dicono i dati
  Paragrafo discorsivo (180-280 parole, modulato dal REPORT TYPE).
  Lega i numeri al goal scelto. Cita esercizi specifici per nome
  (Title Case italiano). Solleva 1 pattern positivo + 1 area di
  attenzione. Inserisci, dove pertinente, il messaggio sulla frequenza
  e — secondo la regola del goal — il messaggio sul piano alimentare.

  ## Obiettivo del mese prossimo
  1-2 obiettivi CONCRETI E MISURABILI (es. "portare la frequenza da 1,5
  a 2,5 allenamenti/settimana", "aggiungere uno squat con 5kg in più").
  NIENTE liste lunghe, niente programmi dettagliati: 1-2 punti netti.

Riformatta i nomi esercizi in Title Case italiano (es. "UN GAMBA
ESTENSIONE" → "Estensione Gamba") prima di citarli.
Markdown pulito, paragrafi scorrevoli. Niente liste puntate tranne se
strettamente necessario per dati specifici.

═══════════════════════════════════════════════════════════════════════
SLOT DI PERSONALIZZAZIONE
═══════════════════════════════════════════════════════════════════════
Il messaggio utente conterà:
- Il blocco [GOAL_SPEC]: linee guida del goal scelto (tono, frequenza
  minima, regola sull'alimentazione, cosa guardare nei log).
- Il blocco [REPORT_TYPE]: lunghezza e impostazione del report.
- Il blocco [SCORECARD]: i dati JSON.

Le linee guida del [GOAL_SPEC] hanno priorità sul tono "default" di
questo system prompt.`;

function buildUserPrefix(goal: GoalSpec, reportType: string): string {
    return `[GOAL_SPEC]
${goal.spec}

[REPORT_TYPE]
${TYPE_INSTRUCTIONS[reportType] ?? TYPE_INSTRUCTIONS.full}

`;
}

function titleCaseIt(str: string | null | undefined): string {
    if (!str) return "";
    return str.toLowerCase().split(/\s+/)
        .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
        .join(" ");
}

function freqLabel(avgPerWeek: number): string {
    if (avgPerWeek === 0) return "NESSUNA";
    if (avgPerWeek < 1.5) return "BASSA";
    if (avgPerWeek < 2.5) return "MEDIA-BASSA";
    if (avgPerWeek < 3.5) return "MEDIA";
    return "ALTA";
}

// Compone il messaggio utente: prefisso (goal + report type) + scorecard
// LIMITATA AI LOG (no bookings/aderenza, no ripetizioni). Frequenza
// calcolata sui log, non sulle prenotazioni.
function buildUserMessage(
    scorecard: any,
    userName: string,
    goal: GoalSpec,
    reportType: string,
): string {
    const c = scorecard.current ?? {};
    const p = scorecard.previous ?? {};
    const sessionsLogged = c.sessions_logged_count ?? 0;
    const sessionsLoggedPrev = p.sessions_logged_count ?? 0;
    // Frequenza calcolata sui LOG, non sui bookings.completed.
    const avgPerWeek = sessionsLogged > 0
        ? Number((sessionsLogged / 4.33).toFixed(2))
        : 0;
    const avgPerWeekPrev = sessionsLoggedPrev > 0
        ? Number((sessionsLoggedPrev / 4.33).toFixed(2))
        : 0;
    const freqGapVsGoal = Number((avgPerWeek - goal.minWeeklyFreq).toFixed(2));

    // Normalizza nomi esercizi (Title Case) e rimuove total_reps_sum: il
    // numero di ripetizioni non va menzionato nel report (richiesta esplicita).
    const stripReps = (ex: any) => {
        const { total_reps_sum: _drop, ...rest } = ex ?? {};
        return { ...rest, exercise_name: titleCaseIt(rest.exercise_name) };
    };
    const exercises = (c.exercises ?? []).map(stripReps);
    const deltaExercises = (scorecard.delta?.exercises ?? []).map(stripReps);

    // Ricostruisce blocchi current/previous/delta SENZA bookings, senza
    // adherence_pct_change e senza i campi reps. Il report non deve mai
    // riferirsi a prenotazioni o aderenza.
    const { bookings: _cb, ...cRest } = c;
    const { bookings: _pb, ...pRest } = p;
    const dRaw = scorecard.delta ?? {};
    const { adherence_pct_change: _ad, ...dRest } = dRaw;

    const enriched = {
        year_month: scorecard.year_month,
        previous_year_month: scorecard.previous_year_month,
        metadata: scorecard.metadata,
        client_name: userName,
        goal: goal.id,
        goal_min_weekly_freq: goal.minWeeklyFreq,
        avg_sessions_per_week: avgPerWeek,
        avg_sessions_per_week_previous: avgPerWeekPrev,
        frequency_category: freqLabel(avgPerWeek),
        freq_gap_vs_goal: freqGapVsGoal,
        current: { ...cRest, exercises },
        previous: pRest,
        delta: { ...dRest, exercises: deltaExercises },
    };

    return buildUserPrefix(goal, reportType) +
        `[SCORECARD]\n\`\`\`json\n${JSON.stringify(enriched, null, 2)}\n\`\`\`\n\n` +
        `Scrivi ora il report mensile per ${userName}, seguendo le REGOLE ASSOLUTE, ` +
        `il [GOAL_SPEC] e il [REPORT_TYPE]. Rispetta la struttura markdown a 3 sezioni ` +
        `(Numeri del mese, Cosa dicono i dati, Obiettivo del mese prossimo).`;
}

// ─────────────────────────────────────────────────────────────────────
// ANTHROPIC API (con prompt caching del system prompt statico)
// ─────────────────────────────────────────────────────────────────────

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_INPUT_COST_PER_MTOK = 1.0;
const ANTHROPIC_OUTPUT_COST_PER_MTOK = 5.0;
// Cache hit costa il 10% del prezzo input normale (cache read).
const ANTHROPIC_CACHE_READ_COST_PER_MTOK = 0.1;
// Cache write costa il 125% del prezzo input normale.
const ANTHROPIC_CACHE_WRITE_COST_PER_MTOK = 1.25;

interface AnthropicResult {
    text: string;
    input_tokens: number;
    output_tokens: number;
    cache_creation_tokens: number;
    cache_read_tokens: number;
    cost_usd: number;
}

async function callAnthropic(
    systemStatic: string,
    userMessage: string,
): Promise<AnthropicResult> {
    if (!ANTHROPIC_API_KEY) {
        throw new Error("ANTHROPIC_API_KEY non configurata nei secrets di Supabase");
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
            model: ANTHROPIC_MODEL,
            max_tokens: 1500,
            // System come array di blocchi: il blocco statico è marcato per
            // il caching. La generazione successiva entro 5' costa il 10%
            // sui token cached.
            system: [
                {
                    type: "text",
                    text: systemStatic,
                    cache_control: { type: "ephemeral" },
                },
            ],
            messages: [{ role: "user", content: userMessage }],
        }),
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Anthropic API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const text: string = data.content?.[0]?.text ?? "";
    const u = data.usage ?? {};
    const input_tokens: number = u.input_tokens ?? 0;
    const output_tokens: number = u.output_tokens ?? 0;
    const cache_creation_tokens: number = u.cache_creation_input_tokens ?? 0;
    const cache_read_tokens: number = u.cache_read_input_tokens ?? 0;

    const cost_usd =
        (input_tokens / 1_000_000) * ANTHROPIC_INPUT_COST_PER_MTOK +
        (cache_creation_tokens / 1_000_000) * ANTHROPIC_CACHE_WRITE_COST_PER_MTOK +
        (cache_read_tokens / 1_000_000) * ANTHROPIC_CACHE_READ_COST_PER_MTOK +
        (output_tokens / 1_000_000) * ANTHROPIC_OUTPUT_COST_PER_MTOK;

    return {
        text,
        input_tokens,
        output_tokens,
        cache_creation_tokens,
        cache_read_tokens,
        cost_usd,
    };
}

// ─────────────────────────────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (req.method !== "POST") {
        return json({ error: "Method not allowed" }, 405);
    }

    try {
        // ── Auth: JWT richiesto (admin o cliente self-service) ────────
        const authHeader = req.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return json({ error: "Missing or invalid Authorization header" }, 401);
        }
        const token = authHeader.slice("Bearer ".length).trim();

        const { data: authData, error: authErr } = await supabase.auth.getUser(token);
        if (authErr || !authData.user) {
            return json({ error: "Invalid token" }, 401);
        }

        const isAdmin = (authData.user.app_metadata as any)?.role === "admin";
        // Allow-list di utenti non-admin abilitati alla feature durante la
        // fase di test/refinement. Tenere allineata con js/allenamento-report.js.
        const REPORT_BETA_USER_IDS = new Set<string>([
            "eeb4eaf2-0ba0-423e-a345-22aae5f1682f",
        ]);
        const isBetaUser = REPORT_BETA_USER_IDS.has(authData.user.id);

        // ── Parse body ────────────────────────────────────────────────
        let body: any;
        try {
            body = await req.json();
        } catch {
            return json({ error: "Invalid JSON body" }, 400);
        }

        const {
            user_id,
            year_month,
            goal: goalId,
            skip_consent_check = false,
            force_regenerate = false,
        } = body;

        if (!user_id || !year_month) {
            return json({ error: "Missing required fields: user_id, year_month" }, 400);
        }
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(year_month)) {
            return json({ error: "Invalid year_month format, expected YYYY-MM" }, 400);
        }
        if (!goalId || !GOALS[goalId]) {
            return json({
                error: `Missing or invalid goal. Valid: ${Object.keys(GOALS).join(", ")}`,
                code: "INVALID_GOAL",
            }, 400);
        }
        const goal = GOALS[goalId];

        // ⚠️ TEMPORANEO: feature ancora gated agli admin (+ allow-list beta)
        // durante refinement. Rimuovere quando si vuole aprire a tutti.
        if (!isAdmin && !isBetaUser) {
            return json({
                error: "La generazione report è attualmente in beta e non ancora abilitata per il tuo profilo.",
                code: "ADMIN_ONLY_TEMPORARY",
            }, 403);
        }

        // Un beta-user può generare SOLO il proprio report (un admin può
        // generare per chiunque). Difesa in profondità: bloccare cross-user.
        if (!isAdmin && isBetaUser && body?.user_id !== authData.user.id) {
            return json({
                error: "Puoi generare solo il tuo report.",
                code: "NOT_AUTHORIZED_FOR_USER",
            }, 403);
        }

        // ── Carica profilo utente target ──────────────────────────────
        const { data: profile, error: profErr } = await supabase
            .from("profiles")
            .select("id, name, email, report_ai_consent")
            .eq("id", user_id)
            .single();

        if (profErr || !profile) {
            return json({ error: "User not found", code: "USER_NOT_FOUND" }, 404);
        }

        // ── GDPR: verifica consenso AI ────────────────────────────────
        if (!profile.report_ai_consent && !skip_consent_check) {
            return json({
                error: `L'utente ${profile.name ?? user_id} non ha dato il consenso AI`,
                code: "CONSENT_REQUIRED",
                user_name: profile.name,
            }, 403);
        }

        // ── Idempotenza: report ESATTO (stesso user, mese, GOAL) già generato? ──
        if (!force_regenerate) {
            const { data: existingList } = await supabase
                .from("monthly_reports")
                .select("id, status, narrative, scorecard, cost_usd, goal, tone, generated_at, model_used")
                .eq("user_id", user_id)
                .eq("year_month", year_month)
                .eq("goal", goalId)
                .eq("status", "generated")
                .order("generated_at", { ascending: false })
                .limit(1);

            const existing = existingList?.[0];
            if (existing) {
                return json({
                    success: true,
                    status: "existing",
                    report_id: existing.id,
                    goal: existing.goal,
                    narrative: existing.narrative,
                    scorecard: existing.scorecard,
                    cost_usd: existing.cost_usd,
                    generated_at: existing.generated_at,
                    model_used: existing.model_used,
                    message: "Report già generato per questo mese e obiettivo. Usa force_regenerate=true per rigenerare.",
                });
            }
        }

        // ── Rate limit: max 3 generazioni con status='generated' per (user, mese)
        // (totale, indipendentemente dal goal: l'idea è 1 obiettivo ufficiale +
        // max 2 cambi di idea). Admin bypassa.
        if (force_regenerate && !isAdmin) {
            const { count: existingCount } = await supabase
                .from("monthly_reports")
                .select("id", { count: "exact", head: true })
                .eq("user_id", user_id)
                .eq("year_month", year_month)
                .eq("status", "generated");

            if ((existingCount ?? 0) >= 3) {
                return json({
                    error: "Hai raggiunto il limite massimo di 3 generazioni per questo mese.",
                    code: "REGEN_LIMIT_REACHED",
                    limit: 3,
                    current_count: existingCount,
                }, 429);
            }
        }

        // ── Calcola scorecard via RPC SQL ─────────────────────────────
        const { data: scorecard, error: scErr } = await supabase.rpc(
            "generate_monthly_scorecard",
            { p_user_id: user_id, p_year_month: year_month },
        );

        if (scErr || !scorecard) {
            return json({
                error: `Scorecard generation failed: ${scErr?.message ?? "unknown"}`,
                code: "SQL_ERROR",
            }, 500);
        }

        const reportType: string = scorecard.metadata?.report_type ?? "full";
        const userName: string = profile.name ?? "Cliente";

        // ── Costruisci prompt e chiama Anthropic ──────────────────────
        const userMessage = buildUserMessage(scorecard, userName, goal, reportType);

        let aiResult: AnthropicResult;
        try {
            aiResult = await callAnthropic(BASE_SYSTEM_STATIC, userMessage);
        } catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e);
            console.error("Anthropic call failed:", errMsg);

            await supabase.from("monthly_reports").insert({
                user_id,
                year_month,
                tone: "motivational",
                goal: goal.id,
                scorecard,
                status: "failed",
                error_message: errMsg,
                generated_at: null,
            });

            return json({
                error: `AI call failed: ${errMsg}`,
                code: "AI_ERROR",
            }, 502);
        }

        // ── Salva ───────────────────────────────────────────────────
        const totalInputTokens =
            aiResult.input_tokens +
            aiResult.cache_creation_tokens +
            aiResult.cache_read_tokens;

        const { data: saved, error: saveErr } = await supabase
            .from("monthly_reports")
            .insert({
                user_id,
                year_month,
                tone: "motivational",
                goal: goal.id,
                scorecard,
                narrative: aiResult.text,
                status: "generated",
                model_used: ANTHROPIC_MODEL,
                input_tokens: totalInputTokens,
                output_tokens: aiResult.output_tokens,
                cost_usd: aiResult.cost_usd,
                generated_at: new Date().toISOString(),
                error_message: null,
            })
            .select()
            .single();

        if (saveErr) {
            console.error("Save failed:", saveErr);
            return json({
                error: `Save failed: ${saveErr.message}`,
                code: "SAVE_ERROR",
                narrative: aiResult.text,
            }, 500);
        }

        // ── Risposta OK ─────────────────────────────────────────────
        return json({
            success: true,
            status: "generated",
            report_id: saved.id,
            goal: goal.id,
            report_type: reportType,
            user_name: userName,
            narrative: aiResult.text,
            scorecard,
            tokens: {
                input: aiResult.input_tokens,
                output: aiResult.output_tokens,
                cache_creation: aiResult.cache_creation_tokens,
                cache_read: aiResult.cache_read_tokens,
            },
            cost_usd: aiResult.cost_usd,
            model_used: ANTHROPIC_MODEL,
        });

    } catch (e) {
        console.error("generate-monthly-report unexpected error:", e);
        const errMsg = e instanceof Error ? e.message : String(e);
        return json({ error: errMsg, code: "UNEXPECTED" }, 500);
    }
});
