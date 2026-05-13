import { escapeHtml, renderEmailLayout } from './base-template'

export interface InviteEmailData {
  inviteeName: string
  role: 'trainer' | 'owner'
  orgName?: string | null
  inviterName?: string | null
  actionLink: string
  locale?: string
}

interface Lang {
  subject: (orgName?: string) => string
  preheader: string
  greeting: (name: string) => string
  bodyIntro: (params: {
    inviterName?: string
    orgName?: string
    roleLabel: string
  }) => string
  cta: string
  ctaHint: string
  fallbackHint: string
  footer: string
  roleLabels: { trainer: string; owner: string }
}

const i18n: Record<string, Lang> = {
  en: {
    subject: (orgName) =>
      orgName
        ? `You've been invited to join ${orgName} on AskMoses`
        : "You've been invited to join AskMoses",
    preheader: 'Activate your account to start using AskMoses.AI.',
    greeting: (name) => `Hello, ${name}.`,
    bodyIntro: ({ inviterName, orgName, roleLabel }) => {
      const who = inviterName ? `<strong>${inviterName}</strong>` : 'The team'
      const where = orgName ? ` at <strong>${orgName}</strong>` : ''
      return `${who} invited you to join AskMoses.AI as <strong>${roleLabel}</strong>${where}. Click the button below to set up your account and access the platform.`
    },
    cta: 'Accept invitation',
    ctaHint:
      'This link expires in 48 hours and is single-use. Open it on the device where you want to sign in.',
    fallbackHint:
      'If the button does not work, copy and paste the link below into your browser:',
    footer: 'Sent automatically by AskMoses.AI',
    roleLabels: { trainer: 'Sales Person', owner: 'Owner' },
  },
  pt: {
    subject: (orgName) =>
      orgName
        ? `Você foi convidado(a) para entrar em ${orgName} no AskMoses`
        : 'Você foi convidado(a) para entrar no AskMoses',
    preheader: 'Ative sua conta para começar a usar o AskMoses.AI.',
    greeting: (name) => `Olá, ${name}.`,
    bodyIntro: ({ inviterName, orgName, roleLabel }) => {
      const who = inviterName ? `<strong>${inviterName}</strong>` : 'A equipe'
      const where = orgName ? ` em <strong>${orgName}</strong>` : ''
      return `${who} convidou você para o AskMoses.AI como <strong>${roleLabel}</strong>${where}. Clique no botão abaixo para configurar sua conta e acessar a plataforma.`
    },
    cta: 'Aceitar convite',
    ctaHint:
      'Este link expira em 48 horas e é de uso único. Abra-o no dispositivo em que deseja entrar.',
    fallbackHint:
      'Se o botão não funcionar, copie e cole o link abaixo no seu navegador:',
    footer: 'Enviado automaticamente pelo AskMoses.AI',
    roleLabels: { trainer: 'Sales Person', owner: 'Owner' },
  },
  es: {
    subject: (orgName) =>
      orgName
        ? `Te invitaron a unirte a ${orgName} en AskMoses`
        : 'Te invitaron a unirte a AskMoses',
    preheader: 'Activa tu cuenta para empezar a usar AskMoses.AI.',
    greeting: (name) => `Hola, ${name}.`,
    bodyIntro: ({ inviterName, orgName, roleLabel }) => {
      const who = inviterName ? `<strong>${inviterName}</strong>` : 'El equipo'
      const where = orgName ? ` en <strong>${orgName}</strong>` : ''
      return `${who} te invitó a AskMoses.AI como <strong>${roleLabel}</strong>${where}. Haz clic en el botón de abajo para configurar tu cuenta y acceder a la plataforma.`
    },
    cta: 'Aceptar invitación',
    ctaHint:
      'Este enlace caduca en 48 horas y es de un solo uso. Ábrelo en el dispositivo donde quieras iniciar sesión.',
    fallbackHint:
      'Si el botón no funciona, copia y pega el enlace abajo en tu navegador:',
    footer: 'Enviado automáticamente por AskMoses.AI',
    roleLabels: { trainer: 'Sales Person', owner: 'Owner' },
  },
  fr: {
    subject: (orgName) =>
      orgName
        ? `Vous avez été invité(e) à rejoindre ${orgName} sur AskMoses`
        : 'Vous avez été invité(e) à rejoindre AskMoses',
    preheader: 'Activez votre compte pour commencer à utiliser AskMoses.AI.',
    greeting: (name) => `Bonjour, ${name}.`,
    bodyIntro: ({ inviterName, orgName, roleLabel }) => {
      const who = inviterName ? `<strong>${inviterName}</strong>` : "L'équipe"
      const where = orgName ? ` chez <strong>${orgName}</strong>` : ''
      return `${who} vous a invité(e) sur AskMoses.AI en tant que <strong>${roleLabel}</strong>${where}. Cliquez sur le bouton ci-dessous pour configurer votre compte et accéder à la plateforme.`
    },
    cta: "Accepter l'invitation",
    ctaHint:
      "Ce lien expire dans 48 heures et est à usage unique. Ouvrez-le sur l'appareil avec lequel vous souhaitez vous connecter.",
    fallbackHint:
      'Si le bouton ne fonctionne pas, copiez et collez le lien ci-dessous dans votre navigateur :',
    footer: 'Envoyé automatiquement par AskMoses.AI',
    roleLabels: { trainer: 'Sales Person', owner: 'Owner' },
  },
}

function pickLang(locale?: string): Lang {
  if (!locale) return i18n.en
  const short = locale.slice(0, 2).toLowerCase()
  return i18n[short] ?? i18n.en
}

export function buildInviteEmail(data: InviteEmailData): { subject: string; html: string } {
  const lang = pickLang(data.locale)

  // Subject é texto puro (não-HTML) — usa o orgName cru. Se escapar, sai
  // "Mike &amp; Sons" literal na inbox em vez de "Mike & Sons".
  const subject = lang.subject(data.orgName ?? undefined)

  // Para o body HTML, usar versões escapadas pra evitar XSS via dados controlados
  // pelo convidante (orgName, inviterName, inviteeName).
  const safeOrgName = data.orgName ? escapeHtml(data.orgName) : undefined
  const safeInviterName = data.inviterName ? escapeHtml(data.inviterName) : undefined
  const safeInviteeName = escapeHtml(data.inviteeName)

  const roleLabel = lang.roleLabels[data.role]

  const html = renderEmailLayout({
    locale: data.locale,
    subject,
    headerEmoji: '✉️',
    greeting: lang.greeting(safeInviteeName),
    body: lang.bodyIntro({ inviterName: safeInviterName, orgName: safeOrgName, roleLabel }),
    ctaLabel: lang.cta,
    ctaHint: lang.ctaHint,
    fallbackHint: lang.fallbackHint,
    footer: lang.footer,
    preheader: lang.preheader,
    actionLink: data.actionLink,
  })

  return { subject, html }
}
