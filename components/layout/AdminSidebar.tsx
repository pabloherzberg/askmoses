'use client'

import { Building2, Settings } from 'lucide-react'
import { NavItem, AppSidebar } from '@/components/layout/AppSidebar'

const nav = [
  { label: 'SaaS Panel',    href: '/admin',        icon: Building2 },
  { label: 'Rubric Config', href: '/admin/rubric',  icon: Settings  },
]

export function AdminNavItems() {
  return (
    <nav className="flex flex-col gap-1">
      {nav.map((item) => <NavItem key={item.href} {...item} />)}
    </nav>
  )
}

export function AdminSidebar() {
  return (
    <AppSidebar>
      <AdminNavItems />
    </AppSidebar>
  )
}
