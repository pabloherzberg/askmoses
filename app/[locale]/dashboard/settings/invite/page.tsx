import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import type { Role } from '@/lib/types'
import { InvitePageClient } from './InvitePageClient'

export default async function InvitePage(
  { params }: { params: Promise<{ locale: string }> }
) {
  const { locale } = await params
  const session = await getSession()
  if (!session) redirect(`/${locale}/login`)

  const role = session.user.app_metadata?.role as Role | undefined
  if (role !== 'owner' && role !== 'admin') {
    redirect(`/${locale}/me`)
  }

  return <InvitePageClient role={role} />
}
