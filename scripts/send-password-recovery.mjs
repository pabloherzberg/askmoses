/**
 * Envia email de recuperação de senha para um usuário já existente no banco.
 * Uso: node scripts/send-password-recovery.mjs <email>
 *
 * Exemplo: node scripts/send-password-recovery.mjs david@centurioncanine.com
 */

import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const SUPABASE_URL = 'https://efrqmmgwpwkhgvyithuw.supabase.co'
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmcnFtbWd3cHdraGd2eWl0aHV3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTgyMDYzMCwiZXhwIjoyMDk1Mzk2NjMwfQ.m3LshbqfYA6ghhJToXZfIb0bwpyODJ-tiZcdoc7geN0'
const RESEND_API_KEY = 're_fBZ5H8yU_3v4i2ndtuhxvtcrSLb9vKABX'
const APP_URL = 'https://app.askmoses.ai'

const targetEmail = process.argv[2] ?? 'david@centurioncanine.com'

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const resend = new Resend(RESEND_API_KEY)

console.log(`\n🔍 Buscando usuário: ${targetEmail}`)

// 1. Busca o user no banco pra obter nome e role
const { data: users, error: fetchErr } = await supabase
  .from('users')
  .select('id, name, email, role, active_org_id')
  .eq('email', targetEmail)
  .maybeSingle()

if (fetchErr) {
  console.error('❌ Erro ao buscar usuário:', fetchErr.message)
  process.exit(1)
}
if (!users) {
  console.error(`❌ Usuário não encontrado: ${targetEmail}`)
  process.exit(1)
}

console.log(`✅ Usuário encontrado:`)
console.log(`   Nome: ${users.name}`)
console.log(`   Role: ${users.role}`)
console.log(`   ID:   ${users.id}`)

// 2. Gera o link de recuperação via Supabase Auth
const redirectTo = `${APP_URL}/api/auth/verify-otp?next=${users.role === 'trainer' ? '/me' : '/dashboard'}`

const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
  type: 'recovery',
  email: targetEmail,
  options: { redirectTo },
})

if (linkErr || !linkData?.properties?.action_link) {
  console.error('❌ Erro ao gerar link de recuperação:', linkErr?.message ?? 'sem link retornado')
  process.exit(1)
}

const actionLink = linkData.properties.action_link
console.log(`\n🔗 Link gerado com sucesso (expira em 1h)`)

// 3. Monta o HTML do email
const userName = users.name ?? targetEmail.split('@')[0]

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Access your AskMoses account</title>
</head>
<body style="margin:0;padding:0;background:#0D0F14;font-family:'DM Sans',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0D0F14;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#13161D;border-radius:12px;overflow:hidden;max-width:560px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="background:#6E56FF;padding:32px 40px;text-align:center;">
              <p style="margin:0;font-size:32px;">🔐</p>
              <h1 style="margin:8px 0 0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">
                Access your account
              </h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 16px;color:#F0F2F8;font-size:16px;line-height:1.6;">
                Hello, <strong>${userName}</strong>.
              </p>
              <p style="margin:0 0 28px;color:#B0B8CC;font-size:15px;line-height:1.7;">
                Here is your access link to <strong>AskMoses.AI</strong>. Click the button below
                to sign in to your account. You can set a new password from your profile after signing in.
              </p>
              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
                <tr>
                  <td style="background:#6E56FF;border-radius:8px;">
                    <a href="${actionLink}"
                       style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:0.2px;">
                      Access AskMoses →
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;color:#7A849A;font-size:13px;text-align:center;">
                This link expires in <strong>1 hour</strong> and is single-use.
              </p>
              <!-- Fallback link -->
              <hr style="border:none;border-top:1px solid #1A1E28;margin:24px 0;" />
              <p style="margin:0 0 8px;color:#7A849A;font-size:12px;">
                If the button does not work, copy and paste the link below:
              </p>
              <p style="margin:0;word-break:break-all;font-size:11px;color:#6E56FF;font-family:monospace;">
                ${actionLink}
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #1A1E28;text-align:center;">
              <p style="margin:0;color:#7A849A;font-size:12px;">Sent automatically by AskMoses.AI</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

// 4. Envia via Resend
console.log(`\n📧 Enviando email para: ${targetEmail}`)

const { data: emailResult, error: sendErr } = await resend.emails.send({
  from: 'AskMoses.AI <noreply@askmoses.ai>',
  to: targetEmail,
  subject: 'Access your AskMoses account',
  html,
})

if (sendErr) {
  console.error('❌ Falha ao enviar email:', sendErr.message ?? sendErr)
  process.exit(1)
}

console.log(`✅ Email enviado com sucesso!`)
console.log(`   Resend ID: ${emailResult?.id}`)
console.log(`   Para:      ${targetEmail}`)
console.log(`\n🎉 Pronto! David pode clicar no link do email para acessar a conta.\n`)
