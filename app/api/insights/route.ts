import { generateText, Output } from "ai"
import { createServerClient } from "@supabase/ssr"
import { z } from "zod"

export const maxDuration = 60

const InsightsSchema = z.object({
  successPatterns: z.array(z.string()).describe("5-8 patterns found in closed/successful calls"),
  failurePatterns: z.array(z.string()).describe("5-8 patterns found in unsuccessful calls"),
  partialPatterns: z.array(z.string()).describe("3-5 patterns found in partial/almost-closed calls"),
  keyDifferences: z.array(z.string()).describe("5-7 key differences between closers and non-closers"),
  dos: z.array(z.string()).describe("6-10 specific DO's - things that successful closers consistently do on calls"),
  donts: z.array(z.string()).describe("6-10 specific DON'Ts - things that lose deals and should be avoided"),
  commonObjections: z.array(z.object({
    objection: z.string().describe("The actual objection the prospect raises"),
    frequency: z.string().describe("How often this comes up: 'Very Common', 'Common', or 'Occasional'"),
    bestResponse: z.string().describe("The best response/rebuttal found in successful calls"),
    worstResponse: z.string().describe("What unsuccessful trainers say when facing this objection"),
  })).describe("5-8 most common objections found across all calls with how closers vs non-closers handle them"),
  preCallChecklist: z.array(z.string()).describe("8-12 actionable checklist items for trainers before and during calls"),
  suggestedScript: z.string().describe("A complete optimized sales script based on what works in successful calls"),
})

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { scriptId } = body

    if (!scriptId) {
      return Response.json({ error: "Missing script ID" }, { status: 400 })
    }

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return [] },
          setAll() {},
        },
      }
    )

    // Get the script details
    const { data: scriptData } = await supabase
      .from("scripts")
      .select("*")
      .eq("id", scriptId)
      .single()

    if (!scriptData) {
      return Response.json({ error: "Script not found" }, { status: 404 })
    }

    // Get the rubric for LLM model
    const { data: rubricData } = await supabase
      .from("rubrics")
      .select("llm_model, system_prompt")
      .eq("id", scriptData.rubric_id)
      .single()

    const llmModel = rubricData?.llm_model || "openai/gpt-4o-mini"

    // Get ALL calls for this script's rubric
    const { data: calls } = await supabase
      .from("calls")
      .select("id, trainer_name, trainer_email, call_outcome, transcript, overall_score, total_criteria, created_at")
      .eq("rubric_id", scriptData.rubric_id)
      .order("created_at", { ascending: false })

    if (!calls || calls.length === 0) {
      return Response.json({ error: "No calls found for this script. Upload some calls first." }, { status: 400 })
    }

    // Group calls by outcome
    const closedCalls = calls.filter((c) => c.call_outcome === "closed")
    const notClosedCalls = calls.filter((c) => c.call_outcome === "not_closed")
    const partialCalls = calls.filter((c) => c.call_outcome === "partial")

    // Build transcripts for each group (limit to prevent token overflow)
    const maxPerGroup = 5
    const closedTranscripts = closedCalls.slice(0, maxPerGroup).map((c, i) => `--- CLOSED CALL ${i + 1} (${c.trainer_name}) ---\n${c.transcript}`).join("\n\n")
    const notClosedTranscripts = notClosedCalls.slice(0, maxPerGroup).map((c, i) => `--- NOT CLOSED CALL ${i + 1} (${c.trainer_name}) ---\n${c.transcript}`).join("\n\n")
    const partialTranscripts = partialCalls.slice(0, maxPerGroup).map((c, i) => `--- PARTIAL CALL ${i + 1} (${c.trainer_name}) ---\n${c.transcript}`).join("\n\n")

    // Script sections for context
    const scriptSections = scriptData.sections
      ?.map((s: any, i: number) => `${i + 1}. ${s.name}: ${s.instructions}`)
      .join("\n") || "No sections defined"

    const prompt = `You are an expert sales coach performing a REINFORCEMENT LEARNING analysis on real sales calls.

CURRENT SCRIPT BEING USED:
${scriptSections}

DATASET SUMMARY:
- Total calls analyzed with this script: ${calls.length}
- Closed (successful): ${closedCalls.length}
- Not Closed (failed): ${notClosedCalls.length}  
- Partial (almost): ${partialCalls.length}

=== PART 1: ANALYZE PATTERNS BY COMPARING OUTCOMES ===

${closedTranscripts ? `SUCCESSFUL CALLS (CLOSED):\n${closedTranscripts}` : "No closed calls yet."}

${notClosedTranscripts ? `UNSUCCESSFUL CALLS (NOT CLOSED):\n${notClosedTranscripts}` : "No failed calls yet."}

${partialTranscripts ? `PARTIAL CALLS:\n${partialTranscripts}` : "No partial calls yet."}

ANALYSIS INSTRUCTIONS FOR PATTERNS:
1. Compare the CLOSED calls against the NOT CLOSED calls
2. Identify specific phrases, techniques, and patterns that closers use
3. Identify what non-closers do wrong or miss
4. Create a clear list of DO's (what to do) and DON'Ts (what to avoid)
5. Identify the most common OBJECTIONS prospects raise across ALL calls. For each objection, show how closers handle it vs how non-closers handle it
6. Create an actionable pre-call checklist based on what works

=== PART 2: GENERATE IMPROVED SCRIPT (Evolution, not replacement) ===

IMPORTANT: The suggestedScript is an IMPROVED VERSION of the current script above.
- Keep the same structure and sections from the current script
- Analyze what the current script does well (based on closed calls)
- Identify gaps or areas for improvement (based on closed calls only)
- Generate an evolved version that incorporates techniques/phrases found in CLOSED calls
- Only use exact phrases and techniques from successful (closed) calls - do NOT use anything from failed calls

7. Write an improved/evolved version of the current script that keeps the structure but is enhanced with techniques and phrases from CLOSED calls
8. The improved script should answer: "What if we kept the same structure but added what actually worked in successful calls?"`

    const { output } = await generateText({
      model: llmModel,
      output: Output.object({
        schema: InsightsSchema,
      }),
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    })

    // Get unique trainers
    const trainersMap = new Map<string, { name: string; email: string }>()
    calls.forEach((c) => {
      if (c.trainer_email && !trainersMap.has(c.trainer_email)) {
        trainersMap.set(c.trainer_email, { name: c.trainer_name, email: c.trainer_email })
      }
    })

    const metrics = {
      total: calls.length,
      closed: closedCalls.length,
      notClosed: notClosedCalls.length,
      partial: partialCalls.length,
      closeRate: calls.length > 0 ? Math.round((closedCalls.length / calls.length) * 100) : 0,
    }

    return Response.json({
      metrics,
      successPatterns: output?.successPatterns || [],
      failurePatterns: output?.failurePatterns || [],
      partialPatterns: output?.partialPatterns || [],
      keyDifferences: output?.keyDifferences || [],
      dos: output?.dos || [],
      donts: output?.donts || [],
      commonObjections: output?.commonObjections || [],
      preCallChecklist: output?.preCallChecklist || [],
      suggestedScript: output?.suggestedScript || "",
      trainers: Array.from(trainersMap.values()),
    })
  } catch (error) {
    console.error("[v0] Insights error:", error)
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to generate insights" },
      { status: 500 }
    )
  }
}
