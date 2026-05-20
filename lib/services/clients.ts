import type { ClientsPage, ClientsQuery } from '@/lib/db/clients'
import type { GlobalMetrics } from '@/lib/types'

// /admin é a tela operacional do time AskMoses pra gerenciar tenants reais —
// mockar aqui não faz sentido (Admin precisa ver orgs novas que entram via
// self-service signup, billing real, etc.).
//
// Filtra orgs sem plan_id (Owner em onboarding mid-flight, sub ainda
// 'inactive'). Se sua org de teste não aparece aqui, é porque ainda não
// passou no /onboarding/plan — ative um plano pra ela aparecer.

/**
 * Listagem paginada/filtrada de orgs pro painel /admin.
 * Sucede o getClients() antigo (que carregava tudo).
 */
export async function getClientsPage(query: ClientsQuery): Promise<ClientsPage> {
  const { dbListClients } = await import('@/lib/db/clients')
  return dbListClients(query)
}

/**
 * Métricas globais (totals/MRR/avg score) — não paginadas, agregação direta.
 */
export async function getGlobalMetrics(): Promise<GlobalMetrics> {
  const { dbGetGlobalMetrics } = await import('@/lib/db/clients')
  return dbGetGlobalMetrics()
}
