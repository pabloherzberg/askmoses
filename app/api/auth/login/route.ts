import { type NextRequest } from 'next/server'
import type { Role } from '@/lib/types'

const DEMO_CREDENTIALS = [
  { email: 'trainer@demo.askmoses.ai', password: 'demo123', role: 'trainer' as Role, name: 'Marcus R.' },
  { email: 'owner@demo.askmoses.ai', password: 'demo123', role: 'owner' as Role, name: 'Dog Wizard HQ' },
  { email: 'admin@askmoses.ai', password: 'demo123', role: 'admin' as Role, name: 'AskMoses Admin' },
]

export async function POST(request: NextRequest) {
  const { email, password } = await request.json() as { email: string; password: string }

  const user = DEMO_CREDENTIALS.find((u) => u.email === email && u.password === password)
  if (!user) {
    return Response.json(
      { data: null, error: { message: 'Email ou senha incorretos', code: 401 } },
      { status: 401 }
    )
  }

  return Response.json({
    data: { user: { id: `demo-${user.role}`, email: user.email, role: user.role, name: user.name } },
    error: null,
  })
}
