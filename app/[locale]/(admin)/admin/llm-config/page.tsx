import { getTranslations } from 'next-intl/server'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { LlmConfigClient } from './LlmConfigClient'
import { LlmProviderSettingsClient } from './LlmProviderSettingsClient'
import { LlmPricingEditorClient } from './LlmPricingEditorClient'
import {
  aiModuleConfigs,
  aiModuleConfigLog,
  llmProviderSettingsMock,
  llmPricingMock,
} from '@/lib/mock-data'

// PREVIEW VISUAL — ainda não funcional. Provider/chave/preço vêm de mock
// data (lib/mock-data.ts), não do Supabase — /api/analyze continua 100%
// hardcoded em OpenAI/env (lib/openai.ts), sem nenhuma dependência nova.
// Quando a feature for finalizada, isso volta a buscar de
// llm_provider_settings/llm_pricing via createAdminClient().
export default async function LlmConfigPage() {
  const t = await getTranslations('Admin.llmConfig')
  const providers = llmProviderSettingsMock
  const pricing = llmPricingMock

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
          <LlmConfigClient
            initialConfigs={[...aiModuleConfigs]}
            initialLog={[...aiModuleConfigLog]}
          />
        </div>
      </div>
    </div>
  )
}
