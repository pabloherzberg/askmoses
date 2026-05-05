import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/auth'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { CreateOrgForm } from './CreateOrgForm'

export const dynamic = 'force-dynamic'

// /admin/organizations/new — TC-08
//   Admin-only. Middleware já protege /admin/*, mas reforçamos aqui — se
//   alguém burlar o middleware (config bug, route matcher gap), o page
//   ainda recusa. Owner/trainer caem em /login (sessão) ou na home da role.
export default async function CreateOrganizationPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (session.user.app_metadata?.role !== 'admin') redirect('/login')

  const t = await getTranslations('Admin.createOrg')

  return (
    <div>
      <div className="mb-6">
        <SectionLabel>{t('eyebrow')}</SectionLabel>
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--am-text)' }}>
          {t('title')}
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--am-muted)' }}>
          {t('subtitle')}
        </p>
      </div>

      <div
        className="rounded-2xl border p-6 max-w-xl"
        style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
      >
        <CreateOrgForm />
      </div>
    </div>
  )
}
