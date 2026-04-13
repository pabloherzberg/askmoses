import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Role } from '@/lib/types'

export async function getSession() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export async function getRole(): Promise<Role | null> {
  const session = await getSession()
  return (session?.user?.app_metadata?.role as Role) ?? null
}

export async function getOrgId(): Promise<string | null> {
  const session = await getSession()
  return (session?.user?.app_metadata?.org_id as string) ?? null
}

export async function getTrainerDbId(): Promise<string | null> {
  const session = await getSession()
  if (!session) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('trainers')
    .select('id')
    .eq('user_id', session.user.id)
    .single()
  return data?.id ?? null
}

export function redirectByRole(role: Role): string {
  const routes: Record<Role, string> = { trainer: '/me', owner: '/dashboard', admin: '/admin' }
  return routes[role] ?? '/login'
}

// ─── Response helpers ─────────────────────────────────────────────────────────

export function unauthorized() {
  return Response.json({ data: null, error: { message: 'Não autenticado', code: 401 } }, { status: 401 })
}

export function forbidden() {
  return Response.json({ data: null, error: { message: 'Acesso não autorizado', code: 403 } }, { status: 403 })
}

export function notFound(entity = 'Recurso') {
  return Response.json({ data: null, error: { message: `${entity} não encontrado`, code: 404 } }, { status: 404 })
}

export function ok<T>(data: T) {
  return Response.json({ data, error: null })
}
