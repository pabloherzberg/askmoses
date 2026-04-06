import type { Trainer } from '@/lib/types'

export async function getTrainers(): Promise<Trainer[]> {
  const { dbGetTrainers } = await import('@/lib/db/trainers')
  return dbGetTrainers()
}

export async function getTrainerById(id: string): Promise<Trainer | null> {
  const { dbGetTrainerById } = await import('@/lib/db/trainers')
  return dbGetTrainerById(id)
}
