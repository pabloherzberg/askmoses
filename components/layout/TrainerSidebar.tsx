'use client'

import { LayoutDashboard, Upload } from 'lucide-react'
import { NavItem, AppSidebar } from '@/components/layout/AppSidebar'
import type React from 'react'

const nav = [
  { label: 'My Dashboard', href: '/me', icon: LayoutDashboard },
  { label: 'Upload Call',  href: '/dashboard/upload', icon: Upload },
]

export function TrainerNavItems() {
  return (
    <nav className="flex flex-col gap-1">
      {nav.map((item) => <NavItem key={item.href} {...item} />)}
    </nav>
  )
}

export function TrainerSidebar() {
  return (
    <AppSidebar>
      <TrainerNavItems />
    </AppSidebar>
  )
}
