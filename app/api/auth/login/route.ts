import { type NextRequest } from 'next/server'
import { demoCredentials } from '@/lib/mock-data'

export async function POST(request: NextRequest) {
  const { email, password } = await request.json() as { email: string; password: string }

  const user = demoCredentials.find((u) => u.email === email && u.password === password)
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
