import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Role } from '@/lib/types'

function redirectByRole(role: Role, baseUrl: string) {
  const routes: Record<Role, string> = {
    trainer: '/me',
    owner: '/dashboard',
    admin: '/admin',
  }
  return new URL(routes[role] ?? '/login', baseUrl)
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { session },
  } = await supabase.auth.getSession()

  const { pathname } = request.nextUrl

  // ── Rotas públicas — não interceptar ────────────────────────────────────────
  if (pathname.startsWith('/login')) {
    if (session) {
      const role = session.user.app_metadata?.role as Role
      return NextResponse.redirect(redirectByRole(role, request.url))
    }
    return response
  }

  // ── Sem sessão → login ───────────────────────────────────────────────────────
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const role = session.user.app_metadata?.role as Role

  // ── Raiz → rota principal do role ────────────────────────────────────────────
  if (pathname === '/') {
    return NextResponse.redirect(redirectByRole(role, request.url))
  }

  // ── Proteção cruzada de roles ─────────────────────────────────────────────────
  if (pathname.startsWith('/admin') && role !== 'admin') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  if (pathname.startsWith('/dashboard') && role === 'trainer') {
    return NextResponse.redirect(new URL('/me', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|images|api).*)',
  ],
}
