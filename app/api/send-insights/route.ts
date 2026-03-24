import { Resend } from "resend"

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

interface InsightsEmailData {
  scriptName: string
  insights: {
    metrics: {
      total: number
      closed: number
      notClosed: number
      partial: number
      closeRate: number
    }
    successPatterns: string[]
    failurePatterns: string[]
    dos: string[]
    donts: string[]
    commonObjections: { objection: string; frequency: string; bestResponse: string; worstResponse: string }[]
    keyDifferences: string[]
    preCallChecklist: string[]
    suggestedScript: string
    trainers: { name: string; email: string }[]
  }
}

function generateInsightsEmailHtml(data: InsightsEmailData): string {
  const { metrics, successPatterns, failurePatterns, dos, donts, commonObjections, keyDifferences, preCallChecklist, suggestedScript } = data.insights

  const successItems = (successPatterns || []).map((s) => `<li style="padding: 8px 0; border-bottom: 1px solid #dcfce7;">&#9989; ${s}</li>`).join("")
  const failureItems = (failurePatterns || []).map((f) => `<li style="padding: 8px 0; border-bottom: 1px solid #fecaca;">&#10060; ${f}</li>`).join("")
  const dosItems = (dos || []).map((d) => `<li style="padding: 8px 0; border-bottom: 1px solid #dcfce7;">&#9989; ${d}</li>`).join("")
  const dontsItems = (donts || []).map((d) => `<li style="padding: 8px 0; border-bottom: 1px solid #fecaca;">&#10060; ${d}</li>`).join("")
  const diffItems = keyDifferences.map((d, i) => `<li style="padding: 8px 0; border-bottom: 1px solid #f0f0f0;"><strong>${i + 1}.</strong> ${d}</li>`).join("")
  const checklistItems = preCallChecklist.map((c, i) => `
    <tr>
      <td style="padding: 10px 12px; border-bottom: 1px solid #f0f0f0; width: 30px; text-align: center;">
        <span style="display: inline-block; width: 24px; height: 24px; background: #0284c7; color: white; border-radius: 4px; line-height: 24px; font-size: 12px; font-weight: bold;">${i + 1}</span>
      </td>
      <td style="padding: 10px 12px; border-bottom: 1px solid #f0f0f0; font-size: 14px;">${c}</td>
    </tr>
  `).join("")

  const objectionsHtml = (commonObjections || []).map((obj) => `
    <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; margin-bottom: 12px;">
      <p style="font-weight: bold; font-size: 14px; margin: 0 0 8px 0;">
        "${obj.objection}" 
        <span style="display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: normal; background: ${obj.frequency === "Very Common" ? "#fecaca; color: #dc2626" : obj.frequency === "Common" ? "#e5e7eb; color: #374151" : "#f3f4f6; color: #6b7280"};">${obj.frequency}</span>
      </p>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="width: 50%; padding: 8px; background: #f0fdf4; border-radius: 6px; vertical-align: top;">
            <p style="font-size: 11px; color: #16a34a; font-weight: bold; margin: 0 0 4px 0;">BEST RESPONSE</p>
            <p style="font-size: 13px; margin: 0;">${obj.bestResponse}</p>
          </td>
          <td style="width: 8px;"></td>
          <td style="width: 50%; padding: 8px; background: #fef2f2; border-radius: 6px; vertical-align: top;">
            <p style="font-size: 11px; color: #dc2626; font-weight: bold; margin: 0 0 4px 0;">AVOID THIS</p>
            <p style="font-size: 13px; margin: 0;">${obj.worstResponse}</p>
          </td>
        </tr>
      </table>
    </div>
  `).join("")

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Team Insights Report</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background: #f9fafb;">
  
  <div style="text-align: center; margin-bottom: 30px; background: linear-gradient(135deg, #1e293b, #334155); padding: 30px; border-radius: 16px;">
    <p style="font-size: 12px; text-transform: uppercase; letter-spacing: 2px; color: #94a3b8; margin: 0 0 8px 0;">Weekly Sales Bulletin</p>
    <h1 style="color: white; margin: 0 0 5px 0; font-size: 24px;">What's Working This Week</h1>
    <p style="color: #94a3b8; font-size: 14px; margin: 0;">Script: ${data.scriptName}</p>
    <p style="color: #64748b; font-size: 12px; margin: 8px 0 0 0;">Week of ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
  </div>

  <!-- Metrics -->
  <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
    <tr>
      <td style="text-align: center; padding: 15px; background: #f0f9ff; border-radius: 8px 0 0 8px;">
        <p style="font-size: 28px; font-weight: bold; margin: 0; color: #1a1a1a;">${metrics.total}</p>
        <p style="font-size: 11px; color: #666; margin: 4px 0 0 0;">Total Calls</p>
      </td>
      <td style="text-align: center; padding: 15px; background: #f0fdf4;">
        <p style="font-size: 28px; font-weight: bold; margin: 0; color: #16a34a;">${metrics.closed}</p>
        <p style="font-size: 11px; color: #666; margin: 4px 0 0 0;">Closed</p>
      </td>
      <td style="text-align: center; padding: 15px; background: #fef2f2;">
        <p style="font-size: 28px; font-weight: bold; margin: 0; color: #dc2626;">${metrics.notClosed}</p>
        <p style="font-size: 11px; color: #666; margin: 4px 0 0 0;">Not Closed</p>
      </td>
      <td style="text-align: center; padding: 15px; background: #fffbeb; border-radius: 0 8px 8px 0;">
        <p style="font-size: 28px; font-weight: bold; margin: 0; color: #d97706;">${metrics.partial}</p>
        <p style="font-size: 11px; color: #666; margin: 4px 0 0 0;">Partial</p>
      </td>
    </tr>
  </table>

  <!-- Close Rate -->
  <div style="background: ${metrics.closeRate >= 60 ? "linear-gradient(135deg, #10b981, #059669)" : "linear-gradient(135deg, #f59e0b, #d97706)"}; color: white; padding: 20px; border-radius: 12px; text-align: center; margin-bottom: 30px;">
    <p style="font-size: 42px; font-weight: bold; margin: 0;">${metrics.closeRate}%</p>
    <p style="font-size: 14px; margin: 5px 0 0 0;">Team Close Rate</p>
  </div>

  <!-- DO's -->
  <div style="background: white; border: 2px solid #16a34a; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
    <h2 style="color: #16a34a; font-size: 18px; margin: 0 0 15px 0;">DO's - Best Practices</h2>
    <ul style="list-style: none; padding: 0; margin: 0; font-size: 14px;">
      ${dosItems}
    </ul>
  </div>

  <!-- DON'Ts -->
  <div style="background: white; border: 2px solid #dc2626; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
    <h2 style="color: #dc2626; font-size: 18px; margin: 0 0 15px 0;">DON'Ts - Avoid These</h2>
    <ul style="list-style: none; padding: 0; margin: 0; font-size: 14px;">
      ${dontsItems}
    </ul>
  </div>

  <!-- Objections -->
  <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
    <h2 style="color: #1a1a1a; font-size: 18px; margin: 0 0 15px 0;">Common Objections & How to Handle Them</h2>
    ${objectionsHtml}
  </div>

  <!-- Key Differences -->
  <div style="background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
    <h2 style="color: #1a1a1a; font-size: 16px; margin: 0 0 15px 0;">Key Differences</h2>
    <ul style="list-style: none; padding: 0; margin: 0; font-size: 14px;">
      ${diffItems}
    </ul>
  </div>

  <!-- Pre-Call Checklist -->
  <div style="background: white; border: 2px solid #0284c7; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
    <h2 style="color: #0284c7; font-size: 16px; margin: 0 0 15px 0;">Pre-Call Checklist</h2>
    <table style="width: 100%; border-collapse: collapse;">
      ${checklistItems}
    </table>
  </div>

  <!-- Suggested Script -->
  <div style="background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
    <h2 style="color: #1a1a1a; font-size: 16px; margin: 0 0 15px 0;">AI-Suggested Optimized Script</h2>
    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; font-size: 13px; line-height: 1.8; white-space: pre-wrap;">
${suggestedScript}
    </div>
  </div>

  <div style="text-align: center; padding: 20px 0; color: #999; font-size: 12px;">
    <p>Generated by Ask Moses AI Coaching Platform</p>
    <p>This report is based on ${metrics.total} analyzed calls</p>
  </div>
</body>
</html>`
}

export async function POST(req: Request) {
  try {
    if (!resend) {
      return Response.json(
        { error: "Resend API key not configured" },
        { status: 503 }
      )
    }

    const body: InsightsEmailData = await req.json()

    if (!body.insights || !body.insights.trainers || body.insights.trainers.length === 0) {
      return Response.json({ error: "No trainers to send to" }, { status: 400 })
    }

    const html = generateInsightsEmailHtml(body)

    // In sandbox mode, can only send to registered email
    const targetEmails = body.insights.trainers.map((t) => t.email)

    const { data, error } = await resend.emails.send({
      from: "Ask Moses <noreply@askmoses.ai>",
      to: targetEmails,
      subject: `Weekly Sales Bulletin - ${body.scriptName} | ${body.insights.metrics.closeRate}% Close Rate | Do's, Don'ts & Objections`,
      html,
    })

    if (error) {
      console.error("[v0] Send insights error:", error)
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ success: true, emailId: data?.id })
  } catch (error) {
    console.error("[v0] Send insights error:", error)
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to send insights" },
      { status: 500 }
    )
  }
}
