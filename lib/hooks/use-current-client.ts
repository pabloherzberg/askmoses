'use client'

import { useEffect, useState } from 'react'
import type { Client } from '@/lib/types'

interface ApiResponse {
  data: Client | null
  error: { message: string; code: number } | null
}

/**
 * Client-side hook that fetches the current tenant's Client (with Plan).
 *
 * Returns `null` while loading or if the user is not bound to a client.
 * Use to drive plan-aware UI: feature flags, upsell badges, plan label
 * in the sidebar, etc.
 */
export function useCurrentClient(): { client: Client | null; loading: boolean } {
  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    fetch('/api/me/client')
      .then((res) => res.json() as Promise<ApiResponse>)
      .then((body) => {
        if (cancelled) return
        setClient(body.data)
      })
      .catch(() => {
        if (cancelled) return
        setClient(null)
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return { client, loading }
}
