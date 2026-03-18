import { generateText } from "ai"
import { z } from "zod"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { scriptDescription, scriptSections } = body

    if (!scriptDescription || !scriptSections) {
      return Response.json(
        { error: "Missing script description or sections" },
        { status: 400 }
      )
    }

    console.log("[v0] Generating criteria from script...")

    const prompt = `You are an expert sales coach. Based on this sales script description and sections, generate a concise JSON array of evaluation criteria.

Script Description: ${scriptDescription}

Script Sections: ${scriptSections.map((s: any) => `${s.name}: ${s.instructions}`).join(" | ")}

Generate a JSON array with 4-6 criteria objects. Each criterion should:
- Have a "name" (short, specific to the script)
- Have a "description" (what to look for)
- Be directly related to the script sections
- Be evaluable as pass/fail

IMPORTANT: Return ONLY the JSON array, no markdown, no explanation. Example format:
[{"name":"Greeting","description":"Trainer greeted prospect within first 30 seconds"},{"name":"Discovery","description":"Asked qualifying questions about training needs"}]`

    const { text } = await generateText({
      model: "openai/gpt-4o-mini",
      prompt,
      temperature: 0.5,
    })

    console.log("[v0] Generated criteria text:", text)

    // Parse the JSON response
    const criteria = JSON.parse(text)

    if (!Array.isArray(criteria)) {
      throw new Error("Invalid criteria format returned from AI")
    }

    console.log("[v0] Criteria generated successfully:", criteria.length, "items")
    return Response.json({ criteria })
  } catch (error) {
    console.error("[v0] Generate criteria error:", error instanceof Error ? error.message : error)
    return Response.json(
      { error: "Failed to generate criteria" },
      { status: 500 }
    )
  }
}
