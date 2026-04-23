import { NewCallForm } from './NewCallForm'
import { SectionLabel } from '@/components/shared/SectionLabel'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

export default function NewCallPage() {
  return (
    <div>
      {/* Back */}
      <Link
        href="/me"
        className="inline-flex items-center gap-1 text-xs mb-5 transition-colors hover:opacity-80"
        style={{ color: 'var(--am-muted)' }}
      >
        <ChevronLeft size={13} />
        Back to My Dashboard
      </Link>

      {/* Header */}
      <div className="mb-6">
        <SectionLabel>My Calls</SectionLabel>
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--am-text)' }}>
          Log a New Call
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--am-muted)' }}>
          Fill in the details below and submit for analysis.
        </p>
      </div>

      <NewCallForm />
    </div>
  )
}
