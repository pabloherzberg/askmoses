export interface CoachingEmailSection {
  name: string
  score: number // 0–5
  critical?: boolean
  justification?: string
  feedback?: string
}

export interface CoachingEmailData {
  trainerName: string
  trainerEmail: string
  clientName?: string
  overallScore: number
  sections: CoachingEmailSection[]
  strengths: string[]
  improvements: string[]
  locale?: string
}

const i18n: Record<string, { subject: string; title: string; subtitle: string; wellDone: string; improve: string; footer: string }> = {
  en: {
    subject: 'Coaching Feedback',
    title: 'Coaching Feedback',
    subtitle: 'Call with',
    wellDone: 'What went well',
    improve: 'What to improve',
    footer: 'Sent automatically by AskMoses.AI',
  },
  pt: {
    subject: 'Feedback de Coaching',
    title: 'Feedback de Coaching',
    subtitle: 'Call com',
    wellDone: 'O que foi bem',
    improve: 'O que melhorar',
    footer: 'Enviado automaticamente pelo AskMoses.AI',
  },
  es: {
    subject: 'Feedback de Coaching',
    title: 'Feedback de Coaching',
    subtitle: 'Llamada con',
    wellDone: 'Lo que salió bien',
    improve: 'Lo que mejorar',
    footer: 'Enviado automáticamente por AskMoses.AI',
  },
  fr: {
    subject: 'Retour de Coaching',
    title: 'Retour de Coaching',
    subtitle: 'Appel avec',
    wellDone: 'Ce qui s\'est bien passé',
    improve: 'Ce qu\'il faut améliorer',
    footer: 'Envoyé automatiquement par AskMoses.AI',
  },
}

function t(locale: string) {
  return i18n[locale] ?? i18n.en
}

// score input is 0–5; display is 0–10
function toDisplay(score: number): number {
  return Math.round(score * 2)
}

function scoreColor(display: number): string {
  if (display >= 9) return '#16A97D'
  if (display >= 7) return '#D48A1A'
  return '#D94444'
}

function progressBar(display: number): string {
  const filled = display
  const empty = 10 - filled
  const color = scoreColor(display)

  const filledCells = Array(filled).fill(
    `<td width="14" height="14" bgcolor="${color}" style="border-radius:2px;font-size:1px;">&nbsp;</td><td width="2" style="font-size:1px;">&nbsp;</td>`
  ).join('')
  const emptyCells = Array(empty).fill(
    `<td width="14" height="14" bgcolor="#E2E6EF" style="border-radius:2px;font-size:1px;">&nbsp;</td><td width="2" style="font-size:1px;">&nbsp;</td>`
  ).join('')

  return `<table border="0" cellpadding="0" cellspacing="0" role="presentation"><tr>${filledCells}${emptyCells}</tr></table>`
}

function badge(display: number, critical?: boolean): string {
  if (display >= 9) return ' 🏆'
  if (critical && display <= 8) return ' ⚠️'
  return ''
}

function sectionRow(section: CoachingEmailSection): string {
  const display = toDisplay(section.score)
  const isCritical = !!section.critical && display <= 8
  const borderColor = isCritical ? '#D94444' : '#E2E6EF'
  const color = scoreColor(display)
  const bdg = badge(display, section.critical)

  return `
    <tr>
      <td style="padding: 0 0 8px 0;">
        <table border="0" cellpadding="12" cellspacing="0" width="100%" style="background-color:#F5F7FB;border-radius:8px;border-left:3px solid ${borderColor};">
          <tr>
            <td>
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="font-family:'DM Sans',Arial,sans-serif;font-size:14px;color:#1A1E28;font-weight:600;">
                    ${section.name}${bdg}
                  </td>
                  <td align="right" style="font-family:'DM Mono',monospace,'Courier New';font-size:14px;color:${color};font-weight:700;white-space:nowrap;">
                    ${display}/10
                  </td>
                </tr>
                <tr>
                  <td colspan="2" style="padding-top:8px;">
                    ${progressBar(display)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>`
}

