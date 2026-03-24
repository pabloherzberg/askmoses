import { Resend } from "resend"
import { createServerClient } from "@supabase/ssr"

// Lazy init — avoid crash when RESEND_API_KEY is not set (Fase 1)
let _resend: Resend | null = null
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY || 'placeholder')
  return _resend
}

interface SectionResult {
  name: string
  score: number
  feedback: string
  // legacy compat
  passed?: boolean
}

interface CoachingEmailData {
  trainerName: string
  trainerEmail: string
  overallScore: number
  totalCriteria: number
  criteria: SectionResult[]
  sections?: SectionResult[]
  summary: string
  strengths: string[]
  improvements: string[]
  transcript: string
  callOutcome?: string
}

function scoreColor(score: number): { bg: string; border: string; text: string; bar: string } {
  if (score >= 5) return { bg: "#f0fdf4", border: "#bbf7d0", text: "#166534", bar: "#10b981" }
  if (score >= 4) return { bg: "#eff6ff", border: "#bfdbfe", text: "#1e40af", bar: "#3b82f6" }
  if (score >= 3) return { bg: "#fffbeb", border: "#fde68a", text: "#92400e", bar: "#f59e0b" }
  return { bg: "#fef2f2", border: "#fecaca", text: "#991b1b", bar: "#ef4444" }
}

function scoreLabel(score: number): string {
  if (score >= 5) return "Excellent"
  if (score >= 4) return "Strong"
  if (score >= 3) return "Adequate"
  if (score >= 2) return "Needs Work"
  return "Not Attempted"
}

function generateEmailHtml(data: CoachingEmailData): string {
  const sections = data.sections || data.criteria
  const overallScore = data.overallScore
  const overallColor = overallScore >= 80 ? "#10b981" : overallScore >= 60 ? "#f59e0b" : "#ef4444"

  const outcomeLabels: Record<string, string> = {
    closed: "Closed",
    follow_up: "Follow-up Scheduled",
    objection_unresolved: "Objection Unresolved",
    no_decision: "No Decision",
    not_closed: "Not Closed",
    partial: "Partial",
  }
  const outcomeLabel = data.callOutcome ? (outcomeLabels[data.callOutcome] || data.callOutcome) : null

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
    <h1 style="color: #1a1a1a; margin-bottom: 6px;">Hey ${data.trainerName},</h1>
    <p style="color: #666; font-size: 15px; margin: 0;">Here is your personalized coaching feedback from Ask Moses AI.</p>
    ${outcomeLabel ? `<p style="display: inline-block; margin-top: 10px; background: #f0f9ff; color: #0284c7; font-size: 13px; padding: 6px 14px; border-radius: 20px; border: 1px solid #bae6fd;">Call Outcome: ${outcomeLabel}</p>` : ""}
  </div>

  <!-- Overall Score -->
  <div style="background: ${overallColor}; color: white; padding: 28px 30px; border-radius: 12px; text-align: center; margin-bottom: 30px;">
    <p style="font-size: 56px; font-weight: 800; margin: 0; line-height: 1;">${overallScore}</p>
    <p style="font-size: 15px; margin: 8px 0 0 0; opacity: 0.9;">Overall Score (out of 100)</p>
  </div>

  <!-- Summary -->
  <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin-bottom: 30px;">
    <h2 style="color: #1a1a1a; margin-top: 0; font-size: 16px;">Summary</h2>
    <p style="color: #444; margin-bottom: 0; font-size: 14px;">${data.summary}</p>
  </div>

  <!-- Section Scores -->
  <h2 style="color: #1a1a1a; font-size: 16px; margin-bottom: 12px;">Section Breakdown</h2>
  ${sections.map((s) => {
    const c = scoreColor(s.score)
    const pct = ((s.score - 1) / 4) * 100
    return `
  <div style="background: ${c.bg}; border: 1px solid ${c.border}; padding: 16px; border-radius: 10px; margin-bottom: 12px;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
      <p style="font-weight: 700; color: ${c.text}; margin: 0; font-size: 15px;">${s.name}</p>
      <span style="font-size: 13px; font-weight: 600; color: ${c.text};">${s.score}/5 — ${scoreLabel(s.score)}</span>
    </div>
    <div style="background: #e5e7eb; border-radius: 4px; height: 6px; margin-bottom: 10px;">
      <div style="background: ${c.bar}; height: 6px; border-radius: 4px; width: ${pct}%;"></div>
    </div>
    <p style="color: ${c.text}; margin: 0; font-size: 13px; opacity: 0.9;">${s.feedback}</p>
  </div>`
  }).join("")}

  <!-- Strengths -->
  ${data.strengths.length > 0 ? `
  <div style="background: #ecfdf5; border-left: 4px solid #10b981; padding: 18px 20px; border-radius: 0 10px 10px 0; margin-bottom: 20px; margin-top: 24px;">
    <h2 style="color: #059669; margin-top: 0; font-size: 15px;">What You Did Well</h2>
    <ul style="color: #047857; margin-bottom: 0; padding-left: 18px; font-size: 14px;">
      ${data.strengths.map((s) => `<li style="margin-bottom: 6px;">${s}</li>`).join("")}
    </ul>
  </div>` : ""}

  <!-- Improvements -->
  ${data.improvements.length > 0 ? `
  <div style="background: #fffbeb; border-left: 4px solid #f59e0b; padding: 18px 20px; border-radius: 0 10px 10px 0; margin-bottom: 20px;">
    <h2 style="color: #d97706; margin-top: 0; font-size: 15px;">Focus Areas</h2>
    <ul style="color: #92400e; margin-bottom: 0; padding-left: 18px; font-size: 14px;">
      ${data.improvements.map((i) => `<li style="margin-bottom: 6px;">${i}</li>`).join("")}
    </ul>
  </div>` : ""}

  <div style="text-align: center; padding: 24px 0; border-top: 1px solid #e5e7eb; margin-top: 20px;">
    <p style="color: #888; font-size: 13px; margin: 0;">Powered by Ask Moses AI Coaching</p>
  </div>

</body>
</html>
  `
}

export async function POST(req: Request) {
  try {
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

    const { data, error } = await getResend().emails.send({
      from: "Ask Moses <noreply@askmoses.ai>",
      to: cleanEmail,
      subject: `Your Sales Call Coaching Feedback — Score: ${body.overallScore}/100`,
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
          client_name: body.clientName || null,
          transcript: body.transcript,
          overall_score: body.overallScore,
          total_criteria: body.totalCriteria,
          criteria: body.criteria,
          summary: body.summary,
          strengths: body.strengths,
          improvements: body.improvements,
          call_outcome: body.callOutcome || "no_decision",
          detected_outcome: body.detectedOutcome || null,
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
