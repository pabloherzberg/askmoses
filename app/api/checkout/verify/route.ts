import { type NextRequest } from 'next/server'
import Stripe from 'stripe'

// Lazy singleton — ver nota em app/api/checkout/route.ts (não instanciar Stripe
// no topo do módulo pra não quebrar o `next build`).
let stripeClient: Stripe | null = null
function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error('STRIPE_SECRET_KEY não configurada')
    stripeClient = new Stripe(key, { apiVersion: '2025-05-28.basil' })
  }
  return stripeClient
}

// Mapeia price_id do Stripe → planCode do banco
const PRICE_TO_PLAN: Record<string, string> = {
  [process.env.STRIPE_PRICE_SOLO!]: 'starter',
  [process.env.STRIPE_PRICE_PRO!]: 'pro',
}

// GET /api/checkout/verify?session_id=cs_...
// Confirma que a Checkout Session foi paga e devolve o planCode correspondente.
// Usado pelo /onboarding/plan para saber qual plano ativar sem exibir o seletor.
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('session_id')

  if (!sessionId) {
    return Response.json(
      { data: null, error: { message: 'session_id é obrigatório', code: 400 } },
      { status: 400 }
    )
  }

  const session = await getStripe().checkout.sessions.retrieve(sessionId, {
    expand: ['line_items'],
  })

  if (session.payment_status !== 'paid') {
    return Response.json(
      { data: null, error: { message: 'Pagamento não confirmado', code: 402 } },
      { status: 402 }
    )
  }

  const priceId = session.line_items?.data[0]?.price?.id ?? ''
  const planCode = PRICE_TO_PLAN[priceId]

  if (!planCode) {
    return Response.json(
      { data: null, error: { message: 'Plano não reconhecido', code: 422 } },
      { status: 422 }
    )
  }

  return Response.json({ data: { planCode, sessionId }, error: null })
}
