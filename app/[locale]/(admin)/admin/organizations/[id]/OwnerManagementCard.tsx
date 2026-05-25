'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Mail, KeyRound, RefreshCw, X, Check } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/use-toast'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface Owner {
  id: string
  name: string | null
  email: string
  inviteStatus: 'pending' | 'accepted'
  invitedAt: string | null
}

interface Props {
  orgId: string
  orgName: string
  owner: Owner
}

export function OwnerManagementCard({ orgId, owner: initialOwner }: Props) {
  const t = useTranslations('Admin.ownerManagement')
  const locale = useLocale()
  const { toast } = useToast()

  const [owner, setOwner] = useState<Owner>(initialOwner)
  const [editingEmail, setEditingEmail] = useState(false)
  const [draftEmail, setDraftEmail] = useState(owner.email)
  const [submitting, setSubmitting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const handleStartEdit = () => {
    setDraftEmail(owner.email)
    setEditingEmail(true)
  }

  const handleCancelEdit = () => {
    setEditingEmail(false)
    setDraftEmail(owner.email)
  }

  const handleSaveClick = () => {
    const trimmed = draftEmail.trim().toLowerCase()
    if (!EMAIL_RE.test(trimmed)) {
      toast({
        title: t('emailInvalidTitle'),
        description: t('emailInvalidBody'),
        variant: 'destructive',
      })
      return
    }
    if (trimmed === owner.email.toLowerCase()) {
      setEditingEmail(false)
      return
    }
    setConfirmOpen(true)
  }

  const handleConfirmSave = async () => {
    setConfirmOpen(false)
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/organizations/${orgId}/owner`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: draftEmail.trim().toLowerCase(), locale }),
      })
      const json = (await res.json()) as {
        data: { email?: string; emailDelivery?: 'sent' | 'mocked' } | null
        error: { message: string } | null
      }
      if (!res.ok || json.error) {
        throw new Error(json.error?.message ?? 'Erro')
      }
      const updatedEmail = json.data?.email ?? draftEmail.trim().toLowerCase()
      setOwner({ ...owner, email: updatedEmail, inviteStatus: 'pending' })
      setEditingEmail(false)
      toast({
        title: t('emailChangedTitle'),
        description:
          json.data?.emailDelivery === 'mocked'
            ? t('emailChangedMockedBody', { email: updatedEmail })
            : t('emailChangedSentBody', { email: updatedEmail }),
      })
    } catch (err) {
      toast({
        title: t('errorTitle'),
        description: err instanceof Error ? err.message : t('errorBody'),
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleResendInvite = async () => {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/invites/${owner.id}/resend?orgId=${orgId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale }),
      })
      const json = (await res.json()) as {
        data: { emailDelivery?: 'sent' | 'mocked' } | null
        error: { message: string } | null
      }
      if (!res.ok || json.error) {
        throw new Error(json.error?.message ?? 'Erro')
      }
      toast({
        title: t('resendSentTitle'),
        description:
          json.data?.emailDelivery === 'mocked'
            ? t('resendMockedBody', { email: owner.email })
            : t('resendSentBody', { email: owner.email }),
      })
    } catch (err) {
      toast({
        title: t('errorTitle'),
        description: err instanceof Error ? err.message : t('errorBody'),
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleSendRecovery = async () => {
    setSubmitting(true)
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: owner.email, locale }),
      })
      toast({
        title: t('recoverySentTitle'),
        description: t('recoverySentBody', { email: owner.email }),
      })
    } catch (err) {
      toast({
        title: t('errorTitle'),
        description: err instanceof Error ? err.message : t('errorBody'),
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div
        className="rounded-2xl border p-6 mb-4"
        style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
      >
        <div className="flex items-start justify-between mb-4 gap-3">
          <div>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--am-text)' }}>
              {t('title')}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--am-muted)' }}>
              {t('subtitle')}
            </p>
          </div>
          {owner.inviteStatus === 'pending' && (
            <span
              className="text-[10px] font-medium px-2 py-0.5 rounded-full font-mono uppercase tracking-wide whitespace-nowrap"
              style={{
                background: 'var(--am-amber-bg, rgba(255,179,71,0.18))',
                color: 'var(--am-amber, #d97706)',
              }}
            >
              {t('pendingBadge')}
            </span>
          )}
        </div>

        {/* Email row */}
        <div className="flex items-center gap-3 py-2">
          <div
            className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
            style={{
              background: 'var(--am-bg3)',
              color: 'var(--am-muted)',
            }}
          >
            <Mail size={14} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px]" style={{ color: 'var(--am-muted)' }}>
              {t('emailLabel')}
            </p>
            {editingEmail ? (
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="email"
                  value={draftEmail}
                  onChange={(e) => setDraftEmail(e.target.value)}
                  disabled={submitting}
                  className="flex-1 px-2 py-1 rounded text-sm outline-none"
                  style={{
                    background: 'var(--am-bg3)',
                    border: '1px solid var(--am-border2)',
                    color: 'var(--am-text)',
                  }}
                  aria-label={t('emailLabel')}
                />
                <button
                  type="button"
                  onClick={handleSaveClick}
                  disabled={submitting}
                  aria-label={t('saveAria')}
                  title={t('saveAria')}
                  className="inline-flex items-center justify-center w-7 h-7 rounded-md transition-opacity hover:opacity-80 disabled:opacity-50"
                  style={{ background: 'var(--am-accent)', color: 'white' }}
                >
                  <Check size={14} />
                </button>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={submitting}
                  aria-label={t('cancelAria')}
                  title={t('cancelAria')}
                  className="inline-flex items-center justify-center w-7 h-7 rounded-md transition-opacity hover:opacity-80 disabled:opacity-50"
                  style={{ background: 'var(--am-bg3)', color: 'var(--am-muted)' }}
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <p className="text-sm truncate" style={{ color: 'var(--am-text)' }}>
                  {owner.email}
                </p>
                <button
                  type="button"
                  onClick={handleStartEdit}
                  disabled={submitting}
                  className="text-xs underline opacity-80 hover:opacity-100 disabled:opacity-50"
                  style={{ color: 'var(--am-accent2)' }}
                >
                  {t('edit')}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div
          className="mt-4 pt-4 border-t flex flex-wrap gap-2"
          style={{ borderColor: 'var(--am-border)' }}
        >
          {owner.inviteStatus === 'pending' && (
            <button
              type="button"
              onClick={handleResendInvite}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ background: 'var(--am-bg3)', color: 'var(--am-text)', border: '1px solid var(--am-border)' }}
            >
              <RefreshCw size={12} />
              {t('resendInvite')}
            </button>
          )}
          <button
            type="button"
            onClick={handleSendRecovery}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ background: 'var(--am-bg3)', color: 'var(--am-text)', border: '1px solid var(--am-border)' }}
          >
            <KeyRound size={12} />
            {t('sendRecovery')}
          </button>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('confirmBody', { oldEmail: owner.email, newEmail: draftEmail.trim().toLowerCase() })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('confirmCancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmSave}>{t('confirmAction')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
