'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import {
  ArrowLeft,
  Sparkles,
  History,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  FileText,
  Scale,
  User,
  Clock,
} from 'lucide-react'
import type {
  ScriptReviewData,
  ReviewSection,
  SectionChangeType,
} from '@/lib/scripts/mock-improvement'

type Tab = 'editor' | 'diff' | 'preview'

interface Props {
  review: ScriptReviewData
}

// Estilos por tipo de mudança — usados em badges e bordas de section.
const changeStyles: Record<
  Exclude<SectionChangeType, 'unchanged'>,
  { bg: string; color: string; border: string }
> = {
  modified: {
    bg: 'var(--am-amber-bg)',
    color: 'var(--am-amber)',
    border: 'var(--am-amber)',
  },
  new: {
    bg: 'var(--am-green-bg)',
    color: 'var(--am-green)',
    border: 'var(--am-green)',
  },
}

export function ScriptReviewDetailClient({ review }: Props) {
  const t = useTranslations('Admin.scriptReview')
  const locale = useLocale()
  const [tab, setTab] = useState<Tab>('editor')
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    const criteria = review.sections.flatMap((s) =>
      s.criteria.map((c) => ({ name: c.name, description: c.description })),
    )
    const res = await fetch('/api/admin/scripts/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceScriptId: review.scriptId,
        name: review.scriptName,
        sections: review.sections.map((s) => ({
          name: s.name,
          instructions: s.instructions,
          tips: s.tips,
          weight: s.weight,
          critical: s.critical,
        })),
        criteria,
        full_script: review.fullScript,
      }),
    })
    const json = await res.json()
    if (!res.ok || json.error) {
      alert(json.error?.message ?? 'Failed to save script')
      return
    }
    setSaved(true)
  }

  return (
    <div>
      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-6">
        <div>
          <Link
            href={`/${locale}/admin`}
            className="inline-flex items-center gap-1.5 text-xs mb-2 hover:opacity-80 transition-opacity"
            style={{ color: 'var(--am-muted)' }}
          >
            <ArrowLeft size={13} />
            {t('back')}
          </Link>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1
              className="text-xl font-semibold tracking-tight"
              style={{ color: 'var(--am-text)' }}
            >
              {t('title')}
            </h1>
            <span
              className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full uppercase tracking-wide"
              style={{ background: 'var(--am-amber-bg)', color: 'var(--am-amber)' }}
            >
              {t('pendingReview')}
            </span>
          </div>
          <p className="text-sm mt-0.5" style={{ color: 'var(--am-muted)' }}>
            {review.scriptName}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium"
            style={{
              background: 'var(--am-bg3)',
              borderColor: 'var(--am-border)',
              color: 'var(--am-text)',
            }}
          >
            <History size={13} />
            {t('versionHistory')}
          </button>
          {/* Discard — volta pra listagem sem salvar. */}
          <Link
            href={`/${locale}/admin`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium"
            style={{
              background: 'transparent',
              borderColor: 'var(--am-border)',
              color: 'var(--am-muted)',
            }}
          >
            <X size={13} />
            {t('discard')}
          </Link>
          <button
            type="button"
            onClick={handleSave}
            disabled={saved}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium disabled:opacity-70"
            style={{
              background: saved ? 'var(--am-green)' : 'var(--am-accent)',
              color: 'var(--am-on-accent)',
            }}
          >
            <Check size={13} />
            {saved ? t('saved') : t('save')}
          </button>
        </div>
      </div>

      {/* ── Layout: sidebar + main ────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row gap-5">
        {/* Sidebar */}
        <aside className="lg:w-[280px] shrink-0 flex flex-col gap-4">
          <AiVersionCard review={review} />
          <ChangesSummaryCard review={review} />
          <MetadataCard review={review} />
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0">
          {/* Tabs */}
          <div
            className="inline-flex rounded-lg p-0.5 border mb-4"
            style={{ background: 'var(--am-bg3)', borderColor: 'var(--am-border)' }}
            role="tablist"
          >
            {(['editor', 'diff', 'preview'] as const).map((tk) => {
              const active = tab === tk
              return (
                <button
                  key={tk}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(tk)}
                  className="px-4 py-1.5 rounded-md text-xs font-medium transition-colors"
                  style={{
                    background: active ? 'var(--am-accent)' : 'transparent',
                    color: active ? 'var(--am-on-accent)' : 'var(--am-muted)',
                  }}
                >
                  {t(`tab_${tk}`)}
                </button>
              )
            })}
          </div>

          {tab === 'editor' && <EditorTab review={review} />}
          {tab === 'diff' && <DiffTab review={review} />}
          {tab === 'preview' && <PreviewTab review={review} />}
        </main>
      </div>
    </div>
  )
}

