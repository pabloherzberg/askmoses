import { NextResponse, type NextRequest } from 'next/server'
import type { Role } from '@/lib/types'

const VALID_ROLES: Role[] = ['trainer', 'owner', 'admin']

function redirectByRole(role: Role, baseUrl: string) {
  const routes: Record<Role, string> = {
    trainer: '/me',
    owner: '/dashboard',
    admin: '/admin',
  }
  return new URL(routes[role] ?? '/login', baseUrl)
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── Rotas bloqueadas — sempre 404 ───────────────────────────────────────────
  const blockedPaths = ['/tech', '/me/calls/new']
  if (blockedPaths.some((p) => pathname.startsWith(p))) {
    return new NextResponse(null, { status: 404 })
  }

  // ── Rotas públicas — não interceptar ────────────────────────────────────────
  const publicPaths = ['/login', '/presentation', '/demobiz']
  const isPublic = pathname === '/' || publicPaths.some((p) => pathname.startsWith(p))

  // Lê a sessão demo do cookie (setado pelo login page via MSW)
  const demoRole = request.cookies.get('demo-role')?.value as Role | undefined
  const role = demoRole && VALID_ROLES.includes(demoRole) ? demoRole : undefined

  if (isPublic) {
    // Se está logado e acessa /login, redireciona para rota do role
    if (role && pathname.startsWith('/login')) {
      return NextResponse.redirect(redirectByRole(role, request.url))
    }
    return NextResponse.next({ request })
  }

  // ── Sem sessão → login ───────────────────────────────────────────────────────
  if (!role) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // ── Proteção cruzada de roles ─────────────────────────────────────────────────
  if (pathname.startsWith('/admin') && role !== 'admin') {
    return NextResponse.redirect(redirectByRole(role, request.url))
  }

  // Trainer só acessa /me, /me/calls/[id] e /dashboard/upload
  const trainerBlocked = ['/overview', '/calls']
  const trainerDashboardBlocked = pathname.startsWith('/dashboard') && !pathname.startsWith('/dashboard/upload')
  if (role === 'trainer' && (trainerBlocked.some((p) => pathname.startsWith(p)) || trainerDashboardBlocked)) {
    return NextResponse.redirect(new URL('/me', request.url))
  }

  return NextResponse.next({ request })
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|images|api|mockServiceWorker.js).*)',
  ],
}
