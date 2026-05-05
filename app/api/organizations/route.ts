import { type NextRequest } from 'next/server'
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

interface OwnerJoinRow {
  id: string
  org_id: string | null
  users: { id: string; name: string; email: string } | null
}

interface CreateOrgBody {
  name?: string
  planCode?: 'starter' | 'pro' | 'pro_rag'
}

const PLAN_CODES = ['starter', 'pro', 'pro_rag'] as const

function badRequest(message: string) {
  return Response.json(
    { data: null, error: { message, code: 400 } },
    { status: 400 }
  )
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

  // Duas queries: todas as orgs (pra mostrar até as sem owners) + owners JOIN users.
  // owners.org_id veio da migration 031 — usa ele direto, sem ler users.org_id legado.
  const [orgsRes, ownersRes] = await Promise.all([
    admin.from('organizations').select('id, name').order('name'),
    admin.from('owners').select('id, org_id, users!inner (id, name, email)'),
  ])

  if (orgsRes.error) return serverError('Não foi possível listar as organizações', orgsRes.error)
  if (ownersRes.error) return serverError('Não foi possível listar os responsáveis', ownersRes.error)

  const ownerRows = (ownersRes.data ?? []) as unknown as OwnerJoinRow[]
  const ownersByOrg = new Map<string, OrgOption['owners']>()
  for (const row of ownerRows) {
    if (!row.org_id || !row.users) continue
    const list = ownersByOrg.get(row.org_id) ?? []
    list.push({ id: row.id, name: row.users.name, email: row.users.email })
    ownersByOrg.set(row.org_id, list)
  }

  const result: OrgOption[] = ((orgsRes.data ?? []) as OrgRow[]).map((org) => ({
    id: org.id,
    name: org.name,
    owners: (ownersByOrg.get(org.id) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
  }))

  return ok(result)
}

// POST /api/organizations
//   Body: { name: string, planCode: 'starter' | 'pro' | 'pro_rag' }
//   Cria uma organização com seu Client espelho (1:1) e o plano associado.
//   Apenas super-admin pode criar — TC-08/TC-09. Owner/trainer recebe 403.
//   Sem rollback transacional (Supabase JS não expõe transações): em caso
//   de falha no meio do fluxo, deixamos rastros pra inspeção em vez de
//   tentar undo silencioso (admin pode ver e limpar).
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const role = session.user.app_metadata?.role as Role | undefined
  if (role !== 'admin') return forbidden()

  let body: CreateOrgBody
  try {
    body = (await request.json()) as CreateOrgBody
  } catch {
    return badRequest('Body inválido')
  }

  const name = body.name?.trim()
  const planCode = body.planCode

  if (!name) return badRequest('name é obrigatório')
  if (!planCode || !PLAN_CODES.includes(planCode)) {
    return badRequest('planCode deve ser "starter", "pro" ou "pro_rag"')
  }

  const admin = createAdminClient()

  const { data: plan, error: planErr } = await admin
    .from('plans')
    .select('id, code')
    .eq('code', planCode)
    .maybeSingle()
  if (planErr) return serverError('Não foi possível resolver o plano', planErr)
  if (!plan) return badRequest('plano não encontrado')

  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .insert({ name })
    .select('id, name')
    .single()
  if (orgErr || !org) return serverError('Não foi possível criar a organização', orgErr)

  const { data: client, error: clientErr } = await admin
    .from('clients')
    .insert({ name, plan_id: plan.id, org_id: org.id, health: 'healthy' })
    .select('id')
    .single()
  if (clientErr || !client) return serverError('Não foi possível criar o client', clientErr)

  const { error: linkErr } = await admin
    .from('organizations')
    .update({ client_id: client.id })
    .eq('id', org.id)
  if (linkErr) return serverError('Não foi possível vincular organização e client', linkErr)

  return ok({ id: org.id, name: org.name, planCode: plan.code })
}
