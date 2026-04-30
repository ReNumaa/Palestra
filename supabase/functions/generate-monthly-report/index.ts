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
//     · "Sintesi del mese"
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
INTERPRETAZIONE DEI DATI — DUE FONTI: LEZIONI E LOG
═══════════════════════════════════════════════════════════════════════
Il report ha DUE numeri chiave:
  1. "lessons_attended" = lezioni effettivamente frequentate (non
     annullate). È la FONTE della frequenza settimanale e della
     categoria frequenza.
  2. "sessions_logged" = workout_logs effettivi (sessioni in cui il
     cliente ha inserito carichi nella scheda).

Le DUE fonti vanno tenute distinte:
- La frequenza con cui si "viene in palestra" è lessons_attended.
- I log sono il MATERIALE su cui si può commentare carichi, esercizi,
  progressioni. Se il cliente ha frequentato 8 lezioni ma loggato
  solo 3, il report può commentare i dati delle 3 ma deve invitare
  a registrare meglio i carichi per ottenere un report più ricco
  il mese prossimo (vedi sotto "GAP LOG").

NON parlare MAI di:
- annullamenti, lezioni cancellate, percentuali di presenza, aderenza,
  prenotazioni totali → fuorvianti, non vanno menzionati.
- "ripetizioni" o "reps totali" → il numero di reps non è fornito.
  Parla di carichi, set, costanza, varietà.

INTERPRETAZIONE LOG:
- TERMINOLOGIA per il cliente: "allenamenti registrati" o "log dei carichi"
  per sessions_logged; "lezioni frequentate" per lessons_attended.
- Esercizio con max_weight = null o 0 → CORPO LIBERO. NON dire "carico
  fermo a 0kg". Parla di volume (set), costanza, presenza nel mese.
- Esercizio con sessions_logged = 1 → TEST SINGOLO, non progressione.
- delta.trend = "new" → esercizio NUOVO. Non è progressione, è inserimento.
- delta.trend = "stable" con weight_change = 0 → STALLO, non regressione.

═══════════════════════════════════════════════════════════════════════
REGISTRO LINGUISTICO — RESTA SUL VAGO
═══════════════════════════════════════════════════════════════════════
Il report deve essere DESCRITTIVO, non un report tecnico-numerico.
Preferisci formulazioni qualitative invece dei numeri puntuali:
  · "carichi importanti", "lavoro a corpo libero", "carichi moderati"
    invece di "max 65kg / 8 set / 32 reps"
  · "buon volume sulle gambe", "lavoro consistente sulla parte alta"
    invece di "12 set su quadricipite"
  · "una buona costanza", "presenza regolare" invece di "11 sessioni"
Cita i NUMERI solo dove sono davvero significativi:
  · 1 PR netto (top_progress) lo puoi citare con i kg
  · la frequenza settimanale (es. "circa 2 allenamenti a settimana")
  · il numero di lezioni del mese se è il dato chiave
Non ripetere mai il numero di set o le ripetizioni. Niente "sedute"
intese come "n. di sessioni" — usa "allenamenti" o "settimane".

═══════════════════════════════════════════════════════════════════════
LIVELLO DI ESPERIENZA — experience_hint
═══════════════════════════════════════════════════════════════════════
Il campo "experience_hint" può valere:
  · "advanced" → cliente con carichi importanti su almeno 2 fondamentali.
    Anche se è la prima volta che logga in app, NON è un principiante.
    Tono: tecnico, parla di affinamento, periodizzazione, picchi.
    Non usare frasi del tipo "stai imparando i fondamentali".
  · "intermediate" → cliente con base solida.
    Tono: rispetta il livello, parla di progressione e consolidamento.
  · "beginner_or_returning" → cliente con carichi modesti o prevalentemente
    a corpo libero. Possibile principiante o chi riparte dopo una pausa.
    Tono: incoraggiante, niente pressione su carichi, valorizza la costanza
    e l'apprendimento dei movimenti base.

