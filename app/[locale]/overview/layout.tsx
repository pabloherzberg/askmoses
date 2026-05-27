import type React from 'react'
import { AppHeader } from '@/components/layout/AppHeader'
import { AppSidebar, NavItemsForRole } from '@/components/layout/AppSidebar'
import { FeatureGate } from '@/components/shared/FeatureGate'
import { getActiveOrgContext, getManualUploadEnabledForActiveOrg } from '@/lib/auth'

export default async function OverviewLayout({ children }: { children: React.ReactNode }) {
  const [ctx, manualUploadEnabled] = await Promise.all([
    getActiveOrgContext(),
    getManualUploadEnabledForActiveOrg(),
  ])
  const role = ctx?.role ?? null
  const isImpersonating = ctx?.isImpersonating ?? false

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <AppHeader mobileSidebar={<NavItemsForRole role={role} isImpersonating={isImpersonating} manualUploadEnabled={manualUploadEnabled} />} />
      <div className="flex">
        <AppSidebar role={role} isImpersonating={isImpersonating} manualUploadEnabled={manualUploadEnabled} />
        <main className="flex-1 min-w-0 lg:pl-56 pt-[calc(61px+var(--impersonate-banner-h,0px))]">
          <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-6 md:py-7">
            <FeatureGate>{children}</FeatureGate>
          </div>
        </main>
      </div>
    </div>
  )
}
