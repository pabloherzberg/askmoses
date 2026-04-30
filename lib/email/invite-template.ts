export interface InviteEmailData {
  inviteeName: string;
  role: "trainer" | "owner";
  orgName?: string | null;
  inviterName?: string | null;
  actionLink: string;
  locale?: string;
}

interface Lang {
  subject: (orgName?: string) => string;
  preheader: string;
  greeting: (name: string) => string;
  bodyIntro: (params: {
    inviterName?: string;
    orgName?: string;
    roleLabel: string;
  }) => string;
  cta: string;
  ctaHint: string;
  fallbackHint: string;
  footer: string;
  roleLabels: { trainer: string; owner: string };
}

const i18n: Record<string, Lang> = {
  en: {
    subject: (orgName) =>
      orgName
        ? `You have been invited to ${orgName} on AskMoses.AI`
        : "You have been invited to AskMoses.AI",
    preheader: "Activate your account to start using AskMoses.AI.",
    greeting: (name) => `Hello, ${name}.`,
    bodyIntro: ({ inviterName, orgName, roleLabel }) => {
      const who = inviterName ? `<strong>${inviterName}</strong>` : "The team";
      const where = orgName ? ` at <strong>${orgName}</strong>` : "";
      return `${who} invited you to join AskMoses.AI as <strong>${roleLabel}</strong>${where}. Click the button below to set up your account and access the platform.`;
    },
    cta: "Accept invitation",
    ctaHint:
      "This link is single-use and may expire. Open it on the device where you want to sign in.",
    fallbackHint:
      "If the button does not work, copy and paste the link below into your browser:",
    footer: "Sent automatically by AskMoses.AI",
    roleLabels: { trainer: "Trainer", owner: "Owner" },
  },
  pt: {
    subject: (orgName) =>
      orgName
        ? `Você foi convidado(a) para ${orgName} no AskMoses.AI`
        : "Você foi convidado(a) para o AskMoses.AI",
    preheader: "Ative sua conta para começar a usar o AskMoses.AI.",
    greeting: (name) => `Olá, ${name}.`,
    bodyIntro: ({ inviterName, orgName, roleLabel }) => {
      const who = inviterName ? `<strong>${inviterName}</strong>` : "A equipe";
      const where = orgName ? ` em <strong>${orgName}</strong>` : "";
      return `${who} convidou você para o AskMoses.AI como <strong>${roleLabel}</strong>${where}. Clique no botão abaixo para configurar sua conta e acessar a plataforma.`;
    },
    cta: "Aceitar convite",
    ctaHint:
      "Este link é de uso único e pode expirar. Abra-o no dispositivo em que deseja entrar.",
    fallbackHint:
      "Se o botão não funcionar, copie e cole o link abaixo no seu navegador:",
    footer: "Enviado automaticamente pelo AskMoses.AI",
    roleLabels: { trainer: "Trainer", owner: "Owner" },
  },
  es: {
    subject: (orgName) =>
      orgName
        ? `Te invitaron a ${orgName} en AskMoses.AI`
        : "Te invitaron a AskMoses.AI",
    preheader: "Activa tu cuenta para empezar a usar AskMoses.AI.",
    greeting: (name) => `Hola, ${name}.`,
    bodyIntro: ({ inviterName, orgName, roleLabel }) => {
      const who = inviterName ? `<strong>${inviterName}</strong>` : "El equipo";
      const where = orgName ? ` en <strong>${orgName}</strong>` : "";
      return `${who} te invitó a AskMoses.AI como <strong>${roleLabel}</strong>${where}. Haz clic en el botón de abajo para configurar tu cuenta y acceder a la plataforma.`;
    },
    cta: "Aceptar invitación",
    ctaHint:
      "Este enlace es de un solo uso y puede caducar. Ábrelo en el dispositivo donde quieras iniciar sesión.",
    fallbackHint:
      "Si el botón no funciona, copia y pega el enlace abajo en tu navegador:",
    footer: "Enviado automáticamente por AskMoses.AI",
    roleLabels: { trainer: "Trainer", owner: "Owner" },
  },
  fr: {
    subject: (orgName) =>
      orgName
        ? `Vous avez été invité(e) à rejoindre ${orgName} sur AskMoses.AI`
        : "Vous avez été invité(e) à rejoindre AskMoses.AI",
    preheader: "Activez votre compte pour commencer à utiliser AskMoses.AI.",
    greeting: (name) => `Bonjour, ${name}.`,
    bodyIntro: ({ inviterName, orgName, roleLabel }) => {
      const who = inviterName ? `<strong>${inviterName}</strong>` : "L'équipe";
      const where = orgName ? ` chez <strong>${orgName}</strong>` : "";
      return `${who} vous a invité(e) sur AskMoses.AI en tant que <strong>${roleLabel}</strong>${where}. Cliquez sur le bouton ci-dessous pour configurer votre compte et accéder à la plateforme.`;
    },
    cta: "Accepter l'invitation",
    ctaHint:
      "Ce lien est à usage unique et peut expirer. Ouvrez-le sur l'appareil avec lequel vous souhaitez vous connecter.",
    fallbackHint:
      "Si le bouton ne fonctionne pas, copiez et collez le lien ci-dessous dans votre navigateur :",
    footer: "Envoyé automatiquement par AskMoses.AI",
    roleLabels: { trainer: "Trainer", owner: "Owner" },
  },
};

