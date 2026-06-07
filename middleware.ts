import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Routes that are public (no login required)
const PUBLIC_ROUTES = ['/pcc', '/login', '/reset-password']

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const pathname = request.nextUrl.pathname

  // Allow public routes without login
  const isPublic = PUBLIC_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'))

  // Redirect root / to GDS Info (public)
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/pcc', request.url))
  }

  // Unauthenticated users can only access public routes
  if (!user && !isPublic) {
    return NextResponse.redirect(new URL('/pcc', request.url))
  }

  // Authenticated users visiting login → go to dashboard
  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
