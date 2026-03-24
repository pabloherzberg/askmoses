import type React from 'react'
import { TrainerSidebar } from '@/components/layout/TrainerSidebar'
import { AppHeader } from '@/components/layout/AppHeader'

export default function TrainerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: 'var(--am-bg)' }}>
      <AppHeader />
      <div className="flex">
        <TrainerSidebar />
        <main className="flex-1 lg:pl-56 pt-[61px]">
          <div className="max-w-[1200px] mx-auto px-8 py-7">{children}</div>
        </main>
      </div>
    </div>
  )
}
