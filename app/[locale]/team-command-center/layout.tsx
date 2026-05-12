import type React from 'react'
import { AppHeader } from '@/components/layout/AppHeader'
import { AppSidebar, NavItemsForRole } from '@/components/layout/AppSidebar'
import { FeatureGate } from '@/components/shared/FeatureGate'
import { getRole } from '@/lib/auth'

export default async function TeamCommandCenterLayout({ children }: { children: React.ReactNode }) {
  const role = await getRole()

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <AppHeader mobileSidebar={<NavItemsForRole role={role} />} />
      <div className="flex">
        <AppSidebar role={role} />
        <main className="flex-1 lg:pl-56 pt-[61px]">
          <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-6 md:py-7">
            <FeatureGate>{children}</FeatureGate>
          </div>
        </main>
      </div>
    </div>
  )
}
