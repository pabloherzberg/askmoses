import { getSession, ok, unauthorized, forbidden } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Role } from '@/lib/types'

interface OrgOption {
  id: string
  name: string
  owners: { id: string; name: string; email: string }[]
}

interface OrgRow {
  id: string
  name: string
}

interface OwnerRow {
  id: string
  user_id: string
}

interface UserRow {
  id: string
  name: string
  email: string
}

function serverError(context: string, err?: unknown) {
  console.error(`[organizations] ${context}`, err)
  return Response.json(
    { data: null, error: { message: 'Erro interno', code: 500 } },
    { status: 500 }
  )
}

// GET /api/organizations
//   Admin: retorna todas as orgs com seus owners (id + nome + email)
//   Owner/trainer: 403 (orgs são metadados globais e a UI deles deriva
//   tudo do JWT, não precisam dessa lista)
export async function GET() {
  const session = await getSession()
  if (!session) return unauthorized()

  const role = session.user.app_metadata?.role as Role | undefined
  if (role !== 'admin') return forbidden()

  const admin = createAdminClient()

  const { data: orgs, error: orgsErr } = await admin
    .from('organizations')
    .select('id, name')
    .order('name')

  if (orgsErr) return serverError('Não foi possível listar as organizações', orgsErr)

  const { data: owners, error: ownersErr } = await admin
    .from('owners')
    .select('id, user_id')

  if (ownersErr) return serverError('Não foi possível listar os responsáveis', ownersErr)

  // Buscar dados dos owners (nome, email, org) — owners.user_id → users.id
  const ownerUserIds = (owners ?? []).map((o: OwnerRow) => o.user_id)
  let ownerUsers: (UserRow & { org_id: string | null })[] = []
  if (ownerUserIds.length > 0) {
    const { data, error } = await admin
      .from('users')
      .select('id, name, email, org_id')
      .in('id', ownerUserIds)
    if (error) return serverError('Não foi possível resolver os responsáveis', error)
    ownerUsers = data ?? []
  }

  const userById = new Map(ownerUsers.map((u) => [u.id, u]))

  const result: OrgOption[] = ((orgs ?? []) as OrgRow[]).map((org) => ({
    id: org.id,
    name: org.name,
    owners: (owners ?? [])
      .map((o: OwnerRow) => {
        const u = userById.get(o.user_id)
        if (!u || u.org_id !== org.id) return null
        return { id: o.id, name: u.name, email: u.email }
      })
      .filter((x): x is OrgOption['owners'][number] => x !== null)
      .sort((a, b) => a.name.localeCompare(b.name)),
  }))

  return ok(result)
}
