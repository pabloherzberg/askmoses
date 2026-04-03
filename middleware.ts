import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import type { Role } from '@/lib/types'

function redirectByRole(role: Role, baseUrl: string) {
  const routes: Record<Role, string> = { trainer: '/me', owner: '/dashboard', admin: '/admin' }
  return new URL(routes[role] ?? '/login', baseUrl)
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/me/calls/new')) return new NextResponse(null, { status: 404 })

  const publicPaths = ['/login', '/presentation', '/demobiz']
  const isPublic = pathname === '/' || publicPaths.some((p) => pathname.startsWith(p))

  let supabaseResponse = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Role comes from app_metadata in the JWT — no manual cookie needed
  const { data: { user } } = await supabase.auth.getUser()
  const role = user?.app_metadata?.role as Role | undefined

  if (isPublic) {
    if (user && role && pathname.startsWith('/login')) {
      return NextResponse.redirect(redirectByRole(role, request.url))
    }
    return supabaseResponse
  }

  if (!user) return NextResponse.redirect(new URL('/login', request.url))
  if (!role)  return NextResponse.redirect(new URL('/login', request.url))

  if (pathname.startsWith('/admin') && role !== 'admin') {
    return NextResponse.redirect(redirectByRole(role, request.url))
  }

  // Trainer: allow /me, /calls (filtered server-side), /dashboard/upload
  const trainerBlocked = ['/overview']
  const trainerDashboardBlocked =
    pathname.startsWith('/dashboard') && !pathname.startsWith('/dashboard/upload')
  if (role === 'trainer' && (trainerBlocked.some((p) => pathname.startsWith(p)) || trainerDashboardBlocked)) {
    return NextResponse.redirect(new URL('/me', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|images|api|mockServiceWorker.js).*)'],
}
