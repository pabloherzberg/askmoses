import type React from 'react'
import { AppSidebar, TrainerNavItems } from '@/components/layout/AppSidebar'
import { AppHeader } from '@/components/layout/AppHeader'
import { FeatureGate } from '@/components/shared/FeatureGate'
import { getManualUploadEnabledForActiveOrg } from '@/lib/auth'

export default async function TrainerLayout({ children }: { children: React.ReactNode }) {
  const manualUploadEnabled = await getManualUploadEnabledForActiveOrg()
  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <AppHeader mobileSidebar={<TrainerNavItems manualUploadEnabled={manualUploadEnabled} />} />
      <div className="flex">
        <AppSidebar role="trainer" manualUploadEnabled={manualUploadEnabled} />
        <main className="flex-1 min-w-0 lg:pl-56 pt-[calc(61px+var(--impersonate-banner-h,0px))]">
          <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-6 md:py-7">
            <FeatureGate>{children}</FeatureGate>
          </div>
        </main>
      </div>
    </div>
  )
}
