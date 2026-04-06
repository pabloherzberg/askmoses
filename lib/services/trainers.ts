import type { Trainer } from '@/lib/types'

const USE_MOCK = process.env.USE_MOCK_DATA !== 'false'

export async function getTrainers(): Promise<Trainer[]> {
  if (USE_MOCK) {
    const { trainers } = await import('@/lib/mock-data')
    return trainers
  }

  const { dbGetTrainers } = await import('@/lib/db/trainers')
  return dbGetTrainers()
}

export async function getTrainerById(id: string): Promise<Trainer | null> {
  if (USE_MOCK) {
    const { trainers } = await import('@/lib/mock-data')
    return trainers.find((t) => t.id === id) ?? null
  }

  const { dbGetTrainerById } = await import('@/lib/db/trainers')
  return dbGetTrainerById(id)
}
