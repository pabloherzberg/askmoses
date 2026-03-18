import { generateObject } from "ai"
import { createServerClient } from "@supabase/ssr"
import { z } from "zod"

const SectionScoreSchema = z.object({
  name: z.string(),
  score: z.number().min(1).max(5),
  feedback: z.string(),
})

const AnalysisResultSchema = z.object({
  sections: z.array(SectionScoreSchema),
  overallScore: z.number(),
  detectedOutcome: z.enum(["closed", "follow_up", "objection_unresolved", "no_decision"]),
  summary: z.string(),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
})

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { transcript, trainerName, scriptId } = body

    if (!transcript || !trainerName || !scriptId) {
      return Response.json(
        { error: "Missing transcript, trainer name, or script ID" },
        { status: 400 }
      )
    }

    // Create Supabase client for Route Handler
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return []
          },
          setAll() {},
        },
      }
    )

    console.log("[v0] Fetching rubric and script...")
    // Fetch active rubric
    const { data: rubricData, error: rubricError } = await supabase
      .from("rubrics")
      .select("*")
      .eq("is_active", true)
      .single()

    if (rubricError || !rubricData) {
      console.error("[v0] Rubric error:", rubricError)
      return Response.json({ error: "No active rubric found" }, { status: 400 })
    }

    // Fetch script by ID
    const { data: scriptData, error: scriptError } = await supabase
      .from("scripts")
      .select("*")
      .eq("id", scriptId)
      .eq("rubric_id", rubricData.id)
      .single()

    if (scriptError || !scriptData) {
      console.error("[v0] Script error:", scriptError)
      return Response.json({ error: "Script not found" }, { status: 400 })
    }

    // Use system prompt and LLM model from rubric
    const systemPrompt = rubricData.system_prompt || `You are an expert sales coach. Your role is to analyze sales call transcripts and provide constructive, motivational feedback based on the script sections. Be encouraging while pointing out areas for improvement. Focus on practical, actionable coaching.`
    const llmModel = rubricData.llm_model || "openai/gpt-4o-mini"

    // Build script sections with instructions
    const scriptSections = scriptData.sections
      .map(
        (s: any, i: number) =>
          `${i + 1}. ${s.name}: ${s.instructions}${s.tips ? ` (Tips: ${s.tips})` : ""}`
      )
      .join("\n")

    // Criteria are used as guidelines only, not scored individually
    const generatedCriteria = scriptData.criteria || []
    const criteriaGuidelines = generatedCriteria.length > 0
      ? `\nEVALUATION GUIDELINES (use as context when scoring sections, do not score individually):\n${generatedCriteria.map((c: any) => `- ${c.name}: ${c.description}`).join("\n")}`
      : ""

    const sectionNames = scriptData.sections.map((s: any) => s.name)

    const prompt = `You are analyzing a sales call transcript. Score the sales rep on each section of the sales script using a 1–5 scale.

SCORING SCALE:
1 = Not attempted — The rep did not attempt this section at all
2 = Attempted but missed — Tried but failed to execute the key behaviors
3 = Adequate — Covered the basics but room for improvement
4 = Strong — Executed well with minor gaps
5 = Excellent — Exemplary execution, could be used as a model

SALES SCRIPT SECTIONS TO EVALUATE:
${scriptSections}
${criteriaGuidelines}

TRANSCRIPT:
${transcript}

Score "${trainerName}" on EACH of these exact sections: ${sectionNames.join(", ")}

The overallScore should be the average of all section scores multiplied by 20, rounded to the nearest integer (giving a 0–100 scale).

IMPORTANT: Also determine the OUTCOME of this call based on what actually happened in the transcript:
- "closed" — Sale was closed, customer committed to purchase/sign up
- "follow_up" — Customer agreed to a follow-up call/meeting, but no close yet
- "objection_unresolved" — Customer raised objections that were not fully addressed
- "no_decision" — Call ended without clear next steps or commitment

Return your analysis with honest, behaviorally specific feedback per section.`

    console.log("[v0] Starting analysis with model:", llmModel)
    const { object } = await generateObject({
      model: llmModel,
      system: systemPrompt,
      schema: AnalysisResultSchema,
      prompt,
    })

    console.log("[v0] Analysis complete")
    return Response.json({
      ...object,
      // backward compat: map sections as criteria for email/DB
      criteria: object.sections,
      totalCriteria: object.sections.length,
      detectedOutcome: object.detectedOutcome,
      transcript,
      scriptId,
    })
  } catch (error) {
    console.error("[v0] Analysis error:", error instanceof Error ? error.message : error)
    return Response.json(
      { error: "Failed to analyze call" },
      { status: 500 }
    )
  }
}
