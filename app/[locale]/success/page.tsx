'use client'

import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle } from 'lucide-react'

const PLAN_LABELS: Record<string, string> = {
  solo: 'Solo',
  pro: 'Pro',
}

export default function SuccessPage() {
  const params = useSearchParams()
  const plan = params.get('plan') ?? ''
  const sessionId = params.get('session_id') ?? ''
  const planLabel = PLAN_LABELS[plan] ?? 'seu plano'

  const signupHref = `/signup?plan=${encodeURIComponent(plan)}&session_id=${encodeURIComponent(sessionId)}`

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <div className="max-w-md">
        <CheckCircle className="mx-auto mb-6 h-16 w-16 text-green-500" />
        <h1 className="text-3xl font-bold text-foreground">Pagamento confirmado!</h1>
        <p className="mt-4 text-lg text-foreground/70">
          Seu plano <span className="font-semibold text-foreground">{planLabel}</span> está ativo.
          Agora crie sua conta para acessar a plataforma.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href={signupHref}
            className="inline-flex items-center justify-center rounded-lg bg-foreground px-6 py-3 text-sm font-semibold text-background transition-opacity hover:opacity-80"
          >
            Criar minha conta →
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg border border-border px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:border-foreground/40"
          >
            Voltar para o site
          </Link>
        </div>
        <p className="mt-6 text-xs text-foreground/40">
          Já tem uma conta?{' '}
          <Link href="/login" className="underline hover:text-foreground/70">
            Fazer login
          </Link>
        </p>
      </div>
    </div>
  )
}
