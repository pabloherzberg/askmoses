import { type NextRequest } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-05-28.basil',
})

const PRICE_MAP: Record<string, string> = {
  solo: process.env.STRIPE_PRICE_SOLO!,
  pro: process.env.STRIPE_PRICE_PRO!,
}

function badRequest(message: string) {
  return Response.json({ data: null, error: { message, code: 400 } }, { status: 400 })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const plan = body?.plan as string | undefined

  if (!plan || !PRICE_MAP[plan]) {
    return badRequest('Plano inválido. Use "solo" ou "pro".')
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: PRICE_MAP[plan], quantity: 1 }],
    success_url: `${appUrl}/success?plan=${plan}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/#pricing`,
  })

  return Response.json({ data: { url: session.url }, error: null })
}
