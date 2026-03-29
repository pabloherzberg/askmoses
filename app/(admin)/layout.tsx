import type React from 'react'
import { AdminSidebar, AdminNavItems } from '@/components/layout/AdminSidebar'
import { AppHeader } from '@/components/layout/AppHeader'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: 'var(--am-bg)' }}>
      <AppHeader mobileSidebar={<AdminNavItems />} />
      <div className="flex">
        <AdminSidebar />
        <main className="flex-1 lg:pl-56 pt-[61px]">
          <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-6 md:py-7">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
