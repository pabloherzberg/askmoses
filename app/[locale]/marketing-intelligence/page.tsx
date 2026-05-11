import { SectionLabel } from '@/components/shared/SectionLabel'
import { MarketingIntelligence } from '@/components/shared/MarketingIntelligence'

export default function MarketingIntelligencePage() {
  return (
    <div>
      <SectionLabel>Marketing Intelligence</SectionLabel>
      <p className="text-sm mb-6" style={{ color: 'var(--am-muted)' }}>
        AI-generated copy insights based on your closed calls · Runs weekly · Analyzes 3–5 calls
      </p>
      <MarketingIntelligence />
    </div>
  )
}
