import { NextResponse, type NextRequest } from 'next/server'
import createIntlMiddleware from 'next-intl/middleware'
import { createServerClient } from '@supabase/ssr'
import { routing, type Locale } from '@/i18n/routing'
import type { Role } from '@/lib/types'

const intlMiddleware = createIntlMiddleware(routing)

function stripLocale(pathname: string): { locale: Locale; rawPath: string } {
  const segments = pathname.split('/')
  const maybeLocale = segments[1] as Locale
  if ((routing.locales as readonly string[]).includes(maybeLocale)) {
    const rest = '/' + segments.slice(2).join('/')
    return { locale: maybeLocale, rawPath: rest === '/' ? '/' : rest.replace(/\/$/, '') }
  }
  return { locale: routing.defaultLocale, rawPath: pathname }
}

function localized(path: string, locale: Locale, baseUrl: string) {
  const suffix = path === '/' ? '' : path
  return new URL(`/${locale}${suffix}`, baseUrl)
}

function redirectByRole(role: Role, locale: Locale, baseUrl: string) {
  const routes: Record<Role, string> = { trainer: '/me', owner: '/dashboard', admin: '/admin' }
  return localized(routes[role] ?? '/login', locale, baseUrl)
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Let next-intl resolve the locale (adds prefix when missing, detects from Accept-Language)
  const intlResponse = intlMiddleware(request)

  // If intl issued a redirect (e.g. `/` → `/pt`), honor it and stop here
  if (
    intlResponse.status >= 300 &&
    intlResponse.status < 400 &&
    intlResponse.headers.get('location')
  ) {
    return intlResponse
  }

  const { locale, rawPath } = stripLocale(pathname)

  if (rawPath.startsWith('/me/calls/new')) {
    return new NextResponse(null, { status: 404 })
  }

  const publicPaths = ['/login', '/presentation', '/demobiz', '/tech']
  const isPublic = rawPath === '/' || publicPaths.some((p) => rawPath.startsWith(p))

  // Start from the intl response so locale headers/cookies are preserved
  let supabaseResponse = NextResponse.next({ request })
  intlResponse.headers.forEach((value, key) => supabaseResponse.headers.set(key, value))

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          intlResponse.headers.forEach((value, key) => supabaseResponse.headers.set(key, value))
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const role = user?.app_metadata?.role as Role | undefined

  if (isPublic) {
    if (user && role && rawPath.startsWith('/login')) {
      return NextResponse.redirect(redirectByRole(role, locale, request.url))
    }
    return supabaseResponse
  }

  if (!user) return NextResponse.redirect(localized('/login', locale, request.url))
  if (!role) return NextResponse.redirect(localized('/login', locale, request.url))

  if (rawPath.startsWith('/admin') && role !== 'admin') {
    return NextResponse.redirect(redirectByRole(role, locale, request.url))
  }

  // Trainer: allow /me, /calls (filtered server-side), /dashboard/upload
  const trainerBlocked = ['/overview']
  const trainerDashboardBlocked =
    rawPath.startsWith('/dashboard') && !rawPath.startsWith('/dashboard/upload')
  if (
    role === 'trainer' &&
    (trainerBlocked.some((p) => rawPath.startsWith(p)) || trainerDashboardBlocked)
  ) {
    return NextResponse.redirect(localized('/me', locale, request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|images|api|mockServiceWorker.js|.*\\..*).*)',
  ],
}
