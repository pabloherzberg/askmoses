import { ok, unauthorized } from '@/lib/auth'
import { getSession } from '@/lib/auth'
import { buildScriptIntelligence } from '@/lib/mocks/data/script-intelligence'

export async function POST() {
  const session = await getSession()
  if (!session) return unauthorized()

  return ok(buildScriptIntelligence())
}
