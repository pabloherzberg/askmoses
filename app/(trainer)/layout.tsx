import type React from 'react'
import { TrainerSidebar, TrainerNavItems } from '@/components/layout/TrainerSidebar'
import { AppHeader } from '@/components/layout/AppHeader'

export default function TrainerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: 'var(--am-bg)' }}>
      <AppHeader mobileSidebar={<TrainerNavItems />} />
      <div className="flex">
        <TrainerSidebar />
        <main className="flex-1 min-w-0 lg:pl-56 pt-[61px] overflow-x-hidden">
          <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-6 md:py-7">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
