import { mockGeneratedCriteria } from '@/lib/mocks/data/call-analysis'

export async function POST() {
  return Response.json(mockGeneratedCriteria)
}
