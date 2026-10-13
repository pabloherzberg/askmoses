'use client'

import { useEffect, useState, type KeyboardEvent } from 'react'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Mail, X } from 'lucide-react'
import {
  COACHING_COPY_EMAILS_MAX,
  isValidCoachingCopyEmail,
  normalizeCoachingCopyEmail,
} from '@/lib/coaching-copy-emails'

// Lista de cópias do email de coaching da org ativa (migration 126). A API
// valida e é quem decide; a checagem local só antecipa o erro para o usuário.
// Cada adição/remoção salva a lista inteira (PUT).

type ApiError = { message?: string; reason?: string; email?: string }

export function CoachingCopyEmailsCard() {
  const t = useTranslations('Invite.coachingCopies')
  const [emails, setEmails] = useState<string[]>([])
  const [max, setMax] = useState(COACHING_COPY_EMAILS_MAX)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const errorFor = (err: ApiError | null | undefined, fallback: string): string => {
    switch (err?.reason) {
      case 'INVALID_EMAIL':
        return t('errors.invalid')
      case 'DUPLICATE_EMAIL':
        return t('errors.duplicate', { email: err.email ?? '' })
      case 'LIMIT_REACHED':
        return t('errors.limit', { max })
      case 'MIGRATION_PENDING':
        return t('errors.unavailable')
      default:
        return fallback
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/organizations/coaching-copy-emails')
        const json = await res.json().catch(() => null)
        if (cancelled) return
        if (!res.ok || json?.error) {
          if (json?.error?.reason === 'MIGRATION_PENDING') setUnavailable(true)
          setError(errorFor(json?.error, t('errors.loadError')))
          return
        }
        setEmails(json.data.emails ?? [])
        if (typeof json.data.max === 'number') setMax(json.data.max)
      } catch {
        if (!cancelled) setError(t('errors.loadError'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function save(next: string[]): Promise<boolean> {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/organizations/coaching-copy-emails', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: next }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || json?.error) {
        if (json?.error?.reason === 'MIGRATION_PENDING') setUnavailable(true)
        setError(errorFor(json?.error, t('errors.saveError')))
        return false
      }
      setEmails(json.data.emails ?? next)
      return true
    } catch {
      setError(t('errors.saveError'))
      return false
    } finally {
      setSaving(false)
    }
  }

  async function handleAdd() {
    const email = normalizeCoachingCopyEmail(input)
    if (!email) return
    if (!isValidCoachingCopyEmail(email)) {
      setError(t('errors.invalid'))
      return
    }
    if (emails.includes(email)) {
      setError(t('errors.duplicate', { email }))
      return
    }
    if (emails.length >= max) {
      setError(t('errors.limit', { max }))
      return
    }
    if (await save([...emails, email])) setInput('')
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (!saving) void handleAdd()
    }
  }

  const disabled = loading || saving || unavailable

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          {t('title')}
        </CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="coaching-copy-email">{t('inputLabel')}</Label>
          <div className="flex gap-2 max-w-md">
            <Input
              id="coaching-copy-email"
              type="email"
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                if (error && !unavailable) setError(null)
              }}
              onKeyDown={handleKeyDown}
              placeholder={t('placeholder')}
              autoComplete="off"
              disabled={disabled}
              aria-invalid={Boolean(error) && !unavailable}
              aria-describedby={error ? 'coaching-copy-error' : undefined}
            />
            <Button type="button" onClick={() => void handleAdd()} disabled={disabled || !input.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t('add')}
            </Button>
          </div>
          {error && (
            <p id="coaching-copy-error" role="alert" className="text-sm" style={{ color: 'var(--am-red)' }}>
              {error}
            </p>
          )}
        </div>

        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : emails.length === 0 ? (
          !unavailable && <p className="text-sm text-muted-foreground">{t('empty')}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {emails.map((email) => (
              <span
                key={email}
                className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm"
                style={{ borderColor: 'var(--am-border2)', background: 'var(--am-bg3)' }}
              >
                {email}
                <button
                  type="button"
                  onClick={() => void save(emails.filter((e) => e !== email))}
                  disabled={saving}
                  className="ml-1 rounded p-0.5 hover:bg-muted transition-colors disabled:opacity-50"
                  aria-label={t('remove', { email })}
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </span>
            ))}
          </div>
        )}

        {!loading && !unavailable && (
          <p className="text-xs text-muted-foreground font-mono">
            {t('count', { count: emails.length, max })}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
