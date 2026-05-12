import type React from 'react'
import { AppHeader } from '@/components/layout/AppHeader'
import { AppSidebar, OwnerNavItems } from '@/components/layout/AppSidebar'
import { FeatureGate } from '@/components/shared/FeatureGate'

export default function OverviewLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <AppHeader mobileSidebar={<OwnerNavItems />} />
      <div className="flex">
        <AppSidebar role="owner" />
        <main className="flex-1 min-w-0 lg:pl-56 pt-[61px]">
          <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-6 md:py-7">
            <FeatureGate>{children}</FeatureGate>
          </div>
        </main>
      </div>
    </div>
  )
}