function pickLang(locale?: string): Lang {
  if (!locale) return i18n.en;
  const short = locale.slice(0, 2).toLowerCase();
  return i18n[short] ?? i18n.en;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildInviteEmail(data: InviteEmailData): {
  subject: string;
  html: string;
} {
  const lang = pickLang(data.locale);
  const safeOrgName = data.orgName ? escapeHtml(data.orgName) : undefined;
  const safeInviterName = data.inviterName
    ? escapeHtml(data.inviterName)
    : undefined;
  const safeInviteeName = escapeHtml(data.inviteeName);
  const safeLink = data.actionLink; // não escapar — vai dentro de href

  const subject = lang.subject(safeOrgName);
  const roleLabel = lang.roleLabels[data.role];

  const html = `<!DOCTYPE html>
<html lang="${pickLang(data.locale) === i18n.en ? "en" : (data.locale ?? "en").slice(0, 2)}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#ECEEF4;">
  <!-- Preheader (hidden) -->
  <div style="display:none;font-size:1px;color:#ECEEF4;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${lang.preheader}
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
                ✉️ ${subject}
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background-color:#FFFFFF;padding:28px 28px 8px 28px;">
              <p style="margin:0 0 12px 0;font-family:'DM Sans',Arial,sans-serif;font-size:16px;font-weight:600;color:#1A1E28;">
                ${lang.greeting(safeInviteeName)}
              </p>
              <p style="margin:0;font-family:'DM Sans',Arial,sans-serif;font-size:14px;color:#3A4255;line-height:1.6;">
                ${lang.bodyIntro({ inviterName: safeInviterName, orgName: safeOrgName, roleLabel })}
              </p>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="background-color:#FFFFFF;padding:24px 28px 8px 28px;" align="center">
              <table border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td bgcolor="#6E56FF" style="border-radius:8px;">
                    <a href="${safeLink}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:'DM Sans',Arial,sans-serif;font-size:15px;font-weight:600;color:#FEFEFE;text-decoration:none;border-radius:8px;">
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

          <!-- Divider -->
          <tr>
            <td style="background-color:#FEFEFE;padding:16px 28px 0 28px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr><td height="1" bgcolor="#E2E6EF" style="font-size:1px;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>

          <!-- Fallback link -->
          <tr>
            <td style="background-color:#FEFEFE;padding:16px 28px 24px 28px;border-radius:0 0 12px 12px;">
              <p style="margin:0 0 8px 0;font-family:'DM Sans',Arial,sans-serif;font-size:12px;color:#7A849A;">
                ${lang.fallbackHint}
              </p>
              <p style="margin:0;font-family:'DM Mono',monospace,'Courier New';font-size:11px;color:#3A4255;word-break:break-all;line-height:1.5;">
                <a href="${safeLink}" target="_blank" style="color:#6E56FF;text-decoration:underline;">${safeLink}</a>
              </p>
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
</html>`;

  return { subject, html };
}
