'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { KeyRound, LogOut } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { createClient } from '@/lib/supabase/client'

interface MeResponse {
  data: { id: string; name?: string | null; email?: string | null } | null
}

// Avatar no canto direito do header. Click abre dropdown com:
//   - Nome + email (header do menu)
//   - "Conta" → /account (definir/trocar senha)
//   - "Sair" → signOut + redirect /login
// Iniciais do nome geram o avatar circular (fallback "??" se nome ausente).
export function UserAvatarMenu() {
  const t = useTranslations('Shared.userMenu')
  const locale = useLocale()

  const [name, setName] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    // /api/me devolve perfil mínimo; deixa avatar com placeholder até resolver.
    fetch('/api/me')
      .then((r) => r.json())
      .then((json: MeResponse) => {
        setName(json.data?.name ?? null)
        setEmail(json.data?.email ?? null)
      })
      .catch(() => {})
  }, [])

  const initials = (() => {
    if (!name) return '??'
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return '??'
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  })()

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = `/${locale}/login`
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('triggerAria')}
          title={t('triggerAria')}
          className="flex items-center justify-center rounded-full text-[12px] font-semibold transition-opacity hover:opacity-80"
          style={{
            width: '34px',
            height: '34px',
            background: 'var(--am-accent2-bg, rgba(155,135,255,0.18))',
            color: 'var(--am-accent2, #9b87ff)',
            border: '1px solid var(--am-border2)',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          {initials}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] font-medium" style={{ color: 'var(--am-text)' }}>
              {name ?? t('loading')}
            </span>
            {email && (
              <span className="text-[11px] truncate" style={{ color: 'var(--am-muted)' }}>
                {email}
              </span>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={`/${locale}/password`} className="flex items-center gap-2">
            <KeyRound size={14} />
            <span>{t('password')}</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} className="flex items-center gap-2">
          <LogOut size={14} />
          <span>{t('signOut')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
