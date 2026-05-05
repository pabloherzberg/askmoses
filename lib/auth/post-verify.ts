import { createAdminClient } from '@/lib/supabase/admin'
import type { Role } from '@/lib/types'

const HOME: Record<Role, string> = { trainer: '/me', owner: '/dashboard', admin: '/admin' }

const SAFE_NEXT_PATHS: ReadonlySet<string> = new Set([
  '/me',
  '/dashboard',
  '/admin',
  '/calls',
  '/team-command-center',
])

export async function markInviteAccepted(userId: string): Promise<void> {
  const admin = createAdminClient()
  // Aceita TODAS as memberships pendentes do user — o magic link verificou
  // o email, então qualquer convite anterior pendente vira accepted. E
  // ESPELHA em users.invite_status: o campo legado ainda é lido por
  // /api/auth/magic-link (gate de quem pode receber link) e por
  // dbGetTrainers (filtro 'accepted' nas listas operacionais). Manter os
  // dois sincronizados até a migration que dropar users.invite_status.
  await Promise.all([
    admin
      .from('memberships')
      .update({ invite_status: 'accepted' })
      .eq('user_id', userId)
      .eq('invite_status', 'pending'),
    admin
      .from('users')
      .update({ invite_status: 'accepted' })
      .eq('id', userId)
      .eq('invite_status', 'pending'),
  ])
}

export function resolveDestination(role: Role | undefined, nextRaw: string | null): string {
  if (nextRaw && isSafeNextPath(nextRaw)) return nextRaw
  return role ? HOME[role] : '/login'
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
