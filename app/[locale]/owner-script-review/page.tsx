'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import {
  Sparkles,
  ArrowRight,
  Phone,
  FileText,
  ChartColumn,
  TrendingUp,
  Eye,
  X,
  Check,
  Loader2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'

interface PendingScriptInfo {
  orgScriptId: string
  startedAt: string
  sentByName: string | null
  incoming: {
    id: string
    name: string
    description: string | null
    version: string
  }
  previous: {
    id: string
    name: string
    description: string | null
    version: string
  } | null
}

const MOCK_CHANGES = [
  { type: 'modified', section: 'Opening', detail: 'description', value: 'Start by taking control of the conversation immediately...' },
  { type: 'added', section: 'Opening', detail: 'criterion', value: 'Early Commitment Secured' },
  { type: 'modified', section: 'Pain Discovery', detail: 'weight', value: '1.5' },
  { type: 'added', section: 'Pain Discovery', detail: 'criterion', value: 'Emotional Impact Explored' },
  { type: 'modified', section: 'Objection Handling', detail: 'description', value: 'Handle objections with Feel-Felt-Found...' },
]

interface Criterion {
  name: string
  description: string
  isNew?: boolean
}

interface SectionDiff {
  name: string
  weight: string
  criteriaCount: number
  modified: boolean
  previous: string
  next: string
  whyReasons: string[]
  criteria: Criterion[]
}

const SECTION_DIFFS: SectionDiff[] = [
  {
    name: 'Opening with Control & Purpose',
    weight: '1x',
    criteriaCount: 2,
    modified: true,
    previous: 'Start by taking control of the conversation. Introduce yourself and state the purpose of the call.',
    next: "Start by taking control of the conversation immediately. Introduce yourself confidently, state the purpose of the call, and get early buy-in: 'Before we dive in, I want to make sure we use this time wisely. If what I share today makes sense for your situation, are you open to scheduling a transformation session?'",
    whyReasons: [
      'Added early commitment question based on 89% correlation with closed deals',
      'Expanded description to include specific scripted language that top performers use',
    ],
    criteria: [
      { name: 'Professional Introduction', description: 'Did the trainer introduce themselves clearly with name and company?' },
      { name: 'Early Commitment Secured', description: 'Did they ask for buy-in before diving into discovery?', isNew: true },
    ],
  },
  {
    name: 'Decision-Maker Confirmation',
    weight: '1.2x',
    criteriaCount: 2,
    modified: false,
    previous: '',
    next: '',
    whyReasons: [],
    criteria: [
      { name: 'DM Identified', description: 'Was the decision maker identified and confirmed on the call?' },
      { name: 'Authority Confirmed', description: 'Did the trainer confirm the prospect has authority to make this decision?' },
    ],
  },
  {
    name: 'Pain Discovery & Emotional Investment',
    weight: '1.5x',
    criteriaCount: 3,
    modified: true,
    previous: 'Ask open-ended questions to understand the prospect\'s pain points with their dog.',
    next: "Ask deep open-ended questions to uncover the full emotional impact of the problem. Explore both practical and emotional consequences: 'How does this behavior affect your daily life? How does it make you feel when this happens?'",
    whyReasons: [
      'Weight increased from 1.0x to 1.5x — analysis shows 2.3x impact on close rate',
      'New Emotional Impact criterion added based on top performer behavior patterns',
    ],
    criteria: [
      { name: 'Pain Identified', description: 'Did the trainer uncover specific behavioral problems?' },
      { name: 'Emotional Impact Explored', description: 'Did they ask how the problem makes the prospect feel?', isNew: true },
      { name: 'Urgency Established', description: 'Was a sense of urgency or cost of inaction established?' },
    ],
  },
]

const SUPPORTING_CALLS = [
  { name: 'Mike Thompson', date: 'May 12, 2026', score: 94, note: 'Perfect execution of early commitment question' },
  { name: 'Sarah Davis', date: 'May 10, 2026', score: 91, note: 'Excellent emotional investment in discovery' },
  { name: 'Jake Wilson', date: 'May 8, 2026', score: 88, note: 'Strong Feel-Felt-Found objection handling' },
  { name: 'Emily Chen', date: 'May 7, 2026', score: 92, note: 'Deep pain discovery with follow-up questions' },
]

