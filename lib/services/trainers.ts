import type { Trainer } from '@/lib/types'
import { trainers } from '@/lib/mock-data'

export async function getTrainers(): Promise<Trainer[]> {
  return trainers
}

export async function getTrainerById(id: string): Promise<Trainer | null> {
  return trainers.find((t) => t.id === id) ?? null
}
