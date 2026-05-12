import { getTranslations, getLocale } from 'next-intl/server'
import Link from 'next/link'
import { Sparkles, Lock } from 'lucide-react'
import { getActiveOrgContext } from '@/lib/auth'

interface FeatureGateProps {
  children: React.ReactNode
}

// Gate page-level pra rotas que exigem subscription ativa. Admin sempre
// passa (isSuperAdmin bypass). Owner/Trainer com sub 'inactive' vêem o
// conteúdo borrado (preview do que ganham) com overlay + CTA pra ativar.
//
// Owner: CTA aponta pra /onboarding/plan (única forma de ativar hoje).
// Trainer: copy diferente — ele não controla billing, só vê "fale com
// seu owner" sem link de ativação.
//
// Decisão UX (definida com PO): renderiza o conteúdo gated por baixo
// (blur + pointer-events-none) em vez de redirect — mostra o "valor
// gated" pro user e mantém o sidebar/header navegáveis pra ele acessar
// /onboarding/plan ou /logout. Performance: children são renderizados
// e fazem fetch normalmente; só visualmente bloqueados. Aceitável pra
// MVP; futura otimização pode short-circuitar antes de renderizar.
export async function FeatureGate({ children }: FeatureGateProps) {
  const ctx = await getActiveOrgContext()
  const t = await getTranslations('Shared.upsell.subscriptionInactive')
  const locale = await getLocale()

  // Admin bypass: nunca gated. loadOrgContext já retorna 'active' pra
  // super-admin, mas mantemos a checagem explícita por clareza.
  if (ctx?.isSuperAdmin) return <>{children}</>
  if (ctx?.subscriptionStatus === 'active') return <>{children}</>

  const isTrainer = ctx?.role === 'trainer'

  return (
    <div className="relative min-h-[calc(100vh-160px)]">
      {/* Conteúdo gated visível mas inacessível — funciona como teaser */}
      <div
        className="opacity-30 pointer-events-none select-none blur-[2px]"
        aria-hidden="true"
      >
        {children}
      </div>

      {/* Overlay com CTA */}
      <div className="absolute inset-0 flex items-start justify-center p-4 md:p-8">
        <div
          className="w-full max-w-md rounded-xl p-8 mt-8 md:mt-12"
          style={{
            background: 'var(--am-bg2)',
            border: '1px solid var(--am-accent2)',
            boxShadow: '0 20px 60px -20px rgba(0,0,0,0.5)',
          }}
        >
          <div className="flex justify-center mb-4">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-lg"
              style={{
                background: 'var(--am-accent2-bg, rgba(155,135,255,0.12))',
                color: 'var(--am-accent2)',
              }}
            >
              {isTrainer ? <Lock className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
            </div>
          </div>

          <h2
            className="text-lg font-medium text-center mb-2"
            style={{ color: 'var(--am-text)' }}
          >
            {isTrainer ? t('trainerTitle') : t('ownerTitle')}
          </h2>
          <p
            className="text-sm text-center mb-6"
            style={{ color: 'var(--am-muted)' }}
          >
            {isTrainer ? t('trainerBody') : t('ownerBody')}
          </p>

          {!isTrainer && (
            <Link
              href={`/${locale}/onboarding/plan`}
              className="block w-full text-center py-2.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: 'var(--accent)' }}
            >
              {t('ownerCta')}
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
