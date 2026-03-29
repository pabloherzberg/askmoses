import { notFound } from 'next/navigation'
import { getCallById } from '@/lib/services/calls'
import { CallDetail } from '@/components/shared/CallDetail'

interface Props {
  params: Promise<{ id: string }>
}

export default async function OwnerCallDetailPage({ params }: Props) {
  const { id } = await params
  const call = await getCallById(id)

  if (!call) notFound()

  return <CallDetail call={call} viewerRole="owner" backHref="/calls" />
}
