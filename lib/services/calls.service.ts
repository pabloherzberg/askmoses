import type { Role } from '@/lib/types'
import { calls } from '@/lib/mock-data'

// Phase 1: mock data
// Phase 2: swap only here → Supabase query
// Phase 3: swap only here → Redis cache → Supabase

export async function getCalls(role: Role, userId: string) {
  if (role === 'trainer') {
    return calls.filter((c) => c.trainerId === userId)
  }
  return calls
}

export async function getCallById(id: string) {
  return calls.find((c) => c.id === id) ?? null
}

export async function getCallsByTrainer(trainerId: string) {
  return calls.filter((c) => c.trainerId === trainerId)
}
