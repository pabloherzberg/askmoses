'use client'

import { useState, useEffect } from 'react'
import { Copy, Check, Play, RefreshCw, Phone, Info } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import type { MarketingIntelligence as MarketingIntelligenceData, MarketingCopySuggestion, ConfidenceLevel } from '@/lib/types'

const CONFIDENCE_STYLES: Record<ConfidenceLevel, { color: string; bg: string }> = {
  high:   { color: 'var(--am-green)', bg: 'var(--am-green-bg)' },
  medium: { color: 'var(--am-amber)', bg: 'var(--am-amber-bg)' },
  low:    { color: 'var(--am-red)',   bg: 'var(--am-red-bg)'   },
}

function ConfidenceBadge({ level, value }: { level: ConfidenceLevel; value: number }) {
  const { color, bg } = CONFIDENCE_STYLES[level]
  const label = level === 'high' ? 'HIGH' : level === 'medium' ? 'MEDIUM' : 'LOW'

  return (
    <span
      className="text-[10px] font-mono font-medium px-2 py-0.5 rounded"
      style={{ color, background: bg }}
    >
      {value}% · {label} CONFIDENCE
    </span>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const { toast } = useToast()

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast({ title: 'Copied to clipboard', duration: 2000 })
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast({ title: 'Failed to copy', variant: 'destructive', duration: 2000 })
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded border transition-colors"
      style={{
        color: copied ? 'var(--am-green)' : 'var(--am-muted)',
        borderColor: copied ? 'rgba(34,217,160,0.4)' : 'var(--am-border)',
        background: copied ? 'rgba(34,217,160,0.06)' : 'transparent',
      }}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Copied' : 'COPY'}
    </button>
  )
}

function SuggestionCard({ item }: { item: MarketingCopySuggestion }) {
  const barWidth = `${item.confidence}%`
  const barColor = CONFIDENCE_STYLES[item.confidenceLevel].color

  return (
    <div
      className="rounded-xl p-4 border"
      style={{ background: 'var(--am-bg3)', borderColor: 'var(--am-border)' }}
    >
      <div className="mb-1">
        <ConfidenceBadge level={item.confidenceLevel} value={item.confidence} />
      </div>
      <p className="text-[14px] font-semibold leading-snug mt-2 mb-3" style={{ color: 'var(--am-text)' }}>
        {item.text}
      </p>
      <div className="mb-2">
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--am-bg4)' }}>
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: barWidth, background: barColor }}
          />
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px]" style={{ color: 'var(--am-muted)' }}>
          {item.basis}
        </span>
        <CopyButton text={item.text} />
      </div>
    </div>
  )
}

