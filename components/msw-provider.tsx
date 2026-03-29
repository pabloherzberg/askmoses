'use client'

import { useEffect, useState, type ReactNode } from 'react'

export function MSWProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function init() {
      try {
        const { worker } = await import('@/lib/mocks/browser')
        await worker.start({
          onUnhandledRequest: 'bypass',
          serviceWorker: {
            url: '/mockServiceWorker.js',
          },
        })
        console.log('[MSW] Mock API ativa')
      } catch (err) {
        console.warn('[MSW] Falha ao iniciar — continuando sem mocks:', err)
      } finally {
        setReady(true)
      }
    }

    init()
  }, [])

  if (!ready) return null

  return <>{children}</>
}
