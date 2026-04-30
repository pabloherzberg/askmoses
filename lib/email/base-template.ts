// Layout base compartilhado por invite-template e magic-link-template.
// Mantém o HTML/styling em um lugar só — cada email transacional só precisa
// fornecer o conteúdo i18n (greeting, body, CTA, etc.).
//
// Atenção: este HTML é otimizado pra clientes de email (Gmail, Outlook, Apple
// Mail). Inline styles + tables + cores quase-puras (#FEFEFE em vez de #FFFFFF)
// pra evitar inversão automática em dark mode do Gmail mobile.

export interface EmailLayoutParams {
  locale?: string
  /** Subject em texto puro. A base escapa sozinha quando insere no HTML
   *  (<title> e <h1>) — caller passa o valor raw porque o mesmo subject vai
   *  pro header do email, onde escape HTML quebraria a renderização. */
  subject: string
  /** Emoji que aparece antes do subject no header */
  headerEmoji: string
  /** Texto da greeting já HTML-escapado (ex.: "Olá, Maria.") */
  greeting: string
  /** Conteúdo do body — pode conter HTML seguro (ex.: <strong>). Caller é
   *  responsável por escapar valores user-controlled antes de interpolar. */
  body: string
  /** Texto do botão CTA */
  ctaLabel: string
  /** Texto pequeno embaixo do CTA explicando uso único / expiração */
  ctaHint: string
  /** "If the button does not work…" */
  fallbackHint: string
  /** Texto do footer (sentido de "enviado automaticamente") */
  footer: string
  /** Texto invisível usado pelos clientes de email no preview da inbox */
  preheader: string
  /** URL do CTA (não escapar — entra dentro de href) */
  actionLink: string
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function renderEmailLayout(params: EmailLayoutParams): string {
  const langAttr = (params.locale ?? 'en').slice(0, 2).toLowerCase()
  const subjectHtml = escapeHtml(params.subject)

  return `<!DOCTYPE html>
<html lang="${langAttr}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${subjectHtml}</title>
</head>
<body style="margin:0;padding:0;background-color:#ECEEF4;">
  <!-- Preheader (hidden) -->
  <div style="display:none;font-size:1px;color:#ECEEF4;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${params.preheader}
  </div>
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#ECEEF4;">
    <tr>
      <td align="center" style="padding:24px 16px;">

        <!-- Card -->
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;">

          <!-- Header -->
          <tr>
            <td style="background-color:#6E56FF;border-radius:12px 12px 0 0;padding:24px 28px;">
              <p style="margin:0;font-family:'DM Sans',Arial,sans-serif;font-size:12px;color:#C4B8FF;letter-spacing:1px;text-transform:uppercase;">AskMoses.AI</p>
              <h1 style="margin:4px 0 0 0;font-family:'DM Sans',Arial,sans-serif;font-size:20px;font-weight:700;color:#FEFEFE;">
                ${params.headerEmoji} ${subjectHtml}
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background-color:#FFFFFF;padding:28px 28px 8px 28px;">
              <p style="margin:0 0 12px 0;font-family:'DM Sans',Arial,sans-serif;font-size:16px;font-weight:600;color:#1A1E28;">
                ${params.greeting}
              </p>
              <p style="margin:0;font-family:'DM Sans',Arial,sans-serif;font-size:14px;color:#3A4255;line-height:1.6;">
                ${params.body}
              </p>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="background-color:#FFFFFF;padding:24px 28px 8px 28px;" align="center">
              <table border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td bgcolor="#6E56FF" style="border-radius:8px;">
                    <a href="${params.actionLink}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:'DM Sans',Arial,sans-serif;font-size:15px;font-weight:600;color:#FEFEFE;text-decoration:none;border-radius:8px;">
                      ${params.ctaLabel}
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:14px 0 0 0;font-family:'DM Sans',Arial,sans-serif;font-size:12px;color:#7A849A;">
                ${params.ctaHint}
              </p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="background-color:#FFFFFF;padding:16px 28px 0 28px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr><td height="1" bgcolor="#E2E6EF" style="font-size:1px;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>

          <!-- Fallback link -->
          <tr>
            <td style="background-color:#FFFFFF;padding:16px 28px 24px 28px;border-radius:0 0 12px 12px;">
              <p style="margin:0 0 8px 0;font-family:'DM Sans',Arial,sans-serif;font-size:12px;color:#7A849A;">
                ${params.fallbackHint}
              </p>
              <p style="margin:0;font-family:'DM Mono',monospace,'Courier New';font-size:11px;color:#3A4255;word-break:break-all;line-height:1.5;">
                <a href="${params.actionLink}" target="_blank" style="color:#6E56FF;text-decoration:underline;">${params.actionLink}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 0 0 0;text-align:center;">
              <p style="margin:0;font-family:'DM Sans',Arial,sans-serif;font-size:12px;color:#7A849A;">${params.footer}</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
