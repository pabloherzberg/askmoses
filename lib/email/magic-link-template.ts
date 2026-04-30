import { escapeHtml, renderEmailLayout } from './base-template'

export interface MagicLinkEmailData {
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

export function buildMagicLinkEmail(data: MagicLinkEmailData): { subject: string; html: string } {
  const lang = pickLang(data.locale)
  const safeName = data.recipientName ? escapeHtml(data.recipientName) : null

  const subject = lang.subject

  const html = renderEmailLayout({
    locale: data.locale,
    subject,
    headerEmoji: '🔑',
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
