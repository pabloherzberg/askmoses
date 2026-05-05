'use client'

import { useTranslations } from 'next-intl'
import { Building2, Settings, UserPlus } from 'lucide-react'
import { NavItem, AppSidebar } from '@/components/layout/AppSidebar'

export function AdminNavItems() {
  const t = useTranslations('Shared.sidebar')
  const nav = [
    { label: t('saasPanel'),    href: '/admin',                     icon: Building2 },
    { label: t('rubricConfig'), href: '/admin/rubric',              icon: Settings  },
    { label: t('members'),      href: '/dashboard/settings/invite', icon: UserPlus  },
  ]
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
