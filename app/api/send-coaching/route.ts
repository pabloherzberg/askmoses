import { Resend } from "resend"
import { createServerClient } from "@supabase/ssr"

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

interface CriterionResult {
  name: string
  passed: boolean
  feedback: string
}

interface CoachingEmailData {
  trainerName: string
  trainerEmail: string
  overallScore: number
  totalCriteria: number
  criteria: CriterionResult[]
  summary: string
  strengths: string[]
  improvements: string[]
  transcript: string
  analysisMode?: string
}

function generateEmailHtml(data: CoachingEmailData): string {
  const passedCriteria = data.criteria.filter((c) => c.passed)
  const failedCriteria = data.criteria.filter((c) => !c.passed)
  const passRate = Math.round((data.overallScore / data.totalCriteria) * 100)
  const isScriptMode = data.analysisMode === "script"

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Sales Call Coaching Feedback</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #1a1a1a; margin-bottom: 10px;">Hey ${data.trainerName}! 📋</h1>
    <p style="color: #666; font-size: 16px;">Here's your personalized coaching feedback</p>
    <p style="color: #0284c7; font-size: 14px; background: #f0f9ff; padding: 10px; border-radius: 6px; margin-top: 10px;">Sales Script Analysis</p>
  </div>

  <div style="background: linear-gradient(135deg, ${passRate >= 80 ? "#10b981" : passRate >= 60 ? "#f59e0b" : "#ef4444"}, ${passRate >= 80 ? "#059669" : passRate >= 60 ? "#d97706" : "#dc2626"}); color: white; padding: 30px; border-radius: 12px; text-align: center; margin-bottom: 30px;">
    <p style="font-size: 48px; font-weight: bold; margin: 0;">${data.overallScore}/${data.totalCriteria}</p>
    <p style="font-size: 18px; margin: 10px 0 0 0;">Script Sections Covered (${passRate}%)</p>
  </div>

  <div style="background: #f8f9fa; padding: 20px; border-radius: 12px; margin-bottom: 30px;">
    <h2 style="color: #1a1a1a; margin-top: 0;">Summary</h2>
    <p style="color: #444; margin-bottom: 0;">${data.summary}</p>
  </div>

  ${data.strengths.length > 0 ? `
  <div style="background: #ecfdf5; border-left: 4px solid #10b981; padding: 20px; border-radius: 0 12px 12px 0; margin-bottom: 30px;">
    <h2 style="color: #059669; margin-top: 0;">What You Did Great 💪</h2>
    <ul style="color: #047857; margin-bottom: 0; padding-left: 20px;">
      ${data.strengths.map((s) => `<li style="margin-bottom: 8px;">${s}</li>`).join("")}
    </ul>
  </div>
  ` : ""}

  ${data.improvements.length > 0 ? `
  <div style="background: #fffbeb; border-left: 4px solid #f59e0b; padding: 20px; border-radius: 0 12px 12px 0; margin-bottom: 30px;">
    <h2 style="color: #d97706; margin-top: 0;">Areas to Level Up 🚀</h2>
    <ul style="color: #92400e; margin-bottom: 0; padding-left: 20px;">
      ${data.improvements.map((i) => `<li style="margin-bottom: 8px;">${i}</li>`).join("")}
    </ul>
  </div>
  ` : ""}

  <h2 style="color: #1a1a1a;">Detailed Breakdown</h2>

  ${passedCriteria.length > 0 ? `
  <div style="margin-bottom: 20px;">
    <h3 style="color: #10b981; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">${isScriptMode ? "Covered" : "Passed"}</h3>
    ${passedCriteria.map((c) => `
    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 15px; border-radius: 8px; margin-bottom: 10px;">
      <p style="font-weight: 600; color: #166534; margin: 0 0 5px 0;">✓ ${c.name}</p>
      <p style="color: #15803d; margin: 0; font-size: 14px;">${c.feedback}</p>
    </div>
    `).join("")}
  </div>
  ` : ""}

  ${failedCriteria.length > 0 ? `
  <div style="margin-bottom: 20px;">
    <h3 style="color: #ef4444; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">${isScriptMode ? "Missed" : "Needs Improvement"}</h3>
    ${failedCriteria.map((c) => `
    <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 15px; border-radius: 8px; margin-bottom: 10px;">
      <p style="font-weight: 600; color: #991b1b; margin: 0 0 5px 0;">○ ${c.name}</p>
      <p style="color: #b91c1c; margin: 0; font-size: 14px;">${c.feedback}</p>
    </div>
    `).join("")}
  </div>
  ` : ""}

  <div style="text-align: center; padding: 30px 0; border-top: 1px solid #e5e7eb; margin-top: 30px;">
    <p style="color: #666; font-size: 14px; margin: 0;">Keep pushing forward! Every call is a chance to grow. 🎯</p>
    <p style="color: #999; font-size: 12px; margin-top: 15px;">Powered by Ask Moses AI Coaching</p>
  </div>

</body>
</html>
  `
}

export async function POST(req: Request) {
  try {
    if (!resend) {
      return Response.json(
        { error: "Resend API key not configured" },
        { status: 503 }
      )
    }

    const body: CoachingEmailData = await req.json()

    const { trainerEmail, trainerName } = body

    if (!trainerEmail || !trainerName) {
      return Response.json(
        { error: "Missing trainer email or name" },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const cleanEmail = trainerEmail.trim()
    
    if (!emailRegex.test(cleanEmail)) {
      return Response.json(
        { error: `Invalid email format: ${cleanEmail}` },
        { status: 400 }
      )
    }

    const html = generateEmailHtml(body)

    const { data, error } = await resend.emails.send({
      from: "Ask Moses <noreply@askmoses.ai>",
      to: cleanEmail,
      subject: `Your Sales Call Coaching Feedback - ${body.overallScore}/${body.totalCriteria} Criteria Passed`,
      html,
    })

    if (error) {
      console.error("[v0] Email error:", error)
      return Response.json({ error: error.message }, { status: 500 })
    }

    console.log("[v0] Email sent to:", cleanEmail)

    // Save call to database after successful email send
    try {
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

      // Get active rubric ID
      const { data: rubricData } = await supabase
        .from("rubrics")
        .select("id")
        .eq("is_active", true)
        .single()

      if (rubricData) {
        const { error: saveError } = await supabase.from("calls").insert({
          rubric_id: rubricData.id,
          trainer_name: trainerName,
          trainer_email: cleanEmail,
          transcript: body.transcript,
          overall_score: body.overallScore,
          total_criteria: body.totalCriteria,
          criteria: body.criteria,
          summary: body.summary,
          strengths: body.strengths,
          improvements: body.improvements,
          call_outcome: body.callOutcome || "not_closed",
          email_sent: true,
          email_id: data?.id,
        })

        if (saveError) {
          console.error("[v0] Error saving call to database:", saveError)
        } else {
          console.log("[v0] Call saved to database")
        }
      }
    } catch (dbError) {
      console.error("[v0] Database save error:", dbError)
      // Don't fail the email send if DB save fails
    }

    return Response.json({ success: true, emailId: data?.id })
  } catch (error) {
    console.error("[v0] Send coaching error:", error)
    return Response.json(
      { error: "Failed to send coaching email" },
      { status: 500 }
    )
  }
}
