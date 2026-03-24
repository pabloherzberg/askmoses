import type React from 'react'
import { AdminSidebar } from '@/components/layout/AdminSidebar'
import { AppHeader } from '@/components/layout/AppHeader'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: 'var(--am-bg)' }}>
      <AppHeader />
      <div className="flex">
        <AdminSidebar />
        <main className="flex-1 lg:pl-56 pt-[61px]">
          <div className="max-w-[1200px] mx-auto px-8 py-7">{children}</div>
        </main>
      </div>
    </div>
  )
}
