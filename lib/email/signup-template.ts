import { escapeHtml, renderEmailLayout } from './base-template'

export interface SignupEmailData {
  recipientName: string
  actionLink: string
  locale?: string
}

interface Lang {
  subject: string
  preheader: string
  greeting: (name: string) => string
  body: string
  cta: string
  ctaHint: string
  fallbackHint: string
  footer: string
}

const i18n: Record<string, Lang> = {
  en: {
    subject: 'Confirm your email to activate your AskMoses account',
    preheader: 'One last step to start using AskMoses.AI.',
    greeting: (name) => `Hello, ${name}.`,
    body:
      'Thanks for signing up to AskMoses.AI. Click the button below to confirm your email and continue setting up your organization.',
    cta: 'Confirm email',
    ctaHint:
      "This link expires in 24 hours and is single-use. If you didn't sign up, you can safely ignore this message.",
    fallbackHint:
      'If the button does not work, copy and paste the link below into your browser:',
    footer: 'Sent automatically by AskMoses.AI',
  },
  pt: {
    subject: 'Confirme seu e-mail para ativar sua conta no AskMoses',
    preheader: 'Falta só um passo para começar a usar o AskMoses.AI.',
    greeting: (name) => `Olá, ${name}.`,
    body:
      'Obrigado por se cadastrar no AskMoses.AI. Clique no botão abaixo para confirmar seu e-mail e continuar a configuração da sua organização.',
    cta: 'Confirmar e-mail',
    ctaHint:
      'Este link expira em 24 horas e é de uso único. Se você não fez este cadastro, pode ignorar esta mensagem com segurança.',
    fallbackHint:
      'Se o botão não funcionar, copie e cole o link abaixo no seu navegador:',
    footer: 'Enviado automaticamente pelo AskMoses.AI',
  },
  es: {
    subject: 'Confirma tu correo para activar tu cuenta en AskMoses',
    preheader: 'Un último paso para empezar a usar AskMoses.AI.',
    greeting: (name) => `Hola, ${name}.`,
    body:
      'Gracias por registrarte en AskMoses.AI. Haz clic en el botón de abajo para confirmar tu correo y continuar configurando tu organización.',
    cta: 'Confirmar correo',
    ctaHint:
      'Este enlace caduca en 24 horas y es de un solo uso. Si no hiciste este registro, puedes ignorar este mensaje.',
    fallbackHint:
      'Si el botón no funciona, copia y pega el enlace abajo en tu navegador:',
    footer: 'Enviado automáticamente por AskMoses.AI',
  },
  fr: {
    subject: 'Confirmez votre e-mail pour activer votre compte AskMoses',
    preheader: 'Une dernière étape avant de commencer à utiliser AskMoses.AI.',
    greeting: (name) => `Bonjour, ${name}.`,
    body:
      "Merci de votre inscription à AskMoses.AI. Cliquez sur le bouton ci-dessous pour confirmer votre e-mail et poursuivre la configuration de votre organisation.",
    cta: "Confirmer l'e-mail",
    ctaHint:
      "Ce lien expire dans 24 heures et est à usage unique. Si vous n'avez pas créé ce compte, vous pouvez ignorer ce message.",
    fallbackHint:
      'Si le bouton ne fonctionne pas, copiez et collez le lien ci-dessous dans votre navigateur :',
    footer: 'Envoyé automatiquement par AskMoses.AI',
  },
}

function pickLang(locale?: string): Lang {
  if (!locale) return i18n.en
  const short = locale.slice(0, 2).toLowerCase()
  return i18n[short] ?? i18n.en
}

export function buildSignupEmail(data: SignupEmailData): { subject: string; html: string } {
  const lang = pickLang(data.locale)

  // Subject puro: nome do user não vai no subject (PII no log de email).
  const subject = lang.subject

  const safeName = escapeHtml(data.recipientName)

  const html = renderEmailLayout({
    locale: data.locale,
    subject,
    headerEmoji: '👋',
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