// ── Sidebar cards ──────────────────────────────────────────────────────────

function AiVersionCard({ review }: { review: ScriptReviewData }) {
  const t = useTranslations('Admin.scriptReview')
  return (
    <div
      className="rounded-2xl border p-4"
      style={{
        background: 'var(--am-bg2)',
        borderColor: 'var(--am-accent)',
        borderLeftWidth: 3,
      }}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <Sparkles size={13} style={{ color: 'var(--am-accent2)' }} />
        <span
          className="text-[11px] font-semibold uppercase tracking-wide"
          style={{ color: 'var(--am-accent2)' }}
        >
          {t('aiGeneratedTitle')}
        </span>
      </div>
      <p className="text-[11px] leading-relaxed mb-3" style={{ color: 'var(--am-muted)' }}>
        {t('aiGeneratedNote', { count: review.callsAnalyzed })}
      </p>
      <div className="flex flex-col gap-2">
        <SidebarStat label={t('baseScript')} value={`v${review.baseVersion}`} />
        <SidebarStat
          label={t('newVersion')}
          value={`v${review.newVersion}`}
          valueColor="var(--am-amber)"
        />
        <SidebarStat
          label={t('expectedImpact')}
          value={t('modificationsCount', { count: review.expectedImpact })}
        />
      </div>
    </div>
  )
}

function SidebarStat({
  label,
  value,
  valueColor,
}: {
  label: string
  value: string
  valueColor?: string
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px]" style={{ color: 'var(--am-muted)' }}>
        {label}
      </span>
      <span
        className="text-[12px] font-mono font-semibold"
        style={{ color: valueColor ?? 'var(--am-text)' }}
      >
        {value}
      </span>
    </div>
  )
}

