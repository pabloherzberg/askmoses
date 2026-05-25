import { escapeHtml, renderEmailLayout } from './base-template'

export interface RecoveryEmailData {
  recipientName?: string | null
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
    subject: 'Reset your AskMoses password',
    preheader: 'Use the link below to choose a new password.',
    greeting: (name) => (name ? `Hello, ${name}.` : 'Hello.'),
    body: 'We received a request to reset your password. Click the button below to choose a new one.',
    cta: 'Reset password',
    ctaHint: 'This link expires in 1 hour and is single-use. If you did not request a password reset, you can safely ignore this email.',
    fallbackHint: 'If the button does not work, copy and paste the link below into your browser:',
    footer: 'Sent automatically by AskMoses.AI. If you did not request this, ignore the email.',
  },
  pt: {
    subject: 'Redefinir sua senha do AskMoses',
    preheader: 'Use o link abaixo para escolher uma nova senha.',
    greeting: (name) => (name ? `Olá, ${name}.` : 'Olá.'),
    body: 'Recebemos um pedido para redefinir sua senha. Clique no botão abaixo para escolher uma nova.',
    cta: 'Redefinir senha',
    ctaHint: 'Este link expira em 1 hora e é de uso único. Se você não solicitou a redefinição, pode ignorar este email.',
    fallbackHint: 'Se o botão não funcionar, copie e cole o link abaixo no seu navegador:',
    footer: 'Enviado automaticamente pelo AskMoses.AI. Se não foi você que solicitou, ignore este email.',
  },
  es: {
    subject: 'Restablecer tu contraseña de AskMoses',
    preheader: 'Usa el enlace abajo para elegir una nueva contraseña.',
    greeting: (name) => (name ? `Hola, ${name}.` : 'Hola.'),
    body: 'Recibimos una solicitud para restablecer tu contraseña. Haz clic en el botón de abajo para elegir una nueva.',
    cta: 'Restablecer contraseña',
    ctaHint: 'Este enlace caduca en 1 hora y es de un solo uso. Si no solicitaste el restablecimiento, puedes ignorar este email.',
    fallbackHint: 'Si el botón no funciona, copia y pega el enlace abajo en tu navegador:',
    footer: 'Enviado automáticamente por AskMoses.AI. Si no lo solicitaste, ignora este email.',
  },
  fr: {
    subject: 'Réinitialiser votre mot de passe AskMoses',
    preheader: 'Utilisez le lien ci-dessous pour choisir un nouveau mot de passe.',
    greeting: (name) => (name ? `Bonjour, ${name}.` : 'Bonjour.'),
    body: 'Nous avons reçu une demande de réinitialisation de votre mot de passe. Cliquez sur le bouton ci-dessous pour en choisir un nouveau.',
    cta: 'Réinitialiser le mot de passe',
    ctaHint: 'Ce lien expire dans 1 heure et est à usage unique. Si vous n\'avez pas demandé de réinitialisation, vous pouvez ignorer cet e-mail.',
    fallbackHint: 'Si le bouton ne fonctionne pas, copiez et collez le lien ci-dessous dans votre navigateur :',
    footer: 'Envoyé automatiquement par AskMoses.AI. Si vous n\'avez pas fait cette demande, ignorez cet e-mail.',
  },
}

function pickLang(locale?: string): Lang {
  if (!locale) return i18n.en
  const short = locale.slice(0, 2).toLowerCase()
  return i18n[short] ?? i18n.en
}

export function buildRecoveryEmail(data: RecoveryEmailData): { subject: string; html: string } {
  const lang = pickLang(data.locale)
  const safeName = data.recipientName ? escapeHtml(data.recipientName) : null

  const subject = lang.subject

  const html = renderEmailLayout({
    locale: data.locale,
    subject,
    headerEmoji: '🔐',
    greeting: lang.greeting(safeName),
    body: lang.body,
    ctaLabel: lang.cta,
    ctaHint: lang.ctaHint,
    fallbackHint: lang.fallbackHint,
    footer: lang.footer,
    preheader: lang.preheader,
    actionLink: data.actionLink,
  })

  return { subject, html }
}
