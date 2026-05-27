import type React from 'react'
import { AppSidebar, NavItemsForRole } from '@/components/layout/AppSidebar'
import { AppHeader } from '@/components/layout/AppHeader'
import { getActiveOrgContext, getManualUploadEnabledForActiveOrg } from '@/lib/auth'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [ctx, manualUploadEnabled] = await Promise.all([
    getActiveOrgContext(),
    getManualUploadEnabledForActiveOrg(),
  ])
  const isImpersonating = ctx?.isImpersonating ?? false

  return (
    <div className="min-h-screen" style={{ background: 'var(--am-bg)' }}>
      <AppHeader mobileSidebar={<NavItemsForRole role="admin" isImpersonating={isImpersonating} manualUploadEnabled={manualUploadEnabled} />} />
      <div className="flex">
        <AppSidebar role="admin" isImpersonating={isImpersonating} manualUploadEnabled={manualUploadEnabled} />
        <main className="flex-1 min-w-0 lg:pl-56 pt-[calc(61px+var(--impersonate-banner-h,0px))]">
          <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-6 md:py-7">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
