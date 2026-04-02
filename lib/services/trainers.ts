import type { Trainer } from '@/lib/types'

const IS_DEV = process.env.NODE_ENV === 'development'

export async function getTrainers(): Promise<Trainer[]> {
  if (IS_DEV) {
    const { trainers } = await import('@/lib/mock-data')
    return trainers
  }

  const { dbGetTrainers } = await import('@/lib/db/trainers')
  return dbGetTrainers()
}

export async function getTrainerById(id: string): Promise<Trainer | null> {
  if (IS_DEV) {
    const { trainers } = await import('@/lib/mock-data')
    return trainers.find((t) => t.id === id) ?? null
  }

  const { dbGetTrainerById } = await import('@/lib/db/trainers')
  return dbGetTrainerById(id)
}
