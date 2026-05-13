import { createAdminClient } from '@/lib/supabase/admin'
import type { Role } from '@/lib/types'

const HOME: Record<Role, string> = { trainer: '/me', owner: '/dashboard', admin: '/admin' }

const SAFE_NEXT_PATHS: ReadonlySet<string> = new Set([
  '/me',
  '/dashboard',
  '/admin',
  '/calls',
  '/team-command-center',
  '/onboarding',
  '/password',
])

export async function markInviteAccepted(userId: string, orgId: string): Promise<void> {
  const admin = createAdminClient()
  // Aceita APENAS a membership de (user, org) — cada convite é per-org e
  // exige confirmação explícita do email da org que convidou. Aceitar
  // todas as pendentes de uma vez permitia que alguém fosse adicionado a
  // uma segunda org sem provar posse do email pra aquela org específica.
  //
  // users.invite_status é o campo legado lido por /api/auth/magic-link
  // (gate de quem pode receber link) e por dbGetTrainers (filtro nas
  // listas operacionais). Marcamos accepted no primeiro convite aceito —
  // se já estiver accepted, o .eq('invite_status','pending') faz no-op.
  //
  // Logamos errors em vez de throw: se um update falhar (RLS drift, schema
  // change), o user já está autenticado e o redirect tem que acontecer —
  // mas precisamos enxergar o estado quebrado nos logs pra agir.
  const [memRes, userRes] = await Promise.all([
    admin
      .from('memberships')
      .update({ invite_status: 'accepted' })
      .eq('user_id', userId)
      .eq('org_id', orgId)
      .eq('invite_status', 'pending'),
    admin
      .from('users')
      .update({ invite_status: 'accepted' })
      .eq('id', userId)
      .eq('invite_status', 'pending'),
  ])

  if (memRes.error) {
    console.error('[post-verify] markInviteAccepted: memberships update falhou', {
      userId,
      orgId,
      error: memRes.error,
    })
  }
  if (userRes.error) {
    console.error('[post-verify] markInviteAccepted: users update falhou', {
      userId,
      error: userRes.error,
    })
  }
}

export function resolveDestination(role: Role | undefined, nextRaw: string | null): string {
  if (nextRaw && isSafeNextPath(nextRaw)) return nextRaw
  // Sem role + sessão válida = Owner pós-signup que ainda não criou org.
  // Mandar pra /onboarding evita o loop (middleware redirecionaria /login →
  // /onboarding de qualquer forma já que ele tem sessão).
  return role ? HOME[role] : '/onboarding'
}

function isSafeNextPath(value: string): boolean {
  if (!value.startsWith('/')) return false
  if (value.startsWith('//')) return false

  const path = value.split('?')[0].split('#')[0]
  if (SAFE_NEXT_PATHS.has(path)) return true
  for (const allowed of SAFE_NEXT_PATHS) {
    if (path.startsWith(`${allowed}/`)) return true
  }
  return false
}
