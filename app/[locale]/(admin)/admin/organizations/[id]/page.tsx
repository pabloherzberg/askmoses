export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { OwnerManagementCard } from './OwnerManagementCard'

interface PageProps {
  params: Promise<{ id: string; locale: string }>
}

// Página de detalhe da org pro admin. Por enquanto só hospeda o card de
// gerenciamento de owner (trocar email + reenviar setup + recovery). Layout
// do grupo (admin) já garante role=admin via middleware.
export default async function OrganizationDetailPage({ params }: PageProps) {
  const { id: orgId } = await params
  const t = await getTranslations('Admin.ownerManagement')

  const admin = createAdminClient()

  const { data: org } = await admin
    .from('organizations')
    .select('id, name')
    .eq('id', orgId)
    .maybeSingle()

  if (!org) notFound()

  // Resolve owner via memberships → users. Pode haver mais de um owner por
  // org (multi-owner é raro mas válido); pegamos o mais antigo (criação).
  const { data: ownerMembership } = await admin
    .from('memberships')
    .select('user_id, invite_status, invited_at')
    .eq('org_id', orgId)
    .eq('role', 'owner')
    .order('invited_at', { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  let owner: { id: string; name: string | null; email: string; inviteStatus: 'pending' | 'accepted'; invitedAt: string | null } | null = null
  if (ownerMembership?.user_id) {
    const { data: userRow } = await admin
      .from('users')
      .select('id, name, email')
      .eq('id', ownerMembership.user_id as string)
      .maybeSingle()
    if (userRow) {
      owner = {
        id: userRow.id as string,
        name: (userRow.name as string | null) ?? null,
        email: userRow.email as string,
        inviteStatus: (ownerMembership.invite_status as 'pending' | 'accepted') ?? 'pending',
        invitedAt: (ownerMembership.invited_at as string | null) ?? null,
      }
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--am-muted)' }}>
          {t('eyebrow')}
        </p>
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--am-text)' }}>
          {org.name as string}
        </h1>
      </div>

      {owner ? (
        <OwnerManagementCard
          orgId={org.id as string}
          orgName={org.name as string}
          owner={owner}
        />
      ) : (
        <div
          className="rounded-2xl border p-6 text-sm"
          style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)', color: 'var(--am-muted)' }}
        >
          {t('noOwner')}
        </div>
      )}
    </div>
  )
}
