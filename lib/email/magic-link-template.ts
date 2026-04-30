export interface MagicLinkEmailData {
  inviteeName?: string | null
  actionLink: string
  locale?: string
}

interface Lang {
  subject: string
  preheader: string
  greeting: (name?: string | null) => string
  body: string
  cta: string
  ctaHint: string
  fallbackHint: string
  footer: string
}

const i18n: Record<string, Lang> = {
  en: {
    subject: 'Sign in to AskMoses.AI',
    preheader: 'Use the link below to sign in to your account.',
    greeting: (name) => name ? `Hello, ${name}.` : 'Hello.',
    body: 'Click the button below to sign in to AskMoses.AI. This link is single-use — request a new one if it expires.',
    cta: 'Sign in',
    ctaHint: 'This link is single-use and may expire. Open it on the device where you want to sign in.',
    fallbackHint: 'If the button does not work, copy and paste the link below into your browser:',
    footer: 'Sent automatically by AskMoses.AI. If you did not request this, ignore the email.',
  },
  pt: {
    subject: 'Entrar no AskMoses.AI',
    preheader: 'Use o link abaixo para entrar na sua conta.',
    greeting: (name) => name ? `Olá, ${name}.` : 'Olá.',
    body: 'Clique no botão abaixo para entrar no AskMoses.AI. Este link é de uso único — peça um novo se expirar.',
    cta: 'Entrar',
    ctaHint: 'Este link é de uso único e pode expirar. Abra-o no dispositivo em que deseja entrar.',
    fallbackHint: 'Se o botão não funcionar, copie e cole o link abaixo no seu navegador:',
    footer: 'Enviado automaticamente pelo AskMoses.AI. Se não foi você que solicitou, ignore este email.',
  },
  es: {
    subject: 'Iniciar sesión en AskMoses.AI',
    preheader: 'Usa el enlace abajo para iniciar sesión en tu cuenta.',
    greeting: (name) => name ? `Hola, ${name}.` : 'Hola.',
    body: 'Haz clic en el botón de abajo para iniciar sesión en AskMoses.AI. Este enlace es de un solo uso — solicita uno nuevo si caduca.',
    cta: 'Iniciar sesión',
    ctaHint: 'Este enlace es de un solo uso y puede caducar. Ábrelo en el dispositivo donde quieras iniciar sesión.',
    fallbackHint: 'Si el botón no funciona, copia y pega el enlace abajo en tu navegador:',
    footer: 'Enviado automáticamente por AskMoses.AI. Si no lo solicitaste, ignora este email.',
  },
  fr: {
    subject: 'Se connecter à AskMoses.AI',
    preheader: 'Utilisez le lien ci-dessous pour vous connecter à votre compte.',
    greeting: (name) => name ? `Bonjour, ${name}.` : 'Bonjour.',
    body: 'Cliquez sur le bouton ci-dessous pour vous connecter à AskMoses.AI. Ce lien est à usage unique — demandez-en un nouveau s\'il expire.',
    cta: 'Se connecter',
    ctaHint: 'Ce lien est à usage unique et peut expirer. Ouvrez-le sur l\'appareil avec lequel vous souhaitez vous connecter.',
    fallbackHint: 'Si le bouton ne fonctionne pas, copiez et collez le lien ci-dessous dans votre navigateur :',
    footer: 'Envoyé automatiquement par AskMoses.AI. Si vous n\'avez pas fait cette demande, ignorez cet e-mail.',
  },
}

function pickLang(locale?: string): Lang {
  if (!locale) return i18n.en
  const short = locale.slice(0, 2).toLowerCase()
  return i18n[short] ?? i18n.en
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function buildMagicLinkEmail(data: MagicLinkEmailData): { subject: string; html: string } {
  const lang = pickLang(data.locale)
  const safeName = data.inviteeName ? escapeHtml(data.inviteeName) : null
  const safeLink = data.actionLink

  const subject = lang.subject

  const html = `<!DOCTYPE html>
<html lang="${(data.locale ?? 'en').slice(0, 2)}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#ECEEF4;">
  <div style="display:none;font-size:1px;color:#ECEEF4;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${lang.preheader}
  </div>
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#ECEEF4;">
    <tr>
      <td align="center" style="padding:24px 16px;">

        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;">

          <tr>
            <td style="background-color:#6E56FF;border-radius:12px 12px 0 0;padding:24px 28px;">
              <p style="margin:0;font-family:'DM Sans',Arial,sans-serif;font-size:12px;color:#C4B8FF;letter-spacing:1px;text-transform:uppercase;">AskMoses.AI</p>
              <h1 style="margin:4px 0 0 0;font-family:'DM Sans',Arial,sans-serif;font-size:20px;font-weight:700;color:#FEFEFE;">
                🔑 ${subject}
              </h1>
            </td>
          </tr>

          <tr>
            <td style="background-color:#FFFFFF;padding:28px 28px 8px 28px;">
              <p style="margin:0 0 12px 0;font-family:'DM Sans',Arial,sans-serif;font-size:16px;font-weight:600;color:#1A1E28;">
                ${lang.greeting(safeName)}
              </p>
              <p style="margin:0;font-family:'DM Sans',Arial,sans-serif;font-size:14px;color:#3A4255;line-height:1.6;">
                ${lang.body}
              </p>
            </td>
          </tr>

          <tr>
            <td style="background-color:#FFFFFF;padding:24px 28px 8px 28px;" align="center">
              <table border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td bgcolor="#6E56FF" style="border-radius:8px;">
                    <a href="${safeLink}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:'DM Sans',Arial,sans-serif;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:8px;">
                      ${lang.cta}
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:14px 0 0 0;font-family:'DM Sans',Arial,sans-serif;font-size:12px;color:#7A849A;">
                ${lang.ctaHint}
              </p>
            </td>
          </tr>

          <tr>
            <td style="background-color:#FFFFFF;padding:16px 28px 0 28px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr><td height="1" bgcolor="#E2E6EF" style="font-size:1px;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="background-color:#FFFFFF;padding:16px 28px 24px 28px;border-radius:0 0 12px 12px;">
              <p style="margin:0 0 8px 0;font-family:'DM Sans',Arial,sans-serif;font-size:12px;color:#7A849A;">
                ${lang.fallbackHint}
              </p>
              <p style="margin:0;font-family:'DM Mono',monospace,'Courier New';font-size:11px;color:#3A4255;word-break:break-all;line-height:1.5;">
                <a href="${safeLink}" target="_blank" style="color:#6E56FF;text-decoration:underline;">${safeLink}</a>
              </p>
            </td>
          </tr>

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