const KEY_IMPROVEMENTS = [
  {
    title: 'Early Commitment Question',
    description: 'Added commitment question in Opening section. Data shows 89% correlation with closed deals when used in the first 2 minutes.',
  },
  {
    title: 'Pain Discovery Weight Increase',
    description: 'Increased section weight from 1.0x to 1.5x. Analysis shows this section has 2.3x impact on close rate compared to average.',
  },
  {
    title: 'Emotional Impact Criterion',
    description: 'New criterion to track emotional investment. Top performers ask "how does that make you feel?" 94% of the time.',
  },
  {
    title: 'Feel-Felt-Found Framework',
    description: 'Standardized objection handling with proven framework used by 94% of top closers in analyzed calls.',
  },
]

export default function OwnerScriptReviewPage() {
  const locale = useLocale()
  const router = useRouter()
  const [pending, setPending] = useState<PendingScriptInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'accept' | 'reject' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'sections' | 'evidence'>('overview')
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['Opening with Control & Purpose', 'Pain Discovery & Emotional Investment']))

  const fetchPending = useCallback(async () => {
    try {
      const res = await fetch('/api/scripts/pending', { cache: 'no-store' })
      if (!res.ok) return
      const json = await res.json()
      setPending(json?.data?.pending ?? null)
    } catch {
      // silencioso
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchPending()
  }, [fetchPending])

  useEffect(() => {
    if (!toast) return
    const h = setTimeout(() => {
      setToast(null)
      router.push(`/${locale}/dashboard`)
    }, 2500)
    return () => clearTimeout(h)
  }, [toast, router, locale])

  const handleAccept = async () => {
    if (!pending || busy) return
    setBusy('accept')
    setError(null)
    try {
      const res = await fetch('/api/scripts/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgScriptId: pending.orgScriptId }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json?.error?.message ?? 'Something went wrong.')
        setBusy(null)
        return
      }
      setToast(`Script v${pending.incoming.version} activated successfully.`)
    } catch {
      setError('Something went wrong.')
      setBusy(null)
    }
  }

  const handleReject = async () => {
    if (!pending || busy) return
    setBusy('reject')
    setError(null)
    try {
      const res = await fetch('/api/scripts/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgScriptId: pending.orgScriptId }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json?.error?.message ?? 'Something went wrong.')
        setBusy(null)
        return
      }
      const restoredVersion =
        json?.data?.restoredScriptId && pending.previous ? pending.previous.version : null
      setToast(restoredVersion ? `Changes rejected. Restored to v${restoredVersion}.` : 'Changes rejected.')
    } catch {
      setError('Something went wrong.')
      setBusy(null)
    }
  }

  const formattedDate = pending
    ? new Date(pending.startedAt).toLocaleDateString(locale, {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : 'May 15, 2026'

  const currentVersion = pending?.previous?.version ?? '2.0'
  const proposedVersion = pending?.incoming?.version ?? '2.1'
  const orgName = 'Dog Wizard HQ'

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'var(--am-accent)' }} />
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-16" style={{ background: 'var(--am-bg)' }}>
      {/* Header */}
      <div
        className="sticky top-0 z-40 border-b"
        style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
      >
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold" style={{ color: 'var(--am-text)' }}>
                Script Update Review
              </h1>
              <span
                className="text-xs font-medium px-2 py-0.5 rounded-md border"
                style={{
                  background: 'rgba(255,171,46,0.15)',
                  borderColor: 'rgba(255,171,46,0.3)',
                  color: 'var(--am-amber)',
                }}
              >
                Pending Your Approval
              </span>
            </div>
            <p className="text-sm mt-0.5" style={{ color: 'var(--am-muted)' }}>
              {orgName}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleReject}
              disabled={!!busy}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors disabled:opacity-50 cursor-pointer"
              style={{
                borderColor: 'rgba(255,94,94,0.3)',
                color: 'var(--am-red)',
                background: 'transparent',
              }}
            >
              {busy === 'reject' ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <X size={14} />
              )}
              Reject Changes
            </button>
            <button
              type="button"
              onClick={handleAccept}
              disabled={!!busy}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer"
              style={{ background: '#22c55e', color: '#000' }}
            >
              {busy === 'accept' ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Check size={14} />
              )}
              Approve &amp; Activate
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {/* Error */}
        {error && (
          <div
            className="px-4 py-3 rounded-lg border text-sm"
            style={{
              background: 'rgba(255,94,94,0.08)',
              borderColor: 'var(--am-red)',
              color: 'var(--am-red)',
            }}
          >
            {error}
          </div>
        )}

        {/* AI-Recommended Script Update Banner */}
        <div
          className="rounded-xl border px-6 py-6"
          style={{
            background: 'linear-gradient(to right, rgba(255,171,46,0.08), transparent)',
            borderColor: 'rgba(255,171,46,0.2)',
          }}
        >
          <div className="flex items-start justify-between gap-6">
            <div className="space-y-4 flex-1">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles size={18} style={{ color: 'var(--am-amber)' }} />
                  <h2 className="text-base font-semibold" style={{ color: 'var(--am-text)' }}>
                    AI-Recommended Script Update
                  </h2>
                </div>
                <p className="text-sm" style={{ color: 'var(--am-muted)' }}>
                  Based on analysis of your team&apos;s{' '}
                  <strong style={{ color: 'var(--am-text)' }}>47 most successful calls</strong>
                  , our AI has identified patterns that correlate with higher close rates and generated optimized script recommendations.
                </p>
              </div>

              <div className="flex items-center gap-6 flex-wrap">
                <div>
                  <p className="text-xs" style={{ color: 'var(--am-muted)' }}>Current Version</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className="text-xs font-mono px-2 py-0.5 rounded border"
                      style={{ borderColor: 'var(--am-border)', color: 'var(--am-text)' }}
                    >
                      v{currentVersion}
                    </span>
                    <ArrowRight size={14} style={{ color: 'var(--am-muted)' }} />
                  </div>
                </div>
                <div>
                  <p className="text-xs" style={{ color: 'var(--am-muted)' }}>Proposed Version</p>
                  <div className="mt-1">
                    <span
                      className="text-xs font-mono px-2 py-0.5 rounded border"
                      style={{
                        background: 'rgba(255,171,46,0.15)',
                        borderColor: 'rgba(255,171,46,0.3)',
                        color: 'var(--am-amber)',
                      }}
                    >
                      v{proposedVersion}
                    </span>
                  </div>
                </div>
                <div className="w-px h-8 self-end mb-1" style={{ background: 'var(--am-border)' }} />
                <div>
                  <p className="text-xs" style={{ color: 'var(--am-muted)' }}>Proposed By</p>
                  <p className="text-sm mt-1" style={{ color: 'var(--am-text)' }}>
                    {pending?.sentByName ?? 'Sarah Chen (CS Manager)'}
                  </p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: 'var(--am-muted)' }}>Date</p>
                  <p className="text-sm mt-1" style={{ color: 'var(--am-text)' }}>{formattedDate}</p>
                </div>
              </div>
            </div>

            {/* Expected Impact */}
            <div
              className="rounded-lg border px-5 py-4 text-right shrink-0"
              style={{
                background: 'rgba(34,217,160,0.08)',
                borderColor: 'rgba(34,217,160,0.2)',
              }}
            >
              <p className="text-xs" style={{ color: 'var(--am-green)' }}>Expected Impact</p>
              <p className="text-3xl font-bold mt-1" style={{ color: 'var(--am-green)' }}>
                +12-15%
              </p>
              <p className="text-sm font-medium" style={{ color: 'var(--am-green)' }}>close rate</p>
              <p className="text-xs mt-1" style={{ color: 'rgba(34,217,160,0.6)' }}>close rate improvement</p>
            </div>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: <Phone size={18} style={{ color: '#60a5fa' }} />, bg: 'rgba(96,165,250,0.1)', value: '47', label: 'Calls Analyzed' },
            { icon: <FileText size={18} style={{ color: 'var(--am-amber)' }} />, bg: 'rgba(255,171,46,0.1)', value: '5', label: 'Changes Proposed' },
            { icon: <ChartColumn size={18} style={{ color: '#a78bfa' }} />, bg: 'rgba(167,139,250,0.1)', value: '5', label: 'Sections Updated' },
            { icon: <TrendingUp size={18} style={{ color: 'var(--am-green)' }} />, bg: 'rgba(34,217,160,0.1)', value: '2', label: 'New Criteria' },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-xl border px-4 py-4 flex items-center gap-3"
              style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
            >
              <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: card.bg }}>
                {card.icon}
              </div>
              <div>
                <p className="text-2xl font-semibold font-mono" style={{ color: 'var(--am-text)' }}>{card.value}</p>
                <p className="text-xs" style={{ color: 'var(--am-muted)' }}>{card.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div>
          <div
            className="inline-flex rounded-lg p-1 mb-4"
            style={{ background: 'var(--am-bg3)' }}
          >
            {(['overview', 'sections', 'evidence'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer"
                style={
                  activeTab === tab
                    ? { background: 'var(--am-bg2)', color: 'var(--am-text)' }
                    : { color: 'var(--am-muted)' }
                }
              >
                {tab === 'overview' ? 'Changes Overview' : tab === 'sections' ? 'Section Details' : 'Supporting Evidence'}
              </button>
            ))}
          </div>

          {activeTab === 'overview' && (
            <div className="grid md:grid-cols-2 gap-4">
              {/* Summary of Changes */}
              <div
                className="rounded-xl border p-5"
                style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
              >
                <h3 className="font-semibold text-base mb-0.5" style={{ color: 'var(--am-text)' }}>
                  Summary of Changes
                </h3>
                <p className="text-sm mb-4" style={{ color: 'var(--am-muted)' }}>
                  Review each modification before approving
                </p>
                <div className="space-y-2">
                  {MOCK_CHANGES.map((change, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 p-3 rounded-lg border"
                      style={{ background: 'var(--am-bg3)', borderColor: 'var(--am-border)' }}
                    >
                      <span
                        className="text-xs font-medium px-2 py-0.5 rounded border shrink-0"
                        style={
                          change.type === 'modified'
                            ? { background: 'rgba(255,171,46,0.15)', borderColor: 'transparent', color: 'var(--am-amber)' }
                            : { background: 'rgba(34,217,160,0.15)', borderColor: 'transparent', color: 'var(--am-green)' }
                        }
                      >
                        {change.type}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium" style={{ color: 'var(--am-text)' }}>{change.section}</p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--am-muted)' }}>
                          <span>{change.detail}</span>: <span>{change.value}</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        className="p-1.5 rounded-md cursor-pointer transition-opacity hover:opacity-70"
                        style={{ color: 'var(--am-muted)' }}
                      >
                        <Eye size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Key Improvements */}
              <div
                className="rounded-xl border p-5"
                style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
              >
                <h3 className="font-semibold text-base mb-4 flex items-center gap-2" style={{ color: 'var(--am-text)' }}>
                  <Sparkles size={14} style={{ color: 'var(--am-amber)' }} />
                  Key Improvements
                </h3>
                <div className="grid grid-cols-1 gap-3">
                  {KEY_IMPROVEMENTS.map((item, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-lg border"
                      style={{ background: 'rgba(34,217,160,0.04)', borderColor: 'rgba(34,217,160,0.2)' }}
                    >
                      <p className="font-medium text-sm mb-1" style={{ color: 'var(--am-green)' }}>{item.title}</p>
                      <p className="text-xs" style={{ color: 'var(--am-muted)' }}>{item.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'sections' && (
            <div className="space-y-3">
              {SECTION_DIFFS.map((section) => {
                const expanded = expandedSections.has(section.name)
                const toggle = () => {
                  setExpandedSections((prev) => {
                    const next = new Set(prev)
                    if (next.has(section.name)) next.delete(section.name)
                    else next.add(section.name)
                    return next
                  })
                }
                return (
                  <div
                    key={section.name}
                    className="rounded-xl border overflow-hidden"
                    style={{
                      borderColor: section.modified ? 'rgba(255,171,46,0.35)' : 'var(--am-border)',
                      background: 'var(--am-bg2)',
                    }}
                  >
                    {/* Accordion header */}
                    <button
                      type="button"
                      onClick={toggle}
                      className="w-full flex items-center gap-3 px-5 py-4 text-left cursor-pointer"
                    >
                      {expanded
                        ? <ChevronDown size={16} style={{ color: 'var(--am-muted)', flexShrink: 0 }} />
                        : <ChevronRight size={16} style={{ color: 'var(--am-muted)', flexShrink: 0 }} />
                      }
                      <div className="flex items-center gap-3 flex-1">
                        <span className="font-semibold text-sm" style={{ color: 'var(--am-text)' }}>
                          {section.name}
                        </span>
                        {section.modified && (
                          <span
                            className="text-xs font-medium px-2 py-0.5 rounded"
                            style={{ background: 'rgba(255,171,46,0.15)', color: 'var(--am-amber)' }}
                          >
                            Modified
                          </span>
                        )}
                      </div>
                      <span className="text-xs" style={{ color: 'var(--am-muted)' }}>
                        Weight: {section.weight} · {section.criteriaCount} criteria
                      </span>
                    </button>

                    {expanded && (
                      <div className="px-5 pb-5 space-y-4">
                        {/* Diff: previous vs new */}
                        {section.modified && (
                          <div className="grid md:grid-cols-2 gap-3">
                            <div
                              className="rounded-lg border p-4"
                              style={{ background: 'rgba(255,94,94,0.06)', borderColor: 'rgba(255,94,94,0.25)' }}
                            >
                              <p className="text-xs font-mono font-semibold mb-2" style={{ color: 'var(--am-red)' }}>
                                Previous (v{currentVersion})
                              </p>
                              <p
                                className="text-sm line-through leading-relaxed"
                                style={{ color: 'rgba(255,94,94,0.7)' }}
                              >
                                {section.previous}
                              </p>
                            </div>
                            <div
                              className="rounded-lg border p-4"
                              style={{ background: 'rgba(34,217,160,0.06)', borderColor: 'rgba(34,217,160,0.25)' }}
                            >
                              <p className="text-xs font-mono font-semibold mb-2" style={{ color: 'var(--am-green)' }}>
                                New (v{proposedVersion})
                              </p>
                              <p className="text-sm leading-relaxed" style={{ color: 'var(--am-text)' }}>
                                {section.next}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Why this change */}
                        {section.whyReasons.length > 0 && (
                          <div
                            className="rounded-lg border p-4"
                            style={{ background: 'rgba(255,171,46,0.05)', borderColor: 'rgba(255,171,46,0.2)' }}
                          >
                            <p className="text-sm font-medium mb-2 flex items-center gap-2" style={{ color: 'var(--am-amber)' }}>
                              <Sparkles size={13} />
                              Why this change?
                            </p>
                            {section.whyReasons.map((r, i) => (
                              <p key={i} className="text-xs mt-1" style={{ color: 'var(--am-green)' }}>
                                • {r}
                              </p>
                            ))}
                          </div>
                        )}

                        {/* Evaluation Criteria */}
                        <div>
                          <p className="text-xs font-medium mb-2" style={{ color: 'var(--am-muted)' }}>
                            Evaluation Criteria
                          </p>
                          <div className="space-y-2">
                            {section.criteria.map((c) => (
                              <div
                                key={c.name}
                                className="rounded-lg border px-4 py-3"
                                style={{
                                  background: c.isNew ? 'rgba(34,217,160,0.05)' : 'var(--am-bg3)',
                                  borderColor: c.isNew ? 'rgba(34,217,160,0.25)' : 'var(--am-border)',
                                }}
                              >
                                <div className="flex items-center gap-2 mb-0.5">
                                  <p className="text-sm font-semibold" style={{ color: 'var(--am-text)' }}>{c.name}</p>
                                  {c.isNew && (
                                    <span
                                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                                      style={{ background: 'rgba(34,217,160,0.2)', color: 'var(--am-green)' }}
                                    >
                                      New
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs" style={{ color: c.isNew ? 'rgba(34,217,160,0.8)' : 'var(--am-muted)' }}>
                                  {c.description}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {activeTab === 'evidence' && (
            <div
              className="rounded-xl border p-5"
              style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
            >
              <h3 className="font-semibold text-base mb-0.5" style={{ color: 'var(--am-text)' }}>
                Supporting Call Evidence
              </h3>
              <p className="text-sm mb-5" style={{ color: 'var(--am-muted)' }}>
                Sample calls that informed these recommendations
              </p>
              <div className="space-y-3">
                {SUPPORTING_CALLS.map((call) => (
                  <div
                    key={call.name}
                    className="flex items-center gap-4 py-3 border-b last:border-b-0"
                    style={{ borderColor: 'var(--am-border)' }}
                  >
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: 'rgba(34,217,160,0.1)' }}
                    >
                      <Phone size={16} style={{ color: 'var(--am-green)' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-semibold" style={{ color: 'var(--am-text)' }}>{call.name}</p>
                        <span
                          className="text-xs font-medium px-2 py-0.5 rounded"
                          style={{ background: 'rgba(34,217,160,0.15)', color: 'var(--am-green)' }}
                        >
                          Closed
                        </span>
                        <span className="text-xs" style={{ color: 'var(--am-muted)' }}>{call.date}</span>
                      </div>
                      <p className="text-xs" style={{ color: 'var(--am-muted)' }}>{call.note}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-2xl font-mono font-bold" style={{ color: 'var(--am-green)' }}>{call.score}</p>
                      <p className="text-xs" style={{ color: 'var(--am-muted)' }}>Score</p>
                    </div>
                    <button
                      type="button"
                      className="p-2 rounded-md cursor-pointer transition-opacity hover:opacity-70 shrink-0"
                      style={{ color: 'var(--am-muted)' }}
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-4 right-4 z-50 px-4 py-2.5 rounded-lg border shadow-lg flex items-center gap-2"
          style={{
            background: 'var(--am-bg2)',
            borderColor: 'var(--am-green)',
            color: 'var(--am-text)',
          }}
          role="status"
        >
          <Check size={14} style={{ color: 'var(--am-green)' }} />
          <span className="text-xs font-medium">{toast}</span>
        </div>
      )}
    </div>
  )
}
