export const dynamic = 'force-dynamic'

import { getTranslations } from 'next-intl/server'
import { getSession, getTrainerDbId } from '@/lib/auth'
import { dbGetChannelPrefs } from '@/lib/db/notifications'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { NotificationPrefsForm } from './NotificationPrefsForm'

// Configurações do trainer. Hoje só preferências de notificação — quais
// canais (sino in-app / email) o trainer mantém ativos para receber as
// recomendações de coaching enviadas pelo Owner.
export default async function TrainerSettingsPage() {
  const [session, trainerId, t] = await Promise.all([
    getSession(),
    getTrainerDbId(),
    getTranslations('Trainer.settings'),
  ])
  if (!session || !trainerId) return null

  const prefs = await dbGetChannelPrefs(trainerId)
  const email = session.user.email ?? ''

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

      <NotificationPrefsForm initialPrefs={prefs} email={email} />
    </div>
  )
}
