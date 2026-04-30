import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Resposta única — toda chamada que chegar até aqui retorna isso, independente
// de o email existir, ser inválido, ou de o provedor falhar. É a defesa contra
// enumeração de usuários: o cliente não consegue distinguir os caminhos.
function genericResponse() {
  return Response.json({ data: { sent: true }, error: null })
}

// POST /api/auth/magic-link
//   Body: { email }
//   Comportamento:
//     - Se o email NÃO existir em public.users → no-op silencioso
//     - Se existir → dispara magic link via signInWithOtp (shouldCreateUser=false)
//     - Sempre retorna a mesma resposta genérica
//   Esta rota nunca cria usuários. O fluxo de cadastro é exclusivo do convite
//   (POST /api/invites).
export async function POST(request: NextRequest) {
  let body: { email?: string }
  try {
    body = (await request.json()) as { email?: string }
  } catch {
    return genericResponse()
  }

  const email = body.email?.trim().toLowerCase()
  if (!email || !EMAIL_RE.test(email)) {
    return genericResponse()
  }

  const admin = createAdminClient()
  const { data: user, error: lookupErr } = await admin
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  if (lookupErr) {
    console.error('[auth] Não foi possível verificar o destinatário do link')
    return genericResponse()
  }

  if (!user) {
    // Email desconhecido — não envia, mas resposta é idêntica ao caminho feliz
    return genericResponse()
  }

  const supabase = await createClient()
  const origin = request.headers.get('origin') ?? request.nextUrl.origin
  const { error: otpErr } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${origin}/api/auth/callback`,
    },
  })

  if (otpErr) {
    console.error('[auth] Não foi possível enviar o link mágico')
  }

  return genericResponse()
}
