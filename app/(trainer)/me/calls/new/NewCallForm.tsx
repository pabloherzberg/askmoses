'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Upload, FileVideo, FileAudio, X, FileText } from 'lucide-react'

const RESULT_OPTIONS = [
  { value: 'closed',    label: 'Closed',    color: 'var(--am-green)' },
  { value: 'follow-up', label: 'Follow-up', color: 'var(--am-amber)' },
  { value: 'no-close',  label: 'No Close',  color: 'var(--am-red)'   },
]

const DURATION_OPTIONS = ['5 min', '10 min', '15 min', '20 min', '30 min', '45 min', '60 min+']

const ACCEPTED_TYPES = [
  'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/x-m4a',
  'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo',
]
const ACCEPTED_EXT = '.mp3,.mp4,.wav,.ogg,.webm,.m4a,.mov,.avi'

type InputSource = 'file' | 'transcript'

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--am-muted)' }}>
        {label} {required && <span style={{ color: 'var(--am-red)' }}>*</span>}
      </label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  background: 'var(--am-bg3)',
  borderColor: 'var(--am-border)',
  color: 'var(--am-text)',
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileIcon(type: string) {
  if (type.startsWith('video/')) return <FileVideo size={18} />
  if (type.startsWith('audio/')) return <FileAudio size={18} />
  return <FileText size={18} />
}

