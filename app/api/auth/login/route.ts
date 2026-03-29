import { type NextRequest } from 'next/server'
import type { Role } from '@/lib/types'

const DEMO_CREDENTIALS = [
  { email: 'trainer@demo.askmoses.ai', password: 'demo123', role: 'trainer' as Role, name: 'Marcus R.', trainerId: 'trainer-marcus' },
  { email: 'trainer2@demo.askmoses.ai', password: 'demo123', role: 'trainer' as Role, name: 'Jamie L.', trainerId: 'trainer-jamie' },
  { email: 'trainer3@demo.askmoses.ai', password: 'demo123', role: 'trainer' as Role, name: 'Jordan K.', trainerId: 'trainer-jordan' },
  { email: 'trainer4@demo.askmoses.ai', password: 'demo123', role: 'trainer' as Role, name: 'Taylor M.', trainerId: 'trainer-taylor' },
  { email: 'owner@demo.askmoses.ai', password: 'demo123', role: 'owner' as Role, name: 'Dog Wizard HQ', trainerId: null },
  { email: 'admin@askmoses.ai', password: 'demo123', role: 'admin' as Role, name: 'AskMoses Admin', trainerId: null },
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
    data: { user: { id: `demo-${user.role}`, email: user.email, role: user.role, name: user.name, trainerId: user.trainerId } },
    error: null,
  })
}
