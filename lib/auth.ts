import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import type { Role } from '@/lib/types'

const VALID_ROLES: Role[] = ['trainer', 'owner', 'admin']

// Sessão demo: retornada quando cookie `demo-role` está presente (Fase 1)
function makeDemoSession(role: Role) {
  return {
    user: {
      id: `demo-${role}`,
      email: `${role}@demo.askmoses.ai`,
      app_metadata: { role },
    },
  }
}

export async function getSession() {
  // Demo mode — cookie `demo-role` tem prioridade (Fase 1)
  const cookieStore = await cookies()
  const demoRole = cookieStore.get('demo-role')?.value as Role | undefined
  if (demoRole && VALID_ROLES.includes(demoRole)) {
    return makeDemoSession(demoRole)
  }

  // Production — Supabase Auth
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

export async function getTrainerId(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get('demo-trainer-id')?.value ?? null
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
