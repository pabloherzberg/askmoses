import { getSession, ok, requireRagFeature, unauthorized } from '@/lib/auth'
import { buildScriptIntelligence } from '@/lib/mocks/data/script-intelligence'

// POST /api/script-intelligence
//   Feature RAG-gated (TC-12 / TC-13). Plano sem has_rag (starter, pro)
//   recebe 403 com reason='PLAN_RAG_REQUIRED'. Plano pro_rag prossegue.
export async function POST() {
  const session = await getSession()
  if (!session) return unauthorized()

  const ragGate = await requireRagFeature()
  if (ragGate) return ragGate

  return ok(buildScriptIntelligence())
}
