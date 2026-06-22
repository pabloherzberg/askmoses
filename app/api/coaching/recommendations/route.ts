import { type NextRequest } from 'next/server'
import { ok, unauthorized, getSession, getOrgId } from '@/lib/auth'
import { getCalls } from '@/lib/services/calls'
import { dbGetTrainerById } from '@/lib/db/trainers'
import { generateCoachingRecs, trainerPersona } from '@/lib/services/coaching'
import { routing, type Locale } from '@/i18n/routing'
import { coachingRecs as mockCoachingRecs, type CoachingRec } from '@/lib/mock-data'

// Cache em memória das recs já geradas — geração custa 1 chamada LLM (paga).
// TTL de 1h: fresco o bastante p/ refletir
// novas calls em pouco tempo, baixo o bastante p/ pular regeneração entre tabs.
// Sobrevive enquanto o processo do servidor estiver vivo; restart limpa.
interface CacheEntry { recs: CoachingRec[]; expiresAt: number }
const recsCache = new Map<string, CacheEntry>()
const TTL_MS = 60 * 60 * 1000

function resolveLocale(raw: string | null): Locale {
  if (raw && (routing.locales as readonly string[]).includes(raw)) return raw as Locale
  return routing.defaultLocale
}

function errorResponse(message: string, code: number) {
  return Response.json({ data: null, error: { message, code } }, { status: code })
}

// Gera as coaching recommendations de UM trainer via IA, analisando as calls
// reais dele. Lazy — chamado pelo Team Command Center ao abrir cada tab, pra
// não travar o carregamento da página com N chamadas de LLM.
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const trainerId = request.nextUrl.searchParams.get('trainerId')
  if (!trainerId) return errorResponse('trainerId is required', 400)
  // UUID guard — sem isso o Supabase explode com erro de cast e devolve 500
  // pra qualquer querystring lixo.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trainerId)) {
    return errorResponse('trainerId must be a valid UUID', 400)
  }

  const orgId = await getOrgId()
  if (!orgId) return ok({ recs: [] })

  const locale = resolveLocale(request.headers.get('x-locale'))

  // Cache hit — devolve sem refetch nem chamar a LLM.
  const cacheKey = `${trainerId}:${locale}`
  const cached = recsCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return ok({ recs: cached.recs })
  }

  // Calls SEM locale — o prompt da geração já pede "Write in {locale}" pra IA,
  // então não precisamos pagar uma rodada de tradução de até 50 calls só para
  // alimentar o prompt. O resultado final sai no locale alvo direto da IA.
  const [trainer, calls] = await Promise.all([
    dbGetTrainerById(trainerId),
    getCalls({ orgId, trainerId, limit: 50 }),
  ])

  // Trainer sem calls → sem recs. Não faz sentido fabricar recomendação pra
  // quem não tem o que ser analisado — o fallback mock só vale quando há
  // dado real e a geração da IA falha (quota, parsing etc.).
  if (!trainer || calls.length === 0) return ok({ recs: [] })

  try {
    const recs = await generateCoachingRecs(trainer.name, calls, locale, orgId)
    if (recs.length === 0) throw new Error('IA returned no recommendations')
    recsCache.set(cacheKey, { recs, expiresAt: Date.now() + TTL_MS })
    return ok({ recs })
  } catch (e) {
    // Mock fallback só nesse caso — há calls reais p/ analisar, mas a IA não
    // respondeu. Não cacheamos: quando ela voltar, a próxima request tenta.
    console.error('[coaching/recommendations] generation failed, serving mock:', e)
    const fallback = mockCoachingRecs[trainerPersona(trainerId)] ?? []
    return ok({ recs: fallback })
  }
}
