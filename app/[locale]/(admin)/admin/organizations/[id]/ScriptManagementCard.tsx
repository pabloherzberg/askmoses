'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { FileText, Loader2, RefreshCw, Send, X } from 'lucide-react'
import { SendScriptModal } from '../../SendScriptModal'
import { useToast } from '@/hooks/use-toast'

export interface ScriptSnapshot {
  name: string
  version: string
}

export interface PendingSnapshot {
  orgScriptId: string
  name: string
  version: string
  analysisStatus: 'processing' | 'queued' | 'ready' | 'error' | null
}

interface Props {
  orgId: string
  orgName: string
  activeScript: ScriptSnapshot | null
  pending: PendingSnapshot | null
}

export function ScriptManagementCard({ orgId, orgName, activeScript, pending }: Props) {
  const t = useTranslations('Admin.scriptManagement')
  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false)

  const handleSent = () => {
    setModalOpen(false)
    // Recarrega os dados server-side da página pra refletir o novo pending.
    router.refresh()
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
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-opacity hover:opacity-80"
            style={{ background: 'var(--am-accent)', color: 'var(--am-on-accent, white)' }}
          >
            <Send size={12} />
            {t('changeScript')}
          </button>
        </div>

        {/* Active script row */}
        <ScriptRow
          icon={<FileText size={14} />}
          label={t('activeLabel')}
          script={activeScript}
          emptyText={t('noActive')}
        />

        {/* Pending row (only if there is a pending) */}
        {pending && (
          <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--am-border)' }}>
            <PendingRow orgId={orgId} pending={pending} />
          </div>
        )}
      </div>

      <SendScriptModal
        open={modalOpen}
        orgIds={[orgId]}
        orgIdsOrdered={[orgId]}
        orgNames={{ [orgId]: orgName }}
        onClose={() => setModalOpen(false)}
        onSent={handleSent}
      />
    </>
  )
}

function ScriptRow({
  icon,
  label,
  script,
  emptyText,
}: {
  icon: React.ReactNode
  label: string
  script: ScriptSnapshot | null
  emptyText: string
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div
        className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
        style={{ background: 'var(--am-bg3)', color: 'var(--am-muted)' }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px]" style={{ color: 'var(--am-muted)' }}>
          {label}
        </p>
        {script ? (
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-sm truncate" style={{ color: 'var(--am-text)' }}>
              {script.name}
            </p>
            <span
              className="text-[10px] font-mono px-2 py-0.5 rounded-full uppercase tracking-wide whitespace-nowrap"
              style={{ background: 'var(--am-bg4)', color: 'var(--am-muted)' }}
            >
              v{script.version}
            </span>
          </div>
        ) : (
          <p className="text-sm mt-0.5" style={{ color: 'var(--am-muted)' }}>
            {emptyText}
          </p>
        )}
      </div>
    </div>
  )
}

function PendingRow({ orgId, pending }: { orgId: string; pending: PendingSnapshot }) {
  const t = useTranslations('Admin.scriptManagement')
  const router = useRouter()
  const { toast } = useToast()
  const [retrying, setRetrying] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  const isStuck = pending.analysisStatus === 'processing' || pending.analysisStatus === 'queued'

  const handleCancel = async () => {
    if (cancelling) return
    setCancelling(true)
    try {
      const res = await fetch('/api/admin/scripts/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgScriptId: pending.orgScriptId }),
      })
      const json = (await res.json()) as { error: { message: string } | null }
      if (!res.ok || json.error) throw new Error(json.error?.message ?? t('cancelError'))
      toast({ title: t('cancelSuccess') })
      router.refresh()
    } catch (err) {
      toast({
        title: t('cancelError'),
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setCancelling(false)
    }
  }

  const handleRetry = async () => {
    if (retrying) return
    setRetrying(true)
    try {
      const res = await fetch('/api/admin/scripts/retry-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId }),
      })
      const json = (await res.json()) as { error: { message: string } | null }
      if (!res.ok || json.error) {
        throw new Error(json.error?.message ?? t('retryError'))
      }
      toast({ title: t('retrySuccess') })
      router.refresh()
    } catch (err) {
      toast({
        title: t('retryError'),
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setRetrying(false)
    }
  }

  const statusBadge = (() => {
    switch (pending.analysisStatus) {
      case 'processing':
      case 'queued':
        return (
          <span
            className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wide whitespace-nowrap"
            style={{
              background: 'rgba(94,179,255,0.15)',
              color: 'var(--am-blue)',
            }}
          >
            <Loader2 size={9} className="animate-spin" />
            {t('statusAnalyzing')}
          </span>
        )
      case 'error':
        return (
          <span
            className="text-[10px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wide whitespace-nowrap"
            style={{ background: 'rgba(255,94,94,0.15)', color: 'var(--am-red)' }}
          >
            {t('statusError')}
          </span>
        )
      case 'ready':
        return (
          <span
            className="text-[10px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wide whitespace-nowrap"
            style={{ background: 'rgba(255,171,46,0.15)', color: 'var(--am-amber)' }}
          >
            {t('statusReady')}
          </span>
        )
      default:
        return (
          <span
            className="text-[10px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wide whitespace-nowrap"
            style={{ background: 'var(--am-bg4)', color: 'var(--am-muted)' }}
          >
            {t('statusNoAnalysis')}
          </span>
        )
    }
  })()

  return (
    <div className="flex items-center gap-3 py-1">
      <div
        className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
        style={{ background: 'var(--am-bg3)', color: 'var(--am-muted)' }}
      >
        <FileText size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px]" style={{ color: 'var(--am-muted)' }}>
          {t('pendingLabel')}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <p className="text-sm truncate" style={{ color: 'var(--am-text)' }}>
            {pending.name}
          </p>
          <span
            className="text-[10px] font-mono px-2 py-0.5 rounded-full uppercase tracking-wide whitespace-nowrap"
            style={{ background: 'var(--am-bg4)', color: 'var(--am-muted)' }}
          >
            v{pending.version}
          </span>
          {statusBadge}
          {isStuck && (
            <>
              <button
                type="button"
                onClick={handleRetry}
                disabled={retrying || cancelling}
                className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wide whitespace-nowrap transition-opacity hover:opacity-80 disabled:opacity-50"
                style={{ background: 'var(--am-bg3)', color: 'var(--am-text)', border: '1px solid var(--am-border)' }}
              >
                {retrying ? <Loader2 size={9} className="animate-spin" /> : <RefreshCw size={9} />}
                {t('retry')}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={cancelling || retrying}
                className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wide whitespace-nowrap transition-opacity hover:opacity-80 disabled:opacity-50"
                style={{ background: 'rgba(255,94,94,0.1)', color: 'var(--am-red)', border: '1px solid rgba(255,94,94,0.3)' }}
              >
                {cancelling ? <Loader2 size={9} className="animate-spin" /> : <X size={9} />}
                {t('cancel')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
