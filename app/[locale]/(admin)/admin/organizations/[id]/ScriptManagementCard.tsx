'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { FileText, Loader2, Send } from 'lucide-react'
import { SendScriptModal } from '../../SendScriptModal'

export interface ScriptSnapshot {
  name: string
  version: string
}

export interface PendingSnapshot {
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
            <PendingRow pending={pending} />
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

function PendingRow({ pending }: { pending: PendingSnapshot }) {
  const t = useTranslations('Admin.scriptManagement')

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
      default:
        return (
          <span
            className="text-[10px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wide whitespace-nowrap"
            style={{ background: 'rgba(255,171,46,0.15)', color: 'var(--am-amber)' }}
          >
            {t('statusReady')}
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
        </div>
      </div>
    </div>
  )
}