function bulletList(items: string[], limit = 3): string {
  return items
    .slice(0, limit)
    .map(item => `
      <tr>
        <td style="padding: 4px 0; font-family:'DM Sans',Arial,sans-serif;font-size:14px;color:#3A4255;line-height:1.5;">
          • ${item}
        </td>
      </tr>`)
    .join('')
}

export function buildCoachingEmail(data: CoachingEmailData): { subject: string; html: string } {
  const lang = t(data.locale ?? 'en')
  const clientLabel = data.clientName ? ` ${data.clientName}` : ''
  const subject = `${lang.subject} — ${lang.subtitle}${clientLabel} | ${data.overallScore.toFixed(1)}/5`

  const worstSection = [...data.sections].sort((a, b) => a.score - b.score)[0]
  const criticalNote = worstSection && toDisplay(worstSection.score) <= 4
    ? `<tr><td style="padding:12px 0 0 0;font-family:'DM Sans',Arial,sans-serif;font-size:13px;color:#D94444;">⚠️ ${worstSection.name} — focus here this week.</td></tr>`
    : ''

  const html = `<!DOCTYPE html>
<html lang="${data.locale ?? 'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#ECEEF4;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#ECEEF4;">
    <tr>
      <td align="center" style="padding:24px 16px;">

        <!-- Container -->
        <table border="0" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background-color:#6E56FF;border-radius:12px 12px 0 0;padding:24px 28px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <p style="margin:0;font-family:'DM Sans',Arial,sans-serif;font-size:12px;color:#C4B8FF;letter-spacing:1px;text-transform:uppercase;">AskMoses.AI</p>
                    <h1 style="margin:4px 0 0 0;font-family:'DM Sans',Arial,sans-serif;font-size:20px;font-weight:700;color:#FFFFFF;">
                      📞 ${lang.title} — ${lang.subtitle}${clientLabel}
                    </h1>
                  </td>
                  <td align="right" style="white-space:nowrap;">
                    <table border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="background-color:rgba(255,255,255,0.15);border-radius:8px;padding:8px 16px;">
                          <span style="font-family:'DM Mono',monospace,'Courier New';font-size:22px;font-weight:700;color:#FFFFFF;">${data.overallScore.toFixed(1)}</span>
                          <span style="font-family:'DM Mono',monospace,'Courier New';font-size:14px;color:#C4B8FF;">/5</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Sections -->
          <tr>
            <td style="background-color:#FFFFFF;padding:20px 28px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                ${data.sections.map(sectionRow).join('')}
              </table>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="background-color:#FFFFFF;padding:0 28px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr><td height="1" bgcolor="#E2E6EF" style="font-size:1px;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>

          <!-- Strengths -->
          <tr>
            <td style="background-color:#FFFFFF;padding:20px 28px 12px 28px;">
              <p style="margin:0 0 12px 0;font-family:'DM Sans',Arial,sans-serif;font-size:15px;font-weight:700;color:#16A97D;">✅ ${lang.wellDone}</p>
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                ${bulletList(data.strengths)}
              </table>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="background-color:#FFFFFF;padding:0 28px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr><td height="1" bgcolor="#E2E6EF" style="font-size:1px;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>

          <!-- Improvements -->
          <tr>
            <td style="background-color:#FFFFFF;padding:20px 28px 24px 28px;border-radius:0 0 12px 12px;">
              <p style="margin:0 0 12px 0;font-family:'DM Sans',Arial,sans-serif;font-size:15px;font-weight:700;color:#D48A1A;">📈 ${lang.improve}</p>
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                ${bulletList(data.improvements)}
                ${criticalNote}
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 0 0 0;text-align:center;">
              <p style="margin:0;font-family:'DM Sans',Arial,sans-serif;font-size:12px;color:#7A849A;">${lang.footer}</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  return { subject, html }
}
