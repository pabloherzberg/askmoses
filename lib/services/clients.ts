import type { Client, GlobalMetrics } from '@/lib/types'

// /admin é a tela operacional do time AskMoses pra gerenciar tenants reais —
// mockar aqui não faz sentido (Admin precisa ver orgs novas que entram via
// self-service signup, billing real, etc.). Diferente dos services de
// `trainers` e `plans` que ainda têm fallback mock pras demos de Owner/Trainer.
//
// dbGetClients filtra orgs sem plan_id (Owner em onboarding mid-flight, sub
// ainda 'inactive'). Se sua org de teste não aparece aqui, é porque você
// ainda não passou no /onboarding/plan — ative um plano pra ela aparecer.
export async function getClients(): Promise<{ clients: Client[]; metrics: GlobalMetrics }> {
  const { dbGetClients, dbGetGlobalMetrics } = await import('@/lib/db/clients')
  const [clients, metrics] = await Promise.all([dbGetClients(), dbGetGlobalMetrics()])
  return { clients, metrics }
}
