import { type NextRequest } from 'next/server'
import { ok } from '@/lib/auth'
import { intentSignals } from '@/lib/mock-data'

export async function GET() {
  return ok({ signals: intentSignals })
}

const MAX_TOTAL_WEIGHT = 10

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { weights } = body

    if (!weights || typeof weights !== 'object') {
      return ok({ error: 'Invalid weights object', signals: intentSignals })
    }

    const newWeights: Record<string, number> = {}
    let totalWeight = 0

    for (const [id, weight] of Object.entries(weights)) {
      if (typeof weight === 'number' && weight >= 0 && weight <= 10) {
        const floorWeight = Math.floor(weight)
        newWeights[id] = floorWeight
        totalWeight += floorWeight
      }
    }

    if (totalWeight > MAX_TOTAL_WEIGHT) {
      return ok({
        error: `Total weight cannot exceed ${MAX_TOTAL_WEIGHT}. Current total: ${totalWeight}`,
        signals: intentSignals,
      })
    }

    for (const [id, weight] of Object.entries(newWeights)) {
      const signal = intentSignals.find((s) => s.id === id)
      if (signal) {
        signal.weight = weight
      }
    }

    return ok({ signals: intentSignals })
  } catch {
    return ok({ error: 'Failed to update weights', signals: intentSignals })
  }
}

