import { redirect } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { getActiveOrgContext, getManualUploadEnabledForActiveOrg } from '@/lib/auth'
import UploadCallClient from './UploadCallClient'

// Server guard: o upload manual exige (a) Admin ter ligado
// `manual_upload_enabled` em /admin/organizations/[id] e (b) o caller
// ser Sales Person (trainer) ou Admin. Owner nunca envia chamadas —
// fica na curadoria/coaching, não na operação. Default da flag é
// false (GHL/Pepper é o canal padrão de ingestão).
export default async function UploadCallPage() {
  const [enabled, ctx, locale] = await Promise.all([
    getManualUploadEnabledForActiveOrg(),
    getActiveOrgContext(),
    getLocale(),
  ])
  if (!enabled) redirect(`/${locale}/dashboard`)
  if (ctx?.role === 'owner') redirect(`/${locale}/dashboard`)
  return <UploadCallClient />
}
