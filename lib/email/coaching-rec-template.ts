import { escapeHtml } from './base-template'

// Email de uma recomendação de coaching. Self-contained (não usa base-template,
// que é desenhado pra emails transacionais com CTA de token). Mesma identidade
// visual de coaching-template.ts — header roxo + bloco de conteúdo.

export interface CoachingRecEmailData {
  trainerName: string
  senderName: string
  /** Texto da recomendação — pode conter múltiplas linhas. */
  body: string
  locale?: string
}

interface Strings {
  subject: string // contém {sender}
  headerTitle: string
  greeting: string // contém {name}
  intro: string // contém {sender}
  footerNote: string
}

const i18n: Record<string, Strings> = {
  en: {
    subject: 'New coaching recommendation from {sender}',
    headerTitle: 'Coaching Recommendation',
    greeting: 'Hi {name},',
    intro: '{sender} sent you a coaching recommendation:',
    footerNote: 'Sent by AskMoses.AI — manage your channels in Settings → Notification preferences',
  },
  pt: {
    subject: 'Nova recomendação de coaching de {sender}',
    headerTitle: 'Recomendação de Coaching',
    greeting: 'Olá, {name}!',
    intro: '{sender} enviou uma recomendação de coaching para você:',
    footerNote: 'Enviado pelo AskMoses.AI — gerencie seus canais em Configurações → Preferências de notificação',
  },
  es: {
    subject: 'Nueva recomendación de coaching de {sender}',
    headerTitle: 'Recomendación de Coaching',
    greeting: '¡Hola, {name}!',
    intro: '{sender} te envió una recomendación de coaching:',
    footerNote: 'Enviado por AskMoses.AI — gestiona tus canales en Configuración → Preferencias de notificación',
  },
  fr: {
    subject: 'Nouvelle recommandation de coaching de {sender}',
    headerTitle: 'Recommandation de Coaching',
    greeting: 'Bonjour {name},',
    intro: '{sender} vous a envoyé une recommandation de coaching :',
    footerNote: 'Envoyé par AskMoses.AI — gérez vos canaux dans Paramètres → Préférences de notification',
  },
}

function pickStrings(locale?: string): Strings {
  return i18n[(locale ?? 'en').slice(0, 2).toLowerCase()] ?? i18n.en
}

function fill(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '')
}

export function buildCoachingRecEmail(data: CoachingRecEmailData): {
  subject: string
  html: string
} {
  const s = pickStrings(data.locale)
  const lang = (data.locale ?? 'en').slice(0, 2).toLowerCase()
  const trainerFirst = data.trainerName.split(' ')[0] || data.trainerName

  // subject é texto puro (vai pro header do email) — não escapar.
  const subject = fill(s.subject, { sender: data.senderName })
  const greeting = escapeHtml(fill(s.greeting, { name: trainerFirst }))
  const intro = escapeHtml(fill(s.intro, { sender: data.senderName }))
  // body é texto livre do owner — escapar e converter quebras de linha
  // (suporta LF e CRLF; alguns clientes deixavam \r visível).
  const bodyHtml = escapeHtml(data.body).replace(/\r?\n/g, '<br>')

  const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#ECEEF4;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#ECEEF4;">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;">

          <!-- Header -->
          <tr>
            <td style="background-color:#6E56FF;border-radius:12px 12px 0 0;padding:24px 28px;">
              <p style="margin:0;font-family:'DM Sans',Arial,sans-serif;font-size:12px;color:#C4B8FF;letter-spacing:1px;text-transform:uppercase;">AskMoses.AI</p>
              <h1 style="margin:4px 0 0 0;font-family:'DM Sans',Arial,sans-serif;font-size:20px;font-weight:700;color:#FEFEFE;">
                💡 ${escapeHtml(s.headerTitle)}
              </h1>
            </td>
          </tr>

          <!-- Greeting + intro -->
          <tr>
            <td style="background-color:#FFFFFF;padding:28px 28px 8px 28px;">
              <p style="margin:0 0 6px 0;font-family:'DM Sans',Arial,sans-serif;font-size:16px;font-weight:600;color:#1A1E28;">
                ${greeting}
              </p>
              <p style="margin:0 0 16px 0;font-family:'DM Sans',Arial,sans-serif;font-size:14px;color:#3A4255;line-height:1.6;">
                ${intro}
              </p>
            </td>
          </tr>

          <!-- Recommendation block -->
          <tr>
            <td style="background-color:#FFFFFF;padding:0 28px 24px 28px;border-radius:0 0 12px 12px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#F5F7FB;border-radius:8px;border-left:3px solid #6E56FF;">
                <tr>
                  <td style="padding:16px 18px;font-family:'DM Sans',Arial,sans-serif;font-size:14px;color:#1A1E28;line-height:1.7;">
                    ${bodyHtml}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 0 0 0;text-align:center;">
              <p style="margin:0;font-family:'DM Sans',Arial,sans-serif;font-size:12px;color:#7A849A;">${escapeHtml(s.footerNote)}</p>
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
