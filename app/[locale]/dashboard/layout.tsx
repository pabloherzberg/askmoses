import type React from "react"
import { AppHeader } from "@/components/layout/AppHeader"
import { AppSidebar, TrainerNavItems, OwnerNavItems } from "@/components/layout/AppSidebar"
import { AdminNavItems } from "@/components/layout/AdminSidebar"
import { FeatureGate } from "@/components/shared/FeatureGate"
import { getRole } from "@/lib/auth"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const role = await getRole()

  // Admins acessam algumas rotas /dashboard/* (ex: /dashboard/settings/invite via "Members"),
  // mas mantêm a navegação do painel admin. Sem essa ramificação, caía no OwnerNavItems.
  const navItems =
    role === 'admin' ? <AdminNavItems />
    : role === 'trainer' ? <TrainerNavItems />
    : <OwnerNavItems />

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <AppHeader mobileSidebar={navItems} />
      <div className="flex">
        <AppSidebar role={role}>{navItems}</AppSidebar>
        <main className="flex-1 min-w-0 lg:pl-56 pt-[61px]">
          <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-6 md:py-7">
            <FeatureGate>{children}</FeatureGate>
          </div>
        </main>
      </div>
    </div>
  )
}
