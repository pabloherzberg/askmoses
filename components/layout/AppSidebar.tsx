'use client'

import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Phone, Upload,
  HelpCircle, Home, GraduationCap, UserPlus
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type React from 'react'
import type { Role } from '@/lib/types'

// Parent routes that should only match on exact path equality — otherwise they
// would also match every nested child (e.g. /me would also highlight on /me/calls).
const EXACT_ONLY = new Set([
  '/dashboard',
  '/team-command-center',
  '/me',
  '/admin',
  // /dashboard/settings é a página da Rubric; não pode "ativar" em /dashboard/settings/invite (Members)
  '/dashboard/settings',
])

export function NavItem({ label, href, icon: Icon }: { label: string; href: string; icon: React.ElementType }) {
  const pathname = usePathname()
  const locale = useLocale()
  const localizedHref = `/${locale}${href}`
  // Strip locale prefix when comparing against pathname so "active" still works
  const bareHref = href
  const barePath = pathname.replace(`/${locale}`, '') || '/'
  const active =
    barePath === bareHref ||
    (!EXACT_ONLY.has(bareHref) && barePath.startsWith(`${bareHref}/`))

  return (
    <Link
      href={localizedHref}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
        active ? 'text-white' : 'hover:opacity-80'
      )}
      style={
        active
          ? { background: 'var(--sidebar-primary)', color: 'white' }
          : { color: 'var(--am-muted)' }
      }
    >
      <Icon size={16} />
      {label}
    </Link>
  )
}

export function TrainerNavItems() {
  const t = useTranslations('Shared.sidebar')
  const trainerNav = [
    { label: t('myDashboard'), href: '/me', icon: LayoutDashboard },
    { label: t('myCalls'), href: '/me/calls', icon: Phone },
    { label: t('uploadCall'), href: '/dashboard/upload', icon: Upload },
  ]
  return (
    <nav className="flex flex-col gap-1">
      {trainerNav.map((item) => <NavItem key={item.href} {...item} />)}
    </nav>
  )
}

export function OwnerNavItems() {
  const t = useTranslations('Shared.sidebar')
  const mainNav = [
    { label: t('dashboard'), href: '/dashboard', icon: Home },
    { label: t('teamCommandCenter'), href: '/team-command-center', icon: GraduationCap },
    { label: t('calls'), href: '/calls', icon: Phone },
  ]
  const toolsNav = [
    { label: t('uploadCall'), href: '/dashboard/upload', icon: Upload },
    { label: t('members'), href: '/dashboard/settings/invite', icon: UserPlus },
    { label: t('howToUse'), href: '/dashboard/guide', icon: HelpCircle },
  ]
  return (
    <nav className="flex flex-col gap-1">
      {mainNav.map((item) => <NavItem key={item.href} {...item} />)}

      <div className="my-2 mx-3 h-px" style={{ background: 'var(--am-border)' }} />

      <p className="px-3 mb-1 text-[10px] font-medium uppercase tracking-widest" style={{ color: 'var(--am-muted)' }}>
        {t('tools')}
      </p>

      {toolsNav.map((item) => <NavItem key={item.href} {...item} />)}
    </nav>
  )
}

export function AppSidebar({ role, children }: { role?: Role | null; children?: React.ReactNode }) {
  const t = useTranslations('Shared.sidebar')
  const nav = children ?? (role === 'trainer' ? <TrainerNavItems /> : <OwnerNavItems />)

  return (
    <aside
      className="fixed left-0 top-[61px] bottom-0 w-56 hidden lg:flex flex-col border-r pt-6 px-3"
      style={{ background: 'var(--sidebar)', borderColor: 'var(--am-border)' }}
    >
      {nav}
      <div className="mt-auto pb-4 px-3">
        <div className="rounded-md border border-border bg-secondary/50 p-3">
          <p className="text-xs text-muted-foreground">{t('starterTier')}</p>
          <p className="text-sm font-medium">{t('starterTierSubtitle')}</p>
        </div>
      </div>
    </aside>
  )
}
