'use client'

import { useTranslations } from 'next-intl'
import { Building2, PlusCircle, Settings, UserPlus, Upload, Wand2, HelpCircle } from 'lucide-react'
import { NavItem, AppSidebar } from '@/components/layout/AppSidebar'

export function AdminNavItems() {
  const t = useTranslations('Shared.sidebar')
  const nav = [
    { label: t('saasPanel'),          href: '/admin',                     icon: Building2  },
    { label: t('createOrganization'), href: '/admin/organizations/new',   icon: PlusCircle },
    { label: t('rubricConfig'),       href: '/admin/rubric',              icon: Settings   },
    { label: t('scriptBuilder'),      href: '/dashboard/script-builder',  icon: Wand2      },
    { label: t('uploadCall'),         href: '/dashboard/upload',          icon: Upload     },
    { label: t('members'),            href: '/dashboard/settings/invite', icon: UserPlus   },
    { label: t('howToUse'),           href: '/dashboard/guide',           icon: HelpCircle },
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