═══════════════════════════════════════════════════════════════════════
QUALITÀ DEL DATO — data_quality_warning
═══════════════════════════════════════════════════════════════════════
Se "data_quality_warning" = true, alcuni carichi inseriti erano
chiaramente errati (es. 1000 kg) e sono stati esclusi dai conteggi.
Includi UNA frase breve e cortese che inviti a ricontrollare i numeri
inseriti: "ho notato qualche valore probabilmente digitato male nei
log — vale la pena ricontrollare i carichi quando li segni, così il
report del prossimo mese sarà ancora più preciso." Mai accusatorio,
mai un elenco puntuale degli errori.

═══════════════════════════════════════════════════════════════════════
HIGHLIGHT DEL MESE — campi opzionali da usare se presenti
═══════════════════════════════════════════════════════════════════════
- "favorite_exercise" (se ≥ 2 sessioni con lo stesso esercizio): puoi
  citarlo come "esercizio del mese" o "il movimento su cui hai lavorato
  di più". Cita il nome.
- "top_progress" (esercizio con il salto in carico maggiore): è la
  vittoria più tangibile del mese. Citalo CON i numeri (from → to).
- "most_worked_muscle" / "least_worked_muscle": se la differenza è
  netta, puoi segnalare uno sbilanciamento ("le gambe sono state il
  focus del mese, mentre la schiena ha ricevuto meno attenzione").
  NON drammatizzare.

═══════════════════════════════════════════════════════════════════════
PATTERN DI FREQUENZA — streak e abitudini
═══════════════════════════════════════════════════════════════════════
- "attendance_streak_weeks" = numero di settimane consecutive (fino alla
  fine del mese del report) con almeno 1 lezione frequentata.
    · Se ≥ 3 → CITALO con enfasi positiva ("3ª settimana di fila con
      almeno un allenamento", "stai costruendo una serie di 5 settimane
      consecutive": è un segnale forte di costanza).
    · Se = 1 o 2 → puoi accennarlo solo se è un nuovo inizio.
    · Se = 0 → non menzionarlo.
- "top_day" + "top_day_share_pct" = giorno della settimana più frequente
  e percentuale di sessioni che cadono in quel giorno.
    · Cita il giorno SOLO se top_day_share_pct ≥ 40 ("ti alleni
      soprattutto di martedì", "il sabato è diventato il giorno fisso").
    · Sotto 40% NON menzionare il giorno: la distribuzione è varia.
- "top_time_slot" + "top_time_slot_share_pct" = fascia oraria preferita
  ("mattina presto", "mattina", "primo pomeriggio", "pomeriggio",
  "sera", "tarda sera").
    · Cita la fascia SOLO se top_time_slot_share_pct ≥ 50 ("alleni
      quasi sempre la sera").
    · Usalo per riconoscere l'abitudine, non per giudicarla.
Questi tre pattern, quando presenti, vanno integrati nel paragrafo
"Cosa dicono i dati" come UN SOLO accenno breve, non un elenco.

═══════════════════════════════════════════════════════════════════════
GAP LOG — INVITO A REGISTRARE MEGLIO
═══════════════════════════════════════════════════════════════════════
Il valore "logging_completeness_pct" indica quanti dei lessons_attended
sono stati anche loggati (= sessions_logged / lessons_attended × 100).

Soglie:
  · ≥ 80% → ottima copertura, NON menzionare il gap
  · 50–79% → cita brevemente che registrare TUTTI i carichi rende il
    report del prossimo mese più dettagliato
  · < 50% → invita esplicitamente a registrare i carichi durante
    l'allenamento (1 frase, non moralista, formulata come "se vuoi
    sfruttare al massimo il report di fine mese, segna i carichi
    durante ogni sessione: il prossimo report avrà dati più ricchi
    e progressioni misurabili").
  · sessions_logged = 0 ma lessons_attended > 0 → enfatizza che il
    report non può commentare carichi/progressi proprio per assenza
    totale di registrazioni; il primo passo è iniziare a segnarli.

═══════════════════════════════════════════════════════════════════════
FREQUENZA E "FAR VENIRE DI PIÙ" (priorità del business)
═══════════════════════════════════════════════════════════════════════
Il valore "frequency_category" è calcolato sulle LEZIONI FREQUENTATE
(lessons_attended), non sui log. "freq_gap_vs_goal" è la distanza dalla
soglia minima del goal (es. -1.5 = 1,5 lezioni/sett sotto soglia).

Se frequency_category = BASSA o MEDIA-BASSA → il messaggio centrale del
report deve essere: aumentare la frequenza in palestra è la singola leva
più efficace per vedere risultati legati al goal. Non moralista, non
colpevolizzante, ma esplicito.

Esempi (adatta al tono del goal):
  · "I tuoi 1,2 allenamenti/settimana stanno costruendo abitudine, ma
    per vedere il dimagrimento muoversi davvero servono almeno 3."
  · "Sopra i 2 allenamenti/settimana il corpo inizia a rispondere in
    modo visibile: oggi sei a 1,5."

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

  ## Sintesi del mese
  3-4 righe brevi che condensano il mese: numero di allenamenti del
  mese, frequenza media settimanale, eventuale confronto col mese
  precedente. Tono leggero e qualitativo. Esempi:
    · "11 allenamenti nel mese, circa 2,5 a settimana — ritmo
      regolare in linea col mese scorso."
    · "8 allenamenti nel mese: una crescita rispetto ai 5 di marzo."
  Cita SOLO numeri davvero rilevanti. NON elencare set, kg, ripetizioni.
  NON menzionare aderenza, annullamenti, prenotazioni totali.

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

// Soglia oltre la quale un carico è quasi certamente un errore di
// compilazione. 500kg lascia margine al record mondiale di stacco
// (~501kg) per non escludere casi reali di atleti elite, ma rende
// inequivocabile un valore tipo "1000".
const MAX_REASONABLE_WEIGHT_KG = 500;

// Soglie usate per stimare il livello di esperienza dai carichi sui
// multiarticolari principali. Sono volutamente conservative e tipiche
// di un cliente di palestra "medio" (non distinte per genere): se uno
// supera queste soglie su almeno 2 esercizi importanti, è un atleta
// con esperienza, non un principiante che ha appena iniziato a loggare.
const ADVANCED_LIFT_THRESHOLDS_KG: Record<string, number> = {
    // chiavi: sostringhe (lowercase) presenti nel nome esercizio
    squat: 80,
    stacco: 100,
    panca: 60,
    military: 40,
    "shoulder press": 40,
    rematore: 50,
    trazione: 0, // se ne hai loggate con kg > 0 sei già avanzato
};

// ─────────────────────────────────────────────────────────────────────
// PATTERN DI FREQUENZA — streak settimanale e giorno/fascia preferiti
// Calcolati con una query separata su `bookings` (la scorecard non ha
// le date settimana per settimana). Usa solo bookings con status =
// 'confirmed' (= "lezioni frequentate", convenzione coerente con
// generate_monthly_scorecard).
// ─────────────────────────────────────────────────────────────────────

interface AttendancePatterns {
    streak_weeks: number;
    top_day: string | null;
    top_day_share_pct: number | null;
    top_time_slot: string | null;
    top_time_slot_share_pct: number | null;
}

function _isoWeekStart(d: Date): string {
    // Lunedì della settimana ISO contenente d (UTC).
    const x = new Date(d);
    const dayIdx = (x.getUTCDay() + 6) % 7; // Mon = 0, Sun = 6
    x.setUTCDate(x.getUTCDate() - dayIdx);
    return x.toISOString().slice(0, 10);
}

function _timeSlotOf(timeStr: string): string {
    // formato es. "10:00 - 11:00" o "10:00"
    const m = String(timeStr ?? "").match(/^(\d{1,2}):/);
    if (!m) return "altro";
    const h = parseInt(m[1], 10);
    if (h < 9)  return "mattina presto";
    if (h < 12) return "mattina";
    if (h < 15) return "primo pomeriggio";
    if (h < 18) return "pomeriggio";
    if (h < 21) return "sera";
    return "tarda sera";
}

const _DAY_NAMES_IT = [
    "Domenica", "Lunedì", "Martedì", "Mercoledì",
    "Giovedì", "Venerdì", "Sabato",
];

async function computeAttendancePatterns(
    sb: any,
    userId: string,
    yearMonth: string,
): Promise<AttendancePatterns> {
    const empty: AttendancePatterns = {
        streak_weeks: 0,
        top_day: null,
        top_day_share_pct: null,
        top_time_slot: null,
        top_time_slot_share_pct: null,
    };

    const [yStr, mStr] = yearMonth.split("-");
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10); // 1-12
    if (!y || !m) return empty;

    // Fine del mese del report (UTC) e inizio finestra di lookback (6 mesi).
    const endOfMonth = new Date(Date.UTC(y, m, 0));     // ultimo giorno del mese
    const lookbackStart = new Date(Date.UTC(y, m - 6, 1));
    const fromDate = lookbackStart.toISOString().slice(0, 10);
    const toDate = endOfMonth.toISOString().slice(0, 10);

    const { data: bookings, error } = await sb
        .from("bookings")
        .select("date, time")
        .eq("user_id", userId)
        .eq("status", "confirmed")
        .gte("date", fromDate)
        .lte("date", toDate);

    if (error) {
        console.warn("[Patterns] bookings query failed:", error.message);
        return empty;
    }
    if (!bookings || bookings.length === 0) return empty;

    // Streak: settimane consecutive con ≥ 1 booking, terminanti con la
    // settimana che contiene endOfMonth.
    const weeksWithBookings = new Set<string>();
    for (const b of bookings) {
        if (!b.date) continue;
        const d = new Date(b.date + "T00:00:00Z");
        weeksWithBookings.add(_isoWeekStart(d));
    }
    let streak = 0;
    const cursor = new Date(endOfMonth);
    while (streak <= 52) {
        const k = _isoWeekStart(cursor);
        if (!weeksWithBookings.has(k)) break;
        streak++;
        cursor.setUTCDate(cursor.getUTCDate() - 7);
    }

    // Giorno e fascia oraria: SOLO bookings dentro il mese del report
    // (il pattern del mese, non della finestra di lookback).
    const monthStart = Date.UTC(y, m - 1, 1);
    const monthEnd   = Date.UTC(y, m, 0);
    const inMonth = bookings.filter((b: any) => {
        if (!b.date) return false;
        const t = Date.parse(b.date + "T00:00:00Z");
        return t >= monthStart && t <= monthEnd;
    });
    if (inMonth.length === 0) {
        return { ...empty, streak_weeks: streak };
    }

    const dayCounts: Record<string, number> = {};
    const slotCounts: Record<string, number> = {};
    for (const b of inMonth) {
        const d = new Date((b.date as string) + "T00:00:00Z");
        const dayName = _DAY_NAMES_IT[d.getUTCDay()];
        dayCounts[dayName] = (dayCounts[dayName] ?? 0) + 1;
        const slot = _timeSlotOf(b.time);
        slotCounts[slot] = (slotCounts[slot] ?? 0) + 1;
    }
    const pickTop = (counts: Record<string, number>) => {
        const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        if (entries.length === 0) return null;
        return { name: entries[0][0], count: entries[0][1] };
    };
    const topDay = pickTop(dayCounts);
    const topSlot = pickTop(slotCounts);

    return {
        streak_weeks: streak,
        top_day: topDay?.name ?? null,
        top_day_share_pct: topDay
            ? Math.round((topDay.count / inMonth.length) * 100) : null,
        top_time_slot: topSlot?.name ?? null,
        top_time_slot_share_pct: topSlot
            ? Math.round((topSlot.count / inMonth.length) * 100) : null,
    };
}

function inferExperienceHint(exercises: any[]): "advanced" | "intermediate" | "beginner_or_returning" {
    let advancedSignals = 0;
    let intermediateSignals = 0;
    for (const ex of exercises ?? []) {
        const name = String(ex.exercise_name ?? "").toLowerCase();
        const w = typeof ex.max_weight === "number" ? ex.max_weight : 0;
        if (!w) continue;

        // Match con le soglie advanced
        let matchedThreshold: number | null = null;
        for (const key of Object.keys(ADVANCED_LIFT_THRESHOLDS_KG)) {
            if (name.includes(key)) {
                matchedThreshold = ADVANCED_LIFT_THRESHOLDS_KG[key];
                break;
            }
        }
        if (matchedThreshold !== null && w >= matchedThreshold) {
            advancedSignals++;
        } else if (w >= 30) {
            intermediateSignals++;
        }
    }
    if (advancedSignals >= 2) return "advanced";
    if (advancedSignals >= 1 || intermediateSignals >= 3) return "intermediate";
    return "beginner_or_returning";
}

// Compone il messaggio utente: prefisso (goal + report type) + scorecard.
// Frequenza basata sulle LEZIONI FREQUENTATE (bookings.completed); i log
// (sessions_logged) sono un dato secondario per commentare carichi e
// invitare a registrare meglio se il gap è alto. Annullamenti/cancellati,
// totali bookings, aderenza % e ripetizioni NON vengono inviati al modello.
function buildUserMessage(
    scorecard: any,
    userName: string,
    goal: GoalSpec,
    reportType: string,
    patterns: AttendancePatterns,
): string {
    const c = scorecard.current ?? {};
    const p = scorecard.previous ?? {};
    const cb = c.bookings ?? {};
    const pb = p.bookings ?? {};

    const lessonsAttended = cb.completed ?? 0;
    const lessonsAttendedPrev = pb.completed ?? 0;
    const sessionsLogged = c.sessions_logged_count ?? 0;
    const sessionsLoggedPrev = p.sessions_logged_count ?? 0;

    // Frequenza = lezioni frequentate / settimana.
    const avgPerWeek = lessonsAttended > 0
        ? Number((lessonsAttended / 4.33).toFixed(2))
        : 0;
    const avgPerWeekPrev = lessonsAttendedPrev > 0
        ? Number((lessonsAttendedPrev / 4.33).toFixed(2))
        : 0;
    const freqGapVsGoal = Number((avgPerWeek - goal.minWeeklyFreq).toFixed(2));

    // % di lezioni effettivamente loggate. null se 0 lezioni (non
    // calcolabile, evitiamo divisione per zero e false segnalazioni).
    const loggingCompletenessPct = lessonsAttended > 0
        ? Math.round((sessionsLogged / lessonsAttended) * 100)
        : null;

    // Sanifica un singolo esercizio:
    //  · rimuove total_reps_sum (le ripetizioni non vanno menzionate)
    //  · azzera carichi assurdi (>500kg = errore di compilazione)
    //  · normalizza il nome in Title Case
    //  · ritorna anche un flag se il carico è stato filtrato
    const sanitize = (ex: any): { ex: any; hadOutlier: boolean } => {
        const { total_reps_sum: _drop, ...rest } = ex ?? {};
        let hadOutlier = false;
        const fix = (key: string) => {
            const v = rest[key];
            if (typeof v === "number" && v > MAX_REASONABLE_WEIGHT_KG) {
                rest[key] = null;
                hadOutlier = true;
            }
        };
        fix("max_weight");
        fix("first_weight");
        fix("last_weight");
        return {
            ex: { ...rest, exercise_name: titleCaseIt(rest.exercise_name) },
            hadOutlier,
        };
    };

    let outlierCount = 0;
    const exercises = (c.exercises ?? []).map((ex: any) => {
        const r = sanitize(ex);
        if (r.hadOutlier) outlierCount++;
        return r.ex;
    });
    const deltaExercises = (scorecard.delta?.exercises ?? []).map((ex: any) => {
        const r = sanitize(ex);
        // Anche weight_change/previous_max/current_max possono essere assurdi
        // perché derivati da max_weight: se sopra soglia, neutralizza il delta.
        const dx = r.ex;
        if (typeof dx.previous_max === "number" && dx.previous_max > MAX_REASONABLE_WEIGHT_KG) {
            dx.previous_max = null; outlierCount++;
        }
        if (typeof dx.current_max === "number" && dx.current_max > MAX_REASONABLE_WEIGHT_KG) {
            dx.current_max = null; outlierCount++;
        }
        if (typeof dx.weight_change === "number" && Math.abs(dx.weight_change) > MAX_REASONABLE_WEIGHT_KG) {
            dx.weight_change = null;
            dx.weight_pct_change = null;
            dx.trend = "unknown";
        }
        return dx;
    });

    // Stima livello di esperienza dai carichi puliti.
    const experienceHint = inferExperienceHint(exercises);

    // Esercizio "preferito" del mese (più sessioni con quel nome).
    const favorite = exercises
        .slice()
        .sort((a: any, b: any) => (b.sessions_logged ?? 0) - (a.sessions_logged ?? 0))[0];
    const favoriteExercise = favorite && (favorite.sessions_logged ?? 0) >= 2
        ? { name: favorite.exercise_name, sessions: favorite.sessions_logged }
        : null;

    // Top progresso: esercizio con weight_change positivo più alto.
    const topProgressEx = deltaExercises
        .filter((d: any) => d.trend === "progressed" && typeof d.weight_change === "number" && d.weight_change > 0)
        .sort((a: any, b: any) => (b.weight_change ?? 0) - (a.weight_change ?? 0))[0];
    const topProgress = topProgressEx
        ? {
            name: topProgressEx.exercise_name,
            from: topProgressEx.previous_max,
            to: topProgressEx.current_max,
        }
        : null;

    // Bilanciamento muscolare: muscolo più e meno stimolato.
    const volumeByMuscle = c.volume_by_muscle ?? {};
    const muscleEntries = Object.entries(volumeByMuscle) as [string, number][];
    muscleEntries.sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
    const mostWorkedMuscle = muscleEntries[0]?.[0] ?? null;
    const leastWorkedMuscle = muscleEntries.length > 1
        ? muscleEntries[muscleEntries.length - 1]?.[0] ?? null
        : null;

    // Ricostruisce blocchi current/previous/delta rimuovendo TUTTO ciò
    // che è "aderenza/annullamenti": teniamo solo lessons_attended e
    // sessions_logged_count come fonti, niente cancelled/total/percent.
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

        // Frequenza (basata su lezioni frequentate)
        lessons_attended: lessonsAttended,
        lessons_attended_previous: lessonsAttendedPrev,
        avg_sessions_per_week: avgPerWeek,
        avg_sessions_per_week_previous: avgPerWeekPrev,
        frequency_category: freqLabel(avgPerWeek),
        freq_gap_vs_goal: freqGapVsGoal,

        // Dati log (per commenti su carichi e invito a registrare meglio)
        sessions_logged: sessionsLogged,
        sessions_logged_previous: sessionsLoggedPrev,
        logging_completeness_pct: loggingCompletenessPct,

        // Inferenze utili al modello
        experience_hint: experienceHint,
        data_quality_warning: outlierCount > 0,
        favorite_exercise: favoriteExercise,
        top_progress: topProgress,
        most_worked_muscle: mostWorkedMuscle,
        least_worked_muscle: leastWorkedMuscle,

        // Pattern di frequenza
        attendance_streak_weeks: patterns.streak_weeks,
        top_day: patterns.top_day,
        top_day_share_pct: patterns.top_day_share_pct,
        top_time_slot: patterns.top_time_slot,
        top_time_slot_share_pct: patterns.top_time_slot_share_pct,

        current: { ...cRest, exercises },
        previous: pRest,
        delta: { ...dRest, exercises: deltaExercises },
    };

    return buildUserPrefix(goal, reportType) +
        `[SCORECARD]\n\`\`\`json\n${JSON.stringify(enriched, null, 2)}\n\`\`\`\n\n` +
        `Scrivi ora il report mensile per ${userName}, seguendo le REGOLE ASSOLUTE, ` +
        `il [GOAL_SPEC] e il [REPORT_TYPE]. Rispetta la struttura markdown a 3 sezioni ` +
        `(Sintesi del mese, Cosa dicono i dati, Obiettivo del mese prossimo).`;
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

        // ── Pattern di frequenza (streak + giorno/orario preferito) ───
        // Calcolati con una query separata perché la scorecard non ha le
        // date settimana per settimana. Non blocca: in caso di errore
        // ritorna valori "vuoti".
        const patterns = await computeAttendancePatterns(supabase, user_id, year_month);

        // ── Costruisci prompt e chiama Anthropic ──────────────────────
        const userMessage = buildUserMessage(scorecard, userName, goal, reportType, patterns);

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
