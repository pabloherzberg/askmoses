import { ok, unauthorized, getSession, getActiveOrgContext } from '@/lib/auth'
import { getTodayAppointmentsWithIntent } from '@/lib/services/appointments'

// Agendados hoje + intent de cada lead — visão do owner em Intent Analysis.
// Owner-scoped: org ativa do solicitante (owner ou admin impersonando).
export async function GET() {
  const session = await getSession()
  if (!session) return unauthorized()

  const ctx = await getActiveOrgContext()
  const orgId = ctx?.activeOrgId
  if (!orgId || (ctx?.role !== 'owner' && ctx?.role !== 'admin')) {
    return ok({ appointments: [] })
  }

  try {
    const appointments = await getTodayAppointmentsWithIntent(orgId)
    return ok({ appointments })
  } catch {
    return ok({ appointments: [] })
  }
}
