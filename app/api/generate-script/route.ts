import { generateText } from "ai"
import { createClient } from "@/lib/supabase/server"

export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { transcripts, textInput } = body

    // Combine all inputs
    const combinedContent = [
      ...(transcripts || []),
      textInput || ""
    ].filter(Boolean).join("\n\n---\n\n")

    if (!combinedContent.trim()) {
      return Response.json({ error: "No content provided" }, { status: 400 })
    }

    console.log("[v0] Generating script from content length:", combinedContent.length)

    const prompt = `You are an expert sales script architect. Analyze the following content (which may be call transcripts, written scripts, or a combination) and generate a structured sales script.

CONTENT TO ANALYZE:
${combinedContent}

YOUR TASK:
1. Extract the key phases/sections of the sales process from the content
2. For each section, identify:
   - The purpose/goal of that section
   - Key phrases and techniques that work well
   - Tips for success
3. Generate a complete, structured sales script

RESPOND IN THIS EXACT JSON FORMAT:
{
  "name": "Suggested script name based on content",
  "description": "Brief description of what this script covers",
  "sections": [
    {
      "name": "Section Name (e.g., Opening, Discovery, Demo, Objection Handling, Closing)",
      "instructions": "Detailed instructions and example phrases for this section. Include actual phrases from the content that work well.",
      "tips": "Pro tips for executing this section successfully"
    }
  ],
  "full_script": "The complete script text that a salesperson can follow word-by-word or use as a guide",
  "criteria": [
    {
      "name": "Criteria name for evaluation",
      "description": "What to look for when evaluating this criteria"
    }
  ],
  "explanation": "Explain why this script structure is effective. What patterns did you identify? Why are these sections ordered this way? What makes this approach likely to succeed?"
}

IMPORTANT:
- Extract REAL phrases and techniques from the provided content
- Create 4-7 logical sections based on the sales flow you identify
- Generate 5-10 evaluation criteria
- The explanation should help the user understand WHY this script will work`

    const { text } = await generateText({
      model: "anthropic/claude-sonnet-4-20250514",
      prompt,
      temperature: 0.7,
    })

    // Parse the JSON response
    let scriptData
    try {
      // Extract JSON from the response (in case there's extra text)
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error("No JSON found in response")
      }
      scriptData = JSON.parse(jsonMatch[0])
    } catch (parseError) {
      console.error("[v0] Failed to parse AI response:", parseError)
      return Response.json({ error: "Failed to parse script structure" }, { status: 500 })
    }

    console.log("[v0] Script generated:", scriptData.name)

    return Response.json(scriptData)
  } catch (error) {
    console.error("[v0] Generate script error:", error)
    return Response.json(
      { error: `Failed to generate script: ${error instanceof Error ? error.message : "Unknown error"}` },
      { status: 500 }
    )
  }
}
