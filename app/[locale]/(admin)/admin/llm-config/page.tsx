import { getTranslations } from 'next-intl/server'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { LlmConfigClient } from './LlmConfigClient'
import { LlmProviderSettingsClient } from './LlmProviderSettingsClient'
import { LlmPricingEditorClient } from './LlmPricingEditorClient'
import { getAdminLlmSettings } from '@/lib/db/llm-settings'
import { getAllModuleConfigs } from '@/lib/db/ai-module-configs'
import type { LlmProviderSetting, LlmPricingRow, AiModuleConfig, AiModuleConfigLogEntry } from '@/lib/types'

// Página SSR (Server Component — não passa por MSW). Lê provider/pricing/tuning
// DIRETO do Supabase via service-role. Se as migrations (099/088/100/101) ainda
// não rodaram, a query falha e caímos em listas vazias — a UI mostra o estado
// "não migrado" (tratado nos clients). Nada de mock aqui.
export default async function LlmConfigPage() {
  const t = await getTranslations('Admin.llmConfig')

  let providers: LlmProviderSetting[] = []
  let pricing: LlmPricingRow[] = []
  try {
    const settings = await getAdminLlmSettings()
    providers = settings.providers
    pricing = settings.pricing
  } catch (err) {
    console.error('[llm-config] falha ao carregar provider/pricing:', err)
  }

  let configs: AiModuleConfig[] = []
  let log: AiModuleConfigLogEntry[] = []
  try {
    const modules = await getAllModuleConfigs()
    configs = modules.configs
    log = modules.log
  } catch (err) {
    console.error('[llm-config] falha ao carregar módulos:', err)
  }

  return (
    <div>
      <div className="mb-6">
        <SectionLabel>{t('label')}</SectionLabel>
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--am-text)' }}>
          {t('title')}
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--am-muted)' }}>
          {t('subtitle')}
        </p>
      </div>

      <div className="space-y-10">
        <LlmProviderSettingsClient initialProviders={providers} />

        <LlmPricingEditorClient initialPricing={pricing} />

        <div>
          <SectionLabel>{t('moduleTuningLabel')}</SectionLabel>
          <LlmConfigClient initialConfigs={configs} initialLog={log} />
        </div>
      </div>
    </div>
  )
}
