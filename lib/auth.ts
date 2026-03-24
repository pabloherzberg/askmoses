import { createClient } from '@/lib/supabase/server'
import type { Role } from '@/lib/types'

export async function getSession() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export async function getRole(): Promise<Role | null> {
  const session = await getSession()
  const role = session?.user?.app_metadata?.role as Role | undefined
  return role ?? null
}

export async function getUserId(): Promise<string | null> {
  const session = await getSession()
  return session?.user?.id ?? null
}

export function redirectByRole(role: Role): string {
  const routes: Record<Role, string> = {
    trainer: '/me',
    owner: '/dashboard',
    admin: '/admin',
  }
  return routes[role] ?? '/login'
}

// ─── Response helpers ─────────────────────────────────────────────────────────

export class AuthError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message)
  }
}

export function unauthorized() {
  return Response.json(
    { data: null, error: { message: 'Não autenticado', code: 401 } },
    { status: 401 }
  )
}

export function forbidden() {
  return Response.json(
    { data: null, error: { message: 'Acesso não autorizado', code: 403 } },
    { status: 403 }
  )
}

export function notFound(entity = 'Recurso') {
  return Response.json(
    { data: null, error: { message: `${entity} não encontrado`, code: 404 } },
    { status: 404 }
  )
}

export function ok<T>(data: T) {
  return Response.json({ data, error: null })
}
