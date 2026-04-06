import type React from 'react'
import { AppHeader } from '@/components/layout/AppHeader'
import { AppSidebar, OwnerNavItems, TrainerNavItems } from '@/components/layout/AppSidebar'
import { getRole } from '@/lib/auth'

export default async function CallsLayout({ children }: { children: React.ReactNode }) {
  const role = await getRole()
  const isTrainer = role === 'trainer'

  const navItems = isTrainer ? <TrainerNavItems /> : <OwnerNavItems />

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <AppHeader mobileSidebar={navItems} />
      <div className="flex">
        <AppSidebar role={role ?? 'owner'} />
        <main className="flex-1 lg:pl-56 pt-[61px]">
          <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-6 md:py-7">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