export function MarketingIntelligence() {
  const [data, setData] = useState<MarketingIntelligenceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [running, setRunning] = useState(false)
  const { toast } = useToast()

  const loadData = async () => {
    setLoading(true)
    setErrorMessage(null)
    try {
      const res = await fetch('/api/marketing-intelligence')
      const json = await res.json()
      if (json.data) {
        setData(json.data)
      } else {
        setErrorMessage(json.error?.message ?? 'Failed to load Marketing Intelligence')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    fetch('/api/me')
      .then((r) => r.json())
      .then(({ data }) => {
        if (data?.role === 'admin') setIsSuperAdmin(true)
      })
      .catch(() => {})
  }, [])

  const handleRunNow = async () => {
    if (running) return
    setRunning(true)
    try {
      const res = await fetch('/api/marketing-intelligence/run', { method: 'POST' })
      const json = await res.json()
      if (!res.ok || !json.data) {
        toast({
          title: 'Run failed',
          description: json.error?.message ?? 'Could not generate fresh copy.',
          variant: 'destructive',
          duration: 4000,
        })
        return
      }
      setData(json.data)
      setErrorMessage(null)
      toast({
        title: 'New analysis ready',
        description: 'Headlines and primary texts refreshed.',
        duration: 3000,
      })
    } finally {
      setRunning(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-32 rounded-2xl animate-pulse"
            style={{ background: 'var(--am-bg3)' }}
          />
        ))}
      </div>
    )
  }

  if (errorMessage) {
    return (
      <div
        className="rounded-2xl p-6 border text-center"
        style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}
      >
        <Info size={20} className="inline mb-2" style={{ color: 'var(--am-muted)' }} />
        <p className="text-sm" style={{ color: 'var(--am-text)' }}>{errorMessage}</p>
      </div>
    )
  }

  if (!data) return null

  return (
    <div>
      {/* ── Info bar ─────────────────────────────────────────── */}
      <div
        className="flex flex-col gap-2 mb-5 px-4 py-2.5 rounded-xl border text-[12px]"
        style={{ background: 'var(--am-bg3)', borderColor: 'var(--am-border)' }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: 'var(--am-green)' }} />
            <span style={{ color: 'var(--am-muted)' }}>Last run:</span>
            <span className="font-medium" style={{ color: 'var(--am-text)' }}>{data.lastRun}</span>
          </span>
          <span style={{ color: 'var(--am-border)' }}>·</span>
          <span style={{ color: 'var(--am-muted)' }}>
            Based on <span className="font-medium" style={{ color: 'var(--am-text)' }}>{data.sampleSize} closed calls</span>
          </span>
          <span style={{ color: 'var(--am-border)' }}>·</span>
          <span style={{ color: 'var(--am-muted)' }}>
            Next run: <span className="font-medium" style={{ color: 'var(--am-text)' }}>{data.nextRun}</span>
          </span>
        </div>
        <p className="flex items-center gap-1.5 text-[11px] italic" style={{ color: 'var(--am-muted)' }}>
          <Info size={12} />
          Copy suggestions are AI-generated. Review before publishing.
        </p>
      </div>

      {/* ── Copy suggestions grid ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        {/* Ad Headlines */}
        <div
          className="rounded-2xl p-5 border shadow-md"
          style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}
        >
          <div className="flex items-center justify-between mb-4 gap-3">
            <p className="text-[13px] font-medium" style={{ color: 'var(--am-text)' }}>
              🔥 Suggested Ad Headlines
            </p>
            <span
              className="text-[10px] font-mono px-2 py-0.5 rounded border"
              style={{ color: 'var(--am-accent2)', borderColor: 'rgba(155,135,255,0.35)', background: 'rgba(155,135,255,0.08)' }}
            >
              AI Generated
            </span>
          </div>
          <div className="flex flex-col gap-3">
            {data.headlines.map((item) => (
              <SuggestionCard key={item.id} item={item} />
            ))}
          </div>
        </div>

        {/* Primary Text */}
        <div
          className="rounded-2xl p-5 border shadow-md"
          style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}
        >
          <div className="flex items-center justify-between mb-4 gap-3">
            <p className="text-[13px] font-medium" style={{ color: 'var(--am-text)' }}>
              ✏️ Suggested Primary Text
            </p>
            <span
              className="text-[10px] font-mono px-2 py-0.5 rounded border"
              style={{ color: 'var(--am-accent2)', borderColor: 'rgba(155,135,255,0.35)', background: 'rgba(155,135,255,0.08)' }}
            >
              AI Generated
            </span>
          </div>
          <div className="flex flex-col gap-3">
            {data.primaryTexts.map((item) => (
              <SuggestionCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      </div>

      {/* ── Source Calls ──────────────────────────────────────── */}
      <div
        className="rounded-2xl p-5 border shadow-md mb-5"
        style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}
      >
        <div className="flex items-center justify-between mb-4 gap-3">
          <p className="text-[13px] font-medium" style={{ color: 'var(--am-text)' }}>
            <Phone size={13} className="inline mr-1.5 mb-0.5" />
            Source Calls
          </p>
          <span className="text-[11px]" style={{ color: 'var(--am-muted)' }}>
            {data.sampleSize} of 5 analyzed · Closed only
          </span>
        </div>
        <div className="flex flex-col gap-0">
          {data.sourceCalls.map((call, i) => (
            <div
              key={call.id}
              className="flex items-center gap-4 py-3"
              style={{ borderTop: i > 0 ? '1px solid var(--am-border)' : 'none' }}
            >
              <button
                type="button"
                className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-colors"
                style={{ background: 'var(--am-bg3)', color: 'var(--am-muted)' }}
              >
                <Play size={10} />
              </button>
              <span className="flex-1 text-[13px]" style={{ color: 'var(--am-text)' }}>
                {call.name}
              </span>
              <span
                className="text-[10px] font-mono px-2 py-0.5 rounded border font-medium"
                style={{ color: 'var(--am-green)', borderColor: 'rgba(34,217,160,0.35)', background: 'rgba(34,217,160,0.06)' }}
              >
                CLOSED
              </span>
              <span className="text-[11px] font-mono" style={{ color: 'var(--am-muted)' }}>
                {call.duration}
              </span>
              <span className="text-[12px] font-mono font-semibold" style={{ color: 'var(--am-text)' }}>
                Score: {call.score.toFixed(1)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Footer bar ───────────────────────────────────────── */}
      <div
        className="rounded-2xl px-5 py-4 border flex flex-wrap items-center gap-x-8 gap-y-3"
        style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}
      >
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-medium uppercase tracking-widest" style={{ color: 'var(--am-muted)' }}>Frequency</span>
          <span className="text-[12px] font-medium" style={{ color: 'var(--am-text)' }}>Weekly <span className="text-[10px]" style={{ color: 'var(--am-muted)' }}>(auto)</span></span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-medium uppercase tracking-widest" style={{ color: 'var(--am-muted)' }}>Sample size</span>
          <span className="text-[12px] font-medium" style={{ color: 'var(--am-text)' }}>3–5 closed calls <span className="text-[10px]" style={{ color: 'var(--am-muted)' }}>(random)</span></span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-medium uppercase tracking-widest" style={{ color: 'var(--am-muted)' }}>Token cost</span>
          <span className="text-[12px] font-medium" style={{ color: 'var(--am-text)' }}>Controlled by AskMoses admin</span>
        </div>
        {isSuperAdmin && (
          <button
            type="button"
            onClick={handleRunNow}
            disabled={running}
            className="flex items-center gap-2 text-[12px] font-semibold px-4 py-2 rounded-lg transition-colors ml-auto disabled:opacity-60"
            style={{ background: 'var(--am-accent)', color: '#fff' }}
          >
            <RefreshCw size={13} className={running ? 'animate-spin' : ''} />
            {running ? 'RUNNING…' : 'RUN NOW'}
          </button>
        )}
      </div>
    </div>
  )
}