function ChangesSummaryCard({ review }: { review: ScriptReviewData }) {
  const t = useTranslations('Admin.scriptReview')
  if (review.changesSummary.length === 0) return null
  return (
    <div
      className="rounded-2xl border p-4"
      style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
    >
      <p
        className="text-[11px] font-semibold uppercase tracking-wide mb-3"
        style={{ color: 'var(--am-muted)' }}
      >
        {t('changesSummary')}
      </p>
      <ul className="flex flex-col gap-2">
        {review.changesSummary.map((c, i) => {
          const style = c.type === 'new' ? changeStyles.new : changeStyles.modified
          return (
            <li key={i} className="flex items-center gap-2">
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: style.color }}
              />
              <span className="text-[12px] flex-1 truncate" style={{ color: 'var(--am-text)' }}>
                {c.section}
              </span>
              <span
                className="text-[9px] font-mono font-medium px-1.5 py-0.5 rounded uppercase tracking-wide"
                style={{ background: style.bg, color: style.color }}
              >
                {t(`change_${c.type}`)}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function MetadataCard({ review }: { review: ScriptReviewData }) {
  const t = useTranslations('Admin.scriptReview')
  const m = review.metadata
  return (
    <div
      className="rounded-2xl border p-4"
      style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
    >
      <p
        className="text-[11px] font-semibold uppercase tracking-wide mb-3"
        style={{ color: 'var(--am-muted)' }}
      >
        {t('metadata')}
      </p>
      <div className="flex flex-col gap-2.5">
        <MetaRow icon={<User size={12} />} text={m.author} />
        <MetaRow icon={<Clock size={12} />} text={m.date} />
        <MetaRow icon={<FileText size={12} />} text={t('sectionsCount', { count: m.sectionsCount })} />
        <MetaRow icon={<Scale size={12} />} text={t('criteriaCount', { count: m.criteriaCount })} />
      </div>
    </div>
  )
}

function MetaRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2">
      <span style={{ color: 'var(--am-muted)' }}>{icon}</span>
      <span className="text-[12px]" style={{ color: 'var(--am-text)' }}>
        {text}
      </span>
    </div>
  )
}

// ── Editor tab ─────────────────────────────────────────────────────────────

function EditorTab({ review }: { review: ScriptReviewData }) {
  return (
    <div className="flex flex-col gap-3">
      {review.sections.map((sec, i) => (
        <SectionCard key={i} section={sec} index={i} />
      ))}
    </div>
  )
}

function SectionCard({ section, index }: { section: ReviewSection; index: number }) {
  const t = useTranslations('Admin.scriptReview')
  // Sections com mudança começam expandidas — é o que o admin quer revisar.
  const [open, setOpen] = useState(section.changeType !== 'unchanged')
  const isChanged = section.changeType !== 'unchanged'
  const style = isChanged ? changeStyles[section.changeType as 'modified' | 'new'] : null

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{
        background: 'var(--am-bg2)',
        borderColor: 'var(--am-border)',
        borderLeftWidth: isChanged ? 3 : 1,
        borderLeftColor: isChanged ? style!.border : 'var(--am-border)',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left"
      >
        {open ? (
          <ChevronDown size={14} style={{ color: 'var(--am-muted)' }} />
        ) : (
          <ChevronRight size={14} style={{ color: 'var(--am-muted)' }} />
        )}
        <span
          className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded shrink-0"
          style={{ background: 'var(--am-bg4)', color: 'var(--am-muted)' }}
        >
          {index + 1}
        </span>
        <span className="text-[13px] font-semibold" style={{ color: 'var(--am-text)' }}>
          {section.name}
        </span>
        {isChanged && (
          <span
            className="text-[9px] font-mono font-medium px-2 py-0.5 rounded-full uppercase tracking-wide flex items-center gap-1"
            style={{ background: style!.bg, color: style!.color }}
          >
            {section.changeType === 'new' ? null : <Sparkles size={9} />}
            {t(`change_${section.changeType}`)}
          </span>
        )}
        <span
          className="ml-auto text-[11px] font-mono shrink-0"
          style={{ color: 'var(--am-muted)' }}
        >
          {t('criteriaWeight', { count: section.criteria.length, weight: section.weight })}
        </span>
      </button>

      {open && (
        <div
          className="px-4 pb-4 flex flex-col gap-4"
          style={{ borderTop: '1px solid var(--am-border)' }}
        >
          {/* Description */}
          <Field label={t('description')}>
            <p className="text-[12px] leading-relaxed" style={{ color: 'var(--am-text)' }}>
              {section.instructions}
            </p>
          </Field>

          {/* Reasoning — só pra changed */}
          {section.reasoning && (
            <div
              className="rounded-lg p-3 border"
              style={{
                background: 'var(--am-amber-bg)',
                borderColor: 'var(--am-amber)',
              }}
            >
              <p
                className="text-[10px] font-semibold uppercase tracking-wide mb-1"
                style={{ color: 'var(--am-amber)' }}
              >
                {t('reasoningForChanges')}
              </p>
              <p className="text-[12px] leading-relaxed" style={{ color: 'var(--am-text)' }}>
                {section.reasoning}
              </p>
            </div>
          )}

          {/* Tip */}
          {section.tips && (
            <Field label={t('tipForTrainer')}>
              <p className="text-[12px] italic" style={{ color: 'var(--am-muted)' }}>
                {section.tips}
              </p>
            </Field>
          )}

          {/* Weight */}
          <Field label={t('sectionWeight')}>
            <div className="flex items-center gap-3">
              <div
                className="flex-1 h-1.5 rounded-full overflow-hidden"
                style={{ background: 'var(--am-bg4)' }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(section.weight, 100)}%`,
                    background: 'var(--am-accent)',
                  }}
                />
              </div>
              <span
                className="text-[11px] font-mono font-semibold"
                style={{ color: 'var(--am-text)' }}
              >
                {section.weight}%
              </span>
            </div>
          </Field>

          {/* Criteria */}
          {section.criteria.length > 0 && (
            <Field label={t('evaluationCriteria')}>
              <div className="flex flex-col gap-2">
                {section.criteria.map((c, ci) => (
                  <div
                    key={ci}
                    className="rounded-lg border px-3 py-2"
                    style={{ background: 'var(--am-bg3)', borderColor: 'var(--am-border)' }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[12px] font-medium"
                        style={{ color: 'var(--am-text)' }}
                      >
                        {c.name}
                      </span>
                      {c.isNew && (
                        <span
                          className="text-[9px] font-mono font-medium px-1.5 py-0.5 rounded uppercase tracking-wide"
                          style={{
                            background: changeStyles.new.bg,
                            color: changeStyles.new.color,
                          }}
                        >
                          {t('change_new')}
                        </span>
                      )}
                    </div>
                    {c.description && (
                      <p className="text-[11px] mt-0.5" style={{ color: 'var(--am-muted)' }}>
                        {c.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </Field>
          )}
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 pt-3">
      <span
        className="text-[10px] font-semibold uppercase tracking-wide"
        style={{ color: 'var(--am-muted)' }}
      >
        {label}
      </span>
      {children}
    </div>
  )
}

// ── Diff tab ───────────────────────────────────────────────────────────────

function DiffTab({ review }: { review: ScriptReviewData }) {
  const t = useTranslations('Admin.scriptReview')
  const changed = review.sections.filter((s) => s.changeType !== 'unchanged')

  if (changed.length === 0) {
    return (
      <p className="text-sm py-8 text-center" style={{ color: 'var(--am-muted)' }}>
        {t('noChanges')}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {changed.map((sec, i) => (
        <div
          key={i}
          className="rounded-xl border overflow-hidden"
          style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
        >
          <div
            className="px-4 py-2.5 text-[13px] font-semibold"
            style={{ background: 'var(--am-bg3)', color: 'var(--am-text)' }}
          >
            {sec.name}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2">
            {/* Current */}
            <div
              className="p-4"
              style={{ borderRight: '1px solid var(--am-border)' }}
            >
              <p
                className="text-[10px] font-mono uppercase tracking-wide mb-2"
                style={{ color: 'var(--am-muted)' }}
              >
                {t('current')}
              </p>
              <p
                className="text-[12px] leading-relaxed"
                style={{ color: 'var(--am-muted)' }}
              >
                {sec.previous?.instructions ?? '—'}
              </p>
            </div>
            {/* Proposed */}
            <div className="p-4">
              <p
                className="text-[10px] font-mono uppercase tracking-wide mb-2"
                style={{ color: 'var(--am-accent2)' }}
              >
                {t('proposed')}
              </p>
              <p
                className="text-[12px] leading-relaxed"
                style={{ color: 'var(--am-text)' }}
              >
                {sec.instructions}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Preview tab ────────────────────────────────────────────────────────────

function PreviewTab({ review }: { review: ScriptReviewData }) {
  return (
    <div
      className="rounded-xl border p-6 flex flex-col gap-5"
      style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
    >
      {review.sections.map((sec, i) => (
        <div key={i}>
          <h3
            className="text-[13px] font-semibold mb-1"
            style={{ color: 'var(--am-text)' }}
          >
            {i + 1}. {sec.name}
          </h3>
          <p
            className="text-[12px] leading-relaxed"
            style={{ color: 'var(--am-muted)' }}
          >
            {sec.instructions}
          </p>
          {sec.tips && (
            <p className="text-[11px] italic mt-1" style={{ color: 'var(--am-muted)' }}>
              {sec.tips}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
