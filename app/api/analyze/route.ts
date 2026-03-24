import { generateObject } from "ai"
import { createServerClient } from "@supabase/ssr"
import { z } from "zod"

export const maxDuration = 60

const CriterionResultSchema = z.object({
  name: z.string(),
  passed: z.boolean(),
  feedback: z.string(),
})

const AnalysisResultSchema = z.object({
  criteria: z.array(CriterionResultSchema),
  overallScore: z.number(),
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
    const systemPrompt = rubricData.system_prompt || `You are an expert sales coach specializing in dog training business sales. Your role is to analyze sales call transcripts and provide constructive, motivational feedback based on specific evaluation criteria. Be encouraging while pointing out areas for improvement. Focus on practical, actionable tips.`
    const llmModel = rubricData.llm_model || "openai/gpt-4o-mini"

    // Build script context with criteria
    const scriptSections = (scriptData.sections || [])
      .map(
        (s: any, i: number) =>
          `${i + 1}. ${s.name}: ${s.instructions}${s.tips ? ` (Tips: ${s.tips})` : ""}`
      )
      .join("\n")

    // Get auto-generated criteria from script
    const generatedCriteria = scriptData.criteria || []
    const criteriaDescription = generatedCriteria
      .map((c: any) => `- ${c.name}: ${c.description}`)
      .join("\n")

    const prompt = `You are analyzing a sales call transcript. Return your analysis in the EXACT JSON structure below.

SALES SCRIPT SECTIONS (what should happen):
${scriptSections}

EVALUATION CRITERIA (rate each one as pass/fail):
${criteriaDescription}

TRANSCRIPT TO ANALYZE:
${transcript}

Analyze if the trainer "${trainerName}" followed the sales script and met each criterion. For EACH criterion in the list above, decide if they PASSED or FAILED based on the transcript.

Return ONLY valid JSON matching this exact structure:
{
  "criteria": [
    {"name": "Criterion Name", "passed": true/false, "feedback": "Specific feedback about this criterion"},
    ...
  ],
  "overallScore": <number of criteria passed, 0-${generatedCriteria.length}>,
  "summary": "Brief 1-2 sentence summary of the call",
  "strengths": ["Strength 1", "Strength 2"],
  "improvements": ["Area to improve 1", "Area to improve 2"]
}`

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