export function NewCallForm() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [inputSource, setInputSource] = useState<InputSource>('file')
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)

  const [form, setForm] = useState({
    prospect: '',
    date:     new Date().toISOString().slice(0, 10),
    duration: '15 min',
    result:   'closed',
    notes:    '',
  })

  function set(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleFile(file: File) {
    setFileError(null)
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setFileError('Unsupported format. Please upload an audio or video file.')
      return
    }
    if (file.size > 500 * 1024 * 1024) {
      setFileError('File exceeds 500 MB limit.')
      return
    }
    setUploadedFile(file)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (inputSource === 'file' && !uploadedFile) return
    setLoading(true)
    await new Promise((r) => setTimeout(r, 1200))
    setLoading(false)
    setSubmitted(true)
  }

  const canSubmit =
    !!form.prospect &&
    (inputSource === 'transcript' ? form.notes.trim().length > 0 : !!uploadedFile)

  // ── Success state ────────────────────────────────────────────
  if (submitted) {
    return (
      <div
        className="rounded-2xl p-8 border flex flex-col items-center text-center gap-4"
        style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
      >
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center"
          style={{ background: 'var(--am-green-bg)' }}
        >
          <CheckCircle2 size={24} style={{ color: 'var(--am-green)' }} />
        </div>
        <div>
          <p className="text-[15px] font-semibold mb-1" style={{ color: 'var(--am-text)' }}>
            Call submitted!
          </p>
          <p className="text-sm" style={{ color: 'var(--am-muted)' }}>
            Your call with{' '}
            <strong style={{ color: 'var(--am-text)' }}>{form.prospect}</strong>{' '}
            has been logged and sent for AI analysis.
          </p>
        </div>
        <p className="text-xs" style={{ color: 'var(--am-muted)' }}>
          (Phase 1 demo — no data is persisted)
        </p>
        <button
          onClick={() => router.push('/me')}
          className="mt-2 px-5 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-80"
          style={{ background: 'var(--am-accent)', color: '#fff' }}
        >
          Back to My Dashboard
        </button>
      </div>
    )
  }

  // ── Form ─────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">

      {/* ── Call details ───────────────────────────────────── */}
      <div
        className="rounded-2xl border p-5 md:p-6"
        style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
      >
        <p className="text-[13px] font-medium mb-4" style={{ color: 'var(--am-text)' }}>
          Call Details
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          <Field label="Prospect Name" required>
            <input
              type="text"
              required
              value={form.prospect}
              onChange={(e) => set('prospect', e.target.value)}
              placeholder="e.g. John Smith"
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[var(--am-accent)]"
              style={inputStyle}
            />
          </Field>

          <Field label="Call Date" required>
            <input
              type="date"
              required
              value={form.date}
              onChange={(e) => set('date', e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[var(--am-accent)]"
              style={inputStyle}
            />
          </Field>

          <Field label="Duration">
            <select
              value={form.duration}
              onChange={(e) => set('duration', e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[var(--am-accent)]"
              style={inputStyle}
            >
              {DURATION_OPTIONS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </Field>

          <Field label="Outcome" required>
            <div className="flex gap-2 flex-wrap">
              {RESULT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => set('result', opt.value)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-all"
                  style={{
                    background:  form.result === opt.value ? `color-mix(in srgb, ${opt.color} 15%, transparent)` : 'var(--am-bg3)',
                    borderColor: form.result === opt.value ? opt.color : 'var(--am-border)',
                    color:       form.result === opt.value ? opt.color : 'var(--am-muted)',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </Field>
        </div>
      </div>

      {/* ── Recording / Transcript ─────────────────────────── */}
      <div
        className="rounded-2xl border p-5 md:p-6"
        style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
      >
        {/* Tab toggle */}
        <div className="flex items-center gap-1 mb-5 p-1 rounded-lg w-fit" style={{ background: 'var(--am-bg3)' }}>
          {([['file', 'Upload Recording'], ['transcript', 'Paste Transcript']] as const).map(([val, lbl]) => (
            <button
              key={val}
              type="button"
              onClick={() => setInputSource(val)}
              className="px-3 py-1 rounded-md text-xs font-medium transition-all"
              style={{
                background: inputSource === val ? 'var(--am-bg2)' : 'transparent',
                color:      inputSource === val ? 'var(--am-text)' : 'var(--am-muted)',
                boxShadow:  inputSource === val ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
              }}
            >
              {lbl}
            </button>
          ))}
        </div>

        {/* Upload panel */}
        {inputSource === 'file' && (
          <div>
            {!uploadedFile ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-3 py-10 cursor-pointer transition-colors"
                style={{
                  borderColor:  dragOver ? 'var(--am-accent)' : 'var(--am-border)',
                  background:   dragOver ? 'rgba(110,86,255,0.06)' : 'var(--am-bg3)',
                }}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(110,86,255,0.12)', color: 'var(--am-accent)' }}
                >
                  <Upload size={18} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium" style={{ color: 'var(--am-text)' }}>
                    Drop your recording here
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--am-muted)' }}>
                    or <span style={{ color: 'var(--am-accent)' }}>browse files</span>
                  </p>
                </div>
                <p className="text-[11px]" style={{ color: 'var(--am-muted)' }}>
                  MP3 · MP4 · WAV · M4A · MOV · WebM · up to 500 MB
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_EXT}
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
                />
              </div>
            ) : (
              <div
                className="rounded-xl border flex items-center gap-3 px-4 py-3"
                style={{ background: 'var(--am-bg3)', borderColor: 'var(--am-border)' }}
              >
                <div style={{ color: 'var(--am-accent)' }}>
                  {fileIcon(uploadedFile.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--am-text)' }}>
                    {uploadedFile.name}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--am-muted)' }}>
                    {uploadedFile.type.split('/')[0]} · {formatBytes(uploadedFile.size)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setUploadedFile(null); setFileError(null) }}
                  className="flex-shrink-0 transition-opacity hover:opacity-60"
                  style={{ color: 'var(--am-muted)' }}
                >
                  <X size={16} />
                </button>
              </div>
            )}

            {fileError && (
              <p className="text-xs mt-2" style={{ color: 'var(--am-red)' }}>{fileError}</p>
            )}
          </div>
        )}

        {/* Transcript panel */}
        {inputSource === 'transcript' && (
          <textarea
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            rows={7}
            placeholder="Paste the call transcript here for AI analysis..."
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[var(--am-accent)] resize-none"
            style={inputStyle}
          />
        )}
      </div>

      {/* ── Actions ────────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => router.push('/me')}
          className="px-4 py-2 rounded-lg text-sm transition-opacity hover:opacity-70"
          style={{ color: 'var(--am-muted)' }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading || !canSubmit}
          className="px-5 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
          style={{ background: 'var(--am-accent)', color: '#fff' }}
        >
          {loading ? 'Submitting…' : 'Submit Call'}
        </button>
      </div>
    </form>
  )
}
