import type React from "react"
import { AppHeader } from "@/components/layout/AppHeader"
import { OwnerSidebar, OwnerNavItems } from "@/components/layout/OwnerSidebar"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <AppHeader mobileSidebar={<OwnerNavItems />} />
      <div className="flex">
        <OwnerSidebar />
        <main className="flex-1 lg:pl-56 pt-[61px]">
          <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-6 md:py-7">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
