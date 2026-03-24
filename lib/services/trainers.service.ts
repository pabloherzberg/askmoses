import { trainers } from '@/lib/mock-data'

export async function getTrainers() {
  return trainers
}

export async function getTrainerById(id: string) {
  return trainers.find((t) => t.id === id) ?? null
}

export async function getTeamStats() {
  const totalCalls = trainers.reduce((sum, t) => sum + t.totalCalls, 0)
  const avgScore = Math.round(trainers.reduce((sum, t) => sum + t.score, 0) / trainers.length)
  const avgCloseRate = Math.round(trainers.reduce((sum, t) => sum + t.closeRate, 0) / trainers.length)
  const best = trainers.reduce((a, b) => (a.closeRate > b.closeRate ? a : b))

  return {
    totalCalls,
    avgScore,
    avgCloseRate,
    bestTrainerName: best.name,
    bestCloseRate: best.closeRate,
    activeTrainers: trainers.length,
  }
}
