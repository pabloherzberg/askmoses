'use client'

import { useState } from 'react'
import { Bell, Mail, Check, AlertTriangle } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface ChannelPrefs {
  inApp: boolean
  email: boolean
}

interface Props {
  initialPrefs: ChannelPrefs
  email: string
}

type Phase = 'idle' | 'saving' | 'saved'

/** Toggle on/off no estilo dos design tokens --am-*. */
function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative inline-flex items-center rounded-full transition-colors flex-shrink-0 disabled:opacity-50"
      style={{
        width: 44,
        height: 24,
        background: checked ? 'var(--am-accent)' : 'var(--am-bg4)',
      }}
    >
      <span
        className="inline-block rounded-full bg-white transition-transform"
        style={{
          width: 18,
          height: 18,
          transform: checked ? 'translateX(23px)' : 'translateX(3px)',
        }}
      />
    </button>
  )
}

/**
 * Formulário de preferências de canal do trainer. Salva via
 * PUT /api/me/notification-prefs. O Owner ainda envia uma recomendação só —
 * o fan-out de entrega respeita os canais ativos escolhidos aqui.
 */
export function NotificationPrefsForm({ initialPrefs, email }: Props) {
  const t = useTranslations('Trainer.settings')

  const [saved, setSaved] = useState<ChannelPrefs>(initialPrefs)
  const [inApp, setInApp] = useState(initialPrefs.inApp)
  const [emailOn, setEmailOn] = useState(initialPrefs.email)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)

  const dirty = inApp !== saved.inApp || emailOn !== saved.email
  const allOff = !inApp && !emailOn

  const handleSave = async () => {
    if (phase === 'saving' || !dirty) return
    setPhase('saving')
    setError(null)
    try {
      const res = await fetch('/api/me/notification-prefs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inApp, email: emailOn }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || json?.error) {
        setError(json?.error?.message ?? t('error'))
        setPhase('idle')
        return
      }
      setSaved({ inApp, email: emailOn })
      setPhase('saved')
    } catch {
      setError(t('error'))
      setPhase('idle')
    }
  }

  const channels = [
    {
      key: 'inApp',
      icon: Bell,
      label: t('inAppLabel'),
      desc: t('inAppDesc'),
      checked: inApp,
      set: (v: boolean) => {
        setInApp(v)
        if (phase === 'saved') setPhase('idle')
      },
    },
    {
      key: 'email',
      icon: Mail,
      label: t('emailLabel'),
      desc: t('emailDesc', { email }),
      checked: emailOn,
      set: (v: boolean) => {
        setEmailOn(v)
        if (phase === 'saved') setPhase('idle')
      },
    },
  ]

  return (
    <div className="max-w-2xl">
      <div
        className="rounded-2xl p-5 border shadow-md"
        style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}
      >
        <p className="text-[13px] font-medium mb-1" style={{ color: 'var(--am-text)' }}>
          {t('channelsTitle')}
        </p>
        <p className="text-xs mb-4" style={{ color: 'var(--am-muted)' }}>
          {t('channelsSubtitle')}
        </p>

        <div className="flex flex-col">
          {channels.map((ch, i) => {
            const Icon = ch.icon
            return (
              <div
                key={ch.key}
                className="flex items-center gap-3 py-3.5"
                style={{
                  borderTop: i > 0 ? '1px solid var(--am-border)' : 'none',
                }}
              >
                <span
                  className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: 'var(--am-bg3)', color: 'var(--am-accent2)' }}
                >
                  <Icon size={17} />
                </span>
                <div className="flex-1 min-w-0">
                  <p
                    className="text-[13px] font-medium"
                    style={{ color: 'var(--am-text)' }}
                  >
                    {ch.label}
                  </p>
                  <p
                    className="text-[12px] leading-relaxed"
                    style={{ color: 'var(--am-muted)' }}
                  >
                    {ch.desc}
                  </p>
                </div>
                <Switch
                  checked={ch.checked}
                  onChange={ch.set}
                  disabled={phase === 'saving'}
                  label={ch.label}
                />
              </div>
            )
          })}
        </div>

        {allOff && (
          <div
            className="flex items-start gap-2 mt-3 px-3 py-2.5 rounded-lg text-[12px] leading-relaxed"
            style={{ background: 'var(--am-amber-bg, rgba(255,171,46,0.12))', color: 'var(--am-amber)' }}
          >
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
            <span>{t('allOffWarning')}</span>
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="text-xs mt-3 px-3 py-2 rounded-md border"
            style={{
              background: 'var(--am-red-bg)',
              borderColor: 'var(--am-red)',
              color: 'var(--am-red)',
            }}
          >
            {error}
          </p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 mt-4">
          {phase === 'saved' && !dirty && (
            <span
              className="inline-flex items-center gap-1.5 text-[12px] font-medium"
              style={{ color: 'var(--am-green)' }}
            >
              <Check size={14} />
              {t('saved')}
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={phase === 'saving' || !dirty}
            className="text-[13px] font-medium px-4 py-2 rounded-lg transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ background: 'var(--am-accent)', color: 'var(--am-on-accent)' }}
          >
            {phase === 'saving' ? t('saving') : t('save')}
          </button>
        </div>
      </div>
    </div>
  )
}
